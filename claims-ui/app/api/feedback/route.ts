import { NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"

const FEEDBACK_FILE = path.join(process.cwd(), "..", "sample", "feedback.json")

export interface FeedbackEntry {
  merchant: string
  case_id: string
  timestamp: string
  override_reason?: string
  email_was_edited: boolean
  reimbursement_amount: number
  product_name: string
  recommendation: string
}

function readAll(): FeedbackEntry[] {
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf-8")) as FeedbackEntry[]
  } catch {
    return []
  }
}

function writeAll(entries: FeedbackEntry[]) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(entries, null, 2))
}

export async function POST(req: NextRequest) {
  const entry: FeedbackEntry = await req.json()
  const entries = readAll()
  entries.push({ ...entry, timestamp: new Date().toISOString() })
  writeAll(entries)
  return NextResponse.json({ saved: true })
}

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get("merchant")
  const all = readAll()
  const filtered = merchant ? all.filter((e) => e.merchant === merchant) : all
  return NextResponse.json(filtered)
}
