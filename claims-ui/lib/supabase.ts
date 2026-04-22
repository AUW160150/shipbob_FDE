import { createClient } from "@supabase/supabase-js"

const url  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "").trim()
const key  = (process.env.SUPABASE_SERVICE_KEY       ?? "").trim()
const ready = url !== "" && key !== ""

export const supabase = ready ? createClient(url, key) : null

function warn(fn: string) {
  console.warn(`[supabase] ${fn} skipped — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY not set`)
}

// Column names below match supabase/schema.sql exactly.

export async function logDeadClaim(data: {
  case_id: string
  case_number?: string
  account_name?: string
  delivered_date?: string
  filed_date?: string
  days_late?: number
  reason?: string
}) {
  if (!supabase) { warn("logDeadClaim"); return }
  const { error } = await supabase.from("dead_claims").insert(data)
  if (error) console.error("[supabase] logDeadClaim:", error.message)
}

export async function logInsuredClaim(data: {
  case_id: string
  case_number?: string
  account_name?: string
  carrier?: string
  tracking_number?: string
  shipment_id?: string
}) {
  if (!supabase) { warn("logInsuredClaim"); return }
  const { error } = await supabase.from("insured_claims").insert(data)
  if (error) console.error("[supabase] logInsuredClaim:", error.message)
}

export async function logIncompleteClaim(data: {
  case_id: string
  case_number?: string
  account_name?: string
  missing_fields?: string[]
  email_sent_at?: string
}) {
  if (!supabase) { warn("logIncompleteClaim"); return }
  const { error } = await supabase.from("incomplete_claims").insert(data)
  if (error) console.error("[supabase] logIncompleteClaim:", error.message)
}

export async function logAutoEmail(data: {
  case_id: string
  case_number?: string
  email_type?: string   // "incomplete_claim" | "missing_evidence"
  recipient?: string
  status?: string       // "sent" | "error"
  error?: string
}) {
  if (!supabase) { warn("logAutoEmail"); return }
  const { error } = await supabase.from("auto_emails_log").insert(data)
  if (error) console.error("[supabase] logAutoEmail:", error.message)
}

export async function logWaitingClaim(data: {
  case_id: string
  case_number?: string
  account_name?: string
  missing_evidence?: string[]
  email_sent_at?: string
}) {
  if (!supabase) { warn("logWaitingClaim"); return }
  const { error } = await supabase.from("waiting_claims").insert(data)
  if (error) console.error("[supabase] logWaitingClaim:", error.message)
}
