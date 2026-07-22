# Verified Registry Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-record athlete list with a normalized, source-backed registry, private candidate queue, measurable coverage ledger, and compatible public snapshot.

**Architecture:** Separate athlete identity, eligibility evidence, affiliations, provider bindings, media rights, and coverage into independently validated JSON datasets. A registry compiler joins only verified public records, and the snapshot generator enriches those records with provider observations while failing closed. React continues to consume one public snapshot but gains tier, gender, lifecycle, provenance, and coverage-aware presentation.

**Tech Stack:** TypeScript 6, Zod 4, React 19, Vitest, Testing Library, Playwright, Vite, pnpm

---

## Scope and release boundary

This plan implements the approved registry and coverage foundation. It migrates the five existing records and does not add unverified athletes or purchase external data feeds. Automated federation scanners and additional sport-provider adapters receive separate plans after this foundation is running.

## File map

### New domain and data files

- `src/domain/taxonomy.ts`: shared sport, tier, gender, lifecycle, source, and observation enums.
- `src/domain/registry.ts`: schemas for identities, evidence, affiliations, provider bindings, and media.
- `src/domain/coverage.ts`: coverage-ledger schema and summary calculation.
- `src/data/registry.ts`: validates normalized JSON and compiles verified public records.
- `data/registry/athletes.json`: stable athlete identities only.
- `data/registry/evidence.json`: eligibility claims and sources.
- `data/registry/affiliations.json`: time-bounded overseas affiliations.
- `data/registry/provider-bindings.json`: verified external IDs.
- `data/registry/media.json`: media rights records, including review status.
- `data/review/candidates.json`: private Danny Wolf and Zeev Buium review records.
- `data/coverage/ledger.json`: declared discovery universes and their health.
- `src/components/CoverageStatus.tsx`: honest coverage summary shown in the product.
- `tests/fixtures/registry.ts`: reusable complete schema fixtures.
- `tests/unit/registry-schema.test.ts`: normalized-registry validation tests.
- `tests/unit/coverage.test.ts`: coverage-health tests.

### Existing files to modify

- `src/domain/athlete.ts`: public snapshot shape with tier, gender, lifecycle, affiliation, performance, and coverage.
- `scripts/providers/types.ts`: provider observation contract.
- `scripts/providers/curated.ts`: explicit observation state.
- `scripts/providers/nba.ts`: explicit observation state.
- `scripts/providers/nhl.ts`: explicit observation state and observed team.
- `scripts/sync-data.ts`: consume compiled records and coverage ledger.
- `src/services/snapshot.ts`: compile provider results into the new public snapshot.
- `src/services/rankings.ts`: keep rankings within compatible sports.
- `src/app/App.tsx`: multi-dimensional filtering and coverage status.
- `src/components/FilterBar.tsx`: sport, tier, gender, and status controls.
- `src/components/AthleteCard.tsx`: affiliation and tier presentation.
- `src/components/AthleteDrawer.tsx`: evidence basis, affiliation source, and media attribution.
- `src/components/AthletePhoto.tsx`: display only approved media.
- `src/components/FreshnessBadge.tsx`: read observation state from performance.
- `src/components/Leaderboard.tsx`: sport-grouped rankings.
- `src/components/AthleteMap.tsx`: use current affiliation location.
- `src/i18n/messages.ts`: English and Hebrew labels for new fields.
- `src/app/styles.css`: layout for filters, tags, grouped rankings, and coverage status.
- `scripts/validate-images.ts`: validate rights metadata as well as image responses.
- `public/images/athletes/manifest.json`: rights-aware approved manifest.
- `public/data/snapshot.json`: regenerated public data.
- `tests/unit/athlete-schema.test.ts`: new snapshot-contract tests.
- `tests/unit/registry.test.ts`: compiler and private-candidate tests.
- `tests/unit/sync-data.test.ts`: observation and stale-fallback tests.
- `tests/unit/athlete-list.test.tsx`: expanded filters and labels.
- `tests/unit/views.test.tsx`: grouped ranking and drawer provenance tests.
- `tests/unit/images.test.tsx`: media-rights and fallback tests.
- `tests/unit/privacy.test.ts`: review data is absent from the public artifact.
- `tests/unit/i18n.test.tsx`: translated tier and coverage controls.
- `tests/e2e/responsive.spec.ts`: new filters remain usable on mobile and RTL desktop.
- `docs/inclusion-policy.md`: exact tier and representation rules.
- `docs/data-sources.md`: normalized source register and coverage status.
- `README.md`: registry commands, trust model, and coverage language.

### File removed after successful migration

- `data/athletes.registry.json`: replaced by the five focused registry datasets.

## Task 1: Add shared taxonomy and normalized registry schemas

**Files:**
- Create: `src/domain/taxonomy.ts`
- Create: `src/domain/registry.ts`
- Create: `tests/fixtures/registry.ts`
- Create: `tests/unit/registry-schema.test.ts`

