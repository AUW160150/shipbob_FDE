import { createClient } from "@supabase/supabase-js"

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ""
const key  = process.env.SUPABASE_SERVICE_KEY       ?? ""
const ready = url !== "" && key !== ""

export const supabase = ready ? createClient(url, key) : null

function warn(fn: string) {
  console.warn(`[supabase] ${fn} skipped — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY not set`)
}

// ---------- Dead claims ----------

export async function logDeadClaim(data: {
  case_id: string
  merchant: string
  delivery_date: string
  claim_date: string
  days_late: number
  reason: string
}) {
  if (!supabase) { warn("logDeadClaim"); return }
  const { error } = await supabase.from("dead_claims").insert(data)
  if (error) console.error("[supabase] logDeadClaim:", error.message)
}

// ---------- Insured claims ----------

export async function logInsuredClaim(data: {
  case_id: string
  merchant: string
  shipment_id: string
}) {
  if (!supabase) { warn("logInsuredClaim"); return }
  const { error } = await supabase.from("insured_claims").insert(data)
  if (error) console.error("[supabase] logInsuredClaim:", error.message)
}

// ---------- Incomplete claims ----------

export async function logIncompleteClaim(data: {
  case_id: string
  merchant: string
  missing_fields: string[]
  email_sent: boolean
  email_body: string
}) {
  if (!supabase) { warn("logIncompleteClaim"); return }
  const { error } = await supabase.from("incomplete_claims").insert(data)
  if (error) console.error("[supabase] logIncompleteClaim:", error.message)
}

// ---------- Auto-email log ----------

export async function logAutoEmail(data: {
  case_id: string
  merchant: string
  to_email: string
  subject: string
  body: string
  reason: string        // "incomplete" | "missing_evidence" | "waiting"
  flagged_by_human?: boolean
  flag_note?: string
}) {
  if (!supabase) { warn("logAutoEmail"); return }
  const { error } = await supabase.from("auto_emails_log").insert(data)
  if (error) console.error("[supabase] logAutoEmail:", error.message)
}

// ---------- Waiting claims (missing evidence, email sent to merchant) ----------

export async function logWaitingClaim(data: {
  case_id: string
  case_number?: string
  account_name?: string
  missing_evidence: string[]
}) {
  if (!supabase) { warn("logWaitingClaim"); return }
  const { error } = await supabase.from("waiting_claims").insert(data)
  if (error) console.error("[supabase] logWaitingClaim:", error.message)
}
