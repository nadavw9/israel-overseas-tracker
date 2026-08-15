# Sports data strategy

Checked 8-14 August 2026. This document separates census discovery, eligibility, current participation, and performance observations. Each concern has independent provenance and may fail independently.

## Refresh classes

- `live`: event-state updates measured in seconds or minutes from a contracted live feed. Nothing in the current tracker is live.
- `near-live`: post-event or same-day updates from a licensed or explicitly permitted feed.
- `scheduled`: automated snapshots on an explicit interval, with identity, competition, season, and source validation.
- `manual`: a reviewer records evidence from an official roster, transaction, federation, or circuit page at a retrieval watermark.

The current census and participation registry is manual. ESPN NBA performance collection is scheduled, not live play-by-play. Any future feed must preserve observed time, provider identity, competition, and season.

## Operational performance refresh

The fail-closed worker runs from `.github/workflows/refresh-performance.yml` once nightly after the Israeli day closes (22:30 UTC) and can also be started manually with `pnpm refresh:performance`. It polls only adapters with an approved binding and permitted access, writes `public/data/snapshot.json`, and atomically writes `public/data/refresh-manifest.json`. The manifest records the generation time, provider attempts, successes, failures, skips, duration, and the number of verified athletes intentionally skipped because they have no binding.

The nightly schedule is a bounded end-of-day polling SLA, not a claim of second-by-second live coverage. Live or near-live behavior is only possible when a licensed provider and competition-specific entitlement exist. The current public snapshot has 37 verified athletes, four adapter-bound records, and three numeric performance records; the remaining 33 are still published as identity records with explicit `not-integrated` performance status. A hosting deployment must publish the generated artifact after the workflow succeeds; the repository workflow intentionally does not commit or deploy data on its own.

### First football provider: Sportradar Soccer

The first production adapter targets Sportradar Soccer v4 seasonal competitor statistics. The endpoint returns team context and player season totals, including appearances, goals, and assists, and documents a 30-second cache/update interval for this feed. The adapter accepts a verified composite binding in the form `sr:season:<id>|sr:competitor:<id>|sr:player:<id>`, checks all three identifiers and the provider's player name, and sends the API key only in the `x-api-key` header. It never calls the provider when `SPORTRADAR_SOCCER_API_KEY` is absent.

Before creating a binding, use Sportradar's [account setup](https://developer.sportradar.com/football/docs/football-ig-account-setup), [Soccer v4 seasonal-statistics reference](https://developer.sportradar.com/soccer/reference/soccer-seasonal-competitor-statistics), and [coverage matrix](https://coverage-matrix.sportradar.com/) to confirm the target competition, women’s coverage, player-statistics entitlement, retention/caching rights, display rights, rate limits, and production access level. The workflow reads `SPORTRADAR_SOCCER_API_KEY` from a deployment secret and uses `SPORTRADAR_SOCCER_ACCESS_LEVEL=production`; no credential is stored in this repository.

