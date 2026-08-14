import { z } from 'zod'
import { providerSchema, sportSchema } from './taxonomy'

const positiveIntegerSchema = z.number().int().positive()
const nonNegativeIntegerSchema = z.number().int().nonnegative()
const nonEmptyStringSchema = z.string().trim().min(1)

export const refreshAccessSchema = z.enum(['licensed-or-permitted'])

export const refreshPolicySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sport: sportSchema,
  competition: nonEmptyStringSchema,
  cadenceMinutes: positiveIntegerSchema,
  activeEventCadenceMinutes: positiveIntegerSchema,
  retentionHours: positiveIntegerSchema,
  access: refreshAccessSchema,
}).strict().superRefine((policy, context) => {
  if (policy.activeEventCadenceMinutes > policy.cadenceMinutes) {
    context.addIssue({
      code: 'custom',
      message: 'Active-event cadence cannot be slower than the normal cadence',
      path: ['activeEventCadenceMinutes'],
    })
  }
})

export const refreshPolicySetSchema = z.array(refreshPolicySchema).superRefine((policies, context) => {
  const seen = new Set<string>()
  policies.forEach((policy, index) => {
    if (seen.has(policy.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate refresh policy id: ${policy.id}`,
        path: [index, 'id'],
      })
    }
    seen.add(policy.id)
  })
})

export const refreshProviderAttemptSchema = z.object({
  provider: providerSchema,
  attempted: nonNegativeIntegerSchema,
  succeeded: nonNegativeIntegerSchema,
  failed: nonNegativeIntegerSchema,
  skipped: nonNegativeIntegerSchema,
  durationMs: nonNegativeIntegerSchema,
}).strict().superRefine((attempt, context) => {
  if (attempt.succeeded + attempt.failed + attempt.skipped !== attempt.attempted) {
    context.addIssue({
      code: 'custom',
      message: 'Provider attempt totals must balance attempted work',
      path: ['attempted'],
    })
  }
})

export const refreshManifestSchema = z.object({
  generatedAt: z.iso.datetime(),
  snapshotGeneratedAt: z.iso.datetime(),
  durationMs: nonNegativeIntegerSchema,
  unboundSkipped: nonNegativeIntegerSchema.default(0),
  providers: z.array(refreshProviderAttemptSchema),
}).strict()

export type RefreshPolicy = z.output<typeof refreshPolicySchema>
export type RefreshPolicySet = z.output<typeof refreshPolicySetSchema>
export type RefreshProviderAttempt = z.output<typeof refreshProviderAttemptSchema>
export type RefreshManifest = z.output<typeof refreshManifestSchema>
