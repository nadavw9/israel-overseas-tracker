import { describe, expect, it } from 'vitest'
import { registryBundleFixture } from '../fixtures/registry'
import {
  athleteIdentitySchema,
  candidateSchema,
  registryBundleSchema,
} from '../../src/domain/registry'
import { athleteTierSchema } from '../../src/domain/taxonomy'

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
})
