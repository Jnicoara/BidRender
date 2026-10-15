# Stress results — overnight run #2 (2026-10-14 → 15)

Measured on this laptop (16 GB), on the dev server (`pnpm dev`) and
`bidrender_local_c`. **The budget is 2 s for any screen or save. One fault
was over it; it is found and fixed, and nothing is over it now.**

## The data (`scripts/stressSeed.mts`, built in 66 s through the app's routes)

- **Stress Co** (stress-c@example.com, local only): 150 bids — Draft,
  Active, Won and Lost — each with a 6-sheet plan set, 3 counts, 30–60
  marks, 2 runs, its counts sent and 3 library assemblies; and **3 huge
  bids: a 60-sheet set, 20 counts, 2,500 marks, 40 runs** each.
- **10 more companies** (stress-c1…c10), 10 bids each.
- `--drop` removes all of it. Sizes are constants in
  `scripts/stressConfig.mts`.

## Fixed: the Dashboard slowed to 2.4 s with eleven companies working

BEFORE: `bids.dashboard` for the 150-bid company took **551 ms alone and
2,379 ms (p50) with 11 companies at once**. Measured by part, 303–367 ms of
it was `dropsNotPricedForBids`, which ran the bid page's full drops
calculation (heights, every run, every sheet scale) for every bid with a
mark — only for `loadGroupDrops` to find that no count had a drop kind.

AFTER: one query for the whole list asks which bids have a count with a
drop kind (the count's own, or its item's "mounts at" — the same
`deviceKind` / `getAssemblyMountKinds` the calculation uses, so it can only
let a bid through that has no drop, never stop one that has). Only those
bids get the full calculation. **Drops: 303 → 19 ms. Dashboard: 551 → 251
ms alone, 2,379 → 398 ms under load**, and the eleven companies got through
55 % more calls in the same 30 s. `dropsNotPricedLists.test.ts` (a drop
known only from the item) and 9 other list/drop suites pass (100 tests).

**Not measured:** the stress bids have no drop kinds. A company that sets
drop heights on most of its bids still pays the full calculation for those
bids — the same cost as before, no worse. If that is common, the next step
is caching each bid's answer.

**Then the case the fix does not cover**, measured: a count that drops
on 62 of the 150 bids → Dashboard **683 ms alone, 2,339 ms (p50) under the
eleven-company load** — over budget again. The per-bid drops calculation
costs 8–13 ms (~10 queries), four bids at a time, through mysql2's default
10-connection pool. The load here is requests back to back (~4 a second per
worker — roughly two hundred real people), so this is the far end; it is
written up in todo.md with the fixes in order of safety, not changed
overnight.

## Server timings (`scripts/stressTime.mts`, after the fix)

Over HTTP exactly as the browser calls (signed in, JSON), 10 runs each.

| What                                   | p50 ms | p95 ms | max ms | reply KB |
| -------------------------------------- | ------ | ------ | ------ | -------- |
| Dashboard (all 150 bids)               | 251    | 278    | 278    | 219      |
| Bids list, first page                  | 82     | 93     | 93     | 38       |
| Bids list, search                      | 79     | 99     | 99     | 38       |
| Recently deleted (bids)                | 16     | 20     | 20     | 0        |
| Bid page — big bid                     | 50     | 68     | 68     | 49       |
| Bid page — normal bid                  | 45     | 59     | 59     | 12       |
| Step bar — big bid                     | 28     | 33     | 33     | 0        |
| Plans: sheet list (60)                 | 16     | 22     | 22     | 13       |
| Plans: marks on one sheet              | 26     | 32     | 32     | 19       |
| Plans: runs on one sheet               | 33     | 52     | 52     | 2        |
| Plans: counts (20 groups, 2,500 marks) | 51     | 75     | 75     | 24       |
| Plans: whole-bid summary               | 57     | 81     | 81     | 3        |
| Proposal — big bid                     | 44     | 67     | 67     | 6        |
| Materials (whole catalog)              | 125    | 152    | 152    | 1,611    |
| Assemblies                             | 27     | 53     | 53     | 150      |
| SAVE: drop one mark (big bid)          | 29     | 40     | 40     | 0        |

