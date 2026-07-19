import type { AthleteStats } from '../../src/domain/athlete'

export type ProviderName = 'espn-nba' | 'nhl' | 'curated'

export type RegistryEntry = {
  id: string
  provider: ProviderName
  providerId: string
}

export type ProviderResult = {
  athleteId: string
  stats: AthleteStats | null
  team?: string
  sourceUrl: string
  retrievedAt: string
}

export interface ProviderAdapter {
  fetch(entry: RegistryEntry): Promise<ProviderResult>
}
