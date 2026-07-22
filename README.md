# Israel Overseas

A source-backed tracker for verified Israeli athletes competing abroad. The public app intentionally starts small: it publishes only athletes whose eligibility, current club, statistics, and imagery can be tied to reviewable sources.

## Current public coverage

- Deni Avdija — NBA statistics from ESPN; eligibility and image evidence from NBA sources.
- Ben Saraf — NBA statistics from ESPN; eligibility and image evidence from the NBA G League/NBA.
- Oscar Gloukh — identity and Ajax membership from Ajax. His season statistics remain unavailable until a suitable sourced feed is connected.

Danny Wolf and Zeev Buium are kept in the review registry and do not appear in public counts, rankings, or the map.

## Run locally

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Quality and data commands:

```bash
pnpm test
pnpm lint
pnpm sync:data
pnpm validate:images
pnpm build
```

`pnpm sync:data` verifies an ESPN athlete identity page before accepting its statistics response. If a provider fails, the generator preserves a previous verified record and marks it stale; it fails closed when no previous verified value exists.

## Trust model

- “Snapshot generated” is the build time, not a claim that every provider refreshed successfully.
- Every card shows its own source-check time and freshness state.
- Identity-only athletes never receive invented zero statistics.
- Public URLs must use HTTPS and generated data is validated with Zod before writing.
- Photos have separate source metadata and fall back to a labeled neutral icon.

See [the inclusion policy](docs/inclusion-policy.md) and [data-source register](docs/data-sources.md) for the detailed rules.

## Privacy and external services

The default athlete view uses no analytics and no third-party font service. Official athlete images load from the NBA or Ajax domains. Opening the map requests CARTO tiles that include OpenStreetMap data; attribution remains visible in the map. Deployments should document or proxy those requests if their privacy policy requires it.

## Automation

`.github/workflows/sync-data.yml` runs the validation, refresh, image check, tests, lint, and production build every six hours and on demand. It uploads the generated snapshot as an artifact; it does not commit or deploy automatically.

This independent project is not affiliated with the athletes, clubs, leagues, ESPN, NBA, NHL, Ajax, CARTO, or OpenStreetMap.
