import { describe, expect, it } from 'vitest'
import deniFixture from '../../data/fixtures/nba-deni.json'
import zeevFixture from '../../data/fixtures/nhl-zeev.json'
import apiFootballFixture from '../../data/fixtures/api-football-player.json'
import soccerFixture from '../../data/fixtures/sportradar-soccer.json'
import espnSoccerFixture from '../../data/fixtures/espn-soccer-roster.json'
import { parseApiFootballExternalId, parseApiFootballFixture } from '../../scripts/providers/api-football'
import { parseCuratedRecord } from '../../scripts/providers/curated'
import { parseNbaFixture, parseNbaSeasonEndingYear } from '../../scripts/providers/nba'
import { parseEspnNcaaBasketballExternalId, parseEspnNcaaBasketballFixture } from '../../scripts/providers/ncaa-basketball'
import { parseNhlFixture } from '../../scripts/providers/nhl'
import { parseEspnSoccerExternalId, parseEspnSoccerFixture } from '../../scripts/providers/espn-soccer'
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

describe('ESPN NCAA basketball provider', () => {
  const options = {
    athleteIdInternal: 'omer-mayer',
    expectedName: 'Omer Mayer',
    competition: 'NCAA Division I',
    season: '2025-26',
    sourceUrl: 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2/athletes/5312035/statistics?lang=en&region=us',
    retrievedAt: '2026-08-15T11:02:41.000Z',
    leagueSlug: 'mens-college-basketball' as const,
    teamId: 2509,
    athleteId: 5312035,
    seasonYear: 2026,
  }
  const roster = {
    team: { id: '2509', displayName: 'Purdue Boilermakers' },
    athletes: [{ id: '5312035', displayName: 'Omer Mayer' }],
  }
  const statistics = {
    $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2/athletes/5312035/statistics/0',
    athlete: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/athletes/5312035' },
    season: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026' },
    seasonType: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2' },
    splits: {
      categories: [{ stats: [
        { name: 'gamesPlayed', value: 35, displayValue: '35' },
        { name: 'avgPoints', value: 5.6857142, displayValue: '5.7' },
        { name: 'avgRebounds', value: 1.0571429, displayValue: '1.1' },
        { name: 'avgAssists', value: 1.2, displayValue: '1.2' },
      ] }],
    },
  }

  it('maps completed season totals and validates the current roster identity', () => {
    const result = parseEspnNcaaBasketballFixture({ roster, statistics }, options)
    expect(result).toMatchObject({
      athleteId: 'omer-mayer',
      sport: 'basketball',
      competition: 'NCAA Division I',
      season: '2025-26',
      state: 'final',
      stats: { kind: 'basketball', games: 35, pointsPerGame: 5.7, reboundsPerGame: 1.1, assistsPerGame: 1.2 },
    })
  })

  it('parses and rejects malformed composite bindings', () => {
    expect(parseEspnNcaaBasketballExternalId('mens-college-basketball|2509|5312035|2026')).toEqual({
      leagueSlug: 'mens-college-basketball', teamId: 2509, athleteId: 5312035, seasonYear: 2026,
    })
    expect(() => parseEspnNcaaBasketballExternalId('mens-college-basketball|2509|5312035')).toThrow(/league-slug/i)
    expect(() => parseEspnNcaaBasketballExternalId('mens-college-basketball|2509|5312035|20x6')).toThrow()
  })

  it('rejects a mismatched athlete or season context', () => {
    expect(() => parseEspnNcaaBasketballFixture({
      roster: { ...roster, athletes: [{ id: '999', displayName: 'Other Player' }] },
      statistics,
    }, options)).toThrow(/missing|identity/i)
    expect(() => parseEspnNcaaBasketballFixture({
      roster,
      statistics: { ...statistics, season: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2025' } },
    }, options)).toThrow(/context/i)
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

describe('ESPN Soccer provider', () => {
  const options = {
    athleteId: 'liel-abada',
    expectedName: 'Liel Abada',
    season: '2026',
    competition: 'MLS',
    seasonYear: 2026,
    teamId: 21300,
    athleteIdExternal: 312976,
    sourceUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/21300/roster',
    retrievedAt: '2026-08-14T19:20:00.000Z',
  } as const

  it('maps current roster totals and verifies team, season, player id, and name', () => {
    const result = parseEspnSoccerFixture(espnSoccerFixture, options)
    expect(result).toMatchObject({
      athleteId: 'liel-abada',
      sport: 'football',
      competition: 'MLS',
      season: '2026',
      state: 'provisional',
      stats: { kind: 'football', appearances: 12, goals: 1, assists: 3 },
    })
    expect(result.observedOrganization).toBeUndefined()
  })

  it('parses and validates composite bindings', () => {
    expect(parseEspnSoccerExternalId('usa.1|21300|312976')).toEqual({
      leagueSlug: 'usa.1', teamId: 21300, athleteId: 312976,
    })
    expect(() => parseEspnSoccerExternalId('usa.1|21300')).toThrow(/league-slug/i)
    expect(() => parseEspnSoccerExternalId('USA|21300|312976')).toThrow()
  })

  it.each([
    ['another team', { team: { id: '139', displayName: 'Ajax' } }],
    ['another season', { season: { year: 2025, displayName: '2025 MLS' } }],
  ])('rejects a roster for %s', (_label, replacement) => {
    expect(() => parseEspnSoccerFixture({ ...espnSoccerFixture, ...replacement }, options)).toThrow(/team|season/i)
  })

  it('rejects another player and missing required stats', () => {
    expect(() => parseEspnSoccerFixture(espnSoccerFixture, { ...options, athleteIdExternal: 99999 })).toThrow(/missing|duplicated/i)
    const malformed = structuredClone(espnSoccerFixture)
    malformed.athletes[0].statistics.splits.categories[1].stats = malformed.athletes[0].statistics.splits.categories[1].stats
      .filter((stat) => stat.name !== 'totalGoals')
    expect(() => parseEspnSoccerFixture(malformed, options)).toThrow(/totalGoals/i)
  })
})

describe('API-Football provider', () => {
  const options = {
    athleteId: 'liel-abada',
    expectedName: 'Liel Abada',
    season: '2025',
    competition: 'MLS',
    playerId: 12345,
    leagueId: 253,
    seasonYear: 2025,
    sourceUrl: 'https://v3.football.api-sports.io/players?id=12345&league=253&season=2025',
    retrievedAt: '2026-08-14T19:20:00.000Z',
  } as const

  it('maps player season totals and accepts the provider surname-first name', () => {
    const result = parseApiFootballFixture(apiFootballFixture, options)

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

  it('aggregates multiple teams in one league season without inventing missing totals', () => {
    const payload = structuredClone(apiFootballFixture)
    payload.response[0].statistics.push({
      team: { id: 254, name: 'Former Club' },
      league: { id: 253, name: 'Major League Soccer', season: 2025 },
      games: { appearences: 4 },
      goals: { total: 1, assists: 2 },
    })

    const result = parseApiFootballFixture(payload, options)
    expect(result.stats).toEqual({ kind: 'football', appearances: 20, goals: 8, assists: 6 })
    expect(result.observedOrganization).toBeUndefined()
  })

  it('rejects context and identity mismatches', () => {
    expect(parseApiFootballExternalId('12345|253|2025')).toEqual({ playerId: 12345, leagueId: 253, seasonYear: 2025 })
    expect(() => parseApiFootballExternalId('player|league|season')).toThrow()
    expect(() => parseApiFootballFixture(apiFootballFixture, { ...options, leagueId: 999 })).toThrow(/league|season/i)
    expect(() => parseApiFootballFixture(apiFootballFixture, { ...options, expectedName: 'Another Player' })).toThrow(/identity/i)
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
