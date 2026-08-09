# Sports data strategy

Checked 8-9 August 2026. This document separates census discovery, eligibility, current participation, and performance observations. Each concern has independent provenance and may fail independently.

## Refresh classes

- `live`: event-state updates measured in seconds or minutes from a contracted live feed. Nothing in the current tracker is live.
- `near-live`: post-event or same-day updates from a licensed or explicitly permitted feed.
- `scheduled`: automated snapshots on an explicit interval, with identity, competition, season, and source validation.
- `manual`: a reviewer records evidence from an official roster, transaction, federation, or circuit page at a retrieval watermark.

The current census and participation registry is manual. ESPN NBA performance collection is scheduled, not live play-by-play. Any future feed must preserve observed time, provider identity, competition, and season.

## Sport matrix

| Sport | Bounded discovery and verification sources | Recommended public metrics | Target refresh | Current integration | Fail-closed behavior |
| --- | --- | --- | --- | --- | --- |
| Basketball | Per-event FIBA Israel rosters/player records for eligibility; current NBA, club, and university rosters for affiliation | GP, PPG, RPG, APG | Near-live or daily scheduled after licensed/approved access; manual roster checks | Three 2025-26 ESPN NBA bindings; other verified athletes are identity-only | Provider failure preserves the athlete. Reuse only an exact matching observation within 48 hours; otherwise show `provider-unavailable`. No binding means `not-integrated`. |
| Football | IFA senior men and women rosters for eligibility; current club rosters and official transfers for affiliation | APP, G, A | Near-live after a licensed statistics feed; weekly/manual roster reconciliation | No totals feed. Oscar's curated binding currently yields no public totals; all football athletes may be identity-only | Never infer totals from news or carry totals across club, competition, or season changes. Publish unavailable performance without a statistics source. |
| Tennis | ATP ISR men and WTA numeric-ranking ISR rows for circuit discovery; ITA/Davis, Billie Jean King Cup, federation, or equivalent evidence for independent eligibility | Rank, points, YTD W-L only after licensed access | Near-live/daily if licensed; weekly manual activity check | Current ATP activity only for five independently corroborated players; four WTA rows are private review candidates; no numeric performance data | Never model a tour as a club or fixed location. No scraping or copied rank/points/W-L. If licensed data is absent, publish only sourced circuit activity. |
| Hockey | IIHF Israel men and women event rosters for eligibility; current foreign-club rosters for affiliation | GP, G, A, PTS | Near-live/daily after licensed or explicitly permitted access; manual club reconciliation | No public hockey athletes or active statistics bindings in this batch | Tournament-time club fields do not establish current affiliation. Unresolved or conflicting cases remain private; statistics cannot promote a candidate. |

## Census pipeline

1. Enumerate a named, bounded universe and record its attempt in the coverage ledger.
2. Create private candidates for new identities; never publish discovery output directly.
3. Verify eligibility from a federation, governing-body, or equivalent primary source.
4. Verify a current overseas team affiliation or a qualifying circuit activity independently.
5. Publish the identity even when no statistics binding exists; emit the explicit `not-integrated` state.
6. Connect a performance adapter only after provider identity, sport, competition, season, access rights, and output metrics are approved.

The coverage ledger is honest about boundaries. A healthy ATP-men entry means its eight observed rows were classified; it does not establish WTA, junior, doubles, team-sport, or global completeness.

## Access and licensing risk

Public ATP, WTA, UEFA, NHL, and ESPN pages or endpoints are useful for manual verification, but public access is not permission for bulk retrieval, storage, or republication. The tracker must not add a scraper or numerical feed merely because a page can be requested. Before production use, record the contract or written terms that permit the intended refresh rate, fields, caching, display, and retention.

Potential licensed options include Sportradar Tennis for tennis and Stats Perform/Opta for football and multi-sport coverage. These are evaluation candidates only; this project does not claim that a contract, entitlement, or production feed exists. Provider selection should be based on Israel/nationality coverage, current-team identifiers, historical corrections, women's competitions, college coverage, service-level terms, caching rights, and cost.

## Next bounded investigations

- Promote or reject the four WTA ISR numeric-ranking candidates only after independent eligibility and localized-name corroboration.
- Reconcile every current IFA senior men's and women's roster identity against an official current foreign-club source.
- Process FIBA rosters per named event, age group, and gender rather than treating the mixed team landing page as one census.
- Reconcile IIHF senior men's and women's overseas-signalled players against current club rosters; resolve the two recorded affiliation conflicts before publication.
- Maintain an explicit rejected disposition when official evidence contradicts the eligibility policy.

No next step may weaken the publication rule: eligibility and current overseas participation must remain independently sourced, and missing performance data must never erase a verified athlete identity.
