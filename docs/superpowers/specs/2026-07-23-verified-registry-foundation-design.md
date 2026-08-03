# Verified Registry and Coverage Foundation Design

**Date:** 23 July 2026  
**Status:** Implemented and approved as the registry foundation

**Project:** Israel Overseas Sports Tracker

## Summary

The tracker will move from a small list of manually configured athlete cards to a source-driven registry that can support Israeli athletes across team sports, college and development systems, international tours, Olympic sports, and para-sport.

This specification covers the first independent sub-project: the verified registry and coverage foundation. It establishes athlete identity, inclusion rules, affiliations, evidence, provider bindings, licensed media, publication states, candidate review, and coverage accounting. Later sub-projects will add automated discovery scanners, sport-specific live-data adapters, and the complete athlete census on top of this foundation.

## Goal

Create a provider-independent source of truth that can represent every in-scope athlete without inventing data, mixing identities, or hiding gaps in coverage.

## Success criteria

The foundation is complete when:

1. The registry supports team sports, individual sports, para-sport, men, women, senior professionals, college athletes, and developmental athletes.
2. One athlete can have multiple historical or simultaneous affiliations without overwriting earlier records.
3. Israeli citizenship and official representation of Israel are stored as distinct evidence claims.
4. Provider IDs cannot publish statistics until they are explicitly bound to a verified athlete identity.
5. Every displayed statistic, affiliation, image, and eligibility claim exposes its source and retrieval time.
6. Pending or conflicting candidates remain outside public totals and can be reviewed without editing application code.
7. Every declared discovery universe has a coverage record with its last scan, health, and known limitations.
8. Existing verified athletes migrate without losing their current public behavior.
9. Invalid, incomplete, duplicated, or contradictory records fail validation before a public snapshot is written.

## Product scope

### Included athlete tiers

- `senior-professional`: an active senior athlete contracted to or rostered by an organization outside Israel.
- `college`: an athlete on an overseas university or college roster, including NCAA and equivalent systems.
- `development`: an academy, junior, minor-league, reserve, or other formally rostered developmental athlete abroad.
- `international-circuit`: an athlete actively competing on a recognized international tour or federation circuit where a foreign club is not the meaningful unit.

The public interface will label these tiers and will not combine them into a misleading single professional count.

### Inclusion rules

An athlete is eligible for publication when at least one primary source establishes either:

- Israeli citizenship or nationality; or
- official representation of Israel in a recognized senior, youth, Olympic, Paralympic, or federation competition.

The two bases must be labeled separately. Official Israel representation does not allow the product to claim citizenship when citizenship has not been verified. Jewish heritage alone is insufficient.

For team sports, the athlete also needs a current foreign affiliation. For international-circuit sports, the athlete needs a current federation ranking or at least one sanctioned international result within the sport's configured activity window. The default activity window is 12 months and may be shortened for sports with frequent competition.

### Exclusions

- Foreign athletes playing for Israeli clubs.
- Athletes at Israeli clubs merely participating in international fixtures.
- Retired athletes in the active directory.
- Unverified social-media claims, fan pages, search snippets, and heritage-only associations.
- Scraped statistics whose reuse is prohibited or whose identity cannot be bound safely.

Recently released athletes may remain visible for 90 days with `free-agent` status, but they do not count as actively rostered. Retired and historical records remain available to future archive views.

## Architecture

The system has six bounded data units:

1. **Athlete registry:** stable identity, localized names, sport, discipline, demographic fields needed for sport presentation, and publication status.
2. **Evidence register:** source-backed claims for eligibility, identity, and current affiliation.
3. **Affiliation history:** time-bounded relationships with clubs, teams, colleges, tours, leagues, or series.
4. **Provider bindings:** explicit mappings between an internal athlete ID and external provider IDs.
5. **Media register:** player images and other assets with source, license, attribution, and expiration metadata.
6. **Coverage ledger and candidate queue:** records what was scanned, what was found, and which conflicts still require review.

The browser consumes a generated public snapshot. It does not read review candidates, private notes, or unverified bindings. Generation is fail-closed: the last valid snapshot remains available when a refresh fails.

## Domain model

### Athlete

Each athlete has:

