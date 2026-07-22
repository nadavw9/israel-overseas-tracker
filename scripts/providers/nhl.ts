import type { ProviderResult } from './types'

type NhlSeasonTotal = {
  season: number
  gameTypeId: number
  leagueAbbrev: string
  gamesPlayed: number
  goals: number
  assists: number
  points: number
}

type NhlLanding = {
  playerId: number
  playerSlug: string
  fullTeamName: { default: string }
  seasonTotals: NhlSeasonTotal[]
}

type NhlParserOptions = {
  athleteId: string
  seasonId: number
  retrievedAt: string
}

export function parseNhlFixture(
  payload: NhlLanding,
  options: NhlParserOptions,
): ProviderResult {
  const rows = payload.seasonTotals.filter(
    (total) =>
      total.season === options.seasonId &&
      total.gameTypeId === 2 &&
      total.leagueAbbrev === 'NHL',
  )

  if (rows.length === 0) {
    throw new Error(`Missing NHL season ${options.seasonId} for ${options.athleteId}`)
  }

  const sum = (field: 'gamesPlayed' | 'goals' | 'assists' | 'points') =>
    rows.reduce((total, row) => total + row[field], 0)

  return {
    athleteId: options.athleteId,
    observedOrganization: payload.fullTeamName.default,
    state: 'final',
    stats: {
      kind: 'hockey',
      games: sum('gamesPlayed'),
      goals: sum('goals'),
      assists: sum('assists'),
      points: sum('points'),
    },
    sourceUrl: `https://www.nhl.com/player/${payload.playerSlug}`,
    retrievedAt: options.retrievedAt,
  }
}
