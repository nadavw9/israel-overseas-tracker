import { act, render, screen } from '@testing-library/react'
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

  it.each([
    ['not-integrated', /identity\/activity verified.*not integrated/i],
    ['provider-unavailable', /identity\/activity verified · performance temporarily unavailable/i],
  ] as const)('explains unavailable %s without reading a performance source', (reason, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T08:00:00.000Z'))
    render(<FreshnessBadge performance={{
      status: 'unavailable', state: 'unavailable', stats: null, reason,
    }} />)
    expect(document.querySelector('.freshness--identity-only')).toBeInTheDocument()
    expect(screen.getByText(expected)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('becomes stale one millisecond after the exact boundary without remounting', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T07:59:59.999Z'))
    render(<FreshnessBadge performance={performance()} />)
    const badge = document.querySelector('.freshness')

    expect(badge).toHaveClass('freshness--fresh')
    act(() => vi.advanceTimersByTime(1))
    expect(badge).toHaveClass('freshness--fresh')
    act(() => vi.advanceTimersByTime(1))
    expect(badge).toHaveClass('freshness--stale')
    expect(screen.getByText(/last verified/i)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
