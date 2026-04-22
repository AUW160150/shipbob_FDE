import path from "path"
import fs from "fs"
import type {
  Case, Shipment, Attachment, Invoice, LineItem,
  GateResult, RulebookResult, TriageResult,
  ItemVisionResult, MultiItemVisionOutput,
} from "./types"
import { logWaitingClaim } from "./supabase"

const OR_BASE = "https://openrouter.ai/api/v1/chat/completions"

function orHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": "https://shipbob-claims.local",
    "X-Title": "ShipBob Claims",
  }
}

async function orChat(model: string, messages: object[], jsonMode = false, maxTokens = 512): Promise<string> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens }
  if (jsonMode) body.response_format = { type: "json_object" }

  const res = await fetch(OR_BASE, { method: "POST", headers: orHeaders(), body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

// ---------- Public types ----------

export interface VisionOutput {
  damage_visible: number
  product_identifiable: number
  packaging_present: number
  claim_coherent: number
  customer_confirmation_present: number
  damaged_item_name: string
  damaged_item_price: number
}

export interface DecisionOutput {
  recommendation: "approve" | "deny" | "request_more_info"
  confidence: number
  reasoning: string
  recommended_amount: number | null
  draft_email: string
}

export interface JudgeOutput {
  consistent: boolean
  flags: string[]
  judge_confidence: number
  verdict: "pass" | "warn" | "fail"
}

export interface AgentAnalysis {
  caseSummary: string
  vision: VisionOutput | null               // best single-item scores, for backward compat
  multiItemVision: MultiItemVisionOutput | null
  decision: DecisionOutput | null
  judge: JudgeOutput | null
  feedbackApplied: boolean
  updatedRulebook: Partial<RulebookResult>
}

// ---------- Constants ----------

const VISION_WEIGHTS = { damage_visible: 0.35, product_identifiable: 0.30, packaging_present: 0.20, claim_coherent: 0.15 }
const HUMAN_REVIEW_THRESHOLD = 0.70
const CRITICAL_GAP_THRESHOLD = 0.30
const CRITICAL_GAP_CAP = 0.50
const VERIFIED_THRESHOLD = 0.50     // min score to count an item as verified
const PACKAGING_HARD_GATE = 0.40    // below this → packaging issue flag
const MAX_REIMBURSEMENT = 100

// ---------- Validation helpers ----------

function clamp(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return isNaN(n) ? 0 : Math.min(1, Math.max(0, n))
}

function validateVision(raw: unknown): VisionOutput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const required = ["damage_visible", "product_identifiable", "packaging_present", "claim_coherent", "damaged_item_name", "damaged_item_price"]
  if (required.some((k) => !(k in r))) return null
  return {
    damage_visible:                clamp(r.damage_visible),
    product_identifiable:          clamp(r.product_identifiable),
    packaging_present:             clamp(r.packaging_present),
    claim_coherent:                clamp(r.claim_coherent),
    customer_confirmation_present: clamp(r.customer_confirmation_present ?? 0),
    damaged_item_name:             String(r.damaged_item_name ?? "Unknown item"),
    damaged_item_price:            Math.max(0, parseFloat(String(r.damaged_item_price ?? 0)) || 0),
  }
}

function validateDecision(raw: unknown, vision: VisionOutput): DecisionOutput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (!r.recommendation || !r.reasoning || !r.draft_email) return null

  let recommendation = r.recommendation as DecisionOutput["recommendation"]
  if (recommendation === "approve" && vision.damage_visible < CRITICAL_GAP_THRESHOLD) recommendation = "request_more_info"
  if (recommendation === "approve" && vision.product_identifiable < CRITICAL_GAP_THRESHOLD) recommendation = "request_more_info"

  return {
    recommendation,
    confidence:         clamp(r.confidence),
    reasoning:          String(r.reasoning),
    recommended_amount: r.recommended_amount != null ? Math.max(0, parseFloat(String(r.recommended_amount)) || 0) : null,
    draft_email:        String(r.draft_email),
  }
}

