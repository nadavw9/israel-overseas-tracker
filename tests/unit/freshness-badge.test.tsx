import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FreshnessBadge } from '../../src/components/FreshnessBadge'
import type { Athlete } from '../../src/domain/athlete'

const observedAt = '2026-07-23T08:00:00.000Z'

function performance(state: 'final' | 'stale' = 'final'): Athlete['performance'] {
  return {
    status: 'available',
    state,
    competition: 'NBA',
    season: '2025-26',
    stats: { kind: 'basketball', games: 1, pointsPerGame: 1, reboundsPerGame: 1, assistsPerGame: 1 },
    source: { provider: 'espn-nba', sourceUrl: 'https://example.com/stats', retrievedAt: observedAt },
  }
}

describe('FreshnessBadge', () => {
  it.each([
    ['fresh before retention expires', '2026-07-25T07:59:59.999Z', /source checked/i],
    ['fresh at the exact retention boundary', '2026-07-25T08:00:00.000Z', /source checked/i],
    ['stale after retention expires', '2026-07-25T08:00:00.001Z', /last verified/i],
  ])('%s', (_label, now, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    render(<FreshnessBadge performance={performance()} />)
    expect(screen.getByText(expected)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('keeps an explicitly stale observation stale regardless of age', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    render(<FreshnessBadge performance={performance('stale')} />)
    expect(screen.getByText(/last verified/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('keeps an aged unavailable observation identity-only', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T08:00:00.000Z'))
    render(<FreshnessBadge performance={{
      ...performance(), status: 'unavailable', state: 'unavailable', stats: null,
    }} />)
    expect(document.querySelector('.freshness--identity-only')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
