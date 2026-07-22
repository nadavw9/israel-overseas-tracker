import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import type { Athlete } from '../../src/domain/athlete'
import { snapshotSchema } from '../../src/domain/athlete'
import { rankAthletes } from '../../src/services/rankings'

const snapshot = snapshotSchema.parse(snapshotJson)

describe('athlete details', () => {
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
    const seasonSource = screen.getByRole('link', { name: /season data source/i })

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
})
