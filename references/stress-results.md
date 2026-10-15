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

## Eleven companies WRITING at once, production build (2026-10-15)

60 s, each company in a loop: drop a mark, remove it, rename its bid, read
the bid back. 1,872 rounds, **0 errors**.

| Call   | p50 ms | p95 ms | max ms |
| ------ | ------ | ------ | ------ |
| drop   | 74     | 112    | 152    |
| remove | 78     | 115    | 167    |
| rename | 58     | 93     | 128    |
| read   | 129    | 178    | 236    |

Data left as found: no bid still renamed, no mark at the drop point.

## Sign-in burst (2026-10-15)

11 sign-ins sent at once, production build, with an ordinary bid read
polled every 50 ms from a session already signed in:

| What                    | Result                                     |
| ----------------------- | ------------------------------------------ |
| Sign-ins                | 11 of 11 ok, each ~680 ms, all done 687 ms |
| A bid read, quiet       | p50 42 ms, max 73 ms                       |
| A bid read, during them | **701 ms** — and only 1 read got through   |

`bcryptjs` (pure JavaScript, cost 12) hashes on the main thread; its
"async" chunks did not let the read in. Not changed tonight — moving it
off the main thread changes the server's dependencies or build (Track A):
morning question Q-AUTH1.

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

**Measured 2026-10-15 — closed.** Production build (`node dist/index.js`),
11 companies for 600 s: 27,000+ calls, 0 errors. Working set sampled every
20 s: **336 MB at the start, 344 MB at the end**, never above 344 and
wandering 336–344 throughout — no growth under sustained load. Latency
under that load, p50 / p95: Dashboard 226 / 373 ms, bid page 276 / 421,
Plans summary 323 / 474, bids search 239 / 389; the owner's big bid page
275 / 344.

## First load on a phone: the app's own download (production build)

Measured in Chrome against `pnpm build` + `node dist/index.js`, cold cache,
JavaScript needed before the Dashboard shows (gzipped, as live serves it):

| Build                                   | JS for the Dashboard | ~at 200 KB/s (weak 4G) |
| --------------------------------------- | -------------------- | ---------------------- |
| Before (every page in the shell bundle) | 834 KB               | ~4.2 s                 |
| After (pages load on demand)            | **217 KB**           | **~1.1 s**             |

**Fixed:** pages are `lazy()` with `reloadingImport`
(`client/src/lib/lazyPage.ts`): a page file that a deploy replaced reloads
the tab ONCE (driven: a 404 on the Bids file → one reload → Bids shown),
never in a loop. A quiet "Loading…" only after 300 ms (`PageLoading`), and
every page is fetched in the background 4 s after the first screen, so
later clicks stay instant. The signed-out landing page was already lean:
148 KB gzipped (~0.7 s) — the app's code was never on it. Against the
production build: newScreens, guide and the smoke screens spec, 103 passed
at four sizes.

### The ~300 ms nobody was using (2026-10-15)

With the code split, the waterfall showed a gap with nothing in it: the
"who am I" check answered at ~60 ms, and the Dashboard's data request did
not LEAVE until ~360 ms. A timer trace put the wait in React's scheduler —
React 19 reveals a Suspense boundary's content in ~300 ms batches, and the
shell sat behind one.

**Fixed:** `client/src/lib/preloadable.ts`, in two passes.

1. A browser that has been signed in before starts fetching the shell at
   once, in parallel with the "who am I" check, and a loaded module renders
   directly. That fixed the returning user only — a re-measure with the
   remembered user removed (every first sign-in on a device) still showed
   data at ~368 ms and the screen at ~895 ms.
