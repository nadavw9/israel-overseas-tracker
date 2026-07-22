import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  coverageEntrySchema,
  coverageHealthSchema,
  coverageLedgerSchema,
  coverageSourceTypeSchema,
  summarizeCoverageLedger,
} from '../../src/domain/coverage'

const timestamp = '2026-07-23T08:00:00.000Z'

const healthyEntry = {
  id: 'atp-isr-men',
  sport: 'tennis',
  genderCategory: 'men',
  tier: 'international-circuit',
  universe: 'ATP singles players filtered to ISR',
  sourceUrl: 'https://www.atptour.com/en/rankings/singles?RankRange=0-5000&Region=ISR',
  sourceType: 'primary-verification',
  cadence: 'weekly',
  lastAttemptAt: timestamp,
  lastSuccessAt: timestamp,
  health: 'healthy',
  counts: { observed: 8, matched: 0, newCandidates: 8, conflicts: 0 },
  limitations: ['Candidates still require reconciliation to registry eligibility and bindings.'],
} as const

const healthyLedger = { generatedAt: timestamp, entries: [healthyEntry] }

describe('coverage ledger schema', () => {
  it('accepts a healthy ATP Israel coverage entry and summarizes it exactly', () => {
    const ledger = coverageLedgerSchema.parse(healthyLedger)

    expect(summarizeCoverageLedger(ledger)).toEqual({ required: 1, healthy: 1, complete: true })
  })

  it('does not report a partial ledger as complete', () => {
    const ledger = coverageLedgerSchema.parse({
      ...healthyLedger,
      entries: [{ ...healthyEntry, health: 'partial' }],
    })

    expect(summarizeCoverageLedger(ledger).complete).toBe(false)
  })

  it('does not report an empty ledger as complete', () => {
    const ledger = coverageLedgerSchema.parse({ generatedAt: timestamp, entries: [] })

    expect(summarizeCoverageLedger(ledger)).toEqual({ required: 0, healthy: 0, complete: false })
  })

  it.each(['healthy', 'partial', 'stale', 'blocked', 'not-configured'] as const)(
    'accepts the %s health state',
    (health) => {
      expect(coverageHealthSchema.parse(health)).toBe(health)
    },
  )

  it.each(['primary-verification', 'licensed-statistics', 'discovery-only', 'media'] as const)(
    'accepts the %s source type',
    (sourceType) => {
      expect(coverageSourceTypeSchema.parse(sourceType)).toBe(sourceType)
    },
  )

  it.each([-1, 1.5])('rejects invalid observed count %s', (observed) => {
    expect(
      coverageEntrySchema.safeParse({ ...healthyEntry, counts: { ...healthyEntry.counts, observed } }).success,
    ).toBe(false)
  })

  it('requires all count fields when counts are present', () => {
    const { conflicts: _, ...incompleteCounts } = healthyEntry.counts
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, counts: incompleteCounts }).success).toBe(false)
  })

  it('rejects insecure URLs and invalid timestamps', () => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, sourceUrl: 'http://example.com' }).success).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, lastAttemptAt: 'not-a-timestamp' }).success).toBe(false)
  })

  it('requires non-healthy entries to document a limitation', () => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, health: 'blocked', limitations: [] }).success).toBe(false)
  })

  it('rejects duplicate entry IDs', () => {
    expect(coverageLedgerSchema.safeParse({ ...healthyLedger, entries: [healthyEntry, healthyEntry] }).success).toBe(false)
  })

  it('rejects success after an attempt or after ledger generation', () => {
    expect(
      coverageLedgerSchema.safeParse({
        ...healthyLedger,
        entries: [{ ...healthyEntry, lastSuccessAt: '2026-07-23T08:00:01.000Z' }],
      }).success,
    ).toBe(false)
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: '2026-07-23T07:59:59.000Z',
        entries: [healthyEntry],
      }).success,
    ).toBe(false)
  })

  it('parses the seeded partial ledger without claiming comprehensive coverage', () => {
    const ledger = coverageLedgerSchema.parse(
      JSON.parse(readFileSync('data/coverage/ledger.json', 'utf8')),
    )

    expect(summarizeCoverageLedger(ledger)).toEqual({ required: 4, healthy: 0, complete: false })
    expect(ledger.entries.every((entry) => entry.health === 'partial')).toBe(true)
    expect(ledger.entries.every((entry) => entry.limitations.some((limitation) => /reconcil/i.test(limitation)))).toBe(true)
  })
})
