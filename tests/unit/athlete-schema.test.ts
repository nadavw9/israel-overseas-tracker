import { describe, expect, it } from 'vitest'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'

const validAthlete = {
  id: 'deni-avdija',
  name: { en: 'Deni Avdija', he: 'דני אבדיה' },
  sport: 'basketball',
  competition: 'NBA',
  team: 'Portland Trail Blazers',
  eligibility: {
    status: 'verified',
    sourceUrl: 'https://www.nba.com/player/1630166/deni-avdija/profile',
  },
  visibility: 'public',
  season: '2025-26',
  statsStatus: 'verified',
  stats: {
    kind: 'basketball',
    games: 66,
    pointsPerGame: 24.2,
    reboundsPerGame: 6.9,
    assistsPerGame: 6.7,
  },
  source: {
    provider: 'espn',
    sourceUrl:
      'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1630166/stats',
    retrievedAt: '2026-07-19T08:00:00.000Z',
  },
  freshness: 'fresh',
  location: { city: 'Portland', country: 'United States', lat: 45.5152, lng: -122.6784 },
} as const

describe('athleteSchema', () => {
  it('accepts a public athlete with verified eligibility and sourced stats', () => {
    expect(athleteSchema.parse(validAthlete).id).toBe('deni-avdija')
  })

  it('accepts identity-only records without inventing zero stats', () => {
    const identityOnly = {
      ...validAthlete,
      id: 'oscar-gloukh',
      name: { en: 'Oscar Gloukh', he: 'אוסקר גלוך' },
      sport: 'football',
      competition: 'Eredivisie',
      team: 'Ajax',
      statsStatus: 'unavailable',
      stats: null,
    }

    expect(athleteSchema.parse(identityOnly).stats).toBeNull()
  })

  it('rejects pending eligibility from the public snapshot', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        eligibility: { ...validAthlete.eligibility, status: 'pending' },
      }),
    ).toThrow(/public.*verified eligibility/i)
  })

  it('rejects a public record without a source', () => {
    expect(() => athleteSchema.parse({ ...validAthlete, source: undefined })).toThrow()
  })

  it('rejects non-HTTPS external source and image URLs', () => {
    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        source: { ...validAthlete.source, sourceUrl: 'javascript:alert(1)' },
      }),
    ).toThrow(/HTTPS/i)

    expect(() =>
      athleteSchema.parse({
        ...validAthlete,
        image: {
          url: 'data:image/svg+xml,<svg></svg>',
          sourceUrl: 'https://example.com/photo',
          alt: 'Example',
        },
      }),
    ).toThrow(/HTTPS/i)
  })
})

describe('snapshotSchema', () => {
  it('rejects duplicate athlete ids', () => {
    expect(() =>
      snapshotSchema.parse({
        generatedAt: validAthlete.source.retrievedAt,
        athletes: [validAthlete, validAthlete],
      }),
    ).toThrow(/duplicate/i)
  })
})
