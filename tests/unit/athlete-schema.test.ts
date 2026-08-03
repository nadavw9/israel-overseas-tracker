import { describe, expect, it } from 'vitest'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'

const validAthlete = {
  id: 'deni-avdija',
  name: { en: 'Deni Avdija', he: 'דני אבדיה' },
  aliases: ['Deni Avdija'],
  sport: 'basketball',
  genderCategory: 'men',
  tier: 'senior-professional',
  lifecycleStatus: 'active',
  visibility: 'public',
  eligibility: {
    basis: 'citizenship',
    publisher: 'NBA',
    sourceUrl: 'https://www.nba.com/player/1630166/deni-avdija/profile',
    retrievedAt: '2026-07-23T08:00:00.000Z',
  },
  affiliation: {
    organization: {
      name: 'Portland Trail Blazers',
      type: 'club',
      country: 'United States',
    },
    competition: 'NBA',
    season: '2025-26',
    rosterStatus: 'active',
    countsAsOverseas: true,
    source: {
      publisher: 'NBA',
      sourceUrl: 'https://www.nba.com/blazers/roster',
      retrievedAt: '2026-07-23T08:00:00.000Z',
    },
    location: { city: 'Portland', country: 'United States', lat: 45.5152, lng: -122.6784 },
  },
  performance: {
    status: 'available',
    state: 'final',
    competition: 'NBA',
    season: '2025-26',
    stats: {
      kind: 'basketball',
      games: 66,
      pointsPerGame: 24.2,
      reboundsPerGame: 6.9,
      assistsPerGame: 6.7,
    },
    source: {
      provider: 'espn-nba',
      sourceUrl:
        'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1630166/stats',
      retrievedAt: '2026-07-23T08:00:00.000Z',
    },
  },
  image: {
    url: 'https://example.com/deni.jpg',
    sourceUrl: 'https://example.com/deni-license',
    alt: 'Deni Avdija playing basketball',
    rightsStatus: 'approved',
    rightsHolder: 'Example Photographer',
    license: 'cc-by',
    usage: 'editorial-display',
    attribution: 'Example Photographer / CC BY',
    retrievedAt: '2026-07-23T08:00:00.000Z',
  },
} as const

const validSnapshot = {
  generatedAt: '2026-07-23T08:00:00.000Z',
  athletes: [validAthlete],
  coverage: { required: 4, healthy: 0, complete: false },
} as const

describe('athleteSchema', () => {
  it('accepts a normalized public athlete with verified public data', () => {
    expect(athleteSchema.parse(validAthlete)).toEqual(validAthlete)
  })

  it('accepts an unavailable identity-only performance without invented stats', () => {
    const identityOnly = {
      ...validAthlete,
      id: 'oscar-gloukh',
      name: { en: 'Oscar Gloukh', he: 'אוסקר גלוך' },
      aliases: [],
      sport: 'football',
      image: undefined,
      affiliation: {
        ...validAthlete.affiliation,
        competition: 'Eredivisie',
        season: '2026-27',
      },
      performance: {
        ...validAthlete.performance,
        status: 'unavailable',
        state: 'unavailable',
        competition: 'Eredivisie',
        season: '2026-27',
        stats: null,
      },
    }

    expect(athleteSchema.parse(identityOnly).performance.stats).toBeNull()
  })

  it('rejects stats whose kind does not match the athlete sport', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        sport: 'football',
      }),
    ).toThrow(/stats kind.*sport/i)
  })

  it.each([
    ['competition', 'EuroLeague'],
    ['season', '2026-27'],
  ] as const)('requires performance %s to match the verified affiliation', (field, value) => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: { ...validAthlete.performance, [field]: value },
      }),
    ).toThrow(/affiliation/i)
  })

  it('rejects non-public and non-overseas records', () => {
    expect(() => athleteSchema.parse({ ...validAthlete, visibility: 'review' })).toThrow()
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        affiliation: { ...validAthlete.affiliation, countsAsOverseas: false },
      }),
    ).toThrow()
  })

  it('requires available performance to contain stats', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: { ...validAthlete.performance, stats: null },
      }),
    ).toThrow()
  })

  it('requires unavailable performance to have unavailable state and null stats', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: {
          ...validAthlete.performance,
          status: 'unavailable',
          state: 'final',
          stats: null,
        },
      }),
    ).toThrow()

    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: {
          ...validAthlete.performance,
          status: 'unavailable',
          state: 'unavailable',
        },
      }),
    ).toThrow()
  })

  it('rejects media without approved rights and HTTPS URLs', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        image: { ...validAthlete.image, rightsStatus: 'review' },
      }),
    ).toThrow()
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        image: { ...validAthlete.image, rightsHolder: undefined },
      }),
    ).toThrow()
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        image: { ...validAthlete.image, sourceUrl: 'http://example.com/license' },
      }),
    ).toThrow(/HTTPS/i)
  })

  it('rejects non-HTTPS eligibility, affiliation, and performance URLs', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        eligibility: { ...validAthlete.eligibility, sourceUrl: 'http://example.com/evidence' },
      }),
    ).toThrow(/HTTPS/i)
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        affiliation: {
          ...validAthlete.affiliation,
          source: { ...validAthlete.affiliation.source, sourceUrl: 'http://example.com/roster' },
        },
      }),
    ).toThrow(/HTTPS/i)
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: {
          ...validAthlete.performance,
          source: { ...validAthlete.performance.source, sourceUrl: 'javascript:alert(1)' },
        },
      }),
    ).toThrow(/HTTPS/i)
  })

  it('rejects unknown internal fields at public trust boundaries', () => {
    expect(() => athleteSchema.parse({ ...validAthlete, internalId: 'registry-1' })).toThrow()
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        eligibility: { ...validAthlete.eligibility, status: 'verified' },
      }),
    ).toThrow()
  })
})

