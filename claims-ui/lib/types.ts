export interface Case {
  case_id: string
  case_number: string
  status: string
  origin: string
  sub_category: string
  subject: string
  description: string
  order_id: string
  user_id: string
  shipment_id: string
  delivered_date: string
  contact_email: string
  account_name: string
  created_date: string
}

export interface Attachment {
  attachment_id: string
  file_name: string
  content_type: string
  url: string
}

export interface LineItem {
  product_id: string
  name: string
  sku: string
  quantity: number
  unit_price: number
}

export interface Shipment {
  shipment_id: string
  order_id: string
  carrier: string
  tracking_number: string
  status: string
  delivered_date: string
  is_insured: boolean
}

export interface Order {
  order_id: string
  user_id: string
  line_items: LineItem[]
  created_date: string
}

export interface Invoice {
  invoice_id: string
  shipment_id: string
  line_items: LineItem[]
  generated_at: string
}

export type ClaimLabel =
  | "EXPIRED"
  | "MISSING_EVIDENCE"
  | "READY_FOR_REVIEW"
  | "HIGH_VALUE"
  | "CLOSED"
  | "WAITING"
  | "ADDRESSED"

export type PriorityDot = "red" | "orange" | "yellow" | "green"

export interface GateResult {
  passed: boolean
  reason: string
  confidence: number // 0–1
}

export interface RulebookResult {
  label: ClaimLabel
  priority: PriorityDot
  eligibility: GateResult
  evidence: GateResult
  decision: GateResult | null
  overallConfidence: number // 0–1
  needsHumanReview: boolean
  recommendedAmount: number | null
  draftEmail: string | null
}

export interface ClaimSummary {
  case: Case
  shipment: Shipment
  order: Order
  invoice: Invoice
  attachments: Attachment[]
  rulebook: RulebookResult
}
