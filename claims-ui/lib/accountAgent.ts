import type { Case, ItemVisionResult, AccountLineItem, AccountOutput } from "./types"
import { orChat } from "./llm"

const MAX_REIMBURSEMENT = 100

function buildLineItems(verifiedItems: ItemVisionResult[]): AccountLineItem[] {
  const eligible = verifiedItems.filter((i) => i.verified && i.invoiceMatch && i.invoiceMatch.unit_price > 0)

  const subtotal = eligible.reduce((s, i) => s + (i.invoiceMatch?.unit_price ?? 0), 0)
  const prorated = subtotal > MAX_REIMBURSEMENT

  return eligible.map((i) => {
    const invoicePrice = i.invoiceMatch!.unit_price
    const approvedAmount = prorated
      ? parseFloat(((invoicePrice / subtotal) * MAX_REIMBURSEMENT).toFixed(2))
      : invoicePrice
    return {
      itemName:       i.invoiceMatch!.name,
      sku:            i.invoiceMatch!.sku,
      invoicePrice,
      approvedAmount,
    }
  })
}

async function buildEmail(c: Case, lineItems: AccountLineItem[], totalAmount: number, prorated: boolean): Promise<string> {
  const itemList = lineItems
    .map((l) => `- ${l.itemName} (SKU: ${l.sku}): $${l.approvedAmount.toFixed(2)}`)
    .join("\n")

  const prorateNote = prorated
    ? `Note: total invoice value exceeded our $${MAX_REIMBURSEMENT} per-claim cap. Amounts above have been prorated accordingly.`
    : ""

  const prompt = `Write a professional 4–6 sentence email approving a damaged-in-transit reimbursement claim.

Merchant: ${c.account_name}
Case number: ${c.case_number}
Shipment: ${c.shipment_id}
Contact: ${c.contact_email}

Approved items:
${itemList}

Total approved: $${totalAmount.toFixed(2)}
${prorateNote}

The email must:
- Thank the merchant for their patience
- State that the claim has been approved
- List each approved item and its amount
- State the total reimbursement amount
- Mention the 5–7 business day processing time
- Be signed by ShipBob Merchant Care`

  return orChat("google/gemini-2.5-flash", [
    { role: "system", content: "You write professional merchant support emails for ShipBob. Return only the email body, no subject line." },
    { role: "user", content: prompt },
  ], false, 512)
}

export async function runAccountAgent(
  verifiedItems: ItemVisionResult[],
  c: Case
): Promise<AccountOutput> {
  const lineItems = buildLineItems(verifiedItems)

  if (lineItems.length === 0) {
    return {
      lineItems: [],
      subtotal: 0,
      totalAmount: 0,
      prorated: false,
      draftEmail: "",
    }
  }

  const subtotal = lineItems.reduce((s, l) => s + l.invoicePrice, 0)
  const totalAmount = lineItems.reduce((s, l) => s + l.approvedAmount, 0)
  const prorated = subtotal > MAX_REIMBURSEMENT

  const draftEmail = await buildEmail(c, lineItems, totalAmount, prorated)

  return { lineItems, subtotal, totalAmount, prorated, draftEmail }
}
