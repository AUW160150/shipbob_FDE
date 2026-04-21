"use client"

import type { ClaimSummary } from "@/lib/types"

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-400 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 w-48 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-6 text-right">{count}</span>
    </div>
  )
}

function WeekBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className="w-full flex flex-col justify-end" style={{ height: 80 }}>
        <div
          className="w-full bg-blue-500 rounded-t-md transition-all"
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-700">{count}</span>
    </div>
  )
}

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function Dashboard({
  allClaims,
  addressed,
}: {
  allClaims: ClaimSummary[]
  addressed: ClaimSummary[]
}) {
  // Carrier breakdown
  const carrierCounts: Record<string, number> = {}
  allClaims.forEach((c) => {
    const carrier = c.shipment.carrier
    carrierCounts[carrier] = (carrierCounts[carrier] ?? 0) + 1
  })
  const maxCarrier = Math.max(...Object.values(carrierCounts))
  const carrierColors = ["bg-blue-500", "bg-indigo-400", "bg-purple-400", "bg-pink-400", "bg-orange-400"]

  // Label breakdown
  const labelCounts: Record<string, number> = {}
  allClaims.forEach((c) => {
    const l = c.rulebook.label
    labelCounts[l] = (labelCounts[l] ?? 0) + 1
  })

  // Merchant repeat check
  const merchantCounts: Record<string, number> = {}
  allClaims.forEach((c) => {
    const m = c.case.account_name
    merchantCounts[m] = (merchantCounts[m] ?? 0) + 1
  })
  const repeatMerchants = Object.entries(merchantCounts).filter(([, n]) => n > 1)

  // Weekly case volume — group by week of created_date
  const weekBuckets: Record<string, number> = {}
  allClaims.forEach((c) => {
    const d = new Date(c.case.created_date)
    // Round to Monday of that week
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((day + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    weekBuckets[key] = (weekBuckets[key] ?? 0) + 1
  })
  const weeks = Object.entries(weekBuckets).sort(([a], [b]) => a.localeCompare(b))
  const maxWeek = Math.max(...weeks.map(([, n]) => n))

  // Avg days from delivery to claim
  const avgDays = Math.round(
    allClaims.reduce((sum, c) => {
      const diff = (new Date(c.case.created_date).getTime() - new Date(c.shipment.delivered_date).getTime()) / 86400000
      return sum + diff
    }, 0) / allClaims.length
  )

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Cases" value={allClaims.length} sub="all time" />
          <StatCard label="Addressed" value={addressed.length} sub="this session" />
          <StatCard label="Pending Review" value={allClaims.filter((c) => c.rulebook.needsHumanReview).length} sub="flagged" />
          <StatCard label="Avg Days to File" value={avgDays} sub="delivery → claim" />
        </div>

        {/* Weekly volume */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Cases Filed by Week</h3>
          <div className="flex items-end gap-3">
            {weeks.map(([key, count]) => (
              <WeekBar key={key} label={`Wk ${weekLabel(key)}`} count={count} max={maxWeek} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Carrier breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Claims by Carrier</h3>
            <p className="text-xs text-gray-400">Which carriers are associated with the most damage claims</p>
            <div className="space-y-2.5 mt-2">
              {Object.entries(carrierCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([carrier, count], i) => (
                  <BarRow
                    key={carrier}
                    label={carrier}
                    count={count}
                    max={maxCarrier}
                    color={carrierColors[i % carrierColors.length]}
                  />
                ))}
            </div>
          </div>

          {/* Claim type / label breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Cases by Status</h3>
            <p className="text-xs text-gray-400">Distribution of claim outcomes from agent processing</p>
            <div className="space-y-2.5 mt-2">
              {Object.entries(labelCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([label, count]) => {
                  const colorMap: Record<string, string> = {
                    READY_FOR_REVIEW: "bg-blue-500",
                    HIGH_VALUE: "bg-red-400",
                    MISSING_EVIDENCE: "bg-yellow-400",
                    WAITING: "bg-yellow-300",
                    EXPIRED: "bg-gray-400",
                    CLOSED: "bg-green-400",
                    ADDRESSED: "bg-green-500",
                  }
                  const labelText: Record<string, string> = {
                    READY_FOR_REVIEW: "Ready for Review",
                    HIGH_VALUE: "High Value",
                    MISSING_EVIDENCE: "Missing Evidence",
                    WAITING: "Waiting on Client",
                    EXPIRED: "Expired",
                    CLOSED: "Closed",
                    ADDRESSED: "Addressed",
                  }
                  return (
                    <BarRow
                      key={label}
                      label={labelText[label] ?? label}
                      count={count}
                      max={allClaims.length}
                      color={colorMap[label] ?? "bg-gray-300"}
                    />
                  )
                })}
            </div>
          </div>
        </div>

        {/* Merchant frequency */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Merchant Claim Frequency</h3>
          <p className="text-xs text-gray-400 mb-4">Merchants with multiple claims may indicate a pattern worth investigating</p>
          {repeatMerchants.length === 0 ? (
            <p className="text-sm text-gray-400">No repeat merchants in current dataset.</p>
          ) : (
            <div className="space-y-2">
              {repeatMerchants.map(([merchant, count]) => (
                <div key={merchant} className="flex items-center justify-between px-4 py-2.5 bg-orange-50 border border-orange-100 rounded-lg">
                  <span className="text-sm font-medium text-gray-800">{merchant}</span>
                  <span className="text-sm font-bold text-orange-600">{count} claims</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">All Merchants</h4>
            <div className="space-y-2">
              {Object.entries(merchantCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([merchant, count]) => (
                  <BarRow
                    key={merchant}
                    label={merchant}
                    count={count}
                    max={Math.max(...Object.values(merchantCounts))}
                    color="bg-blue-400"
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
