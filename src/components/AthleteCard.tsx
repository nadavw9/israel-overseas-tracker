import { ArrowUpRight } from 'lucide-react'
import type { Athlete, AthleteStats } from '../domain/athlete'
import { AthletePhoto } from './AthletePhoto'
import { FreshnessBadge } from './FreshnessBadge'

type AthleteCardProps = {
  athlete: Athlete
  rank: number
  onOpen: () => void
}

function statItems(stats: AthleteStats | null) {
  if (!stats) return []
  if (stats.kind === 'basketball') {
    return [
      ['PPG', stats.pointsPerGame],
      ['RPG', stats.reboundsPerGame],
      ['APG', stats.assistsPerGame],
      ['GP', stats.games],
    ]
  }
  if (stats.kind === 'football') {
    return [
      ['APP', stats.appearances],
      ['GOALS', stats.goals],
      ['ASSISTS', stats.assists],
    ]
  }
  return [
    ['GP', stats.games],
    ['GOALS', stats.goals],
    ['ASSISTS', stats.assists],
    ['PTS', stats.points],
  ]
}

export function AthleteCard({ athlete, rank, onOpen }: AthleteCardProps) {
  const stats = statItems(athlete.stats)

  return (
    <article className={`athlete-card athlete-card--${athlete.sport}`}>
      <button
        type="button"
        className="athlete-card__open"
        aria-label={`Open ${athlete.name.en}`}
        onClick={onOpen}
      >
        <span className="athlete-card__rank" aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
        <div className="athlete-card__visual">
          <AthletePhoto athlete={athlete} />
          <span className="athlete-card__sport">{athlete.sport}</span>
        </div>
        <div className="athlete-card__body">
          <div className="athlete-card__identity">
            <div>
              <h3>{athlete.name.en}</h3>
              <p lang="he" dir="rtl">{athlete.name.he}</p>
            </div>
            <ArrowUpRight size={20} aria-hidden="true" />
          </div>
          <p className="athlete-card__club">
            <strong>{athlete.team}</strong>
            <span>{athlete.competition} · {athlete.season}</span>
          </p>
          {stats.length > 0 ? (
            <dl className="stat-grid">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dd>{value}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
          ) : (
            <div className="stats-unavailable">Stats source pending</div>
          )}
          <FreshnessBadge freshness={athlete.freshness} source={athlete.source} />
        </div>
      </button>
      <a
        className="athlete-card__source"
        href={athlete.source.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        View data source <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </article>
  )
}
