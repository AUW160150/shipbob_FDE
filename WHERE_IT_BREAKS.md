# Where It Breaks

Honest accounting of the system's current limitations. Written to be said out loud before the panel asks.

---

## 1. No persistence — state lives in memory

The "addressed" state (which cases a rep has approved this session) is held in React component state. Refresh the page and it's gone. In production this would be a database write on approval, not client-side state.

`sample/feedback.json` is a flat file written by the server. Fine for a single-instance demo; breaks immediately with multiple workers or a serverless deployment.

---

## 2. Vision scores are not calibrated

Gemini-2.5-flash returns scores like `0.85` for `damage_visible`, but these numbers are not grounded in any labelled dataset. Two photos with identical damage might score differently on different runs. The 0.70 human-review threshold and the score weights (35/30/20/15) are reasoned estimates, not values derived from real claims data.

In production: you'd collect rep override decisions over time and use them to tune both the threshold and the weights.

---

## 3. The judge model is weak for subtle contradictions

The judge uses `llama-3.1-8b-instruct` — fast and cheap, but not strong enough to catch nuanced inconsistencies (e.g. a photo that technically shows damage but to a different product than claimed). It reliably catches obvious contradictions (`approve` + `damage_visible=0.1`) but not edge cases.

Upgrade path: use a stronger judge model, or use the same Gemini model as the decision model for the judge step.

---

## 4. Customer confirmation check is heuristic-only

We check whether any attachment filename contains words like "screenshot", "email", "confirm", "customer". Gemini also looks for it in photos. Neither is definitive — a rep could attach a photo named `screenshot.png` that's just a photo of the product, and we'd count it as confirmed. There's no structured field in the mock API for explicit end-customer confirmation.

---

## 5. Invoice cross-reference uses fuzzy text matching

`matchInvoiceItem()` uses word overlap to match the AI's item name to an invoice line item. If a merchant sells a product with a very generic name (e.g. "Bottle"), the match could be wrong. The match is logged in the decision gate reason so a rep can verify, but it's not bulletproof.

---

## 6. Image URLs expire

The Azure Blob SAS tokens in the mock data expire **May 19, 2026**. After that, thumbnails won't render and vision analysis will fail silently (images download as 403 errors, `fetchAsBase64` returns `null`, agent skips vision entirely).

---

## 7. No concurrency handling

If a rep hits "Run AI Analysis" on multiple cases simultaneously, all requests run in parallel against OpenRouter with no rate-limit handling or queue. Under load this would hit provider rate limits and return 429 errors.

---

## 8. Rep "push back" is structured as context, not correction

When a rep overrides a flag or edits a draft email, that's saved to `feedback.json` and injected as text context into future agent runs for the same merchant. The model reads it as a note, not as a formal correction signal. There's no mechanism where a rep can say "your `damage_visible` score was wrong because X" and have the agent actually update its scoring logic. That would require fine-tuning or a more structured RLHF-style loop.

---

## 9. Single test dataset

The system has only been validated on 5 mock cases provided by ShipBob. Edge cases (partial damage, multiple damaged items, fraudulent claims, repeat denial attempts) haven't been tested.
