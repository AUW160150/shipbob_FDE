# ShipBob Claims UI

AI-powered damaged-in-transit claims processing for the ShipBob merchant care team. An agent processes each claim through a deterministic rulebook and a multi-step LLM pipeline, then presents a draft recommendation to a rep for review and approval.

---

## Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/AUW160150/shipbob_FDE.git
cd shipbob_FDE

# 2. Install dependencies
cd claims-ui
npm install

# 3. Set your OpenRouter key
echo "OPENROUTER_API_KEY=sk-or-your-key-here" > .env.local

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `sample/` folder at the repo root contains pre-fetched mock API data for 5 test cases — no live API calls needed to load the UI.

---

## How to demo

1. **Queue tab** — lists all open claims, prioritized by severity (red → orange → yellow)
2. Click a claim to open the detail panel
3. Click **Run AI Analysis** — triggers the 4-step agent pipeline (summary → vision → decision → judge)
4. Review the vision scores, judge evaluation, and draft email
5. Edit the email if needed, then click **Approve & Send** — calls the mock email and reimbursement APIs
6. Approved cases move to the **Reviewed tab**
7. **Dashboard tab** — shows KPIs, weekly volume, carrier breakdown, merchant frequency

---

## Repo structure

```
shipbob_FDE/
├── sample/                  # Pre-fetched mock API data (cases, invoices, shipments, etc.)
│   └── feedback.json        # Persisted rep corrections — fed back into future agent runs
├── claims-ui/               # Next.js 16 app
│   ├── app/
│   │   ├── page.tsx         # Server component — loads data, runs rulebook
│   │   └── api/
│   │       ├── agent/       # POST — runs AI pipeline for a case
│   │       ├── approve/     # POST — calls mock email + reimbursement APIs
│   │       └── feedback/    # GET/POST — reads and writes rep correction history
│   ├── components/          # AppShell, ClaimsQueue, ClaimDetail, Dashboard, ReviewedPanel
│   └── lib/
│       ├── types.ts         # Shared TypeScript interfaces
│       ├── rulebook.ts      # Deterministic gates (eligibility, evidence)
│       └── agent.ts         # AI pipeline (summary → vision → decision → judge)
├── ARCHITECTURE.md          # System design, flow diagrams, model choices, tradeoffs
├── SCORING.md               # Confidence scoring logic and weights
└── WHERE_IT_BREAKS.md       # Known limitations and failure modes
```

---

## Models used

| Step | Model | Via |
|------|-------|-----|
| Case summary | `meta-llama/llama-3.1-8b-instruct` | OpenRouter |
| Vision analysis | `google/gemini-2.5-flash` | OpenRouter |
| Decision + email | `google/gemini-2.5-flash` | OpenRouter |
| LLM judge | `meta-llama/llama-3.1-8b-instruct` | OpenRouter |