function computeDecisionConfidence(v: VisionOutput): number {
  const raw =
    v.damage_visible       * VISION_WEIGHTS.damage_visible +
    v.product_identifiable * VISION_WEIGHTS.product_identifiable +
    v.packaging_present    * VISION_WEIGHTS.packaging_present +
    v.claim_coherent       * VISION_WEIGHTS.claim_coherent

  const hasCriticalGap = [v.damage_visible, v.product_identifiable, v.packaging_present, v.claim_coherent]
    .some((s) => s < CRITICAL_GAP_THRESHOLD)

  return hasCriticalGap ? Math.min(raw, CRITICAL_GAP_CAP) : raw
}

// ---------- Step 1: case summary ----------

export async function generateCaseSummary(description: string): Promise<string> {
  return orChat("meta-llama/llama-3.1-8b-instruct", [
    {
      role: "system",
      content: "You are a shipping claims analyst. Given a case description, produce a concise 2–3 sentence plain-English summary of what the merchant is claiming, what product is affected, and the condition of the shipment as described.",
    },
    { role: "user", content: `Case description:\n${description}` },
  ])
}

// ---------- Step 2a: fetch image as base64 ----------

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mimeType = res.headers.get("content-type") ?? "image/png"
    return { base64, mimeType }
  } catch {
    return null
  }
}

// ---------- Step 2b: per-item vision ----------

