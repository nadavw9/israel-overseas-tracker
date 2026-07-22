import { BadgeCheck, Clock3 } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'

type FreshnessBadgeProps = Pick<Athlete, 'freshness' | 'source'>

export function FreshnessBadge({ freshness, source }: FreshnessBadgeProps) {
  const { messages } = useI18n()
  const checked = new Intl.DateTimeFormat(messages.locale, {
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
      {freshness === 'stale' ? messages.lastVerified : messages.sourceChecked} {checked}
    </span>
  )
}
