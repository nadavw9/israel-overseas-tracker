# Israel Overseas

A source-backed tracker for verified Israeli athletes competing abroad. The public application intentionally starts small: it publishes only records that have passed the registry's eligibility and current-activity checks.

## Run locally

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Run the full local verification sequence with:

```bash
pnpm test
pnpm lint
pnpm sync:data
pnpm refresh:performance
pnpm validate:images
pnpm build
pnpm test:e2e
```

Run the current provider and source audits with:

```bash
pnpm check:providers -- --write
pnpm audit:sources -- --write
pnpm discover:media
pnpm discover:wikimedia
```

These commands write review-only reports under `data/review/`. Provider checks never print secrets. Source checks distinguish unavailable/blocked pages from confirmed 404/410 links. The media discovery report uses TheSportsDB's free metadata endpoint to find per-athlete image candidates, while `discover:wikimedia` searches Wikimedia Commons for exact-name images with CC/public-domain license signals. Every candidate remains `rightsStatus: review` until identity, reuse rights, and attribution are documented; review candidates never enter the public snapshot.

`pnpm sync:data` and `pnpm refresh:performance` both write the public snapshot and the refresh health manifest. Before accepting statistics, the ESPN adapters validate that response reference URLs bind the configured external athlete ID, season, and regular-season type. A provider failure can retain a still-valid verified observation as `stale`, and otherwise fails closed. Every verified athlete remains in the snapshot; athletes without a permitted performance binding are explicitly marked `not-integrated` rather than given invented totals.

The free-first football integration uses public ESPN team-roster feeds for eight verified current players. Each nightly fetch validates the league, team, season, player ID, and name before publishing provisional appearances, goals, and assists. API-Football remains available as a credential-gated fallback; its key is currently accepted, but a direct probe shows the Free plan rejects 2025+ player searches, so no current-season API-Football binding is published. Sportradar Soccer remains an optional higher-coverage adapter.

The college-basketball integration uses the same public ESPN identity boundary for Purdue and Miami, then reads the latest completed 2025-26 player totals. Omer Mayer and Gal Raviv are therefore labeled `final` for 2025-26 while their 2026-27 roster affiliations remain separate; no preseason 2026-27 zeroes are published.

The current provider comparison and free-tier decisions are recorded in [`docs/provider-research.md`](docs/provider-research.md).

The MLB lead is intentionally review-only: `data/review/mlb-coverage-audit.json` records Dean Kremer and the official stats probe, but no MLB totals are published until data-reuse permission is cleared.

For local testing, create `.env.local` in the repository root and add one line: `API_FOOTBALL_KEY=your_key_here`. This file is ignored by Git. Run `pnpm refresh:performance` after saving it; never paste the key into `src/`, `public/`, or the browser.

## Trust and scope

- The public snapshot is separate from the private review registry. Candidates and review notes never appear in public counts, filters, rankings, or browser artifacts.
- The current public snapshot contains 37 verified athletes. The coverage ledger is currently incomplete, so this is not a complete census and its visible summary is not a promise of no missed athletes.
- Snapshot generation time is not a claim that every provider refreshed successfully. Each public record keeps its own source URL, source timestamp, and freshness state.
- Identity-only athletes are published without invented zero statistics.
- The public snapshot currently has 20 approved Wikimedia Commons images with CC/public-domain metadata; the remaining 17 athletes use neutral local fallbacks until a rights-cleared image is found.

See [the inclusion policy](docs/inclusion-policy.md) and [data-source register](docs/data-sources.md) for the detailed rules and current source limitations.

## Privacy and external services

The tracker uses no analytics and no third-party font service. Athlete images are loaded only from approved, attributed sources recorded in the public snapshot.

## Automation

`.github/workflows/sync-data.yml` performs the broader verified-registry refresh at 20:17 UTC, followed by `.github/workflows/refresh-performance.yml` at 20:30 UTC. That is late evening in Israel throughout the year and keeps the free API-Football tier within its 100-request daily quota. Each workflow validates the generated snapshot, commits only changed public data, and pushes it to the default branch. `.github/workflows/deploy-pages.yml` then builds the repository-aware Vite bundle and publishes it to GitHub Pages. `API_FOOTBALL_KEY` must be stored as a GitHub Actions repository secret; optional provider credentials fail closed when absent.

This independent project is not affiliated with the athletes, clubs, leagues, ESPN, NBA, NHL, Ajax, CARTO, or OpenStreetMap.
