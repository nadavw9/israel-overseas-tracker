import { readFile } from 'node:fs/promises'
import { parseCuratedRecord } from './curated'
import { parseApiFootballExternalId, parseApiFootballFixture } from './api-football'
import { parseNbaFixture, parseNbaSeasonEndingYear } from './nba'
import { parseNhlFixture } from './nhl'
import { parseEspnSoccerExternalId, parseEspnSoccerFixture } from './espn-soccer'
import { parseSportradarSoccerExternalId, parseSportradarSoccerFixture } from './soccer'
import type { ProviderAdapter, ProviderAdapterMap } from './types'

const curatedDataUrl = new URL('../../data/curated-stats.json', import.meta.url)

const curatedAdapter: ProviderAdapter = async ({ entry }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'curated') {
    throw new Error(`Curated binding required for ${entry.id}`)
  }

  const records = JSON.parse(await readFile(curatedDataUrl, 'utf8')) as Record<string, unknown>
  return parseCuratedRecord(entry.id, records[binding.externalId])
}

const espnNbaAdapter: ProviderAdapter = async ({ entry, fetcher, now }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'espn-nba') {
    throw new Error(`ESPN NBA binding required for ${entry.id}`)
  }

  const retrievedAt = now.toISOString()
  const seasonYear = parseNbaSeasonEndingYear(binding.season)
  const sourceUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/athletes/${binding.externalId}/statistics?lang=en&region=us`
  const response = await fetcher(sourceUrl)
  if (!response.ok) {
    throw new Error(`ESPN returned HTTP ${response.status} for ${entry.id}`)
  }

  return parseNbaFixture(await response.json(), {
    athleteId: entry.id,
    externalId: binding.externalId,
    seasonYear,
    season: binding.season,
    sourceUrl,
    retrievedAt,
  })
}

const nhlAdapter: ProviderAdapter = async ({ entry, fetcher, now }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'nhl') {
    throw new Error(`NHL binding required for ${entry.id}`)
  }

  const retrievedAt = now.toISOString()
  const sourceUrl = `https://api-web.nhle.com/v1/player/${binding.externalId}/landing`
  const response = await fetcher(sourceUrl)
  if (!response.ok) {
    throw new Error(`NHL returned HTTP ${response.status} for ${entry.id}`)
  }

  const seasonId = Number(binding.season.replace('-', '20'))
  return parseNhlFixture(await response.json(), {
    athleteId: entry.id,
    externalId: binding.externalId,
    expectedName: entry.name.en,
    seasonId,
    season: binding.season,
    sourceUrl,
    retrievedAt,
  })
}

const espnSoccerAdapter: ProviderAdapter = async ({ entry, fetcher, now }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'espn-soccer') {
    throw new Error(`ESPN Soccer binding required for ${entry.id}`)
  }

  const { leagueSlug, teamId, athleteId } = parseEspnSoccerExternalId(binding.externalId)
  const retrievedAt = now.toISOString()
  const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}/roster`
  const response = await fetcher(sourceUrl, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`ESPN Soccer returned HTTP ${response.status} for ${entry.id}`)
  }

  return parseEspnSoccerFixture(await response.json(), {
    athleteId: entry.id,
    expectedName: entry.name.en,
    season: binding.season,
    competition: binding.competition,
    seasonYear: Number(binding.season.slice(0, 4)),
    teamId,
    athleteIdExternal: athleteId,
    sourceUrl,
    retrievedAt,
  })
}

const apiFootballAdapter: ProviderAdapter = async ({ entry, fetcher, now }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'api-football') {
    throw new Error(`API-Football binding required for ${entry.id}`)
  }
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) {
    throw new Error('API-Football adapter disabled: API_FOOTBALL_KEY is not configured')
  }

  const { playerId, leagueId, seasonYear } = parseApiFootballExternalId(binding.externalId)
  const retrievedAt = now.toISOString()
  const sourceUrl = `https://v3.football.api-sports.io/players?id=${playerId}&league=${leagueId}&season=${seasonYear}`
  const response = await fetcher(sourceUrl, {
    headers: { accept: 'application/json', 'x-apisports-key': apiKey },
  })
  if (!response.ok) {
    throw new Error(`API-Football returned HTTP ${response.status} for ${entry.id}`)
  }

  return parseApiFootballFixture(await response.json(), {
    athleteId: entry.id,
    expectedName: entry.name.en,
    season: binding.season,
    competition: binding.competition,
    playerId,
    leagueId,
    seasonYear,
    sourceUrl,
    retrievedAt,
  })
}

const sportradarSoccerAdapter: ProviderAdapter = async ({ entry, fetcher, now }) => {
  const binding = entry.binding
  if (binding === undefined || binding.provider !== 'sportradar-soccer') {
    throw new Error(`Sportradar Soccer binding required for ${entry.id}`)
  }
  const apiKey = process.env.SPORTRADAR_SOCCER_API_KEY
  if (!apiKey) {
    throw new Error('Sportradar Soccer adapter disabled: SPORTRADAR_SOCCER_API_KEY is not configured')
  }
  const accessLevel = process.env.SPORTRADAR_SOCCER_ACCESS_LEVEL ?? 'trial'
  if (accessLevel !== 'trial' && accessLevel !== 'production') {
    throw new Error(`Unsupported Sportradar Soccer access level: ${accessLevel}`)
  }

  const { seasonId, competitorId, playerId } = parseSportradarSoccerExternalId(binding.externalId)
  const retrievedAt = now.toISOString()
  const sourceUrl = `https://api.sportradar.com/soccer/${accessLevel}/v4/en/seasons/${seasonId}/competitors/${competitorId}/statistics.json`
  const response = await fetcher(sourceUrl, {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
  })
  if (!response.ok) {
    throw new Error(`Sportradar Soccer returned HTTP ${response.status} for ${entry.id}`)
  }

  return parseSportradarSoccerFixture(await response.json(), {
    athleteId: entry.id,
    expectedName: entry.name.en,
    season: binding.season,
    competition: binding.competition,
    seasonId,
    competitorId,
    playerId,
    sourceUrl,
    retrievedAt,
  })
}

export const defaultProviderAdapters: ProviderAdapterMap = {
  curated: curatedAdapter,
  'api-football': apiFootballAdapter,
  'espn-nba': espnNbaAdapter,
  'espn-soccer': espnSoccerAdapter,
  nhl: nhlAdapter,
  'sportradar-soccer': sportradarSoccerAdapter,
}
