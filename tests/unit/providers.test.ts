import { describe, expect, it } from 'vitest'
import deniFixture from '../../data/fixtures/nba-deni.json'
import zeevFixture from '../../data/fixtures/nhl-zeev.json'
import { parseCuratedRecord } from '../../scripts/providers/curated'
import { parseNbaFixture } from '../../scripts/providers/nba'
import { parseNhlFixture } from '../../scripts/providers/nhl'

describe('NBA provider', () => {
  it('maps the regular-season columns by name', () => {
    const result = parseNbaFixture(deniFixture, {
      athleteId: 'deni-avdija',
      sourceUrl:
        'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/4683021/overview',
      retrievedAt: '2026-07-19T08:00:00.000Z',
    })

    expect(result.stats).toEqual({
      kind: 'basketball',
      games: 66,
      pointsPerGame: 24.2,
      reboundsPerGame: 6.9,
      assistsPerGame: 6.7,
    })
  })

  it('rejects a payload that omits a required field', () => {
    const malformed = structuredClone(deniFixture)
    malformed.statistics.names = malformed.statistics.names.filter(
      (name) => name !== 'avgPoints',
    )

    expect(() =>
      parseNbaFixture(malformed, {
        athleteId: 'deni-avdija',
        sourceUrl: 'https://example.com/source',
        retrievedAt: '2026-07-19T08:00:00.000Z',
      }),
    ).toThrow(/avgPoints/)
  })
})

describe('NHL provider', () => {
  it('aggregates regular-season NHL totals across mid-season teams', () => {
    const result = parseNhlFixture(zeevFixture, {
      athleteId: 'zeev-buium',
      seasonId: 20252026,
      retrievedAt: '2026-07-19T08:00:00.000Z',
    })

    expect(result.team).toBe('Vancouver Canucks')
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
        seasonId: 20232024,
        retrievedAt: '2026-07-19T08:00:00.000Z',
      }),
    ).toThrow(/20232024/)
  })
})

describe('curated provider', () => {
  it('keeps identity-only data statless instead of publishing fake zeroes', () => {
    const result = parseCuratedRecord('oscar-gloukh', {
      sourceUrl: 'https://english.ajax.nl/teams/ajax-1/oscar-gloukh',
      retrievedAt: '2026-07-19T08:00:00.000Z',
      stats: null,
    })

    expect(result.stats).toBeNull()
  })
})
