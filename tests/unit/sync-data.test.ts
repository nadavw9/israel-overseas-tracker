import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AthleteSnapshot } from '../../src/domain/athlete'
import { publicRegistry } from '../../src/data/registry'
import { buildSnapshot } from '../../src/services/snapshot'
import deniFixture from '../../data/fixtures/nba-deni.json'
import {
  fetchProviderRecord,
  resolveSyncNow,
  writeSnapshotAtomically,
} from '../../scripts/sync-data'

const generatedAt = '2026-07-23T08:00:00.000Z'
const coverage = { required: 4, healthy: 0, complete: false } as const
const entry = publicRegistry[0]
const providerContext = {
  sport: entry.sport,
  competition: entry.affiliation.competition,
  season: entry.affiliation.season,
} as const

function availablePerformance() {
  return {
    status: 'available' as const,
    state: 'final' as const,
    competition: 'NBA',
    season: '2025-26',
    stats: {
      kind: 'basketball' as const,
      games: 66,
      pointsPerGame: 24.2,
      reboundsPerGame: 6.9,
      assistsPerGame: 6.7,
    },
    source: {
      provider: 'espn-nba' as const,
      sourceUrl: 'https://example.com/deni',
      retrievedAt: '2026-07-22T12:00:00.000Z',
    },
  }
}

function previousSnapshot(): AthleteSnapshot {
  return {
    generatedAt,
    coverage,
    athletes: [
      {
        id: entry.id,
        name: { en: 'Outdated Name', he: 'שם ישן' },
        aliases: ['old alias'],
        sport: entry.sport,
        genderCategory: entry.genderCategory,
        tier: entry.tier,
        lifecycleStatus: entry.lifecycleStatus,
        visibility: 'public',
        eligibility: {
          basis: entry.eligibility.basis,
          publisher: entry.eligibility.publisher,
          sourceUrl: entry.eligibility.sourceUrl,
          retrievedAt: entry.eligibility.retrievedAt,
        },
        affiliation: {
          organization: { ...entry.affiliation.organization, name: 'Old Team' },
          competition: entry.affiliation.competition,
          season: entry.affiliation.season,
          rosterStatus: entry.affiliation.rosterStatus,
          countsAsOverseas: true,
          source: entry.affiliation.source,
          ...(entry.affiliation.location ? { location: entry.affiliation.location } : {}),
        },
        performance: availablePerformance(),
        image: {
          url: 'https://example.com/old.jpg',
          sourceUrl: 'https://example.com/old-license',
          alt: 'Old image',
          rightsStatus: 'approved',
          rightsHolder: 'Old holder',
          license: 'cc-by',
          usage: 'editorial-display',
          retrievedAt: '2026-07-22T12:00:00.000Z',
        },
      },
    ],
  }
}

