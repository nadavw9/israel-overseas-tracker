# Live Performance Refresh Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral, fail-closed refresh worker that records refresh health and makes freshness policy explicit for every public athlete.

**Architecture:** The browser remains a snapshot consumer. A TypeScript worker loads the verified registry, dispatches bound athletes through typed provider adapters, validates results through the existing snapshot builder, writes the snapshot atomically, and writes a separate refresh manifest. Unsupported athletes remain `not-integrated`; provider outages become `provider-unavailable` or retained `stale` observations inside the retention window.

**Tech Stack:** TypeScript 6, Node 22, Zod 4, Vitest, GitHub Actions, existing Vite/React snapshot UI.

---

## Files and responsibilities

- Create `src/domain/refresh.ts`: cadence, retention, and manifest schemas.
- Create `data/refresh/policies.json`: checked-in sport/competition policy.
- Modify `scripts/providers/types.ts`: adapter contract, preserving `ProviderResult`.
- Create `scripts/providers/registry.ts`: provider ID to adapter map.
- Modify `scripts/sync-data.ts`: delegate fetching through the adapter map.
- Create `scripts/refresh/manifest.ts`: validated atomic manifest writes and summaries.
- Create `scripts/refresh-performance.ts`: scheduled worker entry point.
- Modify `package.json`, `.github/workflows/sync-data.yml`, and generated `public/data/refresh-manifest.json`.
- Modify `src/App.tsx`, `src/app/App.tsx`, `src/components/AppHeader.tsx`, `src/i18n/messages.ts`, and `src/app/styles.css` for global refresh status.
- Add/modify unit and browser tests plus `README.md` and `docs/sports-data-strategy.md`.

## Task 1: Define refresh policy and manifest contracts

**Files:** Create `src/domain/refresh.ts`, create `data/refresh/policies.json`, create `tests/unit/refresh-manifest.test.ts`.

- [ ] **Step 1: Write failing schema tests.** Test a valid policy row and reject zero cadence, non-positive retention, invalid access mode, and manifest totals where `succeeded + failed + skipped !== attempted`.

```ts
it('accepts an explicit cadence and retention policy', () => {
  expect(refreshPolicySchema.parse({
    id: 'basketball-nba', sport: 'basketball', competition: 'NBA',
    cadenceMinutes: 360, activeEventCadenceMinutes: 1,
    retentionHours: 48, access: 'licensed-or-permitted',
  })).toMatchObject({ retentionHours: 48 })
})
```

- [ ] **Step 2: Run `pnpm vitest run tests/unit/refresh-manifest.test.ts` and confirm it fails because the schemas do not exist.**
- [ ] **Step 3: Implement `refreshPolicySchema`, `refreshPolicySetSchema`, `refreshProviderAttemptSchema`, and `refreshManifestSchema` in `src/domain/refresh.ts`. Require positive integer cadences, positive retention, UTC ISO timestamps, and balanced provider totals.**
- [ ] **Step 4: Add these policy rows to `data/refresh/policies.json`: NBA 360/1 minutes with 48-hour retention, NHL 360/1 with 48-hour retention, football wildcard 1440/15 with 72-hour retention, and tennis wildcard 1440/15 with 72-hour retention. Use `licensed-or-permitted` access for each.**
- [ ] **Step 5: Run the focused test again and confirm it passes.**
- [ ] **Step 6: Commit with `git add src/domain/refresh.ts data/refresh/policies.json tests/unit/refresh-manifest.test.ts; git commit -m "feat: define refresh policy and manifest contracts"`.**

## Task 2: Introduce the provider adapter registry

**Files:** Modify `scripts/providers/types.ts` and `scripts/sync-data.ts`; create `scripts/providers/registry.ts`; modify `tests/unit/sync-data.test.ts`.

- [ ] **Step 1: Add a failing test that passes an injected adapter map to `fetchProviderRecord`, verifies dispatch by provider ID, rejects an unknown provider, and proves an unbound entry is never fetched.**

```ts
it('dispatches through the injected adapter map', async () => {
  const result = await fetchProviderRecord(entry, fakeFetch, new Date(generatedAt), {
    adapters: { 'espn-nba': async () => ({
      athleteId: entry.id, ...providerContext, stats: null, state: 'final',
      sourceUrl: 'https://example.com/provider', retrievedAt: generatedAt,
    }) },
  })
  expect(result.athleteId).toBe(entry.id)
})
```

