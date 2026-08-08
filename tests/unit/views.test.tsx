import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import type { Athlete } from '../../src/domain/athlete'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'
import { rankAthletes, rankAthletesBySport } from '../../src/services/rankings'

const snapshot = snapshotSchema.parse(snapshotJson)

function circuitAthlete(): Athlete {
  return athleteSchema.parse({
    ...snapshot.athletes[2],
    id: 'circuit-athlete',
    name: { en: 'Circuit Athlete', he: 'Circuit Athlete' },
    sport: 'tennis',
    discipline: 'singles',
    tier: 'international-circuit',
    participation: {
      kind: 'circuit-activity',
      activity: {
        circuit: 'ITF', discipline: 'singles', competition: 'Granby National Bank Championships', season: '2026',
        activityType: 'ranking', effectiveAt: '2026-08-01T00:00:00.000Z',
        source: { publisher: 'ITF', sourceUrl: 'https://example.com/itf/circuit-athlete', retrievedAt: '2026-08-03T22:00:00.000Z' },
      },
    },
    performance: { status: 'unavailable', state: 'unavailable', stats: null, reason: 'not-integrated' },
  })
}

describe('athlete details', () => {
  it('distinguishes citizenship evidence from representing Israel and links each source', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: /open deni avdija/i }))
    expect(screen.getByText('Eligibility basis')).toBeInTheDocument()
    expect(screen.getByText('Nationality / citizenship evidence')).toBeInTheDocument()
    expect(screen.getByText(/does not by itself mean this athlete represents Israel in competition/i)).toBeInTheDocument()
    expect(screen.getAllByText('Portland Trail Blazers')).not.toHaveLength(0)
    expect(screen.getByText(/Portland, United States/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /eligibility source/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /current team source/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /performance source/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /open ben saraf/i }))
    expect(screen.getByText('Represents Israel evidence')).toBeInTheDocument()
    expect(screen.getByText(/verified sporting representation, not a claim about citizenship/i)).toBeInTheDocument()
  })

  it('renders circuit activity without inventing club, country, or performance source', async () => {
    const user = userEvent.setup()
    const circuit = circuitAthlete()
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [circuit] }} />)

    expect(screen.getByText('ITF international circuit')).toBeInTheDocument()
    expect(screen.getByText(/Granby National Bank Championships · 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/United Kingdom|Ajax|Portland Trail Blazers/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view data source/i })).toHaveAttribute('href', 'https://example.com/itf/circuit-athlete')

    await user.click(screen.getByRole('button', { name: 'עברית' }))
    expect(screen.getByText('הסבב הבין־לאומי ITF')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'English' }))

    await user.click(screen.getByRole('button', { name: /open circuit athlete/i }))
    expect(screen.getByRole('link', { name: /circuit activity source/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /performance source/i })).not.toBeInTheDocument()
  })

  it('opens and closes details with keyboard focus restored', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)
    const trigger = screen.getByRole('button', { name: /open deni avdija/i })

    await user.click(trigger)
    expect(
      screen.getByRole('dialog', { name: /deni avdija/i }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('contains keyboard focus and makes the background inert while open', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: /open deni avdija/i }))

    const main = document.querySelector('main')
    const close = screen.getByRole('button', { name: /close deni avdija details/i })
    const seasonSource = screen.getByRole('link', { name: /performance source/i })

    expect(main).toHaveAttribute('inert')
    expect(close).toHaveFocus()

    await user.tab({ shift: true })
    expect(seasonSource).toHaveFocus()

    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(main).not.toHaveAttribute('inert')
  })
})

