import { BadgeCheck, Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'
import { isObservationWithinRetention, PERFORMANCE_RETENTION_MS } from '../domain/observation'

type FreshnessBadgeProps = { performance: Athlete['performance'] }

export function FreshnessBadge({ performance }: FreshnessBadgeProps) {
  const { messages } = useI18n()
  const [, updateClock] = useState(0)
  useEffect(() => {
    if (performance.status === 'unavailable' || performance.state === 'stale') return
    const staleAt = new Date(performance.source.retrievedAt).getTime() + PERFORMANCE_RETENTION_MS + 1
    const delay = staleAt - Date.now()
    if (!Number.isFinite(delay) || delay <= 0) return
    const timeout = setTimeout(() => updateClock((clock) => clock + 1), delay)
    return () => clearTimeout(timeout)
  }, [performance.source.retrievedAt, performance.state, performance.status])

  const freshness =
    performance.status === 'unavailable'
      ? 'identity-only'
      : performance.state === 'stale' ||
          !isObservationWithinRetention(performance.source.retrievedAt, new Date())
        ? 'stale'
        : 'fresh'
  const checked = new Intl.DateTimeFormat(messages.locale, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(performance.source.retrievedAt))

  return (
    <span className={`freshness freshness--${freshness}`}>
      {freshness === 'stale' ? (
        <Clock3 size={14} aria-hidden="true" />
      ) : (
        <BadgeCheck size={14} aria-hidden="true" />
      )}
      {freshness === 'stale' ? messages.lastVerified : messages.sourceChecked} {checked}
    </span>
  )
}
