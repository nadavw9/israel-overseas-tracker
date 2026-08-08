import { ArrowUpRight, Trophy } from 'lucide-react'
import type { Athlete } from '../domain/athlete'
import { primaryMetric, rankAthletesBySport } from '../services/rankings'
import { useI18n } from '../i18n/context'
import { participationDisplay } from '../services/participation'

function metricLabel(athlete: Athlete) {
  if (athlete.performance.stats?.kind === 'basketball') return 'PPG'
  if (athlete.performance.stats?.kind === 'football') return 'Goals'
  return 'Points'
}

export function Leaderboard({ athletes }: { athletes: Athlete[] }) {
  const { locale, messages } = useI18n()
  const groups = rankAthletesBySport(athletes)

  return (
    <section className="leaderboard" aria-labelledby="leaders-title">
      <div className="view-intro">
        <div>
          <p className="section-heading__eyebrow">{messages.leadersKicker}</p>
          <h2 id="leaders-title">{messages.leadersTitle}</h2>
        </div>
        <p>{messages.leadersPeriod}</p>
      </div>
      <div className="leaderboard__note">
        <Trophy size={18} aria-hidden="true" /> {messages.leadersNote}
      </div>
      {groups.map(({ sport, athletes: leaders }) => (
        <div className="leaderboard-group" key={sport}>
          <h3>{messages.sports[sport]}</h3>
          <ol className="leaderboard__list">
          {leaders.map((athlete, index) => (
          <li key={athlete.id}>
            <span className="leaderboard__rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="leaderboard__name">
              <strong>{athlete.name[locale]}</strong>
              <small>{participationDisplay(athlete.participation).title} · {participationDisplay(athlete.participation).competition}</small>
            </span>
            <span className="leaderboard__metric">
              <strong>{primaryMetric(athlete)}</strong>
              <small>{metricLabel(athlete)}</small>
            </span>
            {athlete.performance.status === 'available' && <a href={athlete.performance.source.sourceUrl} target="_blank" rel="noreferrer" aria-label={messages.rankingSource(athlete.name[locale])}>
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>}
          </li>
          ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
