import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseCuratedRecord } from './providers/curated'
import { parseNbaFixture } from './providers/nba'
import { parseNhlFixture } from './providers/nhl'
import type { ProviderResult } from './providers/types'
import { publicRegistry, type RegistryAthlete } from '../src/data/registry'
import { snapshotSchema, type AthleteSnapshot } from '../src/domain/athlete'
import { buildSnapshot } from '../src/services/snapshot'

const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
const curatedDataUrl = new URL('../data/curated-stats.json', import.meta.url)

export async function fetchProviderRecord(
  entry: RegistryAthlete,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<ProviderResult> {
  const retrievedAt = now.toISOString()

  if (entry.provider === 'curated') {
    const records = JSON.parse(await readFile(curatedDataUrl, 'utf8')) as Record<
      string,
      unknown
    >
    return parseCuratedRecord(entry.id, records[entry.providerId])
  }

  if (entry.provider === 'espn-nba') {
    const sourceUrl = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${entry.providerId}/overview`
    const response = await fetcher(sourceUrl)
    if (!response.ok) {
      throw new Error(`ESPN returned HTTP ${response.status} for ${entry.id}`)
    }
    return parseNbaFixture(await response.json(), {
      athleteId: entry.id,
      sourceUrl,
      retrievedAt,
    })
  }

  const sourceUrl = `https://api-web.nhle.com/v1/player/${entry.providerId}/landing`
  const response = await fetcher(sourceUrl)
  if (!response.ok) {
    throw new Error(`NHL returned HTTP ${response.status} for ${entry.id}`)
  }
  const seasonId = Number(entry.season.replace('-', '20'))
  return parseNhlFixture(await response.json(), {
    athleteId: entry.id,
    seasonId,
    retrievedAt,
  })
}

async function readPreviousSnapshot(): Promise<AthleteSnapshot> {
  try {
    return snapshotSchema.parse(JSON.parse(await readFile(snapshotUrl, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { generatedAt: new Date(0).toISOString(), athletes: [] }
    }
    throw error
  }
}

export async function syncData(now: Date = new Date()): Promise<AthleteSnapshot> {
  const previous = await readPreviousSnapshot()
  const next = await buildSnapshot({
    entries: publicRegistry,
    previous,
    fetchRecord: (entry) => fetchProviderRecord(entry, fetch, now),
    now,
  })

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
  await writeFile(snapshotUrl, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  syncData()
    .then((snapshot) => {
      console.log(
        `Wrote ${snapshot.athletes.length} verified athletes at ${snapshot.generatedAt}`,
      )
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
