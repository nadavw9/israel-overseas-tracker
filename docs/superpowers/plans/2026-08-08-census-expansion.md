# Verified Census Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the public tracker from three to eighteen independently verified athletes while introducing an honest international-circuit participation model, optional statistics, current-season affiliations, and bounded coverage accounting.

**Architecture:** A public athlete will require verified eligibility plus exactly one current participation variant: a team affiliation or an international-circuit activity. Provider bindings become optional and describe a performance observation independently of the athlete's current affiliation season; missing or failed statistics produce an explicit unavailable state without removing a verified identity from the census. Official roster and tour pages are manual evidence inputs, while only explicitly integrated adapters fetch statistics.

**Tech Stack:** TypeScript 6, React 19, Zod 4, Vitest, Playwright, Vite, JSON registry files.

---

## Verified scope and exclusions

The implementation uses evidence checked on 2026-08-08.

- Publish five ATP athletes independently corroborated by the ATP ISR ranking universe and the Israel Tennis Association Davis Cup roster: Amit Vales, Orel Kimhi, Ofek Shimanov, Daniel Cukierman, and Yshai Oliel.
- Keep Jordan Hasson, Vladimir Bazilevskiy, and Tim Vaisman in the private queue until the second eligibility/name signal is approved. This still fully classifies the eight-row ATP ISR men universe.
- Publish Danny Wolf, Emanuel Sharp, Yarden Garzon, Gal Raviv, Omer Mayer, Noam Yaacov, Manor Solomon, Daniel Peretz, Talia Sommer, and Vital Kats from independent eligibility and current-team sources.
- Keep Shon Abaev private until primary Hebrew-name evidence is captured.
- Keep all nine overseas-signalled 2026 IIHF roster athletes private because tournament-time club fields do not prove a current 2026-27 affiliation. Mark Nir Tichon and Pnina Basov as affiliation conflicts; the other seven need current-club evidence.
- Mark Zeev Buium rejected: current Vancouver affiliation is verified, but official sources establish USA representation and no qualifying Israeli evidence was found.
- Do not ingest portraits, scrape ATP/WTA/UEFA pages, claim WTA completeness, or claim global sport completeness.

### Task 1: Model current participation and optional performance

**Files:**
- Modify: `src/domain/taxonomy.ts`
- Modify: `src/domain/registry.ts`
- Modify: `src/domain/athlete.ts`
- Modify: `src/data/registry.ts`
- Create: `data/registry/circuit-activities.json`
- Modify: `tests/fixtures/registry.ts`
- Modify: `tests/unit/registry-schema.test.ts`
- Modify: `tests/unit/registry.test.ts`
- Modify: `tests/unit/athlete-schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests proving these invariants:

```ts
it('publishes a circuit athlete with verified activity and no team affiliation', () => {
  const bundle = circuitRegistryFixture()
  const [athlete] = compileRegistryBundle(bundle, '2026-08-08T08:00:00.000Z')
  expect(athlete).toMatchObject({
    id: 'athlete-one',
    participation: { kind: 'circuit-activity', activity: { circuit: 'ATP', discipline: 'singles' } },
  })
  expect(athlete).not.toHaveProperty('affiliation')
})

it.each(['neither', 'both'])('rejects %s participation for a public athlete', (variant) => {
  expect(() => compileRegistryBundle(invalidParticipationBundle(variant), asOf)).toThrow(/participation/i)
})

it('publishes a verified identity without a provider binding', () => {
  const bundle = verifiedTeamBundle({ providerBindings: [] })
  expect(compileRegistryBundle(bundle, asOf)).toHaveLength(1)
})
```

Also test: `nationality` eligibility is accepted; circuit activity is rejected when future-dated, stale beyond 365 days, pending/conflicting, duplicated, or attached to a non-circuit athlete; current team athletes still require exactly one current primary foreign affiliation; provider-binding season is required and canonical for NBA; unknown nested keys fail.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/unit/registry-schema.test.ts tests/unit/registry.test.ts tests/unit/athlete-schema.test.ts`

Expected: failures for missing `circuitActivities`, missing `participation`, required provider bindings, and unavailable-performance shape.

- [ ] **Step 3: Add strict participation schemas**

