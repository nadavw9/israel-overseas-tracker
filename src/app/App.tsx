import { useMemo, useRef, useState } from 'react'
import type { Athlete, AthleteSnapshot } from '../domain/athlete'
import { AppHeader } from '../components/AppHeader'
import { AthleteCard } from '../components/AthleteCard'
import { AthleteDrawer } from '../components/AthleteDrawer'
import { AthleteMap } from '../components/AthleteMap'
import { FilterBar, type SportFilter } from '../components/FilterBar'
import { Leaderboard } from '../components/Leaderboard'
import { ViewNav, type TrackerView } from '../components/ViewNav'
import './styles.css'

type TrackerAppProps = {
  snapshot: AthleteSnapshot
}

function matchesQuery(athlete: Athlete, query: string): boolean {
  const haystack = [
    athlete.name.en,
    athlete.name.he,
    athlete.team,
    athlete.competition,
    athlete.location?.city,
    athlete.location?.country,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(query.trim().toLocaleLowerCase())
}

export function TrackerApp({ snapshot }: TrackerAppProps) {
  const [query, setQuery] = useState('')
  const [sport, setSport] = useState<SportFilter>('all')
  const [view, setView] = useState<TrackerView>('athletes')
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)

  const athletes = useMemo(
    () =>
      snapshot.athletes.filter(
        (athlete) =>
          (sport === 'all' || athlete.sport === sport) &&
          matchesQuery(athlete, query),
      ),
    [query, snapshot.athletes, sport],
  )

  const updated = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(snapshot.generatedAt))

  return (
    <div className="tracker-shell">
      <AppHeader />
      <main>
        <section className="hero" aria-labelledby="tracker-title">
          <div className="hero__glow" aria-hidden="true" />
          <div className="hero__content">
            <p className="hero__kicker">Season 2025–26 · verified registry</p>
            <h1 id="tracker-title">
              Israel <span>Overseas</span>
            </h1>
            <p className="hero__lede">
              A focused, source-backed view of Israeli athletes competing abroad.
            </p>
            <div className="hero__proof" aria-label="Snapshot status">
              <strong>{snapshot.athletes.length} verified athletes</strong>
              <span>Updated {updated}</span>
              <span>No invented records</span>
            </div>
          </div>
        </section>

        <section className="content" aria-label="Tracker explorer">
          <ViewNav view={view} onChange={setView} />

          {view === 'athletes' && (
            <div className="section-heading">
              <div>
                <p className="section-heading__eyebrow">Verified directory</p>
                <h2 id="athletes-title">Athletes abroad</h2>
              </div>
              <p>{athletes.length} showing</p>
            </div>
          )}

          <FilterBar
            query={query}
            onQueryChange={setQuery}
            sport={sport}
            onSportChange={setSport}
          />

          {view === 'athletes' && athletes.length > 0 ? (
            <div className="athlete-grid">
              {athletes.map((athlete, index) => (
                <AthleteCard
                  key={athlete.id}
                  athlete={athlete}
                  rank={index + 1}
                  onOpen={() => {
                    returnFocus.current = document.activeElement as HTMLButtonElement
                    setSelectedAthlete(athlete)
                  }}
                />
              ))}
            </div>
          ) : view === 'athletes' ? (
            <div className="empty-state" role="status">
              <h3>No verified matches</h3>
              <p>Try another athlete, team, competition, or sport.</p>
            </div>
          ) : null}

          {view === 'rankings' && <Leaderboard athletes={athletes} />}
          {view === 'map' && <AthleteMap athletes={athletes} />}
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
  )
}
