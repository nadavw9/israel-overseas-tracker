import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

type SourceHealth = 'ok' | 'stale' | 'blocked' | 'error'

export type SourceCheck = {
  url: string
  health: SourceHealth
  httpStatus: number | null
  finalUrl: string | null
  contentType: string | null
  checkedAt: string
  detail?: string
}

const registryFiles = [
  'data/registry/athletes.json',
  'data/registry/evidence.json',
  'data/registry/affiliations.json',
  'data/registry/circuit-activities.json',
  'data/registry/provider-bindings.json',
  'data/registry/media.json',
]
const timeoutMs = 8_000

function collectUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'sourceUrl' || key === 'url') {
        if (typeof item === 'string' && item.startsWith('https://')) urls.add(item)
      } else {
        collectUrls(item, urls)
      }
    }
  }
  return urls
}

async function request(url: string, method: 'HEAD' | 'GET') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/pdf,image/*,application/json;q=0.9,*/*;q=0.5',
        'user-agent': 'israel-overseas-tracker-source-audit/1.0',
        ...(method === 'GET' ? { range: 'bytes=0-2048' } : {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function checkSource(url: string, now = new Date()): Promise<SourceCheck> {
  const checkedAt = now.toISOString()
  try {
    let response = await request(url, 'HEAD')
    if ([403, 405, 429].includes(response.status)) response = await request(url, 'GET')
    const health: SourceHealth = response.status === 404 || response.status === 410
      ? 'stale'
      : response.ok
        ? 'ok'
        : [401, 403, 405, 408, 429].includes(response.status)
          ? 'blocked'
          : 'error'
    return {
      url,
      health,
      httpStatus: response.status,
      finalUrl: response.url || null,
      contentType: response.headers.get('content-type'),
      checkedAt,
      ...(health !== 'ok' ? { detail: `HTTP ${response.status}` } : {}),
    }
  } catch (error) {
    return {
      url,
      health: 'blocked',
      httpStatus: null,
      finalUrl: null,
      contentType: null,
      checkedAt,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, mapper: (item: T) => Promise<U>) {
  const results: U[] = []
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

export async function auditSources() {
  const records = await Promise.all(registryFiles.map(async (file) => JSON.parse(await readFile(file, 'utf8'))))
  const urls = [...collectUrls(records)].sort()
  const checks = await mapWithConcurrency(urls, 4, (url) => checkSource(url))
  return {
    checkedAt: new Date().toISOString(),
    total: checks.length,
    summary: {
      ok: checks.filter((check) => check.health === 'ok').length,
      stale: checks.filter((check) => check.health === 'stale').length,
      blocked: checks.filter((check) => check.health === 'blocked').length,
      error: checks.filter((check) => check.health === 'error').length,
    },
    checks,
  }
}

async function run() {
  const report = await auditSources()
  if (process.argv.includes('--write')) {
    await mkdir('data/review', { recursive: true })
    await writeFile('data/review/source-health.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(JSON.stringify(report, null, 2))
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
