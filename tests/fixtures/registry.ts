import type { RegistryBundleInput } from '../../src/domain/registry'

const fixtureTimestamp = '2026-07-23T08:00:00.000Z'

export const registryBundleFixture = {
  athletes: [
    {
      id: 'athlete-one',
      name: { en: 'Athlete One', he: 'אתלט אחת' },
      aliases: ['A. One'],
      sport: 'tennis',
      discipline: 'singles',
      genderCategory: 'women',
      tier: 'senior-professional',
      lifecycleStatus: 'active',
      visibility: 'public',
    },
    {
      id: 'athlete-two',
      name: { en: 'Athlete Two', he: 'אתלט שניים' },
      aliases: [],
      sport: 'hockey',
      genderCategory: 'men',
      tier: 'development',
      lifecycleStatus: 'unknown',
      visibility: 'review',
    },
  ],
  evidence: [
    {
      id: 'evidence-athlete-one-citizenship',
      athleteId: 'athlete-one',
      basis: 'citizenship',
      status: 'verified',
      publisher: 'Example Tennis Federation',
      sourceUrl: 'https://example.com/evidence/athlete-one',
      retrievedAt: fixtureTimestamp,
      matchedOn: ['name', 'governing-body-identity'],
    },
    {
      id: 'evidence-athlete-two-representation',
      athleteId: 'athlete-two',
      basis: 'represents-israel',
      status: 'pending',
      publisher: 'Example Hockey Federation',
      sourceUrl: 'https://example.com/evidence/athlete-two',
      retrievedAt: fixtureTimestamp,
      matchedOn: ['name', 'governing-body-identity'],
    },
  ],
  affiliations: [
    {
      id: 'affiliation-athlete-one-itf-2026',
      athleteId: 'athlete-one',
      organization: {
        name: 'ITF World Tennis Tour',
        type: 'tour-membership',
        country: 'United Kingdom',
      },
      competition: 'ITF World Tennis Tour',
      season: '2026',
      startDate: '2026-01-01',
      primary: true,
      rosterStatus: 'active',
      countsAsOverseas: true,
      source: {
        publisher: 'International Tennis Federation',
        sourceUrl: 'https://example.com/affiliations/athlete-one',
        retrievedAt: fixtureTimestamp,
      },
    },
  ],
  providerBindings: [
    {
      id: 'binding-athlete-one-itf',
      athleteId: 'athlete-one',
      provider: 'curated',
      externalId: 'athlete-one',
      sport: 'tennis',
      competition: 'ITF World Tennis Tour',
      status: 'verified',
      matchedOn: ['name', 'governing-body-identity'],
      verifiedAt: fixtureTimestamp,
    },
  ],
  media: [
    {
      id: 'media-athlete-one-portrait',
      athleteId: 'athlete-one',
      url: 'https://example.com/media/athlete-one.jpg',
      sourceUrl: 'https://example.com/media/athlete-one-license',
      rightsStatus: 'approved',
      rightsHolder: 'Example Photographer',
      license: 'cc-by',
      usage: 'editorial-display',
      attribution: 'Example Photographer / CC BY',
      retrievedAt: fixtureTimestamp,
      alt: 'Athlete One playing tennis',
    },
  ],
} satisfies RegistryBundleInput
