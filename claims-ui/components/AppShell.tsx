"use client"

import { useState } from "react"
import type { ClaimSummary } from "@/lib/types"
import ClaimsQueue from "./ClaimsQueue"
import Dashboard from "./Dashboard"
import ReviewedPanel from "./ReviewedPanel"

type Tab = "queue" | "dashboard" | "reviewed"

export default function AppShell({ claims }: { claims: ClaimSummary[] }) {
  const [tab, setTab] = useState<Tab>("queue")
  const [addressed, setAddressed] = useState<ClaimSummary[]>([])

  function handleAddress(claim: ClaimSummary) {
    setAddressed((prev) => {
      if (prev.find((c) => c.case.case_id === claim.case.case_id)) return prev
      return [...prev, { ...claim, rulebook: { ...claim.rulebook, label: "ADDRESSED", priority: "green" } }]
    })
  }

  const queueClaims = claims.filter(
    (c) => !addressed.find((a) => a.case.case_id === c.case.case_id) && c.rulebook.label !== "CLOSED"
  )
  const closedClaims = claims.filter((c) => c.rulebook.label === "CLOSED")
  const reviewedClaims = [...addressed, ...closedClaims]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Top nav */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900 tracking-tight">ShipBob</span>
          <span className="text-gray-300">/</span>
          <span className="text-base font-medium text-gray-500">Claims</span>
        </div>
        <nav className="flex gap-1">
          {(["queue", "dashboard", "reviewed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {t === "reviewed" ? `Reviewed${reviewedClaims.length > 0 ? ` (${reviewedClaims.length})` : ""}` : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === "queue" && queueClaims.filter((c) => c.rulebook.needsHumanReview).length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {queueClaims.filter((c) => c.rulebook.needsHumanReview).length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "queue" && <ClaimsQueue claims={queueClaims} onAddress={handleAddress} />}
        {tab === "dashboard" && <Dashboard allClaims={claims} addressed={addressed} />}
        {tab === "reviewed" && <ReviewedPanel claims={reviewedClaims} />}
      </div>
    </div>
  )
}