describe('buildSnapshot', () => {
  it('compiles normalized public fields and provider performance', async () => {
    const next = await buildSnapshot({
      entries: [entry],
      previous: previousSnapshot(),
      coverage,
      fetchRecord: async () => ({
        athleteId: entry.id,
        ...providerContext,
        stats: availablePerformance().stats,
        state: 'corrected',
        observedOrganization: 'PORTLAND—TRAIL BLAZERS!',
        sourceUrl: 'https://example.com/fresh-stats',
        retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.coverage).toEqual(coverage)
    expect(next.athletes[0]).toMatchObject({
      name: entry.name,
      aliases: entry.aliases,
      affiliation: {
        organization: entry.affiliation.organization,
        competition: entry.affiliation.competition,
        season: entry.affiliation.season,
      },
      performance: {
        status: 'available',
        state: 'corrected',
        competition: entry.affiliation.competition,
        season: entry.affiliation.season,
        stats: availablePerformance().stats,
        source: { provider: entry.binding.provider },
      },
    })
    expect(next.athletes[0]).not.toHaveProperty('team')
    expect(next.athletes[0]).not.toHaveProperty('stats')
  })

  it('rejects an observed organization that differs from verified affiliation', async () => {
    await expect(
      buildSnapshot({
        entries: [entry],
        previous: previousSnapshot(),
        coverage,
        fetchRecord: async () => ({
          athleteId: entry.id,
          ...providerContext,
          stats: availablePerformance().stats,
          state: 'final',
          observedOrganization: 'Brooklyn Nets',
          sourceUrl: 'https://example.com/wrong-team',
          retrievedAt: generatedAt,
        }),
        now: new Date(generatedAt),
      }),
    ).rejects.toThrow(/organization mismatch/i)
  })

  it('rebuilds registry truth and reuses only prior verified performance on failure', async () => {
    const prior = previousSnapshot()
    const next = await buildSnapshot({
      entries: [entry],
      previous: prior,
      coverage,
      fetchRecord: async () => {
        throw new Error('provider unavailable')
      },
      now: new Date(generatedAt),
    })

    expect(next.athletes[0].name).toEqual(entry.name)
    expect(next.athletes[0].affiliation.organization).toEqual(entry.affiliation.organization)
    expect(next.athletes[0].performance.stats).toEqual(prior.athletes[0].performance.stats)
    expect(next.athletes[0].performance.state).toBe('stale')
    expect(next.athletes[0].image).toBeUndefined()
  })

  it.each([
    ['competition mismatch', (prior: AthleteSnapshot) => { prior.athletes[0].performance.competition = 'EuroLeague' }],
    ['season mismatch', (prior: AthleteSnapshot) => { prior.athletes[0].performance.season = '2024-25' }],
    ['sport mismatch', (prior: AthleteSnapshot) => { prior.athletes[0].performance.stats = { kind: 'football', appearances: 1, goals: 0, assists: 0 } }],
    ['future observation', (prior: AthleteSnapshot) => { prior.athletes[0].performance.source.retrievedAt = '2026-07-23T08:00:00.001Z' }],
    ['expired observation', (prior: AthleteSnapshot) => { prior.athletes[0].performance.source.retrievedAt = '2026-07-21T07:59:59.999Z' }],
  ])('fails closed on prior %s', async (_label, mutate) => {
    const prior = previousSnapshot()
    mutate(prior)
    await expect(buildSnapshot({
      entries: [entry], previous: prior, coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date(generatedAt),
    })).rejects.toThrow(/No verified data available/i)
  })

  it('retains prior source context unchanged at the exact 48-hour boundary', async () => {
    const prior = previousSnapshot()
    prior.athletes[0].performance.source.retrievedAt = '2026-07-21T08:00:00.000Z'
    const next = await buildSnapshot({
      entries: [entry], previous: prior, coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date(generatedAt),
    })
    expect(next.athletes[0].performance).toEqual({ ...prior.athletes[0].performance, state: 'stale' })
  })

  it('fails closed when prior performance is unavailable', async () => {
    const prior = previousSnapshot()
    prior.athletes[0].performance = {
      status: 'unavailable',
      state: 'unavailable',
      competition: 'NBA',
      season: '2025-26',
      stats: null,
      source: availablePerformance().source,
    }

    await expect(
      buildSnapshot({
        entries: [entry],
        previous: prior,
        coverage,
        fetchRecord: async () => {
          throw new Error('provider unavailable')
        },
        now: new Date(generatedAt),
      }),
    ).rejects.toThrow(/No verified data available/)
  })

  it('rejects a provider result for a different registry athlete', async () => {
    await expect(
      buildSnapshot({
        entries: [entry],
        previous: previousSnapshot(),
        coverage,
        fetchRecord: async () => ({
          athleteId: 'ben-saraf',
          ...providerContext,
          stats: availablePerformance().stats,
          state: 'final',
          sourceUrl: 'https://example.com/wrong-athlete',
          retrievedAt: generatedAt,
        }),
        now: new Date(generatedAt),
      }),
    ).rejects.toThrow(/provider identity mismatch/i)
  })

  it('rejects dishonest coverage before returning a snapshot', async () => {
    await expect(
      buildSnapshot({
        entries: [entry],
        previous: previousSnapshot(),
        coverage: { required: 4, healthy: 4, complete: false },
        fetchRecord: async () => ({
          athleteId: entry.id,
          ...providerContext,
          stats: null,
          state: 'final',
          sourceUrl: 'https://example.com/no-stats',
          retrievedAt: generatedAt,
        }),
        now: new Date(generatedAt),
      }),
    ).rejects.toThrow(/coverage|complete/i)
  })

  it.each([
    ['sport', { ...providerContext, sport: 'football', stats: null }],
    ['competition', { ...providerContext, competition: 'EuroLeague', stats: null }],
    ['season', { ...providerContext, season: '2024-25', stats: null }],
  ] as const)('rejects provider %s context that differs from verified registry context', async (_field, context) => {
    await expect(buildSnapshot({
      entries: [entry], previous: previousSnapshot(), coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...context, state: 'final',
        sourceUrl: 'https://example.com/context', retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })).rejects.toThrow(/context mismatch/i)
  })

  it('rejects a provider observation after the snapshot clock', async () => {
    await expect(buildSnapshot({
      entries: [entry], previous: previousSnapshot(), coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...providerContext, stats: null, state: 'final',
        sourceUrl: 'https://example.com/future', retrievedAt: '2026-07-23T08:00:00.001Z',
      }),
      now: new Date(generatedAt),
    })).rejects.toThrow(/snapshot|generated|future/i)
  })
})

describe('fetchProviderRecord', () => {
  it('uses a season-specific ESPN endpoint whose payload verifies athlete and season', async () => {
    const requestedUrls: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      const requestedUrl = String(input)
      requestedUrls.push(requestedUrl)

      return new Response(JSON.stringify(deniFixture), { status: 200 })
    }

    const result = await fetchProviderRecord(entry, fakeFetch, new Date(generatedAt))

    expect(requestedUrls).toEqual([
      `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/${entry.binding.externalId}/statistics?lang=en&region=us`,
    ])
    expect(result).toMatchObject({ athleteId: entry.id, ...providerContext, state: 'final' })
  })

  it('rejects ESPN stats when the binding resolves to another athlete', async () => {
    const wrongAthlete = structuredClone(deniFixture)
    wrongAthlete.athlete.$ref = wrongAthlete.athlete.$ref.replace('4683021', '9999999')
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify(wrongAthlete), { status: 200 })

    await expect(fetchProviderRecord(entry, fakeFetch, new Date(generatedAt))).rejects.toThrow(
      /identity mismatch/i,
    )
  })
})

