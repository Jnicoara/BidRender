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

Not yet drilled: file storage unreachable, AI unreachable or slow, a hang
on a fresh page load (the hang step reused an open page and proved nothing).
