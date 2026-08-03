import { athleteSchema, type Athlete } from '../domain/athlete'
import type { Sport } from '../domain/taxonomy'

const sportOrder: Sport[] = [
  'basketball', 'football', 'hockey', 'handball', 'volleyball', 'baseball',
  'softball', 'rugby', 'tennis', 'cycling', 'motorsport', 'golf', 'athletics',
  'aquatics', 'judo', 'combat', 'gymnastics', 'sailing', 'winter-sport', 'other',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonnegativeInteger(value: unknown): value is number {
  return isFiniteNonnegative(value) && Number.isInteger(value)
}

function hasRankablePerformance(athlete: unknown): athlete is Athlete {
  const candidate = athlete
  if (!isRecord(candidate) || !isRecord(candidate.performance)) return false
  const performance = candidate.performance
  if (performance.status !== 'available' || !isRecord(performance.stats)) return false
  const stats = performance.stats

  if (candidate.sport === 'basketball' && stats.kind === 'basketball') {
    return isNonnegativeInteger(stats.games) &&
      isFiniteNonnegative(stats.pointsPerGame) &&
      isFiniteNonnegative(stats.reboundsPerGame) &&
      isFiniteNonnegative(stats.assistsPerGame)
  }

  if (candidate.sport === 'football' && stats.kind === 'football') {
    return isNonnegativeInteger(stats.appearances) &&
      isNonnegativeInteger(stats.goals) &&
      isNonnegativeInteger(stats.assists)
  }

  if (candidate.sport === 'hockey' && stats.kind === 'hockey') {
    return isNonnegativeInteger(stats.games) &&
      isNonnegativeInteger(stats.goals) &&
      isNonnegativeInteger(stats.assists) &&
      isNonnegativeInteger(stats.points)
  }

  return false
}

function parseRankableAthlete(athlete: unknown): Athlete | null {
  const parsed = athleteSchema.safeParse(athlete)
  return parsed.success && hasRankablePerformance(parsed.data)
    ? parsed.data
    : null
}

function rankableAthletes(athletes: readonly unknown[]): Athlete[] {
  return athletes.flatMap((athlete) => {
    const parsed = parseRankableAthlete(athlete)
    return parsed ? [parsed] : []
  })
}

export function primaryMetric(athlete: Athlete): number {
  if (!hasRankablePerformance(athlete)) return Number.NEGATIVE_INFINITY
  const stats = athlete.performance.stats
  if (!stats) return Number.NEGATIVE_INFINITY
  if (stats.kind === 'basketball') return stats.pointsPerGame
  if (stats.kind === 'football') return stats.goals
  return stats.points
}

export function rankAthletes(athletes: readonly unknown[]): Athlete[] {
  const eligible = rankableAthletes(athletes)
  const sports = new Set(eligible.map((athlete) => athlete.sport))
  if (sports.size > 1) throw new Error('Cannot rank athletes from different sports together')
  return eligible.toSorted((left, right) => primaryMetric(right) - primaryMetric(left))
}

export function rankAthletesBySport(athletes: readonly unknown[]): Array<{ sport: Sport; athletes: Athlete[] }> {
  const eligible = rankableAthletes(athletes)

  return sportOrder
    .map((sport) => ({
      sport,
      athletes: eligible
        .filter((athlete) => athlete.sport === sport)
        .toSorted((left, right) => primaryMetric(right) - primaryMetric(left)),
    }))
    .filter((group) => group.athletes.length > 0)
}
