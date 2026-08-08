import type { Athlete, PublicParticipation } from '../domain/athlete'

export type TeamParticipation = Extract<PublicParticipation, { kind: 'team-affiliation' }>
export type CircuitParticipation = Extract<PublicParticipation, { kind: 'circuit-activity' }>
export type CircuitTitleFormatter = (circuit: CircuitParticipation['activity']['circuit']) => string

const englishCircuitTitle: CircuitTitleFormatter = (circuit) =>
  circuit === 'WTA'
    ? 'WTA / ITF international circuit'
    : circuit === 'ITF'
      ? 'ITF international circuit'
    : 'ATP / ITF international circuit'

export function isTeamParticipation(participation: PublicParticipation): participation is TeamParticipation {
  return participation.kind === 'team-affiliation'
}

export function isCircuitParticipation(participation: PublicParticipation): participation is CircuitParticipation {
  return participation.kind === 'circuit-activity'
}

export function participationDisplay(
  participation: PublicParticipation,
  circuitTitle: CircuitTitleFormatter = englishCircuitTitle,
) {
  if (isTeamParticipation(participation)) {
    const { affiliation } = participation
    return {
      kind: participation.kind,
      title: affiliation.organization.name,
      competition: affiliation.competition,
      season: affiliation.season,
      source: affiliation.source,
      location: affiliation.location,
    }
  }

  const { activity } = participation
  return {
    kind: participation.kind,
    title: circuitTitle(activity.circuit),
    competition: activity.competition,
    season: activity.season,
    source: activity.source,
  }
}

export function hasTeamLocation(
  athlete: Athlete,
): athlete is Athlete & { participation: TeamParticipation & { affiliation: TeamParticipation['affiliation'] & { location: NonNullable<TeamParticipation['affiliation']['location']> } } } {
  return isTeamParticipation(athlete.participation) && athlete.participation.affiliation.location !== undefined
}
