import { z } from 'zod'
import { httpsUrlSchema } from './athlete'
import { athleteTierSchema, genderCategorySchema, sportSchema } from './taxonomy'

const nonEmptyStringSchema = z.string().trim().min(1)
const timestampSchema = z.iso.datetime()

export const coverageHealthSchema = z.enum([
  'healthy',
  'partial',
  'stale',
  'blocked',
  'not-configured',
])

export const coverageSourceTypeSchema = z.enum([
  'primary-verification',
  'licensed-statistics',
  'discovery-only',
  'media',
])

const coverageCountsSchema = z.object({
  observed: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  newCandidates: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
})

export const coverageEntrySchema = z
  .object({
    id: nonEmptyStringSchema,
    sport: sportSchema,
    genderCategory: genderCategorySchema,
    tier: athleteTierSchema,
    universe: nonEmptyStringSchema,
    sourceUrl: httpsUrlSchema,
    sourceType: coverageSourceTypeSchema,
    cadence: nonEmptyStringSchema,
    lastAttemptAt: timestampSchema,
    lastSuccessAt: timestampSchema.optional(),
    health: coverageHealthSchema,
    counts: coverageCountsSchema.optional(),
    limitations: z.array(nonEmptyStringSchema).default([]),
  })
  .superRefine((entry, context) => {
    if (entry.health !== 'healthy' && entry.limitations.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Non-healthy coverage entries require at least one limitation',
        path: ['limitations'],
      })
    }

    if (entry.lastSuccessAt && new Date(entry.lastSuccessAt) > new Date(entry.lastAttemptAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Coverage last success cannot be after its last attempt',
        path: ['lastSuccessAt'],
      })
    }
  })

export const coverageLedgerSchema = z
  .object({
    generatedAt: timestampSchema,
    entries: z.array(coverageEntrySchema),
  })
  .superRefine((ledger, context) => {
    const seen = new Set<string>()
    const generatedAt = new Date(ledger.generatedAt)

    ledger.entries.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate coverage entry id: ${entry.id}`,
          path: ['entries', index, 'id'],
        })
      }
      seen.add(entry.id)

      if (new Date(entry.lastAttemptAt) > generatedAt) {
        context.addIssue({
          code: 'custom',
          message: 'Coverage last attempt cannot be after ledger generation',
          path: ['entries', index, 'lastAttemptAt'],
        })
      }

      if (entry.lastSuccessAt && new Date(entry.lastSuccessAt) > generatedAt) {
        context.addIssue({
          code: 'custom',
          message: 'Coverage last success cannot be after ledger generation',
          path: ['entries', index, 'lastSuccessAt'],
        })
      }
    })
  })

export type CoverageLedger = z.output<typeof coverageLedgerSchema>

export function summarizeCoverageLedger(ledger: CoverageLedger) {
  const required = ledger.entries.length
  const healthy = ledger.entries.filter((entry) => entry.health === 'healthy').length
  return { required, healthy, complete: required > 0 && required === healthy }
}