- [ ] **Step 2: Run `pnpm vitest run tests/unit/sync-data.test.ts -t "adapter"` and confirm it fails because the injected registry is unsupported.**
- [ ] **Step 3: Define `ProviderFetchContext`, `ProviderAdapter`, and `ProviderAdapterMap` in `scripts/providers/types.ts`. Export `defaultProviderAdapters` from `scripts/providers/registry.ts`, wrapping the existing curated, ESPN NBA, and NHL branches.**
- [ ] **Step 4: Add an optional fourth `options` argument to `fetchProviderRecord`; default to `defaultProviderAdapters` so all current callers continue to work. Throw a clear error when the binding provider has no adapter.**
- [ ] **Step 5: Run `pnpm vitest run tests/unit/sync-data.test.ts` and confirm all provider fixtures pass.**
- [ ] **Step 6: Commit with `git add scripts/providers/types.ts scripts/providers/registry.ts scripts/sync-data.ts tests/unit/sync-data.test.ts; git commit -m "refactor: route performance fetches through adapters"`.**

## Task 3: Build the refresh manifest writer

**Files:** Create `scripts/refresh/manifest.ts`; modify `tests/unit/refresh-manifest.test.ts`.

- [ ] **Step 1: Write failing tests for an all-success summary, mixed success/failure/skipped counts, atomic replacement, schema rejection, and cleanup of temporary files.**

```ts
it('writes a validated manifest without a temporary file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'refresh-manifest-'))
  const target = join(directory, 'refresh-manifest.json')
  await writeRefreshManifestAtomically(target, {
    generatedAt, snapshotGeneratedAt: generatedAt, durationMs: 42,
    providers: [{ provider: 'espn-nba', attempted: 2, succeeded: 2, failed: 0, skipped: 0, durationMs: 42 }],
  })
  expect(await readdir(directory)).toEqual(['refresh-manifest.json'])
})
```

- [ ] **Step 2: Run `pnpm vitest run tests/unit/refresh-manifest.test.ts -t "writes"` and confirm it fails because the writer is absent.**
- [ ] **Step 3: Implement `writeRefreshManifestAtomically(path, manifest)` with Zod validation, a random temp filename, `sync()`, read-back validation, and replacement rename. Implement `summarizeProviderSettledResults` with deterministic provider sorting and balanced totals.**
- [ ] **Step 4: Run `pnpm vitest run tests/unit/refresh-manifest.test.ts` and confirm it passes.**
- [ ] **Step 5: Commit with `git add scripts/refresh/manifest.ts tests/unit/refresh-manifest.test.ts; git commit -m "feat: write refresh health manifests"`.**

## Task 4: Add the scheduled refresh worker

**Files:** Create `scripts/refresh-performance.ts`; modify `scripts/sync-data.ts` and `package.json`; modify `tests/unit/sync-data.test.ts`.

- [ ] **Step 1: Write failing worker tests proving every bound entry is attempted, unbound entries are counted as skipped, provider rejection preserves `provider-unavailable`, and both snapshot and manifest are written.**
- [ ] **Step 2: Run `pnpm vitest run tests/unit/sync-data.test.ts -t "performance refresh"` and confirm it fails because `runPerformanceRefresh` does not exist.**
- [ ] **Step 3: Refactor the sync internals into an injectable `runPerformanceRefresh` that accepts `now`, `fetcher`, snapshot path, manifest path, and adapter map. Use `buildSnapshot`/`writeSnapshotAtomically`, time each provider call, classify unbound entries as skipped, write the snapshot first, then the validated manifest, and return `{ snapshot, manifest }`.**
- [ ] **Step 4: Add the package script `"refresh:performance": "tsx scripts/refresh-performance.ts"` and make the CLI print the snapshot timestamp plus provider totals.**
- [ ] **Step 5: Run `pnpm vitest run tests/unit/sync-data.test.ts` and confirm it passes.**
- [ ] **Step 6: Commit with `git add scripts/refresh-performance.ts scripts/sync-data.ts package.json tests/unit/sync-data.test.ts; git commit -m "feat: add fail-closed performance refresh worker"`.**