- [ ] **Step 1: Write failing taxonomy and registry tests**

Create `tests/unit/registry-schema.test.ts` with assertions for all four tiers, citizenship versus representation, para classification, duplicate provider IDs, and public records without verified evidence:

```ts
import { describe, expect, it } from 'vitest'
import { registryBundleSchema } from '../../src/domain/registry'
import { validRegistryBundle } from '../fixtures/registry'

describe('registryBundleSchema', () => {
  it.each([
    'senior-professional',
    'college',
    'development',
    'international-circuit',
  ] as const)('accepts the %s tier', (tier) => {
    const input = structuredClone(validRegistryBundle)
    input.athletes[0].tier = tier
    expect(registryBundleSchema.parse(input).athletes[0].tier).toBe(tier)
  })

  it('keeps citizenship and representation as different evidence bases', () => {
    const parsed = registryBundleSchema.parse(validRegistryBundle)
    expect(parsed.evidence.map((claim) => claim.basis)).toEqual([
      'citizenship',
      'represents-israel',
    ])
  })

  it('accepts a para classification without changing the sport', () => {
    const input = structuredClone(validRegistryBundle)
    input.athletes[0].paraClassification = 'wheelchair-tennis-quad'
    expect(registryBundleSchema.parse(input).athletes[0]).toMatchObject({
      sport: 'tennis',
      paraClassification: 'wheelchair-tennis-quad',
    })
  })

  it('rejects duplicate provider identities', () => {
    const input = structuredClone(validRegistryBundle)
    input.providerBindings.push({ ...input.providerBindings[0], id: 'binding-two' })
    expect(() => registryBundleSchema.parse(input)).toThrow(/provider binding/i)
  })

  it('accepts affiliation history but rejects two current primary affiliations', () => {
    const history = structuredClone(validRegistryBundle)
    history.affiliations.push({
      ...history.affiliations[0], id: 'affiliation-history',
      season: '2025', startDate: '2025-01-01', endDate: '2025-12-31',
      primary: false, rosterStatus: 'released',
    })
    expect(registryBundleSchema.parse(history).affiliations).toHaveLength(2)

    const conflict = structuredClone(validRegistryBundle)
    conflict.affiliations.push({
      ...conflict.affiliations[0], id: 'affiliation-conflict',
    })
    expect(() => registryBundleSchema.parse(conflict)).toThrow(/primary affiliation/i)
  })

  it('rejects a public athlete without verified eligibility', () => {
    const input = structuredClone(validRegistryBundle)
    input.evidence = input.evidence.filter((claim) => claim.athleteId !== 'athlete-one')
    expect(() => registryBundleSchema.parse(input)).toThrow(/verified eligibility/i)
  })
})
```

Create `tests/fixtures/registry.ts` with this complete linked fixture:

```ts
import type { RegistryBundleInput } from '../../src/domain/registry'

export const validRegistryBundle: RegistryBundleInput = {
  athletes: [
    {
      id: 'athlete-one',
      name: { en: 'Athlete One', he: 'ספורטאית אחת' },
      aliases: ['A. One'],
      sport: 'tennis',
      discipline: 'singles',
      genderCategory: 'women',
      tier: 'senior-professional',
      lifecycleStatus: 'active',
      visibility: 'public',
    },
    {
      id: 'athlete-two',
      name: { en: 'Athlete Two', he: 'ספורטאי שני' },
      aliases: [],
      sport: 'hockey',
      genderCategory: 'men',
      tier: 'development',
      lifecycleStatus: 'unknown',
      visibility: 'review',
    },
  ],
  evidence: [
    {
      id: 'evidence-one', athleteId: 'athlete-one', basis: 'citizenship',
      status: 'verified', publisher: 'Official Federation',
      sourceUrl: 'https://example.com/athlete-one',
      retrievedAt: '2026-07-23T08:00:00.000Z',
      matchedOn: ['name', 'governing-body-identity'],
    },
    {
      id: 'evidence-two', athleteId: 'athlete-two', basis: 'represents-israel',
      status: 'pending', publisher: 'Official Federation',
      sourceUrl: 'https://example.com/athlete-two',
      retrievedAt: '2026-07-23T08:00:00.000Z',
      matchedOn: ['name', 'governing-body-identity'],
    },
  ],
  affiliations: [
    {
      id: 'affiliation-one', athleteId: 'athlete-one',
      organization: {
        name: 'International Tennis Tour', type: 'tour-membership', country: 'Global',
      },
      competition: 'ITF World Tennis Tour', season: '2026',
      startDate: '2026-01-01', primary: true, rosterStatus: 'active',
      countsAsOverseas: true,
      source: {
        publisher: 'International Tennis Federation',
        sourceUrl: 'https://example.com/itf-athlete-one',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    },
  ],
  providerBindings: [
    {
      id: 'binding-one', athleteId: 'athlete-one', provider: 'curated',
      externalId: 'athlete-one', sport: 'tennis',
      competition: 'ITF World Tennis Tour', status: 'verified',
      matchedOn: ['name', 'governing-body-identity'],
      verifiedAt: '2026-07-23T08:00:00.000Z',
    },
  ],
  media: [
    {
      id: 'media-one', athleteId: 'athlete-one',
      url: 'https://example.com/athlete-one.jpg',
      sourceUrl: 'https://example.com/athlete-one-photo',
      rightsStatus: 'approved', rightsHolder: 'Example Photographer',
      license: 'cc-by', usage: 'editorial-display',
      attribution: 'Example Photographer, CC BY 4.0',
      retrievedAt: '2026-07-23T08:00:00.000Z',
      alt: 'Athlete One playing tennis',
    },
  ],
}
```

