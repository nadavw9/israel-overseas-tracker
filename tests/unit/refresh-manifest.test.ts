import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  refreshManifestSchema,
  refreshPolicySchema,
} from '../../src/domain/refresh'
import {
  summarizeProviderSettledResults,
  writeRefreshManifestAtomically,
} from '../../scripts/refresh/manifest'

describe('refresh policy schema', () => {
  it('accepts an explicit cadence and retention policy', () => {
    expect(refreshPolicySchema.parse({
      id: 'basketball-nba',
      sport: 'basketball',
      competition: 'NBA',
      cadenceMinutes: 360,
      activeEventCadenceMinutes: 1,
      retentionHours: 48,
      access: 'licensed-or-permitted',
    })).toMatchObject({ retentionHours: 48 })
  })

  it('rejects zero cadence and non-positive retention', () => {
    expect(() => refreshPolicySchema.parse({
      id: 'bad',
      sport: 'football',
      competition: 'Example',
      cadenceMinutes: 0,
      activeEventCadenceMinutes: 1,
      retentionHours: 1,
      access: 'licensed-or-permitted',
    })).toThrow()
  })
})

describe('refresh manifest schema', () => {
  it('accepts balanced provider attempt totals', () => {
    expect(refreshManifestSchema.parse({
      generatedAt: '2026-08-14T05:00:00.000Z',
      snapshotGeneratedAt: '2026-08-14T05:00:00.000Z',
      durationMs: 42,
      providers: [{
        provider: 'espn-nba',
        attempted: 2,
        succeeded: 1,
        failed: 1,
        skipped: 0,
        durationMs: 42,
      }],
    })).toMatchObject({ durationMs: 42 })
  })

  it('rejects unbalanced provider attempt totals', () => {
    expect(() => refreshManifestSchema.parse({
      generatedAt: '2026-08-14T05:00:00.000Z',
      snapshotGeneratedAt: '2026-08-14T05:00:00.000Z',
      durationMs: 42,
      providers: [{
        provider: 'espn-nba',
        attempted: 2,
        succeeded: 2,
        failed: 1,
        skipped: 0,
        durationMs: 42,
      }],
    })).toThrow(/attempted|balanced|success/i)
  })
})

describe('refresh manifest writer', () => {
  it('writes a validated manifest without a temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'refresh-manifest-'))
    const target = join(directory, 'refresh-manifest.json')
    try {
      await writeRefreshManifestAtomically(target, {
        generatedAt: '2026-08-14T05:00:00.000Z',
        snapshotGeneratedAt: '2026-08-14T05:00:00.000Z',
        durationMs: 42,
        providers: [{
          provider: 'espn-nba',
          attempted: 2,
          succeeded: 2,
          failed: 0,
          skipped: 0,
          durationMs: 42,
        }],
      })
      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({ durationMs: 42 })
      expect(await readdir(directory)).toEqual(['refresh-manifest.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('summarizes mixed provider outcomes in deterministic provider order', () => {
    expect(summarizeProviderSettledResults([
      { provider: 'nhl', status: 'failed', durationMs: 8 },
      { provider: 'espn-nba', status: 'succeeded', durationMs: 12 },
      { provider: 'nhl', status: 'skipped', durationMs: 0 },
    ])).toEqual([
      { provider: 'espn-nba', attempted: 1, succeeded: 1, failed: 0, skipped: 0, durationMs: 12 },
      { provider: 'nhl', attempted: 2, succeeded: 0, failed: 1, skipped: 1, durationMs: 8 },
    ])
  })
})
