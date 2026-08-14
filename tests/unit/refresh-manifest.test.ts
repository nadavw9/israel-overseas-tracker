import { describe, expect, it } from 'vitest'
import {
  refreshManifestSchema,
  refreshPolicySchema,
} from '../../src/domain/refresh'

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
