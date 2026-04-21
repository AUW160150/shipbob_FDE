# ShipBob Claims Automation — System Architecture

## Overview

This system automates the review and resolution of damaged-in-transit claims submitted by ShipBob merchants. A support rep receives a case, the AI agent processes it through a deterministic + LLM pipeline, and the rep reviews the agent's recommendation before anything is sent.

---

## High-Level Flow

```
Merchant submits case
        │
        ▼
┌──────────────────┐
│  Mock API / Data │  (Postman mock → local sample/ files)
│  Cases, Invoices │
│  Shipments, Imgs │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│                  Rulebook (Deterministic)             │
│                                                      │
│  Gate 0: Is shipment insured?                        │
│          Yes → SEPARATE PROCESS (out of scope)       │
│          No  → continue                              │
│                                                      │
│  Gate 1: Eligibility                                 │
│          • Claim type = "Damaged in Transit"?        │
│          • Filed within 90 days of delivery?         │
│          Pass → confidence 1.0                       │
│          Fail → label EXPIRED, confidence 0.0        │
│                                                      │
│  Gate 2: Evidence                                    │
│          • Attachments present?                      │
│          • Billable invoice line items?              │
│          Fail → label MISSING_EVIDENCE / WAITING     │
│          Pass → continue to AI agent                 │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│                    AI Agent Pipeline                  │
│                                                      │
│  Step 1 ── Case Summary (Haiku/Llama-3.1-8B)        │
│            • 2–3 sentence plain-English summary      │
│            • Cheap, no vision needed                 │
│                                                      │
│  Step 2 ── Vision Analysis (Gemini-2.5-Flash)        │
│            • Up to 2 images fetched → base64         │
│            • 4 scored dimensions (see Weights)       │
│            • Identifies damaged item + price         │
│                                                      │
│  Step 3 ── Decision (Gemini-2.5-Flash)               │
│            • approve / deny / request_more_info      │
│            • Draft email to merchant                 │
│            • Confidence score 0–1                    │
│                                                      │
│  Step 4 ── LLM Judge (Llama-3.1-8B)                 │
│            • Independent consistency check          │
│            • Flags logical contradictions            │
│            • Verdict: pass / warn / fail             │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│               Confidence Scoring Engine               │
│                                                      │
│  Vision weights:                                     │
│    damage_visible       × 0.35                       │
│    product_identifiable × 0.30                       │
│    packaging_present    × 0.20                       │
│    claim_coherent       × 0.15                       │
│                                                      │
│  Critical gap rule:                                  │
│    Any dimension < 0.30 → cap overall at 0.50        │
│                                                      │
│  overallConfidence = min(eligibility, evidence,      │
│                          decisionConfidence)         │
│                                                      │
│  needsHumanReview = overallConfidence < 0.70         │
│                   OR judge.verdict == "fail"         │
└──────────────────┬───────────────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
    confidence ≥ 0.70   confidence < 0.70
    judge passes        OR judge fails
          │                 │
          ▼                 ▼
   ┌────────────┐    ┌────────────────────┐
   │ Main Queue │    │ Human Review Lane  │
   │            │    │                   │
   │ Rep reviews│    │ Rep reads agent   │
   │ draft email│    │ reasoning + judge │
   │ edits if   │    │ flags, inspects   │
   │ needed     │    │ photos (zoom),    │
   │            │    │ then overrides    │
   │            │    │ with written      │
   │            │    │ justification     │
   └─────┬──────┘    └────────┬──────────┘
         │                    │
         └──────────┬─────────┘
                    │
                    ▼
           Rep clicks "Approve & Send"
                    │
                    ▼
         ┌─────────────────────┐
         │  Case moves to      │
         │  Reviewed tab       │
         │  (ADDRESSED label)  │
         └─────────────────────┘
```

---

## Component Architecture

```
shipbob/
├── sample/                          # Local data (from mock API)
│   ├── cases.json
│   ├── cases/CASE-100{1-5}.json
│   ├── cases/CASE-100{1-5}_attachments.json
│   ├── shipments/
│   ├── orders/
│   └── invoices/
│
└── claims-ui/                       # Next.js 16 app
    ├── app/
    │   ├── page.tsx                 # Server component — loads data, runs rulebook
    │   └── api/
    │       ├── claims/route.ts      # GET — returns all ClaimSummary[]
    │       └── agent/[case_id]/     # POST — runs AI agent for one case
    │           └── route.ts
    │
    ├── components/
    │   ├── AppShell.tsx             # Tab nav, addressed state, claim routing
    │   ├── ClaimsQueue.tsx          # Split-panel: sidebar list + detail
    │   ├── ClaimDetail.tsx          # Full claim view + agent trigger + email
    │   ├── ReviewedPanel.tsx        # Addressed/closed cases (read-only)
    │   └── Dashboard.tsx            # Analytics: KPIs, charts, carrier breakdown
    │
    └── lib/
        ├── types.ts                 # All shared TypeScript interfaces
        ├── sample-data.ts           # File-system reader for sample/ data
        ├── rulebook.ts              # Deterministic gates (eligibility, evidence)
        └── agent.ts                 # AI pipeline (summary → vision → decision → judge)
```

