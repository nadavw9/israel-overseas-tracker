import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseCuratedRecord } from './providers/curated'
import { parseNbaFixture } from './providers/nba'
import { parseNhlFixture } from './providers/nhl'
import type { ProviderResult } from './providers/types'
import { compilePublicRegistry, type RegistryAthlete } from '../src/data/registry'
import { registryMigrationInstant } from '../src/domain/registry'
import {
  athleteStatsSchema,
  httpsUrlSchema,
  snapshotSchema,
  type AthleteSnapshot,
} from '../src/domain/athlete'
import { coverageLedgerSchema, summarizeCoverage } from '../src/domain/coverage'
import { providerSchema } from '../src/domain/taxonomy'
import { buildSnapshot, type PreviousSnapshot } from '../src/services/snapshot'

const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
const curatedDataUrl = new URL('../data/curated-stats.json', import.meta.url)
const coverageLedgerUrl = new URL('../data/coverage/ledger.json', import.meta.url)

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
  const expectedPath = `/nba/player/_/id/${entry.binding.externalId}`
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

  if (entry.binding.provider === 'curated') {
    const records = JSON.parse(await readFile(curatedDataUrl, 'utf8')) as Record<
      string,
      unknown
    >
    return {
      ...parseCuratedRecord(entry.id, records[entry.binding.externalId]),
      retrievedAt,
    }
  }

  if (entry.binding.provider === 'espn-nba') {
    const identityUrl = `https://www.espn.com/nba/player/_/id/${entry.binding.externalId}`
    const identityResponse = await fetcher(identityUrl)
    if (!identityResponse.ok) {
      throw new Error(
        `ESPN identity check returned HTTP ${identityResponse.status} for ${entry.id}`,
      )
    }
    verifyEspnIdentity(entry, await identityResponse.text())

    const sourceUrl = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${entry.binding.externalId}/overview`
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

  const sourceUrl = `https://api-web.nhle.com/v1/player/${entry.binding.externalId}/landing`
  const response = await fetcher(sourceUrl)
  if (!response.ok) {
    throw new Error(`NHL returned HTTP ${response.status} for ${entry.id}`)
  }
  const seasonId = Number(entry.affiliation.season.replace('-', '20'))
  return parseNhlFixture(await response.json(), {
    athleteId: entry.id,
    seasonId,
    retrievedAt,
  })
}

const legacySnapshotSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    athletes: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          name: z.object({ en: z.string().trim().min(1), he: z.string().trim().min(1) }).strict(),
          sport: z.enum(['basketball', 'football', 'hockey']),
          competition: z.string().trim().min(1),
          team: z.string().trim().min(1),
          eligibility: z
            .object({ status: z.enum(['verified', 'pending']), sourceUrl: httpsUrlSchema })
            .strict(),
          visibility: z.enum(['public', 'review']),
          season: z.string().trim().min(1),
          statsStatus: z.enum(['verified', 'unavailable']),
          stats: athleteStatsSchema.nullable(),
          source: z
            .object({
              provider: providerSchema,
              sourceUrl: httpsUrlSchema,
              retrievedAt: z.iso.datetime(),
            })
            .strict(),
          freshness: z.enum(['fresh', 'stale', 'identity-only']),
          location: z
            .object({
              city: z.string().trim().min(1),
              country: z.string().trim().min(1),
              lat: z.number().gte(-90).lte(90),
              lng: z.number().gte(-180).lte(180),
            })
            .strict()
            .optional(),
          image: z
            .object({ url: httpsUrlSchema, sourceUrl: httpsUrlSchema, alt: z.string().trim().min(1) })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict()

async function readPreviousSnapshot(): Promise<PreviousSnapshot> {
  try {
    const input: unknown = JSON.parse(await readFile(snapshotUrl, 'utf8'))
    const current = snapshotSchema.safeParse(input)
    if (current.success) return current.data

    const legacy = legacySnapshotSchema.parse(input)
    return {
      athletes: legacy.athletes.flatMap((athlete) =>
        athlete.statsStatus === 'verified' && athlete.stats !== null
          ? [
              {
                id: athlete.id,
                performance: {
                  status: 'available' as const,
                  state: athlete.freshness === 'stale' ? ('stale' as const) : ('final' as const),
                  competition: athlete.competition,
                  season: athlete.season,
                  stats: athlete.stats,
                  source: athlete.source,
                },
              },
            ]
          : [],
      ),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { athletes: [] }
    }
    throw error
  }
}

function snapshotPathname(snapshotPath: string | URL) {
  return snapshotPath instanceof URL ? fileURLToPath(snapshotPath) : snapshotPath
}

export async function writeSnapshotAtomically(
  snapshotPath: string | URL,
  snapshot: unknown,
): Promise<void> {
  const target = snapshotPathname(snapshotPath)
  const extension = extname(target)
  const temp = join(dirname(target), `${basename(target, extension)}.tmp${extension || '.json'}`)

  try {
    const validated = snapshotSchema.parse(snapshot)
    const serialized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(temp, serialized, 'utf8')
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
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
  const coverageLedger = coverageLedgerSchema.parse(
    JSON.parse(await readFile(coverageLedgerUrl, 'utf8')),
  )
  const coverage = summarizeCoverage(coverageLedger)
  const next = await buildSnapshot({
    entries,
    previous,
    coverage,
    fetchRecord: (entry) => fetchProviderRecord(entry, fetch, effectiveNow),
    now: effectiveNow,
  })

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
  await writeSnapshotAtomically(snapshotUrl, next)
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
