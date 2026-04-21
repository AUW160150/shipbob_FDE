# Confidence Scoring Logic

## Overview

The AI agent evaluates each claim through three sequential gates. Each gate produces a `GateResult` with a `passed` boolean, a human-readable `reason`, and a `confidence` score (0.0–1.0). The overall confidence is the minimum of all gate scores — the pipeline is only as strong as its weakest gate.

```
overallConfidence = min(eligibility.confidence, evidence.confidence, decision.confidence)
needsHumanReview  = overallConfidence < 0.70
```

---

## Gate 1 — Eligibility (Deterministic)

Eligibility is a rule-based check with binary outcomes. Confidence is always 1.0 (pass) or 0.0 (fail) — there is no ambiguity here.

| Condition | Outcome | Confidence |
|-----------|---------|------------|
| Shipment is insured | FAIL — separate workflow | 0.0 |
| Claim type ≠ "Damaged in Transit" | FAIL — wrong category | 0.0 |
| Filed > 90 days after delivery | FAIL — expired | 0.0 |
| Otherwise | PASS | 1.0 |

---

## Gate 2 — Evidence (Partially Deterministic)

Checks for presence of photos and invoice line items. Confidence from this gate reflects photo count and invoice completeness.

| Condition | Outcome | Confidence |
|-----------|---------|------------|
| No attachments | FAIL | 0.0 |
| No billable invoice items | FAIL | 0.0 |
| Attachments present + billable items found | PASS → AI vision step | 1.0 |

After the deterministic check passes, the AI vision model produces four sub-scores (see Gate 3 below) that feed back into the final decision confidence.

---

## Gate 3 — Decision (AI-Powered)

The decision gate uses `claude-sonnet-4-6` with vision to analyze attachment images. The model scores four dimensions, which are combined into a final decision confidence.

### Vision Sub-Scores (0.0–1.0 each)

| Dimension | Weight | What the Model Assesses |
|-----------|--------|--------------------------|
| `damage_visible` | 35% | Is physical damage clearly visible in at least one photo? |
| `product_identifiable` | 30% | Can the specific damaged product be identified from the photos? |
| `packaging_present` | 20% | Is the outer packaging shown in at least one photo? |
| `claim_coherent` | 15% | Does the merchant's description match what is shown in the photos? |

### Score Calculation

```
rawScore = (damage_visible × 0.35)
         + (product_identifiable × 0.30)
         + (packaging_present × 0.20)
         + (claim_coherent × 0.15)

# If any single dimension < 0.30, the claim has a critical gap
# (e.g., no visible damage at all) — cap the overall decision confidence
if any(score < 0.30 for score in [damage_visible, product_identifiable, packaging_present, claim_coherent]):
    decisionConfidence = min(rawScore, 0.50)
else:
    decisionConfidence = rawScore
```

### What Triggers Human Review

`needsHumanReview = overallConfidence < 0.70`

This is triggered when:
- A photo is blurry or damage isn't clearly visible (`damage_visible` low)
- The product in the photo doesn't match the invoice item (`product_identifiable` low)
- No packaging photo was submitted (`packaging_present` low)
- The merchant's description contradicts what's in the photos (`claim_coherent` low)
- Any gate fails entirely (eligibility or evidence score of 0)

### Human Review Channel

Cases flagged for human review are surfaced in a separate "⚠ Needs Human Review" lane at the top of the queue. The `Approve & Send` button is disabled for these cases. Once a rep reviews the AI reasoning, corrects the assessment if needed, and overrides the flag, the case re-enters the standard queue with the manual review noted.

---

## Recommended Amount

The recommended reimbursement is the unit price of the highest-value billable invoice item, capped at $100.00. The AI model confirms this is the damaged item via photo analysis. If the model identifies a different item as damaged, it overrides the recommendation.

```
recommendedAmount = min(candidateItem.unit_price, 100.00)
```

---

## Score Summary

| Score Range | Interpretation | Action |
|-------------|----------------|--------|
| 0.90–1.00 | High confidence | Auto-approve eligible |
| 0.70–0.89 | Moderate confidence | Rep reviews draft email, approves |
| 0.50–0.69 | Low confidence | Flagged for human review |
| 0.00–0.49 | Very low / critical gap | Human review required, possible denial |

---

## Model Assignments

| Task | Model | Rationale |
|------|-------|-----------|
| Case summary (2-3 sentences) | `claude-haiku-4-5` | Fast, cheap, no vision needed |
| Vision analysis (photo scoring) | `claude-sonnet-4-6` | Vision capability, structured output |
| Decision + draft email | `claude-sonnet-4-6` | Reasoning quality, structured output |

Stable system prompts use `cache_control: {type: "ephemeral"}` to minimize repeated token costs across the queue.
