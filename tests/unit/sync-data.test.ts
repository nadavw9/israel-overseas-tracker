import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AthleteSnapshot, PublicPerformance } from '../../src/domain/athlete'
import { compileRegistryBundle, publicRegistry } from '../../src/data/registry'
import type { RegistryAthlete } from '../../src/data/registry'
import type { RegistryBundleInput } from '../../src/domain/registry'
import { rankAthletesBySport } from '../../src/services/rankings'
import { buildSnapshot } from '../../src/services/snapshot'
import { registryBundleFixture } from '../fixtures/registry'
import deniFixture from '../../data/fixtures/nba-deni.json'
import zeevFixture from '../../data/fixtures/nhl-zeev.json'
import {
  fetchProviderRecord,
  resolveSyncNow,
  writeSnapshotAtomically,
} from '../../scripts/sync-data'

const generatedAt = '2026-07-23T08:00:00.000Z'
const coverage = { required: 4, healthy: 0, complete: false } as const
const entry = publicRegistry[0]
if (entry?.participation.kind !== 'team-affiliation' || entry.binding === undefined) {
  throw new Error('Expected a bound team athlete fixture')
}
const secondEntry = publicRegistry[1]
if (secondEntry?.participation.kind !== 'team-affiliation' || secondEntry.binding === undefined) {
  throw new Error('Expected a second bound team athlete fixture')
}
const providerContext = {
  sport: entry.sport,
  competition: entry.binding.competition,
  season: entry.binding.season,
} as const

