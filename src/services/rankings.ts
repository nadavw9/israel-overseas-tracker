import type { Athlete } from '../domain/athlete'
import type { Sport } from '../domain/taxonomy'

const sportOrder: Sport[] = [
  'basketball', 'football', 'hockey', 'handball', 'volleyball', 'baseball',
  'softball', 'rugby', 'tennis', 'cycling', 'motorsport', 'golf', 'athletics',
  'aquatics', 'judo', 'combat', 'gymnastics', 'sailing', 'winter-sport', 'other',
]

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

export function rankAthletesBySport(athletes: Athlete[]): Array<{ sport: Sport; athletes: Athlete[] }> {
  const eligible = athletes.filter((athlete) =>
    athlete.visibility === 'public' &&
    athlete.performance.status === 'available' &&
    athlete.performance.stats !== null &&
    athlete.performance.stats.kind === athlete.sport,
  )

  return sportOrder
    .map((sport) => ({
      sport,
      athletes: eligible
        .filter((athlete) => athlete.sport === sport)
        .toSorted((left, right) => primaryMetric(right) - primaryMetric(left)),
    }))
    .filter((group) => group.athletes.length > 0)
}
