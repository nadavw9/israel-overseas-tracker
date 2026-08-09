export const NBA_SEASON_START_YEAR = 1946
const NBA_SEASON_END_YEAR = 9998

export function isCanonicalNbaSeason(season: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(season)
  if (!match) return false

  const startYear = Number(match[1])
  if (startYear < NBA_SEASON_START_YEAR || startYear > NBA_SEASON_END_YEAR) return false

  return match[2] === String(startYear + 1).slice(-2)
}
