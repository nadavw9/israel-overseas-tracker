import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  refreshManifestSchema,
  type RefreshManifest,
  type RefreshProviderAttempt,
} from '../../src/domain/refresh'
import type { ProviderId } from '../../src/domain/taxonomy'

export type ProviderAttemptOutcome = {
  provider: ProviderId
  status: 'succeeded' | 'failed' | 'skipped'
  durationMs: number
}

export function summarizeProviderSettledResults(
  outcomes: ProviderAttemptOutcome[],
): RefreshProviderAttempt[] {
  const grouped = new Map<ProviderId, RefreshProviderAttempt>()

  for (const outcome of outcomes) {
    const current = grouped.get(outcome.provider) ?? {
      provider: outcome.provider,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    }
    current.attempted += 1
    current[outcome.status] += 1
    current.durationMs = Math.max(current.durationMs, outcome.durationMs)
    grouped.set(outcome.provider, current)
  }

  return [...grouped.values()].sort((left, right) => left.provider.localeCompare(right.provider))
}

function snapshotPathname(path: string | URL): string {
  return path instanceof URL ? fileURLToPath(path) : path
}

async function renameReplacing(temp: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temp, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)))
    }
  }
}

export async function writeRefreshManifestAtomically(
  manifestPath: string | URL,
  manifest: unknown,
): Promise<void> {
  const target = snapshotPathname(manifestPath)
  const validated = refreshManifestSchema.parse(manifest)
  const extension = extname(target)
  const temp = join(
    dirname(target),
    `${basename(target, extension)}.${process.pid}.${randomUUID()}.tmp${extension || '.json'}`,
  )
  let handle: Awaited<ReturnType<typeof open>> | undefined

  try {
    await mkdir(dirname(target), { recursive: true })
    const serialized = `${JSON.stringify(validated, null, 2)}\n`
    handle = await open(temp, 'wx')
    await handle.writeFile(serialized, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    refreshManifestSchema.parse(JSON.parse(await readFile(temp, 'utf8')))
    await renameReplacing(temp, target)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

export type { RefreshManifest }
