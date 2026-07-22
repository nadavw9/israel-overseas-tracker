import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseCuratedRecord } from './providers/curated'
import { parseNbaFixture } from './providers/nba'
import { parseNhlFixture } from './providers/nhl'
import type { ProviderResult } from './providers/types'
import { compilePublicRegistry, type RegistryAthlete } from '../src/data/registry'
import { registryMigrationInstant } from '../src/domain/registry'
import { snapshotSchema, type AthleteSnapshot } from '../src/domain/athlete'
import { buildSnapshot } from '../src/services/snapshot'

const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
const curatedDataUrl = new URL('../data/curated-stats.json', import.meta.url)

function htmlAttribute(
  html: string,
  tagName: 'link' | 'meta',
  matchAttribute: string,
  matchValue: string,
  valueAttribute: string,
): string | undefined {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? []

  for (const tag of tags) {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
        (match) => [match[1].toLowerCase(), match[2] ?? match[3]],
      ),
    )

    if (attributes[matchAttribute]?.toLowerCase() === matchValue) {
      return attributes[valueAttribute]
    }
  }
}

function normalizedIdentity(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]/g, '')
}

function verifyEspnIdentity(entry: RegistryAthlete, html: string): void {
  const title = htmlAttribute(html, 'meta', 'property', 'og:title', 'content')
  const canonical = htmlAttribute(html, 'link', 'rel', 'canonical', 'href')

  if (!title || !canonical) {
    throw new Error(`ESPN identity metadata missing for ${entry.id}`)
  }

  const canonicalUrl = new URL(canonical)
  const expectedPath = `/nba/player/_/id/${entry.providerId}`
  const upstreamName = title.split(' - ')[0]
  const identityMatches =
    canonicalUrl.protocol === 'https:' &&
    (canonicalUrl.hostname === 'espn.com' ||
      canonicalUrl.hostname.endsWith('.espn.com')) &&
    (canonicalUrl.pathname === expectedPath ||
      canonicalUrl.pathname.startsWith(`${expectedPath}/`)) &&
    normalizedIdentity(upstreamName) === normalizedIdentity(entry.name.en)

  if (!identityMatches) {
    throw new Error(
      `ESPN identity mismatch for ${entry.id}: received ${upstreamName || 'unknown athlete'}`,
    )
  }
}

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
    const identityUrl = `https://www.espn.com/nba/player/_/id/${entry.providerId}`
    const identityResponse = await fetcher(identityUrl)
    if (!identityResponse.ok) {
      throw new Error(
        `ESPN identity check returned HTTP ${identityResponse.status} for ${entry.id}`,
      )
    }
    verifyEspnIdentity(entry, await identityResponse.text())

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

export function resolveSyncNow(explicitNow: Date | undefined, systemNow: Date): Date {
  if (explicitNow !== undefined) return explicitNow
  const migrationMilliseconds = new Date(registryMigrationInstant).getTime()
  return systemNow.getTime() < migrationMilliseconds ? new Date(migrationMilliseconds) : systemNow
}

export async function syncData(now?: Date): Promise<AthleteSnapshot> {
  // The initial data is deliberately watermarked; only implicit CLI runs bootstrap to it.
  const effectiveNow = resolveSyncNow(now, new Date())
  const previous = await readPreviousSnapshot()
  const entries = compilePublicRegistry(effectiveNow)
  const next = await buildSnapshot({
    entries,
    previous,
    fetchRecord: (entry) => fetchProviderRecord(entry, fetch, effectiveNow),
    now: effectiveNow,
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
