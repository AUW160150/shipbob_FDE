import type { Case, Shipment, Attachment, Invoice, ClaimLabel, PriorityDot, RulebookResult, GateResult } from "./types"

const ELIGIBILITY_WINDOW_DAYS = 90
const HUMAN_REVIEW_THRESHOLD = 0.70

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

function clamp(value: number, max: number): number {
  return Math.min(value, max)
}

function priorityFor(label: ClaimLabel): PriorityDot {
  switch (label) {
    case "HIGH_VALUE":       return "red"
    case "READY_FOR_REVIEW": return "orange"
    case "MISSING_EVIDENCE":
    case "WAITING":
    case "EXPIRED":          return "yellow"
    case "CLOSED":
    case "ADDRESSED":        return "green"
  }
}

function fail(reason: string): RulebookResult {
  const label: ClaimLabel = "EXPIRED"
  return {
    label,
    priority: "yellow",
    eligibility: { passed: false, reason, confidence: 0 },
    evidence: { passed: false, reason: "Not evaluated.", confidence: 0 },
    decision: null,
    overallConfidence: 0,
    needsHumanReview: false,
    recommendedAmount: null,
    draftEmail: null,
  }
}

export function runRulebook(
  c: Case,
  shipment: Shipment,
  attachments: Attachment[],
  invoice: Invoice
): RulebookResult {
  // Gate 1 — eligibility
  if (c.status === "Closed") {
    const label: ClaimLabel = "CLOSED"
    return {
      label,
      priority: "green",
      eligibility: { passed: false, reason: "Case is already closed.", confidence: 1 },
      evidence: { passed: false, reason: "Not evaluated.", confidence: 0 },
      decision: null,
      overallConfidence: 1,
      needsHumanReview: false,
      recommendedAmount: null,
      draftEmail: null,
    }
  }

  if (shipment.is_insured) {
    return { ...fail("Insured shipments follow a separate process."), label: "EXPIRED", priority: "yellow" }
  }

  if (!c.sub_category.includes("Damaged in Transit")) {
    return { ...fail(`Claim type "${c.sub_category}" is not eligible for this workflow.`), label: "EXPIRED", priority: "yellow" }
  }

  const daysFromDelivery = daysBetween(shipment.delivered_date, c.created_date)
  if (daysFromDelivery > ELIGIBILITY_WINDOW_DAYS) {
    return {
      ...fail(`Claim filed ${daysFromDelivery} days after delivery. Limit is ${ELIGIBILITY_WINDOW_DAYS} days.`),
      label: "EXPIRED",
      priority: "yellow",
    }
  }

  const eligibility: GateResult = {
    passed: true,
    reason: `Filed ${daysFromDelivery} day(s) after delivery — within ${ELIGIBILITY_WINDOW_DAYS}-day window.`,
    confidence: 1,
  }

  // Gate 2 — evidence
  if (attachments.length === 0) {
    const label: ClaimLabel = c.status === "Waiting on Client" ? "WAITING" : "MISSING_EVIDENCE"
    return {
      label,
      priority: "yellow",
      eligibility,
      evidence: { passed: false, reason: "No attachments found. Photos of damaged product and packaging required.", confidence: 0 },
      decision: null,
      overallConfidence: 0,
      needsHumanReview: true,
      recommendedAmount: null,
      draftEmail: buildRequestEvidenceEmail(c),
    }
  }

  const billableItems = invoice.line_items.filter((i) => i.unit_price > 0)
  if (billableItems.length === 0) {
    const label: ClaimLabel = "MISSING_EVIDENCE"
    return {
      label,
      priority: "yellow",
      eligibility,
      evidence: { passed: false, reason: "No billable line items on invoice.", confidence: 0 },
      decision: null,
      overallConfidence: 0,
      needsHumanReview: true,
      recommendedAmount: null,
      draftEmail: buildRequestEvidenceEmail(c),
    }
  }

  // Heuristic check for end-customer confirmation attachment
  const confirmationKeywords = ["screenshot", "confirm", "email", "msg", "message", "chat", "customer"]
  const hasCustomerConfirmation = attachments.some((a) =>
    confirmationKeywords.some((kw) => a.file_name.toLowerCase().includes(kw))
  )

  const evidenceNotes = [
    `${attachments.length} attachment(s) present`,
    `${billableItems.length} billable invoice item(s)`,
    hasCustomerConfirmation
      ? "Customer confirmation attachment detected"
      : "No customer confirmation attachment found — agent will check photos",
    // unit_price from generated invoice is already post-discount fulfillment price
  ]

  const evidence: GateResult = {
    passed: true,
    reason: evidenceNotes.join(". ") + ".",
    confidence: 1,
  }

  // Gate 3 — decision
  // Confidence is a placeholder; AI vision analysis will replace this value.
  // Picking the highest-value item as the candidate; AI overrides once photos are analyzed.
  const candidateItem = billableItems.sort((a, b) => b.unit_price - a.unit_price)[0]
  const decisionConfidence = 0.72 // placeholder — AI fills this in

  const decision: GateResult = {
    passed: true,
    reason: `"${candidateItem.name}" identified as likely damaged item. Awaiting AI photo verification.`,
    confidence: decisionConfidence,
  }

  const overallConfidence = Math.min(eligibility.confidence, evidence.confidence, decision.confidence)
  const needsHumanReview = overallConfidence < HUMAN_REVIEW_THRESHOLD

  // unit_price from /invoices/generate is post-discount fulfillment price per ShipBob spec
  const amount = clamp(candidateItem.unit_price, 100)
  const label: ClaimLabel = amount >= 75 ? "HIGH_VALUE" : "READY_FOR_REVIEW"

  return {
    label,
    priority: priorityFor(label),
    eligibility,
    evidence,
    decision,
    overallConfidence,
    needsHumanReview,
    recommendedAmount: amount,
    draftEmail: buildApprovalEmail(c, candidateItem.name, amount),
  }
}

function buildApprovalEmail(c: Case, productName: string, amount: number): string {
  return `Hi ${c.account_name} team,

Thank you for reaching out regarding case #${c.case_number}.

After reviewing your damaged-in-transit claim for shipment ${c.shipment_id}, we have approved a reimbursement of $${amount.toFixed(2)} for the damaged item: ${productName}.

This reimbursement will be processed within 5–7 business days to your account on file.

We apologize for the inconvenience and appreciate your patience.

Best regards,
ShipBob Merchant Care`
}

function buildRequestEvidenceEmail(c: Case): string {
  return `Hi ${c.account_name} team,

Thank you for submitting case #${c.case_number} regarding a damaged-in-transit shipment.

To process your claim, we need the following:
- Photo(s) of the damaged product
- Photo(s) of the outer packaging as it arrived
- Confirmation from the end customer that the damage occurred

Please reply with the requested documentation and we will review your claim promptly.

Best regards,
ShipBob Merchant Care`
}
