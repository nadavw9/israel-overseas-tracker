import { useEffect, useMemo, useRef, useState } from 'react'
import type { Athlete, AthleteSnapshot } from '../domain/athlete'
import type { RefreshManifest } from '../domain/refresh'
import { AppHeader } from '../components/AppHeader'
import { AthleteCard } from '../components/AthleteCard'
import { AthleteDrawer } from '../components/AthleteDrawer'
import { CoverageLedgerPanel } from '../components/CoverageLedgerPanel'
import { FilterBar, type DirectoryFilters } from '../components/FilterBar'
import { Leaderboard } from '../components/Leaderboard'
import { ViewNav, type TrackerView } from '../components/ViewNav'
import { I18nContext } from '../i18n/context'
import { messages, type Locale } from '../i18n/messages'
import { participationDisplay } from '../services/participation'
import './styles.css'

type TrackerAppProps = {
  snapshot: AthleteSnapshot
  refreshManifest?: RefreshManifest | null
}

function matchesQuery(athlete: Athlete, query: string): boolean {
  const englishParticipation = participationDisplay(
    athlete.participation,
    messages.en.circuitParticipation,
  )
  const hebrewParticipation = participationDisplay(
    athlete.participation,
    messages.he.circuitParticipation,
  )
  const haystack = [
    athlete.name.en,
    athlete.name.he,
    ...athlete.aliases,
    englishParticipation.title,
    englishParticipation.competition,
    englishParticipation.season,
    hebrewParticipation.title,
    hebrewParticipation.competition,
    hebrewParticipation.season,
    englishParticipation.location?.city,
    englishParticipation.location?.country,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(query.trim().toLocaleLowerCase())
}

export function TrackerApp({ snapshot, refreshManifest = null }: TrackerAppProps) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<DirectoryFilters>({
    sport: 'all',
    tier: 'all',
    gender: 'all',
    status: 'all',
  })
  const [view, setView] = useState<TrackerView>('athletes')
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null)
  const [locale, setLocale] = useState<Locale>('en')
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const copy = messages[locale]
  const sports = useMemo(
    () => [...new Set(snapshot.athletes.map((athlete) => athlete.sport))],
    [snapshot.athletes],
  )
  const tiers = useMemo(
    () => [...new Set(snapshot.athletes.map((athlete) => athlete.tier))],
    [snapshot.athletes],
  )
  const genders = useMemo(
    () => [...new Set(snapshot.athletes.map((athlete) => athlete.genderCategory))],
    [snapshot.athletes],
  )
  const statuses = useMemo(
    () => [...new Set(snapshot.athletes.map((athlete) => athlete.lifecycleStatus))],
    [snapshot.athletes],
  )

  useEffect(() => {
    setFilters((current) => {
      const next: DirectoryFilters = {
        sport: current.sport !== 'all' && !sports.includes(current.sport) ? 'all' : current.sport,
        tier: current.tier !== 'all' && !tiers.includes(current.tier) ? 'all' : current.tier,
        gender: current.gender !== 'all' && !genders.includes(current.gender) ? 'all' : current.gender,
        status: current.status !== 'all' && !statuses.includes(current.status) ? 'all' : current.status,
      }
      return Object.keys(next).some((key) => next[key as keyof DirectoryFilters] !== current[key as keyof DirectoryFilters])
        ? next
        : current
    })
  }, [genders, sports, statuses, tiers])

  useEffect(() => {
    const previousLang = document.documentElement.lang
    const previousDirection = document.documentElement.dir
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    return () => {
      document.documentElement.lang = previousLang
      document.documentElement.dir = previousDirection
    }
  }, [locale])

  const athletes = useMemo(
    () =>
      snapshot.athletes.filter(
          (athlete) =>
          (filters.sport === 'all' || athlete.sport === filters.sport) &&
          (filters.tier === 'all' || athlete.tier === filters.tier) &&
          (filters.gender === 'all' || athlete.genderCategory === filters.gender) &&
          (filters.status === 'all' || athlete.lifecycleStatus === filters.status) &&
          matchesQuery(athlete, query),
      ),
    [filters, query, snapshot.athletes],
  )

  const updated = new Intl.DateTimeFormat(copy.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(snapshot.generatedAt))

  const openAthlete = (athlete: Athlete) => {
    const activeElement = document.activeElement
    returnFocus.current =
      activeElement instanceof HTMLButtonElement ? activeElement : null
    setSelectedAthlete(athlete)
  }

  return (
    <I18nContext.Provider value={{ locale, messages: copy }}>
    <div className="tracker-shell">
      <AppHeader
        onToggleLocale={() => setLocale(locale === 'en' ? 'he' : 'en')}
        refreshManifest={refreshManifest}
      />
      <main>
        <section className="hero" aria-labelledby="tracker-title">
          <div className="hero__glow" aria-hidden="true" />
          <div className="hero__content">
            <div className="hero__message">
              <p className="hero__kicker">{copy.seasonKicker}</p>
              <h1 id="tracker-title">
                {copy.titleFirst} <span>{copy.titleSecond}</span>
              </h1>
              <p className="hero__lede">{copy.heroLede}</p>
              <div className="hero__proof" aria-label={copy.snapshotStatus}>
                <strong>{copy.verifiedAthletes(snapshot.athletes.length)}</strong>
                <span>{copy.snapshotGenerated} {updated}</span>
                <span>{copy.noInvented}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="content" aria-label={copy.explorer}>
          <ViewNav view={view} onChange={setView} />
          <CoverageLedgerPanel coverage={snapshot.coverage} />

          {view === 'athletes' && (
            <div className="section-heading">
              <div>
                <p className="section-heading__eyebrow">{copy.directory}</p>
                <h2 id="athletes-title">{copy.athletesAbroad}</h2>
              </div>
              <p>{copy.showing(athletes.length)}</p>
            </div>
          )}

          <FilterBar
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            sports={sports}
            tiers={tiers}
            genders={genders}
            statuses={statuses}
          />

          {view === 'athletes' && athletes.length > 0 ? (
            <div className="athlete-grid">
              {athletes.map((athlete, index) => (
                <AthleteCard
                  key={athlete.id}
                  athlete={athlete}
                  rank={index + 1}
                  onOpen={() => openAthlete(athlete)}
                />
              ))}
            </div>
          ) : view === 'athletes' ? (
            <div className="empty-state" role="status">
              <h3>{copy.noMatches}</h3>
              <p>{copy.noMatchesHint}</p>
            </div>
          ) : null}

          {view === 'rankings' && <Leaderboard athletes={athletes} />}
        </section>
      </main>
      {selectedAthlete && (
        <AthleteDrawer
          athlete={selectedAthlete}
          onClose={() => setSelectedAthlete(null)}
          returnFocus={returnFocus}
        />
      )}
    </div>
    </I18nContext.Provider>
  )
}
