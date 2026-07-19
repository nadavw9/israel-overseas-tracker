import { BadgeCheck, Clock3 } from 'lucide-react'
import type { Athlete } from '../domain/athlete'

type FreshnessBadgeProps = Pick<Athlete, 'freshness' | 'source'>

export function FreshnessBadge({ freshness, source }: FreshnessBadgeProps) {
  const checked = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(source.retrievedAt))

  return (
    <span className={`freshness freshness--${freshness}`}>
      {freshness === 'stale' ? (
        <Clock3 size={14} aria-hidden="true" />
      ) : (
        <BadgeCheck size={14} aria-hidden="true" />
      )}
      {freshness === 'stale' ? 'Last verified' : 'Source checked'} {checked}
    </span>
  )
}
