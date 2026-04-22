"use client"

import type { ClaimSummary } from "@/lib/types"

export default function InsuredQueue({ claims }: { claims: ClaimSummary[] }) {
  if (claims.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-300">No insured claims</p>
          <p className="text-base text-gray-400 mt-2">Insured shipments routed here follow a separate process.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Insured Claims</h2>
          <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Separate process — not reimbursed via this workflow</span>
        </div>
        <p className="text-sm text-gray-500">These shipments were insured at time of fulfillment. Claims are handled through the carrier insurance process, not ShipBob direct reimbursement.</p>
        <div className="space-y-3">
          {claims.map((claim) => (
            <div key={claim.case.case_id} className="bg-white rounded-xl border border-blue-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">{claim.case.account_name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{claim.case.case_id} · Case #{claim.case.case_number}</p>
                  <p className="text-sm text-gray-500 mt-1">{claim.case.description}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">Insured</span>
                  <p className="text-xs text-gray-400 mt-2">{claim.shipment.carrier}</p>
                  <p className="text-xs font-mono text-gray-400">{claim.shipment.tracking_number}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                <span>Filed {new Date(claim.case.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>Delivered {new Date(claim.shipment.delivered_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>Shipment {claim.shipment.shipment_id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
