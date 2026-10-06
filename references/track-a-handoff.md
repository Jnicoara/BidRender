# Track A handoff — 2026-10-06, after the live release

Written for a restart. **Read this first.** The session-by-session history
it replaces is in git (`git log -p -- references/track-a-handoff.md`); the
release record is `deploying.md` § 11 "LIVE: `24105ad`".

## Where everything stands (checked 2026-10-06, ~21:05 UTC)

| What          | State                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live**      | **`24105ad`** (built 20:40:38 UTC). Database: **105 migrations** (0000–0104), schema matches, foreign keys 141/141. Released with the owner's approvals A–D. Backup just before: `2026-10-06T20-03-57Z`.      |
| Live email    | Live `RESEND_API_KEY` (`bidridge-live`) is in; **password reset works on bidridge.com** (owner).                                                                                                              |
| `main`        | `24105ad` (= live). Pushing `main` deploys; only with the owner's yes.                                                                                                                                        |
| **Staging**   | `cdf1bb7` when checked; it follows `local-dev` again (auto-deploy ON, `STAGING_AUTODEPLOY` unset). Database: 105.                                                                                             |
| **local-dev** | `8e9a475` plus this commit: everything on live, plus Track B's labor rule (`5c98bd1`), C's tie-labels / CAD layers / demolition plans, the reset early-check (`6518fc5`), and docs. No migration beyond 0104. |
| Tracks B, C   | **May merge into `local-dev` again** (they were closed for the release window).                                                                                                                               |

## What is queued, in order

**All three DONE 2026-10-06 (session 6)** — see `todo.md` § Flaky tests:
blank Plans was a real bug (an unbounded read batch; plus a failed list drew
"Drop plan PDFs here"); the "flaky undo" was a slow count-create, and its
reload path lost marks silently; and chasing it found a real short count
(a click between the server's answer and React's re-render, flow 5).
`touch.spec` is stable (0 failures in 18 executions since `24105ad`). The
original entries follow for the record.

1. **The blank Plans screen after a reload: MUST INVESTIGATE FIRST**
   (owner). Smoke flow 9 failed once on the `24105ad` candidate (run
   37512445462 attempt 1): after `page.reload()` the screen stayed blank for
   60 s, with the title "Plans" and no bid name. Attempt 2 passed. Treat it as
   a possible real bug: a person who reloads and sees nothing would think
   their plans were gone. `todo.md` § Flaky tests has the detail. Start from
   what the Plans screen waits on after a reload.
2. **`touch.spec`** (owner-queued). Its 2026-10-06 fixes force two timings
   (rows created late, `ensureSheets` held; the first mark list answered with
   pre-save data). Check that it is stable in CI over several runs, and that
   the route holds cannot starve a refresh (the first version did; it was
   narrowed to ONE call each).
3. **The flaky undo** (owner-queued). **No written record of it was found**
   in `todo.md`, the references or the handoffs (searched 2026-10-06). The
   likely candidate is smoke flow 10, "undo and redo a mark; delete one and
   Undo brings it back". Find the failing run first and write it into
   `todo.md` § Flaky tests before changing anything.

## The next live release

**Contents:** `assemblies.laborOnly` + `bid_line_items.snapshotLaborOnly`
(migrations **0105–0106**) with Track B's `laborOnly` code, **Track B's
"labor with $0 material is not priced" rule** (already on local-dev), Track
C's tie-labels and CAD layers, and the reset early-check.

**The one rule:** B's labor rule must never reach live without 0105–0106
and B's code. The priced print refuses a not-priced line with no way past,
and nothing else clears a labor-only line (`live-release-plan.md` § 0).

**Before the window:** write and rehearse 0105–0106 (additive, step 1);
B builds the reading code (`lineMaterialNotPriced` and its SQL copy read the
line's frozen `snapshotLaborOnly`; a "Labor only" tick in the assembly
editor). Then a green staging smoke on the exact candidate commit. If the
candidate is not the `local-dev` tip, use the one-off `a-smoke-<commit>`
branch method in `live-release-plan.md` § 0. Run `bidTotals.mts` before and
after (§ 1b): with B's rule in, a not-priced rise on labor-with-$0-material
lines is labelled EXPECTED, and any total that moves is a FAIL.

## Migrations — ONE list

`references/migrations-next-batch.md` (also on `a-migrations-plan`, now
merged here). None written. In deploy order:

