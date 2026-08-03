import { useEffect, useRef, type RefObject } from 'react'
import { ArrowUpRight, MapPin, ShieldCheck, X } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { AthletePhoto } from './AthletePhoto'
import { FreshnessBadge } from './FreshnessBadge'
import { useI18n } from '../i18n/context'

type AthleteDrawerProps = {
  athlete: Athlete
  onClose: () => void
  returnFocus: RefObject<HTMLButtonElement | null>
}

type StatLabels = {
  games: string
  pointsPerGame: string
  reboundsPerGame: string
  assistsPerGame: string
  appearances: string
  goals: string
  assists: string
  points: string
}

function statRows(athlete: Athlete, labels: StatLabels) {
  const stats = athlete.performance.stats
  if (!stats) return []
  if (stats.kind === 'basketball') {
    return [
      [labels.games, stats.games],
      [labels.pointsPerGame, stats.pointsPerGame],
      [labels.reboundsPerGame, stats.reboundsPerGame],
      [labels.assistsPerGame, stats.assistsPerGame],
    ]
  }
  if (stats.kind === 'football') {
    return [[labels.appearances, stats.appearances], [labels.goals, stats.goals], [labels.assists, stats.assists]]
  }
  return [[labels.games, stats.games], [labels.goals, stats.goals], [labels.assists, stats.assists], [labels.points, stats.points]]
}

export function AthleteDrawer({ athlete, onClose, returnFocus }: AthleteDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLElement>(null)
  const { locale, messages } = useI18n()
  const displayName = athlete.name[locale]

  useEffect(() => {
    const returnTarget = returnFocus.current
    const previousOverflow = document.body.style.overflow
    const background = [
      ...document.querySelectorAll<HTMLElement>(
        '.tracker-shell > header, .tracker-shell > main',
      ),
    ].map((element) => ({
      element,
      hadInert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }))

    background.forEach(({ element }) => {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    })

    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !drawer.current) return

      const focusable = [
        ...drawer.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      background.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute('inert')
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      returnTarget?.focus()
    }
  }, [onClose, returnFocus])

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        ref={drawer}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="athlete-dialog-title"
      >
        <button ref={closeButton} type="button" className="drawer__close" onClick={onClose} aria-label={messages.closeDetails(displayName)}>
          <X aria-hidden="true" />
        </button>
        <div className="drawer__visual"><AthletePhoto athlete={athlete} /></div>
        <div className="drawer__content">
          <p className="section-heading__eyebrow">{messages.profileKicker}</p>
          <h2 id="athlete-dialog-title">{displayName}</h2>
          <p className="drawer__hebrew" lang={locale === 'en' ? 'he' : 'en'} dir={locale === 'en' ? 'rtl' : 'ltr'}>{athlete.name[locale === 'en' ? 'he' : 'en']}</p>
          <p className="drawer__club">{athlete.affiliation.organization.name}<span>{athlete.affiliation.competition} · {athlete.affiliation.season}</span></p>
          {athlete.affiliation.location && <p className="drawer__location"><MapPin size={16} aria-hidden="true" /> {athlete.affiliation.location.city}, {athlete.affiliation.location.country}</p>}
          <div className="athlete-tags" aria-label={messages.athleteClassifications}>
            <span>{messages.tiers[athlete.tier]}</span>
            <span>{messages.lifecycleStatuses[athlete.lifecycleStatus]}</span>
          </div>
          <section className="drawer__eligibility" aria-labelledby="eligibility-basis-title">
            <p id="eligibility-basis-title">{messages.eligibilityBasis}</p>
            <strong>{messages.eligibilityBasisLabels[athlete.eligibility.basis]}</strong>
            <span>{messages.eligibilityBasisNotes[athlete.eligibility.basis]}</span>
          </section>
          {athlete.performance.stats ? (
            <dl className="drawer__stats">
              {statRows(athlete, messages.statLabels).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          ) : <div className="stats-unavailable">{messages.statsPending}</div>}
          <FreshnessBadge performance={athlete.performance} />
          <div className="drawer__sources">
            <a href={athlete.eligibility.sourceUrl} target="_blank" rel="noreferrer"><ShieldCheck size={16} aria-hidden="true" /> {messages.eligibilitySource} <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href={athlete.affiliation.source.sourceUrl} target="_blank" rel="noreferrer">{messages.affiliationSource} <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href={athlete.performance.source.sourceUrl} target="_blank" rel="noreferrer">{messages.seasonSource} <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
      </aside>
    </div>
  )
}
