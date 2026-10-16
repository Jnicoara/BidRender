# Track C's four parked security findings — Track A's status (2026-10-15)

Source: `references/security-sweep.md` on `track-c` (§ "For Track A") and
`track-c-handoff.md`. None needs a migration. Done on `track-a-night`; not on
local-dev until the owner merges.

| #     | Finding                                                                                                       | Status                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-S14 | Signup race — one user, five companies                                                                        | **FIXED 2026-10-14** (`signup-race-plan.md`): per-user lock + re-check, `personalCompanyRace.test.ts` red without it. DB rule drafted, not applied.                                                                        |
| A-S9b | Session cookie `SameSite=None` on https                                                                       | **FIXED 2026-10-15**: `Lax` everywhere (`server/_core/cookies.ts`). `server/cookies.test.ts` turned around — red on the old code (2 of 3), green now.                                                                      |
| A-S12 | Rate-limit sender key trusts the client-written first `X-Forwarded-For` entry                                 | **PREPARED, not switched**: `CLIENT_IP_FROM` (`server/rateLimit.ts`) — unset keeps today's behaviour; `last-forwarded` or `header:<name>` closes it. 3 new tests, 2 red on the old code. Needs one look at a live request. |
| A-S13 | A plan upload's size is declared, not enforced (signed PUT does not bind `Content-Length`; tickets unlimited) | **NOT DONE** — needs R2 to prove it, and a wrong guess breaks every live upload.                                                                                                                                           |

## A-S9b — what changes for people

Re-issued on the next sign-in only; an existing `None` cookie keeps working
until then (same name and path, so sign-out clears either). `Lax` still sends
the session on a top-level link INTO the app — a reset email, a bookmark, a
link in a chat — and on every request from the app's own pages. What stops
working is the session inside ANOTHER site's frame or on a cross-site
sub-request, which nothing uses (the Manus preview frame was the reason for
`None`, and it is gone). The starter editor's cookie uses the same options,
so it is `Lax` too. Smoke on staging after merge is the live-ish check.

## Recommended order for what is left

1. **A-S12, switch it on** — cheapest and closes a real dodge on sign-in,
   reset and sign-up limits. Read ONE request's headers on live (the owner or
   A: a tiny logging deploy, or DigitalOcean's docs for its load balancer),
   then set `CLIENT_IP_FROM` in App Platform. Rule: if a header the platform
   **overwrites** exists (e.g. `do-connecting-ip`), use `header:<it>`;
   otherwise `last-forwarded`, but only if exactly one trusted proxy appends.
   Behind Cloudflare AND DigitalOcean, `last-forwarded` would give every
   visitor ONE key and lock sign-in for everybody — that is the case to rule
   out first. Staging first, with the smoke.
2. **Point App Platform's health check at `/api/health`** (`q-db1-plan.md`
   § 3) — not a sweep finding, but the same "needs a live look" kind.
3. **A-S13** — bind `ContentLength` into `r2PresignPut` and each multipart
   part's signed URL (the server knows `byteSize` and the equal-piece plan in
   `shared/multipartPlan.ts`), plus a per-company cap on open upload tickets.
   Prove on the **staging** bucket (`bidrender-plans-staging`): a PUT with the
   declared size passes, a bigger body is refused, the browser upload and a
   resumed multipart upload still work. Only then live. It is last because
   the harm today is storage cost from someone already signed in, and a
   mistake here breaks the core upload.
4. **Q-SEC1 (owner)** — unmount the legacy routers (`projects`,
   `masterItems`, `masterAssemblies`, `masterLaborRates`,
   `projectAssemblies`, `projectItems`, `bidSummary`): zero callers in
   `client/src` (re-measured 2026-10-14, `night-cleanup-2026-10-14.md` § 2),
   still reachable through the API. Unmounting is code only and removes the
   surface that held S5; the tables can stay until a later drop.
