import { useState } from 'react'
import { UserRound } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'

export function AthletePhoto({ athlete }: { athlete: Athlete }) {
  const [failed, setFailed] = useState(false)
  const { messages } = useI18n()

  if (!athlete.image || failed) {
    return (
      <div className="athlete-photo athlete-photo--fallback" aria-label={messages.photoUnavailable}>
        <UserRound size={76} strokeWidth={1.2} aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="athlete-photo">
      <img
        src={athlete.image.url}
        alt={athlete.image.alt}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
