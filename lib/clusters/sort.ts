/**
 * Cluster sorting — single source of truth.
 *
 * Sorts cluster codes by the numeric suffix after an optional letter
 * prefix, so C1 < C2 < C10 < C11 (natural order) instead of C1 < C10
 * < C11 < C2 (alphabetical). Rows with no parseable number sink to
 * the bottom in stable alphabetical order so they don't silently
 * disappear.
 *
 * Use this everywhere clusters appear — list rendering, filter pills,
 * sort tabs, send-to destinations. Never write another one-off cluster
 * sort function. If you find one, delete it and route it through here.
 */

/**
 * Numeric rank of a cluster code. Used by sortClustersNatural and
 * also exported so inline comparators (e.g. the Command Center's
 * `sortBy === 'cluster'` branch) can use the same rule.
 *
 * Returns POSITIVE_INFINITY for null / unparseable codes so they
 * sort to the bottom.
 */
export const rankClusterCode = (code: string | null | undefined): number => {
  if (!code) return Number.POSITIVE_INFINITY
  const match = code.match(/(\d+)/)
  if (!match) return Number.POSITIVE_INFINITY
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Stable natural-order sort for an array of objects carrying a
 * cluster code somewhere accessible via `getter`. Returns a NEW
 * array; does not mutate the input.
 *
 * @example
 *   sortClustersNatural(clusters, c => c.cluster)
 *   sortClustersNatural(incidents, i => i.cluster)
 */
export function sortClustersNatural<T>(
  items: readonly T[],
  getter: (item: T) => string | null | undefined,
): T[] {
  return [...items].sort((a, b) => {
    const ra = rankClusterCode(getter(a))
    const rb = rankClusterCode(getter(b))
    if (ra !== rb) return ra - rb
    // Tie-breaker: alphabetical on the raw code so order is stable
    // across repeated calls (esp. for the no-number tail).
    const ca = getter(a) ?? ''
    const cb = getter(b) ?? ''
    return ca.localeCompare(cb)
  })
}

/**
 * Convenience wrapper for plain string arrays like ['C1', 'C10', 'C2'].
 * Use when the items ARE cluster codes (vs objects containing them).
 */
export function sortClusterCodesNatural(codes: readonly string[]): string[] {
  return sortClustersNatural(codes, (c) => c)
}
