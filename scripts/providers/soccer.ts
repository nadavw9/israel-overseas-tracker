import { z } from 'zod'
import { providerResultSchema, type ProviderResult } from './types'

const soccerUrnSchema = z.string().regex(/^sr:(season|competitor|player):[A-Za-z0-9_-]+$/)

const soccerPlayerStatisticsSchema = z.object({
  matches_played: z.number().int().nonnegative(),
  goals_scored: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
})

const soccerSeasonalStatisticsSchema = z.object({
  season: z.object({ id: soccerUrnSchema }),
  competitor: z.object({
    id: soccerUrnSchema,
    name: z.string().trim().min(1),
    players: z.array(z.object({
      id: soccerUrnSchema,
      name: z.string().trim().min(1),
      statistics: soccerPlayerStatisticsSchema,
    })),
  }),
})

export type SportradarSoccerBinding = {
  seasonId: string
  competitorId: string
  playerId: string
}

export type SportradarSoccerParserOptions = {
  athleteId: string
  expectedName: string
  season: string
  competition: string
  sourceUrl: string
  retrievedAt: string
} & SportradarSoccerBinding

export function parseSportradarSoccerExternalId(externalId: string): SportradarSoccerBinding {
  const parts = externalId.split('|')
  if (parts.length !== 3) {
    throw new Error('Sportradar Soccer bindings must be season|competitor|player URNs')
  }
  const [seasonId, competitorId, playerId] = parts
  return {
    seasonId: soccerUrnSchema.parse(seasonId),
    competitorId: soccerUrnSchema.parse(competitorId),
    playerId: soccerUrnSchema.parse(playerId),
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

export function parseSportradarSoccerFixture(
  payload: unknown,
  options: SportradarSoccerParserOptions,
): ProviderResult {
  const statistics = soccerSeasonalStatisticsSchema.parse(payload)
  if (statistics.season.id !== options.seasonId || statistics.competitor.id !== options.competitorId) {
    throw new Error(`Sportradar Soccer season or competitor mismatch for ${options.athleteId}`)
  }

  const matchingPlayers = statistics.competitor.players.filter((player) => player.id === options.playerId)
  if (matchingPlayers.length !== 1) {
    throw new Error(`Sportradar Soccer player ${options.playerId} missing or duplicated for ${options.athleteId}`)
  }
  const player = matchingPlayers[0]
  if (normalizedName(player.name) !== normalizedName(options.expectedName)) {
    throw new Error(`Sportradar Soccer player identity mismatch for ${options.athleteId}`)
  }

  return providerResultSchema.parse({
    athleteId: options.athleteId,
    sport: 'football',
    competition: options.competition,
    season: options.season,
    observedOrganization: statistics.competitor.name,
    state: 'final',
    stats: {
      kind: 'football',
      appearances: player.statistics.matches_played,
      goals: player.statistics.goals_scored,
      assists: player.statistics.assists,
    },
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
  })
}
