import { z } from 'zod'
import registryJson from '../../data/athletes.registry.json'

const registryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.object({ en: z.string().min(1), he: z.string().min(1) }),
  sport: z.enum(['basketball', 'football', 'hockey']),
  competition: z.string().min(1),
  team: z.string().min(1),
  season: z.string().min(4),
  provider: z.enum(['espn-nba', 'nhl', 'curated']),
  providerId: z.string().min(1),
  eligibility: z.object({
    status: z.enum(['verified', 'pending']),
    sourceUrl: z.url(),
  }),
  location: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
  image: z
    .object({
      url: z.url(),
      sourceUrl: z.url(),
      alt: z.string().min(1),
    })
    .optional(),
})

const registrySchema = z.array(registryEntrySchema).superRefine((entries, context) => {
  const ids = new Set<string>()

  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate registry id: ${entry.id}`,
        path: [index, 'id'],
      })
    }
    ids.add(entry.id)
  })
})

export type RegistryAthlete = z.infer<typeof registryEntrySchema>

export const athleteRegistry = registrySchema.parse(registryJson)
export const publicRegistry = athleteRegistry.filter(
  (athlete) => athlete.eligibility.status === 'verified',
)
export const reviewRegistry = athleteRegistry.filter(
  (athlete) => athlete.eligibility.status === 'pending',
)
