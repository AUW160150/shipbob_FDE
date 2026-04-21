import { getCases, getCase, getAttachments, getShipment, getOrder, getInvoice } from "@/lib/sample-data"
import { runRulebook } from "@/lib/rulebook"
import type { ClaimSummary } from "@/lib/types"
import AppShell from "@/components/AppShell"

export default function Home() {
  const cases = getCases()

  const summaries: ClaimSummary[] = cases.map((c) => {
    const detail = getCase(c.case_id)
    const attachments = getAttachments(c.case_id)
    const shipment = getShipment(detail.shipment_id)
    const order = getOrder(detail.order_id)
    const invoice = getInvoice(c.case_id)
    const rulebook = runRulebook(detail, shipment, attachments, invoice)
    return { case: detail, shipment, order, invoice, attachments, rulebook }
  })

  return <AppShell claims={summaries} />
}
