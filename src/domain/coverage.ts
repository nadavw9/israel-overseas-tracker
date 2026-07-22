import { z } from 'zod'
import { athleteTierSchema, genderCategorySchema, httpsUrlSchema, sportSchema } from './taxonomy'

const nonEmptyStringSchema = z.string().trim().min(1)
const timestampSchema = z.iso.datetime()
const coverageIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const limitationSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !['n/a', 'none', 'unknown', 'tbd', 'todo', '-'].includes(value.toLowerCase()), {
    message: 'Limitations must describe a meaningful coverage constraint',
  })

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

export const coverageCadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'manual'])

const coverageCountsSchema = z
  .object({
    observed: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    newCandidates: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((counts, context) => {
    const classifications = ['matched', 'newCandidates', 'conflicts'] as const

    classifications.forEach((field) => {
      if (counts[field] > counts.observed) {
        context.addIssue({
          code: 'custom',
          message: `${field} cannot exceed observed`,
          path: [field],
        })
      }
    })

    if (counts.matched + counts.newCandidates + counts.conflicts !== counts.observed) {
      context.addIssue({
        code: 'custom',
        message: 'matched, newCandidates, and conflicts must classify every observed record',
        path: ['observed'],
      })
    }
  })

export const coverageEntrySchema = z
  .object({
    id: coverageIdSchema,
    sport: sportSchema,
    genderCategory: genderCategorySchema,
    tier: athleteTierSchema,
    universe: nonEmptyStringSchema,
    sourceUrl: httpsUrlSchema,
    sourceType: coverageSourceTypeSchema,
    cadence: coverageCadenceSchema,
    freshnessWindowDays: z.number().int().positive().lte(366),
    lastAttemptAt: timestampSchema,
    lastSuccessAt: timestampSchema.optional(),
    health: coverageHealthSchema,
    counts: coverageCountsSchema.optional(),
    limitations: z.array(limitationSchema).default([]),
  })
  .strict()
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

    if (entry.health === 'healthy' && !entry.lastSuccessAt) {
      context.addIssue({
        code: 'custom',
        message: 'Healthy coverage entries require a successful scan timestamp',
        path: ['lastSuccessAt'],
      })
    }

    if (entry.health === 'healthy' && !entry.counts) {
      context.addIssue({
        code: 'custom',
        message: 'Healthy coverage entries require classification counts',
        path: ['counts'],
      })
    }
  })

export const coverageLedgerSchema = z
  .object({
    generatedAt: timestampSchema,
    entries: z.array(coverageEntrySchema),
  })
  .strict()
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

      if (entry.health === 'healthy' && entry.lastSuccessAt) {
        const maxAgeMilliseconds = entry.freshnessWindowDays * 24 * 60 * 60 * 1000
        const ageMilliseconds = generatedAt.getTime() - new Date(entry.lastSuccessAt).getTime()

        if (ageMilliseconds > maxAgeMilliseconds) {
          context.addIssue({
            code: 'custom',
            message: 'Healthy coverage cannot be older than its explicit freshness window',
            path: ['entries', index, 'health'],
          })
        }
      }
    })
  })

export type CoverageLedger = z.output<typeof coverageLedgerSchema>

export const coverageSummarySchema = z
  .object({
    required: z.number().int().nonnegative(),
    healthy: z.number().int().nonnegative(),
    complete: z.boolean(),
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.healthy > summary.required) {
      context.addIssue({
        code: 'custom',
        message: 'Coverage healthy count cannot exceed required count',
        path: ['healthy'],
      })
    }

    const complete = summary.required > 0 && summary.healthy === summary.required
    if (summary.complete !== complete) {
      context.addIssue({
        code: 'custom',
        message: 'Coverage complete flag does not match required and healthy counts',
        path: ['complete'],
      })
    }
  })

export type CoverageSummary = z.output<typeof coverageSummarySchema>

export function summarizeCoverage(ledger: CoverageLedger) {
  const required = ledger.entries.length
  const healthy = ledger.entries.filter((entry) => entry.health === 'healthy').length
  return coverageSummarySchema.parse({ required, healthy, complete: required > 0 && required === healthy })
}

export const summarizeCoverageLedger = summarizeCoverage
