import { describe, expect, it } from 'vitest'
import type { AthleteSnapshot } from '../../src/domain/athlete'
import { publicRegistry } from '../../src/data/registry'
import { buildSnapshot } from '../../src/services/snapshot'
import deniFixture from '../../data/fixtures/nba-deni.json'
import { fetchProviderRecord } from '../../scripts/sync-data'

const previous: AthleteSnapshot = {
  generatedAt: '2026-07-18T12:00:00.000Z',
  athletes: [
    {
      id: 'deni-avdija',
      name: { en: 'Deni Avdija', he: 'דני אבדיה' },
      sport: 'basketball',
      competition: 'NBA',
      team: 'Portland Trail Blazers',
      eligibility: {
        status: 'verified',
        sourceUrl: 'https://www.nba.com/player/1630166/deni-avdija',
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
        provider: 'espn-nba',
        sourceUrl: 'https://example.com/deni',
        retrievedAt: '2026-07-18T12:00:00.000Z',
      },
      freshness: 'fresh',
    },
  ],
}

describe('buildSnapshot', () => {
  it('keeps the last verified value and marks it stale when a provider fails', async () => {
    const next = await buildSnapshot({
      entries: [publicRegistry[0]],
      previous,
      fetchRecord: async () => {
        throw new Error('provider unavailable')
      },
      now: new Date('2026-07-19T12:00:00.000Z'),
    })

    expect(next.athletes[0].stats).toEqual(previous.athletes[0].stats)
    expect(next.athletes[0].freshness).toBe('stale')
    expect(next.athletes[0].image).toBeUndefined()
  })

  it('fails closed when neither fresh nor previous verified data exists', async () => {
    await expect(
      buildSnapshot({
        entries: [publicRegistry[0]],
        previous: { generatedAt: previous.generatedAt, athletes: [] },
        fetchRecord: async () => {
          throw new Error('provider unavailable')
        },
        now: new Date('2026-07-19T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/No verified data available/)
  })

  it('rejects a provider result for a different registry athlete', async () => {
    await expect(
      buildSnapshot({
        entries: [publicRegistry[0]],
        previous,
        fetchRecord: async () => ({
          athleteId: 'ben-saraf',
          stats: previous.athletes[0].stats,
          sourceUrl: 'https://example.com/wrong-athlete',
          retrievedAt: '2026-07-19T12:00:00.000Z',
        }),
        now: new Date('2026-07-19T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/provider identity mismatch/i)
  })
})

describe('fetchProviderRecord', () => {
  it('verifies the configured ESPN athlete identity before parsing stats', async () => {
    const requestedUrls: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      const requestedUrl = String(input)
      requestedUrls.push(requestedUrl)

      if (requestedUrl.includes('espn.com/nba/player/_/id/')) {
        return new Response(
          '<meta property="og:title" content="Deni Avdija - Portland Trail Blazers Forward - ESPN"><link rel="canonical" href="https://www.espn.com/nba/player/_/id/4683021/deni-avdija">',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }

      return new Response(JSON.stringify(deniFixture), { status: 200 })
    }

    const result = await fetchProviderRecord(
      publicRegistry[0],
      fakeFetch,
      new Date('2026-07-19T12:00:00.000Z'),
    )

    expect(requestedUrls).toEqual([
      'https://www.espn.com/nba/player/_/id/4683021',
      'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/4683021/overview',
    ])
    expect(result.stats).toMatchObject({ pointsPerGame: 24.2 })
  })

  it('rejects ESPN stats when the provider id resolves to another athlete', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        '<meta property="og:title" content="Another Player - Example Team - ESPN"><link rel="canonical" href="https://www.espn.com/nba/player/_/id/4683021/another-player">',
        { status: 200, headers: { 'content-type': 'text/html' } },
      )

    await expect(
      fetchProviderRecord(
        publicRegistry[0],
        fakeFetch,
        new Date('2026-07-19T12:00:00.000Z'),
      ),
    ).rejects.toThrow(/identity mismatch/i)
  })
})
