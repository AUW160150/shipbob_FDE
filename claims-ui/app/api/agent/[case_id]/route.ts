import { NextRequest, NextResponse } from "next/server"
import { getCase, getAttachments, getShipment, getInvoice } from "@/lib/sample-data"
import { runRulebook } from "@/lib/rulebook"
import { runTriage } from "@/lib/triage"
import { runAgent } from "@/lib/agent"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ case_id: string }> }
) {
  const { case_id } = await params

  const c = getCase(case_id)
  if (!c) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 })
  }

  const [shipment, attachments, invoice] = await Promise.all([
    Promise.resolve(getShipment(c.shipment_id)),
    Promise.resolve(getAttachments(case_id)),
    Promise.resolve(getInvoice(case_id)),
  ])

  if (!shipment || !invoice) {
    return NextResponse.json({ error: "Missing shipment or invoice data" }, { status: 500 })
  }

  try {
    const [baseRulebook, triage] = await Promise.all([
      Promise.resolve(runRulebook(c, shipment, attachments, invoice)),
      runTriage(c, shipment, attachments, invoice),
    ])

    const analysis = await runAgent(c, shipment, attachments, invoice, baseRulebook, triage)
    const updatedRulebook = { ...baseRulebook, ...analysis.updatedRulebook }

    return NextResponse.json({
      case_id,
      caseSummary: analysis.caseSummary,
      vision: analysis.vision,
      multiItemVision: analysis.multiItemVision,
      accountOutput: analysis.accountOutput,
      validationOutput: analysis.validationOutput,
      decision: analysis.decision,
      judge: analysis.judge,
      feedbackApplied: analysis.feedbackApplied,
      rulebook: updatedRulebook,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[agent route]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