describe('writeSnapshotAtomically', () => {
  it('writes a validated snapshot and leaves no temp file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snapshot-atomic-'))
    const path = join(directory, 'snapshot.json')
    try {
      const snapshot = previousSnapshot()
      await writeSnapshotAtomically(path, snapshot)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(snapshot)
      expect(await readdir(directory)).toEqual(['snapshot.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('supports concurrent writers without sharing or leaking temp files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snapshot-atomic-concurrent-'))
    const path = join(directory, 'snapshot.json')
    try {
      const snapshots = ['Alpha', 'Bravo', 'Charlie'].map((name) => {
        const snapshot = previousSnapshot()
        snapshot.athletes[0].name = { en: name, he: name }
        return snapshot
      })
      await Promise.all(snapshots.map((snapshot) => writeSnapshotAtomically(path, snapshot)))
      const written = JSON.parse(await readFile(path, 'utf8')) as AthleteSnapshot
      expect(snapshots).toContainEqual(written)
      expect(await readdir(directory)).toEqual(['snapshot.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('atomically replaces an existing target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snapshot-atomic-replace-'))
    const path = join(directory, 'snapshot.json')
    try {
      const first = previousSnapshot()
      const replacement = previousSnapshot()
      replacement.athletes[0].name = { en: 'Replacement', he: 'Replacement' }
      await writeSnapshotAtomically(path, first)
      await writeSnapshotAtomically(path, replacement)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(replacement)
      expect(await readdir(directory)).toEqual(['snapshot.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('cleans the temp file when validation or rename fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snapshot-atomic-failure-'))
    const targetDirectory = join(directory, 'snapshot.json')
    await mkdir(targetDirectory)
    try {
      await expect(
        writeSnapshotAtomically(join(directory, 'invalid.json'), {
          ...previousSnapshot(),
          coverage: { required: 4, healthy: 4, complete: false },
        }),
      ).rejects.toThrow()
      await expect(writeSnapshotAtomically(targetDirectory, previousSnapshot())).rejects.toThrow()
      expect((await readdir(directory)).sort()).toEqual(['snapshot.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('sync clock resolution', () => {
  it('bootstraps only an implicit clock to the migration watermark', () => {
    const early = new Date('2026-07-22T00:00:00.000Z')
    expect(resolveSyncNow(undefined, early).toISOString()).toBe(generatedAt)
    expect(resolveSyncNow(early, new Date('2026-07-24T00:00:00.000Z'))).toBe(early)
  })
})

describe('legacy snapshot migration', () => {
  it('exposes a trust-boundary parser for isolated migration tests', async () => {
    const syncModule = await import('../../scripts/sync-data')
    expect(syncModule).toHaveProperty('parsePreviousSnapshot')
  })

  it('retains only public, eligibility-verified history with non-null verified stats', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const legacyAthlete = (id: string) => ({
      id,
      name: { en: id, he: id },
      sport: 'basketball', competition: 'NBA', team: 'Example', season: '2025-26',
      eligibility: { status: 'verified', sourceUrl: 'https://example.com/eligibility' },
      visibility: 'public', statsStatus: 'verified',
      stats: { kind: 'basketball', games: 1, pointsPerGame: 1, reboundsPerGame: 1, assistsPerGame: 1 },
      source: { provider: 'espn-nba', sourceUrl: 'https://example.com/stats', retrievedAt: generatedAt },
      freshness: 'fresh',
    } as const)
    const retained = legacyAthlete('retained')
    const review = { ...legacyAthlete('review-history'), visibility: 'review' as const }
    const pending = {
      ...legacyAthlete('pending-history'),
      eligibility: { status: 'pending' as const, sourceUrl: 'https://example.com/eligibility' },
    }
    const unavailable = { ...legacyAthlete('unavailable-history'), statsStatus: 'unavailable' as const, stats: null }

    expect(parsePreviousSnapshot({
      generatedAt,
      athletes: [retained, review, pending, unavailable],
    }).athletes.map((athlete) => athlete.id)).toEqual(['retained'])
  })

  it('never publishes future-dated legacy performance through stale fallback', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const legacy = {
      generatedAt: '2026-07-23T08:00:00.000Z',
      athletes: [{
        id: entry.id,
        name: entry.name,
        sport: 'basketball', competition: 'NBA', team: 'Portland Trail Blazers', season: '2025-26',
        eligibility: { status: 'verified', sourceUrl: 'https://example.com/eligibility' },
        visibility: 'public', statsStatus: 'verified',
        stats: availablePerformance().stats,
        source: {
          provider: 'espn-nba', sourceUrl: 'https://example.com/stats',
          retrievedAt: '2026-07-23T09:00:00.000Z',
        },
        freshness: 'fresh',
      }],
    } as const

    const previous = parsePreviousSnapshot(legacy)
    expect(previous.athletes).toEqual([])

    await expect(buildSnapshot({
      entries: [entry],
      previous,
      coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date('2026-07-23T10:00:00.000Z'),
    })).rejects.toThrow(/No verified data available/i)
  })
})
