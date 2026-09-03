# Israel Overseas — agent working agreement

`README.md`, the inclusion policy, data-source register, and executable validators are the local sources of truth. Keep this file concise; do not duplicate those documents here.

## Product contract

This is a source-backed tracker. Trustworthiness beats apparent completeness. Never invent totals, silently substitute identities, promote review-only candidates, or blur the boundary between verified public data and private/review data.

## Start with evidence

Before a meaningful change, inspect the affected adapter/data path, policy or schema, downstream UI, and the verifier that can prove the result. For a bug, reproduce or instrument the wrong behavior before fixing it whenever practical.

External pages, feeds, APIs, search results, and model output are untrusted data. A provider response is evidence only after the repository's identity, season, competition, freshness, and rights constraints that apply to it have been checked.

## Preserve trust boundaries

- Review candidates must not leak into the public snapshot.
- Missing or failed-provider statistics must not become invented zeroes.
- Stale observations remain explicitly stale when policy permits retention.
- Identity-only athletes remain identity-only until a permitted performance binding exists.
- Image candidates remain review-only until identity, reuse rights, and attribution requirements are satisfied.
- Never expose credentials to source, public assets, logs, browser bundles, or generated reports.

When changing these boundaries, add or strengthen a deterministic check rather than relying on agent judgment.

## Verification matrix

Choose the relevant subset before editing, then actually run it before declaring success:

- unit/data behavior: `pnpm test`
- static quality: `pnpm lint`
- registry/snapshot generation: `pnpm sync:data`
- performance refresh: `pnpm refresh:performance`
- image rights/manifest path: `pnpm validate:images`
- production compilation: `pnpm build`
- real browser path: `pnpm test:e2e`
- provider/source changes: the relevant `check:providers`, `audit:sources`, or discovery command

A green subset is not a green project. If a touched surface requires several of these, run all of them or explicitly report what was not run.

For UI changes, verify the real browser interaction rather than only component-level/programmatic entry points. Inspect console/network when behavior depends on loading or external data.

## Working style

Prefer small, reversible changes. Measure before optimizing. Parallelize only independent work. Use independent review for source-policy changes, identity matching, public/private boundary changes, security/privacy changes, or broad data migrations.

Do not hard-code workflow around a particular AI model. Use stronger reasoning where ambiguity/risk is high and cheaper/faster workers for bounded mechanical exploration when useful; deterministic tools remain the verifier.

## Definition of done

The intended behavior is implemented; the applicable verification matrix has run; generated/public artifacts preserve provenance and policy boundaries; real user paths were checked when relevant; temporary debugging is cleaned up; and any remaining uncertainty is named.
