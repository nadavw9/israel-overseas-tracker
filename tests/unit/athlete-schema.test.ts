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
  participation: {
    kind: 'team-affiliation',
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

const circuitAthlete = (tier: 'international-circuit' | 'senior-professional' = 'international-circuit') => ({
  ...validAthlete,
  sport: 'tennis',
  tier,
  participation: {
    kind: 'circuit-activity',
    activity: {
      circuit: 'ATP',
      discipline: 'singles',
      competition: 'Wimbledon',
      season: '2026',
      activityType: 'sanctioned-result',
      effectiveAt: '2026-07-10T08:00:00.000Z',
      source: {
        publisher: 'ATP',
        sourceUrl: 'https://example.com/atp/wimbledon',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    },
  },
  performance: {
    status: 'unavailable',
    state: 'unavailable',
    stats: null,
    reason: 'not-integrated',
  },
} as const)

describe('athleteSchema', () => {
  it('accepts a normalized public athlete with verified public data', () => {
    expect(athleteSchema.parse(validAthlete)).toEqual(validAthlete)
  })

  it('accepts both valid tier and participation pairings', () => {
    expect(athleteSchema.safeParse(validAthlete).success).toBe(true)
    expect(athleteSchema.safeParse(circuitAthlete()).success).toBe(true)
  })

  it('rejects an international-circuit tier paired with team participation', () => {
    expect(athleteSchema.safeParse({
      ...validAthlete,
      tier: 'international-circuit',
    }).success).toBe(false)
  })

  it('rejects a non-circuit tier paired with circuit participation', () => {
    expect(athleteSchema.safeParse(circuitAthlete('senior-professional')).success).toBe(false)
  })

  it.each(['not-integrated', 'provider-unavailable'] as const)(
    'accepts an exact unavailable performance with the %s reason',
    (reason) => {
    const identityOnly = {
      ...validAthlete,
      id: 'oscar-gloukh',
      name: { en: 'Oscar Gloukh', he: 'אוסקר גלוך' },
      aliases: [],
      sport: 'football',
      image: undefined,
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          ...validAthlete.participation.affiliation,
          competition: 'Eredivisie',
          season: '2026-27',
        },
      },
      performance: {
        status: 'unavailable',
        state: 'unavailable',
        stats: null,
        reason,
      },
    }

    expect(athleteSchema.parse(identityOnly).performance.stats).toBeNull()
    },
  )

  it('rejects stats whose kind does not match the athlete sport', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        sport: 'football',
      }),
    ).toThrow(/stats kind.*sport/i)
  })

  it('requires available performance competition to match team participation', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: { ...validAthlete.performance, competition: 'EuroLeague' },
      }),
    ).toThrow(/participation/i)
  })

  it('accepts available performance from a prior season when competition matches participation', () => {
    const athlete = {
      ...validAthlete,
      participation: {
        ...validAthlete.participation,
        affiliation: { ...validAthlete.participation.affiliation, season: '2026-27' },
      },
    }

    expect(athleteSchema.safeParse(athlete).success).toBe(true)
  })

  it('rejects non-public and non-overseas records', () => {
    expect(() => athleteSchema.parse({ ...validAthlete, visibility: 'review' })).toThrow()
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        participation: {
          ...validAthlete.participation,
          affiliation: { ...validAthlete.participation.affiliation, countsAsOverseas: false },
        },
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

  it('requires unavailable performance to have exactly its unavailable state, null stats, and reason', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: {
          status: 'unavailable',
          state: 'final',
          stats: null,
          reason: 'not-integrated',
        },
      }),
    ).toThrow()

    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        performance: {
          status: 'unavailable',
          state: 'unavailable',
          stats: null,
        },
      }),
    ).toThrow()
  })

  it.each([
    ['source', { provider: 'curated', sourceUrl: 'https://example.com/stats', retrievedAt: '2026-07-23T08:00:00.000Z' }],
    ['competition', 'NBA'],
    ['season', '2025-26'],
    ['context', { note: 'not fetched' }],
    ['unexpected', true],
  ] as const)('rejects %s on unavailable performance', (field, value) => {
    expect(() => athleteSchema.parse({
      ...validAthlete,
      performance: {
        status: 'unavailable',
        state: 'unavailable',
        stats: null,
        reason: 'not-integrated',
        [field]: value,
      },
    })).toThrow()
  })

  it('accepts circuit participation and requires its competition for available performance', () => {
    const circuitAthlete = {
      ...validAthlete,
      sport: 'tennis',
      tier: 'international-circuit',
      participation: {
        kind: 'circuit-activity',
        activity: {
          circuit: 'ATP',
          discipline: 'singles',
          competition: 'Wimbledon',
          season: '2026',
          activityType: 'sanctioned-result',
          effectiveAt: '2026-07-10T08:00:00.000Z',
          source: {
            publisher: 'ATP',
            sourceUrl: 'https://example.com/atp/wimbledon',
            retrievedAt: '2026-07-23T08:00:00.000Z',
          },
        },
      },
      performance: {
        status: 'unavailable',
        state: 'unavailable',
        stats: null,
        reason: 'not-integrated',
      },
    }

    expect(athleteSchema.parse(circuitAthlete).participation.kind).toBe('circuit-activity')
    expect(() => athleteSchema.parse({
      ...circuitAthlete,
      performance: { ...validAthlete.performance, competition: 'US Open' },
    })).toThrow(/participation/i)
  })

  it('requires exactly one participation union variant', () => {
    const withoutParticipation = { ...validAthlete } as Record<string, unknown>
    delete withoutParticipation.participation
    expect(athleteSchema.safeParse(withoutParticipation).success).toBe(false)

    expect(athleteSchema.safeParse({
      ...validAthlete,
      participation: {
        ...validAthlete.participation,
        activity: {
          circuit: 'ATP', discipline: 'singles', competition: 'Wimbledon', season: '2026',
          activityType: 'ranking', effectiveAt: '2026-07-10T08:00:00.000Z',
          source: validAthlete.participation.affiliation.source,
        },
      },
    }).success).toBe(false)
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

  it('rejects non-HTTPS eligibility, participation, and available performance URLs', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        eligibility: { ...validAthlete.eligibility, sourceUrl: 'http://example.com/evidence' },
      }),
    ).toThrow(/HTTPS/i)
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        participation: {
          ...validAthlete.participation,
          affiliation: {
            ...validAthlete.participation.affiliation,
            source: {
              ...validAthlete.participation.affiliation.source,
              sourceUrl: 'http://example.com/roster',
            },
          },
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

  it('accepts snapshots with both valid tier and participation pairings', () => {
    expect(snapshotSchema.safeParse(validSnapshot).success).toBe(true)
    expect(snapshotSchema.safeParse({
      ...validSnapshot,
      athletes: [circuitAthlete()],
    }).success).toBe(true)
  })

  it('rejects snapshots with either invalid tier and participation pairing', () => {
    expect(snapshotSchema.safeParse({
      ...validSnapshot,
      athletes: [{ ...validAthlete, tier: 'international-circuit' }],
    }).success).toBe(false)
    expect(snapshotSchema.safeParse({
      ...validSnapshot,
      athletes: [circuitAthlete('senior-professional')],
    }).success).toBe(false)
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
      participation: {
        ...validAthlete.participation,
        affiliation: {
          ...validAthlete.participation.affiliation,
          source: {
            ...validAthlete.participation.affiliation.source,
            retrievedAt: '2026-07-23T08:00:00Z',
          },
        },
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
    ['participation', (athlete: typeof validAthlete) => ({
      ...athlete,
      participation: {
        ...athlete.participation,
        affiliation: {
          ...athlete.participation.affiliation,
          source: {
            ...athlete.participation.affiliation.source,
            retrievedAt: '2026-07-23T08:00:00.001Z',
          },
        },
      },
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

  it('reports the full participation source path for a future timestamp', () => {
    const parsed = snapshotSchema.safeParse({
      ...validSnapshot,
      athletes: [{
        ...validAthlete,
        participation: {
          ...validAthlete.participation,
          affiliation: {
            ...validAthlete.participation.affiliation,
            source: {
              ...validAthlete.participation.affiliation.source,
              retrievedAt: '2026-07-23T08:00:00.001Z',
            },
          },
        },
      }],
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('Expected future participation source to fail')
    expect(parsed.error.issues.find((issue) => /participation observation/i.test(issue.message))?.path)
      .toEqual(['athletes', 0, 'participation', 'affiliation', 'source', 'retrievedAt'])
  })

  it('checks circuit activity source and effective timestamps causally', () => {
    const circuitAthlete = {
      ...validAthlete,
      sport: 'tennis',
      tier: 'international-circuit',
      participation: {
        kind: 'circuit-activity',
        activity: {
          circuit: 'ITF', discipline: 'singles', competition: 'Wimbledon', season: '2026',
          activityType: 'sanctioned-result', effectiveAt: '2026-07-10T08:00:00.000Z',
          source: {
            publisher: 'ITF', sourceUrl: 'https://example.com/itf/wimbledon',
            retrievedAt: '2026-07-23T08:00:00.001Z',
          },
        },
      },
      performance: {
        status: 'unavailable', state: 'unavailable', stats: null, reason: 'not-integrated',
      },
    }
    expect(snapshotSchema.safeParse({ ...validSnapshot, athletes: [circuitAthlete] }).success).toBe(false)

    const futureEffective = structuredClone(circuitAthlete)
    futureEffective.participation.activity.source.retrievedAt = '2026-07-23T08:00:00.000Z'
    futureEffective.participation.activity.effectiveAt = '2026-07-23T08:00:00.001Z'
    expect(snapshotSchema.safeParse({ ...validSnapshot, athletes: [futureEffective] }).success).toBe(false)
  })

  it('does not inspect a performance source when performance is unavailable', () => {
    const unavailable = {
      ...validAthlete,
      performance: {
        status: 'unavailable',
        state: 'unavailable',
        stats: null,
        reason: 'provider-unavailable',
      },
    }

    expect(snapshotSchema.safeParse({ ...validSnapshot, athletes: [unavailable] }).success).toBe(true)
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