describe('rankings', () => {
  it('uses only public records with verified stats', () => {
    const reviewRecord = {
      ...snapshot.athletes[0],
      id: 'review-record',
      visibility: 'review',
    } as Athlete

    expect(rankAthletes([...snapshot.athletes, reviewRecord])).not.toContainEqual(
      reviewRecord,
    )
    expect(rankAthletes(snapshot.athletes).map((athlete) => athlete.id)).toEqual([
      'deni-avdija',
      'ben-saraf',
    ])
  })

  it('rejects ranking athletes across incompatible sports', () => {
    const basketball = snapshot.athletes[0]
    const football = {
      ...basketball,
      id: 'football-leader',
      sport: 'football',
      participation: { kind: 'team-affiliation', affiliation: { ...basketball.participation.affiliation, competition: 'Eredivisie' } },
      performance: {
        ...basketball.performance,
        competition: 'Eredivisie',
        stats: { kind: 'football', appearances: 12, goals: 3, assists: 4 },
      },
    } as Athlete

    expect(() => rankAthletes([basketball, football])).toThrow(/sport/i)
  })

  it('groups compatible public performance records into independent sport sequences', () => {
    const basketball = snapshot.athletes[0]
    const football = {
      ...basketball,
      id: 'football-leader',
      sport: 'football',
      participation: { kind: 'team-affiliation', affiliation: { ...basketball.participation.affiliation, competition: 'Eredivisie' } },
      performance: {
        ...basketball.performance,
        competition: 'Eredivisie',
        stats: { kind: 'football', appearances: 12, goals: 3, assists: 4 },
      },
    } as Athlete
    const incompatible = {
      ...football,
      id: 'incompatible-record',
      sport: 'basketball',
    } as Athlete

    expect(rankAthletesBySport([football, basketball, incompatible])).toEqual([
      { sport: 'basketball', athletes: [basketball] },
      { sport: 'football', athletes: [football] },
    ])
  })

  it('omits malformed and unsupported ranking payloads without throwing', () => {
    const valid = snapshot.athletes[0]
    const invalid = [
      {
        ...valid,
        id: 'missing-stats',
        performance: { ...valid.performance, stats: undefined },
      },
      {
        ...valid,
        id: 'unknown-kind',
        performance: { ...valid.performance, stats: { kind: 'lacrosse', points: 8 } },
      },
      {
        ...valid,
        id: 'unsupported-pair',
        sport: 'handball',
        performance: { ...valid.performance, stats: { kind: 'handball', points: 8 } },
      },
      {
        ...valid,
        id: 'mismatched-pair',
        sport: 'football',
      },
      {
        ...valid,
        id: 'nan-metric',
        performance: {
          ...valid.performance,
          stats: { ...valid.performance.stats, pointsPerGame: Number.NaN },
        },
      },
      {
        ...valid,
        id: 'infinite-metric',
        performance: {
          ...valid.performance,
          stats: { ...valid.performance.stats, pointsPerGame: Number.POSITIVE_INFINITY },
        },
      },
      {
        ...valid,
        id: 'malformed-metric',
        performance: {
          ...valid.performance,
          stats: { ...valid.performance.stats, pointsPerGame: '24.2' },
        },
      },
    ] as unknown as Athlete[]

    expect(() => rankAthletesBySport([valid, ...invalid])).not.toThrow()
    expect(rankAthletesBySport([valid, ...invalid])).toEqual([
      { sport: 'basketball', athletes: [valid] },
    ])
    expect(rankAthletes([valid, ...invalid.filter((athlete) => athlete.sport === 'basketball')])).toEqual([valid])
  })

  it('omits non-object ranking entries before reading their fields', () => {
    const valid = snapshot.athletes[0]
    const malformed = [
      null,
      undefined,
      'athlete',
      42,
      true,
      [],
      {},
      { visibility: 'public' },
    ] as unknown as Athlete[]
    const input = [valid, ...malformed]

    expect(() => rankAthletes(input)).not.toThrow()
    expect(rankAthletes(input)).toEqual([valid])
    expect(() => rankAthletesBySport(input)).not.toThrow()
    expect(rankAthletesBySport(input)).toEqual([
      { sport: 'basketball', athletes: [valid] },
    ])
  })

  it('omits ranking-shaped partial objects that are not canonical athletes', () => {
    const valid = snapshot.athletes[0]
    const partial = {
      visibility: 'public',
      sport: 'basketball',
      performance: {
        status: 'available',
        stats: {
          kind: 'basketball',
          games: 10,
          pointsPerGame: 12,
          reboundsPerGame: 3,
          assistsPerGame: 4,
        },
      },
    }

    expect(() => rankAthletes([valid, partial])).not.toThrow()
    expect(rankAthletes([valid, partial])).toEqual([valid])
    expect(() => rankAthletesBySport([valid, partial])).not.toThrow()
    expect(rankAthletesBySport([valid, partial])).toEqual([
      { sport: 'basketball', athletes: [valid] },
    ])
  })

  it('renders separate sport ranking sequences for mixed input', async () => {
    const user = userEvent.setup()
    const football = {
      ...snapshot.athletes[0],
      id: 'football-leader',
      name: { en: 'Football Leader', he: 'Football Leader' },
      sport: 'football',
      participation: { kind: 'team-affiliation', affiliation: { ...snapshot.athletes[0].participation.affiliation, competition: 'Eredivisie' } },
      performance: {
        ...snapshot.athletes[0].performance,
        competition: 'Eredivisie',
        stats: { kind: 'football', appearances: 12, goals: 3, assists: 4 },
      },
    } as Athlete
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [...snapshot.athletes, football] }} />)

    await user.click(screen.getByRole('button', { name: 'Rankings' }))
    const basketballGroup = screen.getByRole('heading', { name: 'Basketball' }).closest('.leaderboard-group')
    const footballGroup = screen.getByRole('heading', { name: 'Football' }).closest('.leaderboard-group')
    expect(basketballGroup).not.toBeNull()
    expect(footballGroup).not.toBeNull()
    expect(basketballGroup?.querySelectorAll('ol')).toHaveLength(1)
    expect(footballGroup?.querySelectorAll('ol')).toHaveLength(1)
    expect(basketballGroup).toHaveTextContent('01')
    expect(basketballGroup).toHaveTextContent('Portland Trail Blazers · NBA')
    expect(footballGroup).toHaveTextContent('01')
  })

  it('switches between rankings and the location map', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'Rankings' }))
    expect(
      screen.getByRole('heading', { name: /verified leaders/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(
      screen.getByRole('region', { name: /athlete locations/i }),
    ).toBeInTheDocument()
  })

  it('keeps the active directory filter across rankings and map views', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'Basketball' }))
    expect(screen.queryByRole('button', { name: /open oscar gloukh/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rankings' }))
    expect(screen.getByRole('heading', { name: 'Basketball' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Football' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByText('2 mapped')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open deni avdija from map/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open ben saraf from map/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open oscar gloukh from map/i })).not.toBeInTheDocument()
  })

  it('offers a keyboard-accessible map location list that opens details', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(
      screen.getByRole('button', { name: /open deni avdija from map/i }),
    )

    expect(
      screen.getByRole('dialog', { name: /deni avdija/i }),
    ).toBeInTheDocument()
  })

  it('omits a locationless circuit activity from the map while retaining team markers and list actions', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [...snapshot.athletes, circuitAthlete()] }} />)

    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByText('3 mapped')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open circuit athlete from map/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /open deni avdija from map/i }))
    expect(screen.getByRole('dialog', { name: /deni avdija/i })).toBeInTheDocument()
  })
})