Stats Perform/Opta remains the secondary football vendor to evaluate through its [official contact channel](https://www.statsperform.com/contact/). Do not add an Opta adapter or publish Opta-derived values until the contract specifies the same identity, competition, season, caching, and display permissions.

### Free-first fallback: API-Football

API-Football currently lists a $0 plan with 100 requests per day and player statistics included, but notes that free seasons and available data are limited and may change. The adapter uses one request per verified player-season binding, so it is compatible with a nightly refresh of the current football census but not a 30-minute poll. The key is read from `API_FOOTBALL_KEY`; no key or binding means no request and no published totals. Before public deployment, confirm the provider's current terms and each target competition's coverage in its [coverage list](https://www.api-football.com/coverage).

## Sport matrix

| Sport | Bounded discovery and verification sources | Recommended public metrics | Target refresh | Current integration | Fail-closed behavior |
| --- | --- | --- | --- | --- | --- |
| Basketball | Per-event FIBA Israel rosters/player records for eligibility; current NBA, club, and university rosters for affiliation | GP, PPG, RPG, APG | Near-live or daily scheduled after licensed/approved access; manual roster checks | Three 2025-26 ESPN NBA bindings; other verified athletes are identity-only | Provider failure preserves the athlete. Reuse only an exact matching observation within 48 hours; otherwise show `provider-unavailable`. No binding means `not-integrated`. |
| Football | IFA senior men and women rosters for eligibility; current club rosters and official transfers for affiliation | APP, G, A | Near-live after a licensed statistics feed; weekly/manual roster reconciliation | IFA senior men and women identities are enumerated into public matches plus review candidates. Twelve IFA senior men roster rows and two IFA senior women roster rows are public; seven additional targeted overseas football men are public from official eligibility and club sources; 34 senior-roster identities remain in review. No football totals feed is integrated | Never infer totals from news or carry totals across club, competition, or season changes. Publish unavailable performance without a statistics source. |
| Tennis | ATP ISR men and WTA numeric-ranking ISR rows for circuit discovery; ITA/Davis, Billie Jean King Cup, federation, or equivalent evidence for independent eligibility | Rank, points, YTD W-L only after licensed access | Near-live/daily if licensed; weekly manual activity check | Current ATP activity for five independently corroborated men and WTA activity for three independently corroborated women; one WTA row remains private; no numeric performance data | Never model a tour as a club or fixed location. No scraping or copied rank/points/W-L. If licensed data is absent, publish only sourced circuit activity. |
| Hockey | IIHF Israel men and women event rosters for eligibility; current foreign-club rosters for affiliation | GP, G, A, PTS | Near-live/daily after licensed or explicitly permitted access; manual club reconciliation | No public hockey athletes or active statistics bindings in this batch | Tournament-time club fields do not establish current affiliation. Unresolved or conflicting cases remain private; statistics cannot promote a candidate. |

## Census pipeline

1. Enumerate a named, bounded universe and record its attempt in the coverage ledger.
2. Create private candidates for new identities; never publish discovery output directly.
3. Verify eligibility from a federation, governing-body, or equivalent primary source.
4. Verify a current overseas team affiliation or a qualifying circuit activity independently.
5. Publish the identity even when no statistics binding exists; emit the explicit `not-integrated` state.
6. Connect a performance adapter only after provider identity, sport, competition, season, access rights, and output metrics are approved.

The coverage ledger is honest about boundaries. A healthy ATP-men entry means its eight observed rows were classified; it does not establish junior, doubles, team-sport, or global completeness. The healthy WTA entry means only that the four 3 August 2026 numeric-ranking ISR rows were classified into three public matches and one private review candidate. The partial IFA entries now classify all official senior-squad rows into public matches or review candidates, but they remain partial because current foreign-club verification is still missing for non-public rows.

## Access and licensing risk

Public ATP, WTA, UEFA, NHL, and ESPN pages or endpoints are useful for manual verification, but public access is not permission for bulk retrieval, storage, or republication. The tracker must not add a scraper or numerical feed merely because a page can be requested. Before production use, record the contract or written terms that permit the intended refresh rate, fields, caching, display, and retention.

Potential licensed options include Sportradar Tennis for tennis and Stats Perform/Opta for football and multi-sport coverage. These are evaluation candidates only; this project does not claim that a contract, entitlement, or production feed exists. Provider selection should be based on Israel/nationality coverage, current-team identifiers, historical corrections, women's competitions, college coverage, service-level terms, caching rights, and cost.

## Next bounded investigations

- Promote or reject Sofiia Nagornaia from the WTA ISR numeric-ranking universe only after independent eligibility and localized-name corroboration.
- Promote or reject the remaining 34 IFA senior men/women review candidates only after current foreign-club evidence and localized names are independently verified.
- Turn the targeted non-IFA football additions into bounded league/country sweeps, starting with official MLS, Serie A/Serie B, Ligue 1/Ligue 2, Belgian, Austrian, Dutch, and Japanese club rosters plus IFA identity checks.
- Process FIBA rosters per named event, age group, and gender rather than treating the mixed team landing page as one census.
- Reconcile IIHF senior men's and women's overseas-signalled players against current club rosters; resolve the two recorded affiliation conflicts before publication.
- Maintain an explicit rejected disposition when official evidence contradicts the eligibility policy.

No next step may weaken the publication rule: eligibility and current overseas participation must remain independently sourced, and missing performance data must never erase a verified athlete identity.
