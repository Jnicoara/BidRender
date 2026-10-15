# Security sweep — 2026-10-14 (Track C, overnight run #2)

Why: the first outside person signed up on live today, and a signup race
gave one account five companies (Track A has that one). The brief was to act
like an attacker with a normal login against EVERY server route.

**Result: 21 findings (19 in the first pass, 2 later that night). 13 fixed on `track-c` with a test that was red
first, 4 written up for Track A (they need a live check, R2, or a live
behaviour change), 1 owner question, 3 notes.** Nothing here needs a
migration. Nothing was run against staging or live.

## How it was tested — and why it keeps testing

`server/crossCompanyAttack.test.ts` does not depend on anybody remembering
a route. It walks `appRouter`'s own procedure list (403 today), builds a
valid input for each from the procedure's own zod schema with the VICTIM
company's ids planted in every id field (`server/attack/inputs.ts`), calls
it, and judges two ways:

- **Read:** the reply must not carry the victim's marker text
  (`VICTIMSECRET`), the victim's planted number (`87654.321` in prices,
  quantities and points), or a victim row (`userId`) the caller did not name.
- **Write:** every row of every table is read before and after each
  mutation (`server/attack/snapshot.ts`). Each row's owner is worked out from
  the real foreign keys in `information_schema`, not from a list; a change to
  another owner's row, to a shared starter row, or a new row pointing at
  another company's row is a finding.

Five passes, about 90 seconds in all:

| Pass         | Who                                    | Calls (last run) | What must hold                                                     |
| ------------ | -------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Victim build | the victim owner                       | 313 + 21 planted | rows in 73 of the company tables (a bid with plans, counts, runs…) |
| Stranger     | another company's owner, internal tier | 11,601           | reads nothing of the victim's, changes nothing of the victim's     |
| Viewer       | a viewer in the victim's own company   | 10,476           | changes nothing in the company                                     |
| Estimator    | an estimator in the victim's company   | every mutation   | cannot touch pricing, branding, members, invites, or delete a bid  |
| Signed out   | nobody                                 | 403              | only the 12 deliberately public routes answer                      |

`id` / `ids` fields cannot say which table they mean, so they are SPRAYED
across all of the victim's tables. Optional fields are tried three ways
(all, none, and "references only") because filling every optional string
can get a whole input refused for an unrelated reason — which hid a hole on
the first run. Tables the victim's flows never reach (AI findings, invites
past a seat limit…) get one planted row each, so nothing is out of reach
just because the victim never used it.

**A new route is attacked the day it is added.** The allowlists in the test
(`PUBLIC`, `EXPLAINED`, `ESTIMATOR_EXPLAINED`, `SKIPPED`) each need a
reason; anything else that leaks or writes across companies fails the
suite.

## Fixed (on track-c, not merged)

