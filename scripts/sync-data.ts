import { readFile, mkdir, rename, rm, open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, extname, join, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import { defaultProviderAdapters } from './providers/registry'
import {
  summarizeProviderSettledResults,
  writeRefreshManifestAtomically,
  type ProviderAttemptOutcome,
} from './refresh/manifest'
import type { ProviderAdapterMap, ProviderResult } from './providers/types'
import { compilePublicRegistry, type RegistryAthlete } from '../src/data/registry'
import { registryMigrationInstant } from '../src/domain/registry'
import {
  athleteStatsSchema,
  httpsUrlSchema,
  publicAffiliationSchema,
  publicEligibilitySchema,
  publicMediaSchema,
  snapshotSchema,
  type AthleteSnapshot,
} from '../src/domain/athlete'
import {
  coverageLedgerSchema,
  coverageSummarySchema,
  publicCoverageFromLedger,
} from '../src/domain/coverage'
import {
  athleteTierSchema,
  genderCategorySchema,
  lifecycleStatusSchema,
  observationStateSchema,
  providerSchema,
  sportSchema,
} from '../src/domain/taxonomy'
import { buildSnapshot, type PreviousSnapshot } from '../src/services/snapshot'
import { loadLocalEnv } from './load-env'

const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
const refreshManifestUrl = new URL('../public/data/refresh-manifest.json', import.meta.url)
const coverageLedgerUrl = new URL('../data/coverage/ledger.json', import.meta.url)

export async function fetchProviderRecord(
  entry: RegistryAthlete,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
  options: { adapters?: ProviderAdapterMap } = {},
): Promise<ProviderResult> {
  const binding = entry.binding
  if (binding === undefined) {
    throw new Error(`Provider binding required for ${entry.id}`)
  }

  const adapter = (options.adapters ?? defaultProviderAdapters)[binding.provider]
  if (adapter === undefined) {
    throw new Error(`Provider adapter missing for ${binding.provider}`)
  }
  return adapter({ entry, fetcher, now })
}

const nonEmptyStringSchema = z.string().trim().min(1)
const predecessorPerformanceSourceSchema = z
  .object({
    provider: providerSchema,
    sourceUrl: httpsUrlSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()
const predecessorPerformanceContext = {
  competition: nonEmptyStringSchema,
  season: nonEmptyStringSchema,
  source: predecessorPerformanceSourceSchema,
}
const predecessorPerformanceSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      state: observationStateSchema.exclude(['unavailable']),
      stats: athleteStatsSchema,
      ...predecessorPerformanceContext,
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      state: z.literal('unavailable'),
      stats: z.null(),
      ...predecessorPerformanceContext,
    })
    .strict(),
])
const predecessorAthleteSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.object({ en: nonEmptyStringSchema, he: nonEmptyStringSchema }).strict(),
    aliases: z.array(nonEmptyStringSchema),
    sport: sportSchema,
    discipline: nonEmptyStringSchema.optional(),
    genderCategory: genderCategorySchema,
    tier: athleteTierSchema,
    lifecycleStatus: lifecycleStatusSchema,
    visibility: z.literal('public'),
    eligibility: publicEligibilitySchema,
    affiliation: publicAffiliationSchema,
    performance: predecessorPerformanceSchema,
    image: publicMediaSchema.optional(),
  })
  .strict()
  .superRefine((athlete, context) => {
    if (
      athlete.performance.status === 'available' &&
      athlete.performance.stats.kind !== athlete.sport
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stats kind must match athlete sport',
        path: ['performance', 'stats', 'kind'],
      })
    }
    if (athlete.performance.competition !== athlete.affiliation.competition) {
      context.addIssue({
        code: 'custom',
        message: 'Performance competition must match affiliation competition',
        path: ['performance', 'competition'],
      })
    }
    if (athlete.performance.season !== athlete.affiliation.season) {
      context.addIssue({
        code: 'custom',
        message: 'Performance season must match affiliation season',
        path: ['performance', 'season'],
      })
    }
  })
const predecessorSnapshotSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    athletes: z.array(predecessorAthleteSchema),
    coverage: coverageSummarySchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const seen = new Set<string>()
    snapshot.athletes.forEach((athlete, index) => {
      if (seen.has(athlete.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate athlete id: ${athlete.id}`,
          path: ['athletes', index, 'id'],
        })
      }
      seen.add(athlete.id)
    })
  })

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

  const predecessor = predecessorSnapshotSchema.safeParse(input)
  if (predecessor.success) {
    const generatedMilliseconds = new Date(predecessor.data.generatedAt).getTime()
    return {
      athletes: predecessor.data.athletes.flatMap((athlete) =>
        athlete.performance.status === 'available' &&
        new Date(athlete.performance.source.retrievedAt).getTime() <= generatedMilliseconds
          ? [{ id: athlete.id, performance: athlete.performance }]
          : [],
      ),
    }
  }

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

async function readPreviousSnapshot(snapshotPath: string | URL = snapshotUrl): Promise<PreviousSnapshot> {
  try {
    const input: unknown = JSON.parse(await readFile(snapshotPath, 'utf8'))
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

export type PerformanceRefreshOptions = {
  now?: Date
  fetcher?: typeof fetch
  adapters?: ProviderAdapterMap
  snapshotPath?: string | URL
  manifestPath?: string | URL
  coveragePath?: string | URL
}

export async function runPerformanceRefresh(
  options: PerformanceRefreshOptions = {},
): Promise<{ snapshot: AthleteSnapshot; manifest: import('../src/domain/refresh').RefreshManifest }> {
  const startedAt = Date.now()
  const effectiveNow = resolveSyncNow(options.now, new Date())
  const snapshotPath = options.snapshotPath ?? snapshotUrl
  const manifestPath = options.manifestPath ?? refreshManifestUrl
  const coveragePath = options.coveragePath ?? coverageLedgerUrl
  const fetcher = options.fetcher ?? fetch
  const previous = await readPreviousSnapshot(snapshotPath)
  const entries = compilePublicRegistry(effectiveNow)
  const coverageLedger = coverageLedgerSchema.parse(
    JSON.parse(await readFile(coveragePath, 'utf8')),
  )
  const coverage = publicCoverageFromLedger(coverageLedger, effectiveNow)
  const outcomes: ProviderAttemptOutcome[] = []
  let unboundSkipped = 0

  for (const entry of entries) {
    if (entry.binding === undefined) unboundSkipped += 1
  }

  const next = await buildSnapshot({
    entries,
    previous,
    coverage,
    fetchRecord: async (entry) => {
      const binding = entry.binding
      if (binding === undefined) {
        throw new Error(`Provider binding required for ${entry.id}`)
      }
      const attemptStartedAt = Date.now()
      try {
        const result = await fetchProviderRecord(entry, fetcher, effectiveNow, {
          adapters: options.adapters,
        })
        outcomes.push({
          provider: binding.provider,
          status: 'succeeded',
          durationMs: Math.max(0, Date.now() - attemptStartedAt),
        })
        return result
      } catch (error) {
        outcomes.push({
          provider: binding.provider,
          status: 'failed',
          durationMs: Math.max(0, Date.now() - attemptStartedAt),
        })
        throw error
      }
    },
    now: effectiveNow,
  })

  const manifest = {
    generatedAt: effectiveNow.toISOString(),
    snapshotGeneratedAt: next.generatedAt,
    durationMs: Math.max(0, Date.now() - startedAt),
    unboundSkipped,
    providers: summarizeProviderSettledResults(outcomes),
  }

  const target = snapshotPathname(snapshotPath)
  await mkdir(dirname(target), { recursive: true })
  await writeSnapshotAtomically(snapshotPath, next)
  await writeRefreshManifestAtomically(manifestPath, manifest)
  return { snapshot: next, manifest }
}

export async function syncData(now?: Date): Promise<AthleteSnapshot> {
  // The initial data is deliberately watermarked; only implicit CLI runs bootstrap to it.
  return (await runPerformanceRefresh({ now })).snapshot
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  loadLocalEnv()
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
