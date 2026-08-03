import type { Athlete } from '../domain/athlete'

export function primaryMetric(athlete: Athlete): number {
  const stats = athlete.performance.stats
  if (!stats) return Number.NEGATIVE_INFINITY
  if (stats.kind === 'basketball') return stats.pointsPerGame
  if (stats.kind === 'football') return stats.goals
  return stats.points
}

export function rankAthletes(athletes: Athlete[]): Athlete[] {
  const eligible = athletes.filter(
      (athlete) =>
        athlete.visibility === 'public' &&
        athlete.performance.status === 'available' &&
        athlete.performance.stats !== null,
    )
  const sports = new Set(eligible.map((athlete) => athlete.sport))
  if (sports.size > 1) throw new Error('Cannot rank athletes from different sports together')
  return eligible.toSorted((left, right) => primaryMetric(right) - primaryMetric(left))
}