- [ ] **Step 2: Run the new tests and verify the missing modules fail**

Run: `pnpm vitest run tests/unit/registry-schema.test.ts`

Expected: FAIL because `src/domain/registry.ts` and `tests/fixtures/registry.ts` do not exist.

- [ ] **Step 3: Implement the taxonomy schemas**

Create `src/domain/taxonomy.ts`:

```ts
import { z } from 'zod'

export const sportSchema = z.enum([
  'football', 'basketball', 'hockey', 'handball', 'volleyball',
  'baseball', 'softball', 'rugby', 'tennis', 'cycling', 'motorsport',
  'golf', 'athletics', 'aquatics', 'judo', 'combat', 'gymnastics',
  'sailing', 'winter-sport', 'other',
])
export const genderCategorySchema = z.enum(['men', 'women', 'mixed', 'open'])
export const athleteTierSchema = z.enum([
  'senior-professional', 'college', 'development', 'international-circuit',
])
export const lifecycleStatusSchema = z.enum([
  'active', 'injured', 'inactive', 'free-agent', 'retired', 'unknown',
])
export const visibilitySchema = z.enum(['public', 'review', 'archived'])
export const verificationStatusSchema = z.enum([
  'verified', 'pending', 'conflicting', 'expired',
])
export const observationStateSchema = z.enum([
  'live', 'provisional', 'final', 'corrected', 'stale', 'unavailable',
])

export type Sport = z.infer<typeof sportSchema>
export type GenderCategory = z.infer<typeof genderCategorySchema>
export type AthleteTier = z.infer<typeof athleteTierSchema>
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>
```

- [ ] **Step 4: Implement the normalized registry schema and cross-record checks**

Create `src/domain/registry.ts` with exported schemas for `athleteIdentity`, `eligibilityEvidence`, `affiliation`, `providerBinding`, `mediaAsset`, and `registryBundle`. Use `httpsUrlSchema` from `src/domain/athlete.ts`. The bundle refinement must enforce unique IDs, one verified eligibility claim for each public athlete, exactly one active primary overseas affiliation for each public athlete, and uniqueness of each `(provider, externalId)` pair.

Use these exact enums in the schemas:

```ts
export const eligibilityBasisSchema = z.enum(['citizenship', 'represents-israel'])
export const organizationTypeSchema = z.enum([
  'club', 'college', 'academy', 'national-team', 'racing-team',
  'cycling-team', 'tour-membership',
])
export const rosterStatusSchema = z.enum([
  'active', 'loan', 'reserve', 'injured', 'suspended', 'released', 'unknown',
])
export const providerSchema = z.enum(['espn-nba', 'nhl', 'curated'])
export const identityMatchFieldSchema = z.enum([
  'name', 'birth-date', 'team', 'competition', 'governing-body-identity',
])
export const mediaRightsStatusSchema = z.enum(['approved', 'review', 'expired'])
export const mediaLicenseSchema = z.enum([
  'provider-terms', 'club-permission', 'player-permission',
  'cc-by', 'cc-by-sa', 'public-domain',
])
export const mediaUsageSchema = z.enum([
  'editorial-display', 'remote-editorial-display', 'commercial-display',
])
export const candidateStateSchema = z.enum([
  'new', 'needs-evidence', 'identity-conflict', 'affiliation-conflict',
  'approved', 'rejected', 'superseded',
])
```

The athlete identity schema includes optional ISO `birthDate` and optional non-empty `paraClassification`, but neither field is copied automatically into the public snapshot. The provider-binding refinement must require at least two `matchedOn` values. An approved media asset must contain `rightsHolder`, `license`, `usage`, `sourceUrl`, `retrievedAt`, and non-empty `alt`.
Export `RegistryBundleInput` as `z.input<typeof registryBundleSchema>` and `RegistryBundle` as `z.output<typeof registryBundleSchema>` so fixtures and the compiler use the same field names.
Export this candidate queue contract:

