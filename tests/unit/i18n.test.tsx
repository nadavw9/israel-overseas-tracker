import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'

const snapshot = snapshotSchema.parse(snapshotJson)

describe('Hebrew experience', () => {
  it('uses mixed-season wording and localizes nationality evidence in both locales', async () => {
    const user = userEvent.setup()
    const nationalityAthlete = athleteSchema.parse({
      ...snapshot.athletes[0],
      eligibility: { ...snapshot.athletes[0].eligibility, basis: 'nationality' },
    })
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [nationalityAthlete] }} />)

    expect(screen.getByText('Current · verified registry')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rankings' }))
    expect(screen.getByText('Latest sourced performance')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Athletes' }))
    await user.click(screen.getByRole('button', { name: /open deni avdija/i }))
    expect(screen.getByText('Nationality evidence')).toBeInTheDocument()
    expect(screen.getByText(/nationality evidence identifies a legal nationality/i)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'עברית' }))
    await user.click(screen.getByRole('button', { name: /פתיחת דני אבדיה/i }))
    expect(screen.getByText('ראיית לאום')).toBeInTheDocument()
  })

  it('localizes the core tracker and switches document direction', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'עברית' }))

    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')
    expect(
      screen.getByRole('heading', { name: /ישראל בחו״ל/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      'חיפוש ספורטאים, קבוצות ותחרויות…',
    )
    expect(
      screen.getByRole('button', { name: /פתיחת דני אבדיה/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('localizes athlete statistic labels in the details drawer', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'עברית' }))
    await user.click(screen.getByRole('button', { name: /פתיחת דני אבדיה/i }))

    expect(screen.getByText('משחקים')).toBeInTheDocument()
    expect(screen.queryByText('Games')).not.toBeInTheDocument()
  })

  it('localizes coverage, filter controls, tags, and RTL labels', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: 'עברית' }))

    expect(screen.getByText('הכיסוי חלקי: 0 מתוך 4 מאגרי סריקה תקינים')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'רמת ספורטאי' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'קטגוריית מגדר' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'סטטוס פעילות' })).toBeInTheDocument()
    expect(screen.getAllByText('בוגרים מקצוענים')).not.toHaveLength(0)
    expect(screen.getAllByText('פעיל')).not.toHaveLength(0)
    expect(document.querySelector('.filter-dimensions')).toHaveAttribute('dir', 'rtl')
  })
})
