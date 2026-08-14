import type { Athlete } from '../domain/athlete'
import type { Sport } from '../domain/taxonomy'
import { useI18n } from '../i18n/context'

type RegistryBoardProps = {
  athletes: readonly Athlete[]
  sports: readonly Sport[]
}

export function RegistryBoard({ athletes, sports }: RegistryBoardProps) {
  const { messages } = useI18n()
  const sportCounts = sports.map((sport) => ({
    sport,
    count: athletes.filter((athlete) => athlete.sport === sport).length,
  }))
  const women = athletes.filter((athlete) => athlete.genderCategory === 'women').length
  const circuit = athletes.filter((athlete) => athlete.participation.kind === 'circuit-activity').length
  const sourcedStats = athletes.filter((athlete) => athlete.performance.status === 'available').length
  const mapped = athletes.filter(
    (athlete) =>
      athlete.participation.kind === 'team-affiliation' &&
      athlete.participation.affiliation.location !== undefined,
  ).length

  return (
    <section className="registry-board" aria-label={messages.registryBoard}>
      <div className="registry-board__intro">
        <span>{messages.registryBoardKicker}</span>
        <strong>{messages.registryBoardTitle}</strong>
        <p>{messages.registryBoardNote}</p>
      </div>
      <dl className="registry-board__sports">
        {sportCounts.map(({ sport, count }) => (
          <div key={sport}>
            <dt>{messages.sports[sport]}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      <dl className="registry-board__signals">
        <div>
          <dt>{messages.registrySignals.women}</dt>
          <dd>{women}</dd>
        </div>
        <div>
          <dt>{messages.registrySignals.circuit}</dt>
          <dd>{circuit}</dd>
        </div>
        <div>
          <dt>{messages.registrySignals.sourcedStats}</dt>
          <dd>{sourcedStats}</dd>
        </div>
        <div>
          <dt>{messages.registrySignals.mapped}</dt>
          <dd>{mapped}</dd>
        </div>
      </dl>
    </section>
  )
}
