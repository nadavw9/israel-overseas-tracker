import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import snapshotJson from '../../public/data/snapshot.json'
import { TrackerApp } from '../../src/app/App'
import { athleteSchema, snapshotSchema } from '../../src/domain/athlete'
import { messages } from '../../src/i18n/messages'

const snapshot = snapshotSchema.parse(snapshotJson)
const deni = snapshot.athletes.find((athlete) => athlete.id === 'deni-avdija')!

describe('Hebrew experience', () => {
  it('uses mixed-season wording and localizes nationality evidence in both locales', async () => {
    const user = userEvent.setup()
    const nationalityAthlete = athleteSchema.parse({ ...deni, eligibility: { ...deni.eligibility, basis: 'nationality' } })
    render(<TrackerApp snapshot={{ ...snapshot, athletes: [nationalityAthlete] }} />)

    expect(screen.getByText(messages.en.seasonKicker)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: messages.en.views.rankings }))
    expect(screen.getByText(messages.en.leadersPeriod)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: messages.en.views.athletes }))
    await user.click(screen.getByRole('button', { name: messages.en.openAthlete(deni.name.en) }))
    expect(screen.getByText(messages.en.eligibilityBasisLabels.nationality)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(messages.en.eligibilityBasisNotes.nationality, 'i'))).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: messages.en.languageToggle }))
    await user.click(screen.getByRole('button', { name: messages.he.openAthlete(deni.name.he) }))
    expect(screen.getByText(messages.he.eligibilityBasisLabels.nationality)).toBeInTheDocument()
  })

  it('localizes the core tracker and switches document direction', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)
    await user.click(screen.getByRole('button', { name: messages.en.languageToggle }))

    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')
    expect(screen.getByRole('heading', { name: `${messages.he.titleFirst} ${messages.he.titleSecond}` })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', messages.he.searchPlaceholder)
    expect(screen.getByRole('button', { name: messages.he.openAthlete(deni.name.he) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('localizes athlete statistic labels in the details drawer', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)
    await user.click(screen.getByRole('button', { name: messages.en.languageToggle }))
    await user.click(screen.getByRole('button', { name: messages.he.openAthlete(deni.name.he) }))

    expect(screen.getByText(messages.he.statLabels.games)).toBeInTheDocument()
    expect(screen.queryByText(messages.en.statLabels.games)).not.toBeInTheDocument()
  })

  it('localizes coverage, filter controls, tags, and RTL labels', async () => {
    const user = userEvent.setup()
    render(<TrackerApp snapshot={snapshot} />)
    await user.click(screen.getByRole('button', { name: messages.en.languageToggle }))

    expect(screen.getByText(messages.he.coverageStatus(1, 7, false))).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: messages.he.filterTier })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: messages.he.filterGender })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: messages.he.filterStatus })).toBeInTheDocument()
    expect(screen.getAllByText(messages.he.tiers['senior-professional'])).not.toHaveLength(0)
    expect(screen.getAllByText(messages.he.lifecycleStatuses.active)).not.toHaveLength(0)
    expect(document.querySelector('.filter-dimensions')).toHaveAttribute('dir', 'rtl')
  })
})
