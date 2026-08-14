import { describe, expect, it } from 'vitest'
import deniFixture from '../../data/fixtures/nba-deni.json'
import zeevFixture from '../../data/fixtures/nhl-zeev.json'
import soccerFixture from '../../data/fixtures/sportradar-soccer.json'
import { parseCuratedRecord } from '../../scripts/providers/curated'
import { parseNbaFixture, parseNbaSeasonEndingYear } from '../../scripts/providers/nba'
import { parseNhlFixture } from '../../scripts/providers/nhl'
import { parseSportradarSoccerExternalId, parseSportradarSoccerFixture } from '../../scripts/providers/soccer'
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

  it('uses authoritative numeric values and rounds public averages to one decimal', () => {
    const payload = structuredClone(deniFixture)
    const points = payload.splits.categories[0].stats.find((stat) => stat.name === 'avgPoints')
    if (!points) throw new Error('Fixture missing avgPoints')
    points.value = 24.26
    points.displayValue = '   '

    const result = parseNbaFixture(payload, {
      athleteId: 'deni-avdija', externalId: '4683021', seasonYear: 2026, season: '2025-26',
      sourceUrl: 'https://example.com/source', retrievedAt: '2026-07-19T08:00:00.000Z',
    })

    expect(result.stats).toMatchObject({ pointsPerGame: 24.3 })
  })

  it('rejects duplicate required statistic names', () => {
    const payload = structuredClone(deniFixture)
    payload.splits.categories[0].stats.push({ name: 'avgPoints', value: 99, displayValue: '99.0' })

    expect(() => parseNbaFixture(payload, {
      athleteId: 'deni-avdija', externalId: '4683021', seasonYear: 2026, season: '2025-26',
      sourceUrl: 'https://example.com/source', retrievedAt: '2026-07-19T08:00:00.000Z',
    })).toThrow(/duplicate.*avgPoints/i)
  })

  it.each([
    ['missing', undefined],
    ['non-finite', Number.NaN],
  ])('rejects a %s authoritative numeric value', (_label, value) => {
    const payload = structuredClone(deniFixture) as unknown as {
      splits: { categories: Array<{ stats: Array<Record<string, unknown>> }> }
    }
    const points = payload.splits.categories[0]?.stats.find((stat) => stat.name === 'avgPoints')
    if (!points) throw new Error('Fixture missing avgPoints')
    if (value === undefined) delete points.value
    else points.value = value

    expect(() => parseNbaFixture(payload, {
      athleteId: 'deni-avdija', externalId: '4683021', seasonYear: 2026, season: '2025-26',
      sourceUrl: 'https://example.com/source', retrievedAt: '2026-07-19T08:00:00.000Z',
    })).toThrow()
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

describe('Sportradar Soccer provider', () => {
  const options = {
    athleteId: 'liel-abada',
    expectedName: 'Liel Abada',
    season: '2025',
    competition: 'MLS',
    seasonId: 'sr:season:127179',
    competitorId: 'sr:competitor:2502',
    playerId: 'sr:player:45970',
    sourceUrl: 'https://api.sportradar.com/soccer/trial/v4/en/seasons/sr:season:127179/competitors/sr:competitor:2502/statistics.json',
    retrievedAt: '2026-08-14T19:20:00.000Z',
  } as const

  it('maps season totals and verifies the season, club, player id, and name', () => {
    const result = parseSportradarSoccerFixture(soccerFixture, options)

    expect(result).toMatchObject({
      athleteId: 'liel-abada',
      sport: 'football',
      competition: 'MLS',
      season: '2025',
      observedOrganization: 'Charlotte FC',
      state: 'final',
      stats: { kind: 'football', appearances: 16, goals: 7, assists: 4 },
    })
  })

  it('accepts the provider surname-first name format but rejects another player', () => {
    expect(parseSportradarSoccerExternalId('sr:season:127179|sr:competitor:2502|sr:player:45970'))
      .toEqual({
        seasonId: 'sr:season:127179',
        competitorId: 'sr:competitor:2502',
        playerId: 'sr:player:45970',
      })
    expect(() => parseSportradarSoccerFixture(soccerFixture, {
      ...options,
      playerId: 'sr:player:99999',
    })).toThrow(/missing|duplicated/i)
    expect(() => parseSportradarSoccerFixture(soccerFixture, {
      ...options,
      expectedName: 'Another Player',
    })).toThrow(/identity/i)
  })

  it('rejects malformed composite bindings', () => {
    expect(() => parseSportradarSoccerExternalId('sr:season:127179|sr:competitor:2502')).toThrow(/season\|competitor\|player/i)
    expect(() => parseSportradarSoccerExternalId('bad|sr:competitor:2502|sr:player:45970')).toThrow()
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

  it('accepts a full-taxonomy tennis identity-only record', () => {
    const result = parseCuratedRecord('athlete-one', {
      sport: 'tennis',
      competition: 'ITF World Tennis Tour',
      season: '2026',
      sourceUrl: 'https://example.com/itf/athlete-one',
      retrievedAt: '2026-07-23T08:00:00.000Z',
      stats: null,
    })

    expect(result).toMatchObject({ athleteId: 'athlete-one', sport: 'tennis', stats: null })
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

  it('allows full-taxonomy sports only when the result is identity-only', () => {
    expect(providerResultSchema.safeParse({ ...valid, sport: 'tennis', stats: null }).success).toBe(true)
    expect(providerResultSchema.safeParse({ ...valid, sport: 'tennis' }).success).toBe(false)
  })
})

describe('NBA season parsing', () => {
  it.each([
    ['2025-26', 2026],
    ['2099-00', 2100],
  ] as const)('maps canonical consecutive season %s to ESPN ending year %s', (season, endingYear) => {
    expect(parseNbaSeasonEndingYear(season)).toBe(endingYear)
  })

  it.each([
    'NBA-2025-26',
    '2025-27',
    '25-26',
    '20255-26',
    '1945-46',
    '9999-00',
  ])('rejects non-canonical or unsupported NBA season %s', (season) => {
    expect(() => parseNbaSeasonEndingYear(season)).toThrow(/NBA season/i)
  })
})
