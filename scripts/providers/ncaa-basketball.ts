import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const referenceSchema = z.object({ $ref: z.url() })

const statisticsSchema = z.object({
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

const rosterSchema = z.object({
  team: z.object({
    id: z.union([z.string(), z.number().int().nonnegative()]).transform(String),
    displayName: z.string().trim().min(1),
  }),
  athletes: z.array(z.object({
    id: z.union([z.string(), z.number().int().nonnegative()]).transform(String),
    displayName: z.string().trim().min(1),
  })),
})

export type EspnNcaaBasketballExternalId = {
  leagueSlug: 'mens-college-basketball' | 'womens-college-basketball'
  teamId: number
  athleteId: number
  seasonYear: number
}

type ParserOptions = EspnNcaaBasketballExternalId & {
  athleteIdInternal: string
  expectedName: string
  season: string
  competition: string
  sourceUrl: string
  retrievedAt: string
}

const statFields = {
  gamesPlayed: 'games',
  avgPoints: 'pointsPerGame',
  avgRebounds: 'reboundsPerGame',
  avgAssists: 'assistsPerGame',
} as const

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function referenceMatches(reference: string, expectedPath: string) {
  const url = new URL(reference)
  return url.hostname === 'sports.core.api.espn.com' && url.pathname === expectedPath
}

export function parseEspnNcaaBasketballExternalId(value: string): EspnNcaaBasketballExternalId {
  const parts = value.split('|')
  const [leagueSlug, teamId, athleteId, seasonYear] = parts
  const valid = parts.length === 4 &&
    (leagueSlug === 'mens-college-basketball' || leagueSlug === 'womens-college-basketball') &&
    teamId !== undefined && /^\d+$/.test(teamId) &&
    athleteId !== undefined && /^\d+$/.test(athleteId) &&
    seasonYear !== undefined && /^\d{4}$/.test(seasonYear)
  if (!valid) {
    throw new Error('ESPN NCAA basketball external ids must use league-slug|team|athlete|season numeric ids')
  }
  return {
    leagueSlug,
    teamId: Number(teamId),
    athleteId: Number(athleteId),
    seasonYear: Number(seasonYear),
  }
}

export function parseEspnNcaaBasketballFixture(
  payload: { roster: unknown; statistics: unknown },
  options: ParserOptions,
): ProviderResult {
  const roster = rosterSchema.parse(payload.roster)
  if (roster.team.id !== String(options.teamId)) {
    throw new Error(`ESPN NCAA basketball team identity mismatch for ${options.athleteIdInternal}`)
  }

  const matches = roster.athletes.filter((athlete) => athlete.id === String(options.athleteId))
  if (matches.length !== 1) {
    throw new Error(`ESPN NCAA basketball athlete is missing or duplicated for ${options.athleteIdInternal}`)
  }
  const rosterAthlete = matches[0]
  if (rosterAthlete === undefined || normalizeName(rosterAthlete.displayName) !== normalizeName(options.expectedName)) {
    throw new Error(`ESPN NCAA basketball athlete identity mismatch for ${options.athleteIdInternal}`)
  }

  const statistics = statisticsSchema.parse(payload.statistics)
  const basePath = `/v2/sports/basketball/leagues/${options.leagueSlug}/seasons/${options.seasonYear}`
  if (!referenceMatches(statistics.athlete.$ref, `${basePath}/athletes/${options.athleteId}`) ||
      !referenceMatches(statistics.$ref, `${basePath}/types/2/athletes/${options.athleteId}/statistics/0`) ||
      !referenceMatches(statistics.season.$ref, basePath) ||
      !referenceMatches(statistics.seasonType.$ref, `${basePath}/types/2`)) {
    throw new Error(`ESPN NCAA basketball season or athlete context mismatch for ${options.athleteIdInternal}`)
  }

  const allStats = statistics.splits.categories.flatMap((category) => category.stats)
  const parsed = Object.fromEntries(Object.entries(statFields).map(([sourceName, targetName]) => {
    const matchesForField = allStats.filter((stat) => stat.name === sourceName)
    if (matchesForField.length > 1) {
      throw new Error(`Duplicate ESPN NCAA basketball field ${sourceName} for ${options.athleteIdInternal}`)
    }
    const stat = matchesForField[0]
    if (stat === undefined || stat.value < 0) {
      throw new Error(`Missing or invalid ESPN NCAA basketball field ${sourceName} for ${options.athleteIdInternal}`)
    }
    const value = targetName === 'games'
      ? stat.value
      : Math.round((stat.value + Number.EPSILON) * 10) / 10
    return [targetName, value]
  })) as { games: number; pointsPerGame: number; reboundsPerGame: number; assistsPerGame: number }
  if (!Number.isInteger(parsed.games)) {
    throw new Error(`Invalid ESPN NCAA basketball games value for ${options.athleteIdInternal}`)
  }

  return providerResultSchema.parse({
    athleteId: options.athleteIdInternal,
    sport: 'basketball',
    competition: options.competition,
    season: options.season,
    stats: { kind: 'basketball', ...parsed },
    state: 'final',
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
