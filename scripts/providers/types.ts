import type { AthleteStats } from '../../src/domain/athlete'

export type ProviderResult = {
  athleteId: string
  stats: AthleteStats | null
  state: 'final' | 'provisional' | 'corrected'
  observedOrganization?: string
  sourceUrl: string
  retrievedAt: string
}
