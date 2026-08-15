# Free-first provider research

Checked 15 August 2026. This is a decision record, not a claim that every provider's free plan or coverage will remain unchanged. A provider is eligible for automatic public statistics only when its current coverage, identity fields, rate limits, caching rights, and display terms are verified for the target competition.

## Key acquisition

For API-Sports/API-Football:

1. Register at the [API-Football dashboard](https://dashboard.api-football.com/register).
2. Confirm the email, open `Account` → `My Access`, and copy the API key.
3. Store it privately as `API_FOOTBALL_KEY` in the deployment secret store. Never put it in the registry, browser bundle, or chat.

The provider's current guide says the free plan is activated after registration and the same account can access its other API-Sports products. The current pricing pages list 100 requests/day for the free plans; quota resets at 00:00 UTC and unused requests are lost. Treat these limits as provider facts to re-check, not as a permanent guarantee.

## Provider decisions

| Provider | Sports / useful data | Current free evidence | Decision |
| --- | --- | --- | --- |
| API-Football | Football player profiles and season statistics; leagues, fixtures, events, lineups | $0 plan, 100 requests/day, player statistics listed; direct probe on 15 Aug 2026 rejected 2025+ player searches with a Free-plan season error | **Do not bind current 2026-27 football yet.** Keep the adapter fail-closed; use a paid/approved feed or re-probe when the free plan exposes the current season. |
| ESPN site soccer roster endpoint | Current team rosters with season context and player totals for supported competitions; no key | Direct roster probes on 15 Aug 2026 returned current season, team IDs, player IDs, and appearances/goals/assists for eight verified Israeli footballers | **Use for the eight verified bindings now.** Treat values as provisional, re-fetch nightly, and fail closed when a player/team/season/stat field is missing. Coverage is league-dependent and not a complete global soccer census. |
| ESPN college-basketball roster + statistics endpoints | Current NCAA Division I roster identity plus latest completed season GP/PPG/RPG/APG; no key | Direct probes on 15 Aug 2026 matched Omer Mayer at Purdue and Gal Raviv at Miami, with complete 2025-26 totals and current 2026-27 roster identity | **Use for the two verified bindings now.** Publish final 2025-26 totals separately from the current 2026-27 affiliation; re-fetch nightly and fail closed on roster, athlete, season, or required-stat mismatches. Coverage is limited to ESPN-supported NCAA teams. |
| API-NBA | NBA players, games, events, standings, statistics | Official API-Sports page lists a free plan with 100 requests/day; direct probe on 15 Aug 2026 rejected the 2025 current-season player search | **Do not add a second NBA adapter yet.** ESPN remains the current no-key NBA source; API-NBA can be revisited when the free plan covers the target season. |
| API-Hockey | Hockey schedules, teams, standings, statistics; broad league coverage | Official page lists 100 requests/day and 262 leagues/cups | **Candidate for non-NHL hockey.** Confirm player-level statistics; keep the existing NHL adapter as the no-key fallback. |
| API-Baseball | Baseball leagues, games, teams, standings, live games, player/stat endpoints in the separate API docs | Official API-Sports page lists 100 requests/day and MLB coverage | **Candidate.** Test MLB/minor-league player-stat coverage and terms before public use. |
| API-Formula-1 | Drivers, teams, races, rankings, circuits | Official page lists 100 requests/day | **Good motorsport candidate.** Use for scheduled race/driver results, not second-by-second telemetry. |
| API-Basketball | 420+ basketball leagues, games, standings, statistics | Free plan lists 100 requests/day, but its pricing page excludes `players` from the Basic tier | **Do not use as the player-stat source on free tier.** Prefer API-NBA for NBA athletes and verify another provider for European clubs. |
| TheSportsDB | Identity, clubs, artwork, schedules, limited player statistics | Free key is `123`; 30 requests/min; many search/stat/list methods have strict per-call limits | **Metadata/artwork fallback only.** Never use it as the authoritative performance feed. |
| Wikimedia Commons | Rights-aware athlete portraits with per-file license, creator, and source-page metadata | Exact-name API audit on 15 Aug 2026 found 20 roster matches with explicit CC/public-domain metadata (1 CC-BY, 15 CC-BY-SA, 4 public-domain/CC0) | **Use for approved portraits only.** Store the source page, license, creator, attribution, and retrieval time; keep unresolved matches out of the public image manifest. |
| BALLDONTLIE | NBA and other US sports | Free tier is $0 and 5 requests/min, but excludes game player stats, active players, injuries, season averages, and box scores | **Rejected for mandatory performance tracking.** |
| football-data.org | Competition, fixtures, results, standings | Registered free clients get 10 requests/min; unauthenticated access is limited to 100/day and area/competition lists | **Not a player-stat provider.** Use only for competition cross-checks. |
| Sportradar | High-quality multi-sport/live data | Trial is 30 days, 1,000 requests per rolling 30 days, 1 QPS | **Licensed fallback, not permanent-free.** |
| Jolpica F1 | Open Formula 1 results/history | Open-source volunteer service; no key, but hosting is community-funded | **Fallback only.** Keep a provider watermark and fail closed if unavailable. |
| Tennis API / Live Tennis API | ATP/WTA/ITF profiles, rankings, matches and statistics | Third-party services offer free or limited access, usually through RapidAPI or a token | **Investigate separately.** ATP terms prohibit systematic retrieval from its website without written permission, so do not scrape official pages. |

## Individual-sport gaps

- **Athletics:** World Athletics offers a dedicated Stats Pro service, but access is request-based rather than a public free developer key. Keep World Athletics pages as manual evidence until written API access is granted.
- **Aquatics:** World Aquatics describes a results database and API endpoints maintained with its technology partners, but it does not expose a public self-serve developer plan. Use official event result pages or a licensed feed.
- **Golf:** OpenGolfAPI is genuinely free and open, but its public dataset is course-focused; it is not a sufficient source for professional player performance. PGA/major-tour player feeds still need a provider or permission review.
- **Cycling, judo, gymnastics, sailing, combat, and similar circuits:** no reliable, permissively licensed, public player-stat API was found in this pass. Do not replace the gap with scraping; record official result pages as manual observations until a provider is approved.

## Recommended build order

1. Activate API-Football after the key is added and target player/league IDs are verified.
2. Add API-NBA bindings for the current NBA athletes, then compare results with ESPN before publishing.
3. Add API-F1 for driver results and API-Hockey/API-Baseball only after player-stat coverage tests pass.
4. Use TheSportsDB only to fill identity/artwork gaps where its terms and asset rights allow it.
5. Keep tennis rankings/results manual or licensed until the data-rights review is complete.

## Sources

- [API-Football pricing](https://www.api-football.com/pricing)
- [API-Football getting-started guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- [API-Sports NBA](https://api-sports.io/sports/nba), [Hockey](https://api-sports.io/sports/hockey), [Baseball](https://api-sports.io/sports/baseball), [Formula 1](https://api-sports.io/sports/formula-1)
- [ESPN Purdue roster](https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/2509/roster), [Omer Mayer 2025-26 statistics](https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2/athletes/5312035/statistics?lang=en&region=us), [ESPN Miami roster](https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams/2390/roster), [Gal Raviv 2025-26 statistics](https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball/seasons/2026/types/2/athletes/5242255/statistics?lang=en&region=us)
- [API-Basketball pricing](https://www.api-basketball.com/pricing)
- [TheSportsDB API guide](https://www.thesportsdb.com/docs_api_guide)
- [BALLDONTLIE account tiers](https://docs.balldontlie.io/)
- [football-data.org policies](https://docs.football-data.org/general/v4/policies.html)
- [Sportradar trial limits](https://developer.sportradar.com/football/docs/football-ig-account-maintenance)
- [ATP terms](https://www.atptour.com/en/terms-and-conditions)
- [World Athletics Stats Pro](https://stats.worldathletics.org/)
- [World Aquatics digital/data strategy](https://resources.fina.org/fina/document/2026/01/13/1c692349-3985-4aac-a8ee-9808a60d7cf9/Document-3-Digital-Platform-and-Data-Strategy.pdf)
- [OpenGolfAPI access and license](https://courses.opengolfapi.org/pricing)