2. So the loader no longer uses Suspense at all: until its code is here it
   shows its own fallback (the shell's spinner, `PageLoading` for a page)
   and swaps the page in with an ordinary state update, which React does
   not throttle. A failed load is thrown to the error boundary as before.

Production build, warm cache, stress account (151–154 bids), timing from
navigation to the first "Stress job" row:

| Dashboard                       | Data request leaves | Dashboard shown |
| ------------------------------- | ------------------- | --------------- |
| Before, returning user (1 run)  | 368 ms              | 879 ms          |
| Before, first sign-in (2 runs)  | 367–369 ms          | 893–898 ms      |
| After, returning user (13 runs) | **67–84 ms**        | **386–421 ms**  |
| After, first sign-in (3 runs)   | **80–83 ms**        | **367–419 ms**  |
| After, phone 375 (3 runs)       | **68–73 ms**        | **394–413 ms**  |

Two returning-user runs out of ~28 showed the screen ~500 ms AFTER the data
had arrived (897, 930 ms). Not reproduced in 15 more runs; not explained.

Re-driven on this build: a page file missing after a deploy reloads the tab
once and shows Bids; a file that STAYS missing reloads once, then shows
"BidRidge has been updated… Refresh" — no loop; a page file that takes 3 s
shows nothing for the first 300 ms, then "Loading…" with the sidebar still
there. Landing page unchanged: 148 KB gzipped, one file.

## 50 plan sets on ONE bid (bid "Stress fifty plan sets", 2026-10-15)

The account already held 153 sets, one or two per bid; this is the other
shape — a job that piled up addenda. Attached through the browser's own
three calls (ticket → PUT → `confirmAttach`) by a scratch script: 50 sets
in 3.2 s. Production build, 3 fresh loads each:

| Screen                          | laptop ms | phone 375 ms |
| ------------------------------- | --------- | ------------ |
| Bid page                        | 256–267   | 157–271      |
| Plans screen, first sheet drawn | 887–911   | 862–893      |
| Plans list                      | 348–371   | 366–402      |

No sideways scroll at either size. The Plans screen lists "50 DOCUMENTS"
in its own scrolling box above the sheets; the bid page says "Plans · 50
plan sets". (Count is left out: since tonight its header shows "… ·
counting mode" while loading, so that probe fires before the data.)

## 2,000 marks on ONE sheet (bid "Stress dense sheet", 4 counts × 500)

The brief's "bids with 2,000+ marks" taken at its hardest: all on one sheet,
not spread over 60.

| Size            | Sheet drawn and "2000 marks" shown (3 loads) | One zoom step painted |
| --------------- | -------------------------------------------- | --------------------- |
| Laptop 1440×900 | 2,037 / 2,266 / 1,985 ms                     | 251 ms                |
| Phone 375×812   | 1,845 / 1,655 / 1,877 ms                     | —                     |

At the 2 s line on the dev server (unbundled modules add ~0.9 s to every
screen here — see below), correct, and usable. Inside Track B's viewer, so
noted for B rather than changed. Screenshot:
`overnight-shots/stress-dense-sheet-laptop.png`.

**Production build, 2026-10-15:** laptop **1,059 / 917 / 923 ms**, one zoom
step 107 ms; phone **924 / 918 / 904 ms**. Well under 2 s — the dev-server
numbers above were the dev server. Nothing for B to chase here.

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

**Second round, every pricing path exercised:** 25 assemblies given labor
hours, roles and (on a third) a modifier; 126 more lines; company sales
tax switched on for materials (it was off, and the bid page said so).
Paths now covered — labor on 71 bids, the productivity factor on 12,
modifiers on 43, sales tax on 10. **73 priced bids: still 0
disagreements across the four screens, 0 broken rules.** The script now also
compares the figure the CUSTOMER reads on the proposal
(`document.investment.total`) — compared on all 151 bids, 0 disagreements.

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

### The same screens on the production build (2026-10-15)

`pnpm build` + `node dist/index.js`, after the loader fix above, 5 loads
each, 154 bids:

| Screen                                          | laptop first / median ms | phone 375 first / median ms |
| ----------------------------------------------- | ------------------------ | --------------------------- |
| Dashboard                                       | 412 / 382                | 399 / 370                   |
| Bids list                                       | 239 / 258                | 261 / 259                   |
| Plans list                                      | 352 / 374                | 364 / 378                   |
| Bid page — big bid                              | 307 / 289                | 285 / 271                   |
| Plans screen — big bid, sheet drawn (60 sheets) | 924 / 890                | 920 / 891                   |
| Count screen — big bid                          | 270 / 264                | 267 / 271                   |
| Proposal — big bid                              | 214 / 143                | 158 / 156                   |
| Recently deleted                                | 84 / 107                 | 97 / 108                    |
| Materials                                       | 100 / 178                | 110 / 146                   |

Every screen under 1 s at both sizes. Before the loader fix the FIRST
Dashboard load was 889–893 ms; it is now 399–412. The Plans screen is the
slowest because its time includes drawing the sheet (B's viewer).

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

**Production build, 2026-10-15** (the numbers above were the dev server):
opening the set to sheet 1 drawn **1,897 / 1,929 / 1,905 ms** at laptop,
**1,875 / 1,916 / 1,909 ms** at phone 375; the next sheet drawn in 977 ms /
764 ms. **Just under 2 s, with ~100 ms to spare** — not over, but the first
thing a heavier set would push past it. Session minted in memory for user
1 and handed to the browser as a cookie; never printed or written.

## Memory in the browser: going back and forth all day (2026-10-15)

Production build, laptop. Dashboard → the 2,000-mark Plans screen → bid
page → Dashboard, over and over; after each round the JS heap is collected
(`HeapProfiler.collectGarbage`) and read through the DevTools protocol, so a
number that stays is memory something still holds.

| After round | BEFORE heap / DOM nodes / listeners | AFTER                     |
| ----------- | ----------------------------------- | ------------------------- |
| 0           | 18.4 MB / 17,383 / 4,904            | 16.0 MB / 2,793 / 545     |
| 5           | 37.1 MB / 90,333 / 26,699           | 18.4 MB / 2,793 / 545     |
| 15          | **70.0 MB / 236,233 / 70,289**      | **19.1 MB / 2,793 / 545** |

**Which screen:** one leg at a time, 6 trips each — Dashboard ↔ Trash,
↔ bid page, ↔ Materials held nothing measurable; **↔ Plans screen held
+14,590 nodes and +4,359 listeners per trip**: its whole drawing.

**Why, from a heap snapshot** (shortest path from the GC root to a detached
node): Window → a pending timer → a React Query **mutation** → its
`onSuccess` closure → a ref → the Plans screen's `<canvas>`
(`TakeoffPage.tsx:2924`). A detached node still links to its parent, so
that one ref kept all 21,000 detached objects (4,290 SVG paths, 4,010
circles, 4,000 "Show this one on the drawing" buttons…). The timer is
React Query's 5-minute garbage collection for FINISHED mutations; every
Plans visit fires a few saves (page count, sheet reads, scale). Confirmed
by waiting: 90,329 nodes after six visits, unchanged at 1 and 3 minutes,
**2,789 at 5½** — bounded, but each visit inside the window stacked a copy.

**Fix:** `new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } })`
in `main.tsx` — a finished mutation is let go once nothing on screen
watches it. Nothing in the app reads finished mutations (no
`useMutationState` / `useIsMutating`). Plans trips now hold **+0 nodes, +0
listeners**. Smoke suite at four sizes: 140 passed.

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

### Second round: every other screen, database down with the app open (2026-10-15)

Production build through the proxy. Dashboard opened normally, database cut,
then each screen opened in-app so it had to fetch fresh. Text read off the
screen; screenshots `overnight-shots/drill-dbdown-*.png`.

| Screen                                          | BEFORE                                                                    | AFTER                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Bid page                                        | **"That bid could not be opened — it may have been archived or deleted"** | "Couldn't load this bid. Nothing is lost…" + Try again      |
| Count screen                                    | **"Quick bid · 0 lines · counting mode"**, ready to count into            | Same "Couldn't load this bid" + Try again                   |
| Materials                                       | Empty table, **"Needs pricing 0 · Needs hours 0"**                        | "Couldn't load your materials" + Try again; counts read "—" |
| Assemblies                                      | **"No assemblies yet. Build your first one."**                            | "Couldn't load your assemblies" + Try again                 |
| Clients                                         | **"No clients yet"**, tab "Working list 0"                                | "Couldn't load your clients" + Try again; no count          |
| Crew                                            | **"In this company (0)"**                                                 | "Couldn't load your crew" + Try again; no count             |
| Settings › Pricing                              | **Blank**                                                                 | "Couldn't load your pricing settings" + Try again           |
| Settings › Branding                             | Blank (same `return null`)                                                | "Couldn't load your letterhead" + Try again                 |
| Settings › Proposal                             | Blank (same)                                                              | "Couldn't load your proposal settings" + Try again          |
| Settings › Heights                              | Blank (same)                                                              | "Couldn't load your heights" + Try again                    |
| Performance                                     | **Blank**                                                                 | "Couldn't load your figures" + Try again                    |
| Labor rates (not cached)                        | **"No roles yet. Add your first one"**                                    | "Couldn't load your labor rates" + Try again                |
| Kits                                            | **"No kits yet"**                                                         | "Couldn't load your kits" + Try again                       |
| Modifiers                                       | **"Active 0 · Archived 0"**, "No modifiers in the working list"           | "Couldn't load your modifiers" + Try again; no counts       |
| Settings › Sales tax                            | **"Charge sales tax" switch OFF**, "No tax areas yet"                     | "Couldn't load your sales tax settings" + Try again         |
| Bids list                                       | "0 bids" above a correct "Couldn't load your bids"                        | No count over a failed list                                 |
| Proposal, Plans list, Recently deleted, Account | Already honest                                                            | Unchanged                                                   |

The second half of the table came from a SECOND pass, opened from Settings ›
Display so nothing was cached — the first pass, opened from the Dashboard,
had Labor rates already in memory and so missed it. The Sales tax switch
is now also disabled until its setting is known, so a load in flight
cannot show "off" either.

**And one net under all of them, including screens not written yet:**
`client/src/lib/dataReach.ts` + `components/DataUnreachableBar.tsx`. Any
read that fails because the data is out of reach (`SERVICE_UNAVAILABLE`, or
no answer at all) raises a bar at the top — "BidRidge can't reach your data
right now. What's on screen may be incomplete. Nothing you saved is lost" —
which re-asks every 15 s and falls on the next read that answers. A
NOT_FOUND, FORBIDDEN or bad input never raises it (`dataReach.test.ts`).

Driven at phone width: healthy, six screens — bar never shown; database
slow (2.5 s a packet) — never shown, list loaded; down — bar up and the
list says it couldn't load; database back — **bar gone by itself after
9.2 s**, assemblies listed.

### Third round: the database STALLS — answers nothing, errors nothing (2026-10-15)

`dbFaultProxy.mts` gained a `stall` mode: bytes are HELD and delivered
when the stall ends, which is what TCP does across a network blackhole.
(`hang` throws them away — harsher than any healthy network.)

| What                                       | BEFORE                                                                                                                                                                                                | AFTER                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Screen opened during a 70 s stall          | **"Loading assemblies…" for the whole 70 s**, no word (React Query quietly retries each 20 s deadline; the error lands after ~80 s)                                                                   | "Loading…" + **the bar at 20 s** — the deadline now raises it (`withQueryDeadline(…, onGiveUp)`) |
| Stall ends                                 | Screen filled in 1 s; a fresh read answered in 79–111 ms                                                                                                                                              | Same, and the bar clears itself                                                                  |
| One 40 s `hang` (bytes lost), then back    | Recovers: fresh read 45 ms, screen filled in 3 s                                                                                                                                                      | Same                                                                                             |
| **Three `hang`s, 8 reads each, then back** | **The server stops answering every database read — for good.** 40 of 40 reads timed out at 30 s; sign-in still dead minutes later; `/api/version` (no database) still 200. Only a restart cleared it. | **Not fixed — Track A's layer. Q-DB1.**                                                          |

**Why the last one happens.** Each read sent into a hang leaves its pooled
connection (mysql2, 10 by default) waiting forever for a reply. Three rounds
of 8 used up all 10; every later read queues behind them. mysql2's own
per-query `timeout` does NOT help as it stands: it reports an error but
leaves the connection waiting for the old reply, and the pool hands it out
again out of step. A fix has to DESTROY a connection whose query passes a
time limit — in `server/db.ts` / `server/slowRequests.ts`, which every
track and live share, and without cutting the nightly backup's long reads.

**Is it real?** Lost bytes are not, on a healthy network. The real-world
version is a database failover or a dropped path that leaves connections
half-open: Linux TCP gives up on an unanswered connection after ~15
minutes, so the app would stay dead for up to ~15 minutes AFTER the
database is back. And a health check that does not touch the database
(like `/api/version`) would call that server healthy throughout — which
check App Platform uses is not written down anywhere in `references/`.

### Fourth round: a SAVE while the database is down (2026-10-15)

A bid line's quantity (4), changed to 9 and Enter pressed with the database
down, screen already open. Read every few hundred ms.

| Moment                     | BEFORE                                                                                   | AFTER                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Enter pressed              | **Field flashed green — "saved"** — for a save that was refused                          | No green. Field turns **red, keeps the 9**, says "… not saved" aloud; toast says why |
| A few seconds later        | Whole bid page swapped for "That bid could not be opened" (the save's refresh failed)    | Page stays; the top bar says the data is out of reach                                |
| Database back              | (round-2 build) **field showed 9, database held 4** — a refused number that looked saved | Still red with the 9: visibly not saved                                              |
| Enter again                | —                                                                                        | Saves: green, stored 9, red mark gone                                                |
| Escape instead             | —                                                                                        | Back to the stored value, mark gone                                                  |
| Database healthy (control) | Green, stored                                                                            | Same — green after the server answers                                                |

**Fixes.** `InlineNumberField`'s `onSave` may return the save's promise:
the tick waits for it, and a refusal marks the field unsaved instead of
throwing the typed value away (wiping it would lose the person's change;
keeping it unmarked is the wrong-number fault). Every call site outside
`components/takeoff/` now returns `mutateAsync` — line quantity, hours and
material cost on hand-priced lines, labor rates, work-step minutes, bid
overhead/profit, the old catalog editor. A caller that returns nothing
behaves as before. Separately, a failed REFRESH no longer replaces a page
or list that already has its data (`isLoadingError`, not `isError`, on 11
screens; the bid and Count pages keep the bid on screen) — that is what
had swapped the bid page out.

## Failure drills — file storage and AI

| What failed                                   | BEFORE                                                                                                          | AFTER                                                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A plan set whose file is missing from storage | Plans screen: "Gone set.pdf could not be opened · Could not fetch the plan (404)"; the rest of the screen works | Unchanged — already honest. Could say what to do ("upload it again"): Track B's screen, noted for B                                                                                                            |
| AI service hangs ("Find it" helper)           | **361 s** (120 s × 3 tries), then "I'm not sure which screen you want" — blaming the question                   | **15 s**, then "The helper didn't answer just now. Every screen is in the sidebar, and "Where do I…?" finds them without it." (`timeoutMs` on `InvokeParams`, honoured by both AI paths, no retries inside it) |
| AI service hangs (plan reader)                | Same provider default, up to ~6 min                                                                             | **Not changed** — its normal time on a big sheet is not measured, and a too-tight cap turns slow-but-working reads into failures. Morning question Q-AI1                                                       |

Drilled with the AI client aimed at a local server that never answers (a
fake key; nothing left this machine). Not drilled: a hang on a fresh page
load (the hang step reused an open page and proved nothing).

**Closed 2026-10-15 — there is nothing to hang on a page load.** Every AI
call starts from a click: "Find it" from its submit
(`NavigationHelper.tsx`), alias suggestions from a button
(`AliasSuggestions.tsx`, which has no effects at all), and the plan reader
is held to it by `server/aiCallsAreButtons.test.ts`. Those are the only
three routers that call the model (`materials`, `navigation`,
`planCopilot`). A screen's load never waits on the AI.

### Storage that refuses an upload (2026-10-15)

Drilled on the production build by putting a plain FILE where the stress
account's upload folder goes, so the server's write fails for that one
account (folder restored afterwards). Control run first, storage working:
upload → attach → sheets, all 200.

With storage refusing: the PUT got a 500, nothing called `confirmAttach`,
and the Plans screen said "Storage refused drill-plan.pdf with an HTTP 500.
The upload reached storage, so this is not a connection problem — it is
worth reporting rather than retrying", with a **Retry** button. After a
reload the bid shows NO plan — it does not claim a set it does not have, and
no half-written file was left on disk. **Passes.** One wording note for B
(TakeoffPage is B's screen): "rather than retrying" sits beside a Retry
button; on a full disk a later retry is exactly what works. Screenshots:
`overnight-shots/drill-upload-refused*.png`.
