import { readFile, mkdir, rename, rm, open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, extname, join, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseCuratedRecord } from './providers/curated'
import { parseNbaFixture, parseNbaSeasonEndingYear } from './providers/nba'
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
    return parseCuratedRecord(entry.id, records[entry.binding.externalId])
  }

  if (entry.binding.provider === 'espn-nba') {
    const seasonYear = parseNbaSeasonEndingYear(entry.affiliation.season)
    const sourceUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/athletes/${entry.binding.externalId}/statistics?lang=en&region=us`
    const response = await fetcher(sourceUrl)
    if (!response.ok) {
      throw new Error(`ESPN returned HTTP ${response.status} for ${entry.id}`)
    }
    return parseNbaFixture(await response.json(), {
      athleteId: entry.id,
      externalId: entry.binding.externalId,
      seasonYear,
      season: entry.affiliation.season,
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
    externalId: entry.binding.externalId,
    expectedName: entry.name.en,
    seasonId,
    season: entry.affiliation.season,
    sourceUrl,
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

export function parsePreviousSnapshot(input: unknown): PreviousSnapshot {
  const current = snapshotSchema.safeParse(input)
  if (current.success) return current.data

  const legacy = legacySnapshotSchema.parse(input)
  return {
    athletes: legacy.athletes.flatMap((athlete) =>
      athlete.visibility === 'public' &&
      athlete.eligibility.status === 'verified' &&
      athlete.statsStatus === 'verified' &&
      athlete.stats !== null &&
      new Date(athlete.source.retrievedAt).getTime() <= new Date(legacy.generatedAt).getTime()
        ? [{
            id: athlete.id,
            performance: {
              status: 'available' as const,
              state: athlete.freshness === 'stale' ? ('stale' as const) : ('final' as const),
              competition: athlete.competition,
              season: athlete.season,
              stats: athlete.stats,
              source: athlete.source,
            },
          }]
        : [],
    ),
  }
}

async function readPreviousSnapshot(): Promise<PreviousSnapshot> {
  try {
    const input: unknown = JSON.parse(await readFile(snapshotUrl, 'utf8'))
    return parsePreviousSnapshot(input)
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

async function renameReplacing(temp: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temp, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)))
    }
  }
}

export async function writeSnapshotAtomically(
  snapshotPath: string | URL,
  snapshot: unknown,
): Promise<void> {
  const target = snapshotPathname(snapshotPath)
  const extension = extname(target)
  const temp = join(dirname(target), `${basename(target, extension)}.${process.pid}.${randomUUID()}.tmp${extension || '.json'}`)
  let handle: Awaited<ReturnType<typeof open>> | undefined

  try {
    const validated = snapshotSchema.parse(snapshot)
    const serialized = `${JSON.stringify(validated, null, 2)}\n`
    handle = await open(temp, 'wx')
    await handle.writeFile(serialized, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    const writtenBytes = await readFile(temp, 'utf8')
    snapshotSchema.parse(JSON.parse(writtenBytes))
    await renameReplacing(temp, target)
  } catch (error) {
    await handle?.close().catch(() => undefined)
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
  const coverage = summarizeCoverage(coverageLedger, effectiveNow)
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
