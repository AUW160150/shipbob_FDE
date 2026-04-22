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
│  Sample Data     │  (Pre-fetched from mock API → local sample/ files)
│  Cases, Invoices │  Cases, shipments, orders, invoices, attachments
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
│          • Customer confirmation attachment?         │
│            (filename heuristic: screenshot/email/    │
│             confirm/customer keywords)               │
│          Fail → label MISSING_EVIDENCE / WAITING     │
│          Pass → continue to AI agent                 │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│                    AI Agent Pipeline                  │
│                                                      │
│  Step 1 ── Case Summary                              │
│            Model: llama-3.1-8b-instruct              │
│            • 2–3 sentence plain-English summary      │
│                                                      │
│  Step 2 ── Vision Analysis                           │
│            Model: gemini-2.5-flash                   │
│            • Up to 2 images fetched → base64         │
│            • Scores 5 dimensions (see Weights)       │
│            • Returns damaged_item_name + price       │
│                                                      │
│  Step 3 ── Invoice Cross-Reference                   │
│            (Deterministic, no LLM)                   │
│            • matchInvoiceItem() tries:               │
│              1. Exact name match                     │
│              2. Substring match                      │
│              3. 2-word overlap                       │
│            • Match → use invoice price as truth      │
│            • No match → human review, fallback to    │
│              highest-value item                      │
│                                                      │
│  Step 4 ── Decision + Draft Email                    │
│            Model: gemini-2.5-flash                   │
│            • approve / deny / request_more_info      │
│            • Draft email to merchant                 │
│            • Injects past merchant feedback          │
│                                                      │
│  Step 5 ── LLM Judge                                 │
│            Model: llama-3.1-8b-instruct              │
│            • Independent consistency check          │
│            • Flags logical contradictions            │
│            • Verdict: pass / warn / fail             │
│            • fail → forces human review              │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│               Confidence Scoring Engine               │
│                                                      │
│  Vision weights:                                     │
│    damage_visible               × 0.35               │
│    product_identifiable         × 0.30               │
│    packaging_present            × 0.20               │
│    claim_coherent               × 0.15               │
│    (customer_confirmation_present: informational)    │
│                                                      │
│  Critical gap rule:                                  │
│    Any dimension < 0.30 → cap overall at 0.50        │
│                                                      │
│  overallConfidence = min(eligibility, decisionConf)  │
│                                                      │
│  needsHumanReview = overallConfidence < 0.70         │
│                   OR judge.verdict == "fail"         │
│                   OR invoice item unverified         │
└──────────────────┬───────────────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
    All checks pass     Any check fails
          │                 │
          ▼                 ▼
   ┌────────────┐    ┌────────────────────┐
   │ Main Queue │    │ Human Review Lane  │
   │            │    │                   │
   │ Rep reviews│    │ Rep reads scores, │
   │ draft email│    │ judge flags, and  │
   │ edits if   │    │ invoice match     │
   │ needed     │    │ result — then     │
   │            │    │ overrides with    │
   │            │    │ written reason    │
   └─────┬──────┘    └────────┬──────────┘
         │                    │
         └──────────┬─────────┘
                    │
                    ▼
           Rep clicks "Approve & Send"
                    │
                    ├── POST /cases/:id/email        → mock API
                    └── POST /reimbursements         → mock API
                              │
                              ▼
                    Reimbursement ID returned + displayed
                    Feedback saved to sample/feedback.json
                              │
                              ▼
                    Case moves to Reviewed tab (ADDRESSED)
```

---

## Reimbursement Amount Logic

The assignment specifies: *"price at time of fulfillment, after discounts, for the specific damaged item only, capped at $100."*

```
1. Rulebook picks highest-value invoice item as placeholder (blind guess, no photos yet)

2. Vision model identifies damaged_item_name from photos

3. matchInvoiceItem() cross-references against invoice:
   - Matched  → use invoice unit_price (source of truth, already post-discount)
   - Unmatched → flag human review, fall back to highest-value item

4. Decision model can further adjust recommended_amount