| #         | What                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0105      | `assemblies.laborOnly` — **next release**                                                                                                 |
| 0106      | `bid_line_items.snapshotLaborOnly` (frozen, A's pick) — **next release**                                                                  |
| 0107      | `signup_invites` (invite gate)                                                                                                            |
| 0108      | AI correction log (+ C's `askKind`, `askFingerprint`)                                                                                     |
| 0109      | `bid_pdf_sheets`: `contentHash`, `distributionHeightInches` (C + B)                                                                       |
| 0110      | `assemblies`: remove/relocate hours, `mountHeightTypeKey`, `materialByQuote`                                                              |
| 0111      | `takeoff_groups`: remove/relocate hours (per-bid override)                                                                                |
| 0112      | `takeoff_stamps.labelWords` (C)                                                                                                           |
| 0113      | `symbol_looks.confirmedAt` (C)                                                                                                            |
| 0114      | `bid_quotes` table (B)                                                                                                                    |
| 0115      | `bid_line_items`: `lineRole` (NOT NULL DEFAULT `install`, unique-key swap: read twice) + the six quote columns incl. `bidUnitCost`        |
| 0116      | `pricing_defaults.quotedMarkupPct` (B)                                                                                                    |
| 0117–0123 | catalog batch (C), incl. `locknut`/`bushing` (0118: the "wire size not set" rule is code on top)                                          |
| 0124      | `bid_pdf_legend_entries` (+ `lookId`)                                                                                                     |
| 0125+     | before the priced sheet (brand lines, `bid_panels`, example prices)                                                                       |
| step 3    | fold "EXISTING TO REMAIN" twins into `status` (moves totals on purpose, after its code is live); clear the 8 starters' hours (after 0123) |

Decided 2026-10-06 (reversible, nothing written): **one panel table**,
`bid_panels` + `bid_panel_circuits` (C's `panel_schedules` not built);
**quotes = B's quote items**, H1 `quoteBucket` dropped. Not numbered, with
reasons: the `symbol_links (userId, lookupKey)` unique key (live has 0 rows
today, so it is safe there; check again when written), addenda
`supersedesId`, the scan decision log, `fixtureTag`.

**If `ls drizzle/*.sql | tail -1` is not `0104_run_end_connect.sql` when you
start writing, stop and find out why before writing anything.** Either this
list is stale or the repo is not where you think it is.

## Owner decisions recorded this session (all in `owner-questions.md`)

- Q1: breakers say **"1-Pole"**, breakers only. **Not renamed yet**: the
  rename waits for the other naming questions. Search already finds every
  pole spelling.
- Q2: remove/relocate labor lines; hours on the assembly with a per-bid
  override; unset = "not priced" (`remove-relocate-labor-plan.md`).
- Q3: a run ending on an existing device prices its drop, with "Leave it
  off". **Built by Track B.**
- `laborOnly`: yes (starters that are labor-only ship marked; none today).

## Before beta (`todo.md` § "Before beta: sign-in protection")

Block known-leaked passwords; limit repeated wrong sign-ins; **refuse a new
password equal to the current one** (no password history).

## Worth knowing

- Every `[email]` / `[auth] password reset` line in the Runtime Logs says
  why a send stopped. The staging failure was an invalid Resend key, and
  Resend shows no trace of such a request (`deploying.md` § 11).
- `gh` is installed and signed in as Jnicoara. Reload PATH in a new shell,
  or call `"/c/Program Files/GitHub CLI/gh.exe"`. CI screenshots now upload
  (`include-hidden-files`).
- The local `bidrender_local` and `bidrender_test_clean` are at 105.
- Laptop memory runs short: background watchers get killed. Prefer
  foreground checks, and keep one server at a time (ports 3000/3002/3004).
- A stale agent worktree remains at `.claude/worktrees/agent-a02fd66b3ea7af9ae`
  (`a-materials-plan`). Safe to remove with `git worktree remove`.

## SHORT SUMMARY

- Live = `24105ad` with 105 migrations, released with approvals A–D;
  password reset works on live with the `bidridge-live` key.
- Queue: blank Plans after reload (investigate first, maybe real), then
  `touch.spec` stability, then the flaky undo (find its record first).
- Next release: 0105–0106 `laborOnly` + B's code + B's labor rule (never the
  rule alone) + C's tie-labels/CAD layers + the reset early-check.
- One migration list: `migrations-next-batch.md`, 0105–0125+, none written.
- B and C may merge into `local-dev` again; staging follows it.
