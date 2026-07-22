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
    generatedAt: '2026-07-22T12:00:00.000Z',
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
          stats: null,
          state: 'final',
          sourceUrl: 'https://example.com/no-stats',
          retrievedAt: generatedAt,
        }),
        now: new Date(generatedAt),
      }),
    ).rejects.toThrow(/coverage|complete/i)
  })
})

describe('fetchProviderRecord', () => {
  it('uses only normalized binding and affiliation fields for ESPN', async () => {
    const requestedUrls: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      const requestedUrl = String(input)
      requestedUrls.push(requestedUrl)

      if (requestedUrl.includes('espn.com/nba/player/_/id/')) {
        return new Response(
          '<meta property="og:title" content="Deni Avdija - Portland Trail Blazers Forward - ESPN"><link rel="canonical" href="https://www.espn.com/nba/player/_/id/4683021/deni-avdija">',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }

      return new Response(JSON.stringify(deniFixture), { status: 200 })
    }

    const result = await fetchProviderRecord(entry, fakeFetch, new Date(generatedAt))

    expect(requestedUrls).toEqual([
      `https://www.espn.com/nba/player/_/id/${entry.binding.externalId}`,
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${entry.binding.externalId}/overview`,
    ])
    expect(result).toMatchObject({ athleteId: entry.id, state: 'final' })
  })

  it('rejects ESPN stats when the binding resolves to another athlete', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        `<meta property="og:title" content="Another Player - Example Team - ESPN"><link rel="canonical" href="https://www.espn.com/nba/player/_/id/${entry.binding.externalId}/another-player">`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      )

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
