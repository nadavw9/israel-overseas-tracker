# Inclusion policy

The tracker has four public athlete tiers: `senior-professional`, `college`, `development`, and `international-circuit`.

An athlete is eligible for consideration with verified evidence of either Israeli citizenship or nationality, or verified representation of Israel in competition. These are independent inclusion bases: citizenship or nationality does not establish that an athlete represents Israel, and representing Israel does not establish citizenship or nationality. Jewish heritage alone is not sufficient.

## Current overseas activity

For team sports, a public athlete needs a verified current, in-scope foreign affiliation. Active and injured athletes require one current primary overseas affiliation with an active roster status. A free agent may remain public for up to 90 days after a verified release from an overseas affiliation. The record is marked `free-agent` and is not counted as actively rostered; it cannot also have a current primary overseas affiliation.

For an `international-circuit` athlete, current activity requires a current ranking or a sanctioned result inside the configured activity window. The default window is 12 months; a sport may use a shorter configured window when its calendar warrants it.

## Discovery and publication

Discovery creates a private candidate only. Deterministic promotion to the public registry requires a stable identity, verified eligibility, and verified current in-scope foreign affiliation or circuit activity. Unresolved and conflicting candidates remain private. Statistics are optional: a published athlete may be `identity-only` when no suitable statistics source is available. Images are also optional and use an explicit unavailable state or neutral fallback when no approved asset exists.

Public records carry source URLs and retrieval timestamps. Provider errors never create replacement data. A previous verified performance observation may remain visible as `stale` only within the configured retention policy; otherwise refresh fails closed.

## Media rights

Only media with approved rights metadata can enter the public snapshot or image manifest. The required metadata includes the source, rights holder, license, and usage information required by the schema. Review, expired, or missing-rights assets stay out of public output and use the neutral local fallback. An official portrait is not assumed to be reusable merely because it appears on an official site.

## Coverage ledger

The coverage ledger records declared discovery universes and their attempts, successful scans, freshness, health, classification counts, and limitations. A coverage summary is complete only when every required universe is healthy within its explicit freshness window. The visible summary is a health statement, not a promise that there are no missed athletes. The seeded ledger is currently incomplete.
