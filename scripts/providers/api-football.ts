import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const apiFootballBindingPartSchema = z.string().regex(/^\d+$/)

const apiFootballResponseSchema = z.object({
  errors: z.record(z.string(), z.unknown()).or(z.array(z.unknown())).optional(),
  response: z.array(z.object({
    player: z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1),
    }),
    statistics: z.array(z.object({
      team: z.object({ id: z.number().int().positive(), name: z.string().trim().min(1) }),
      league: z.object({ id: z.number().int().positive(), season: z.number().int().positive() }),
      games: z.object({ appearences: z.number().int().nonnegative().nullable() }),
      goals: z.object({
        total: z.number().int().nonnegative().nullable(),
        assists: z.number().int().nonnegative().nullable(),
      }),
    })),
  })),
})

export type ApiFootballBinding = {
  playerId: number
  leagueId: number
  seasonYear: number
}

export type ApiFootballParserOptions = {
  athleteId: string
  expectedName: string
  season: string
  competition: string
  sourceUrl: string
  retrievedAt: string
} & ApiFootballBinding

export function parseApiFootballExternalId(externalId: string): ApiFootballBinding {
  const parts = externalId.split('|')
  if (parts.length !== 3) {
    throw new Error('API-Football bindings must be player|league|season numeric ids')
  }
  const [playerId, leagueId, seasonYear] = parts.map((part) => apiFootballBindingPartSchema.parse(part))
  return {
    playerId: Number(playerId),
    leagueId: Number(leagueId),
    seasonYear: Number(seasonYear),
  }
}

function normalizedName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ')
}

function sumNullable(values: Array<number | null>, field: string, athleteId: string): number {
  if (values.every((value) => value === null)) {
    throw new Error(`API-Football has no numeric ${field} total for ${athleteId}`)
  }
  return values.reduce((total, value) => total + (value ?? 0), 0)
}

export function parseApiFootballFixture(
  payload: unknown,
  options: ApiFootballParserOptions,
): ProviderResult {
  const parsed = apiFootballResponseSchema.parse(payload)
  const records = parsed.response
  if (records.length !== 1) {
    throw new Error(`API-Football player ${options.playerId} missing or duplicated for ${options.athleteId}`)
  }
  const record = records[0]
  if (record.player.id !== options.playerId || normalizedName(record.player.name) !== normalizedName(options.expectedName)) {
    throw new Error(`API-Football player identity mismatch for ${options.athleteId}`)
  }

  const rows = record.statistics.filter((stat) =>
    stat.league.id === options.leagueId && stat.league.season === options.seasonYear)
  if (rows.length === 0) {
    throw new Error(`API-Football league or season mismatch for ${options.athleteId}`)
  }

  const organizations = [...new Set(rows.map((row) => row.team.name))]
  return providerResultSchema.parse({
    athleteId: options.athleteId,
    sport: 'football',
    competition: options.competition,
    season: options.season,
    ...(organizations.length === 1 ? { observedOrganization: organizations[0] } : {}),
    state: 'final',
    stats: {
      kind: 'football',
      appearances: sumNullable(rows.map((row) => row.games.appearences), 'appearances', options.athleteId),
      goals: sumNullable(rows.map((row) => row.goals.total), 'goals', options.athleteId),
      assists: sumNullable(rows.map((row) => row.goals.assists), 'assists', options.athleteId),
    },
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
