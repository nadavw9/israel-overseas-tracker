import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { publicMediaSchema, type Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'

export function AthletePhoto({ athlete, attributionMode = 'link' }: { athlete: Athlete, attributionMode?: 'link' | 'text' }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const { messages } = useI18n()
  const parsedImage = publicMediaSchema.safeParse(athlete.image)
  const image = parsedImage.success ? parsedImage.data : undefined

  if (!image || failedUrl === image.url) {
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
        onError={() => setFailedUrl(image.url)}
      />
      {attributionMode === 'link' ? (
        <a className="athlete-photo__attribution" href={image.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Image rights: ${attribution}`}>
          {attribution}
        </a>
      ) : <span className="athlete-photo__attribution" aria-label={`Image rights: ${attribution}`}>{attribution}</span>}
    </div>
  )
}