function circuitEntry(): RegistryAthlete {
  const bundle = structuredClone(registryBundleFixture) as RegistryBundleInput
  const athlete = bundle.athletes[0]
  if (athlete === undefined) throw new Error('Missing circuit athlete fixture')
  athlete.tier = 'international-circuit'
  bundle.affiliations = []
  bundle.circuitActivities = [{
    id: 'activity-athlete-one-itf-2026',
    athleteId: athlete.id,
    circuit: 'ITF',
    discipline: 'singles',
    competition: 'ITF World Tennis Tour',
    season: '2026',
    activityType: 'sanctioned-result',
    effectiveAt: generatedAt,
    status: 'verified',
    source: {
      publisher: 'International Tennis Federation',
      sourceUrl: 'https://example.com/results/athlete-one',
      retrievedAt: generatedAt,
    },
  }]
  const compiled = compileRegistryBundle(bundle, generatedAt)[0]
  if (compiled === undefined) throw new Error('Missing compiled circuit athlete')
  return compiled
}

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
        participation: {
          kind: 'team-affiliation',
          affiliation: {
            organization: { ...entry.participation.affiliation.organization, name: 'Old Team' },
            competition: entry.participation.affiliation.competition,
            season: entry.participation.affiliation.season,
            rosterStatus: entry.participation.affiliation.rosterStatus,
            countsAsOverseas: true,
            source: entry.participation.affiliation.source,
            ...(entry.participation.affiliation.location
              ? { location: entry.participation.affiliation.location }
              : {}),
          },
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
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: entry.participation.affiliation.organization,
          competition: entry.participation.affiliation.competition,
          season: entry.participation.affiliation.season,
        },
      },
      performance: {
        status: 'available',
        state: 'corrected',
        competition: entry.binding.competition,
        season: entry.binding.season,
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

  it('keeps an identity-only athlete without a binding and never calls its provider', async () => {
    const identityOnly = structuredClone(entry) as RegistryAthlete
    delete identityOnly.binding
    let calls = 0

    const next = await buildSnapshot({
      entries: [identityOnly],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async () => {
        calls += 1
        throw new Error('must not be called')
      },
      now: new Date(generatedAt),
    })

    expect(calls).toBe(0)
    expect(next.athletes[0]?.performance).toEqual({
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'not-integrated',
    })
  })

  it('publishes a source-free not-integrated result when a binding returns null stats', async () => {
    const next = await buildSnapshot({
      entries: [entry],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async () => ({
        athleteId: entry.id,
        ...providerContext,
        stats: null,
        state: 'final',
        sourceUrl: 'https://example.com/no-stats',
        retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]?.performance).toEqual({
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'not-integrated',
    })
  })

  it('isolates a failed athlete without history while publishing another athlete', async () => {
    const next = await buildSnapshot({
      entries: [entry, secondEntry],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async (current) => {
        if (current.id === entry.id) throw new Error('provider unavailable')
        if (current.binding === undefined) throw new Error('Missing test binding')
        return {
          athleteId: current.id,
          sport: current.binding.sport,
          competition: current.binding.competition,
          season: current.binding.season,
          stats: availablePerformance().stats,
          state: 'final',
          sourceUrl: 'https://example.com/available',
          retrievedAt: generatedAt,
        }
      },
      now: new Date(generatedAt),
    })

    expect(next.athletes).toHaveLength(2)
    expect(next.athletes[0]?.performance).toMatchObject({
      status: 'unavailable',
      reason: 'provider-unavailable',
    })
    expect(next.athletes[1]?.performance).toMatchObject({ status: 'available' })
  })

  it('accepts binding-season performance alongside a newer team affiliation season', async () => {
    const nextSeason = structuredClone(entry)
    nextSeason.participation.affiliation.season = '2026-27'

    const next = await buildSnapshot({
      entries: [nextSeason],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async () => ({
        athleteId: nextSeason.id,
        ...providerContext,
        stats: availablePerformance().stats,
        state: 'final',
        sourceUrl: 'https://example.com/prior-season',
        retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]).toMatchObject({
      participation: { affiliation: { season: '2026-27' } },
      performance: { status: 'available', season: '2025-26' },
    })
  })

  it('publishes exact circuit activity without fabricating a team or map location', async () => {
    const circuit = circuitEntry()
    if (circuit.binding === undefined) throw new Error('Expected circuit binding')
    const next = await buildSnapshot({
      entries: [circuit],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async () => ({
        athleteId: circuit.id,
        sport: circuit.binding!.sport,
        competition: circuit.binding!.competition,
        season: circuit.binding!.season,
        stats: null,
        state: 'final',
        observedOrganization: 'Imaginary Tennis Club',
        sourceUrl: 'https://example.com/circuit-stats',
        retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]?.participation).toEqual({
      kind: 'circuit-activity',
      activity: circuit.participation.kind === 'circuit-activity'
        ? {
            circuit: circuit.participation.activity.circuit,
            discipline: circuit.participation.activity.discipline,
            competition: circuit.participation.activity.competition,
            season: circuit.participation.activity.season,
            activityType: circuit.participation.activity.activityType,
            effectiveAt: circuit.participation.activity.effectiveAt,
            source: circuit.participation.activity.source,
          }
        : undefined,
    })
    expect(next.athletes[0]).not.toHaveProperty('affiliation')
    expect(next.athletes[0]).not.toHaveProperty('organization')
    expect(next.athletes[0]).not.toHaveProperty('location')
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
    expect(next.athletes[0].participation).toEqual({
      kind: 'team-affiliation',
      affiliation: {
        organization: entry.participation.affiliation.organization,
        competition: entry.participation.affiliation.competition,
        season: entry.participation.affiliation.season,
        rosterStatus: entry.participation.affiliation.rosterStatus,
        countsAsOverseas: true,
        source: entry.participation.affiliation.source,
        ...(entry.participation.affiliation.location
          ? { location: entry.participation.affiliation.location }
          : {}),
      },
    })
    expect(next.athletes[0].performance.stats).toEqual(prior.athletes[0].performance.stats)
    expect(next.athletes[0].performance.state).toBe('stale')
    expect(next.athletes[0].image).toBeUndefined()
  })

  it.each([
    ['provider mismatch', (performance: PublicPerformance) => {
      if (performance.status === 'available') performance.source.provider = 'nhl'
    }],
    ['competition mismatch', (performance: PublicPerformance) => {
      if (performance.status === 'available') performance.competition = 'EuroLeague'
    }],
    ['season mismatch', (performance: PublicPerformance) => {
      if (performance.status === 'available') performance.season = '2024-25'
    }],
    ['sport mismatch', (performance: PublicPerformance) => {
      if (performance.status === 'available') {
        performance.stats = { kind: 'football', appearances: 1, goals: 0, assists: 0 }
      }
    }],
    ['future observation', (performance: PublicPerformance) => {
      if (performance.status === 'available') {
        performance.source.retrievedAt = '2026-07-23T08:00:00.001Z'
      }
    }],
    ['expired observation', (performance: PublicPerformance) => {
      if (performance.status === 'available') {
        performance.source.retrievedAt = '2026-07-21T07:59:59.999Z'
      }
    }],
  ])('does not retain prior performance with a %s', async (_label, mutate) => {
    const prior = previousSnapshot()
    mutate(prior.athletes[0]!.performance)
    const next = await buildSnapshot({
      entries: [entry], previous: prior, coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]?.performance).toEqual({
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'provider-unavailable',
    })
  })

  it('does not retain performance belonging to another athlete identity', async () => {
    const prior = previousSnapshot()
    prior.athletes[0]!.id = 'another-athlete'

    const next = await buildSnapshot({
      entries: [entry],
      previous: prior,
      coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]?.performance).toMatchObject({
      status: 'unavailable',
      reason: 'provider-unavailable',
    })
  })

  it('retains prior source context unchanged at the exact 48-hour boundary', async () => {
    const prior = previousSnapshot()
    const performance = prior.athletes[0]?.performance
    if (performance?.status !== 'available') throw new Error('Expected available history')
    performance.source.retrievedAt = '2026-07-21T08:00:00.000Z'
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
      stats: null,
      reason: 'not-integrated',
    }

    const next = await buildSnapshot({
      entries: [entry],
      previous: prior,
      coverage,
      fetchRecord: async () => {
        throw new Error('provider unavailable')
      },
      now: new Date(generatedAt),
    })
    expect(next.athletes[0]?.performance).toMatchObject({
      status: 'unavailable',
      reason: 'provider-unavailable',
    })
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

  it('rejects available performance outside the current participation competition', async () => {
    const changedCompetition = structuredClone(entry)
    changedCompetition.participation.affiliation.competition = 'EuroLeague'

    await expect(buildSnapshot({
      entries: [changedCompetition],
      previous: { athletes: [] },
      coverage,
      fetchRecord: async () => ({
        athleteId: changedCompetition.id,
        ...providerContext,
        stats: availablePerformance().stats,
        state: 'final',
        sourceUrl: 'https://example.com/old-competition',
        retrievedAt: generatedAt,
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

  it.each([
    ['exact 48-hour boundary', '2026-07-21T08:00:00.000Z'],
    ['one millisecond inside retention', '2026-07-21T08:00:00.001Z'],
  ])('accepts fulfilled available performance at the %s', async (_case, retrievedAt) => {
    const next = await buildSnapshot({
      entries: [entry], previous: { athletes: [] }, coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...providerContext, stats: availablePerformance().stats,
        state: 'final', sourceUrl: 'https://example.com/retained', retrievedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0].performance.status).toBe('available')
  })

  it.each([
    ['one millisecond outside retention', '2026-07-21T07:59:59.999Z'],
    ['future available observation', '2026-07-23T08:00:00.001Z'],
  ])('rejects fulfilled %s before it can enter the snapshot', async (_case, retrievedAt) => {
    await expect(buildSnapshot({
      entries: [entry], previous: { athletes: [] }, coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...providerContext, stats: availablePerformance().stats,
        state: 'final', sourceUrl: 'https://example.com/rejected', retrievedAt,
      }),
      now: new Date(generatedAt),
    })).rejects.toThrow(/retention|future|snapshot|generated/i)
  })

  it('rejects a future fulfilled unavailable observation causally', async () => {
    await expect(buildSnapshot({
      entries: [entry], previous: { athletes: [] }, coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...providerContext, stats: null, state: 'final',
        sourceUrl: 'https://example.com/future-unavailable',
        retrievedAt: '2026-07-23T08:00:00.001Z',
      }),
      now: new Date(generatedAt),
    })).rejects.toThrow(/future|snapshot|generated/i)
  })

  it('allows an old fulfilled unavailable identity-only observation', async () => {
    const next = await buildSnapshot({
      entries: [entry], previous: { athletes: [] }, coverage,
      fetchRecord: async () => ({
        athleteId: entry.id, ...providerContext, stats: null, state: 'final',
        sourceUrl: 'https://example.com/old-unavailable',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0].performance).toEqual({
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'not-integrated',
    })
  })

  it('publishes the valid tennis fixture identity-only and excludes it from rankings', async () => {
    const tennisEntry = compileRegistryBundle(
      registryBundleFixture,
      '2026-07-23T08:00:00.000Z',
    )[0]!
    const next = await buildSnapshot({
      entries: [tennisEntry], previous: { athletes: [] }, coverage,
      fetchRecord: async () => ({
        athleteId: tennisEntry.id,
        sport: 'tennis',
        competition: 'ITF World Tennis Tour',
        season: '2026',
        stats: null,
        state: 'final',
        sourceUrl: 'https://example.com/itf/athlete-one',
        retrievedAt: generatedAt,
      }),
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]).toMatchObject({
      id: 'athlete-one',
      sport: 'tennis',
      performance: { status: 'unavailable', stats: null, reason: 'not-integrated' },
    })
    expect(rankAthletesBySport(next.athletes)).toEqual([])
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

  it('derives the ESPN season endpoint from the binding rather than current participation', async () => {
    const newerAffiliation = structuredClone(entry)
    newerAffiliation.participation.affiliation.season = '2026-27'
    const requestedUrls: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify(deniFixture), { status: 200 })
    }

    const result = await fetchProviderRecord(newerAffiliation, fakeFetch, new Date(generatedAt))

    expect(requestedUrls[0]).toContain('/seasons/2026/')
    expect(result.season).toBe('2025-26')
  })

  it('rejects a non-canonical NBA binding season before fetching', async () => {
    const invalid = structuredClone(entry)
    invalid.binding.season = 'NBA-2025-26'
    let fetched = false

    await expect(fetchProviderRecord(invalid, async () => {
      fetched = true
      return new Response(JSON.stringify(deniFixture), { status: 200 })
    }, new Date(generatedAt))).rejects.toThrow(/NBA season/i)
    expect(fetched).toBe(false)
  })

  it('fails explicitly when provider fetching is called without a binding', async () => {
    const identityOnly = structuredClone(entry) as RegistryAthlete
    delete identityOnly.binding

    await expect(fetchProviderRecord(identityOnly, async () => {
      throw new Error('must not fetch')
    }, new Date(generatedAt))).rejects.toThrow(/binding.*required|missing.*binding/i)
  })

  it('selects NHL rows from the binding season rather than current participation', async () => {
    const hockeyEntry = structuredClone(entry) as RegistryAthlete
    hockeyEntry.id = 'zeev-buium'
    hockeyEntry.name = { en: 'Zeev Buium', he: 'זאב בויום' }
    hockeyEntry.sport = 'hockey'
    if (hockeyEntry.participation.kind !== 'team-affiliation') {
      throw new Error('Expected team participation')
    }
    hockeyEntry.participation.affiliation.organization.name = 'Vancouver Canucks'
    hockeyEntry.participation.affiliation.competition = 'NHL'
    hockeyEntry.participation.affiliation.season = '2026-27'
    if (hockeyEntry.binding === undefined) throw new Error('Expected provider binding')
    hockeyEntry.binding.provider = 'nhl'
    hockeyEntry.binding.externalId = '8484798'
    hockeyEntry.binding.sport = 'hockey'
    hockeyEntry.binding.competition = 'NHL'
    hockeyEntry.binding.season = '2025-26'

    const result = await fetchProviderRecord(
      hockeyEntry,
      async () => new Response(JSON.stringify(zeevFixture), { status: 200 }),
      new Date(generatedAt),
    )

    expect(result).toMatchObject({ competition: 'NHL', season: '2025-26' })
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

  it('migrates the checked-in normalized predecessor snapshot', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const predecessor: unknown = JSON.parse(await readFile(
      join(process.cwd(), 'public/data/snapshot.json'),
      'utf8',
    ))

    const previous = parsePreviousSnapshot(predecessor)

    expect(previous.athletes.map((athlete) => athlete.id)).toEqual([
      'deni-avdija',
      'ben-saraf',
      'oscar-gloukh',
    ])
    expect(previous.athletes.filter(
      (athlete) => athlete.performance.status === 'available',
    )).toHaveLength(2)
  })

  it('accepts the checked-in current unavailable record without a performance source', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const predecessor = JSON.parse(await readFile(
      join(process.cwd(), 'public/data/snapshot.json'),
      'utf8',
    )) as { athletes: Array<{ id: string; performance: { status: string; source?: unknown } }> }
    const unavailable = predecessor.athletes[2]
    if (unavailable === undefined) {
      throw new Error('Checked-in predecessor fixtures are incomplete')
    }
    const previous = parsePreviousSnapshot(predecessor)

    expect(unavailable.performance.status).toBe('unavailable')
    expect(unavailable.performance).not.toHaveProperty('source')
    expect(previous.athletes.map((athlete) => athlete.id)).toContain('oscar-gloukh')
  })

  it('rejects private or unknown fields in a normalized predecessor snapshot', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const predecessor = JSON.parse(await readFile(
      join(process.cwd(), 'public/data/snapshot.json'),
      'utf8',
    )) as { athletes: Array<Record<string, unknown>> }
    const athlete = predecessor.athletes[0]
    if (athlete === undefined) throw new Error('Checked-in predecessor fixture is empty')
    athlete.birthDate = '2001-01-02'

    expect(() => parsePreviousSnapshot(predecessor)).toThrow(/birthDate|unrecognized/i)
  })

  it('accepts the current source-free unavailable shape without making it stale', async () => {
    const { parsePreviousSnapshot } = await import('../../scripts/sync-data')
    const current = previousSnapshot()
    current.athletes[0]!.performance = {
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'not-integrated',
    }

    const previous = parsePreviousSnapshot(current)
    const next = await buildSnapshot({
      entries: [entry],
      previous,
      coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date(generatedAt),
    })

    expect(next.athletes[0]?.performance).toEqual({
      status: 'unavailable',
      state: 'unavailable',
      stats: null,
      reason: 'provider-unavailable',
    })
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

    const next = await buildSnapshot({
      entries: [entry],
      previous,
      coverage,
      fetchRecord: async () => { throw new Error('provider unavailable') },
      now: new Date('2026-07-23T10:00:00.000Z'),
    })
    expect(next.athletes[0]?.performance).toMatchObject({
      status: 'unavailable',
      reason: 'provider-unavailable',
    })
  })
})
