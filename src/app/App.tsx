import { useEffect, useMemo, useRef, useState } from 'react'
import type { Athlete, AthleteSnapshot } from '../domain/athlete'
import { AppHeader } from '../components/AppHeader'
import { AthleteCard } from '../components/AthleteCard'
import { AthleteDrawer } from '../components/AthleteDrawer'
import { AthleteMap } from '../components/AthleteMap'
import { CoverageStatus } from '../components/CoverageStatus'
import { FilterBar, type DirectoryFilters } from '../components/FilterBar'
import { Leaderboard } from '../components/Leaderboard'
import { ViewNav, type TrackerView } from '../components/ViewNav'
import { I18nContext } from '../i18n/context'
import { messages, type Locale } from '../i18n/messages'
import './styles.css'

type TrackerAppProps = {
  snapshot: AthleteSnapshot
}

function matchesQuery(athlete: Athlete, query: string): boolean {
  const haystack = [
    athlete.name.en,
    athlete.name.he,
    ...athlete.aliases,
    athlete.affiliation.organization.name,
    athlete.affiliation.organization.country,
    athlete.affiliation.competition,
    athlete.affiliation.location?.city,
    athlete.affiliation.location?.country,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(query.trim().toLocaleLowerCase())
}

export function TrackerApp({ snapshot }: TrackerAppProps) {
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

  useEffect(() => {
    if (filters.sport !== 'all' && !sports.includes(filters.sport)) {
      setFilters((current) => ({ ...current, sport: 'all' }))
    }
  }, [filters.sport, sports])

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
      <AppHeader onToggleLocale={() => setLocale(locale === 'en' ? 'he' : 'en')} />
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
            <CoverageStatus coverage={snapshot.coverage} />
          </div>
        </section>

        <section className="content" aria-label={copy.explorer}>
          <ViewNav view={view} onChange={setView} />

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
          {view === 'map' && (
            <AthleteMap athletes={athletes} onOpen={openAthlete} />
          )}
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
