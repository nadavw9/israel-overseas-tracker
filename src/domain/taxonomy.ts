import { z } from 'zod'

export const sportSchema = z.enum([
  'football',
  'basketball',
  'hockey',
  'handball',
  'volleyball',
  'baseball',
  'softball',
  'rugby',
  'tennis',
  'cycling',
  'motorsport',
  'golf',
  'athletics',
  'aquatics',
  'judo',
  'combat',
  'gymnastics',
  'sailing',
  'winter-sport',
  'other',
])

export const genderCategorySchema = z.enum(['men', 'women', 'mixed', 'open'])

export const athleteTierSchema = z.enum([
  'senior-professional',
  'college',
  'development',
  'international-circuit',
])

export const lifecycleStatusSchema = z.enum([
  'active',
  'injured',
  'inactive',
  'free-agent',
  'retired',
  'unknown',
])

export const visibilitySchema = z.enum(['public', 'review', 'archived'])

export const verificationStatusSchema = z.enum([
  'verified',
  'pending',
  'conflicting',
  'expired',
])

export const observationStateSchema = z.enum([
  'live',
  'provisional',
  'final',
  'corrected',
  'stale',
  'unavailable',
])

export type Sport = z.infer<typeof sportSchema>
export type GenderCategory = z.infer<typeof genderCategorySchema>
export type AthleteTier = z.infer<typeof athleteTierSchema>
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>
