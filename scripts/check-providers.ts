import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { loadLocalEnv } from './load-env'

type ProviderCheck = {
  provider: string
  status: 'ready' | 'not-configured' | 'failed' | 'configured-not-probed'
  detail: string
  httpStatus?: number
  plan?: string
  dailyLimit?: number
  requestsUsed?: number
  capabilities?: Record<string, 'available' | 'unsupported' | 'unknown'>
}

const timeoutMs = 8_000

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'israel-overseas-tracker-provider-check/1.0',
        ...(init.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkApiFootball(): Promise<ProviderCheck> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return { provider: 'api-football', status: 'not-configured', detail: 'API_FOOTBALL_KEY is not set' }

  try {
    const response = await fetchWithTimeout('https://v3.football.api-sports.io/status', {
      headers: { 'x-apisports-key': key },
    })
    const payload = await response.json() as {
      errors?: Record<string, unknown> | unknown[]
      response?: {
        account?: { firstname?: string; email?: string }
        subscription?: { plan?: string; active?: boolean }
        requests?: { current?: number; limit_day?: number }
      }
    }
    const errors = Array.isArray(payload.errors) ? payload.errors : Object.values(payload.errors ?? {})
    if (!response.ok || errors.length > 0) {
      return {
        provider: 'api-football',
        status: 'failed',
        detail: errors.map(String).join('; ') || `HTTP ${response.status}`,
        httpStatus: response.status,
      }
    }
    const subscription = payload.response?.subscription
    const requests = payload.response?.requests
    let currentSeasonPlayerStats: 'available' | 'unsupported' | 'unknown' = 'unknown'
    if (subscription?.active !== false) {
      try {
        const probe = await fetchWithTimeout(
          'https://v3.football.api-sports.io/players?search=Manor%20Solomon&league=39&season=2026',
          { headers: { 'x-apisports-key': key } },
        )
        const probePayload = await probe.json() as { errors?: Record<string, unknown> | unknown[]; response?: unknown[] }
        const probeErrors = Array.isArray(probePayload.errors)
          ? probePayload.errors.map(String)
          : Object.values(probePayload.errors ?? {}).map(String)
        currentSeasonPlayerStats = probeErrors.some((error) => /free plans do not have access to this season/i.test(error))
          ? 'unsupported'
          : probe.ok && (probePayload.response?.length ?? 0) > 0
            ? 'available'
            : 'unknown'
      } catch {
        currentSeasonPlayerStats = 'unknown'
      }
    }
    return {
      provider: 'api-football',
      status: subscription?.active === false ? 'failed' : 'ready',
      detail: subscription?.active === false
        ? 'Subscription is inactive'
        : currentSeasonPlayerStats === 'unsupported'
          ? 'Account accepted; Free plan rejects current-season player searches'
          : 'Account and API key accepted',
      httpStatus: response.status,
      plan: subscription?.plan,
      dailyLimit: requests?.limit_day,
      requestsUsed: requests?.current,
      capabilities: { currentSeasonPlayerStats },
    }
  } catch (error) {
    return { provider: 'api-football', status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

async function checkApiNba(): Promise<ProviderCheck> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return { provider: 'api-nba-capability', status: 'not-configured', detail: 'API_FOOTBALL_KEY is not set' }
  try {
    const response = await fetchWithTimeout('https://v2.nba.api-sports.io/status', {
      headers: { 'x-apisports-key': key },
    })
    const payload = await response.json() as {
      errors?: Record<string, unknown> | unknown[]
      response?: { subscription?: { plan?: string; active?: boolean }; requests?: { current?: number; limit_day?: number } }
    }
    const errors = Array.isArray(payload.errors) ? payload.errors : Object.values(payload.errors ?? {})
    if (!response.ok || errors.length > 0) {
      return { provider: 'api-nba-capability', status: 'failed', detail: errors.map(String).join('; ') || `HTTP ${response.status}`, httpStatus: response.status }
    }
    const active = payload.response?.subscription?.active !== false
    return {
      provider: 'api-nba-capability',
      status: active ? 'ready' : 'failed',
      detail: active ? 'Same API-Sports key accepted; no NBA adapter is published' : 'Subscription is inactive',
      httpStatus: response.status,
      plan: payload.response?.subscription?.plan,
      dailyLimit: payload.response?.requests?.limit_day,
      requestsUsed: payload.response?.requests?.current,
      capabilities: { currentSeasonPlayerStats: 'unsupported' },
    }
  } catch (error) {
    return { provider: 'api-nba-capability', status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

async function checkPublicEndpoint(provider: string, url: string): Promise<ProviderCheck> {
  try {
    const response = await fetchWithTimeout(url)
    return {
      provider,
      status: response.ok ? 'ready' : 'failed',
      detail: response.ok ? 'Public endpoint responded' : `HTTP ${response.status}`,
      httpStatus: response.status,
    }
  } catch (error) {
    return { provider, status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

async function checkEspnSoccer(): Promise<ProviderCheck> {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/21300/roster'
  try {
    const response = await fetchWithTimeout(url)
    const payload = await response.json() as {
      season?: { year?: number }
      team?: { id?: string | number }
      athletes?: Array<{ id?: string | number; statistics?: unknown }>
    }
    const hasBoundAthlete = payload.athletes?.some((athlete) => String(athlete.id) === '312976' && athlete.statistics !== undefined) ?? false
    return {
      provider: 'espn-soccer',
      status: response.ok && payload.season?.year !== undefined && String(payload.team?.id) === '21300' && hasBoundAthlete ? 'ready' : 'failed',
      detail: response.ok && hasBoundAthlete
        ? 'Current roster and player totals responded for a verified MLS binding'
        : response.ok ? 'Roster responded but the verified player/stat probe did not match' : `HTTP ${response.status}`,
      httpStatus: response.status,
      capabilities: { currentSeasonPlayerStats: response.ok && hasBoundAthlete ? 'available' : 'unknown' },
    }
  } catch (error) {
    return { provider: 'espn-soccer', status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

async function checkEspnNcaaBasketball(): Promise<ProviderCheck> {
  const rosterUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/2509/roster'
  const statsUrl = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2/athletes/5312035/statistics?lang=en&region=us'
  try {
    const [rosterResponse, statsResponse] = await Promise.all([
      fetchWithTimeout(rosterUrl),
      fetchWithTimeout(statsUrl),
    ])
    const roster = await rosterResponse.json() as {
      team?: { id?: string | number }
      athletes?: Array<{ id?: string | number }>
    }
    const stats = await statsResponse.json() as { splits?: { categories?: unknown[] } }
    const hasBoundAthlete = roster.athletes?.some((athlete) => String(athlete.id) === '5312035') ?? false
    const ready = rosterResponse.ok && statsResponse.ok && String(roster.team?.id) === '2509' && hasBoundAthlete && (stats.splits?.categories?.length ?? 0) > 0
    return {
      provider: 'espn-ncaa-basketball',
      status: ready ? 'ready' : 'failed',
      detail: ready
        ? 'Current Purdue roster identity and completed 2025-26 player totals responded'
        : `Roster/stat probe did not match (roster HTTP ${rosterResponse.status}, stats HTTP ${statsResponse.status})`,
      httpStatus: ready ? 200 : rosterResponse.status !== 200 ? rosterResponse.status : statsResponse.status,
      capabilities: { completedSeasonPlayerStats: ready ? 'available' : 'unknown' },
    }
  } catch (error) {
    return { provider: 'espn-ncaa-basketball', status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

async function checkTheSportsDb(): Promise<ProviderCheck> {
  const key = process.env.THESPORTSDB_API_KEY ?? '123'
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/searchplayers.php?p=Deni%20Avdija`
    const response = await fetchWithTimeout(url)
    const payload = await response.json() as { player?: unknown[] }
    return {
      provider: 'thesportsdb',
      status: response.ok && Array.isArray(payload.player) && payload.player.length > 0 ? 'ready' : 'failed',
      detail: response.ok ? 'Free metadata/image lookup responded' : `HTTP ${response.status}`,
      httpStatus: response.status,
    }
  } catch (error) {
    return { provider: 'thesportsdb', status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function checkProviders(): Promise<ProviderCheck[]> {
  const results = await Promise.all([
    Promise.resolve({ provider: 'curated', status: 'ready' as const, detail: 'Local verified fixture data is available' }),
    checkApiFootball(),
    checkApiNba(),
    checkTheSportsDb(),
    checkEspnSoccer(),
    checkEspnNcaaBasketball(),
    checkPublicEndpoint(
      'espn-nba',
      'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/4683021/statistics?lang=en&region=us',
    ),
    Promise.resolve({
      provider: 'nhl',
      status: 'not-configured' as const,
      detail: 'No NHL player binding is currently published',
    }),
    Promise.resolve({
      provider: 'sportradar-soccer',
      status: process.env.SPORTRADAR_SOCCER_API_KEY ? 'configured-not-probed' as const : 'not-configured' as const,
      detail: process.env.SPORTRADAR_SOCCER_API_KEY
        ? 'Key is present; no quota-consuming trial call made'
        : 'SPORTRADAR_SOCCER_API_KEY is not set',
    }),
  ])
  return results
}

async function run() {
  loadLocalEnv()
  const checks = await checkProviders()
  const report = { checkedAt: new Date().toISOString(), providers: checks }
  if (process.argv.includes('--write')) {
    await mkdir('data/review', { recursive: true })
    await writeFile('data/review/provider-health.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(JSON.stringify(report, null, 2))
  if (checks.some((check) => check.status === 'failed')) process.exitCode = 1
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