**Eleven companies at once, 30 s, 0 errors:**

| What                           | calls | p50 ms | p95 ms | max ms | alone p50 |
| ------------------------------ | ----- | ------ | ------ | ------ | --------- |
| Dashboard (10 companies)       | 303   | 222    | 345    | 433    |           |
| Bid page                       | 303   | 194    | 311    | 355    |           |
| Plans summary                  | 303   | 303    | 417    | 472    |           |
| Bids search                    | 303   | 249    | 357    | 412    |           |
| Stress Co Dashboard (150 bids) | 31    | 398    | 441    | 448    | 251       |
| Stress Co big bid page         | 31    | 271    | 299    | 301    | 50        |
| Stress Co big summary          | 31    | 327    | 411    | 445    | 57        |

- The whole catalog is a 1.6 MB reply: todo.md's "the whole catalog goes
  to the browser" item, inside budget and still open.
- The line-quantity save probe picked a line fed by the plans, which is
  refused by design ("change it by marking"); the probe needs a hand line.

**Saves with eleven companies saving at once** (30 s; each company drops
a mark, removes it, renames its bid and re-reads it, in a loop):

| Save            | calls | p50 ms | p95 ms | max ms |
| --------------- | ----- | ------ | ------ | ------ |
| Drop a mark     | 881   | 76     | 111    | 150    |
| Remove it       | 881   | 81     | 115    | 164    |
| Rename the bid  | 881   | 61     | 93     | 138    |
| Re-read the bid | 881   | 134    | 185    | 236    |

0 errors. (A first attempt changed the bid's status instead of its name;
moving a bid to Active locks its quantities, so its later drops were —
correctly — refused, and the run reported 1,398 "errors" that were the app
working.)

**Server memory across the load runs** (dev server, Windows working set):
689 MB before → 1,001 MB after a 30 s write load → 1,008 → 1,019 MB after
two more. A big first step then ~7–11 MB a round: consistent with caches
warming and lazy garbage collection, NOT a verdict — the dev server carries
Vite and file watching. **Open:** measure a production build
(`pnpm build && pnpm start`) over ~10 minutes of load before calling it
either way.

## Do the screens agree on the money? (`scripts/totalsCrossCheck.mjs`)

After pricing the stress company for real (labor rates, 260 materials,
10 % overhead and 15 % profit, a 9.35 % tax area on every third bid,
per-bid overrides on others, 189 new lines frozen at those prices):

- **151 bids, 44 with real totals: the Dashboard card, "Find a bid", the
  bid page and the proposal agree to the cent on every one** — 0
  disagreements.
- **Each priced bid's own chain holds**: direct = material + labor +
  charges; + material markup; + overhead; + profit; + tax; and the lines
  add up to the direct cost — 44 of 44, 0 broken. (A first version read a
  line field that does not exist and silently skipped the line rule; the
  script now reports how many bids each rule was actually evaluated on.)

## Screens in a real browser (`scripts/stressScreens.mts`)

Time from opening the address to the real content (first bid card, the
drawn sheet, the bid total…), 3 fresh loads each.

| Screen                                          | laptop median ms       | phone 375 median ms |
| ----------------------------------------------- | ---------------------- | ------------------- |
| Dashboard (150 bids)                            | 928 (5,536 first ever) | 903                 |
| Bids list                                       | 956                    | 927                 |
| Plans list                                      | 941                    | 935                 |
| Bid page — big bid                              | 949                    | 934                 |
| Plans screen — big bid, sheet drawn (60 sheets) | 1,534                  | 1,469               |
| Count screen — big bid                          | 954                    | 942                 |
| Proposal — big bid                              | 938                    | 949                 |
| Recently deleted                                | 428                    | 945                 |
| Materials                                       | 531                    | 949                 |

- The ~0.9 s floor is the dev server loading unbundled modules; a
  production build is smaller. The 5.5 s first Dashboard is the dev server
  compiling for the very first browser visit; every load after it is 0.9 s.

## The 500-sheet set (user 1's "Large set check", 270 MB, local disk)

