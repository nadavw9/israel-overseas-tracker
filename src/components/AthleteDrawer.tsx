import { useEffect, useRef, type RefObject } from 'react'
import { ArrowUpRight, MapPin, ShieldCheck, X } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { AthletePhoto } from './AthletePhoto'
import { FreshnessBadge } from './FreshnessBadge'

type AthleteDrawerProps = {
  athlete: Athlete
  onClose: () => void
  returnFocus: RefObject<HTMLButtonElement | null>
}

function statRows(athlete: Athlete) {
  const stats = athlete.stats
  if (!stats) return []
  if (stats.kind === 'basketball') {
    return [
      ['Games', stats.games],
      ['Points / game', stats.pointsPerGame],
      ['Rebounds / game', stats.reboundsPerGame],
      ['Assists / game', stats.assistsPerGame],
    ]
  }
  if (stats.kind === 'football') {
    return [['Appearances', stats.appearances], ['Goals', stats.goals], ['Assists', stats.assists]]
  }
  return [['Games', stats.games], ['Goals', stats.goals], ['Assists', stats.assists], ['Points', stats.points]]
}

export function AthleteDrawer({ athlete, onClose, returnFocus }: AthleteDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      returnFocus.current?.focus()
    }
  }, [onClose, returnFocus])

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="athlete-dialog-title"
      >
        <button ref={closeButton} type="button" className="drawer__close" onClick={onClose} aria-label={`Close ${athlete.name.en} details`}>
          <X aria-hidden="true" />
        </button>
        <div className="drawer__visual"><AthletePhoto athlete={athlete} /></div>
        <div className="drawer__content">
          <p className="section-heading__eyebrow">Verified athlete profile</p>
          <h2 id="athlete-dialog-title">{athlete.name.en}</h2>
          <p className="drawer__hebrew" lang="he" dir="rtl">{athlete.name.he}</p>
          <p className="drawer__club">{athlete.team}<span>{athlete.competition} · {athlete.season}</span></p>
          {athlete.location && <p className="drawer__location"><MapPin size={16} aria-hidden="true" /> {athlete.location.city}, {athlete.location.country}</p>}
          {athlete.stats ? (
            <dl className="drawer__stats">
              {statRows(athlete).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          ) : <div className="stats-unavailable">Stats source pending</div>}
          <FreshnessBadge freshness={athlete.freshness} source={athlete.source} />
          <div className="drawer__sources">
            <a href={athlete.eligibility.sourceUrl} target="_blank" rel="noreferrer"><ShieldCheck size={16} aria-hidden="true" /> Eligibility source <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href={athlete.source.sourceUrl} target="_blank" rel="noreferrer">Season data source <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
      </aside>
    </div>
  )
}