Add `nationality` to `eligibilityBasisSchema`. Add a strict `circuitActivitySchema` with:

```ts
{
  id: recordIdSchema,
  athleteId: athleteIdSchema,
  circuit: z.enum(['ATP', 'WTA', 'ITF']),
  discipline: z.enum(['singles', 'doubles']),
  competition: nonEmptyStringSchema,
  season: nonEmptyStringSchema,
  activityType: z.enum(['ranking', 'sanctioned-result']),
  effectiveAt: z.iso.datetime(),
  status: verificationStatusSchema,
  source: sourceSchema,
}
```

Add `circuitActivities` to the registry bundle, duplicate-ID checks, reference checks, causal timestamps, and the 365-day circuit activity window. Add required `season` to provider bindings. Compile exactly one `participation` union:

```ts
type CurrentParticipation =
  | { kind: 'team-affiliation'; affiliation: Affiliation }
  | { kind: 'circuit-activity'; activity: CircuitActivity }
```

Public `international-circuit` athletes must select a verified current circuit activity and no current team affiliation. Other public tiers must select exactly one current team affiliation and no circuit activity. A provider binding is selected when present but no longer gates publication.

- [ ] **Step 4: Make public performance explicitly optional**

Change the public performance union so unavailable observations do not pretend to have a statistics source:

```ts
type PublicPerformance =
  | {
      status: 'available'
      state: 'live' | 'provisional' | 'final' | 'corrected' | 'stale'
      competition: string
      season: string
      stats: AthleteStats
      source: PerformanceSource
    }
  | {
      status: 'unavailable'
      state: 'unavailable'
      stats: null
      reason: 'not-integrated' | 'provider-unavailable'
    }
```

Add strict public circuit-activity output and require exactly one public participation variant. Keep competition equality between an available performance and its binding context, but remove the false requirement that performance season equal current affiliation season.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run tests/unit/registry-schema.test.ts tests/unit/registry.test.ts tests/unit/athlete-schema.test.ts`

Expected: all focused tests pass.

Commit: `feat: model circuit participation and optional performance`

### Task 2: Compile resilient snapshots and independent seasons

**Files:**
- Modify: `src/services/snapshot.ts`
- Modify: `scripts/sync-data.ts`
- Modify: `scripts/providers/types.ts`
- Modify: `scripts/providers/nba.ts`
- Modify: `scripts/providers/nhl.ts`
- Modify: `tests/unit/sync-data.test.ts`
- Modify: `tests/unit/providers.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

Add tests for the following behavior:

```ts
it('keeps an identity-only athlete when no provider binding exists', async () => {
  const [athlete] = await buildSnapshot({
    entries: [entryWithoutBinding], previous: { athletes: [] }, coverage,
    fetchRecord: async () => { throw new Error('must not fetch') }, now,
  }).then((snapshot) => snapshot.athletes)
  expect(athlete.performance).toEqual({
    status: 'unavailable', state: 'unavailable', stats: null, reason: 'not-integrated',
  })
})

it('isolates an expired provider failure to the affected athlete', async () => {
  const snapshot = await buildSnapshot({ entries: [working, failing], previous, coverage, fetchRecord, now })
  expect(snapshot.athletes).toHaveLength(2)
  expect(snapshot.athletes.find(({ id }) => id === failing.id)?.performance.reason)
    .toBe('provider-unavailable')
})
```

Also test that a 2025-26 provider binding is valid with a current 2026-27 affiliation, the ESPN URL uses `binding.season`, provider context must equal binding sport/competition/season, circuit output contains no fake organization/location, and the exact 48-hour stale boundary is preserved.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/sync-data.test.ts tests/unit/providers.test.ts`

Expected: failures because snapshot compilation assumes every entry has an affiliation/binding and aborts on provider failure.

- [ ] **Step 3: Implement binding-driven provider resolution**

Use `entry.binding.season` for ESPN/NHL season parsing. Do not infer a statistics season from current affiliation. Validate each result against the binding. Only compare `observedOrganization` with a team affiliation when one exists.

Build public participation fields from the compiled union. For entries without a binding, skip fetching and emit `reason: 'not-integrated'`. On fetch failure, use a matching recent verified observation only inside the 48-hour boundary; otherwise emit `reason: 'provider-unavailable'` for that athlete instead of rejecting the entire snapshot.

- [ ] **Step 4: Harden legacy migration and causal validation**

Retain legacy history only when it remains public, eligibility-verified, non-null, causal, and schema-compatible. Unavailable performance has no source timestamp; available performance still cannot be future-dated.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run tests/unit/sync-data.test.ts tests/unit/providers.test.ts`

