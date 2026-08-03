import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const referenceSchema = z.object({ $ref: z.url() })
const nbaStatisticsSchema = z.object({
  $ref: z.url(),
  athlete: referenceSchema,
  season: referenceSchema,
  seasonType: referenceSchema,
  splits: z.object({
    categories: z.array(z.object({
      stats: z.array(z.object({
        name: z.string(),
        value: z.number().finite(),
        displayValue: z.string(),
      })),
    })),
  }),
})

type NbaParserOptions = {
  athleteId: string
  externalId: string
  seasonYear: number
  season: string
  sourceUrl: string
  retrievedAt: string
}

const fields = {
  gamesPlayed: 'games',
  avgPoints: 'pointsPerGame',
  avgRebounds: 'reboundsPerGame',
  avgAssists: 'assistsPerGame',
} as const

/** The NBA/BAA historical record begins in 1946; future canonical seasons remain valid. */
export const NBA_SEASON_START_YEAR = 1946

export function parseNbaSeasonEndingYear(season: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(season)
  if (!match) throw new Error(`Unsupported NBA season: ${season}`)

  const startYear = Number(match[1])
  if (startYear < NBA_SEASON_START_YEAR || startYear > 9998) {
    throw new Error(`Unsupported NBA season: ${season}`)
  }
  const endingYear = startYear + 1
  if (match[2] !== String(endingYear).slice(-2)) {
    throw new Error(`Unsupported NBA season: ${season}`)
  }
  return endingYear
}

function referenceMatches(reference: string, expectedPath: string): boolean {
  const url = new URL(reference)
  return url.hostname === 'sports.core.api.espn.com' && url.pathname === expectedPath
}

export function parseNbaFixture(payload: unknown, options: NbaParserOptions): ProviderResult {
  const statistics = nbaStatisticsSchema.parse(payload)
  const basePath = `/v2/sports/basketball/leagues/nba/seasons/${options.seasonYear}`
  if (!referenceMatches(statistics.athlete.$ref, `${basePath}/athletes/${options.externalId}`) ||
      !referenceMatches(statistics.$ref, `${basePath}/types/2/athletes/${options.externalId}/statistics/0`)) {
    throw new Error(`NBA athlete identity mismatch (context) for ${options.athleteId}`)
  }
  if (!referenceMatches(statistics.season.$ref, basePath) ||
      !referenceMatches(statistics.seasonType.$ref, `${basePath}/types/2`)) {
    throw new Error(`NBA season context mismatch for ${options.athleteId}`)
  }

  const allStats = statistics.splits.categories.flatMap((category) => category.stats)
  const parsed = Object.fromEntries(Object.entries(fields).map(([sourceName, targetName]) => {
    const matches = allStats.filter((stat) => stat.name === sourceName)
    if (matches.length > 1) {
      throw new Error(`Duplicate NBA field ${sourceName} for ${options.athleteId}`)
    }
    const stat = matches[0]
    if (!stat) {
      throw new Error(`Missing NBA field ${sourceName} for ${options.athleteId}`)
    }
    const value = targetName === 'games'
      ? stat.value
      : Math.round((stat.value + Number.EPSILON) * 10) / 10
    return [targetName, value]
  })) as { games: number; pointsPerGame: number; reboundsPerGame: number; assistsPerGame: number }
  if (!Number.isInteger(parsed.games)) {
    throw new Error(`Invalid NBA games value for ${options.athleteId}`)
  }

  return providerResultSchema.parse({
    athleteId: options.athleteId,
    sport: 'basketball',
    competition: 'NBA',
    season: options.season,
    stats: { kind: 'basketball', ...parsed },
    state: 'final',
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
