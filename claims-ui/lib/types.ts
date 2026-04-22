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

// Triage priority tags — assigned before rulebook processing
export type PriorityTag = "URGENT" | "AGING" | "HIGH_VALUE" | "STANDARD" | "LOW_VALUE"

export interface TriageResult {
  // Routing
  isDead: boolean          // filed > 30 days after delivery → Supabase dead_claims
  isInsured: boolean       // insured shipment → separate queue
  isIncomplete: boolean    // missing required fields → auto-email + Supabase

  // Classification
  claimType: string        // e.g. "product_damage", "missing_item", "wrong_item"
  claimedItems: string[]   // items mentioned in description
  missingFields: string[]  // which fields triggered isIncomplete

  // Queue
  priorityTag: PriorityTag
  priorityReason: string
  daysInQueue: number      // days since case created_date
}

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

export interface ItemVisionResult {
  claimedItemName: string
  invoiceMatch: { name: string; sku: string; unit_price: number } | null
  verified: boolean
  damage_visible: number
  product_identifiable: number
  packaging_present: number
  claim_coherent: number
  customer_confirmation_present: number
  verifiedAmount: number  // invoice price if verified, else 0
}

export interface MultiItemVisionOutput {
  items: ItemVisionResult[]
  packagingHardGatePassed: boolean     // max packaging_present >= 0.4
  totalVerifiedAmount: number           // sum of verifiedAmount, capped at 100
  overallCustomerConfirmation: number   // max across items
}

export interface PipelineStep {
  name: string
  status: "pass" | "warn" | "skip" | "fail"
  summary: string
  details: string[]
  durationMs: number
}

export interface PipelineTrace {
  steps: PipelineStep[]
  totalDurationMs: number
}

export interface AccountLineItem {
  itemName: string
  sku: string
  invoicePrice: number
  approvedAmount: number  // may be prorated if subtotal > $100
}

export interface AccountOutput {
  lineItems: AccountLineItem[]
  subtotal: number       // sum before cap
  totalAmount: number    // capped at $100
  prorated: boolean
  draftEmail: string
}

export interface ValidationCheck {
  name: string
  passed: boolean
  detail: string
}

export interface ValidationOutput {
  checks: ValidationCheck[]
  flags: string[]
  verdict: "pass" | "warn" | "fail"
}

export interface ClaimSummary {
  case: Case
  shipment: Shipment
  order: Order
  invoice: Invoice
  attachments: Attachment[]
  rulebook: RulebookResult
  triage: TriageResult
}
