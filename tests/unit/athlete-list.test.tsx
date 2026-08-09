import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'
import type { Athlete } from '../../src/domain/athlete'
import { messages } from '../../src/i18n/messages'

const snapshot = snapshotSchema.parse(snapshotJson)

function circuitAthlete(): Athlete {
  return athleteSchema.parse({
    ...snapshot.athletes[2], id: 'circuit-athlete', name: { en: 'Circuit Athlete', he: 'Circuit Athlete' }, sport: 'tennis', discipline: 'singles', tier: 'international-circuit',
    participation: { kind: 'circuit-activity', activity: { circuit: 'ITF', discipline: 'singles', competition: 'Granby National Bank Championships', season: '2026', activityType: 'ranking', effectiveAt: '2026-08-01T00:00:00.000Z', source: { publisher: 'ITF', sourceUrl: 'https://example.com/itf/circuit-athlete', retrievedAt: '2026-08-03T22:00:00.000Z' } } },
    performance: { status: 'unavailable', state: 'unavailable', stats: null, reason: 'not-integrated' },
  })
}

describe('verified athlete list', () => {
  it('shows the expanded verified count and honest source freshness', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(snapshot.generatedAt))
    render(<TrackerApp snapshot={snapshot} />)
    const generatedDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(snapshot.generatedAt))
    expect(screen.getByText('18 verified athletes')).toBeInTheDocument()
    expect(screen.getByText(`Snapshot generated ${generatedDate}`)).toBeInTheDocument()
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/source checked/i)).toHaveLength(3)
    expect(screen.getAllByText(messages.en.notIntegrated)).not.toHaveLength(0)
    vi.useRealTimers()
  })

  it('filters by athlete, team, competition, and sport', async () => {
    const user = userEvent.setup(); render(<TrackerApp snapshot={snapshot} />)
    await user.type(screen.getByRole('searchbox', { name: /search athletes/i }), 'Ajax')
    expect(screen.getByRole('button', { name: /open oscar gloukh/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: /search athletes/i }))
    await user.click(screen.getByRole('button', { name: 'Football' }))
    expect(screen.getByRole('button', { name: /open oscar gloukh/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open ben saraf/i })).not.toBeInTheDocument()
  })

  it('searches names, aliases, team participation, and circuit participation', async () => {
    const user = userEvent.setup(); const aliased = { ...snapshot.athletes[0], aliases: ['Deni Turbo'] }; const circuit = circuitAthlete(); const oscar = snapshot.athletes.find((athlete) => athlete.id === 'oscar-gloukh')!
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [aliased, oscar, circuit] }} />)
    const search = screen.getByRole('searchbox', { name: /search athletes/i })
    for (const term of ['Deni Avdija', 'Deni Turbo', 'Portland Trail Blazers']) { await user.clear(search); await user.type(search, term); expect(screen.getByRole('button', { name: /open deni avdija/i })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /open oscar gloukh/i })).not.toBeInTheDocument() }
    await user.clear(search); await user.type(search, 'ITF'); expect(screen.getByRole('button', { name: /open circuit athlete/i })).toBeInTheDocument()
  })

  it('does not add an organization country as a location search term', async () => {
    const user = userEvent.setup(); const affiliation = { ...snapshot.athletes[0].participation.affiliation, organization: { ...snapshot.athletes[0].participation.affiliation.organization, country: 'Cyprus' } }; delete affiliation.location
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [{ ...snapshot.athletes[0], participation: { kind: 'team-affiliation' as const, affiliation } }] }} />)
    await user.type(screen.getByRole('searchbox', { name: /search athletes/i }), 'Cyprus')
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()
  })

  it('filters by tier, gender, and lifecycle status without stale values', async () => {
    const user = userEvent.setup(); const injuredWoman = { ...snapshot.athletes[2], genderCategory: 'women' as const, lifecycleStatus: 'injured' as const }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [...snapshot.athletes.slice(0, 2), injuredWoman] }} />)
    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'development'); expect(screen.getByRole('button', { name: /open ben saraf/i })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'all'); await user.selectOptions(screen.getByRole('combobox', { name: /gender category/i }), 'women'); await user.selectOptions(screen.getByRole('combobox', { name: /lifecycle status/i }), 'injured')
    expect(screen.getByRole('button', { name: /open danny wolf/i })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /open ben saraf/i })).not.toBeInTheDocument()
  })

  it('shows tier and lifecycle tags on cards', () => { render(<TrackerApp snapshot={snapshot} />); expect(screen.getAllByText('Senior professional')).not.toHaveLength(0); expect(screen.getAllByText('Active')).not.toHaveLength(0) })
  it('shows the seeded incomplete coverage ledger exactly', () => { render(<TrackerApp snapshot={snapshot} />); expect(screen.getByText('Coverage incomplete: 1 of 7 universes healthy')).toBeInTheDocument(); expect(screen.queryByText(/complete coverage|all universes healthy|no misses/i)).not.toBeInTheDocument() })
  it('uses a local fallback without a broken or unapproved remote image', () => { render(<TrackerApp snapshot={snapshot} />); expect(screen.getAllByLabelText('Photo unavailable')).toHaveLength(snapshot.athletes.length); expect(screen.queryByRole('img')).not.toBeInTheDocument() })
  it('labels identity-only records without fake totals', () => { render(<TrackerApp snapshot={snapshot} />); expect(screen.getAllByText('Stats source pending')).not.toHaveLength(0); expect(screen.queryByText('0 goals')).not.toBeInTheDocument() })
})
