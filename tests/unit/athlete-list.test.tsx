import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { snapshotSchema } from '../../src/domain/athlete'

const snapshot = snapshotSchema.parse(snapshotJson)

describe('verified athlete list', () => {
  it('shows the verified count and honest source freshness', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(snapshot.generatedAt))
    render(<TrackerApp snapshot={snapshot} />)
    const generatedDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(snapshot.generatedAt))

    expect(screen.getByText('3 verified athletes')).toBeInTheDocument()
    expect(
      screen.getByText(`Snapshot generated ${generatedDate}`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/source checked/i)).toHaveLength(2)
    expect(screen.getByText(/identity verified · performance unavailable/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('filters by athlete, team, competition, and sport', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.type(
      screen.getByRole('searchbox', { name: /search athletes/i }),
      'Ajax',
    )

    expect(
      screen.getByRole('button', { name: /open oscar gloukh/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /open deni avdija/i }),
    ).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: /search athletes/i }))
    await user.click(screen.getByRole('button', { name: 'Football' }))

    expect(
      screen.getByRole('button', { name: /open oscar gloukh/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /open ben saraf/i }),
    ).not.toBeInTheDocument()
  })

  it('searches names, aliases, and current affiliation details', async () => {
    const user = userEvent.setup()
    const aliased = { ...snapshot.athletes[0], aliases: ['Deni Turbo'] }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [aliased, ...snapshot.athletes.slice(1)] }} />)
    const search = screen.getByRole('searchbox', { name: /search athletes/i })

    for (const term of ['Deni Avdija', 'Deni Turbo', 'Portland Trail Blazers', 'NBA', 'Portland', 'United States']) {
      await user.clear(search)
      await user.type(search, term)
      expect(screen.getByRole('button', { name: /open deni avdija/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /open oscar gloukh/i })).not.toBeInTheDocument()
    }
  })

  it('searches the authoritative organization country without a location', async () => {
    const user = userEvent.setup()
    const affiliation = {
      ...snapshot.athletes[0].affiliation,
      organization: {
        ...snapshot.athletes[0].affiliation.organization,
        country: 'Cyprus',
      },
    }
    delete affiliation.location
    const athlete = { ...snapshot.athletes[0], affiliation }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [athlete] }} />)

    await user.type(screen.getByRole('searchbox', { name: /search athletes/i }), 'Cyprus')

    expect(screen.getByRole('button', { name: /open deni avdija/i })).toBeInTheDocument()
  })

  it('filters by tier, gender, and lifecycle status without stale values', async () => {
    const user = userEvent.setup()
    const injuredWoman = {
      ...snapshot.athletes[2],
      genderCategory: 'women' as const,
      lifecycleStatus: 'injured' as const,
    }
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [...snapshot.athletes.slice(0, 2), injuredWoman] }} />)

    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'development')
    expect(screen.getByRole('button', { name: /open ben saraf/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open deni avdija/i })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /athlete tier/i }), 'all')
    await user.selectOptions(screen.getByRole('combobox', { name: /gender category/i }), 'women')
    await user.selectOptions(screen.getByRole('combobox', { name: /lifecycle status/i }), 'injured')
    expect(screen.getByRole('button', { name: /open oscar gloukh/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open ben saraf/i })).not.toBeInTheDocument()
  })

  it('shows tier and lifecycle tags on cards', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getAllByText('Senior professional')).not.toHaveLength(0)
    expect(screen.getAllByText('Active')).not.toHaveLength(0)
  })

  it('shows the seeded incomplete coverage ledger exactly', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getByText('Coverage incomplete: 0 of 4 universes healthy')).toBeInTheDocument()
    expect(screen.queryByText(/complete coverage|all universes healthy|no misses/i)).not.toBeInTheDocument()
  })

  it('uses a local fallback without a broken or unapproved remote image', () => {
    render(<TrackerApp snapshot={snapshot} />)
    expect(screen.getAllByLabelText('Photo unavailable')).toHaveLength(snapshot.athletes.length)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('labels identity-only records without fake totals', () => {
    render(<TrackerApp snapshot={snapshot} />)

    expect(screen.getByText('Stats source pending')).toBeInTheDocument()
    expect(screen.queryByText('0 goals')).not.toBeInTheDocument()
  })
})
