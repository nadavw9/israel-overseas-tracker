# Live performance refresh design

Status: proposed

## Goal

Every public athlete must have an automatically maintained performance state. A
record is considered current only when its observation is inside the policy
window for that sport and competition. When a provider is missing or fails, the
athlete remains visible but the snapshot must say `not-integrated` or
`provider-unavailable`; it must never present an old value as current.

“Constantly updated” means sport-appropriate freshness: live or near-live while
an event is active when a permitted feed supports it, scheduled refreshes
between events, and roster/census reconciliation on a slower schedule. The
system does not promise second-by-second updates for sports or competitions
without an entitled live feed.

## Options considered

1. **Browser-side provider calls.** Fast to prototype, but leaks credentials,
   creates inconsistent snapshots, and makes rate limits and licensing
   impossible to control. Rejected.
2. **One monolithic scraper.** Broad apparent coverage, but brittle selectors,
   unclear rights, and no reliable identity or correction handling. Rejected.
3. **Server-side adapter and snapshot worker (recommended).** Each permitted
   provider implements one contract; a worker validates and atomically publishes
   a snapshot; the UI reads only the validated snapshot. This keeps provider
   credentials private, makes outages explicit, and lets each sport use its
   appropriate cadence.

## Architecture

### Provider adapters

Add a provider adapter boundary under `scripts/providers`. An adapter receives a
verified registry entry and a refresh context, then returns a normalized
`ProviderResult` containing athlete identity, sport, competition, season,
observation state, stats, source URL, and retrieval time. The existing ESPN NBA,
NHL, and curated adapters remain implementations of the same boundary.

Provider adapters must validate the upstream identity before returning data:
external ID, normalized athlete name, competition, season, and (for team sports)
the observed organization. A provider response can never change the public
registry or promote a review candidate.

### Refresh policy

Create a checked-in policy table keyed by sport and competition class. Each row
defines the target cadence, event-active cadence when available, retention
window, and whether a licensed provider is required. The initial defaults are:

- basketball: near-live during games, daily outside games;
- football: near-live after matches, daily during active competitions;
- hockey: near-live during games, daily during active competitions;
- tennis: event/ranking refresh when entitled, otherwise daily scheduled checks.

The policy is a freshness contract, not permission to scrape. A provider must
have written terms or a contract covering the intended fields, cadence, caching,
and display before it is enabled in production.

### Refresh worker and manifest

Add a `refresh-performance` command that:

1. loads the verified registry and refresh policy;
2. dispatches bound athletes to adapters with bounded concurrency;
3. validates every result against identity, competition, season, timestamp, and
   retention rules;
4. reuses an exact matching observation only while it remains inside the
   retention window, marking it `stale`;
5. otherwise emits `provider-unavailable` or `not-integrated`;
6. writes the snapshot atomically; and
7. writes a machine-readable refresh manifest containing per-provider attempts,
   successes, failures, latency, and the snapshot watermark.

The manifest is operational metadata and must not contain provider secrets or
private review candidates.

### Scheduling and deployment

Keep census/roster synchronization separate from performance refresh. The
existing six-hour workflow becomes the slower registry reconciliation job. A
second scheduled workflow runs performance refresh at the tightest cadence
allowed by the enabled providers; event-driven/live feeds can later call the
same worker through a secure endpoint. Secrets remain in the deployment
environment, never in the browser or repository.

## Public UI behavior

The current freshness badge and unavailable state remain the source of truth.
Extend them with a global “last refresh” status sourced from the manifest and a
provider-health detail view. Each athlete must show:

- the observation state (`live`, `provisional`, `final`, `corrected`, `stale`,
  or `unavailable`);
- provider/source and retrieval time when performance exists; and
- a clear reason when performance is unavailable.

No zeroes are synthesized for missing statistics. A failed provider must not
remove a verified athlete from the directory.

## Rollout

1. Extract the common adapter and refresh-policy contracts around the existing
   ESPN/NHL implementations.
2. Add deterministic fixture adapters and tests for success, identity mismatch,
   provider failure, stale retention, expired retention, and atomic writes.
3. Add the refresh manifest and CI command, then wire the scheduled workflow.
4. Add provider adapters only after access rights and identity mappings are
   recorded for each competition; expand football, college/international
   basketball, hockey, and tennis in separate bounded batches.
5. Add global provider-health UI and operational alerts once the first
   non-NBA provider is enabled.

## Acceptance criteria

- Every public athlete is represented by an explicit performance state on every
  generated snapshot.
- No observation older than its configured retention window is published as
  available or stale.
- Provider, competition, season, athlete identity, and retrieval time are
  validated before publication.
- Provider outages preserve athlete identity and expose an unavailable state.
- The worker can refresh all currently bound athletes without browser-side
  secrets or direct provider calls.
- Tests cover both successful refreshes and fail-closed behavior, and the
  workflow publishes a refresh manifest alongside the snapshot.
