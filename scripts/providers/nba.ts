import type { ProviderResult } from './types'

type EspnStatistics = {
  names: string[]
  splits: Array<{ displayName: string; stats: string[] }>
}

type EspnOverview = {
  statistics?: EspnStatistics
}

type NbaParserOptions = {
  athleteId: string
  sourceUrl: string
  retrievedAt: string
}

const fields = {
  gamesPlayed: 'games',
  avgPoints: 'pointsPerGame',
  avgRebounds: 'reboundsPerGame',
  avgAssists: 'assistsPerGame',
} as const

export function parseNbaFixture(
  payload: EspnOverview,
  options: NbaParserOptions,
): ProviderResult {
  const names = payload.statistics?.names ?? []
  const regularSeason = payload.statistics?.splits.find(
    (split) => split.displayName === 'Regular Season',
  )

  if (!regularSeason) {
    throw new Error(`Missing NBA regular season for ${options.athleteId}`)
  }

  const parsed = Object.fromEntries(
    Object.entries(fields).map(([sourceName, targetName]) => {
      const index = names.indexOf(sourceName)
      const value = Number(regularSeason.stats[index])

      if (index < 0 || !Number.isFinite(value)) {
        throw new Error(`Missing NBA field ${sourceName} for ${options.athleteId}`)
      }

      return [targetName, value]
    }),
  ) as {
    games: number
    pointsPerGame: number
    reboundsPerGame: number
    assistsPerGame: number
  }

  if (!Number.isInteger(parsed.games)) {
    throw new Error(`Invalid NBA games value for ${options.athleteId}`)
  }

  return {
    athleteId: options.athleteId,
    stats: { kind: 'basketball', ...parsed },
    state: 'final',
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  }
}