```ts
export const candidateQueueSchema = z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.object({ en: z.string().trim().min(1), he: z.string().trim().min(1) }),
  sport: sportSchema,
  tier: athleteTierSchema,
  genderCategory: genderCategorySchema,
  state: candidateStateSchema,
  signals: z.array(z.object({
    sourceUrl: httpsUrlSchema,
    sourceType: z.enum(['primary-verification', 'discovery-only']),
    discoveredAt: z.iso.datetime(),
    note: z.string().trim().min(1),
  })).min(1),
  proposedAffiliation: z.object({
    organization: z.string().trim().min(1),
    competition: z.string().trim().min(1),
    season: z.string().trim().min(4),
  }).optional(),
  reviewerNote: z.string().trim().min(1),
}))
```

- [ ] **Step 5: Run the registry tests**

Run: `pnpm vitest run tests/unit/registry-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add src/domain/taxonomy.ts src/domain/registry.ts tests/fixtures/registry.ts tests/unit/registry-schema.test.ts
git commit -m "feat: add normalized athlete registry schemas"
```

## Task 2: Migrate existing records into focused datasets

**Files:**
- Create: `data/registry/athletes.json`
- Create: `data/registry/evidence.json`
- Create: `data/registry/affiliations.json`
- Create: `data/registry/provider-bindings.json`
- Create: `data/registry/media.json`
- Create: `data/review/candidates.json`
- Modify: `src/data/registry.ts`
- Modify: `tests/unit/registry.test.ts`
- Remove: `data/athletes.registry.json`

- [ ] **Step 1: Replace registry tests with compiler expectations**

Update `tests/unit/registry.test.ts` to require the three verified public athletes, private review candidates, derived affiliations, evidence bases, and provider bindings:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidateQueueSchema } from '../../src/domain/registry'
import { publicRegistry } from '../../src/data/registry'

describe('compiled registry', () => {
  it('compiles only verified public athletes', () => {
    expect(publicRegistry.map((athlete) => athlete.id)).toEqual([
      'deni-avdija', 'ben-saraf', 'oscar-gloukh',
    ])
    expect(publicRegistry.every((athlete) => athlete.eligibility.status === 'verified')).toBe(true)
    expect(publicRegistry.every((athlete) => athlete.affiliation.primary)).toBe(true)
  })

  it('binds provider identities separately from athlete identity', () => {
    expect(publicRegistry.map((athlete) => athlete.binding.externalId)).toEqual([
      '4683021', '5242502', 'oscar-gloukh',
    ])
  })

  it('keeps review candidates outside browser source data', () => {
    const review = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )
    expect(review.map((candidate) => candidate.id)).toEqual(['danny-wolf', 'zeev-buium'])
    expect(review.every((candidate) => candidate.state === 'needs-evidence')).toBe(true)
    expect(publicRegistry.map((athlete) => athlete.id)).not.toContain('danny-wolf')
    expect(publicRegistry.map((athlete) => athlete.id)).not.toContain('zeev-buium')
  })
})
```

- [ ] **Step 2: Run the registry test and verify it fails against the old structure**

Run: `pnpm vitest run tests/unit/registry.test.ts`

Expected: FAIL because the old registry has no `affiliation`, `binding`, or candidate file.

- [ ] **Step 3: Create the normalized data files**

Migrate records with this exact disposition:

| Athlete | Visibility | Tier | Gender | Lifecycle | Eligibility basis | Primary affiliation | Binding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Deni Avdija | public | senior-professional | men | active | citizenship | Portland Trail Blazers / NBA / 2025-26 | espn-nba `4683021` |
| Ben Saraf | public | development | men | active | represents-israel | Brooklyn Nets / NBA / 2025-26 | espn-nba `5242502` |
| Oscar Gloukh | public | senior-professional | men | active | citizenship | Ajax / Eredivisie / 2025-26 | curated `oscar-gloukh` |
| Danny Wolf | review candidate | senior-professional | men | unknown | pending represents-israel | Brooklyn Nets / NBA / 2025-26 | discovered espn-nba `5107173` |
| Zeev Buium | review candidate | senior-professional | men | unknown | pending represents-israel | Vancouver Canucks / NHL / 2025-26 | discovered nhl `8484798` |

Preserve every current source URL in the role it actually supports, together with each location and localized name. Replace Ben Saraf's eligibility source with the official FIBA U19 roster at `https://reports.fiba.basketball/reports/2025/FIBA%20U19%20Basketball%20World%20Cup/rosters.pdf`, while retaining the G League profile as identity and affiliation evidence. Use `2026-07-23T08:00:00.000Z` as the migration verification timestamp for evidence, affiliations, bindings, and media. Move current images into `media.json` with `rightsStatus: "review"`; do not assert reuse permission that has not been documented. Set their `rightsHolder` from the source organization, `usage` to `remote-editorial-display`, and omit `license`, which the schema permits only for review assets.

Candidate records use states `needs-evidence`, `identity-conflict`, `affiliation-conflict`, `approved`, `rejected`, or `superseded`; both migrated candidates use `needs-evidence`.

- [ ] **Step 4: Compile normalized files in `src/data/registry.ts`**

Import only the five `data/registry` files, validate them with `registryBundleSchema`, and export `publicRegistry`. Do not import `data/review/candidates.json` from any `src` module. Define `RegistryAthlete` as the compiled identity plus `eligibility`, `affiliation`, `binding`, and optional approved `image`.

