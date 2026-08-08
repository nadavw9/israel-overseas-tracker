import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  coverageEntrySchema,
  coverageHealthSchema,
  coverageLedgerSchema,
  coverageSourceTypeSchema,
  coverageCadenceSchema,
  summarizeCoverage,
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
  freshnessWindowDays: 7,
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

    expect(summarizeCoverage(ledger)).toEqual({ required: 1, healthy: 1, complete: true })
  })

  it('does not report a partial ledger as complete', () => {
    const ledger = coverageLedgerSchema.parse({
      ...healthyLedger,
      entries: [{ ...healthyEntry, health: 'partial' }],
    })

    expect(summarizeCoverage(ledger).complete).toBe(false)
  })

  it('does not report an empty ledger as complete', () => {
    const ledger = coverageLedgerSchema.parse({ generatedAt: timestamp, entries: [] })

    expect(summarizeCoverage(ledger)).toEqual({ required: 0, healthy: 0, complete: false })
  })

  it('ages an otherwise healthy entry at an explicit snapshot clock', () => {
    const ledger = coverageLedgerSchema.parse(healthyLedger)

    expect(summarizeCoverage(ledger, new Date('2026-07-30T08:00:00.001Z'))).toEqual({
      required: 1,
      healthy: 0,
      complete: false,
    })
    expect(summarizeCoverage(ledger, new Date('2026-07-30T08:00:00.000Z')).healthy).toBe(1)
  })

  it('rejects summarizing a ledger from the future', () => {
    const ledger = coverageLedgerSchema.parse(healthyLedger)

    expect(() => summarizeCoverage(ledger, new Date('2026-07-23T07:59:59.999Z'))).toThrow(/future|after/i)
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

  it.each(['daily', 'weekly', 'monthly', 'manual'] as const)(
    'accepts the %s cadence',
    (cadence) => {
      expect(coverageCadenceSchema.parse(cadence)).toBe(cadence)
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

  it('requires count classifications to be exhaustive and bounded by observed', () => {
    expect(
      coverageEntrySchema.safeParse({
        ...healthyEntry,
        counts: { observed: 8, matched: 9, newCandidates: 0, conflicts: 0 },
      }).success,
    ).toBe(false)
    expect(
      coverageEntrySchema.safeParse({
        ...healthyEntry,
        counts: { observed: 8, matched: 1, newCandidates: 2, conflicts: 3 },
      }).success,
    ).toBe(false)
    expect(
      coverageEntrySchema.safeParse({
        ...healthyEntry,
        counts: { observed: 8, matched: 4, newCandidates: 4, conflicts: 1 },
      }).success,
    ).toBe(false)
  })

  it('rejects insecure URLs and invalid timestamps', () => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, sourceUrl: 'http://example.com' }).success).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, lastAttemptAt: 'not-a-timestamp' }).success).toBe(false)
  })

  it('requires non-healthy entries to document a limitation', () => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, health: 'blocked', limitations: [] }).success).toBe(false)
  })

  it('requires a healthy entry to have success and complete counts', () => {
    const { lastSuccessAt: _, ...withoutSuccess } = healthyEntry
    const { counts: __, ...withoutCounts } = healthyEntry

    expect(coverageEntrySchema.safeParse(withoutSuccess).success).toBe(false)
    expect(coverageEntrySchema.safeParse(withoutCounts).success).toBe(false)
  })

  it('allows partial and stale entries to omit success and counts when limitations explain the gap', () => {
    const { lastSuccessAt: _, counts: __, ...unscanned } = healthyEntry

    expect(coverageEntrySchema.safeParse({ ...unscanned, health: 'partial' }).success).toBe(true)
    expect(coverageEntrySchema.safeParse({ ...unscanned, health: 'stale' }).success).toBe(true)
  })

  it('rejects healthy entries whose success is older than their explicit freshness window', () => {
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: '2026-07-31T08:00:00.001Z',
        entries: [{ ...healthyEntry, lastAttemptAt: '2026-07-31T08:00:00.001Z' }],
      }).success,
    ).toBe(false)
  })

  it('allows a healthy entry exactly at its explicit freshness boundary', () => {
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: '2026-07-30T08:00:00.000Z',
        entries: [{ ...healthyEntry, lastAttemptAt: '2026-07-30T08:00:00.000Z' }],
      }).success,
    ).toBe(true)
  })

  it('rejects duplicate entry IDs', () => {
    expect(coverageLedgerSchema.safeParse({ ...healthyLedger, entries: [healthyEntry, healthyEntry] }).success).toBe(false)
  })

  it('rejects unknown keys in counts, entries, and ledgers', () => {
    expect(
      coverageEntrySchema.safeParse({
        ...healthyEntry,
        counts: { ...healthyEntry.counts, count: 8 },
      }).success,
    ).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, lastSuccesAt: timestamp }).success).toBe(false)
    expect(coverageLedgerSchema.safeParse({ ...healthyLedger, generated: timestamp }).success).toBe(false)
  })

  it('requires slug IDs and meaningful limitation text', () => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, id: 'ATP Israel' }).success).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, limitations: ['   '] }).success).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, limitations: ['tbd'] }).success).toBe(false)
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, limitations: ['API down'] }).success).toBe(true)
  })

  it.each([0, -1, 1.5, 367, Infinity])('rejects invalid freshness window %s', (freshnessWindowDays) => {
    expect(coverageEntrySchema.safeParse({ ...healthyEntry, freshnessWindowDays }).success).toBe(false)
  })

  it('rejects manual healthy coverage that exceeds its explicit freshness window', () => {
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: '2027-07-23T08:00:00.000Z',
        entries: [
          {
            ...healthyEntry,
            cadence: 'manual',
            lastAttemptAt: '2027-07-23T08:00:00.000Z',
            freshnessWindowDays: 7,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('allows manual healthy coverage exactly at its explicit freshness boundary', () => {
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: '2026-07-30T08:00:00.000Z',
        entries: [{ ...healthyEntry, cadence: 'manual' }],
      }).success,
    ).toBe(true)
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

  it('compares equivalent timestamp precisions by instant', () => {
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: timestamp,
        entries: [{ ...healthyEntry, lastAttemptAt: '2026-07-23T08:00:00Z', lastSuccessAt: '2026-07-23T08:00:00Z' }],
      }).success,
    ).toBe(true)
    expect(
      coverageLedgerSchema.safeParse({
        generatedAt: timestamp,
        entries: [{ ...healthyEntry, lastAttemptAt: '2026-07-23T08:00:00.500Z', lastSuccessAt: timestamp }],
      }).success,
    ).toBe(false)
  })

  it('parses the seeded partial ledger without claiming comprehensive coverage', () => {
    const ledger = coverageLedgerSchema.parse(
      JSON.parse(readFileSync('data/coverage/ledger.json', 'utf8')),
    )

    expect(summarizeCoverage(ledger)).toEqual({ required: 7, healthy: 1, complete: false })
    expect(ledger.entries).toHaveLength(7)
    expect(ledger.entries.map((entry) => entry.id).sort()).toEqual([
      'atp-isr-men',
      'fiba-isr-competition-rosters',
      'ifa-isr-senior-men-2026',
      'ifa-isr-senior-women-2026',
      'iihf-isr-senior-men-2026',
      'iihf-isr-senior-women-2026',
      'wta-isr-women',
    ])
    expect(ledger.entries.find(({ id }) => id === 'atp-isr-men')).toMatchObject({
      health: 'healthy',
      counts: { observed: 8, matched: 5, newCandidates: 3, conflicts: 0 },
    })
    expect(ledger.entries.filter(({ id }) => id !== 'atp-isr-men').every((entry) => entry.health === 'partial')).toBe(true)
    expect(ledger.entries.every((entry) =>
      entry.id === 'atp-isr-men' || entry.limitations.some((limitation) => /reconcil|not yet|not a census/i.test(limitation)),
    )).toBe(true)
  })
})