export async function analyzeItem(
  targetItem: string,
  attachments: Attachment[],
  invoice: Invoice,
  description: string
): Promise<ItemVisionResult> {
  const billableItems = invoice.line_items.filter((i) => i.unit_price > 0)
  const invoiceSummary = billableItems
    .map((i) => `- ${i.name} (SKU: ${i.sku}) × ${i.quantity} @ $${i.unit_price.toFixed(2)}`)
    .join("\n")

  const imageData = await Promise.all(attachments.slice(0, 3).map((a) => fetchAsBase64(a.url)))
  const imageContent = imageData
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({
      type: "image_url",
      image_url: { url: `data:${d.mimeType};base64,${d.base64}` },
    }))

  const fallbackResult: ItemVisionResult = {
    claimedItemName: targetItem,
    invoiceMatch: null,
    verified: false,
    damage_visible: 0,
    product_identifiable: 0,
    packaging_present: 0,
    claim_coherent: 0,
    customer_confirmation_present: 0,
    verifiedAmount: 0,
  }

  if (imageContent.length === 0) return fallbackResult

  const raw = await orChat(
    "google/gemini-2.5-flash",
    [
      {
        role: "system",
        content: `You are a claims evidence analyst. You are examining photos for ONE SPECIFIC claimed item: "${targetItem}"

Search every photo carefully and return a JSON object with exactly these keys for THIS ITEM:
- damage_visible (0.0–1.0): Is physical damage to "${targetItem}" visible in at least one photo?
- product_identifiable (0.0–1.0): Can "${targetItem}" be positively identified in any photo?
- packaging_present (0.0–1.0): Is outer shipping packaging visible in any photo? (shared check, same for all items)
- claim_coherent (0.0–1.0): Does the merchant description match what is visible for "${targetItem}"?
- customer_confirmation_present (0.0–1.0): Does any image appear to be a screenshot or message showing end-customer reported damage?

Be conservative. Score high only with clear, unambiguous evidence. Return only valid JSON, no other text.`,
      },
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Merchant description: "${description}"\n\nInvoice items:\n${invoiceSummary}\n\nFocus on: "${targetItem}"`,
          },
        ],
      },
    ],
    true,
    512
  )

  let scores: Record<string, number> = {}
  try {
    const parsed = JSON.parse(raw)
    scores = {
      damage_visible:                clamp(parsed.damage_visible),
      product_identifiable:          clamp(parsed.product_identifiable),
      packaging_present:             clamp(parsed.packaging_present),
      claim_coherent:                clamp(parsed.claim_coherent),
      customer_confirmation_present: clamp(parsed.customer_confirmation_present ?? 0),
    }
  } catch {
    return fallbackResult
  }

  const invoiceMatch = matchInvoiceItem(targetItem, billableItems)
  const verified =
    scores.damage_visible >= VERIFIED_THRESHOLD &&
    scores.product_identifiable >= VERIFIED_THRESHOLD

  return {
    claimedItemName: targetItem,
    invoiceMatch: invoiceMatch
      ? { name: invoiceMatch.name, sku: invoiceMatch.sku, unit_price: invoiceMatch.unit_price }
      : null,
    verified,
    damage_visible:                scores.damage_visible,
    product_identifiable:          scores.product_identifiable,
    packaging_present:             scores.packaging_present,
    claim_coherent:                scores.claim_coherent,
    customer_confirmation_present: scores.customer_confirmation_present,
    verifiedAmount: verified ? (invoiceMatch?.unit_price ?? 0) : 0,
  }
}

// ---------- Step 2c: run multi-item analysis concurrently ----------

export async function runMultiItemAnalysis(
  claimedItems: string[],
  attachments: Attachment[],
  invoice: Invoice,
  description: string,
  c: Case
): Promise<MultiItemVisionOutput> {
  const items = claimedItems.length > 0 ? claimedItems : ["damaged item"]

  const results = await Promise.all(
    items.map((item) => analyzeItem(item, attachments, invoice, description))
  )

  const packagingScores = results.map((r) => r.packaging_present)
  const maxPackaging = Math.max(...packagingScores)
  const packagingHardGatePassed = maxPackaging >= PACKAGING_HARD_GATE

  const rawTotal = results.reduce((sum, r) => sum + r.verifiedAmount, 0)
  const totalVerifiedAmount = Math.min(rawTotal, MAX_REIMBURSEMENT)

  const overallCustomerConfirmation = Math.max(...results.map((r) => r.customer_confirmation_present))

  // If nothing verified and packaging gate failed → log waiting claim
  const anyVerified = results.some((r) => r.verified)
  if (!anyVerified) {
    const missingEvidence: string[] = []
    if (!packagingHardGatePassed) missingEvidence.push("outer packaging photo")
    if (results.every((r) => r.damage_visible < VERIFIED_THRESHOLD)) missingEvidence.push("clear damage photo")
    if (results.every((r) => r.product_identifiable < VERIFIED_THRESHOLD)) missingEvidence.push("identifiable product photo")

    await logWaitingClaim({
      case_id: c.case_id,
      case_number: c.case_number,
      account_name: c.account_name,
      missing_evidence: missingEvidence,
    })
  }

  return { items: results, packagingHardGatePassed, totalVerifiedAmount, overallCustomerConfirmation }
}

// ---------- Legacy single-item analyzeEvidence (kept for compatibility) ----------

export async function analyzeEvidence(
  attachments: Attachment[],
  invoice: Invoice,
  description: string
): Promise<VisionOutput | null> {
  if (attachments.length === 0) return null
  const billableItems = invoice.line_items.filter((i) => i.unit_price > 0)
  const invoiceSummary = billableItems
    .map((i) => `- ${i.name} (SKU: ${i.sku}) × ${i.quantity} @ $${i.unit_price.toFixed(2)}`)
    .join("\n")

  const imageData = await Promise.all(attachments.slice(0, 2).map((a) => fetchAsBase64(a.url)))
  const imageContent = imageData
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({
      type: "image_url",
      image_url: { url: `data:${d.mimeType};base64,${d.base64}` },
    }))

  if (imageContent.length === 0) return null

  const raw = await orChat(
    "google/gemini-2.5-flash",
    [
      {
        role: "system",
        content: `You are a claims evidence analyst. Examine the photos carefully and return a JSON object with exactly these keys:
- damage_visible (0.0–1.0): Is physical damage clearly visible in at least one photo?
- product_identifiable (0.0–1.0): Can the specific damaged product be positively identified?
- packaging_present (0.0–1.0): Is the outer shipping packaging shown?
- claim_coherent (0.0–1.0): Does the merchant description match what is visible?
- customer_confirmation_present (0.0–1.0): Does any image appear to be a screenshot or document showing the end customer reported damage (email, chat, message screenshot)?
- damaged_item_name (string): The specific item that appears damaged
- damaged_item_price (number): Its unit price from the invoice (0 if not determinable)

Be conservative — only score high when there is clear, unambiguous evidence. Return only valid JSON, no other text.`,
      },
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Merchant description: "${description}"\n\nInvoice items:\n${invoiceSummary}`,
          },
        ],
      },
    ],
    true,
    1024
  )

  try {
    return validateVision(JSON.parse(raw))
  } catch {
    return null
  }
}

