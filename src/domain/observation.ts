export const PERFORMANCE_RETENTION_HOURS = 48
export const PERFORMANCE_RETENTION_MS = PERFORMANCE_RETENTION_HOURS * 60 * 60 * 1000

export function isObservationWithinRetention(retrievedAt: string, asOf: Date): boolean {
  const observedMilliseconds = new Date(retrievedAt).getTime()
  const asOfMilliseconds = asOf.getTime()
  const ageMilliseconds = asOfMilliseconds - observedMilliseconds
  return Number.isFinite(observedMilliseconds) &&
    Number.isFinite(asOfMilliseconds) &&
    ageMilliseconds >= 0 &&
    ageMilliseconds <= PERFORMANCE_RETENTION_MS
}
