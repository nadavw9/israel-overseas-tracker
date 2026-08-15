import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const idSchema = z.union([
  z.string().trim().min(1),
  z.number().int().nonnegative(),
]).transform(String)

const statSchema = z.object({
  name: z.string().trim().min(1),
  value: z.number().finite(),
})

const statisticsSchema = z.object({
  splits: z.object({
    categories: z.array(z.object({
      stats: z.array(statSchema),
    })),
  }),
})

const athleteSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  statistics: statisticsSchema.optional(),
})

const teamSchema = z.object({
  id: idSchema,
  displayName: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
})

const rosterSchema = z.object({
  season: z.object({ year: z.number().int().nonnegative() }),
  athletes: z.array(athleteSchema),
  team: teamSchema,
})

export type EspnSoccerExternalId = {
  leagueSlug: string
  teamId: number
  athleteId: number
}

type EspnSoccerParserOptions = {
  athleteId: string
  expectedName: string
  season: string
  competition: string
  seasonYear: number
  teamId: number
  athleteIdExternal: number
  sourceUrl: string
  retrievedAt: string
}

const statFields = {
  appearances: 'appearances',
  totalGoals: 'goals',
  goalAssists: 'assists',
} as const

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function parseEspnSoccerExternalId(value: string): EspnSoccerExternalId {
  const parts = value.split('|')
  const [leagueSlug, teamId, athleteId] = parts
  const valid = parts.length === 3 &&
    leagueSlug !== undefined && /^[a-z0-9.]+$/.test(leagueSlug) &&
    teamId !== undefined && /^\d+$/.test(teamId) &&
    athleteId !== undefined && /^\d+$/.test(athleteId)
  if (!valid) {
    throw new Error('ESPN Soccer external ids must use league-slug|team|athlete numeric ids')
  }
  return { leagueSlug, teamId: Number(teamId), athleteId: Number(athleteId) }
}

export function parseEspnSoccerFixture(payload: unknown, options: EspnSoccerParserOptions): ProviderResult {
  const roster = rosterSchema.parse(payload)
  if (roster.team.id !== String(options.teamId)) {
    throw new Error(`ESPN Soccer team identity mismatch for ${options.athleteId}`)
  }
  if (roster.season.year !== options.seasonYear) {
    throw new Error(`ESPN Soccer season mismatch for ${options.athleteId}`)
  }

  const matches = roster.athletes.filter((athlete) => athlete.id === String(options.athleteIdExternal))
  if (matches.length !== 1) {
    throw new Error(`ESPN Soccer athlete is missing or duplicated for ${options.athleteId}`)
  }
  const athlete = matches[0]
  if (athlete === undefined) throw new Error(`ESPN Soccer athlete is missing for ${options.athleteId}`)
  const providerName = athlete.fullName ?? athlete.displayName
  if (providerName === undefined || normalizeName(providerName) !== normalizeName(options.expectedName)) {
    throw new Error(`ESPN Soccer athlete identity mismatch for ${options.athleteId}`)
  }
  if (athlete.statistics === undefined) {
    throw new Error(`ESPN Soccer current statistics are unavailable for ${options.athleteId}`)
  }

  const allStats = athlete.statistics.splits.categories.flatMap((category) => category.stats)
  const parsed = Object.fromEntries(Object.entries(statFields).map(([sourceName, targetName]) => {
    const matchesForField = allStats.filter((stat) => stat.name === sourceName)
    if (matchesForField.length > 1) {
      throw new Error(`Duplicate ESPN Soccer field ${sourceName} for ${options.athleteId}`)
    }
    const stat = matchesForField[0]
    if (stat === undefined) {
      throw new Error(`Missing ESPN Soccer field ${sourceName} for ${options.athleteId}`)
    }
    if (!Number.isInteger(stat.value) || stat.value < 0) {
      throw new Error(`Invalid ESPN Soccer field ${sourceName} for ${options.athleteId}`)
    }
    return [targetName, stat.value]
  })) as { appearances: number; goals: number; assists: number }

  return providerResultSchema.parse({
    athleteId: options.athleteId,
    sport: 'football',
    competition: options.competition,
    season: options.season,
    stats: { kind: 'football', ...parsed },
    state: 'provisional',
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