// ---------- Invoice cross-reference ----------

function matchInvoiceItem(aiName: string, lineItems: LineItem[]): LineItem | null {
  if (!aiName || aiName === "Unknown item" || aiName === "damaged item") return null
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "")
  const needle = normalize(aiName)

  const exact = lineItems.find((i) => normalize(i.name) === needle)
  if (exact) return exact

  const contains = lineItems.find(
    (i) => normalize(i.name).includes(needle) || needle.includes(normalize(i.name))
  )
  if (contains) return contains

  const needleWords = new Set(needle.split(" ").filter((w) => w.length > 2))
  const overlap = lineItems.find((i) => {
    const itemWords = normalize(i.name).split(" ").filter((w) => w.length > 2)
    return itemWords.filter((w) => needleWords.has(w)).length >= 2
  })
  return overlap ?? null
}

// ---------- Feedback loader ----------

interface FeedbackEntry {
  merchant: string
  case_id: string
  override_reason?: string
  email_was_edited: boolean
  reimbursement_amount: number
  product_name: string
  recommendation: string
}

function loadMerchantFeedback(merchant: string): FeedbackEntry[] {
  try {
    const file = path.join(process.cwd(), "..", "sample", "feedback.json")
    const all = JSON.parse(fs.readFileSync(file, "utf-8")) as FeedbackEntry[]
    return all.filter((e) => e.merchant === merchant)
  } catch {
    return []
  }
}

function buildFeedbackContext(feedback: FeedbackEntry[]): string {
  if (feedback.length === 0) return ""
  const lines = feedback.map((f) => {
    const parts = [`Case ${f.case_id}: ${f.recommendation} ($${f.reimbursement_amount})`]
    if (f.override_reason) parts.push(`rep override: "${f.override_reason}"`)
    if (f.email_was_edited) parts.push("rep edited the draft email before sending")
    return parts.join(", ")
  })
  return `\nPast interactions with this merchant:\n${lines.join("\n")}\nUse this context to calibrate your recommendation.\n`
}

// ---------- Step 3: decision + draft email ----------

export async function makeDecision(
  c: Case,
  vision: VisionOutput,
  recommendedAmount: number,
  feedbackContext = ""
): Promise<DecisionOutput | null> {
  const context = `Case: ${c.case_id} — ${c.account_name}
Description: ${c.description}
Vision scores: damage=${vision.damage_visible.toFixed(2)}, identifiable=${vision.product_identifiable.toFixed(2)}, packaging=${vision.packaging_present.toFixed(2)}, coherent=${vision.claim_coherent.toFixed(2)}, customer_confirmation=${vision.customer_confirmation_present.toFixed(2)}
Damaged item: ${vision.damaged_item_name} @ $${vision.damaged_item_price.toFixed(2)}
Recommended reimbursement: $${recommendedAmount.toFixed(2)}
Contact: ${c.contact_email} | Case #${c.case_number}
${feedbackContext}`

  const raw = await orChat(
    "google/gemini-2.5-flash",
    [
      {
        role: "system",
        content: `You are a ShipBob claims specialist making a final recommendation. Return a JSON object with exactly these keys:
- recommendation: "approve" | "deny" | "request_more_info"
- confidence: number 0.0–1.0 reflecting how certain you are
- reasoning: 1–2 sentence justification grounded in the vision scores
- recommended_amount: number (reimbursement amount) or null if denying
- draft_email: professional 3–5 sentence email to the merchant

Rules:
- Approve only if damage_visible >= 0.6 AND product_identifiable >= 0.5
- Request more info if scores are ambiguous (0.3–0.6 range)
- Deny if damage_visible < 0.3 or claim is incoherent
Return only valid JSON.`,
      },
      { role: "user", content: context },
    ],
    true,
    1024
  )

  try {
    return validateDecision(JSON.parse(raw), vision)
  } catch {
    return null
  }
}