describe('snapshotSchema', () => {
  it('accepts honest coverage', () => {
    expect(snapshotSchema.parse(validSnapshot).coverage.complete).toBe(false)
  })

  it('rejects duplicate athlete ids', () => {
    expect(() =>
      snapshotSchema.parse({ ...validSnapshot, athletes: [validAthlete, validAthlete] }),
    ).toThrow(/duplicate/i)
  })

  it('compares causal timestamps by numeric instant', () => {
    const equivalentInstant = {
      ...validAthlete,
      eligibility: { ...validAthlete.eligibility, retrievedAt: '2026-07-23T08:00:00Z' },
      affiliation: {
        ...validAthlete.affiliation,
        source: { ...validAthlete.affiliation.source, retrievedAt: '2026-07-23T08:00:00Z' },
      },
      performance: {
        ...validAthlete.performance,
        source: { ...validAthlete.performance.source, retrievedAt: '2026-07-23T08:00:00Z' },
      },
      image: { ...validAthlete.image, retrievedAt: '2026-07-23T08:00:00Z' },
    }
    expect(snapshotSchema.safeParse({ ...validSnapshot, athletes: [equivalentInstant] }).success).toBe(true)
  })

  it.each([
    ['eligibility', (athlete: typeof validAthlete) => ({
      ...athlete,
      eligibility: { ...athlete.eligibility, retrievedAt: '2026-07-23T08:00:00.001Z' },
    })],
    ['affiliation', (athlete: typeof validAthlete) => ({
      ...athlete,
      affiliation: { ...athlete.affiliation, source: { ...athlete.affiliation.source, retrievedAt: '2026-07-23T08:00:00.001Z' } },
    })],
    ['performance', (athlete: typeof validAthlete) => ({
      ...athlete,
      performance: { ...athlete.performance, source: { ...athlete.performance.source, retrievedAt: '2026-07-23T08:00:00.001Z' } },
    })],
    ['image', (athlete: typeof validAthlete) => ({
      ...athlete,
      image: { ...athlete.image, retrievedAt: '2026-07-23T08:00:00.001Z' },
    })],
  ] as const)('rejects %s evidence observed after snapshot generation', (_label, mutate) => {
    expect(() => snapshotSchema.parse({ ...validSnapshot, athletes: [mutate(validAthlete)] })).toThrow(/generated/i)
  })

  it.each([
    { required: 4, healthy: 5, complete: false },
    { required: 4, healthy: 4, complete: false },
    { required: 4, healthy: 3, complete: true },
    { required: 0, healthy: 0, complete: true },
  ])('rejects dishonest coverage summary %#', (coverage) => {
    expect(() => snapshotSchema.parse({ ...validSnapshot, coverage })).toThrow(/coverage|complete|healthy/i)
  })
})
