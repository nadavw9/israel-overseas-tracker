# Data-source register

Checked 4 August 2026.

| Athlete | Public status | Eligibility / affiliation | Statistics | Image | Limitation |
| --- | --- | --- | --- | --- | --- |
| Deni Avdija | Verified | NBA player profile for citizenship evidence and current Portland affiliation | ESPN NBA 2025-26 regular-season statistics, identity- and season-bound to ESPN player `4683021` | Neutral fallback; none approved | Scheduled snapshot, not live play-by-play |
| Ben Saraf | Verified | FIBA U19 roster for represents-Israel evidence; NBA profile for current Brooklyn/NBA affiliation | ESPN NBA 2025-26 regular-season statistics, identity- and season-bound to ESPN player `5242502` | Neutral fallback; none approved | Scheduled snapshot, not live play-by-play |
| Oscar Gloukh | Verified | Ajax first-team profile for citizenship evidence and current affiliation | None published | Neutral fallback; none approved | Identity-only until a suitable statistics source is connected |
| Danny Wolf | Review | NBA profile under review | Not public | Not public | Excluded until Israeli eligibility evidence is approved |
| Zeev Buium | Review | NHL profile under review | Fixture-tested NHL adapter, not public | Not public | Excluded until Israeli eligibility evidence is approved |

The current public snapshot contains zero approved athlete images. Review URLs and records do not load in the public application.

## Source URLs

- Deni Avdija: <https://www.nba.com/player/1630166/deni-avdija>
- Ben Saraf NBA affiliation: <https://www.nba.com/player/1642879/ben-saraf>
- Ben Saraf FIBA U19 roster: <https://reports.fiba.basketball/reports/2025/FIBA%20U19%20Basketball%20World%20Cup/rosters.pdf>
- Oscar Gloukh: <https://english.ajax.nl/teams/ajax-1/oscar-gloukh>
- ESPN statistics endpoint: `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{seasonYear}/types/2/athletes/{providerId}/statistics?lang=en&region=us`
- NHL fixture-tested endpoint: `https://api-web.nhle.com/v1/player/{providerId}/landing`

The registry separates eligibility evidence, statistics provenance, and image provenance. A valid response from one source never substitutes for another concern. These are scheduled source checks, not live play-by-play feeds.

## Coverage universes

ATP, IIHF, IFA, and FIBA universes have been partially researched but have not been reconciled into a complete census.

- ATP covers Israeli-filtered ATP singles ranking entries.
- IIHF covers the 2026 Israel senior men's roster.
- IFA covers the 2026 Israel senior men's roster.
- FIBA covers Israel competition rosters across the declared mixed-gender universe.

The four seeded ledger entries are all `partial`: 0 of 4 are healthy. Their attempt, source, freshness, successful-scan and classification-count fields where available, and limitations are recorded, but this state makes no completeness claim.

## Performance retention

Provider failure can reuse a previously verified, non-null performance observation for at most 48 hours, including the exact boundary. Its sport, competition, and season must match the current verified context. Its source URL and retrieval timestamp remain unchanged; only its state changes to `stale`. Future-dated, mismatched, unavailable, or older observations fail closed. The compiler and freshness badge share this policy through `src/domain/observation.ts`.
