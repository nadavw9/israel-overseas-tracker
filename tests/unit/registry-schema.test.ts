import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RegistryBundleInput } from '../../src/domain/registry'
import { registryBundleFixture } from '../fixtures/registry'
import {
  affiliationSchema,
  athleteIdentitySchema,
  candidateQueueSchema,
  candidateSchema,
  registryBundleSchema,
} from '../../src/domain/registry'
import { athleteTierSchema } from '../../src/domain/taxonomy'

const asOfTimestamp = '2026-07-23T08:00:00.000Z'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(asOfTimestamp))
})

afterAll(() => {
  vi.useRealTimers()
})

const cloneRegistryFixture = (): RegistryBundleInput => structuredClone(registryBundleFixture)

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