5. Final: min(verifiedItemPrice, 100.00)
```

The invoice is generated via `POST /invoices/generate` from the mock API. The returned `unit_price` is the fulfillment price after discounts — there is no separate discount field.

---

## Feedback Loop

When a rep approves a case, the outcome is written to `sample/feedback.json`:

```json
{
  "merchant": "Best Paw Nutrition",
  "case_id": "CASE-1001",
  "timestamp": "2026-04-22T...",
  "override_reason": "Photos clearly show cracked bottle despite low packaging score",
  "email_was_edited": true,
  "reimbursement_amount": 38.00,
  "product_name": "Additional Collagen Ampoule Duo",
  "recommendation": "approve"
}
```

On the next agent run for the same merchant, this history is loaded and injected into the decision prompt as plain text context. The UI shows an amber **"Prior feedback applied"** badge when this happens.

---

## Component Architecture

```
shipbob_FDE/
├── sample/                          # Local data (from mock API)
│   ├── cases/, shipments/
│   ├── orders/, invoices/
│   └── feedback.json                # Persisted rep correction history
│
└── claims-ui/                       # Next.js 16 app
    ├── app/
    │   ├── page.tsx                 # Server component — loads data, runs rulebook
    │   └── api/
    │       ├── claims/route.ts      # GET — all ClaimSummary[]
    │       ├── agent/[case_id]/     # POST — runs AI pipeline
    │       ├── approve/[case_id]/   # POST — calls email + reimbursement APIs
    │       └── feedback/            # GET/POST — reads/writes feedback.json
    │
    ├── components/
    │   ├── AppShell.tsx             # Tab nav, addressed state
    │   ├── ClaimsQueue.tsx          # Split-panel sidebar + detail
    │   ├── ClaimDetail.tsx          # Claim view, agent trigger, zoom, override, email
    │   ├── ReviewedPanel.tsx        # Addressed/closed (read-only)
    │   └── Dashboard.tsx            # KPIs, charts, carrier/merchant breakdowns
    │
    └── lib/
        ├── types.ts                 # All TypeScript interfaces
        ├── sample-data.ts           # Reads from sample/ JSON files
        ├── rulebook.ts              # Deterministic gates + evidence heuristics
        └── agent.ts                 # Summary → vision → cross-ref → decision → judge
```

---

## Model Selection Rationale

| Step | Model | Why |
|------|-------|-----|
| Case summary | `meta-llama/llama-3.1-8b-instruct` | Fast, cheap, text-only |
| Vision analysis | `google/gemini-2.5-flash` | Best cost/quality for multi-image visual reasoning |
| Decision + email | `google/gemini-2.5-flash` | Strong instruction-following, structured JSON |
| LLM judge | `meta-llama/llama-3.1-8b-instruct` | Cheap; independence from decision model matters more than raw capability |

All via **OpenRouter** (`openrouter.ai/api/v1`), OpenAI-compatible endpoint.

---

## Guardrails & Validation

| Layer | What it catches |
|-------|----------------|
| Score clamping | Vision scores outside 0–1 |
| Required field validation | Missing JSON keys → `null` → human review |
| Cross-validation | `approve` + `damage_visible < 0.30` → forced to `request_more_info` |
| Critical gap cap | Any dimension < 0.30 → overall capped at 0.50 |
| Invoice cross-reference | AI-named item must match invoice by name/SKU — no match = human review |
| Human review threshold | `overallConfidence < 0.70` → blocks approval |
| LLM judge | Independent model flags logical contradictions; `fail` forces human review |
| Human override | Rep override requires written justification (audit trail) |

---

## UI Tabs & Priority System

**Tabs:** Queue · Dashboard · Reviewed

**Priority dots:**
- 🔴 Red — HIGH_VALUE (≥ $75, agent approved)
- 🟠 Orange — READY_FOR_REVIEW
- 🟡 Yellow — MISSING_EVIDENCE / WAITING / EXPIRED
- 🟢 Green — ADDRESSED / CLOSED

**Human review lane:** Cases below 70% confidence or with judge `fail` verdict are surfaced in a separate lane at the top of the queue. Approval is blocked until the rep explicitly overrides with a written reason.

---

## Key Design Decisions

**Why deterministic gates first, AI second?**
Eligibility and evidence checks have zero ambiguity — no LLM needed. Running AI only on cases that pass saves cost and keeps the model focused on the hard part (visual damage assessment).

**Why is the human always in the loop?**
The agent never sends anything autonomously. It drafts and scores; the rep approves. This keeps liability with the human and lets the team build trust incrementally.

**Why a separate LLM judge?**
A model evaluating its own output is weaker than a different model evaluating it. Llama-8B as an independent checker catches cases where Gemini is confidently wrong — the failure mode that matters most.

**Why invoice cross-reference instead of trusting the AI's item name?**
The AI could hallucinate a product name not on the invoice. We verify against the actual invoice before submitting a reimbursement — ensures we only pay out for items that were actually ordered.

**Why base64 images instead of URLs?**
Azure Blob signed URLs with expiry tokens are sometimes rejected by vision model providers doing server-side URL fetches. Downloading images at the server level and sending as base64 is more reliable.

**Why OpenRouter?**
Provider-agnostic routing lets us swap models without code changes — useful as model quality and pricing shift.