| #   | Finding                                                                                                                                                                                                                                                                                                                                      | How bad                                                                               | Fix                                                                                                                     | Test (red before, green after)                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| S1  | `assemblies.create` / `update` accepted another company's material id and **replied with that material's name and price**. Labor rate, modifier and work-step ids the same.                                                                                                                                                                  | **High** — any logged-in user could walk a competitor's price book one id at a time.  | `server/libraryRefs.ts` `requireLibraryRefs`: a stored reference must be the company's own row or a shared starter row. | crossCompanyAttack (runs 2–3)                                                                                |
| S2  | `kits.create` / `update` accepted another company's assembly and replied with its name.                                                                                                                                                                                                                                                      | High (same leak, assemblies)                                                          | same guard                                                                                                              | crossCompanyAttack                                                                                           |
| S3  | `takeoffRunTypes.create` / `update` stored another company's material in any of the ten slots, so footage priced from their price book.                                                                                                                                                                                                      | Medium                                                                                | same guard on all ten slots                                                                                             | crossCompanyAttack                                                                                           |
| S4  | `takeoffStamps.captureSymbol` stored another company's assembly, and the RAW `capturedFromSheetId` it was sent (another company's sheet).                                                                                                                                                                                                    | Medium                                                                                | guard on the assembly; stores the sheet it read as the company's own, never the id as sent                              | crossCompanyAttack                                                                                           |
| S5  | Legacy `masterAssemblies.addItem` / `updateItem` / `removeItem` never looked at who was asking: **anyone could change or delete any company's legacy assembly items by id.**                                                                                                                                                                 | High in kind; the legacy tables have no screen, so only via the API                   | the db functions now take the owner and check it themselves (`server/db.ts`), so no caller can skip it                  | crossCompanyAttack (run 1)                                                                                   |
| S6  | **Sign-up had no limit at all**: unlimited accounts (each with a company), and unlimited "does this address have an account?" probing.                                                                                                                                                                                                       | Medium                                                                                | 10 an hour per sender + 100 an hour overall, counted BEFORE the address lookup                                          | `server/authLimits.test.ts`                                                                                  |
| S7  | "Change password" let a session guess the current password without limit.                                                                                                                                                                                                                                                                    | Medium (a session left open on a shared laptop → the password for every other device) | 10 wrong per 15 min per account                                                                                         | `server/authLimits.test.ts`                                                                                  |
| S8  | **An estimator could change the company's letterhead and every proposal's defaults.** `settings.edit` existed in `shared/permissions.ts` and nothing checked it.                                                                                                                                                                             | Medium (role limit)                                                                   | `requireCapability("settings.edit")` on the five writes; Settings and the proposal screen show them read-only to others | crossCompanyAttack estimator pass (run 4)                                                                    |
| S9  | **Cross-site request forgery.** The live session cookie is `SameSite=None`, and tRPC runs a `multipart/form-data` POST (which any web page can send with no preflight) as a mutation. 16 mutations could be fired by a hostile page: clear the logo, remove the sample bid, accept every labor-step suggestion, start a full backup (admin). | **High**                                                                              | `server/csrfGuard.ts`: any non-JSON POST to `/api/trpc` is refused (415). Our client only sends JSON.                   | `server/csrfGuard.test.ts` (real HTTP, real cookie: the forged POST RUNS without the guard, refused with it) |
| S10 | Plan-key ownership was a bare `startsWith`, so `bid-plans/5/7/../../9/8/x.pdf` passed.                                                                                                                                                                                                                                                       | Low (the other key's random suffix is unguessable; defence in depth)                  | `server/planKeys.ts` `ownsPlanKey`: no `.`, `..`, empty segment or backslash; one check for all five upload routes      | `server/planKeys.test.ts`                                                                                    |
| S11 | Password inputs at sign-in, change-password and the starter sign-in had no length cap.                                                                                                                                                                                                                                                       | Low                                                                                   | capped at 1,024                                                                                                         | —                                                                                                            |

## For Track A (parked — each needs a live check, R2, or changes live behaviour)

- **A-S9b — make the session cookie `SameSite=Lax` in production.**
  `server/_core/cookies.ts` sets `none` on https, a leftover from the Manus
  preview frame (the comment says "None stays for https"). S9's guard
  already closes the form-POST hole; Lax closes the whole class. Risk: any
  cross-site embedding of the app stops being signed in — none exists
  today. One-word change; it re-issues cookies on next sign-in only.
- **A-S12 — the rate-limit sender key trusts the FIRST `X-Forwarded-For`
  entry** (`server/rateLimit.ts` `clientKey`), which the client writes. A
  script setting a fresh value per request dodges every PER-SENDER limit
  (sign-in, reset, early access, now sign-up). Per-address limits and S6's
  overall ceiling still hold. The fix depends on what DigitalOcean (and
  Cloudflare, if proxied) put in front — probably the LAST entry, or
  `do-connecting-ip`. **Needs one look at a live request's headers**, which
  Track C may not do.
- **A-S13 — a plan upload's size is declared, not enforced.** The signed PUT
  URL does not bind `Content-Length`, so a ticket for a 1 KB file accepts up
  to R2's 5 GB, and tickets are unlimited — an orphan object costs storage
  even if never attached. Fix: put `ContentLength` in the `PutObjectCommand`
  (and per part for multipart) so R2 refuses a different size; consider a
  per-company ticket limit. **Needs R2 to verify** (the plans bucket is
  live). `confirmAttach` checking the real size was considered and dropped:
  it cannot stop an upload that is never confirmed.
- **A-S14 — the signup race** (5 companies for one user): already in A's
  handoff with a fix plan; nothing added here.

## Owner question

- **Q-SEC1 — unmount the legacy routers?** `projects`, `masterItems`,
  `masterAssemblies`, `masterLaborRates`, `projectAssemblies`,
  `projectItems`, `bidSummary`: zero callers in `client/src` (measured
  tonight), still reachable through the API, one held S5. Unmounting removes
  the surface; it also retires `server/v545.test.ts`, which tests only them.
  Suggested: yes, in its own commit.

## Notes (looked at, left as they are)

- **S16 — signing out does not end the session token.** It clears the
  cookie; a copied token stays valid for its year. Changing the password
  does end every session (`sessionsValidAfter`). A server-side "sign out
  everywhere" would be the fix if it is ever wanted.
- **S17 — `/api/oauth/callback` is still mounted** from the Manus era. With
  no OAuth server configured it fails at the code exchange; dead, harmless.
- **S18 — sign-up says when an address already has an account.** Normal for
  a sign-up form; now rate-limited (S6), so it cannot be used to sweep.
- **S19 — stored-file links are signed with `JWT_SECRET`,** the same secret
  as sessions. Correct (HMAC, bound to the key, expiring); a separate
  secret would limit the damage of one leaking.

## Found later the same night (second pass)

| #   | Finding                                                                                                                                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                   | Test |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| S20 | **CSV formula injection.** Every export quoted its fields, which does not stop a spreadsheet running or as a formula. Client, material and bid names are free text any member can type; the owner opens the export. The early-access export (typed by strangers on the public form, opened by an admin) had its own copy of the quoting. | : text starting tab or CR gets a leading ; real numbers () are left alone for the accounting import. The early-access export uses the shared writer. None of the 1,941 shipped names starts that way. |      |
| S21 | A database blip showed signed-in users the public landing page, and protected calls answered "Please login" (which redirects to sign in) — see failure drills.                                                                                                                                                                           | in                                                                                                                                                                                                    |      |

Also checked and sound: no user text reaches an HTML sink (one , in an unused chart helper with developer-supplied colours); no user-typed URL is rendered as a link (the branding website is text).

## Checked and sound

Invite codes (100 random bits, 14 days, seat check under the company lock,
same answer for unknown/spent/expired); role changes (never your own, never
the owner, only someone you outrank); suspension bites on the next request;
platform-admin routes (`adminProcedure`, refused to a company owner);
stored-file links (HMAC over key + expiry); the same-origin plan upload
route (company scope + `bids.edit`, same rules as the tRPC path); password
reset (256-bit token, one hour, one use, limited); scheduled-job endpoints
(constant-time secret, existing tests); `auth.me` (public fields only).

## Re-running it

```bash
DATABASE_URL=<your *_test_* database> ATTACK_REPORT=/tmp/attack.json \
  pnpm vitest run server/crossCompanyAttack.test.ts
```

`ATTACK_REPORT` writes the per-pass call counts, the victim's rows per
table, and anything found — the numbers in the table above come from it.