The compiler must select evidence with `status === 'verified'`, affiliation with `primary === true && rosterStatus === 'active'`, binding with `status === 'verified'`, and media with `rightsStatus === 'approved'`.

- [ ] **Step 5: Run registry and privacy tests**

Run: `pnpm vitest run tests/unit/registry.test.ts tests/unit/privacy.test.ts`

Expected: PASS.

- [ ] **Step 6: Remove the obsolete monolithic registry and commit**

```bash
git rm data/athletes.registry.json
git add data/registry data/review src/data/registry.ts tests/unit/registry.test.ts
git commit -m "refactor: normalize verified athlete registry"
```

## Task 3: Add the coverage ledger and honest completeness summary

**Files:**
- Create: `src/domain/coverage.ts`
- Create: `data/coverage/ledger.json`
- Create: `tests/unit/coverage.test.ts`

- [ ] **Step 1: Write failing coverage tests**

```ts
import { describe, expect, it } from 'vitest'
import { coverageLedgerSchema, summarizeCoverage } from '../../src/domain/coverage'

const healthy = {
  id: 'atp-isr-men', sport: 'tennis', genderCategory: 'men',
  tier: 'international-circuit', universe: 'ATP singles players filtered to ISR',
  sourceUrl: 'https://www.atptour.com/en/rankings/singles?RankRange=0-5000&Region=ISR',
  sourceType: 'primary-verification', cadence: 'weekly',
  lastAttemptAt: '2026-07-23T08:00:00.000Z',
  lastSuccessAt: '2026-07-23T08:00:00.000Z', health: 'healthy',
  counts: { observed: 8, matched: 0, newCandidates: 8, conflicts: 0 },
  limitations: ['Provider bindings have not been connected.'],
} as const

describe('coverage ledger', () => {
  it('reports complete only when every required universe is healthy', () => {
    const ledger = coverageLedgerSchema.parse({ generatedAt: healthy.lastAttemptAt, entries: [healthy] })
    expect(summarizeCoverage(ledger)).toEqual({ required: 1, healthy: 1, complete: true })
  })

  it('reports incomplete when a required universe is partial', () => {
    const ledger = coverageLedgerSchema.parse({
      generatedAt: healthy.lastAttemptAt,
      entries: [{ ...healthy, health: 'partial' }],
    })
    expect(summarizeCoverage(ledger).complete).toBe(false)
  })
})
```

- [ ] **Step 2: Run the coverage test and verify it fails**

Run: `pnpm vitest run tests/unit/coverage.test.ts`

Expected: FAIL because `src/domain/coverage.ts` does not exist.

- [ ] **Step 3: Implement coverage schemas and summary**

Create `src/domain/coverage.ts` with health values `healthy`, `partial`, `stale`, `blocked`, and `not-configured`; source types `primary-verification`, `licensed-statistics`, `discovery-only`, and `media`; non-negative integer counts; HTTPS URLs; ISO timestamps; and the exact summary function:

```ts
export function summarizeCoverage(ledger: CoverageLedger) {
  const required = ledger.entries.length
  const healthy = ledger.entries.filter((entry) => entry.health === 'healthy').length
  return { required, healthy, complete: required > 0 && required === healthy }
}
```

- [ ] **Step 4: Seed the ledger with researched universes**

Create `data/coverage/ledger.json` with four required entries:

- ATP men filtered to ISR: `partial`, observed 8, matched 0, new candidates 8, conflicts 0.
- IIHF 2026 Israel roster: `partial`, with counts omitted until the roster scanner is implemented.
- IFA 2026 senior men roster: `partial`, with counts omitted until current clubs are reconciled.
- FIBA Israel competition rosters: `partial`, with counts omitted until senior, youth, women, and club seasons are separated.

Set `generatedAt`, `lastAttemptAt`, and every available `lastSuccessAt` to `2026-07-23T08:00:00.000Z`. Each limitations array must state the exact missing reconciliation step and must not claim comprehensive coverage.

- [ ] **Step 5: Run coverage tests and validate the real ledger**

Run: `pnpm vitest run tests/unit/coverage.test.ts`

Expected: PASS and the parsed real ledger summary reports `complete: false`.

- [ ] **Step 6: Commit the coverage foundation**

```bash
git add src/domain/coverage.ts data/coverage/ledger.json tests/unit/coverage.test.ts
git commit -m "feat: add measurable coverage ledger"
```

## Task 4: Expand the public snapshot contract

**Files:**
- Modify: `src/domain/athlete.ts`
- Modify: `tests/unit/athlete-schema.test.ts`

- [ ] **Step 1: Rewrite snapshot-schema tests for the normalized public shape**

The valid athlete fixture must contain `genderCategory`, `tier`, `lifecycleStatus`, verified eligibility basis and source, a current `affiliation`, and a `performance` object. Add tests that reject mismatched sports, non-public visibility, an affiliation that does not count as overseas, and available performance without statistics.