---

## Data Flow (per case)

```
page.tsx (server)
  │
  ├── getCase(id)          ─┐
  ├── getShipment(id)       │── sample-data.ts reads from sample/ JSON files
  ├── getAttachments(id)    │
  └── getInvoice(id)       ─┘
        │
        ▼
  runRulebook(case, shipment, attachments, invoice)
        │
        ▼
  ClaimSummary { case, shipment, order, invoice, attachments, rulebook }
        │
        ▼
  AppShell (client)
  ├── tab=queue     → ClaimsQueue → ClaimDetail
  ├── tab=dashboard → Dashboard
  └── tab=reviewed  → ReviewedPanel

  When rep clicks "Run AI Analysis":
  ClaimDetail → POST /api/agent/[case_id]
              → runAgent() → 4-step pipeline
              → returns updated rulebook + vision + judge
              → ClaimDetail re-renders with real AI scores
```

---

## Model Selection Rationale

| Step | Model | Why |
|------|-------|-----|
| Case summary | `meta-llama/llama-3.1-8b-instruct` | Fast, cheap, text-only; no vision needed |
| Vision analysis | `google/gemini-2.5-flash` | Best cost/quality ratio for multi-image visual reasoning |
| Decision + email | `google/gemini-2.5-flash` | Strong instruction-following, structured JSON, email drafting |
| LLM judge | `meta-llama/llama-3.1-8b-instruct` | Cheap consistency checker; independence from decision model matters more than capability |

All models accessed via **OpenRouter** (`openrouter.ai/api/v1`) using the OpenAI-compatible chat completions endpoint.

---

## Guardrails & Validation

| Layer | What it catches |
|-------|----------------|
| Score clamping | Vision scores outside 0–1 from model |
| Required field check | Missing JSON keys → `null` → human review |
| Cross-validation | `approve` + `damage_visible < 0.30` → forced to `request_more_info` |
| Critical gap cap | Any dimension < 0.30 → overall confidence capped at 0.50 |
| Human review threshold | `overallConfidence < 0.70` → blocks approval |
| LLM judge | Independent model flags logical contradictions; `fail` verdict forces human review |
| Human override | Rep can override with mandatory written justification (audit trail) |

---

## UI Tabs & States

```
┌─────────────────────────────────────────────────────┐
│  ShipBob / Claims          [Queue ●2] [Dashboard] [Reviewed (3)]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Queue tab:                                         │
│  ┌──────────┐  ┌──────────────────────────────────┐ │
│  │ ⚠ Needs  │  │  Claim Detail                    │ │
│  │  Review  │  │  ├── Header (label, amount)       │ │
│  │──────────│  │  ├── Case Info / Description      │ │
│  │ ● High   │  │  ├── Invoice table                │ │
│  │ ○ Ready  │  │  ├── Attachments (zoom lightbox)  │ │
│  │ ○ Ready  │  │  ├── Agent Analysis               │ │
│  │          │  │  │   ├── [Run AI Analysis]        │ │
│  │ Queue    │  │  │   ├── Vision scores             │ │
│  │──────────│  │  │   ├── Judge evaluation         │ │
│  │ ○ Missing│  │  │   └── Override panel           │ │
│  │ ○ Waiting│  │  └── Draft Email + Approve        │ │
│  └──────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Priority Dot Colors
- 🔴 Red — HIGH_VALUE (≥ $75, agent approved)
- 🟠 Orange — READY_FOR_REVIEW
- 🟡 Yellow — MISSING_EVIDENCE / WAITING / EXPIRED
- 🟢 Green — ADDRESSED / CLOSED

---

## Key Design Decisions

**Why deterministic gates first, AI second?**
Eligibility and evidence checks are rules with zero ambiguity — no LLM needed. Running AI only on cases that pass the deterministic gates reduces cost and keeps the AI focused on the hard part (visual damage assessment).

**Why is the human always in the loop?**
The agent never sends anything. It drafts and scores; the rep approves. This keeps liability with the human and lets the team build trust in the system incrementally.

**Why a separate LLM judge?**
A model evaluating its own output is weaker than a different model evaluating it. Using a fast, cheap model (Llama-8B) as an independent reviewer catches cases where the primary model is confidently wrong — which is the failure mode that matters most.

**Why OpenRouter?**
Provider-agnostic routing means we can swap models without code changes. Useful as model quality/pricing shifts.

**Why base64 images instead of URLs?**
Azure Blob signed URLs with expiry tokens are sometimes rejected by vision model providers doing server-side URL fetches. Downloading images at the server level and sending as base64 data URIs is more reliable.