Expected: all focused tests pass.

Commit: `feat: isolate provider failures from verified identities`

### Task 3: Render team and circuit athletes accurately

**Files:**
- Create: `src/services/participation.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/AthleteCard.tsx`
- Modify: `src/components/AthleteDrawer.tsx`
- Modify: `src/components/AthleteMap.tsx`
- Modify: `src/components/FreshnessBadge.tsx`
- Modify: `src/components/Leaderboard.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `tests/unit/athlete-list.test.tsx`
- Modify: `tests/unit/freshness-badge.test.tsx`
- Modify: `tests/unit/i18n.test.tsx`
- Modify: `tests/unit/views.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests proving that a circuit athlete:

```ts
expect(screen.getByText('ATP / ITF international circuit')).toBeInTheDocument()
expect(screen.queryByText(/united kingdom/i)).not.toBeInTheDocument()
expect(screen.queryByRole('link', { name: /performance source/i })).not.toBeInTheDocument()
```

Also test that circuit athletes remain searchable/filterable, are omitted from the fixed-location map, unavailable performance shows identity/activity verification without a fabricated checked date, provider-unavailable and not-integrated wording differ, and the hero/rankings no longer hard-code `2025-26` when the registry contains mixed seasons.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/athlete-list.test.tsx tests/unit/freshness-badge.test.tsx tests/unit/i18n.test.tsx tests/unit/views.test.tsx`

Expected: failures from direct `athlete.affiliation` access and the old unavailable-performance source requirement.

- [ ] **Step 3: Add participation display helpers**

Create helpers that return display title, competition, season, source, and optional fixed location from either union branch. Team affiliations expose club/location. Circuit activities expose circuit/competition/season but never synthesize a club or map point.

- [ ] **Step 4: Update the application and copy**

Use the helpers in search, cards, drawer, and map. Only render a performance source link for available performance. Show the participation source separately for both team and circuit athletes. Replace hard-coded season copy with `Current verified registry` and `Latest sourced performance`; provide accurate English and Hebrew strings for nationality, circuit activity, provider unavailable, and not integrated.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run tests/unit/athlete-list.test.tsx tests/unit/freshness-badge.test.tsx tests/unit/i18n.test.tsx tests/unit/views.test.tsx`

Expected: all focused tests pass.

Commit: `feat: render current team and circuit participation`

### Task 4: Reconcile and publish the verified expansion batch

**Files:**
- Modify: `data/registry/athletes.json`
- Modify: `data/registry/evidence.json`
- Modify: `data/registry/affiliations.json`
- Modify: `data/registry/provider-bindings.json`
- Modify: `data/registry/circuit-activities.json`
- Modify: `data/review/candidates.json`
- Modify: `data/curated-stats.json`
- Modify: `data/coverage/ledger.json`
- Modify: `docs/inclusion-policy.md`
- Modify: `docs/data-sources.md`
- Create: `docs/sports-data-strategy.md`
- Modify: `tests/unit/registry.test.ts`
- Modify: `tests/unit/coverage.test.ts`
- Modify: `tests/unit/privacy.test.ts`

- [ ] **Step 1: Write failing census assertions**

Assert the exact public IDs and private dispositions. The final public IDs are:

```ts
[
  'deni-avdija', 'ben-saraf', 'danny-wolf', 'emanuel-sharp',
  'yarden-garzon', 'gal-raviv', 'omer-mayer', 'noam-yaacov',
  'oscar-gloukh', 'manor-solomon', 'daniel-peretz', 'talia-sommer',
  'vital-kats', 'amit-vales', 'orel-kimhi', 'ofek-shimanov',
  'daniel-cukierman', 'yshai-oliel',
]
```