Use this performance shape:

```ts
performance: {
  status: 'available',
  state: 'final',
  competition: 'NBA',
  season: '2025-26',
  stats: {
    kind: 'basketball', games: 66, pointsPerGame: 24.2,
    reboundsPerGame: 6.9, assistsPerGame: 6.7,
  },
  source: {
    provider: 'espn-nba', sourceUrl: 'https://example.com/deni',
    retrievedAt: '2026-07-23T08:00:00.000Z',
  },
}
```

- [ ] **Step 2: Run schema tests and verify the old contract fails**

Run: `pnpm vitest run tests/unit/athlete-schema.test.ts`

Expected: FAIL because the current schema requires top-level team, competition, season, stats, and source.

- [ ] **Step 3: Implement the public snapshot schema**

Keep the existing sport-statistics discriminated union and replace the athlete wrapper with:

```ts
export const athleteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.object({ en: z.string().trim().min(1), he: z.string().trim().min(1) }),
  aliases: z.array(z.string().trim().min(1)),
  sport: sportSchema,
  discipline: z.string().trim().min(1).optional(),
  genderCategory: genderCategorySchema,
  tier: athleteTierSchema,
  lifecycleStatus: lifecycleStatusSchema,
  visibility: z.literal('public'),
  eligibility: z.object({
    basis: eligibilityBasisSchema,
    sourceUrl: httpsUrlSchema,
    publisher: z.string().trim().min(1),
    retrievedAt: z.iso.datetime(),
  }),
  affiliation: publicAffiliationSchema,
  performance: publicPerformanceSchema,
  image: publicMediaSchema.optional(),
})
```

Define `publicAffiliationSchema` with organization `{ name, type, country }`, competition, season, roster status, literal `countsAsOverseas: true`, source `{ publisher, sourceUrl, retrievedAt }`, and optional location `{ city, country, lat, lng }`. Define `publicMediaSchema` with URL, source URL, alt, rights holder, license, usage, retrieval time, and optional attribution; only approved media reaches this schema. Define `publicPerformanceSchema` as a discriminated union on `status`: `available` requires non-null stats and observation state other than `unavailable`; `unavailable` requires `stats: null` and `state: 'unavailable'`. Both variants require competition, season, and source. Add `coverage: coverageSummarySchema` to `snapshotSchema`, where the summary is `{ required: nonnegative integer, healthy: nonnegative integer, complete: boolean }` and `healthy` cannot exceed `required`.

- [ ] **Step 4: Run schema tests**

Run: `pnpm vitest run tests/unit/athlete-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the public contract**

```bash
git add src/domain/athlete.ts tests/unit/athlete-schema.test.ts
git commit -m "feat: expand public athlete snapshot contract"
```

## Task 5: Adapt providers and snapshot generation

**Files:**
- Modify: `scripts/providers/types.ts`
- Modify: `scripts/providers/curated.ts`
- Modify: `scripts/providers/nba.ts`
- Modify: `scripts/providers/nhl.ts`
- Modify: `scripts/sync-data.ts`
- Modify: `src/services/snapshot.ts`
- Modify: `tests/unit/providers.test.ts`
- Modify: `tests/unit/sync-data.test.ts`
- Modify: `public/data/snapshot.json`

- [ ] **Step 1: Update provider and snapshot tests first**

Change provider expectations to require `state: 'final'`. Change NHL expectations from `team` to `observedOrganization`. Update stale fallback to expect `performance.state === 'stale'`, while identity-only curated data expects `performance.status === 'unavailable'`.

Add a test that rejects a provider result whose `observedOrganization` differs from the verified current affiliation after normalized punctuation and case comparison. Export `writeSnapshotAtomically(snapshotPath, snapshot)` from `scripts/sync-data.ts` and test it with a Vitest temporary directory: after success, the target contains a valid snapshot and `${snapshotPath}.tmp` does not exist.

- [ ] **Step 2: Run provider and sync tests and verify failures**

Run: `pnpm vitest run tests/unit/providers.test.ts tests/unit/sync-data.test.ts`

Expected: FAIL on the new observation and organization fields.

- [ ] **Step 3: Update the provider result contract**

Use this exact interface in `scripts/providers/types.ts`:

```ts
export type ProviderResult = {
  athleteId: string
  stats: AthleteStats | null
  state: 'final' | 'provisional' | 'corrected'
  observedOrganization?: string
  sourceUrl: string
  retrievedAt: string
}
```

The three current parsers return `state: 'final'`. The NHL parser renames `team` to `observedOrganization`. Update `fetchProviderRecord` to branch on `entry.binding.provider`, construct URLs from `entry.binding.externalId`, and pass `entry.affiliation.season` to season-aware adapters. Remove all reads of the old `entry.provider`, `entry.providerId`, `entry.team`, `entry.competition`, and `entry.season` fields.

- [ ] **Step 4: Compile the new snapshot in `src/services/snapshot.ts`**

Build identity, eligibility, affiliation, tier, gender, lifecycle, approved image, and performance from `RegistryAthlete`. If provider identity or observed organization mismatches, throw before normalization. On provider failure, rebuild identity and affiliation from the current registry, reuse only the prior verified performance, and set `performance.state` to `stale`; fail closed when there is no prior verified performance.

Pass the coverage summary into `buildSnapshot` and include it at the snapshot root.

- [ ] **Step 5: Update `scripts/sync-data.ts` and regenerate the snapshot**

Load and validate `data/coverage/ledger.json`, pass `summarizeCoverage(ledger)` to `buildSnapshot`, and write atomically: serialize to `public/data/snapshot.tmp.json`, validate the serialized value once more, rename it to `public/data/snapshot.json`, and remove the temporary file if validation or rename fails. Then run:

Run: `pnpm sync:data`

Expected: `Wrote 3 verified athletes` and a new `public/data/snapshot.json` matching `snapshotSchema` with `coverage.complete` equal to `false`.

- [ ] **Step 6: Run provider and sync tests**

Run: `pnpm vitest run tests/unit/providers.test.ts tests/unit/sync-data.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the pipeline migration**