// ---------- Step 4: LLM judge ----------

export async function judgeDecision(
  vision: VisionOutput,
  decision: DecisionOutput,
): Promise<JudgeOutput> {
  const context = `Vision scores:
  damage_visible: ${vision.damage_visible.toFixed(2)}
  product_identifiable: ${vision.product_identifiable.toFixed(2)}
  packaging_present: ${vision.packaging_present.toFixed(2)}
  claim_coherent: ${vision.claim_coherent.toFixed(2)}

Decision made: ${decision.recommendation}
Confidence claimed: ${decision.confidence.toFixed(2)}
Reasoning: ${decision.reasoning}`

  const raw = await orChat(
    "meta-llama/llama-3.1-8b-instruct",
    [
      {
        role: "system",
        content: `You are an independent quality-control judge evaluating a claims AI decision. Given vision scores and the decision made, check for logical consistency.

Return a JSON object with exactly these keys:
- consistent (boolean): Is the recommendation logically consistent with the vision scores?
- flags (array of strings): List any specific inconsistencies or concerns (empty array if none)
- judge_confidence (0.0–1.0): How confident are you in your assessment?
- verdict: "pass" | "warn" | "fail"
  - "pass": recommendation is well-supported
  - "warn": minor inconsistencies, human should double-check
  - "fail": recommendation contradicts the evidence

Examples of flags: "damage_visible=0.2 but recommendation is approve", "confidence claimed 0.9 but packaging_present=0.1"
Return only valid JSON.`,
      },
      { role: "user", content: context },
    ],
    true,
    512
  )

  try {
    const parsed = JSON.parse(raw) as JudgeOutput
    return {
      consistent:       typeof parsed.consistent === "boolean" ? parsed.consistent : true,
      flags:            Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
      judge_confidence: clamp(parsed.judge_confidence),
      verdict:          ["pass", "warn", "fail"].includes(parsed.verdict) ? parsed.verdict : "warn",
    }
  } catch {
    return { consistent: true, flags: ["Judge evaluation failed to parse"], judge_confidence: 0, verdict: "warn" }
  }
}

// ---------- Main entry point ----------

