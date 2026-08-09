import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidateQueueSchema } from '../../src/domain/registry'
import { compileRegistryBundle, publicRegistry } from '../../src/data/registry'
import { registryBundleFixture } from '../fixtures/registry'

describe('registry compiler', () => {
  it('compiles the verified public athletes in source order', () => {
    expect(publicRegistry.map((athlete) => athlete.id)).toEqual([
      'deni-avdija',
      'ben-saraf',
      'danny-wolf',
      'emanuel-sharp',
      'yarden-garzon',
      'gal-raviv',
      'omer-mayer',
      'noam-yaacov',
      'oscar-gloukh',
      'manor-solomon',
      'daniel-peretz',
      'talia-sommer',
      'vital-kats',
      'amit-vales',
      'orel-kimhi',
      'ofek-shimanov',
      'daniel-cukierman',
      'yshai-oliel',
    ])
    expect(publicRegistry.every((athlete) => athlete.eligibility.status === 'verified')).toBe(true)
    expect(publicRegistry.filter((athlete) => athlete.tier === 'international-circuit')).toHaveLength(5)
    expect(publicRegistry.filter((athlete) => athlete.tier === 'international-circuit').every((athlete) =>
      athlete.participation.kind === 'circuit-activity' && athlete.participation.activity.circuit === 'ATP',
    )).toBe(true)
    expect(publicRegistry.filter((athlete) => athlete.tier !== 'international-circuit').every((athlete) =>
      athlete.participation.kind === 'team-affiliation' && athlete.participation.affiliation.primary,
    )).toBe(true)
  })

  it('includes only verified provider bindings', () => {
    expect(publicRegistry.flatMap((athlete) => athlete.binding?.externalId ?? [])).toEqual([
      '4683021',
      '5242502',
      '5107173',
      'oscar-gloukh',
    ])
  })

  it('uses the official Israel Tennis Association Hebrew spelling for Amit Vales', () => {
    const amit = publicRegistry.find((athlete) => athlete.id === 'amit-vales')

    expect(amit?.name.he).toBe('עמית ולס')
    expect(amit?.eligibility.publisher).toBe('Israel Tennis Association')
  })

  it('does not publish media without approved rights', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined)).toBe(true)
  })

  it('keeps Ben Saraf eligibility and affiliation provenance distinct and correct', () => {
    const ben = publicRegistry.find((athlete) => athlete.id === 'ben-saraf')

    expect(ben?.eligibility).toMatchObject({
      publisher: 'FIBA',
      sourceUrl: 'https://reports.fiba.basketball/reports/2025/FIBA%20U19%20Basketball%20World%20Cup/rosters.pdf',
    })
    expect(ben?.participation.kind).toBe('team-affiliation')
    if (ben?.participation.kind !== 'team-affiliation') throw new Error('Expected team participation')
    expect(ben.participation.affiliation.source).toEqual({
      publisher: 'NBA',
      sourceUrl: 'https://www.nba.com/team/1610612751/brooklyn-nets',
      retrievedAt: '2026-08-08T08:00:00.000Z',
    })
  })
})

describe('candidate queue', () => {
  it('keeps unresolved candidates outside the public registry', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'jordan-hasson',
      'vladimir-bazilevskiy',
      'tim-vaisman',
      'lina-glushko',
      'maayan-laron',
      'mika-buchnik',
      'sofiia-nagornaia',
      'shon-abaev',
      'nir-tichon',
      'nick-ougortsin',
      'nikita-zitserman',
      'shon-kazinets',
      'itay-kerner',
      'samson-goldshtein',
      'pnina-basov',
      'lior-leshem',
      'yael-fatiev',
      'zeev-buium',
    ])
    expect(candidates.find(({ id }) => id === 'nir-tichon')?.state).toBe('affiliation-conflict')
    expect(candidates.find(({ id }) => id === 'pnina-basov')?.state).toBe('affiliation-conflict')
    expect(candidates.find(({ id }) => id === 'zeev-buium')?.state).toBe('rejected')
    expect(candidates.filter(({ id }) => !['nir-tichon', 'pnina-basov', 'zeev-buium'].includes(id))
      .every(({ state }) => state === 'needs-evidence')).toBe(true)
    expect(candidates.every((candidate) => !publicRegistry.some((athlete) => athlete.id === candidate.id))).toBe(true)
  })

  it('classifies the private ATP and WTA tennis universes while keeping public and private ids disjoint', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )
    const publicIds = new Set(publicRegistry.map(({ id }) => id))
    const zeev = candidates.find(({ id }) => id === 'zeev-buium')

    expect(candidates.filter(({ id }) => ['jordan-hasson', 'vladimir-bazilevskiy', 'tim-vaisman'].includes(id)))
      .toHaveLength(3)
    expect(candidates.filter(({ id }) => ['lina-glushko', 'maayan-laron', 'mika-buchnik', 'sofiia-nagornaia'].includes(id)))
      .toHaveLength(4)
    expect(candidates.find(({ id }) => id === 'lina-glushko')?.signals[0]?.sourceUrl)
      .toBe('https://wtafiles.wtatennis.com/pdf/rankings/Singles_Numeric.pdf')
    expect(candidates.find(({ id }) => id === 'shon-abaev')?.name.he).toBeUndefined()
    expect(zeev?.signals.some(({ note }) => /USA representation/i.test(note))).toBe(true)
    expect(zeev?.reviewerNote).toMatch(/rejected/i)
    expect(candidates.some(({ id }) => publicIds.has(id))).toBe(false)
  })
})