Measured in Chrome at laptop size, signed in the device audit's way, bytes
from Playwright's `request.sizes()` (what actually arrived — a first
attempt summed `content-length` and reported ~276 MB a sheet, which is the
size of the streams pdf.js aborts on purpose; wrong, and caught before use).

| Open      | Sheet drawn | Plan bytes in the first 4 s |
| --------- | ----------- | --------------------------- |
| Sheet 1   | 3,041 ms    | 7.2 MB in 24 range requests |
| Sheet 400 | 2,530 ms    | 2.1 MB in 6 range requests  |

Byte-range loading works as designed (CLAUDE.md § Large plan sets). The
time is **over the 2 s budget** and it is inside the plan viewer (Track B's
TakeoffPage / pdfRenderer worker), so it is written up for B rather than
changed here: next step is splitting it into open-document, page-fetch and
render time to see which part to work on.

## Failure drills — the database (`scripts/dbFaultProxy.mts`)

One dev server pointed at the proxy (`DATABASE_URL=…@127.0.0.1:3399/…`),
MySQL itself untouched. Driven in Chrome, laptop size, signed in as Stress
Co. Screens in `references/overnight-shots/drill-*.png`.

| Database                                        | BEFORE (what a signed-in contractor saw)                                                                                                                                                       | AFTER                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Down**, page reloaded                         | **The public landing page** ("Sign in · Get early access"), so they look signed out, maybe with their account gone; any protected call answered "Please login", which **redirects to sign in** | "Can't reach BidRidge right now — you're still signed in and nothing you saved is lost", retried every 10 s, **address kept**; back by itself when the database returns |
| **Down**, app already open                      | Dashboard: **"No bids yet. Create one to start pricing a job."** to a company with 150 bids; header "Out for bid (0) · total due **$0**"                                                       | "Couldn't load your bids. They're safe — this is a connection problem." + Try again; header shows "—"                                                                   |
| Down: Plans list, Recently deleted, Bids search | "No plans yet" / **"Nothing here"** (the deleted bid you came to restore, reported gone) / "Bids you create will show up here"                                                                 | The same "Couldn't load …" + Try again (`LoadFailed.tsx`)                                                                                                               |
| Down: a save (status change)                    | Refused; stored value unchanged                                                                                                                                                                | Same — **nothing lost or half-saved**                                                                                                                                   |
| **Slow** (4 s a packet)                         | Header "Out for bid (0) · total due **$0**" above "Loading bids…" for 11 s+                                                                                                                    | Header "…" until the real number arrives                                                                                                                                |

Fixes: `server/_core/context.ts` (a VALID session the database cannot load
is `sessionUnavailable`; `auth.me` and both "must be signed in" checks
answer SERVICE_UNAVAILABLE; a deleted person with the database up is still
signed out — `server/sessionUnavailable.test.ts`, 4 cases), `AuthGuard`,
`DashboardPage`, `LoadFailed` on Plans, Recently deleted and Bids search.

## Failure drills — file storage and AI

| What failed                                   | BEFORE                                                                                                          | AFTER                                                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A plan set whose file is missing from storage | Plans screen: "Gone set.pdf could not be opened · Could not fetch the plan (404)"; the rest of the screen works | Unchanged — already honest. Could say what to do ("upload it again"): Track B's screen, noted for B                                                                                                            |
| AI service hangs ("Find it" helper)           | **361 s** (120 s × 3 tries), then "I'm not sure which screen you want" — blaming the question                   | **15 s**, then "The helper didn't answer just now. Every screen is in the sidebar, and "Where do I…?" finds them without it." (`timeoutMs` on `InvokeParams`, honoured by both AI paths, no retries inside it) |
| AI service hangs (plan reader)                | Same provider default, up to ~6 min                                                                             | **Not changed** — its normal time on a big sheet is not measured, and a too-tight cap turns slow-but-working reads into failures. Morning question Q-AI1                                                       |

Drilled with the AI client aimed at a local server that never answers (a
fake key; nothing left this machine). Not drilled: a hang on a fresh page
load (the hang step reused an open page and proved nothing), storage that
refuses uploads.