## Task 5: Wire scheduled automation and generated output

**Files:** Modify `.github/workflows/sync-data.yml` and `README.md`; create `public/data/refresh-manifest.json`; modify `tests/unit/sync-data.test.ts`.

- [ ] **Step 1: Write a workflow contract test that reads the YAML and expects `pnpm refresh:performance`, manifest artifact upload, and no provider secret values in the file.**
- [ ] **Step 2: Run `pnpm vitest run tests/unit/sync-data.test.ts -t "workflow"` and confirm it fails.**
- [ ] **Step 3: Keep the existing six-hour census job and add a refresh job invoking `pnpm refresh:performance`, snapshot validation, and uploads for `public/data/snapshot.json` and `public/data/refresh-manifest.json`.**
- [ ] **Step 4: Document that workflow cadence is not a live-feed guarantee; effective freshness comes from each enabled provider and policy row.**
- [ ] **Step 5: Run `pnpm refresh:performance` and confirm it produces a validated manifest with current provider attempts and skipped counts.**
- [ ] **Step 6: Run `pnpm test`, `pnpm lint`, `pnpm validate:images`, `pnpm build`, and `pnpm test:e2e -- --reporter=line`; confirm all pass.**
- [ ] **Step 7: Commit with `git add .github/workflows/sync-data.yml public/data/refresh-manifest.json README.md tests/unit/sync-data.test.ts; git commit -m "ci: schedule performance refresh and publish health manifest"`.**

## Task 6: Expose global refresh health in the UI

**Files:** Modify `src/App.tsx`, `src/app/App.tsx`, `src/components/AppHeader.tsx`, `src/i18n/messages.ts`, and `src/app/styles.css`; modify `tests/unit/athlete-list.test.tsx` and `tests/e2e/responsive.spec.ts`.

- [ ] **Step 1: Write failing UI tests that mock `/data/refresh-manifest.json`, expect the header to show its generated time, and expect the directory to remain usable when the manifest request fails.**
- [ ] **Step 2: Run `pnpm vitest run tests/unit/athlete-list.test.tsx -t "refresh"` and confirm it fails because the app only loads `snapshot.json`.**
- [ ] **Step 3: Load the manifest in parallel with the snapshot, pass `null` on manifest failure, and render an English/Hebrew global status with generated time and unavailable fallback. Keep the existing athlete cards and filters independent from manifest availability.**
- [ ] **Step 4: Run `pnpm vitest run tests/unit/athlete-list.test.tsx` and `pnpm test:e2e -- --reporter=line`; confirm no new mobile or RTL overflow.**
- [ ] **Step 5: Commit with `git add src/App.tsx src/app/App.tsx src/components/AppHeader.tsx src/i18n/messages.ts src/app/styles.css tests/unit/athlete-list.test.tsx tests/e2e/responsive.spec.ts; git commit -m "feat: show global refresh health in the tracker"`.**

## Task 7: Close the operational loop

**Files:** Modify `docs/sports-data-strategy.md` and `README.md`; run all tests.

- [ ] **Step 1: Document the worker command, manifest fields, cadence policy, and current provider coverage. Explicitly state that unbound athletes receive no fabricated numbers and that provider failures preserve identity.**
- [ ] **Step 2: Run the complete verification sequence:** `pnpm test`, `pnpm lint`, `pnpm validate:images`, `pnpm refresh:performance`, `pnpm build`, `pnpm test:e2e -- --reporter=line`, and `git diff --check`. Confirm no temporary files remain.**
- [ ] **Step 3: Run a Node assertion that every snapshot athlete has a performance object, every available observation is not future-dated, and each manifest provider satisfies `succeeded + failed + skipped === attempted`.**
- [ ] **Step 4: Commit with `git add docs/sports-data-strategy.md README.md; git commit -m "docs: document automated refresh contract"`.**

## Future provider-expansion plans

This foundation does not invent provider integrations. Football, college and international basketball, hockey outside NHL, and tennis numeric feeds require separate bounded plans after access entitlement and identity mapping. Each future plan must add an adapter fixture, provider binding records, retention policy, and outage tests before enabling a provider in production.