```bash
git add scripts/providers scripts/sync-data.ts src/services/snapshot.ts tests/unit/providers.test.ts tests/unit/sync-data.test.ts public/data/snapshot.json
git commit -m "feat: compile verified registry snapshots"
```

## Task 6: Enforce media rights and safe fallbacks

**Files:**
- Modify: `scripts/validate-images.ts`
- Modify: `public/images/athletes/manifest.json`
- Modify: `src/components/AthletePhoto.tsx`
- Modify: `tests/unit/images.test.tsx`

- [ ] **Step 1: Write failing media-rights tests**

Replace the assumption that every public athlete has an image. Test that review assets produce the accessible fallback, approved assets display attribution-ready metadata, and the validator rejects an approved image without license or rights holder.

```ts
it('rejects approved media without a license', async () => {
  await expect(validateImages({
    athlete: {
      url: 'https://example.com/player.png',
      sourceUrl: 'https://example.com/player',
      alt: 'Player portrait', rightsStatus: 'approved',
      rightsHolder: 'Example', usage: 'editorial-display',
      retrievedAt: '2026-07-23T08:00:00.000Z',
    },
  }, async () => new Response('', { headers: { 'content-type': 'image/png' } })))
    .rejects.toThrow(/license/i)
})
```

- [ ] **Step 2: Run image tests and verify the old validator fails**

Run: `pnpm vitest run tests/unit/images.test.tsx`

Expected: FAIL because the manifest schema has no rights fields.

- [ ] **Step 3: Make image validation rights-aware**

Reuse `mediaRightsStatusSchema` and `mediaLicenseSchema`. `validateImages` must fetch only approved assets, require approved assets to contain license and rights holder, retain duplicate URL checks, and return the number of approved valid assets.

Change `public/images/athletes/manifest.json` to an empty object until at least one existing image has documented reusable rights. The three review media records remain in `data/registry/media.json` and do not enter the public snapshot.

- [ ] **Step 4: Run image tests and validation**

Run: `pnpm vitest run tests/unit/images.test.tsx && pnpm validate:images`

Expected: PASS and `Validated 0 athlete images`.

- [ ] **Step 5: Commit the rights-safe media behavior**

```bash
git add scripts/validate-images.ts public/images/athletes/manifest.json src/components/AthletePhoto.tsx tests/unit/images.test.tsx
git commit -m "fix: require documented athlete image rights"
```

## Task 7: Update directory, profile, filters, rankings, and coverage UI

**Files:**
- Create: `src/components/CoverageStatus.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/components/FilterBar.tsx`
- Modify: `src/components/AthleteCard.tsx`
- Modify: `src/components/AthleteDrawer.tsx`
- Modify: `src/components/FreshnessBadge.tsx`
- Modify: `src/components/Leaderboard.tsx`
- Modify: `src/components/AthleteMap.tsx`
- Modify: `src/services/rankings.ts`
- Modify: `src/i18n/messages.ts`
- Modify: `src/app/styles.css`
- Modify: `tests/unit/athlete-list.test.tsx`
- Modify: `tests/unit/views.test.tsx`
- Modify: `tests/unit/i18n.test.tsx`

- [ ] **Step 1: Add failing UI tests for the new product behavior**

Add tests that:

- filter by `senior-professional`, `development`, gender, and lifecycle status;
- search the current affiliation organization and country;
- show citizenship versus represents-Israel wording in the drawer;
- show `Coverage incomplete: 0 of 4 universes healthy` from the seeded ledger;
- group basketball and football rankings under separate headings;
- show the fallback photo without a broken external image;
- render the new controls and labels in Hebrew with RTL direction.

- [ ] **Step 2: Run the focused UI tests and verify failures**

