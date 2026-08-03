import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const nhlLandingSchema = z.object({
  playerId: z.union([z.string(), z.number()]),
  playerSlug: z.string().trim().min(1),
  fullTeamName: z.object({ default: z.string().trim().min(1) }),
  seasonTotals: z.array(z.object({
    season: z.number().int(),
    gameTypeId: z.number().int(),
    leagueAbbrev: z.string(),
    gamesPlayed: z.number().int().nonnegative(),
    goals: z.number().int().nonnegative(),
    assists: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
  })),
})

type NhlParserOptions = {
  athleteId: string
  externalId: string
  expectedName: string
  seasonId: number
  season: string
  sourceUrl: string
  retrievedAt: string
}

function normalizedIdentity(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '')
}

export function parseNhlFixture(payload: unknown, options: NhlParserOptions): ProviderResult {
  const landing = nhlLandingSchema.parse(payload)
  const slugName = landing.playerSlug.replace(/-\d+$/, '')
  if (String(landing.playerId) !== options.externalId ||
      normalizedIdentity(slugName) !== normalizedIdentity(options.expectedName)) {
    throw new Error(`NHL player identity mismatch for ${options.athleteId}`)
  }

  const rows = landing.seasonTotals.filter((total) =>
    total.season === options.seasonId && total.gameTypeId === 2 && total.leagueAbbrev === 'NHL')
  if (rows.length === 0) {
    throw new Error(`Missing NHL season ${options.seasonId} for ${options.athleteId}`)
  }
  const sum = (field: 'gamesPlayed' | 'goals' | 'assists' | 'points') =>
    rows.reduce((total, row) => total + row[field], 0)

  return providerResultSchema.parse({
    athleteId: options.athleteId,
    sport: 'hockey',
    competition: 'NHL',
    season: options.season,
    observedOrganization: landing.fullTeamName.default,
    state: 'final',
    stats: { kind: 'hockey', games: sum('gamesPlayed'), goals: sum('goals'), assists: sum('assists'), points: sum('points') },
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