- a stable lowercase slug ID that never contains a provider name;
- Hebrew and English display names;
- search aliases for transliterations and former names;
- sport and optional discipline;
- gender category used by the relevant competition;
- optional para classification;
- tier;
- lifecycle status: `active`, `injured`, `inactive`, `free-agent`, `retired`, or `unknown`;
- visibility: `public`, `review`, or `archived`;
- references to eligibility evidence, affiliations, bindings, and media assets.

Birth dates may be used privately for identity reconciliation. Public display of a full birth date is optional and must be omitted for minors unless already required and safely published by a governing body. The initial public snapshot exposes age only when it is already present in an approved primary source and is useful to the sport.

### Eligibility evidence

An eligibility claim stores:

- basis: `citizenship` or `represents-israel`;
- verification status: `verified`, `pending`, `conflicting`, or `expired`;
- primary source URL and publisher;
- retrieval time;
- optional source publication date;
- reviewer note suitable for internal use;
- the exact athlete identity attributes used for the match.

At least one current verified eligibility claim is required for public visibility.

### Affiliation

An affiliation stores:

- organization name and optional localized name;
- organization type: club, college, academy, national team, racing team, cycling team, or tour membership;
- country;
- competition, league, tour, or series;
- season;
- start and optional end date;
- roster status;
- primary source URL and retrieval time;
- whether the affiliation counts as overseas under this policy.

The current affiliation is derived from dates and status rather than copied into the athlete record. Conflicting simultaneous claims move the athlete to review unless the sport legitimately permits multiple concurrent affiliations.

### Provider binding

A binding stores the provider, external athlete ID, covered sport and competition, verification status, identity fields checked, and verification timestamp. Name alone is never sufficient. The match must use at least two of name, birth date, team, competition, or governing-body identity, with birth date or a governing-body identity preferred when available.

Bindings are independent of eligibility. A provider reporting nationality `ISR` is a discovery signal, not sufficient publication evidence.

### Source observation

Statistics and results are observations rather than fields owned by the athlete. Each observation includes:

- athlete and provider binding;
- sport-specific payload;
- competition and season or event;
- event time;
- retrieval time;
- state: `live`, `provisional`, `final`, `corrected`, or `stale`;
- source URL;
- provider attribution and license reference.

This prevents statistics from different seasons, teams, competitions, or providers from being combined accidentally.

### Media asset

A media record stores URL, source page, rights holder or author, license, required attribution, allowed use, crop or variant, retrieval time, and optional expiration. Assets without documented reuse rights stay in review. The user interface falls back to a neutral generated presentation rather than an unauthorized image.

## Coverage ledger

The coverage ledger turns completeness into measurable operational state. Each entry represents a declared universe such as `ATP singles players with country ISR`, `2026 IIHF Israel roster`, or `2026-27 NCAA Division I men's basketball rosters`.

Each entry records:

- sport, gender category, tier, region, competition, and season;
- discovery source and source type;
- expected update cadence;
- last attempt and last successful scan;
- result counts: observed identities, matched athletes, new candidates, and conflicts;
- health: `healthy`, `partial`, `stale`, `blocked`, or `not-configured`;
- known limitations and licensing restrictions.

Public completeness messaging is based on this ledger. The application may state that a configured universe was scanned successfully, but it must not claim universal completeness while any required universe is partial, stale, blocked, or not configured.

## Candidate review

Discovery produces candidates, not public athletes. A candidate records normalized names, aliases, likely sport, possible affiliations, discovered provider IDs, evidence links, and the reason it was found.

Candidate states are:

- `new`: not yet assessed;
- `needs-evidence`: likely relevant but missing primary proof;
- `identity-conflict`: sources may refer to different people;
- `affiliation-conflict`: current team or tour status disagrees;
- `approved`: promoted into the verified registry;
- `rejected`: excluded with a reason;
- `superseded`: merged into another candidate or athlete.

Promotion is deterministic: verified eligibility, verified current in-scope affiliation or circuit activity, and a stable internal identity are mandatory. Statistics and images are optional; they remain explicitly unavailable until a licensed source is connected.

## Public snapshot and interface behavior

The generated snapshot contains only public athletes and public-safe provenance. It adds:

- tier, gender category, discipline, and lifecycle status;
- a derived current affiliation;
- sport-specific headline metrics when verified;
- source and freshness metadata for every section;
- a neutral `data unavailable` state instead of zeroes;
- media attribution when required;
- coverage summary counts and last-updated status.

Existing list, rankings, and map views continue to work. Filters expand to sport, tier, gender category, country, competition, and status. Rankings compare athletes only within compatible sport-specific metric definitions; the system will not rank football goals against basketball points.

