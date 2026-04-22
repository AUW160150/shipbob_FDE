import type { TriageResult } from "./types"

const PRIORITY_ORDER: Record<string, number> = {
  URGENT:     0,
  AGING:      1,
  HIGH_VALUE: 2,
  STANDARD:   3,
  LOW_VALUE:  4,
}

export function sortByPriority<T extends { triage: TriageResult }>(claims: T[]): T[] {
  return [...claims].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.triage.priorityTag] ?? 99) -
      (PRIORITY_ORDER[b.triage.priorityTag] ?? 99)
  )
}
