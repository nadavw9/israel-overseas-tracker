import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { snapshotSchema } from '../../src/domain/athlete'

const snapshot = snapshotSchema.parse(snapshotJson)

describe('verified athlete list', () => {
  it('shows the verified count and honest source freshness', () => {
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
    expect(screen.getAllByText(/source checked/i)).toHaveLength(3)
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

  it('labels identity-only records without fake totals', () => {
    render(<TrackerApp snapshot={snapshot} />)

    expect(screen.getByText('Stats source pending')).toBeInTheDocument()
    expect(screen.queryByText('0 goals')).not.toBeInTheDocument()
  })
})
