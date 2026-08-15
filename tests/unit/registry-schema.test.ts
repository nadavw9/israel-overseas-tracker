import { describe, expect, it } from 'vitest'
import type { RegistryBundleInput } from '../../src/domain/registry'
import { registryBundleFixture } from '../fixtures/registry'
import {
  affiliationSchema,
  athleteIdentitySchema,
  candidateQueueSchema,
  candidateSchema,
  circuitActivitySchema,
  createRegistryBundleSchema,
  providerBindingSchema,
} from '../../src/domain/registry'
import { athleteTierSchema, eligibilityBasisSchema } from '../../src/domain/taxonomy'

const asOfTimestamp = '2026-07-23T08:00:00.000Z'
const registryBundleSchema = createRegistryBundleSchema(asOfTimestamp)

const cloneRegistryFixture = (): RegistryBundleInput => structuredClone(registryBundleFixture)

const circuitActivity = {
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
    retrievedAt: asOfTimestamp,
  },
} as const

const circuitRegistryFixture = () => {
  const bundle = cloneRegistryFixture()
  bundle.athletes[0].tier = 'international-circuit'
  bundle.affiliations = []
  bundle.circuitActivities = [structuredClone(circuitActivity)]
  bundle.providerBindings = []
  return bundle
}

const candidateFixture = {
  id: 'candidate-one',
  name: { en: 'Candidate One', he: 'מועמד אחד' },
  sport: 'tennis',
  tier: 'international-circuit',
  genderCategory: 'men',
  state: 'new',
  signals: [
    {
      sourceUrl: 'https://example.com/candidates/candidate-one',
      sourceType: 'discovery-only',
      discoveredAt: '2026-07-23T08:00:00.000Z',
      note: 'Discovered on an international circuit entry list',
    },
  ],
  reviewerNote: 'Confirm eligibility before approval',
} as const

