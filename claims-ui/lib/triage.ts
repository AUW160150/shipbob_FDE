import type { Case, Shipment, Attachment, Invoice, TriageResult, PriorityTag } from "./types"
import { logDeadClaim, logInsuredClaim, logIncompleteClaim, logAutoEmail } from "./supabase"
import { orChat } from "./llm"

const MOCK_BASE = "https://e41238c7-aefe-4d20-8866-747c74eac48f.mock.pstmn.io"
const DEAD_DAYS = 30

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// ---------- Metadata extraction (LLM) ----------

interface ClaimMetadata {
  claim_type: "product_damage" | "missing_item" | "wrong_item" | "unknown"
  claimed_items: string[]
  description_adequate: boolean
}

async function extractMetadata(description: string): Promise<ClaimMetadata> {
  if (!process.env.OPENROUTER_API_KEY) {
    return { claim_type: "unknown", claimed_items: [], description_adequate: false }
  }
  try {
    const raw = await orChat(
      "meta-llama/llama-3.1-8b-instruct",
      [
        {
          role: "system",
          content: `Analyze a shipping claim description and return JSON with exactly these keys:
- claim_type: "product_damage" | "missing_item" | "wrong_item" | "unknown"
- claimed_items: array of specific product names mentioned (empty array if none)
- description_adequate: true if description clearly explains what was damaged and how, false if vague or missing
Return only valid JSON.`,
        },
        { role: "user", content: `Claim description: "${description}"` },
      ],
      true,
      256
    )
    const parsed = JSON.parse(raw)
    return {
      claim_type:           parsed.claim_type ?? "unknown",
      claimed_items:        Array.isArray(parsed.claimed_items) ? parsed.claimed_items : [],
      description_adequate: parsed.description_adequate ?? false,
    }
  } catch {
    return { claim_type: "unknown", claimed_items: [], description_adequate: false }
  }
}

// ---------- Missing fields check (deterministic) ----------

function checkMissingFields(c: Case, attachments: Attachment[], meta: ClaimMetadata): string[] {
  const missing: string[] = []
  if (!c.contact_email?.trim())                    missing.push("contact email")
  if (!c.account_name?.trim())                     missing.push("merchant name")
  if (!c.description || c.description.length < 20) missing.push("damage description")
  if (!meta.description_adequate)                  missing.push("clear damage explanation")
  if (c.sub_category !== "Damaged in Transit")     missing.push("valid claim type (must be Damaged in Transit)")
  if (attachments.length === 0)                    missing.push("damage photos")
  return missing
}

// ---------- Auto-email for incomplete claims ----------

async function sendIncompleteEmail(c: Case, missingFields: string[]): Promise<string> {
  const body = `Hi ${c.account_name} team,

Thank you for submitting case #${c.case_number}.

To begin processing your claim, we need the following information:
${missingFields.map((f) => `  • ${f}`).join("\n")}

Please reply with the requested information and we will review your claim promptly.

Best regards,
ShipBob Merchant Care`

  try {
    await fetch(`${MOCK_BASE}/cases/${c.case_id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: c.contact_email,
        subject: `Action Required: Missing Information for Case #${c.case_number}`,
        body,
      }),
    })
  } catch {
    console.error("[triage] Failed to send incomplete email for", c.case_id)
  }

  return body
}

// ---------- Priority assignment ----------

function assignPriority(
  daysInQueue: number,
  invoiceTotal: number
): { tag: PriorityTag; reason: string } {
  if (daysInQueue >= DEAD_DAYS && invoiceTotal >= 75) {
    return {
      tag: "URGENT",
      reason: `Claim is ${daysInQueue} days old (aging) and high value ($${invoiceTotal.toFixed(2)}). Immediate attention required.`,
    }
  }
  if (daysInQueue >= DEAD_DAYS) {
    return {
      tag: "AGING",
      reason: `Claim has been in queue for ${daysInQueue} days without resolution. Bumped to top.`,
    }
  }
  if (invoiceTotal >= 75) {
    return {
      tag: "HIGH_VALUE",
      reason: `Invoice total $${invoiceTotal.toFixed(2)} exceeds high-value threshold.`,
    }
  }
  if (invoiceTotal >= 20) {
    return {
      tag: "STANDARD",
      reason: `Standard claim. Invoice total $${invoiceTotal.toFixed(2)}.`,
    }
  }
  return {
    tag: "LOW_VALUE",
    reason: `Low invoice value ($${invoiceTotal.toFixed(2)}). Addressed after higher-priority claims.`,
  }
}