export async function runAgent(
  c: Case,
  shipment: Shipment,
  attachments: Attachment[],
  invoice: Invoice,
  existingRulebook: RulebookResult,
  triage?: TriageResult
): Promise<AgentAnalysis> {
  const empty: AgentAnalysis = {
    caseSummary: "", vision: null, multiItemVision: null,
    decision: null, judge: null, feedbackApplied: false, updatedRulebook: {},
  }

  if (!existingRulebook.eligibility.passed) return empty

  const caseSummary = await generateCaseSummary(c.description)

  if (attachments.length === 0) return { ...empty, caseSummary }

  // Determine claimed items: prefer triage metadata, fallback to description parse
  const claimedItems = (triage?.claimedItems && triage.claimedItems.length > 0)
    ? triage.claimedItems
    : ["damaged item"]

  // Run multi-item vision concurrently across shared photos
  const multiItemVision = await runMultiItemAnalysis(claimedItems, attachments, invoice, c.description, c)

  // Build a representative single VisionOutput from the best-scoring verified item
  // (or the item with highest damage score if none verified)
  const bestItem = multiItemVision.items.reduce((best, cur) =>
    cur.damage_visible > best.damage_visible ? cur : best,
    multiItemVision.items[0]
  )

  const vision: VisionOutput = {
    damage_visible:                bestItem.damage_visible,
    product_identifiable:          bestItem.product_identifiable,
    packaging_present:             bestItem.packaging_present,
    claim_coherent:                bestItem.claim_coherent,
    customer_confirmation_present: multiItemVision.overallCustomerConfirmation,
    damaged_item_name:             bestItem.invoiceMatch?.name ?? bestItem.claimedItemName,
    damaged_item_price:            bestItem.invoiceMatch?.unit_price ?? 0,
  }

  const recommendedAmount = multiItemVision.totalVerifiedAmount

  const pastFeedback = loadMerchantFeedback(c.account_name)
  const feedbackContext = buildFeedbackContext(pastFeedback)
  const feedbackApplied = pastFeedback.length > 0

  const decision = await makeDecision(c, vision, recommendedAmount, feedbackContext)
  const judge = decision ? await judgeDecision(vision, decision) : null

  const decisionConfidence = computeDecisionConfidence(vision)
  const judgeFailed = judge?.verdict === "fail"
  const noItemsVerified = !multiItemVision.items.some((i) => i.verified)
  const packagingFailed = !multiItemVision.packagingHardGatePassed

  const finalAmount = decision?.recommended_amount ?? recommendedAmount
  const finalConfidence = Math.min(existingRulebook.eligibility.confidence, decisionConfidence)
  const needsHumanReview =
    finalConfidence < HUMAN_REVIEW_THRESHOLD || judgeFailed || noItemsVerified || packagingFailed

  const verifiedItemNames = multiItemVision.items
    .filter((i) => i.verified)
    .map((i) => i.invoiceMatch?.name ?? i.claimedItemName)

  const invoiceNote = noItemsVerified
    ? `No claimed items could be verified in photos — human review required.`
    : `Verified: ${verifiedItemNames.join(", ")}. Total reimbursement: $${recommendedAmount.toFixed(2)} (capped at $${MAX_REIMBURSEMENT}).`

  const packagingNote = packagingFailed
    ? " Outer packaging photo not detected — packaging gate failed."
    : ""

  const decisionGate: GateResult = {
    passed: decision?.recommendation === "approve" && !judgeFailed && !noItemsVerified,
    reason: [
      invoiceNote + packagingNote,
      judgeFailed ? `Judge flagged: ${judge?.flags.join("; ")}.` : (decision?.reasoning ?? ""),
    ].filter(Boolean).join(" "),
    confidence: noItemsVerified ? Math.min(decisionConfidence, 0.5) : decisionConfidence,
  }

  const evidenceGate: GateResult = {
    ...existingRulebook.evidence,
    reason: `${attachments.length} photo(s) analyzed across ${claimedItems.length} claimed item(s). damage=${vision.damage_visible.toFixed(2)}, identifiable=${vision.product_identifiable.toFixed(2)}, packaging=${vision.packaging_present.toFixed(2)}, coherence=${vision.claim_coherent.toFixed(2)}.`,
    confidence: Math.min(vision.damage_visible, vision.product_identifiable) > 0 ? 1 : 0.5,
  }

  return {
    caseSummary,
    vision,
    multiItemVision,
    decision,
    judge,
    feedbackApplied,
    updatedRulebook: {
      evidence: evidenceGate,
      decision: decisionGate,
      overallConfidence: finalConfidence,
      needsHumanReview,
      recommendedAmount: finalAmount,
      draftEmail: decision?.draft_email ?? existingRulebook.draftEmail,
      label: needsHumanReview
        ? existingRulebook.label
        : finalAmount >= 75 ? "HIGH_VALUE" : "READY_FOR_REVIEW",
    },
  }
}
