"use client"

import { useState, useRef } from "react"
import type { ClaimSummary, ClaimLabel, GateResult, RulebookResult, ItemVisionResult, MultiItemVisionOutput } from "@/lib/types"

const LABEL_META: Record<ClaimLabel, { text: string; color: string }> = {
  READY_FOR_REVIEW: { text: "Ready for Review", color: "bg-blue-100 text-blue-800" },
  HIGH_VALUE:       { text: "High Value",        color: "bg-red-100 text-red-700" },
  MISSING_EVIDENCE: { text: "Missing Evidence",  color: "bg-yellow-100 text-yellow-800" },
  WAITING:          { text: "Waiting on Client", color: "bg-yellow-100 text-yellow-800" },
  EXPIRED:          { text: "Expired",           color: "bg-gray-100 text-gray-500" },
  CLOSED:           { text: "Closed",            color: "bg-gray-100 text-gray-500" },
  ADDRESSED:        { text: "Addressed",         color: "bg-green-100 text-green-700" },
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right truncate">{value}</span>
    </div>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? "bg-green-500" : pct >= 70 ? "bg-yellow-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function GateRow({ label, result }: { label: string; result: GateResult | null }) {
  if (!result) return null
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
          result.passed ? "bg-green-500" : "bg-red-400"
        }`}>
          {result.passed ? "✓" : "✗"}
        </span>
        <span className="text-sm font-semibold text-gray-700">{label}</span>
      </div>
      <p className="text-sm text-gray-500 ml-6">{result.reason}</p>
      <div className="ml-6">
        <ConfidenceBar value={result.confidence} />
      </div>
    </div>
  )
}

interface JudgeResult {
  consistent: boolean
  flags: string[]
  judge_confidence: number
  verdict: "pass" | "warn" | "fail"
}

interface AgentResult {
  caseSummary: string
  vision: {
    damage_visible: number
    product_identifiable: number
    packaging_present: number
    claim_coherent: number
    customer_confirmation_present: number
    damaged_item_name: string
    damaged_item_price: number
  } | null
  multiItemVision: MultiItemVisionOutput | null
  decision: {
    recommendation: "approve" | "deny" | "request_more_info"
    confidence: number
    reasoning: string
    recommended_amount: number | null
    draft_email: string
  } | null
  judge: JudgeResult | null
  feedbackApplied: boolean
  rulebook: RulebookResult
}

function ItemVerificationRow({ item }: { item: ItemVisionResult }) {
  const statusColor = item.verified
    ? "bg-green-50 border-green-200"
    : "bg-red-50 border-red-200"
  const statusBadge = item.verified
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-600"

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}>
            {item.verified ? "Verified" : "Unverified"}
          </span>
          <span className="text-sm font-medium text-gray-800">{item.claimedItemName}</span>
        </div>
        <div className="text-right">
          {item.invoiceMatch ? (
            <span className="text-xs text-gray-500">
              Invoice: <span className="font-semibold text-gray-700">${item.invoiceMatch.unit_price.toFixed(2)}</span>
              {" "}· {item.invoiceMatch.sku}
            </span>
          ) : (
            <span className="text-xs text-red-500">Not on invoice</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {([
          ["Damage Visible",        item.damage_visible],
          ["Product Identifiable",  item.product_identifiable],
          ["Packaging Present",     item.packaging_present],
          ["Claim Coherent",        item.claim_coherent],
        ] as [string, number][]).map(([label, score]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</span>
            <div className="flex-1 h-1 bg-white/60 rounded-full overflow-hidden border border-black/10">
              <div
                className={`h-full rounded-full ${score >= 0.7 ? "bg-green-500" : score >= 0.5 ? "bg-yellow-400" : "bg-red-400"}`}
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-600 w-7 text-right">{Math.round(score * 100)}%</span>
          </div>
        ))}
      </div>
      {item.verified && item.verifiedAmount > 0 && (
        <p className="text-xs text-green-700 font-medium">+${item.verifiedAmount.toFixed(2)} added to reimbursement</p>
      )}
    </div>
  )
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [origin, setOrigin] = useState("50% 50%")
  const imgRef = useRef<HTMLImageElement>(null)

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.005)))
  }

  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setOrigin(`${x}% ${y}%`)
    setZoom((z) => (z > 1 ? 1 : 2.5))
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="relative overflow-hidden rounded-xl max-h-full max-w-full"
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: zoom > 1 ? "zoom-out" : "zoom-in" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt="Attachment"
          onClick={handleImgClick}
          className="max-h-[80vh] max-w-[90vw] rounded-xl shadow-2xl transition-transform duration-150 select-none"
          style={{ transform: `scale(${zoom})`, transformOrigin: origin }}
        />
      </div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <span className="text-white/60 text-xs">Scroll or click to zoom</span>
        <span className="text-white text-xs font-semibold bg-white/10 px-2 py-1 rounded">{Math.round(zoom * 100)}%</span>
        {zoom > 1 && (
          <button onClick={() => setZoom(1)} className="text-white/70 text-xs hover:text-white underline">Reset</button>
        )}
      </div>
      <button
        className="absolute top-5 right-5 text-white text-3xl font-light hover:text-gray-300"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  )
}

export default function ClaimDetail({
  claim,
  onAddress,
}: {
  claim: ClaimSummary
  onAddress?: (c: ClaimSummary) => void
}) {
  const { case: c, shipment, invoice, attachments } = claim
  const [rulebook, setRulebook] = useState(claim.rulebook)
  const [email, setEmail] = useState(claim.rulebook.draftEmail ?? "")
  const [submitted, setSubmitted] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideReason, setOverrideReason] = useState("")
  const [overridden, setOverridden] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approveResult, setApproveResult] = useState<{ reimbursement_id?: string; error?: string } | null>(null)
  const meta = LABEL_META[rulebook.label]
  const overallPct = Math.round(rulebook.overallConfidence * 100)
  const humanReviewActive = rulebook.needsHumanReview && !overridden

  async function handleRunAgent() {
    setAgentRunning(true)
    setAgentError(null)
    try {
      const res = await fetch(`/api/agent/${c.case_id}`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Agent returned ${res.status}`)
      }
      const data: AgentResult = await res.json()
      setAgentResult(data)
      setRulebook(data.rulebook)
      if (data.rulebook.draftEmail) setEmail(data.rulebook.draftEmail)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setAgentRunning(false)
    }
  }

  function handleOverride() {
    if (!overrideReason.trim()) return
    setOverridden(true)
    setOverrideMode(false)
  }

  async function handleApprove() {
    setApproving(true)
    const originalDraft = claim.rulebook.draftEmail ?? ""
    const emailWasEdited = email.trim() !== originalDraft.trim()
    const productName = agentResult?.vision?.damaged_item_name ?? ""
    const amount = rulebook.recommendedAmount ?? 0

    try {
      const res = await fetch(`/api/approve/${c.case_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_to: c.contact_email,
          email_subject: `Re: Your Damaged-in-Transit Claim #${c.case_number}`,
          email_body: email,
          order_id: claim.order.order_id,
          user_id: claim.case.user_id,
          shipment_id: claim.shipment.shipment_id,
          product_name: productName,
          amount,
        }),
      })
      const data = await res.json()
      setApproveResult({ reimbursement_id: data.reimbursement?.reimbursement_id, error: data.error })

      // Save feedback for future agent runs
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: c.account_name,
          case_id: c.case_id,
          override_reason: overridden ? overrideReason : undefined,
          email_was_edited: emailWasEdited,
          reimbursement_amount: amount,
          product_name: productName,
          recommendation: agentResult?.decision?.recommendation ?? "approve",
        }),
      })

      setSubmitted(true)
      onAddress?.({ ...claim, rulebook })
    } catch (err) {
      setApproveResult({ error: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      setApproving(false)
    }
  }

  const judgeColors = {
    pass: "bg-green-50 border-green-200 text-green-800",
    warn: "bg-yellow-50 border-yellow-200 text-yellow-800",
    fail: "bg-red-50 border-red-200 text-red-700",
  }

  return (
    <>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900">{c.account_name}</h2>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${meta.color}`}>
                {meta.text}
              </span>
              {humanReviewActive && (
                <span className="text-sm font-medium px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                  ⚠ Human Review Required
                </span>
              )}
              {overridden && (
                <span className="text-sm font-medium px-3 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                  Manually Overridden
                </span>
              )}
            </div>
            <p className="text-base text-gray-500 mt-1">
              {c.case_id} · Case #{c.case_number} · Filed{" "}
              {new Date(c.created_date).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            </p>
          </div>
          {rulebook.recommendedAmount !== null && (
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">
                ${rulebook.recommendedAmount.toFixed(2)}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">recommended</p>
            </div>
          )}
        </div>

        {/* Case info + description */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Case Info</h3>
            <InfoRow label="Contact" value={c.contact_email} />
            <InfoRow label="Carrier" value={shipment.carrier} />
            <InfoRow label="Tracking" value={shipment.tracking_number} />
            <InfoRow
              label="Delivered"
              value={new Date(c.delivered_date).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            />
            <InfoRow label="Insured" value={shipment.is_insured ? "Yes" : "No"} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Merchant Description
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">{c.description}</p>
          </div>
        </div>

        {/* Invoice */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Invoice — {invoice.invoice_id}
          </h3>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left pb-2.5 font-medium">Product</th>
                <th className="text-left pb-2.5 font-medium">SKU</th>
                <th className="text-right pb-2.5 font-medium">Qty</th>
                <th className="text-right pb-2.5 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.line_items.map((item) => (
                <tr key={item.product_id}>
                  <td className="py-2.5 text-sm text-gray-800">{item.name}</td>
                  <td className="py-2.5 text-sm text-gray-400 font-mono">{item.sku}</td>
                  <td className="py-2.5 text-sm text-right text-gray-600">{item.quantity}</td>
                  <td className="py-2.5 text-sm text-right font-semibold text-gray-800">
                    ${item.unit_price.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Attachments */}
        {attachments.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Attachments ({attachments.length})
            </h3>
            <p className="text-xs text-gray-400 mb-4">Click to open · Scroll or click image to zoom</p>
            <div className="flex gap-3 flex-wrap">
              {attachments.map((att) => (
                <button
                  key={att.attachment_id}
                  onClick={() => setLightbox(att.url)}
                  className="group relative w-28 h-28 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 hover:border-blue-400 hover:shadow-md transition-all cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.file_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-xl transition-opacity">⊕</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 px-2 py-1.5">
                    <p className="text-white text-[10px] truncate">{att.file_name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
            No attachments submitted. Photos of the damaged product and packaging are required to process this claim.
          </div>
        )}

        {/* Agent Analysis */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Agent Analysis
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Overall confidence</span>
                <span className={`text-sm font-bold ${
                  overallPct >= 80 ? "text-green-600" : overallPct >= 70 ? "text-yellow-600" : "text-red-500"
                }`}>
                  {overallPct}%
                </span>
              </div>
              {!agentResult && (
                <button
                  onClick={handleRunAgent}
                  disabled={agentRunning}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {agentRunning ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    "Run AI Analysis"
                  )}
                </button>
              )}
              {agentResult && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">AI analyzed</span>
                  {agentResult.feedbackApplied && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-md">Prior feedback applied</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {agentError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Agent error: {agentError}
            </div>
          )}

          {agentResult?.caseSummary && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Case Summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{agentResult.caseSummary}</p>
            </div>
          )}

          {agentResult?.multiItemVision && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Per-Item Vision Analysis</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-indigo-400">gemini-2.5-flash</span>
                  {!agentResult.multiItemVision.packagingHardGatePassed && (
                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Packaging gate failed</span>
                  )}
                  {agentResult.multiItemVision.overallCustomerConfirmation >= 0.5 && (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Customer confirmation detected</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {agentResult.multiItemVision.items.map((item, i) => (
                  <ItemVerificationRow key={i} item={item} />
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-indigo-100">
                <span className="text-xs text-gray-500">
                  {agentResult.multiItemVision.items.filter((i) => i.verified).length} of {agentResult.multiItemVision.items.length} item(s) verified
                </span>
                <span className="text-sm font-bold text-gray-800">
                  Total: ${agentResult.multiItemVision.totalVerifiedAmount.toFixed(2)}
                  <span className="text-xs font-normal text-gray-400 ml-1">(capped at $100)</span>
                </span>
              </div>
            </div>
          )}

          {/* Judge evaluation */}
          {agentResult?.judge && (
            <div className={`p-3 rounded-lg border text-sm space-y-2 ${judgeColors[agentResult.judge.verdict]}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Judge Evaluation — {agentResult.judge.verdict.toUpperCase()}
                </p>
                <span className="text-xs font-medium">
                  Judge confidence: {Math.round(agentResult.judge.judge_confidence * 100)}%
                </span>
              </div>
              {agentResult.judge.flags.length > 0 ? (
                <ul className="space-y-1">
                  {agentResult.judge.flags.map((f, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <span className="mt-0.5">⚑</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs">No inconsistencies detected — decision is well-supported by evidence.</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <GateRow label="Eligibility" result={rulebook.eligibility} />
            <GateRow label="Evidence" result={rulebook.evidence} />
            <GateRow label="Decision" result={rulebook.decision} />
          </div>

          {/* Human review block */}
          {humanReviewActive && (
            <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
              <p className="text-sm text-red-700">
                ⚠ Confidence below 70% — flagged for human review before proceeding.
              </p>
              {!overrideMode ? (
                <button
                  onClick={() => setOverrideMode(true)}
                  className="text-sm font-semibold text-red-700 underline hover:text-red-900"
                >
                  I have reviewed this case — override and proceed
                </button>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-red-700 block">
                    Reason for override (required)
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. Photos clearly show damaged item despite low confidence score…"
                    rows={3}
                    className="w-full text-sm border border-red-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleOverride}
                      disabled={!overrideReason.trim()}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirm Override
                    </button>
                    <button
                      onClick={() => { setOverrideMode(false); setOverrideReason("") }}
                      className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {overridden && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
              Override recorded: &ldquo;{overrideReason}&rdquo;
            </div>
          )}
        </div>

        {/* Draft Email */}
        {email && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Draft Email
              </h3>
              <span className="text-sm text-gray-400">To: {c.contact_email}</span>
            </div>
            {submitted ? (
              <div className="space-y-2">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-base text-green-800 font-medium">
                  ✓ Email sent and reimbursement submitted successfully.
                </div>
                {approveResult?.reimbursement_id && (
                  <p className="text-sm text-gray-500">
                    Reimbursement ID: <span className="font-mono font-semibold text-gray-800">{approveResult.reimbursement_id}</span>
                  </p>
                )}
                {approveResult?.error && (
                  <p className="text-sm text-red-500">Note: {approveResult.error}</p>
                )}
              </div>
            ) : (
              <>
                <textarea
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  rows={12}
                  className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl p-4 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
                <div className="flex gap-3 items-center">
                  <button
                    onClick={handleApprove}
                    disabled={humanReviewActive || approving}
                    className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {approving ? (
                      <>
                        <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      "Approve & Send"
                    )}
                  </button>
                  <button
                    onClick={() => setEmail(rulebook.draftEmail ?? "")}
                    className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Reset Draft
                  </button>
                </div>
                {humanReviewActive && (
                  <p className="text-sm text-red-500">
                    Sending is disabled until the human review flag is resolved.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
