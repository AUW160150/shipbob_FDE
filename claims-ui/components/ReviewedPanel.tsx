"use client"

import { useState } from "react"
import type { ClaimSummary } from "@/lib/types"
import ClaimDetail from "./ClaimDetail"

export default function ReviewedPanel({ claims }: { claims: ClaimSummary[] }) {
  const [selected, setSelected] = useState<ClaimSummary | null>(claims[0] ?? null)

  if (claims.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-300">No reviewed cases yet</p>
          <p className="text-base text-gray-400 mt-2">Cases approved or closed will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Reviewed ({claims.length})
          </p>
        </div>
        <ul className="divide-y divide-gray-100">
          {claims.map((claim) => {
            const isSelected = selected?.case.case_id === claim.case.case_id
            return (
              <li key={claim.case.case_id}>
                <button
                  onClick={() => setSelected(claim)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                    isSelected ? "bg-blue-50 border-l-2 border-blue-500" : "border-l-2 border-transparent"
                  }`}
                >
                  <span className="mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500" />
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
                      <span className="text-xs text-green-600 font-medium">
                        {claim.rulebook.label === "ADDRESSED" ? "Addressed" : "Closed"}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(claim.case.created_date).toLocaleDateString("en-US", {
                        month: "short", day: "numeric",
                      })}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* Detail — read-only view */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {selected && <ClaimDetail key={selected.case.case_id} claim={selected} />}
      </main>
    </div>
  )
}