describe('injectable registry compiler', () => {
  it('compiles the schema-valid public tennis fixture without mutation', () => {
    const [athlete] = compileRegistryBundle(registryBundleFixture, '2026-07-23T08:00:00.000Z')

    expect(athlete).toMatchObject({
      id: 'athlete-one',
      sport: 'tennis',
      binding: { provider: 'curated', sport: 'tennis' },
      participation: {
        kind: 'team-affiliation',
        affiliation: { competition: 'ITF World Tennis Tour' },
      },
    })
  })

  it('compiles a circuit athlete without a team affiliation or provider binding', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [{
      id: 'activity-athlete-one-wimbledon-2026',
      athleteId: 'athlete-one',
      circuit: 'WTA',
      discipline: 'singles',
      competition: 'Wimbledon',
      season: '2026',
      activityType: 'sanctioned-result',
      effectiveAt: '2026-07-10T08:00:00.000Z',
      status: 'verified',
      source: {
        publisher: 'WTA',
        sourceUrl: 'https://example.com/wta/wimbledon/athlete-one',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    }]

    const athlete = compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]
    expect(athlete).toMatchObject({
      participation: {
        kind: 'circuit-activity',
        activity: { id: 'activity-athlete-one-wimbledon-2026' },
      },
    })
    expect(athlete?.binding).toBeUndefined()
  })

  it('compiles a team athlete without a provider binding', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.providerBindings = []

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]).toMatchObject({
      participation: { kind: 'team-affiliation' },
    })
    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]?.binding).toBeUndefined()
  })

  it('compiles a recent free agent using its released affiliation', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.athletes[0].lifecycleStatus = 'free-agent'
    bundle.affiliations[0].competition = 'NBA'
    bundle.affiliations[0].rosterStatus = 'released'
    bundle.affiliations[0].endDate = '2026-07-01'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'

    expect(compileRegistryBundle(bundle, '2026-07-23')[0]?.participation).toMatchObject({
      kind: 'team-affiliation',
      affiliation: { rosterStatus: 'released' },
    })
  })

  it('rejects malformed ESPN NBA binding seasons before compiling a snapshot', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = 'NBA-2025-26'

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(/ESPN NBA seasons/i)
  })

  it('selects the newest evidence, matching binding, and approved media deterministically', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'
    bundle.evidence[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.providerBindings[0].verifiedAt = '2026-07-23T07:00:00.000Z'
    bundle.media[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.evidence.push({ ...bundle.evidence[0], id: 'evidence-new', retrievedAt: '2026-07-23T08:00:00.000Z' })
    bundle.providerBindings.push({ ...bundle.providerBindings[0], id: 'binding-new', externalId: 'new', verifiedAt: '2026-07-23T08:00:00.000Z' })
    bundle.media.push({ ...bundle.media[0], id: 'media-new', retrievedAt: '2026-07-23T08:00:00.000Z' })

    const athlete = compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]
    expect(athlete?.eligibility.id).toBe('evidence-new')
    expect(athlete?.binding?.id).toBe('binding-new')
    expect(athlete?.image?.id).toBe('media-new')
  })

  it('rejects future eligibility provenance but ignores a nonmatching optional binding', () => {
    const future = structuredClone(registryBundleFixture)
    future.athletes[0].sport = 'basketball'
    future.affiliations[0].competition = 'NBA'
    future.providerBindings[0].provider = 'espn-nba'
    future.providerBindings[0].sport = 'basketball'
    future.providerBindings[0].competition = 'NBA'
    future.providerBindings[0].season = '2025-26'
    future.evidence[0].retrievedAt = '2026-07-24T08:00:00.000Z'
    future.providerBindings[0].verifiedAt = '2026-07-24T08:00:00.000Z'

    expect(() => compileRegistryBundle(future, '2026-07-23T08:00:00.000Z')).toThrow(/verified eligibility/i)

    const mismatch = structuredClone(future)
    mismatch.evidence[0].retrievedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].verifiedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].competition = 'EuroLeague'
    expect(compileRegistryBundle(mismatch, '2026-07-23T08:00:00.000Z')[0]?.binding).toBeUndefined()
  })

  it('selects the unique newest qualifying circuit activity deterministically', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [
      {
        id: 'activity-new', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/new', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
      {
        id: 'activity-old', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'WTA Rankings', season: '2026', activityType: 'ranking',
        effectiveAt: '2026-07-01T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/old', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
    ]

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]?.participation).toMatchObject({
      kind: 'circuit-activity',
      activity: { id: 'activity-new' },
    })
  })

  it('rejects ambiguous newest circuit activities with identical effective times', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [
      {
        id: 'activity-one', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/one', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
      {
        id: 'activity-two', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'doubles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/two', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
    ]

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(/ambiguous|newest/i)
  })

  it('treats equivalent instants equally and rejects fractional-second future provenance', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'
    bundle.evidence[0].retrievedAt = '2026-07-23T08:00:00Z'
    bundle.providerBindings[0].verifiedAt = '2026-07-23T08:00:00Z'
    bundle.affiliations[0].source.retrievedAt = '2026-07-23T08:00:00Z'

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toHaveLength(1)
    bundle.evidence[0].retrievedAt = '2026-07-23T08:00:00.500Z'
    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00Z')).toThrow(/eligibility/i)
  })

  it('rejects a future-sourced affiliation', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'
    bundle.affiliations[0].source.retrievedAt = '2026-07-23T08:00:00.500Z'

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00Z')).toThrow(/affiliation/i)
  })

  it.each(['loan', 'reserve', 'injured', 'suspended', 'released', 'unknown'] as const)(
    'refuses to compile a second current primary %s affiliation',
    (rosterStatus) => {
      const bundle = structuredClone(registryBundleFixture)
      bundle.affiliations.push({
        ...bundle.affiliations[0],
        id: `affiliation-athlete-one-${rosterStatus}`,
        rosterStatus,
      })

      expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(
        /exactly one current primary overseas affiliation/i,
      )
    },
  )
})
