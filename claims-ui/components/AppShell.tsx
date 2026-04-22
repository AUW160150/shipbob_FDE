"use client"

import { useState } from "react"
import type { ClaimSummary } from "@/lib/types"
import { sortByPriority } from "@/lib/sort"
import ClaimsQueue from "./ClaimsQueue"
import Dashboard from "./Dashboard"
import ReviewedPanel from "./ReviewedPanel"
import InsuredQueue from "./InsuredQueue"

type Tab = "queue" | "dashboard" | "reviewed" | "insured"

const PRIORITY_DOT: Record<string, string> = {
  URGENT:     "bg-red-500",
  AGING:      "bg-red-500",
  HIGH_VALUE: "bg-red-500",
  STANDARD:   "bg-orange-400",
  LOW_VALUE:  "bg-yellow-400",
}

export { PRIORITY_DOT }

export default function AppShell({ claims }: { claims: ClaimSummary[] }) {
  const [tab, setTab] = useState<Tab>("queue")
  const [addressed, setAddressed] = useState<ClaimSummary[]>([])

  function handleAddress(claim: ClaimSummary) {
    setAddressed((prev) => {
      if (prev.find((c) => c.case.case_id === claim.case.case_id)) return prev
      return [...prev, { ...claim, rulebook: { ...claim.rulebook, label: "ADDRESSED", priority: "green" } }]
    })
  }

  // Route claims by triage result
  const insuredClaims  = claims.filter((c) => c.triage.isInsured)
  const deadClaims     = claims.filter((c) => c.triage.isDead)         // logged to Supabase, not shown
  const incompleteClaims = claims.filter((c) => c.triage.isIncomplete) // auto-emailed, shown as WAITING

  const activeClaims = claims.filter(
    (c) => !c.triage.isDead && !c.triage.isInsured && c.rulebook.label !== "CLOSED"
  )

  const addressedIds = new Set(addressed.map((a) => a.case.case_id))
  const queueClaims  = sortByPriority(
    activeClaims.filter((c) => !addressedIds.has(c.case.case_id))
  )
  const closedClaims   = claims.filter((c) => c.rulebook.label === "CLOSED")
  const reviewedClaims = [...addressed, ...closedClaims]

  const humanReviewCount = queueClaims.filter((c) => c.rulebook.needsHumanReview).length

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Top nav */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900 tracking-tight">ShipBob</span>
          <span className="text-gray-300">/</span>
          <span className="text-base font-medium text-gray-500">Claims</span>
        </div>

        {/* Triage summary strip */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {deadClaims.length > 0 && (
            <span className="bg-gray-100 px-2 py-1 rounded">{deadClaims.length} dead</span>
          )}
          {incompleteClaims.length > 0 && (
            <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded">{incompleteClaims.length} incomplete — emailed</span>
          )}
        </div>

        <nav className="flex gap-1">
          {(["queue", "dashboard", "reviewed", "insured"] as Tab[]).map((t) => {
            let label = t.charAt(0).toUpperCase() + t.slice(1)
            if (t === "reviewed" && reviewedClaims.length > 0) label = `Reviewed (${reviewedClaims.length})`
            if (t === "insured"  && insuredClaims.length  > 0) label = `Insured (${insuredClaims.length})`
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {label}
                {t === "queue" && humanReviewCount > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {humanReviewCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "queue"     && <ClaimsQueue claims={queueClaims}    onAddress={handleAddress} />}
        {tab === "dashboard" && <Dashboard   allClaims={claims}      addressed={addressed} />}
        {tab === "reviewed"  && <ReviewedPanel claims={reviewedClaims} />}
        {tab === "insured"   && <InsuredQueue  claims={insuredClaims} />}
      </div>
    </div>
  )
}
