# Data-source register

Checked 22 July 2026.

| Athlete | Public status | Identity / eligibility | Statistics | Image | Limitation |
| --- | --- | --- | --- | --- | --- |
| Deni Avdija | Verified | NBA player profile | ESPN NBA athlete overview, identity-bound to ESPN player `4683021` | NBA CDN, linked to NBA profile | Scheduled snapshot, not live play-by-play |
| Ben Saraf | Verified | NBA G League player profile | ESPN NBA athlete overview, identity-bound to ESPN player `5242502` | NBA CDN, linked to G League profile | Scheduled snapshot, not live play-by-play |
| Oscar Gloukh | Verified | Ajax first-team profile | None published | Ajax player portrait | Identity-only until a suitable statistics source is connected |
| Danny Wolf | Review | NBA profile under review | Not public | Not public | Excluded until Israeli eligibility evidence is approved |
| Zeev Buium | Review | NHL profile under review | Fixture-tested NHL adapter, not public | Not public | Excluded until Israeli eligibility evidence is approved |

## Source URLs

- Deni Avdija: <https://www.nba.com/player/1630166/deni-avdija>
- Ben Saraf: <https://gleague.nba.com/player/1642879/ben-saraf>
- Oscar Gloukh: <https://english.ajax.nl/teams/ajax-1/oscar-gloukh>
- ESPN identity pages: `https://www.espn.com/nba/player/_/id/{providerId}`
- ESPN statistics endpoint: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{providerId}/overview`
- NHL fixture-tested endpoint: `https://api-web.nhle.com/v1/player/{providerId}/landing`

The registry separates eligibility evidence, statistics provenance, and image provenance. A valid response from one source never substitutes for another concern.
