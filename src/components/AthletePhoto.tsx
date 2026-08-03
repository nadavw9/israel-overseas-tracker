import { useState } from 'react'
import { UserRound } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'

export function AthletePhoto({ athlete }: { athlete: Athlete }) {
  const [failed, setFailed] = useState(false)
  const { messages } = useI18n()
  const image = athlete.image

  const approvedImage = image &&
    image.rightsStatus === 'approved' &&
    typeof image.url === 'string' && image.url.trim() !== '' &&
    typeof image.sourceUrl === 'string' && image.sourceUrl.trim() !== '' &&
    typeof image.alt === 'string' && image.alt.trim() !== '' &&
    typeof image.rightsHolder === 'string' && image.rightsHolder.trim() !== '' &&
    typeof image.license === 'string' && image.license.trim() !== '' &&
    typeof image.usage === 'string' && image.usage.trim() !== '' &&
    typeof image.retrievedAt === 'string' && image.retrievedAt.trim() !== ''

  if (!approvedImage || failed) {
    return (
      <div className="athlete-photo athlete-photo--fallback" aria-label={messages.photoUnavailable}>
        <UserRound size={76} strokeWidth={1.2} aria-hidden="true" />
      </div>
    )
  }

  const attribution = image.attribution ?? `${image.rightsHolder} (${image.license})`

  return (
    <div className="athlete-photo">
      <img
        src={image.url}
        alt={image.alt}
        onError={() => setFailed(true)}
      />
      <a
        className="athlete-photo__attribution"
        href={image.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Image rights: ${attribution}`}
      >
        {attribution}
      </a>
    </div>
  )
}
