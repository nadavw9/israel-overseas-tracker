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

`pnpm sync:data` and `pnpm refresh:performance` both write the public snapshot and the refresh health manifest. Before accepting statistics, the ESPN adapter validates that response reference URLs bind the configured external athlete ID, season, and regular-season type. A provider failure can retain a still-valid verified observation as `stale`, and otherwise fails closed. Every verified athlete remains in the snapshot; athletes without a permitted performance binding are explicitly marked `not-integrated` rather than given invented totals.

The first licensed-football integration path is prepared for Sportradar Soccer v4. Add the provider-issued key as `SPORTRADAR_SOCCER_API_KEY` in the deployment secret store and keep `SPORTRADAR_SOCCER_ACCESS_LEVEL=production`; do not put either value in source control. A binding is added only after the provider confirms competition/player coverage and the contract permits the intended caching and display.

## Trust and scope

- The public snapshot is separate from the private review registry. Candidates and review notes never appear in public counts, filters, rankings, map locations, or browser artifacts.
- The current public snapshot contains 37 verified athletes. The coverage ledger is currently incomplete, so this is not a complete census and its visible summary is not a promise of no missed athletes.
- Snapshot generation time is not a claim that every provider refreshed successfully. Each public record keeps its own source URL, source timestamp, and freshness state.
- Identity-only athletes are published without invented zero statistics.
- The public seed has zero approved athlete portraits. Cards and profiles use neutral local fallbacks until rights metadata approves an image.

See [the inclusion policy](docs/inclusion-policy.md) and [data-source register](docs/data-sources.md) for the detailed rules and current source limitations.

## Privacy and external services

The default athlete view uses no analytics and no third-party font service. Opening the map requests CARTO tiles that include OpenStreetMap data; attribution remains visible in the map. Deployments should document or proxy that external request when their privacy policy requires it.

## Automation

`.github/workflows/refresh-performance.yml` runs the permitted performance adapters every 30 minutes and uploads both `snapshot.json` and `refresh-manifest.json` as an artifact. `.github/workflows/sync-data.yml` performs the broader verified-registry refresh every six hours. These workflows do not commit or deploy automatically; connect the artifact to the chosen hosting/deployment system before treating the public site as continuously updated.

This independent project is not affiliated with the athletes, clubs, leagues, ESPN, NBA, NHL, Ajax, CARTO, or OpenStreetMap.