describe('normalized registry schemas', () => {
  it.each([
    ['bundle', (bundle: Record<string, unknown>) => { bundle.unexpected = true }],
    ['athlete row', (bundle: Record<string, unknown>) => { ((bundle.athletes as Record<string, unknown>[])[0]!).unexpected = true }],
    ['evidence row', (bundle: Record<string, unknown>) => { ((bundle.evidence as Record<string, unknown>[])[0]!).unexpected = true }],
    ['affiliation row', (bundle: Record<string, unknown>) => { ((bundle.affiliations as Record<string, unknown>[])[0]!).unexpected = true }],
    ['circuit activity row', (bundle: Record<string, unknown>) => {
      ;(bundle.circuitActivities as Record<string, unknown>[]).push({ ...circuitActivity, unexpected: true })
    }],
    ['circuit activity source', (bundle: Record<string, unknown>) => {
      ;(bundle.circuitActivities as Record<string, unknown>[]).push({
        ...circuitActivity,
        source: { ...circuitActivity.source, unexpected: true },
      })
    }],
    ['provider binding row', (bundle: Record<string, unknown>) => { ((bundle.providerBindings as Record<string, unknown>[])[0]!).unexpected = true }],
    ['media row', (bundle: Record<string, unknown>) => { ((bundle.media as Record<string, unknown>[])[0]!).unexpected = true }],
    ['athlete name', (bundle: Record<string, unknown>) => {
      const athlete = (bundle.athletes as Record<string, unknown>[])[0]!
      ;(athlete.name as Record<string, unknown>).unexpected = true
    }],
    ['affiliation organization', (bundle: Record<string, unknown>) => {
      const affiliation = (bundle.affiliations as Record<string, unknown>[])[0]!
      ;(affiliation.organization as Record<string, unknown>).unexpected = true
    }],
    ['affiliation source', (bundle: Record<string, unknown>) => {
      const affiliation = (bundle.affiliations as Record<string, unknown>[])[0]!
      ;(affiliation.source as Record<string, unknown>).unexpected = true
    }],
    ['affiliation location', (bundle: Record<string, unknown>) => {
      const affiliation = (bundle.affiliations as Record<string, unknown>[])[0]!
      affiliation.location = {
        city: 'London', country: 'United Kingdom', lat: 51.5072, lng: -0.1276,
        unexpected: true,
      }
    }],
  ])('rejects unknown keys at the normalized %s boundary', (_boundary, mutate) => {
    const bundle = structuredClone(registryBundleFixture) as unknown as Record<string, unknown>
    mutate(bundle)

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('evaluates lifecycle rules against the supplied as-of instant', () => {
    const freeAgent = cloneRegistryFixture()
    freeAgent.athletes[0].lifecycleStatus = 'free-agent'
    freeAgent.affiliations[0].rosterStatus = 'released'
    freeAgent.affiliations[0].endDate = '2026-07-01'

    expect(createRegistryBundleSchema('2026-07-23T08:00:00.000Z').safeParse(freeAgent).success).toBe(true)
    expect(createRegistryBundleSchema('2026-10-01T08:00:00.000Z').safeParse(freeAgent).success).toBe(false)
  })

  it('accepts a complete registry bundle', () => {
    expect(registryBundleSchema.safeParse(registryBundleFixture).success).toBe(true)
  })

  it.each([
    'senior-professional',
    'college',
    'development',
    'international-circuit',
  ] as const)('accepts the %s athlete tier', (tier) => {
    expect(athleteTierSchema.parse(tier)).toBe(tier)
  })

  it('keeps citizenship and represents-israel as distinct evidence bases', () => {
    const result = registryBundleSchema.parse(registryBundleFixture)

    expect(result.evidence.map((claim) => claim.basis)).toEqual([
      'citizenship',
      'represents-israel',
    ])
  })

  it('accepts nationality as a distinct evidence basis', () => {
    expect(eligibilityBasisSchema.parse('nationality')).toBe('nationality')
  })

  it('requires provider binding season and rejects unknown binding keys', () => {
    const { season: _, ...withoutSeason } = registryBundleFixture.providerBindings[0]

    expect(providerBindingSchema.safeParse(withoutSeason).success).toBe(false)
    expect(providerBindingSchema.safeParse({
      ...registryBundleFixture.providerBindings[0],
      unexpected: true,
    }).success).toBe(false)
  })

  it.each([
    'NBA-2025-26',
    '2025',
    '2025-2026',
    '2025-27',
    '2025-25',
    '1945-46',
    '9999-00',
    '0000-01',
  ])('rejects malformed ESPN NBA binding season %s', (season) => {
    expect(providerBindingSchema.safeParse({
      ...registryBundleFixture.providerBindings[0],
      provider: 'espn-nba',
      sport: 'basketball',
      competition: 'NBA',
      season,
    }).success).toBe(false)
  })

  it.each(['1946-47', '2025-26', '2099-00'])('accepts canonical ESPN NBA binding season %s', (season) => {
    expect(providerBindingSchema.safeParse({
      ...registryBundleFixture.providerBindings[0],
      provider: 'espn-nba',
      sport: 'basketball',
      competition: 'NBA',
      season,
    }).success).toBe(true)
  })

  it('validates Sportradar Soccer composite identity bindings', () => {
    const binding = {
      ...registryBundleFixture.providerBindings[0],
      provider: 'sportradar-soccer',
      sport: 'football',
      competition: 'MLS',
      season: '2025',
      externalId: 'sr:season:127179|sr:competitor:2502|sr:player:45970',
    }
    expect(providerBindingSchema.safeParse(binding).success).toBe(true)
    expect(providerBindingSchema.safeParse({ ...binding, externalId: 'season|competitor|player' }).success).toBe(false)
    expect(providerBindingSchema.safeParse({ ...binding, externalId: 'sr:season:127179|sr:player:45970|sr:competitor:2502' }).success).toBe(false)
  })

  it('validates API-Football numeric composite identity bindings', () => {
    const binding = {
      ...registryBundleFixture.providerBindings[0],
      provider: 'api-football',
      sport: 'football',
      competition: 'MLS',
      season: '2025',
      externalId: '12345|253|2025',
    }
    expect(providerBindingSchema.safeParse(binding).success).toBe(true)
    expect(providerBindingSchema.safeParse({ ...binding, externalId: '12345|253|25' }).success).toBe(false)
    expect(providerBindingSchema.safeParse({ ...binding, externalId: '12345|253|2025|extra' }).success).toBe(false)
  })

  it('validates ESPN NCAA basketball composite identity bindings', () => {
    const binding = {
      ...registryBundleFixture.providerBindings[0],
      provider: 'espn-ncaa-basketball',
      sport: 'basketball',
      competition: 'NCAA Division I',
      season: '2025-26',
      externalId: 'mens-college-basketball|2509|5312035|2026',
    }
    expect(providerBindingSchema.safeParse(binding).success).toBe(true)
    expect(providerBindingSchema.safeParse({ ...binding, externalId: 'mens-college-basketball|2509|5312035' }).success).toBe(false)
    expect(providerBindingSchema.safeParse({ ...binding, season: '2026-27' }).success).toBe(false)
  })

  it('accepts the strict circuit activity shape', () => {
    expect(circuitActivitySchema.parse(circuitActivity)).toEqual(circuitActivity)
    expect(circuitActivitySchema.safeParse({ ...circuitActivity, competition: '   ' }).success).toBe(false)
    expect(circuitActivitySchema.safeParse({ ...circuitActivity, season: '' }).success).toBe(false)
  })

  it('allows an international-circuit athlete with a verified current activity and no team affiliation or binding', () => {
    expect(registryBundleSchema.safeParse(circuitRegistryFixture()).success).toBe(true)
  })

  it('allows a team athlete without a provider binding', () => {
    const bundle = cloneRegistryFixture()
    bundle.providerBindings = []

    expect(registryBundleSchema.safeParse(bundle).success).toBe(true)
  })

  it('rejects a public athlete with neither qualifying participation kind', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities = []

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects a public athlete with both team and qualifying circuit participation', () => {
    const bundle = cloneRegistryFixture()
    bundle.circuitActivities.push(structuredClone(circuitActivity))

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it.each([
    ['future effective time', (activity: Record<string, unknown>) => { activity.effectiveAt = '2026-07-23T08:00:00.001Z' }],
    ['future source time', (activity: Record<string, unknown>) => {
      ;(activity.source as Record<string, unknown>).retrievedAt = '2026-07-23T08:00:00.001Z'
    }],
    ['stale effective time', (activity: Record<string, unknown>) => { activity.effectiveAt = '2025-07-22T07:59:59.999Z' }],
    ['pending status', (activity: Record<string, unknown>) => { activity.status = 'pending' }],
    ['conflicting status', (activity: Record<string, unknown>) => { activity.status = 'conflicting' }],
  ])('rejects an international-circuit athlete whose only activity has a %s', (_label, mutate) => {
    const bundle = circuitRegistryFixture()
    mutate(bundle.circuitActivities[0] as unknown as Record<string, unknown>)

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects duplicate circuit activity ids', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities.push(structuredClone(bundle.circuitActivities[0]))

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects a circuit activity referencing an unknown athlete', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities[0].athleteId = 'missing-athlete'

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('accepts multiple qualifying activities with distinct effective times', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities.push({
      ...structuredClone(bundle.circuitActivities[0]),
      id: 'activity-athlete-one-wimbledon-qualifying-2026',
      effectiveAt: '2026-07-09T08:00:00.000Z',
    })

    expect(registryBundleSchema.safeParse(bundle).success).toBe(true)
  })

  it('rejects ambiguous newest circuit activities at the same effective time', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities.push({
      ...structuredClone(bundle.circuitActivities[0]),
      id: 'activity-athlete-one-wimbledon-doubles-2026',
      discipline: 'doubles',
    })

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects a verified circuit activity owned by a review non-circuit athlete', () => {
    const bundle = cloneRegistryFixture()
    bundle.circuitActivities.push({
      ...structuredClone(circuitActivity),
      id: 'activity-athlete-two-wimbledon-2026',
      athleteId: 'athlete-two',
    })

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it.each([
    ['pending', (activity: Record<string, unknown>) => { activity.status = 'pending' }],
    ['stale', (activity: Record<string, unknown>) => { activity.effectiveAt = '2025-07-22T07:59:59.999Z' }],
  ])('rejects a %s circuit activity owned by a public non-circuit athlete', (_label, mutate) => {
    const bundle = cloneRegistryFixture()
    const activity = structuredClone(circuitActivity) as unknown as Record<string, unknown>
    mutate(activity)
    bundle.circuitActivities.push(activity as typeof circuitActivity)

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects an international-circuit activity owned by a non-tennis athlete', () => {
    const bundle = circuitRegistryFixture()
    bundle.athletes[0].sport = 'basketball'

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('rejects a circuit activity that differs from the athlete declared discipline', () => {
    const bundle = circuitRegistryFixture()
    bundle.circuitActivities[0].discipline = 'doubles'

    expect(registryBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it('accepts an optional para classification for a tennis athlete', () => {
    const tennisAthlete = {
      ...registryBundleFixture.athletes[0],
      paraClassification: 'Quad',
    }

    expect(athleteIdentitySchema.parse(tennisAthlete).paraClassification).toBe('Quad')
  })

  it('rejects a duplicate provider identity pair', () => {
    const duplicatePair = structuredClone(registryBundleFixture)
    duplicatePair.providerBindings.push({
      ...duplicatePair.providerBindings[0],
      id: 'binding-athlete-two-itf',
      athleteId: 'athlete-two',
    })

    expect(registryBundleSchema.safeParse(duplicatePair).success).toBe(false)
  })

  it('accepts a historical primary affiliation', () => {
    const withHistory = structuredClone(registryBundleFixture)
    withHistory.affiliations.push({
      ...withHistory.affiliations[0],
      id: 'affiliation-athlete-one-itf-2025',
      season: '2025',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })

    expect(registryBundleSchema.safeParse(withHistory).success).toBe(true)
  })

  it('rejects two current primary overseas affiliations', () => {
    const duplicateCurrentPrimary = structuredClone(registryBundleFixture)
    duplicateCurrentPrimary.affiliations.push({
      ...duplicateCurrentPrimary.affiliations[0],
      id: 'affiliation-athlete-one-second-current',
      organization: {
        name: 'Example Tennis Club',
        type: 'club',
        country: 'France',
      },
      competition: 'Example Tennis League',
    })

    expect(registryBundleSchema.safeParse(duplicateCurrentPrimary).success).toBe(false)
  })

  it.each(['loan', 'reserve', 'injured', 'suspended', 'released', 'unknown'] as const)(
    'rejects a simultaneous current primary %s affiliation alongside the active affiliation',
    (rosterStatus) => {
      const conflicting = cloneRegistryFixture()
      conflicting.affiliations.push({
        ...conflicting.affiliations[0],
        id: `affiliation-athlete-one-${rosterStatus}`,
        rosterStatus,
      })

      expect(registryBundleSchema.safeParse(conflicting).success).toBe(false)
    },
  )

  it('rejects a public athlete without verified eligibility', () => {
    const withoutVerifiedEligibility = structuredClone(registryBundleFixture)
    withoutVerifiedEligibility.evidence = withoutVerifiedEligibility.evidence.filter(
      (claim) => claim.athleteId !== 'athlete-one',
    )

    expect(registryBundleSchema.safeParse(withoutVerifiedEligibility).success).toBe(false)
  })

  it('rejects an affiliation whose end date precedes its start date', () => {
    const reversedInterval = {
      ...registryBundleFixture.affiliations[0],
      startDate: '2026-07-23',
      endDate: '2026-07-22',
    }

    expect(affiliationSchema.safeParse(reversedInterval).success).toBe(false)
  })

  it('does not treat a future affiliation as current', () => {
    const futureAffiliation = cloneRegistryFixture()
    futureAffiliation.affiliations[0].startDate = '2026-07-24'

    expect(registryBundleSchema.safeParse(futureAffiliation).success).toBe(false)
  })

  it('accepts a current affiliation with a bounded interval', () => {
    const boundedCurrentAffiliation = cloneRegistryFixture()
    boundedCurrentAffiliation.affiliations[0].endDate = '2026-07-23'

    expect(registryBundleSchema.safeParse(boundedCurrentAffiliation).success).toBe(true)
  })

  it('allows an active public athlete with one current active affiliation', () => {
    expect(registryBundleSchema.safeParse(registryBundleFixture).success).toBe(true)
  })

  it('allows an injured public athlete with one current active affiliation', () => {
    const injuredAthlete = cloneRegistryFixture()
    injuredAthlete.athletes[0].lifecycleStatus = 'injured'

    expect(registryBundleSchema.safeParse(injuredAthlete).success).toBe(true)
  })

  it('allows a recent free agent with one primary overseas released affiliation', () => {
    const recentFreeAgent = cloneRegistryFixture()
    recentFreeAgent.athletes[0].lifecycleStatus = 'free-agent'
    recentFreeAgent.affiliations[0].rosterStatus = 'released'
    recentFreeAgent.affiliations[0].endDate = '2026-07-01'

    expect(registryBundleSchema.safeParse(recentFreeAgent).success).toBe(true)
  })

  it('rejects a free agent who also has a current primary overseas affiliation', () => {
    const activelyRosteredFreeAgent = cloneRegistryFixture()
    activelyRosteredFreeAgent.athletes[0].lifecycleStatus = 'free-agent'
    activelyRosteredFreeAgent.affiliations[0].rosterStatus = 'released'
    activelyRosteredFreeAgent.affiliations[0].endDate = '2026-07-01'
    activelyRosteredFreeAgent.affiliations.push({
      ...activelyRosteredFreeAgent.affiliations[0],
      id: 'affiliation-athlete-one-current-club',
      startDate: '2026-07-10',
      endDate: undefined,
      rosterStatus: 'active',
    })

    expect(registryBundleSchema.safeParse(activelyRosteredFreeAgent).success).toBe(false)
  })

  it('rejects a free agent whose release is older than 90 days', () => {
    const expiredFreeAgent = cloneRegistryFixture()
    expiredFreeAgent.athletes[0].lifecycleStatus = 'free-agent'
    expiredFreeAgent.affiliations[0].rosterStatus = 'released'
    expiredFreeAgent.affiliations[0].endDate = '2026-04-23'

    const result = registryBundleSchema.safeParse(expiredFreeAgent)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'A public free agent requires one overseas release within the previous 90 days',
            path: ['athletes', 0, 'lifecycleStatus'],
          }),
        ]),
      )
    }
  })

  it('rejects a free agent whose release date is in the future', () => {
    const futureFreeAgent = cloneRegistryFixture()
    futureFreeAgent.athletes[0].lifecycleStatus = 'free-agent'
    futureFreeAgent.affiliations[0].rosterStatus = 'released'
    futureFreeAgent.affiliations[0].endDate = '2026-07-24'

    expect(registryBundleSchema.safeParse(futureFreeAgent).success).toBe(false)
  })

  it.each(['retired', 'inactive', 'unknown'] as const)(
    'rejects a public athlete with %s lifecycle status',
    (lifecycleStatus) => {
      const ineligibleLifecycle = cloneRegistryFixture()
      ineligibleLifecycle.athletes[0].lifecycleStatus = lifecycleStatus

      expect(registryBundleSchema.safeParse(ineligibleLifecycle).success).toBe(false)
    },
  )

  it('rejects a provider binding whose sport differs from the athlete sport', () => {
    const mismatchedBinding = cloneRegistryFixture()
    mismatchedBinding.providerBindings[0].sport = 'hockey'

    const result = registryBundleSchema.safeParse(mismatchedBinding)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['providerBindings', 0, 'sport'] }),
        ]),
      )
    }
  })

  it('rejects a provider used with an incompatible sport', () => {
    const incompatibleProvider = cloneRegistryFixture()
    incompatibleProvider.providerBindings[0].provider = 'espn-nba'

    const result = registryBundleSchema.safeParse(incompatibleProvider)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['providerBindings', 0, 'provider'] }),
        ]),
      )
    }
  })

  it('requires candidate ids to be slugs', () => {
    expect(candidateSchema.safeParse({ ...candidateFixture, id: 'Candidate One' }).success).toBe(
      false,
    )
  })

  it.each([
    ['candidate', (candidate: Record<string, unknown>) => { candidate.unexpected = true }],
    ['candidate name', (candidate: Record<string, unknown>) => {
      ;(candidate.name as Record<string, unknown>).unexpected = true
    }],
    ['candidate signal', (candidate: Record<string, unknown>) => {
      ;((candidate.signals as Record<string, unknown>[])[0]!).unexpected = true
    }],
    ['candidate proposed affiliation', (candidate: Record<string, unknown>) => {
      candidate.proposedAffiliation = {
        organization: 'Example Tennis Club',
        competition: 'Example Tennis League',
        season: '2026',
        unexpected: true,
      }
    }],
    ['candidate location', (candidate: Record<string, unknown>) => {
      candidate.location = {
        city: 'London', country: 'United Kingdom', lat: 51.5072, lng: -0.1276,
        unexpected: true,
      }
    }],
  ])('rejects unknown keys at the %s boundary', (_boundary, mutate) => {
    const candidate = structuredClone(candidateFixture) as unknown as Record<string, unknown>
    mutate(candidate)

    expect(candidateSchema.safeParse(candidate).success).toBe(false)
  })

  it('requires at least one candidate signal', () => {
    expect(candidateSchema.safeParse({ ...candidateFixture, signals: [] }).success).toBe(false)
  })

  it('accepts a trimmed non-empty proposed organization string', () => {
    const result = candidateSchema.parse({
      ...candidateFixture,
      proposedAffiliation: {
        organization: '  Example Tennis Club  ',
        competition: 'Example Tennis League',
        season: '2026',
      },
    })

    expect(result.proposedAffiliation?.organization).toBe('Example Tennis Club')
  })

  it('rejects a blank proposed organization', () => {
    const result = candidateSchema.safeParse({
      ...candidateFixture,
      proposedAffiliation: {
        organization: '   ',
        competition: 'Example Tennis League',
        season: '2026',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'too_small',
            path: ['proposedAffiliation', 'organization'],
          }),
        ]),
      )
    }
  })

  it('requires a proposed affiliation season of at least four characters', () => {
    const result = candidateSchema.safeParse({
      ...candidateFixture,
      proposedAffiliation: {
        organization: 'Example Tennis Club',
        competition: 'Example Tennis League',
        season: '26',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'too_small',
            path: ['proposedAffiliation', 'season'],
          }),
        ]),
      )
    }
  })

  it('requires a non-empty reviewer note', () => {
    const { reviewerNote: _, ...withoutReviewerNote } = candidateFixture

    expect(candidateSchema.safeParse(withoutReviewerNote).success).toBe(false)
    expect(candidateSchema.safeParse({ ...candidateFixture, reviewerNote: '   ' }).success).toBe(
      false,
    )
  })

  it('rejects duplicate candidate ids at the queue level', () => {
    const duplicateCandidate = {
      ...candidateFixture,
      name: { en: 'Candidate Duplicate', he: 'Candidate Duplicate' },
    }
    const result = candidateQueueSchema.safeParse([candidateFixture, duplicateCandidate])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: [1, 'id'] })]),
      )
    }
  })
})
