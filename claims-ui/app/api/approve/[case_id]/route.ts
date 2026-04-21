import { NextRequest, NextResponse } from "next/server"

const MOCK_BASE = "https://e41238c7-aefe-4d20-8866-747c74eac48f.mock.pstmn.io"

interface ApproveBody {
  email_to: string
  email_subject: string
  email_body: string
  order_id: string
  user_id: string
  shipment_id: string
  product_name: string
  amount: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ case_id: string }> }
) {
  const { case_id } = await params
  const body: ApproveBody = await req.json()

  try {
    const [emailRes, reimbursementRes] = await Promise.all([
      fetch(`${MOCK_BASE}/cases/${case_id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: body.email_to,
          subject: body.email_subject,
          body: body.email_body,
        }),
      }),
      fetch(`${MOCK_BASE}/reimbursements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id,
          order_id: body.order_id,
          user_id: body.user_id,
          shipment_id: body.shipment_id,
          product_name: body.product_name,
          amount: body.amount,
        }),
      }),
    ])

    const emailData = await emailRes.json().catch(() => ({ success: false }))
    const reimbursementData = await reimbursementRes.json().catch(() => ({}))

    if (!emailRes.ok || !reimbursementRes.ok) {
      return NextResponse.json(
        { error: "One or more upstream calls failed", emailData, reimbursementData },
        { status: 502 }
      )
    }

    return NextResponse.json({
      email: emailData,
      reimbursement: reimbursementData,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[approve route]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
