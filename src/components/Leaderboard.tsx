import { ArrowUpRight, Trophy } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { primaryMetric, rankAthletes } from '../services/rankings'

function metricLabel(athlete: Athlete) {
  if (athlete.stats?.kind === 'basketball') return 'PPG'
  if (athlete.stats?.kind === 'football') return 'Goals'
  return 'Points'
}

export function Leaderboard({ athletes }: { athletes: Athlete[] }) {
  const leaders = rankAthletes(athletes)

  return (
    <section className="leaderboard" aria-labelledby="leaders-title">
      <div className="view-intro">
        <div>
          <p className="section-heading__eyebrow">Stats-backed only</p>
          <h2 id="leaders-title">Verified leaders</h2>
        </div>
        <p>Primary production metric · 2025–26</p>
      </div>
      <div className="leaderboard__note">
        <Trophy size={18} aria-hidden="true" /> Rankings only include sourced season totals.
        Identity-only records stay out until their statistics are verified.
      </div>
      <ol className="leaderboard__list">
        {leaders.map((athlete, index) => (
          <li key={athlete.id}>
            <span className="leaderboard__rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="leaderboard__name">
              <strong>{athlete.name.en}</strong>
              <small>{athlete.team} · {athlete.competition}</small>
            </span>
            <span className="leaderboard__metric">
              <strong>{primaryMetric(athlete)}</strong>
              <small>{metricLabel(athlete)}</small>
            </span>
            <a href={athlete.source.sourceUrl} target="_blank" rel="noreferrer" aria-label={`View ${athlete.name.en} ranking source`}>
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
