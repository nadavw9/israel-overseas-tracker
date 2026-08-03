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

  const namedStats = new Map(
    statistics.splits.categories.flatMap((category) => category.stats)
      .map((stat) => [stat.name, stat] as const),
  )
  const parsed = Object.fromEntries(Object.entries(fields).map(([sourceName, targetName]) => {
    const stat = namedStats.get(sourceName)
    const value = Number(stat?.displayValue)
    if (!stat || !Number.isFinite(value)) {
      throw new Error(`Missing NBA field ${sourceName} for ${options.athleteId}`)
    }
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
