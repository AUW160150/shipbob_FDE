"use client"

import { useState } from "react"
import type { ClaimSummary, ClaimLabel, PriorityDot } from "@/lib/types"
import ClaimDetail from "./ClaimDetail"

const DOT: Record<PriorityDot, string> = {
  red:    "bg-red-500",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green:  "bg-green-500",
}

const TRIAGE_DOT: Record<string, string> = {
  URGENT:     "bg-red-500",
  AGING:      "bg-red-500",
  HIGH_VALUE: "bg-red-500",
  STANDARD:   "bg-orange-400",
  LOW_VALUE:  "bg-yellow-400",
}

const TRIAGE_TAG_COLOR: Record<string, string> = {
  URGENT:     "text-red-600 bg-red-50",
  AGING:      "text-red-600 bg-red-50",
  HIGH_VALUE: "text-red-600 bg-red-50",
  STANDARD:   "text-gray-500 bg-gray-100",
  LOW_VALUE:  "text-gray-400 bg-gray-100",
}

const LABEL_TEXT: Record<ClaimLabel, string> = {
  HIGH_VALUE:       "High Value",
  READY_FOR_REVIEW: "Ready for Review",
  MISSING_EVIDENCE: "Missing Evidence",
  WAITING:          "Waiting on Client",
  EXPIRED:          "Expired",
  CLOSED:           "Closed",
  ADDRESSED:        "Addressed",
}

const LABEL_ORDER: ClaimLabel[] = [
  "HIGH_VALUE", "READY_FOR_REVIEW", "MISSING_EVIDENCE", "WAITING", "EXPIRED", "CLOSED"
]

function sorted(claims: ClaimSummary[]) {
  return [...claims].sort(
    (a, b) => LABEL_ORDER.indexOf(a.rulebook.label) - LABEL_ORDER.indexOf(b.rulebook.label)
  )
}

export default function ClaimsQueue({
  claims,
  onAddress,
}: {
  claims: ClaimSummary[]
  onAddress: (c: ClaimSummary) => void
}) {
  const list = claims // already sorted by triage priority in AppShell
  const [selected, setSelected] = useState<ClaimSummary>(list[0])

  const humanReview = list.filter((c) => c.rulebook.needsHumanReview)
  const mainQueue = list.filter((c) => !c.rulebook.needsHumanReview)

  function renderItem(claim: ClaimSummary) {
    const isSelected = selected?.case.case_id === claim.case.case_id
    const dot = TRIAGE_DOT[claim.triage.priorityTag] ?? DOT[claim.rulebook.priority]
    const tagColor = TRIAGE_TAG_COLOR[claim.triage.priorityTag] ?? "text-gray-400 bg-gray-100"
    return (
      <li key={claim.case.case_id}>
        <button
          onClick={() => setSelected(claim)}
          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
            isSelected ? "bg-blue-50 border-l-2 border-blue-500" : "border-l-2 border-transparent"
          }`}
        >
          <span className={`mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full ${dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {claim.case.account_name}
              </span>
              {claim.rulebook.recommendedAmount !== null && (
                <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  ${claim.rulebook.recommendedAmount.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-xs text-gray-400">{claim.case.case_id}</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${tagColor}`}>
                {claim.triage.priorityTag}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-xs text-gray-400">
                {new Date(claim.case.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="text-xs text-gray-400">{claim.triage.daysInQueue}d in queue</span>
            </div>
            {(claim.triage.priorityTag === "URGENT" || claim.triage.priorityTag === "AGING") && (
              <p className="text-xs text-red-500 mt-0.5 truncate">{claim.triage.priorityReason}</p>
            )}
          </div>
        </button>
      </li>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-y-auto">
        {/* Human review lane */}
        {humanReview.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-red-50 border-b border-red-100">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                ⚠ Needs Human Review ({humanReview.length})
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {humanReview.map(renderItem)}
            </ul>
          </div>
        )}

        {/* Main queue */}
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Queue ({mainQueue.length})
          </p>
        </div>
        <ul className="divide-y divide-gray-100 flex-1">
          {mainQueue.map(renderItem)}
        </ul>
      </aside>

      {/* Detail */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {selected && (
          <ClaimDetail
            key={selected.case.case_id}
            claim={selected}
            onAddress={onAddress}
          />
        )}
      </main>
    </div>
  )
}
