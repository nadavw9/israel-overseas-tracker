import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { snapshotSchema } from '../../src/domain/athlete'

const snapshot = snapshotSchema.parse(snapshotJson)

describe('Hebrew experience', () => {
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
})
