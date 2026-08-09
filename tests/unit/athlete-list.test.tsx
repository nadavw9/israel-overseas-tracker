import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'
import type { Athlete } from '../../src/domain/athlete'
import { messages } from '../../src/i18n/messages'

const snapshot = snapshotSchema.parse(snapshotJson)
const deni = snapshot.athletes.find((athlete) => athlete.id === 'deni-avdija')!
const oscar = snapshot.athletes.find((athlete) => athlete.id === 'oscar-gloukh')!

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
        circuit: 'ITF',
        discipline: 'singles',
        competition: 'Granby National Bank Championships',
        season: '2026',
        activityType: 'ranking',
        effectiveAt: '2026-08-01T00:00:00.000Z',
        source: {
          publisher: 'ITF',
          sourceUrl: 'https://example.com/itf/circuit-athlete',
          retrievedAt: '2026-08-03T22:00:00.000Z',
        },
      },
    },
    performance: { status: 'unavailable', state: 'unavailable', stats: null, reason: 'not-integrated' },
  })
}

function renderSearchFixture() {
  const aliased = { ...deni, aliases: ['Deni Turbo'] }
  render(<TrackerApp snapshot={{ ...snapshot, athletes: [aliased, oscar, circuitAthlete()] }} />)
  return screen.getByRole('searchbox', { name: /search athletes/i })
}

describe('verified athlete list', () => {
  it('shows the expanded verified count and honest source freshness', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(snapshot.generatedAt))
    render(<TrackerApp snapshot={snapshot} />)
    const generatedDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(snapshot.generatedAt))

    expect(screen.getByText('18 verified athletes')).toBeInTheDocument()
    expect(screen.getByText(`Snapshot generated ${generatedDate}`)).toBeInTheDocument()
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/source checked/i)).toHaveLength(3)
    expect(screen.getAllByText(messages.en.notIntegrated)).not.toHaveLength(0)
    vi.useRealTimers()
  })

  it('summarizes the public registry shape before the directory controls', () => {
    render(<TrackerApp snapshot={snapshot} />)

    const board = screen.getByRole('region', { name: /verified registry board/i })
    expect(within(board).getByText('Verified records, visible limits')).toBeInTheDocument()
    expect(within(board).getByText(/missing stats and photos stay explicit/i)).toBeInTheDocument()

    for (const [label, count] of [
      ['Basketball', '8'],
      ['Football', '5'],
      ['Tennis', '5'],
      ['Women', '4'],
      ['Circuit', '5'],
      ['Stats', '3'],
      ['Mapped', '3'],
    ] as const) {
      const row = within(board).getByText(label).closest('div')
      expect(row).not.toBeNull()
      expect(within(row as HTMLElement).getByText(count)).toBeInTheDocument()
    }
  })

  it('filters by athlete, team, competition, and sport', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)
    await user.type(screen.getByRole('searchbox', { name: /search athletes/i }), 'Ajax')

    expect(screen.getByRole('button', { name: /open oscar gloukh/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: /search athletes/i }))
    await user.click(screen.getByRole('button', { name: 'Football' }))
    expect(screen.getByRole('button', { name: /open oscar gloukh/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open ben saraf/i })).not.toBeInTheDocument()
  })

  it('searches athlete names and aliases in a minimal fixture', async () => {
    const user = userEvent.setup()
    const search = renderSearchFixture()
    for (const term of ['Deni Avdija', 'Deni Turbo']) {
      await user.clear(search)
      await user.type(search, term)
      expect(screen.getByRole('button', { name: /open deni avdija/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /open oscar gloukh/i })).not.toBeInTheDocument()
    }
  })

  it('searches team, league, and verified location fields in a minimal fixture', async () => {
    const user = userEvent.setup()
    const search = renderSearchFixture()
    for (const term of ['Portland Trail Blazers', 'NBA', 'Portland', 'United States']) {
      await user.clear(search)
      await user.type(search, term)
      expect(screen.getByRole('button', { name: /open deni avdija/i })).toBeInTheDocument()
    }
  })

  it('searches circuit participation by circuit, competition, and Hebrew label', async () => {
    const user = userEvent.setup()
    const search = renderSearchFixture()
    for (const term of ['ITF', 'Granby National Bank Championships', messages.he.circuitParticipation('ITF')]) {
      await user.clear(search)
      await user.type(search, term)
      expect(screen.getByRole('button', { name: /open circuit athlete/i })).toBeInTheDocument()
    }
  })

  it('does not add an organization country as a location search term', async () => {
    const user = userEvent.setup()
    const affiliation = {
      ...deni.participation.affiliation,
      organization: { ...deni.participation.affiliation.organization, country: 'Cyprus' },
    }
    delete affiliation.location
    const athlete = { ...deni, participation: { kind: 'team-affiliation' as const, affiliation } }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [athlete] }} />)

    await user.type(screen.getByRole('searchbox', { name: /search athletes/i }), 'Cyprus')
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()
  })

  it('filters by tier, gender, and lifecycle status without stale values', async () => {
    const user = userEvent.setup()
    const injuredWoman = { ...snapshot.athletes[2], genderCategory: 'women' as const, lifecycleStatus: 'injured' as const }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [deni, snapshot.athletes[1], injuredWoman] }} />)

    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'development')
    expect(screen.getByRole('button', { name: /open ben saraf/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'all')
    await user.selectOptions(screen.getByRole('combobox', { name: /gender category/i }), 'women')
    await user.selectOptions(screen.getByRole('combobox', { name: /lifecycle status/i }), 'injured')
    expect(screen.getByRole('button', { name: /open danny wolf/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open ben saraf/i })).not.toBeInTheDocument()
  })

  it('shows tier and lifecycle tags on cards', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getAllByText('Senior professional')).not.toHaveLength(0)
    expect(screen.getAllByText('Active')).not.toHaveLength(0)
  })

  it('shows the seeded incomplete coverage ledger exactly', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getByText('Coverage incomplete: 1 of 7 universes healthy')).toBeInTheDocument()
    expect(screen.queryByText(/complete coverage|all universes healthy|no misses/i)).not.toBeInTheDocument()
  })

  it('uses a local fallback without a broken or unapproved remote image', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getAllByLabelText('Photo unavailable')).toHaveLength(snapshot.athletes.length)
    expect(screen.getAllByText('Image rights pending')).toHaveLength(snapshot.athletes.length)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('labels identity-only records without fake totals', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getAllByText('Stats source pending')).not.toHaveLength(0)
    expect(screen.queryByText('0 goals')).not.toBeInTheDocument()
  })
})