Run: `pnpm vitest run tests/unit/athlete-list.test.tsx tests/unit/views.test.tsx tests/unit/i18n.test.tsx`

Expected: FAIL because the UI still reads top-level team, competition, stats, source, and location.

- [ ] **Step 3: Implement reusable filter state**

Define in `FilterBar.tsx`:

```ts
export type DirectoryFilters = {
  sport: 'all' | Sport
  tier: 'all' | AthleteTier
  gender: 'all' | GenderCategory
  status: 'all' | LifecycleStatus
}
```

Keep sport buttons for sports present in the snapshot. Add labeled selects for tier, gender, and lifecycle status. `TrackerApp` owns one `DirectoryFilters` object and filters the snapshot before all three views. Search indexes `athlete.name`, `athlete.aliases`, affiliation organization, competition, city, and country.

- [ ] **Step 4: Update cards, drawer, map, and freshness**

Read organization, competition, season, and location from `athlete.affiliation`. Read statistics and source from `athlete.performance`. Show tier and lifecycle labels on cards. The drawer links separately to eligibility, affiliation, and performance sources and labels the eligibility basis. `FreshnessBadge` maps `stale` to the clock icon, `unavailable` to identity-only wording, and all other states to checked wording.

- [ ] **Step 5: Group rankings by compatible sport**

Replace the mixed list with `rankAthletesBySport(athletes): Array<{ sport: Sport; athletes: Athlete[] }>`. Exclude unavailable performance, review records, and incompatible sport payloads. `Leaderboard` renders a heading and ordered list per sport, preserving the existing primary metric inside each group.

- [ ] **Step 6: Add `CoverageStatus` and translations**

Render coverage status in the hero proof area. When `complete` is false, use the exact English message `Coverage incomplete: {healthy} of {required} universes healthy` and a Hebrew equivalent. Do not use “complete,” “all,” or “no misses” when the summary is incomplete.

- [ ] **Step 7: Style the new controls and status without layout regression**

Add responsive grid rules for `.filter-dimensions`, `.athlete-tags`, `.coverage-status`, and `.leaderboard-group`. At widths below 680px, controls stack in one column and maintain a minimum 44px interactive height. RTL uses logical properties rather than left/right overrides.

- [ ] **Step 8: Run UI tests**

Run: `pnpm vitest run tests/unit/athlete-list.test.tsx tests/unit/views.test.tsx tests/unit/i18n.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit the coverage-aware interface**

```bash
git add src/app src/components src/services/rankings.ts src/i18n/messages.ts tests/unit/athlete-list.test.tsx tests/unit/views.test.tsx tests/unit/i18n.test.tsx
git commit -m "feat: expose athlete tiers and coverage health"
```

## Task 8: Prove privacy, responsiveness, and migration safety

**Files:**
- Modify: `tests/unit/privacy.test.ts`
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `docs/inclusion-policy.md`
- Modify: `docs/data-sources.md`
- Modify: `README.md`

- [ ] **Step 1: Add failing public-artifact privacy and browser tests**

Extend `privacy.test.ts` to read `public/data/snapshot.json` and the built source tree, asserting that `danny-wolf`, `zeev-buium`, `reviewerNote`, and full birth-date fields are absent. Extend Playwright coverage to open each new mobile filter, switch to Hebrew, open a profile, and verify no page-level horizontal overflow.

- [ ] **Step 2: Run privacy and browser tests against the current documentation state**

Run: `pnpm vitest run tests/unit/privacy.test.ts && pnpm test:e2e`

Expected: tests pass after Tasks 1–7; if the built artifact exposes a review field, this step fails and the importing module must be corrected before proceeding.

- [ ] **Step 3: Update trust and source documentation**

Document the four tiers, citizenship/representation distinction, 90-day free-agent rule, circuit activity window, candidate promotion requirements, media-rights behavior, and coverage-ledger semantics. Update the source register to state that ATP, IIHF, IFA, and FIBA universes are partially researched but not yet reconciled into a complete census.

README commands remain:

```bash
pnpm test
pnpm lint
pnpm sync:data
pnpm validate:images
pnpm build
pnpm test:e2e
```

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm test && pnpm lint && pnpm sync:data && pnpm validate:images && pnpm build && pnpm test:e2e`

Expected: all unit tests pass, lint exits zero, three verified athletes are written, zero unlicensed images are validated, the production build succeeds, and both responsive browser tests pass.

- [ ] **Step 5: Inspect the final diff for generated or review-data leaks**

Run: `git diff --check && git status --short && rg -n "danny-wolf|zeev-buium|reviewerNote" public src`

Expected: `git diff --check` produces no output; `git status --short` lists only intended implementation and documentation files; the ripgrep command returns no matches in `public` or `src`.

- [ ] **Step 6: Commit the verified foundation**

```bash
git add README.md docs/inclusion-policy.md docs/data-sources.md tests/unit/privacy.test.ts tests/e2e/responsive.spec.ts public/data/snapshot.json
git commit -m "docs: document verified coverage foundation"
```
