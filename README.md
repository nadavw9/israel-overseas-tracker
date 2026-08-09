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
pnpm validate:images
pnpm build
pnpm test:e2e
```

`pnpm sync:data` requests the ESPN season-statistics endpoint. Before accepting statistics, it validates that ESPN response reference URLs bind the configured external athlete ID, season, and regular-season type. It writes the public snapshot from the verified registry; a provider failure can retain a still-valid verified observation as `stale`, and otherwise fails closed.

## Trust and scope

- The public snapshot is separate from the private review registry. Candidates and review notes never appear in public counts, filters, rankings, map locations, or browser artifacts.
- The current review snapshot contains 18 verified athletes. The coverage ledger is currently incomplete, so this is not a complete census and its visible summary is not a promise of no missed athletes.
- Snapshot generation time is not a claim that every provider refreshed successfully. Each public record keeps its own source URL, source timestamp, and freshness state.
- Identity-only athletes are published without invented zero statistics.
- The public seed has zero approved athlete portraits. Cards and profiles use neutral local fallbacks until rights metadata approves an image.

See [the inclusion policy](docs/inclusion-policy.md) and [data-source register](docs/data-sources.md) for the detailed rules and current source limitations.

## Privacy and external services

The default athlete view uses no analytics and no third-party font service. Opening the map requests CARTO tiles that include OpenStreetMap data; attribution remains visible in the map. Deployments should document or proxy that external request when their privacy policy requires it.

## Automation

`.github/workflows/sync-data.yml` runs validation, refresh, image checks, tests, lint, and a production build every six hours and on demand. It uploads the generated snapshot as an artifact; it does not commit or deploy automatically.

This independent project is not affiliated with the athletes, clubs, leagues, ESPN, NBA, NHL, Ajax, CARTO, or OpenStreetMap.
