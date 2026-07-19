import type { Athlete } from '../domain/athlete'

export function primaryMetric(athlete: Athlete): number {
  const stats = athlete.stats
  if (!stats) return Number.NEGATIVE_INFINITY
  if (stats.kind === 'basketball') return stats.pointsPerGame
  if (stats.kind === 'football') return stats.goals
  return stats.points
}

export function rankAthletes(athletes: Athlete[]): Athlete[] {
  return athletes
    .filter(
      (athlete) =>
        athlete.visibility === 'public' &&
        athlete.statsStatus === 'verified' &&
        athlete.stats !== null &&
        (athlete.freshness === 'fresh' || athlete.freshness === 'stale'),
    )
    .toSorted((left, right) => primaryMetric(right) - primaryMetric(left))
}