// ---------- Main triage entry point ----------

export async function runTriage(
  c: Case,
  shipment: Shipment,
  attachments: Attachment[],
  invoice: Invoice
): Promise<TriageResult> {
  const today = new Date().toISOString().slice(0, 10)
  const daysFromDelivery = daysBetween(shipment.delivered_date, c.created_date)
  const daysInQueue      = daysBetween(c.created_date, today)

  // Gate: dead on arrival (filed > 30 days after delivery)
  if (daysFromDelivery > DEAD_DAYS) {
    await logDeadClaim({
      case_id:       c.case_id,
      merchant:      c.account_name,
      delivery_date: shipment.delivered_date,
      claim_date:    c.created_date,
      days_late:     daysFromDelivery - DEAD_DAYS,
      reason:        `Filed ${daysFromDelivery} days after delivery. Limit is ${DEAD_DAYS} days.`,
    })
    return {
      isDead: true, isInsured: false, isIncomplete: false,
      claimType: "unknown", claimedItems: [], missingFields: [],
      priorityTag: "LOW_VALUE", priorityReason: "Dead on arrival — not queued.",
      daysInQueue,
    }
  }

  // Gate: insured shipment
  if (shipment.is_insured) {
    await logInsuredClaim({
      case_id:     c.case_id,
      merchant:    c.account_name,
      shipment_id: shipment.shipment_id,
    })
    return {
      isDead: false, isInsured: true, isIncomplete: false,
      claimType: "unknown", claimedItems: [], missingFields: [],
      priorityTag: "STANDARD", priorityReason: "Insured shipment — routed to insured queue.",
      daysInQueue,
    }
  }

  // LLM metadata extraction
  const meta = await extractMetadata(c.description)

  // Missing fields check
  const missingFields = checkMissingFields(c, attachments, meta)
  if (missingFields.length > 0) {
    const emailBody = await sendIncompleteEmail(c, missingFields)
    await logIncompleteClaim({
      case_id:       c.case_id,
      merchant:      c.account_name,
      missing_fields: missingFields,
      email_sent:    true,
      email_body:    emailBody,
    })
    await logAutoEmail({
      case_id:  c.case_id,
      merchant: c.account_name,
      to_email: c.contact_email,
      subject:  `Action Required: Missing Information for Case #${c.case_number}`,
      body:     emailBody,
      reason:   "incomplete",
    })
    return {
      isDead: false, isInsured: false, isIncomplete: true,
      claimType: meta.claim_type, claimedItems: meta.claimed_items, missingFields,
      priorityTag: "STANDARD", priorityReason: "Incomplete — awaiting merchant response.",
      daysInQueue,
    }
  }

  // Priority assignment
  const invoiceTotal = invoice.line_items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const { tag, reason } = assignPriority(daysInQueue, invoiceTotal)

  return {
    isDead: false, isInsured: false, isIncomplete: false,
    claimType:    meta.claim_type,
    claimedItems: meta.claimed_items,
    missingFields: [],
    priorityTag:   tag,
    priorityReason: reason,
    daysInQueue,
  }
}

// ---------- Sort queue by priority ----------

const PRIORITY_ORDER: PriorityTag[] = ["URGENT", "AGING", "HIGH_VALUE", "STANDARD", "LOW_VALUE"]

export function sortByPriority<T extends { triage: TriageResult }>(claims: T[]): T[] {
  return [...claims].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.triage.priorityTag) - PRIORITY_ORDER.indexOf(b.triage.priorityTag)
  )
}