Review candidates, internal reviewer notes, and non-public birth dates are never shipped to the browser.

## Data flow

1. Discovery or manual research creates or updates a candidate.
2. Primary-source evidence is attached and normalized.
3. Review promotes the candidate to the registry or records a rejection.
4. Provider bindings are verified independently.
5. Provider adapters fetch sport observations.
6. Validation checks identity, source provenance, season context, media rights, duplicates, and visibility rules.
7. A new snapshot is written atomically only when the entire public dataset validates.
8. The browser loads the new snapshot and applies freshness rules.

No provider response may create a new public athlete automatically.

## Freshness and failure behavior

- Identity and eligibility evidence is rechecked at least quarterly and when a conflict is detected.
- Team affiliations are checked daily during transfer windows and weekly otherwise.
- College and academy rosters are checked weekly in season and monthly out of season.
- Tour rankings follow the official publication cadence.
- Live observations use the provider's licensed polling or streaming contract.
- Final observations are reconciled after the event and again within 24 hours for corrections.

When a provider fails, a previously verified observation may remain as `stale` within its sport-specific retention window. If no verified observation exists, the application shows identity and affiliation only. It never manufactures replacement values or silently substitutes a different competition.

## Data-source and legal rules

Sources have four roles:

- `primary-verification`: federation, league, club, college, tour, or governing body;
- `licensed-statistics`: contracted API or authorized data feed;
- `discovery-only`: search, transfer database, news report, or third-party directory;
- `media`: licensed provider, rights holder, player or agent, or compatible open license.

Discovery-only sources never publish a claim by themselves. Public webpages whose terms prohibit systematic collection may be used for manual verification and linking but not automated extraction. API keys and commercial license details remain server-side and are never added to the browser bundle or repository.

## Validation and testing

The implementation uses schema-first validation and test-driven migration.

Required automated tests include:

- valid examples for every athlete tier and sport family;
- rejection of a public athlete without verified eligibility;
- distinction between citizenship and representation evidence;
- rejection of overlapping current affiliations when the sport disallows them;
- provider-binding identity mismatch;
- isolation of review candidates from the public snapshot;
- duplicate internal IDs and duplicate external provider bindings;
- statistics payload mismatched to sport, competition, season, or athlete;
- stale, unavailable, and corrected observation behavior;
- image records without adequate licensing metadata;
- coverage-ledger health calculations;
- migration of all existing registry records;
- list, filter, rankings, map, Hebrew, English, accessibility, responsive, and privacy regression tests.

Fixture data must be synthetic or captured under terms that permit repository use. Network calls are mocked in unit tests. End-to-end tests use the generated local snapshot.

## Migration and rollout

The migration is additive and reversible:

1. Introduce the expanded schemas and fixtures behind the existing snapshot interface.
2. Convert current athlete records into the new registry, evidence, affiliation, binding, and media files.
3. Generate a snapshot compatible with the current interface and prove regression tests still pass.
4. Add new public fields and filters.
5. Introduce the coverage ledger and review queue files.
6. Remove the legacy single-record assumptions only after the new generator is verified.

The old generated snapshot remains available until the new pipeline produces a fully valid replacement.

## Follow-on sub-projects

This foundation intentionally does not implement every data source at once. It enables four subsequent specifications and plans:

1. **Football and basketball census:** men, women, senior, NCAA, college, academy, and developmental coverage.
2. **Hockey, tennis, handball, volleyball, and baseball census:** federation and league reconciliation with sport-native metrics.
3. **International-circuit and Olympic coverage:** cycling, motorsport, golf, athletics, aquatics, judo, combat, gymnastics, sailing, winter, and para disciplines.
4. **Production live-data and media contracts:** provider trials, coverage audits, licensed feeds, and asset delivery.

Each sub-project must produce working public coverage and update the coverage ledger before the next sport family is added.

## Resolved decisions

- Use the layered hybrid data strategy.
- Include senior, college, development, and international-circuit athletes as distinct tiers.
- Include women and para-athletes from the data-model foundation rather than retrofitting them later.
- Treat citizenship and official Israel representation as different claims.
- Prefer explicit unavailability over fabricated or mixed-context statistics.
- Keep the public browser application independent of any single provider.
- Make completeness measurable through declared source universes and visible coverage health.

