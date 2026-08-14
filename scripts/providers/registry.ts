import { readFile } from 'node:fs/promises'
import { parseCuratedRecord } from './curated'
import { parseNbaFixture, parseNbaSeasonEndingYear } from './nba'
import { parseNhlFixture } from './nhl'
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

export const defaultProviderAdapters: ProviderAdapterMap = {
  curated: curatedAdapter,
  'espn-nba': espnNbaAdapter,
  nhl: nhlAdapter,
}
