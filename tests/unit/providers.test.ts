import { describe, expect, it } from 'vitest'
import deniFixture from '../../data/fixtures/nba-deni.json'
import zeevFixture from '../../data/fixtures/nhl-zeev.json'
import { parseCuratedRecord } from '../../scripts/providers/curated'
import { parseNbaFixture } from '../../scripts/providers/nba'
import { parseNhlFixture } from '../../scripts/providers/nhl'
import * as providerTypes from '../../scripts/providers/types'

const providerResultSchema = (providerTypes as unknown as {
  providerResultSchema: { parse(input: unknown): unknown; safeParse(input: unknown): { success: boolean } }
}).providerResultSchema

describe('NBA provider', () => {
  it('maps the regular-season columns by name', () => {
    const result = parseNbaFixture(deniFixture, {
      athleteId: 'deni-avdija',
      externalId: '4683021',
      seasonYear: 2026,
      season: '2025-26',
      sourceUrl:
        'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/4683021/statistics?lang=en&region=us',
      retrievedAt: '2026-07-19T08:00:00.000Z',
    })

    expect(result.stats).toEqual({
      kind: 'basketball',
      games: 66,
      pointsPerGame: 24.2,
      reboundsPerGame: 6.9,
      assistsPerGame: 6.7,
    })
    expect(result.state).toBe('final')
    expect(result).toMatchObject({ sport: 'basketball', competition: 'NBA', season: '2025-26' })
    expect(result.observedOrganization).toBeUndefined()
  })

  it('rejects a payload that omits a required field', () => {
    const malformed = structuredClone(deniFixture)
    malformed.splits.categories[0].stats = malformed.splits.categories[0].stats.filter(
      (stat) => stat.name !== 'avgPoints',
    )

    expect(() =>
      parseNbaFixture(malformed, {
        athleteId: 'deni-avdija',
        externalId: '4683021',
        seasonYear: 2026,
        season: '2025-26',
        sourceUrl: 'https://example.com/source',
        retrievedAt: '2026-07-19T08:00:00.000Z',
      }),
    ).toThrow(/avgPoints/)
  })

  it.each([
    ['another athlete', { athlete: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/athletes/999?lang=en' } }],
    ['another season', { season: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2025?lang=en' } }],
  ])('rejects stats for %s', (_label, replacement) => {
    expect(() => parseNbaFixture({ ...deniFixture, ...replacement }, {
      athleteId: 'deni-avdija', externalId: '4683021', seasonYear: 2026, season: '2025-26',
      sourceUrl: 'https://example.com/source', retrievedAt: '2026-07-19T08:00:00.000Z',
    })).toThrow(/mismatch/i)
  })
})

describe('NHL provider', () => {
  it('aggregates regular-season NHL totals across mid-season teams', () => {
    const result = parseNhlFixture(zeevFixture, {
      athleteId: 'zeev-buium',
      externalId: '8484798',
      expectedName: 'Zeev Buium',
      seasonId: 20252026,
      season: '2025-26',
      sourceUrl: 'https://api-web.nhle.com/v1/player/8484798/landing',
      retrievedAt: '2026-07-19T08:00:00.000Z',
    })

    expect(result.observedOrganization).toBe('Vancouver Canucks')
    expect(result.state).toBe('final')
    expect(result).toMatchObject({ sport: 'hockey', competition: 'NHL', season: '2025-26' })
    expect(result.stats).toEqual({
      kind: 'hockey',
      games: 76,
      goals: 6,
      assists: 20,
      points: 26,
    })
  })

  it('rejects a season with no NHL regular-season rows', () => {
    expect(() =>
      parseNhlFixture(zeevFixture, {
        athleteId: 'zeev-buium',
        externalId: '8484798',
        expectedName: 'Zeev Buium',
        seasonId: 20232024,
        season: '2023-24',
        sourceUrl: 'https://api-web.nhle.com/v1/player/8484798/landing',
        retrievedAt: '2026-07-19T08:00:00.000Z',
      }),
    ).toThrow(/20232024/)
  })

  it('rejects a same-team payload for another player', () => {
    expect(() => parseNhlFixture({ ...zeevFixture, playerId: 9999999, playerSlug: 'other-player-9999999' }, {
      athleteId: 'zeev-buium', externalId: '8484798', expectedName: 'Zeev Buium',
      seasonId: 20252026, season: '2025-26',
      sourceUrl: 'https://api-web.nhle.com/v1/player/8484798/landing', retrievedAt: '2026-07-19T08:00:00.000Z',
    })).toThrow(/player|identity/i)
  })
})

describe('curated provider', () => {
  it('keeps identity-only data statless instead of publishing fake zeroes', () => {
    const result = parseCuratedRecord('oscar-gloukh', {
      sport: 'football',
      competition: 'Eredivisie',
      season: '2025-26',
      sourceUrl: 'https://english.ajax.nl/teams/ajax-1/oscar-gloukh',
      retrievedAt: '2026-07-19T08:00:00.000Z',
      stats: null,
    })

    expect(result.stats).toBeNull()
    expect(result.state).toBe('final')
    expect(result).toMatchObject({ sport: 'football', competition: 'Eredivisie', season: '2025-26' })
  })

  it('rejects an athlete reference from another league even when IDs match', () => {
    const wrongLeague = structuredClone(deniFixture)
    wrongLeague.athlete.$ref = wrongLeague.athlete.$ref.replace('/leagues/nba/', '/leagues/wnba/')
    expect(() => parseNbaFixture(wrongLeague, {
      athleteId: 'deni-avdija', externalId: '4683021', seasonYear: 2026, season: '2025-26',
      sourceUrl: 'https://example.com/source', retrievedAt: '2026-07-19T08:00:00.000Z',
    })).toThrow(/mismatch/i)
  })
})

describe('provider result contract', () => {
  const valid = {
    athleteId: 'deni-avdija', sport: 'basketball', competition: 'NBA', season: '2025-26',
    stats: { kind: 'basketball', games: 1, pointsPerGame: 1, reboundsPerGame: 1, assistsPerGame: 1 },
    state: 'final', sourceUrl: 'https://example.com/stats', retrievedAt: '2026-07-23T08:00:00.000Z',
  } as const

  it('strictly parses a context-bound provider result', () => {
    expect(providerResultSchema.parse(valid)).toEqual(valid)
    expect(providerResultSchema.safeParse({ ...valid, internal: true }).success).toBe(false)
  })

  it('rejects stats whose kind differs from provider sport', () => {
    expect(providerResultSchema.safeParse({ ...valid, sport: 'football' }).success).toBe(false)
  })
})