Assert ATP coverage is `healthy`, `observed: 8`, `matched: 5`, `newCandidates: 3`, `conflicts: 0`; the complete flag remains false because other declared universes are incomplete. Assert public and private IDs never overlap.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/registry.test.ts tests/unit/coverage.test.ts tests/unit/privacy.test.ts`

Expected: failures because the registry still has three public athletes and ATP coverage is partial.

- [ ] **Step 3: Add the verified public records**

Use `2026-08-08T08:00:00.000Z` as the research retrieval watermark. Update existing current affiliations to 2026-27 where the official club page remains current. Preserve Deni, Ben, and Danny's 2025-26 NBA performance bindings independently from their 2026-27 team affiliations. Add no provider binding for identity-only athletes.

For every new record, keep eligibility and participation provenance independent. Use official FIBA/IFA/ITA evidence and current NBA, club, or university rosters listed in `docs/data-sources.md`. Do not add media records.

- [ ] **Step 4: Reconcile the private queue**

Remove promoted Danny Wolf. Add Jordan Hasson, Vladimir Bazilevskiy, Tim Vaisman, Shon Abaev, the nine current-affiliation-unresolved IIHF players, and explicit reviewer notes. Mark Nir Tichon and Pnina Basov `affiliation-conflict`; mark Zeev Buium `rejected`. Allow a private candidate's Hebrew name to be absent until verified, and update privacy tests to scan optional names safely.

- [ ] **Step 5: Publish the source/metric investigation**

`docs/sports-data-strategy.md` must document, for basketball, football, tennis, and hockey:

- census discovery universes and separate eligibility/affiliation sources;
- recommended display metrics (basketball GP/PPG/RPG/APG; football APP/G/A; tennis rank/points/YTD W-L only after licensed access; hockey GP/G/A/PTS);
- refresh class (`live`, `near-live`, scheduled, manual), current integration status, and fail-closed behavior;
- licensing risk: ATP, WTA, UEFA, NHL, and ESPN pages/endpoints are not permission for bulk republication;
- licensed options such as Sportradar Tennis and Stats Perform/Opta, without claiming a contract exists;
- next bounded universes: WTA ISR, IFA men/women, per-event FIBA rosters, and IIHF men/women current-club reconciliation.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run tests/unit/registry.test.ts tests/unit/coverage.test.ts tests/unit/privacy.test.ts`

Expected: all focused tests pass and privacy build artifacts contain no review records.

Commit: `feat: publish first verified census expansion`

### Task 5: Regenerate, verify, and exercise the review build

**Files:**
- Modify: `public/data/snapshot.json`
- Modify if required: `public/images/athletes/manifest.json`
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Add end-to-end coverage**

Exercise one team athlete, one circuit athlete, one woman, sport/gender/tier filters, circuit source links, rankings exclusion for identity-only records, and the map's omission of locationless circuit athletes. Assert the snapshot reports 18 verified athletes and incomplete coverage without calling it a complete census.

- [ ] **Step 2: Run the full unit suite**

Run: `pnpm test`

Expected: every Vitest file passes.

- [ ] **Step 3: Refresh the snapshot and validate media**

Run: `pnpm sync:data`

Expected: writes exactly 18 public athletes. Provider failures may remove only the affected performance, never the athlete identity.

Run: `pnpm validate:images`

Expected: zero unapproved images and exact snapshot/manifest binding.

- [ ] **Step 4: Run static and browser verification**

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm test:e2e`

Expected: all commands pass; no private candidates or full birth dates appear in `dist`.

- [ ] **Step 5: Verify the worktree and commit**

Run: `git diff --check`

Run: `git status --short`

Expected before commit: only intended census-expansion files are modified.

Commit: `test: verify expanded overseas registry`

---

## Self-review

- Spec coverage: participation truthfulness, optional statistics, season decoupling, exact ATP reconciliation, independently sourced team promotions, private unresolved cases, coverage honesty, licensing limits, UI support, privacy, and E2E verification all map to tasks above.
- Placeholder scan: every implementation and test step is concrete.
- Type consistency: registry compilation and public output both use the same team/circuit union; provider binding owns performance season; unavailable performance has no source; UI reads participation through shared helpers.
