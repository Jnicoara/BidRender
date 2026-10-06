# BidRender TODO

Entries below v5.75 say "BidPhase" — that was the name at the time, and they are
left as written rather than rewritten to match the rename.

## Open tabs keep running the OLD code after a deploy — plan, 2026-09-30

> **BUILT 2026-09-30 on `a-version-bar`: steps 1–4 below.** Bar:
> `client/src/components/NewVersionBar.tsx` + `@/lib/versionCheck` (tested).
> Server: `server/staticCaching.ts` (404 for a missing asset, no-cache on the
> shell, immutable assets; tested over real HTTP). Worker: `sw.js`
> `isCacheableAsset`, `CACHE_VERSION` v2 (tested by RUNNING sw.js). Chunk
> failure: `vite:preloadError` + an "updated, refresh" error screen. Checked
> on a local production build. **Still open: the hard-refresh question
> below.** Do the staging check on the next deploy.

**Yes, they do.** A tab that was open before a deploy keeps the old JS in
memory until the page is reloaded. Nothing tells it a new build exists:
`/api/version` (`server/_core/index.ts`, `no-store`, returns `builtAt` and
`commit`) is polled by nothing in `client/src`, and the service worker
(`client/public/sw.js`) has no `updatefound` / `controllerchange` handling.
So a fix like 6a3defa (proposal never shows $0) does not reach somebody with
BidRidge already open. They keep printing $0 until they happen to refresh.
That is a wrong-number risk, not just a cosmetic one.

**Why staging needed a HARD refresh is NOT explained by the code. Find out
before building on a guess.** Read from the source:

- navigations are network-first (`sw.js` `networkFirstDocument`), and Express
  serves `index.html` with `max-age=0` + ETag, so a plain reload should fetch
  the new `index.html` and its new hashed assets;
- `/assets/*` is cache-first FOREVER (`cacheFirst`), and a missing asset falls
  through the `"*"` route in `server/_core/vite.ts` `serveStatic` as
  `index.html` with a **200**, which `cacheFirst` then STORES under the asset's
  URL. A request that reaches an old instance mid-rollout could therefore pin a
  broken asset in that browser until the caches are cleared. A hard refresh
  bypasses the service worker, which would fit what was seen;
- or the plain reload simply came before the 3–6 minute rebuild was serving.

Check on the next staging deploy: before refreshing, record the loaded
`index-*.js` (DevTools → Sources) against what `/` serves now, and look in
Application → Cache Storage → `helixbid-assets-v1` for an entry whose
content-type is `text/html`.

**The fix, small, in this order:**

1. **"New version available — Refresh" banner.** A client hook reads its own
   build stamp (`client/src/lib/buildStamp.ts`, already baked in at build)
   and polls `/api/version` every ~5 min and on `visibilitychange` → visible
   (when somebody returns to the tab, which is the common case). If `commit`
   differs, show a non-modal bar with a Refresh button. **Do not auto-reload:**
   a reload can drop a typed draft, an unsent stamp batch or an open dialog.
   The bar says what to do and the user picks the moment. Skip in dev (no
   stamp). The comparison goes in `client/src/lib` so vitest can reach it:
   same commit / different commit / unreachable / no stamp. Unreachable must
   never show the bar.
2. **Never answer a missing `/assets/*` with `index.html`.** In `serveStatic`,
   send a 404 for `/assets/` paths before the `"*"` fallthrough. In `sw.js`
   `cacheFirst`, only cache a response whose content-type is not `text/html`.
   Bump `CACHE_VERSION` so any poisoned entry is dropped (check
   `server/pwa.test.ts`, which pins sw.js behaviour).
3. **Recover from a failed chunk load.** Listen for `vite:preloadError` (the
   lazy `BidRenderShell` import in `App.tsx`) and show the same Refresh bar
   instead of a blank screen. Guard it so it cannot loop.
4. **Optional: `Cache-Control: no-cache` on `index.html`** and
   `public, max-age=31536000, immutable` on `/assets/*`, so no proxy or CDN
   ever holds an old shell.

Not in scope: forcing every open tab to reload, or `skipWaiting`. Both are
deliberately absent (`sw.js` header, `pwa.test.ts`) for the reason in step 1.

## SaaS Multi-User Upgrade (v4.0)

- [x] Upgrade project to full-stack (database + auth + backend server)
- [x] Design and implement 10-table database schema for multi-user isolation
- [x] Add passwordHash and emailVerified fields to users table
- [x] Build email/password signup procedure (bcrypt, session cookie)
- [x] Build email/password login procedure (timing-safe comparison)
- [x] Build logout procedure
- [x] Build change-password procedure
- [x] Wire all feature routers (auth, projects, data) into main appRouter
- [x] Build server-side db.ts helpers for all 10 tables
- [x] Build AuthGuard component (shows LoginPage when unauthenticated)
- [x] Build LoginPage with email/password form, signup/login toggle, show/hide password
- [x] Build DataConnectorsPanel with 3 tabs: Materials DB, Labor Standards, API Connectors
- [x] Materials DB tab: CSV/JSON upload, column normalization, bulk import, clear all, preview table
- [x] Labor Standards tab: JSON-based profile editor, create/edit/delete profiles, default flag
- [x] API Connectors tab: Platt/Rexel/WESCO/generic REST, API key storage, connection test
- [x] Add AccountSection to SettingsTab (signed-in user display + sign out button)
- [x] Copyright audit: update electricalDatabase.ts header to clarify original authorship
- [x] Remove all NECA Column 1 inline comments, replace with "original estimate"
- [x] Write vitest tests for email/password auth (signup, login, logout) — 7 tests pass
- [x] Dual-mode Assembly/Item estimate engine (from previous session)
- [x] 28 pre-built electrical assemblies seeded into electricalDatabase.ts

## Pending / Future

### Track A next migration batch

Requests waiting for Track A, which numbers and writes the migrations.

> **ALL NUMBERED 2026-10-06 (Track A), none written yet — see
> `references/migrations-next-batch.md` on `a-migrations-plan`**, the one
> list of every track's asks. In short: `distributionHeightInches` is in
> 0107 (with C's `contentHash`); `mountHeightTypeKey` and `materialByQuote`
> in 0108 (with the remove/relocate hours); `bid_quotes` is 0112; the six
> `bid_line_items` quote columns go in 0113 with `lineRole`; the quoted-line
> markup is `pricing_defaults.quotedMarkupPct`, 0114. `laborOnly` joins 0108
> only if the owner says yes. (An earlier note here said 0108–0112 for
> fewer items; superseded.)

- [ ] **`bid_pdf_sheets.distributionHeightInches INT NULL`** — this
      sheet's run height (Track B, owner's answer b, 2026-10-05). ADDITIVE,
      nullable, **no DEFAULT** (NULL = follows the job, and must stay
      distinguishable from any answer). Step 1 of the three-step deploy: no
      `UPDATE`, no backfill. Once it lands, Track B makes the run height chain
      run → sheet → job → company. references/vertical-drops-plan.md § 7.
- [ ] **`assemblies.mountHeightTypeKey VARCHAR(64) NULL`** — the height TYPE
      this assembly's device mounts at, a key of the heights list
      (`receptacle`, `switch`, or a company's own) — NOT inches, so it
      re-prices through job → company → shipped like every other height
      (Track B, owner's answer c, 2026-10-05). ADDITIVE, nullable, **no
      DEFAULT** (NULL = not said; a count asks, as today). No backfill. Once
      it lands, Track B starts a new count's `dropKind` from it.
      references/vertical-drops-plan.md § 7.

**Quote items** (Track B, owner-answered 2026-10-05;
references/quote-items-plan.md § 8). All ADDITIVE, nullable, **no
DEFAULT**, no backfill — step 1 of the three-step deploy.

- [ ] **`bid_line_items.bidUnitCost DECIMAL(12,4) NULL`** — material per
      unit priced ON THIS BID; NULL = none. **SHARED with the price-box item**
      ("Before beta: price an unpriced line right where it blocks you"):
      one column for both, never two. Read by `lineNotPriced` AND its SQL copy
      `lineNotPricedSql` together.
- [ ] **`bid_line_items.isQuoteItem BOOLEAN NULL`** — this line's material
      comes from a supplier quote. NULL = no. Starts from the assembly's flag.
- [ ] **`bid_line_items.quoteId INT NULL`** — FK `bid_quotes.id`, ON DELETE
      SET NULL.
- [ ] **`bid_line_items.quoteShare DECIMAL(12,2) NULL`** — a typed share of
      a package price. NULL = computed by the spread.
- [ ] **`bid_line_items.quoteItemKey VARCHAR(255) NULL`** — the frozen "same
      item" key for carrying the last quote forward.
- [ ] **`bid_line_items.quoteNote VARCHAR(500) NULL`** — notes for the
      supplier request list (can wait for the first build).
- [ ] **`assemblies.materialByQuote BOOLEAN NULL`** — new lines from this
      assembly start as quote items. NULL = no.
- [ ] **New table `bid_quotes`**: `id`, `bidId` (FK, cascade), `userId`,
      `supplierName VARCHAR(128) NULL` (free text, like
      `materials.supplierName`), `quotedOn DATE NULL`, `packagePrice
DECIMAL(12,2) NULL` (NULL = per-item quote; set = one package price),
      `carriedFromBidId INT NULL` (provenance only, **no FK** — the old bid may
      be deleted; set = a carried quote, "not updated"), `note VARCHAR(500)
NULL`, `createdAt`, `updatedAt`. Index (`userId`, `bidId`).
- [ ] **The company's quoted-line markup %** (material-markup D4; owner
      answer c: ONE company-wide number) — a nullable decimal beside the
      company markup default; A picks the table. NULL = no quoted-line rule.

**Also worth a column (Track B, 2026-10-05, not yet owner-asked):** a way to
say an assembly has **no material on purpose** (labor only). Since today's
"labor with $0 material is never fully priced" rule, a genuinely labor-only
assembly reads "+ material not priced" with nothing to clear it. A nullable
`assemblies.laborOnly BOOLEAN` would let `lineMaterialNotPriced` skip it.
Owner's call before A builds it.

### Requests to Track A from Check sheet (Track C, 2026-10-01) — A numbers these

Check sheet shipped code-only on track-c without any of these; each is behind
an OFF switch in `shared/sheetCheckSwitches.ts` or is said plainly on screen.
All additive and nullable. Specs are in the plans named.

- [ ] `symbol_looks` table — a legend look WITH its box, so the check needs no
      "Whole legend" in this tab first (today the boxes live in sessionStorage,
      `@/lib/sheetCheckSession`). `references/multiple-looks-plan.md` § 6.
- [ ] `takeoff_stamps.mountHeightInches decimal(7,2) NULL` +
      `mountHeightSource` — lets a height read beside a mark be SAVED on it
      (`MARK_HEIGHT_COLUMN`). NULL must stay distinct from 0.
      `references/check-my-marks-plan.md` § 10.
- [ ] `takeoff_stamps.checkAcceptedAt timestamp NULL` — "Keep" remembered past
      this check (`MARK_CHECK_ACCEPTED_COLUMN`). check-my-marks-plan § 7.
- [ ] `ai_usage`/ask log `askKind` + `askFingerprint`, and
      `bid_pdf_sheets.contentHash` — so the same tie on the same drawing is
      never paid for twice. `references/legend-and-notes-automation-plan.md`.

### Capture fixes must ship in the next live release

- [ ] **Remove `C:\dev\BidPhase-C-site` after the reader accuracy test, and
      never commit or merge from it.** It is a detached git worktree (at
      `52a6b0b` since 2026-10-01; was `9851c86`) that serves the counter's
      test site on port 3004
      (2026-09-30), so edits in `C:\dev\BidPhase-C` cannot hot-reload into
      the page he is counting on. Its `.env` points `LOCAL_STORAGE_DIR` at
      `C:\dev\BidPhase-C\.local-storage`. It exists only to run; nothing in it
      is work. Moving it to newer code reloads his page, so ask the owner
      first. To remove: stop its `pnpm dev`, then
      `git worktree remove --force ../BidPhase-C-site` from `C:\dev\BidPhase-C`.
      **3004 does NOT have** "Move to…", the review page's jump-to-spot link,
      or Find all matching (`895cd7c`…`74b040a`) — moving it to them reloads
      his page, so ask first.
- [ ] **Whoever merges track-c: two small conflicts in `LegendPanel.tsx`
      with Track B's 8a.** Keep BOTH buttons, and B's `text-xs`.
- [ ] **Capture fixes (258718d + blur fix) must ship in the next live
      release.** Both are on `track-c` only (2026-09-30). Checked that day:
      live (`3ca33dc`) and staging (`0af50a6`) both still draw the "Name
      this symbol" box inside the zoom transform (`SymbolCapture.tsx`, the
      inline `absolute top-3 left-1/2` card), so Capture looks like it does
      nothing there, and both still save the soft 1.5x backdrop crop. The
      blur fix also lowers the router's thumbnail limit from 200,000 to
      60,000 characters, because `symbol_links.thumbnail` is MySQL TEXT
      (65,535 bytes). No migration. Symbols captured before the fix keep
      their soft picture, because a re-capture never replaces an existing
      thumbnail; remove the symbol and capture it again to get a sharp one.

### WRONG-NUMBER RISK: a run snaps onto a misplaced AI mark — fix after the reader accuracy test

- [ ] **Tracing snaps a run end onto a nearby mark's spot (`legSnap.ts`). An
      AI mark placed in the wrong spot makes the run length wrong. Decide: no
      snap to unconfirmed AI marks, or a visible warning.** Owner, 2026-09-30. - **Found by asking whether any length or drop reads AI mark
      positions.** The calculations do not: run length comes from the run's
      own traced points, and drop length from heights
      (`shared/groupDrops.ts` uses position only for the "sits near a run
      end" hint). But the snap in `client/src/lib/legSnap.ts`, called from
      `TraceLayer.tsx`, COPIES a mark's position into the run's points, so
      a misplaced mark becomes a wrong length the moment someone traces to
      it. **So does `snapEnd` in `TraceLayer.tsx`** (dragging a run END onto
      a mark), and that one keeps no stamp id; found 2026-10-01. Both are
      the subject of `references/connect-point-plan.md`, which proposes
      "never snap to an unconfirmed AI mark" as part of the same change. - **Why it matters:** on staging's E-100 (2026-09-29) the reader's
      positions were up to about 2.4 in of paper off, about 10 ft at
      1/4" = 1'-0". A run traced to that mark carries the error into the
      wire and conduit footage, with nothing on screen to say so. - **Today an AI mark is an ordinary stamp row,** and nothing marks it as
      AI-placed. Either fix needs that signal first: `plan_copilot_findings`
      holds `stampId` for every confirmed finding, so it can be derived
      without a migration. Check that before adding a column. - **Order:** after the accuracy test (`references/legend-reading-plan.md`
      § 0 B, branch a-plans-reader), which measures position error. If
      positions come back good, a warning may be enough; if not, no snap.

### The whole catalog goes to the browser, and grows with it

- [ ] **`materials.list` is unpaged and search runs on the main thread.**
      Measured 2026-09-28 by `server/catalogScale.test.ts`: about 725 bytes a
      row as superjson, so **~1 MB today (1,455 rows) and 2.1 MB at the
      3,000-row limit**, parsed in 40–62 ms. Live traffic is compressed by the
      Cloudflare edge (`Content-Encoding: br` on bidridge.com, ~115 KB at
      3,000); the Express server compresses nothing, so any host without that
      edge — staging included — sends the full size. Search per keystroke at
      3,000: 9–12 ms median, 82–100 ms p95, worst ~175 ms on a first letter,
      on a desktop; a field laptop is slower. Everything is linear and inside
      budget at 3,000, which is why the limit was raised. This is CLAUDE.md
      § Responsiveness rule 2 ("lists load a window, never the whole table"),
      which these screens predate. **Do before the catalog needs to pass
      3,000:** page `materials.list` and move search to the server, or at
      least off the main thread. The scale test's budgets are the alarm; do
      not loosen them to get past it.

### Before beta: price an unpriced line right where it blocks you

> **2026-10-05:** quote items (references/quote-items-plan.md § 8) need the
> SAME per-bid price column as this item (`bidUnitCost`). Build it once:
> ship this first or together, never as two columns.

- [ ] **Owner, 2026-09-30.** When a bid has unpriced lines, "For your quote
      app" refuses to show figures ("This bid has lines without a price. Price
      them on the bid…", `QuoteAppPanel.tsx` `Blocked`). The bid page's
      amber strip ("N lines are not priced", `BidsPage.tsx` ~1324) explains
      but offers no box. **The owner's "Price this before sending" is the
      Proposal's print block** — the dialog Print/Save opens while any line
      is unpriced (`ProposalPage.tsx` ~613, Track A's `a-proposal-zero`,
      6a3defa, now on `local-dev` and live). It lists the unpriced lines and
      offers only "Back to the bid".
      _Corrected 2026-09-30: this note said no screen carried that text and
      to ask which panel it meant. It was written from `track-b` before
      a-proposal-zero was merged in, so the search could not find it._
      Wanted:
  - Next to **each** unpriced line, in all THREE places (the quote-app
    `Blocked` panel, the bid page's strip, and the Proposal's "Price this
    before sending" block), a price box. Typing a price unblocks as soon as
    no line is left unpriced — on the Proposal, Print becomes available
    without going back to the bid.
  - **Saved on this bid only by default**, with a tick box "Also save to my
    catalog". Ticked, it writes the company's own material row (a FORK if the
    row is a shipped one; never a price typed onto a baseline row, CLAUDE.md
    § "Where a priced catalog lands").
  - **Never $0 and never blank as an answer.** An empty or invalid box
    leaves the line "Not priced"; it does not commit a zero (CLAUDE.md
    § Editing fields rule 6, and `commitNullableEdit` in placeholder mode).
    A typed 0 on a hand-priced line stays a real answer, as today
    (`shared/lineNotPriced.ts`).
  - The line then says **"priced on this bid"**, so nobody mistakes it for a
    catalog price.
  - **"Not priced" on the bid page links to the same box** — one component
    (one `LineCost`-style seam), not a second copy of the field.
  - **Needs a MIGRATION — Track A.** A hand-priced line already stores a
    typed price, so for those it needs none. But a line from a run type or
    an assembly carries only the snapshot, and **a snapshot must never be
    mutated** (CLAUDE.md § Data model). "Priced on this bid" needs its own
    nullable column on `bid_line_items` (e.g. `bidUnitCost`, no default, NULL =
    not priced here), read by `lineNotPriced` AND its SQL copy
    `lineNotPricedSql` in `server/db.ts` together. Additive, so it is step 1
    of the three-step deploy (migrate first). Two edges to decide in the
    spec: an unpriced PART inside an otherwise-priced assembly line
    (`snapshotUnpricedParts`) has no line to put a box on, and a line whose
    LABOR is unpriced wants hours, not a price.

### Before beta: the Plans screen at phone width — side panels become tabs

> **Replanned 2026-09-30:** not drawers any more. The owner chose tabs for the
> right-hand panel, with the phone showing the same tabs as one full-screen
> panel. See `references/track-b-phone-and-readability-plan.md`.

- [ ] **Owner, 2026-09-29: its own piece, later, before beta.** At a 390 px
      window the sheet list (240 px) and the counts panel (a fixed 400 px, its
      own `shrink-0`) do not fit beside the drawing: measured, the counts panel
      starts at x=276 and runs 286 px off screen, taking its card buttons
      (undo, trash, "Add a drop") with it. Fix is structural, not a row that
      wraps: at phone width both panels become drawers pulled over the
      drawing, one at a time. Touch panning and pinch belong to the same piece
      — and with them the guard that a finger landing to pan must not place a
      mark or a point (place on TAP, on touch only). See
      `references/track-b-panning-plan.md` § 3, guard 3.
- [ ] **Owner, 2026-09-29: a readability pass on the Plans right-hand panel,
      before beta, alongside the phone layout above.** Counted items, the Plan
      reader, the Legend and the totals are too small and too muted to read at
      a glance. Wanted: bigger text, stronger contrast, warnings that stand out
      from ordinary rows (amber that reads as amber, not as another grey), and
      less scrolling to reach the totals. Do it with the drawer work, since
      both reshape the same panel — and look at it at the size it ships, at
      UI scale 1.0 and on a laptop screen, before calling it done.
      **Planned 2026-09-30, with the phone layout above:**
      `references/track-b-phone-and-readability-plan.md` (owner answered all
      six the same day; the panel becomes tabs; nothing built yet).

### Trace on touch: no rubber-band line between taps (Track B, 2026-10-01)

- [ ] With a mouse the next leg of a run is previewed from the last point to
      the pointer (`TraceLayer`'s `hover`). A finger has no hover, so on a
      tablet each tap places a point blind and the leg appears only after it
      lands. **Not simple, so not done in the device leftovers pass:** the
      only way to show a finger's position before placing is a new gesture —
      press, hold past `TOUCH_TAP_MAX_MS`, drag to aim with a magnifier above
      the finger (which also fixes finger-cover), place on lift. Today a held
      finger stops being a tap and a moving one is a PAN
      (`client/src/lib/touchGesture.ts`), so this is a new state in that
      machine, with tests there that a pan still places nothing (panning plan
      § 3, guard 3). The tap-to-place path stays as it is.
      `references/device-audit.md` § "Left to do".

### Before beta: speed of the summary, and two missing Undos

- [ ] **Owner, 2026-09-30: measure the whole-plan-set summary on a 500-sheet
      set.** `takeoffSummary.forBid` runs `takeoffGroups.list` and
      `takeoffRunTypes.bridgeForBid` for the whole bid on every refresh, and
      `sendAll` rebuilds it again before sending. It has only been looked at on
      a scratch bid with 7 items. Time it (server ms and the panel's first
      paint) on a real 500-sheet set with marks and runs spread across it, and
      write the numbers next to the code. No number is claimed here yet.
- [ ] **Owner, 2026-09-30: Undo for removing a circuit.** The delete rules
      (bf88f5c) put Undo in every toast, but removing a circuit from a traced
      run still has none: `removeCircuit` in `TakeoffPage.tsx` shows only an
      error toast and refreshes.
- [ ] **Owner, 2026-09-30: Undo for removing a bid line.** Same gap on the
      bid: `bids.removeLine` in `BidsPage.tsx` and `QuickBidPage.tsx` drops the
      line optimistically and offers no way back. A line carries frozen
      snapshot prices, so Undo must restore the row, not re-add it at today's
      prices.

### Flaky tests — fix in a batch before beta

Both are timing, not wrong answers, and both touch the shared test database.
Fix them together: a green run that sometimes lies about being red trains
everyone to re-run instead of read.

- [x] **DONE 2026-10-01 (Track B), see the materialsLibrary entry below.**
      No index on `materials.name` added — that is a migration, still open.
      **HANDOFF to whoever owns `server/db.ts` — the root cause of every
      seed-heavy timeout below, including `materialsLibrary.test.ts`'s four
      failures on `a-fitting-labor` (73c349e).** Found and measured
      2026-09-29 on track-c; NOT committed there because A and B are working
      in `db.ts`. `dedupeBaselineRows` checks for duplicates with a self-join
      on `name`, and `name` has no index, so MySQL runs a nested loop over
      every baseline row against every other: **1,473 ms of a 2,000 ms seed**
      at 1,554 rows, and quadratic, so each catalog sweep makes it worse.
      Seven tests in `materialsLibrary.test.ts` call the seed inside the test
      body at 1.5–2.1 s each against the 5 s default.
      **Reproduced:** four connections of the same query on ANOTHER database on
      the same server (standing in for another worktree's suite) put exactly
      four of those tests over 5 s — "Test timed out in 5000ms" — which is the
      shape of the 73c349e failure. (That branch also predates the one-run
      lock, `d4f4821`, so a second run on `bidrender_test_clean` is a
      possible second cause; the lock covers that one already.)
      **The fix, one statement, same answer** — the check only asks whether
      any baseline name appears twice:
      ``sql
SELECT 1 FROM `${table}` WHERE userId IS NULL
GROUP BY name HAVING COUNT(*) > 1 LIMIT 1
``
      4 ms instead of 1,473. Applied temporarily: a full seed 2,000 ms → 20
      ms; `materialsLibrary` + `materialsCatalog` + `seedPreservesUserPrices`,
      101 tests, 2.8 s instead of ~40 s, none over 300 ms; `materialsLibrary`
      5 of 5 clean under the same load that failed it. It also takes ~1.5 s
      off every server start. The DELETE below it keeps the join — it only
      runs when a duplicate exists. **Once it lands, drop the 60 s
      `vi.setConfig` in `seedPreservesUserPrices.test.ts`** — that limit was
      covering this, not a slow test — and consider an index on
      `materials.name` (a migration) for the ~20 other per-name lookups.

- [x] **`materialsCatalog.test.ts` "renames the reshaped rows in place"
      timed out at 5,004 ms** in a full run, 2026-09-29, after the sweeps
      took the catalog to 1,511 rows; 4.1–4.4 s alone, all assertions
      passing. Given 60 s like `seedPreservesUserPrices`. A timeout, not a
      race — but the next catalog growth will push other seed-heavy tests
      toward 5 s the same way.
      **REAL FIX 2026-09-29, 60 s removed:** the test ran two queries per
      rename — ~200 full-table scans, since `materials.name` has no index.
      It now reads the baseline rows once and counts names in memory; the
      same two assertions per rename, under 300 ms. 20 of 20 repeat runs
      passed.
- [x] **`server/backup.test.ts` "restores into an empty database, table for
      table and row for row" (line ~248) came up 11 `assemblies` rows short.**
      2026-09-27. A timing race on the shared test database: something else
      seeds or touches `assemblies` between the dump and the count, so the
      restore is compared against a moving target. Not reproduced in
      isolation yet. Before calling it fixed, run it alongside the full suite
      several times — a pass alone proves nothing about a race.
      **2026-09-28:** failed in two full runs while a draft of
      `server/catalogScale.test.ts` was padding the shared test database with
      1,545 `materials` rows — but the run whose detail was read failed on
      `assemblies` and on a JSON-column check, which that draft never wrote,
      so the draft is not shown to be the cause. The scale test was changed
      anyway to build its own scratch database (`bidrender_catalogscale_test`)
      and only READ the shared one, so it cannot be. New tests that write a
      lot should do the same until this is fixed.
      **FIXED 2026-09-29 — two causes, both OTHER RUNS, never another file.**
      (1) Two runs on one database: the lock in `scripts/testSuiteLock.ts`
      (see the seedReactivatesRetired entry) now refuses the second. (2) Two
      runs on two DIFFERENT databases still collided, because the restore
      went into the fixed schema `bidrender_backup_restore_test` (and the
      verify tests into fixed `bidrender_verify_*`) — a schema name is
      server-wide. Track B was seen dumping `bidrender_test_b` mid-session.
      Reproduced by running the restore test against `bidrender_test_c` and a
      schema-only copy of it at once: the copy's restore held the other run's
      tables; alone it passed. Every scratch schema in `backup.test.ts` and
      `catalogScale.test.ts` is now `<database>__<purpose>`
      (`scratchSchemaFor`); the new naming case in `backup.test.ts` is red on
      the old fixed name. The same two-at-once repro then passed twice.
      Leftover: the corrupt-dump verify case never drops its scratch schema
      (the restore fails before the drop), so `<db>__verify_corrupt` lingers
      between runs — harmless, dropped on the next run's start.
      **Leftover FIXED 2026-09-29, in `verifyBackup` itself:** it was not a
      test quirk — a failed restore left its half-loaded schema on the
      scratch server in real use too. The restore now drops it on the way
      out (kept or not: nothing can be rehearsed on a failed restore). The
      corrupt-dump case asserts the schema is gone — red on the old code.
- [x] **`server/seedPreservesUserPrices.test.ts` "keeps the fork's price…"
      flakes on the 5 s default timeout.** 2026-09-27: failed in a full run
      (5010 ms), then run alone it passed once and failed once — it seeds the
      whole catalog and sits right at the limit. Not a wrong answer, a slow
      one; 45ada57 gave the seeder test a 60 s limit for the same reason, and
      this one wants the same. **FIXED 2026-09-28** with that 60 s limit: at
      1,455 rows it failed on every run, alone too, at 5.4 s with every
      assertion passing once the limit was lifted.
- [x] **`server/seedReactivatesRetired.test.ts` "never switches on a company
      row that shares a shipped name" lost its own row under a full run.**
      2026-09-28, once, on the local-dev + track-c merge: the company row it
      inserts was gone when read back (`Cannot read properties of undefined
(reading 'userId')`, line ~264). Passes alone. Nothing found that
      deletes it: every broad `delete(materials)` in the suite is scoped to its
      own user ids, and no other file uses 7404/7405. A race, not yet
      explained. Run it alongside the full suite several times before calling
      anything fixed.
      **FIXED 2026-09-29 — the other deleter was a second RUN, not another
      file.** Every worktree was told to test against `bidrender_test_clean`,
      and `fileParallelism: false` only orders one run's own files. Starting
      this file twice, two seconds apart, on one database failed 5 of 6 cases,
      one with the exact `reading 'userId'` error: each run's `beforeEach`
      deleted the other's 7404 rows. `vitest.globalSetup.ts` now holds a MySQL
      named lock on the test database for the whole run
      (`scripts/testSuiteLock.ts`) and a second run on the same database is
      refused by name; separate databases (`bidrender_test_b`, `_c`) still
      run together. `server/testSuiteLock.test.ts` checks from inside the run
      that the lock is held — red with the globalSetup call removed. Rerun of
      the two-at-once repro: first passed 3/3, second refused.
- [x] **FIXED 2026-09-29 (plan W2):** only MySQL's "no such table" (1146,
      read off drizzle's `cause`) means never migrated (`isMissingTable`,
      `server/schemaCheck.ts`); anything else throws, and the script prints
      "Could not read this database (…)" and exits 2 before checking anything.
      `scripts/schemaDrift.test.ts` runs the script against a refused port —
      red on the old code, which printed "never been migrated". The entry:
- [ ] **`server/materialsLibrary.test.ts` failed 4 tests in ONE full run,
      2026-09-29, and has not failed since.** On `a-fitting-labor` against
      `bidrender_test_clean`: "re-stamps a baseline row whose category was
      lost", "backfills a fork that predates the column", "does not overwrite a
      category the user chose for their own copy" and "re-stamps aliases that
      were lost". The file passed alone (32/32) and the next two full runs were
      clean (4,157 passing, only the known `schemaDrift` enum mismatch).
      Nothing on that branch touches materials categories, aliases or the
      seeder. The error text was not captured (the failing run printed only the
      names). All four re-run `seedBaselineMaterials` and read a baseline row
      back, the same shape as the `seedReactivatesRetired` race above:
      suspect a second writer to shared `materials` rows mid-seed. Capture
      the assertion text on the next failure before changing anything.
      **FIXED 2026-10-01 (Track B) — not a second writer: a timeout.** It is
      the `dedupeBaselineRows` entry above. Measured on `bidrender_test_b` at
      1,554 baseline rows: the duplicate check alone 4,551 ms, and the file
      now failed ALONE — two "Test timed out in 5000ms", five more at
      3.4–4.8 s. Under any extra load on the shared MySQL, a different subset
      tipped over, which is why it looked random. Check AND repair DELETE now
      use the GROUP BY; every seed test under 300 ms, 34/34 with four
      connections running the old query alongside. New cases: a duplicate is
      still found and removed, and a re-seed finishes under 1.5 s (12 red on
      the old query across the three seed files). Both 60 s `vi.setConfig`
      limits removed.
- [x] **`scripts/schemaDrift.mts` says "this database has never been migrated"
      when it simply cannot connect.** Measured 2026-09-27 against production
      with the laptop off the database's trusted list: that line printed, then
      `ETIMEDOUT` on `connect` ~20 s later. Production had 89 migrations. The
      migrations-table read must fail as a connection error, not be reported
      as an empty database — a false "never migrated" is an invitation to
      re-run every migration against live data. `references/deploying.md`
      § 10 warns about it until fixed.
- [x] **FIXED 2026-09-29 (plan W3):** `linkOrigins` (`server/schemaCheck.ts`)
      finds the migration that names each missing key and whether this
      database ran it, by the migrator's own rule (`pendingMigrations`); the
      report says "0095\_… adds it — scripts/migrate.mts adds these, do NOT add
      them by hand" for a pending one, keeps the ALTER for an applied one,
      and says when no migration declares it. Reproduced on a scratch schema
      rolled back to 89 of 96: old script printed the false sentence and two
      ALTERs, new one names 0089 and 0095. The entry:
- [x] **`scripts/schemaDrift.mts` says a missing foreign key's migration is
      "already recorded as applied" when it is NOT.** Measured 2026-09-29 on
      `bidrender_test_c` with 89 of 96 migrations recorded: it listed
      `takeoff_extra_defaults(userId)` and `takeoff_groups(dropRunTypeId)` as
      missing and said "db:push will not add these — the migration that
      declared each one is already recorded as applied", then printed
      hand-written `ALTER TABLE … ADD CONSTRAINT` lines. Both come from 0089
      and 0095, which were pending; applying them added both keys. The text is
      a fixed string (`server/schemaCheck.ts` ~712) that never checks the
      journal. Harm: it steers someone to hand-add a key that `migrate.mts`
      would add itself, after which the pending migration dies on a duplicate
      constraint. It should say which migration declares each key and
      whether that one is applied. Not fixed yet.
- [ ] **A terms page BEFORE any sharing of the AI correction log is turned
      on.** Decided by the owner 2026-09-27 (Stage 4, question 7). The log
      (`references/stage-4-safety-plan.md` § 3) records corrections from day
      one, including a cut-out image of each symbol, so it can be shared for
      symbol learning later. Nothing may export, pool or share it — even the
      anonymised half — until users have agreed to terms that say so. Not
      blocking the log itself; blocking the first read of it.
- [ ] **Before the priced catalog ships: give "nobody has priced this" its own
      signal.** `shared/materialPricing.ts` and the Materials screen's unpriced
      filter both decide it from `costPerUnit === 0`. That works only while
      every shipped row is zero. The moment the pricing sheet lands in
      `server/seed/materials/*` (CLAUDE.md § "Where a priced catalog lands"),
      a zero stops meaning unpriced and the screen will report a fully-priced
      catalog that no contractor has checked a line of — which is the exact
      failure the $0 rule was written to prevent, arriving from the other side.
      Needs a way to say "this is our example price, not yours": a column, or
      comparing against the seed value. **Blocks the upload, not the sheet.**

- [x] **400 kcmil lug ADDED 2026-09-26 (Track B)** — a single size, because
      above 350 kcmil a compression lug is sold per conductor size (Crescent
      Electric, Platt/Ilsco CLWS-400-38, Graybar Burndy YA32 series; no
      supplier found sells a "350-500" span). Renamed the same day to "400
      kcmil crimp lug, single size" to match the 500, through
      `RENAMED_BASELINE_MATERIALS` — same row id, old name still finds it.
- [x] **DEPLOYED 2026-09-27 as `f1521c5`** (rollback target `a64dfbc`; 0087
      applied before the push, drift clean at 88, live-checked on bid 25 —
      `references/deploying.md` § 5b "Sixth run"). **Built 2026-09-26 as
      option (a): a priced assembly
      line says "$25.00 + 1 part not priced", and the totals count the part
      apart from lines — "+ 2 lines, 3 parts not priced".** Migration 0087,
      `bid_line_items.snapshotUnpricedParts` (nullable int), written in
      `snapshotForAssembly` from the same recipe rows the cost is summed over,
      so every way an assembly reaches a bid freezes it. NULL (every line from
      before 0087) reads the recipe live through `withUnpricedParts`. The
      rollup takes `RollupLine` — the count RESOLVED and required — so a
      pricing read that forgot the old lines does not compile;
      `db.getRollupLines` is the one loader. Rule in `shared/lineNotPriced.ts`
      (`unpricedPartsIn`, `linePartsNotPriced`, `countNotPriced` now returns
      `{ lines, parts }`); words in `client/src/lib/notPricedTotal.ts`. The
      bid screen has its own strip for parts (price it, then remove and re-add
      the line — nothing re-snapshots an assembly line). The sample bid and
      "Save as assembly" write 0, not NULL. Test:
      `server/assemblyPartsNotPriced.test.ts`, 7 failing before the change.
  - **Deploy: three steps, step 3 empty.** 0087 is ADDITIVE — one nullable
    column, no default, no UPDATE: apply it BEFORE the push. Then
    `scripts/schemaDrift.mts` should report no drift at 88 — **if it does not,
    stop and find out why before pushing.**
  - **One thing moves on existing bids, deliberately:** a line from before
    0087 whose assembly has a $0 part now says so (read live), and its bid's
    totals gain "+ N parts not priced". No money changes.
  - **The dashboard cards still do not count it**, for the reason the
    dashboard item below gives — they sum in SQL.
  - Parked question as it stood:
- [x] **A $0 part inside an assembly that has LABOR is not flagged on the
      bid line.** Checked 2026-09-26 with the new lugs: an assembly line of
      two lugs and 0.5 h reads "$25.00" — the labor — with nothing saying the
      lugs in it are unpriced, because `lineNotPriced` calls an assembly line
      unpriced only when its WHOLE cost is $0 (so a labor-only assembly is
      not flagged). True of every $0 catalog part, not only lugs. The
      catalog itself storing $0 is right (`costPerUnit` is NOT NULL DEFAULT 0
      and CLAUDE.md § Materials ships $0 on purpose); the open question is
      only what the bid LINE says.

      **Wanted (owner, 2026-09-26): the line reads "$X + 1 part not priced"
      and counts toward the not-priced totals. PARKED the same day, before
      building,** because a line does not record which parts its frozen
      material cost contained — there is no per-part snapshot on
      `bid_line_items`. Two ways, owner to choose:
      (a) **freeze the count** — migration 0087, one nullable int on
      `bid_line_items` (how many $0 parts the recipe had when the line was
      added), additive, deploy step 1; lines from before it (NULL) fall back
      to (b). Cannot drift: a lug priced in the library later still leaves the
      frozen total short, and the line keeps saying so.
      (b) **read the recipe now** — no migration, but it states a wrong number
      once a part is priced in the library after the line was added (the
      warning disappears while the frozen total still lacks the part), and it
      misses parts since removed from the recipe.
      Recommended: (a).

- [x] **500 kcmil lug ADDED 2026-09-26 (Track B) as "500 kcmil crimp lug,
      single size".** A common part (Graybar and Lowe's stock Burndy's YA34
      series). Owner's decision: a NEW name, same pattern, one size — because
      the plain "500 kcmil crimp lug" is retired and hits the seeder bug below.
      Checked on a freshly seeded database, not only on one that already had
      rows.
- [x] **server/materialsCatalog.test.ts depends on user 7373 created by
      bidArchive.test.ts - make it create its own user.** FIXED 2026-09-26 on
      track-b (`a871424`, "Polish B6"): it now uses its own id, 7393, and
      creates the user in the seeding block's beforeAll. Passed alone, failed
      in a full run on a fresh test database with a foreign-key error — the
      order dependence was invisible on any database an older run had left
      user 7373 in.
- [x] **FIXED 2026-09-26 (Track B): a retired name put back in the catalog
      now comes back.** `reactivateBaselineMaterials` (`server/db.ts`) runs
      after the retire pass and switches on any SHARED row (`userId IS NULL`)
      whose name the catalog ships. The worry below — a row re-added by
      mistake — was settled by who writes the flag: on a shared row,
      `isActive = false` has one writer, the retire pass; a company's edit,
      archive or delete lands on its own copy, which this never reaches.
      Production checked read-only the same day: 0 company copies hidden the
      old way (`isActive = 0`, of 7 copies in all), 2 hidden shared rows, both
      still retired, so the fix switches nothing on at deploy. Code only, no
      migration. `server/seedReactivatesRetired.test.ts` retires, un-retires
      and re-seeds a fixture; verified red before the fix, and it pins that a
      company's archived $12.50 copy does not move and a second seed changes
      nothing. The original entry, as found:

      **SEEDER BUG, needs its own investigation — do not fold into other
      work: a retired material name is never re-activated.** Found 2026-09-26.
      `retireBaselineMaterials` sets `isActive = false` on every name in
      `RETIRED_BASELINE_MATERIALS`, and nothing in `seedBaselineMaterials`
      (`server/db.ts`) ever sets it back to true. So taking a name OFF the
      retired list and putting it back in the catalog does nothing on a
      database that still holds the old row: the row stays hidden, and the
      insert pass skips the name because a row with it exists. The catalog then
      claims to ship a material no screen shows, with no error anywhere. A
      fresh database hides it, which is why a test run cannot see it. Worked
      around once (the 500 kcmil lug took a new name). Before fixing: decide
      whether re-activating is always right (a row retired for a reason and
      then re-added by mistake would come back), and write the test that
      seeds, retires, un-retires and re-seeds the same name.

- [ ] Replace fractional resize recentering with true page-box centering in the PDF viewer
- [ ] Ensure the PDF canvas stays fully within the left pane as the divider moves
- [ ] Connect estimate engine to user's custom materials DB (fall back to built-in DB)
- [ ] Connect estimate engine to user's active labor standard profile
- [ ] Save estimate sessions to DB (currently frontend-only)
- [ ] Project management UI (create/rename/archive projects from the sidebar)
- [ ] Stripe subscription billing (free trial → paid tier)
- [ ] Email verification flow
- [ ] Password reset via email
- [ ] Admin dashboard for user management

## Bug Fixes & UI Polish (v4.1)

- [x] Login page: clean up clunky layout, fix overlapping lines, polish visual design
- [x] Login page: remove lightning bolt icon, show only "BidPhase" text
- [x] Login page: enforce strong password requirements (min 8 chars, uppercase, number, special char) with visual indicator
- [x] Default project state: remove pre-seeded jobs, show "New Project" placeholder when no projects exist
- [x] Projects: always allow deleting down to zero (no minimum project count enforced)
- [x] Sidebar navigation: allow toggling between Residential/Commercial/Industrial/Infrastructure from inside a workspace
- [x] Scale enforcement: require scale to be set before any measuring is allowed
- [x] Scale display: fix false "Scale set" message showing before scale is actually configured
- [x] Measure/Run sync: synchronize the measure and run controls at the top of the page
- [x] Unit count dropdown (right panel): fix so it works independently — should not require clicking the top toolbar button

## PDF Workspace Improvements (v4.2)

- [x] Scale: prompt to set scale on first entry if not previously set (modal/overlay)
- [x] Scale: reset clears the input field so user types a fresh value (no stale previous value)
- [x] Scale: draggable scale points — click a placed dot to reposition it before confirming
- [x] Scale: "Reset Scale" button always visible in toolbar
- [x] Runs: click any line segment to activate that run (no need to use top toolbar)
- [x] Runs: draggable run points — click any placed dot to drag and reposition it
- [x] Delete-all: confirm dialog when deleting 3+ items; also clears count pins for active session
- [x] Pin shapes: add 2 larger square sizes, 1 larger circle, 2 smaller dot sizes
- [x] Pin shapes: add 3 triangle sizes (small, medium, large)
- [x] Wire types: replace conduit size picker with 50-entry wire type list (Romex, SER, SEU, THHN, low-voltage, etc.)
- [x] Wire types: stranded/solid selector on applicable wire types
- [x] Default conduit/conductor: start with 1/2" EMT + #12 copper (not 3/4" EMT)
- [x] Labor/material tab: entire tab row is tappable (not just the text label)
- [x] Empty state copy: update "No runs yet" message to mention materials broadly
- [x] Right panel: auto-expand when a run is pushed so the new run is visible

## v4.3 — Crosshair, Pin Shapes, App Audit

- [x] Remove floating crosshair from run/measure mode (revert to default cursor behavior)
- [x] Add XL size to all 4 pin shape families (dot, square, circle, triangle)
- [x] Standardize pin shape names and sizes across CountIcons.ts and canvas draw code
- [x] App audit: verify all toolbar buttons interact correctly with each other
- [x] App audit: verify all delete/trash tools work as expected
- [x] App audit: document any issues or suggestions found

## v4.5 — Color-Matched Dots & Professional Calc Terminology

- [x] Color-matched run dots: endpoint dots use the active run's color instead of red
- [x] Color-matched cursor: crosshair is yellow when measuring, run-color when dropping run points
- [x] Jacketed/Romex module: add Measured Takeoff, Makeup Allowance, Service Loop, Waste Factor, Terminations, Runs inputs
- [x] Jacketed/Romex module: implement Net Length and Total Billable Wire calculation
- [x] Conduit module: add Measured Takeoff, Conduit Waste Factor, Wire Makeup Allowance, Wire Waste Factor, Terminations inputs
- [x] Conduit module: implement Total Billable Conduit, Net Wire Length per conductor, Total Billable Wire calculation
- [x] Update AppContext RunItem data model with all new professional estimating fields
- [x] Remove old wireSlackPct/conduitSlackPct (replaced by Waste Factor terminology)

## v4.6 — Crosshair Overlay, Scale Prompt, Electrical Category

- [x] Restore full-screen spanning crosshair lines overlay (vertical + horizontal lines to canvas edges) while keeping current + cursor shape
- [x] Add per-page scale verification prompt: show modal/overlay whenever user navigates to a page without a scale set, before they can measure or add runs
- [x] Combine Residential/Commercial/Industrial/Infrastructure into single "Electrical" category on homepage cards
- [x] Combine 4 category icons into single "Electrical" icon in left sidebar

## v4.7 — UI Polish + Run Workflow Improvements

- [x] Remove lightning bolt icon from CategoryLanding homepage (keep text-only Electrical card)
- [x] Hide Estimate Engine tab from left sidebar (treat like hidden categories, keep backend)
- [x] Replace electrical sidebar bolt icon with a minimalist electrical panel / breaker box icon
- [x] Show current page scale (e.g. "1 in = 20 ft") in PlanPanel toolbar at a glance
- [x] Right-click context menu on canvas: "Continue run from here" option to resume/extend the active run from any clicked point; easy dismiss (click elsewhere or press Escape)
- [x] Auto-pause active run measurement when user switches to Unit Count tab; auto-resume when switching back to Runs tab (unless they explicitly selected a different run)

## v4.8 — UX Polish Round 2

- [x] Double-right-click (not single) to open "Continue run from here" context menu
- [x] Fix delete run confirmation: only mention the run being deleted, not "all items"
- [x] Scale badge: show both ref footage (e.g. "50 ft ref") and computed ratio (e.g. "1 in ≈ 20 ft")
- [x] Remove scale prompt on page open; only show it when user clicks Measure or Add Run
- [x] Unit Count: simplify shape labels to just shape name (no size suffix)
- [x] Unit Count: remove "Start Counting" step — pressing a shape immediately starts counting
- [x] Unit Count: add collapsible dropdown per shape (expand/collapse on click)
- [x] Fix material search bar (hidden/not working in Unit Count section)
- [x] Make Unit Count tab itself collapsible (click tab to collapse/expand the whole panel)

## v4.9 — Backend Cleanup

- [x] Remove unused DB tables: count_sessions, estimate_sessions, material_rows, plan_images, user_api_connectors, user_assemblies, user_labor_standards
- [x] Remove dead router procedures: laborStandards, apiConnectors from dataRouter
- [x] Remove dead DB helper functions for all removed tables from server/db.ts
- [x] Clean up DataConnectorsPanel: remove LaborStandardsTab and ApiConnectorsTab, keep only MaterialsTab
- [x] Fix projectsRouter: remove old 4-category enum, hardcode "electrical" category
- [x] Push DB migration (0002_chunky_adam_warlock.sql) — 7 tables dropped
- [x] Schema now has 3 tables: users, projects, user_materials_db

## v5.0 — UI Polish Round 3

- [x] Remove Unit Count button from top toolbar (redundant with right panel)
- [x] Fix Set Scale toggle: yellow = scale mode active/editable, dark = locked; clicking again saves previous scale (no toggle off)
- [x] Scale pin shape numbers with shape size (larger shapes get larger font numbers)
- [x] Harmonize run colors and pin colors to vibe with app dark palette while staying distinguishable
- [x] Rename "Electrical" sidebar entry to "Projects" with a new clean icon matching early-phase icon style
- [x] Homepage improvement suggestions delivered to user

## v5.1 — Homepage Merge, Run Workflow, Cursor & UX Polish

- [x] Merge homepage with project list: branded BidPhase header + project cards below on same screen
- [x] BP logo/icon in sidebar always navigates back to home/project list
- [x] Set Scale button changes to "Reset Scale" after scale is set; clicking Reset Scale asks for confirmation before clearing
- [x] Cursor: dot with crosshair lines (not plus shape) — color-matched to active run or yellow in scale mode
- [x] Condensed pin color picker: small swatch popup grid instead of expanded inline picker
- [x] Run cards in right panel: collapsible (click to expand/collapse like Unit Count)
- [x] Run cards: replace minimize button with X button; X asks before deleting
- [x] Deleting a run from right panel also removes it from toolbar strip; remaining runs re-number sequentially
- [x] Run workflow: Pause button (saves progress, exits measure mode), Resume button (re-enters measure mode for that run), Finish button (completes/locks the run)
- [x] Clicking a run in the toolbar strip or right panel re-enters measure mode for that run (resume)

## v5.2 — Homepage/Projects Merge + Scoped Delete/Clear/Reset

- [x] Merge homepage and projects page: project list cards appear directly on the home screen (no separate Projects page)
- [x] Remove the Projects tab from the left sidebar
- [x] Remove the yellow "New Project" button from the top-right (redundant with Create your first project / inline add)
- [x] Add a small "New Project" action inline on the home screen (e.g. a card or row at the bottom of the project list)
- [x] Scope toolbar trash button: only deletes the active run (in Runs mode) or clears pins for the active count session on the current page (in Unit Count mode) — not everything
- [x] Add page-scoped "Clear page runs" button: removes all runs on the current page with a confirmation dialog
- [x] Add page-scoped "Clear page counts" button: removes all count pins on the current page with a confirmation dialog
- [x] Add "Total Reset" button: clears all runs and count pins across all pages; requires confirmation dialog; provides undo (restore previous state)

## v5.3 — Card/Panel Polish

- [x] Project cards: remove folder icon, make project name text larger, make cards taller/bigger
- [x] Right panel: collapsible with intuitive expand/collapse toggle (chevron or drag handle)
- [x] Right panel header: remove "Infrastructure" category label, replace yellow icon with BP logo
- [x] Material/labor summary: replace the weird symbol with the BP logo

## v5.5 — Right Panel & Unit Count Redesign

- [x] Move "Clear page counts" button from right panel to top toolbar (next to existing clear controls)
- [x] Unit Count tab: accordion pin shape selector — all shapes shown side-by-side as small icons; clicking one expands it inline to show size variants; clicking another collapses the previous
- [x] Unit Count tab: condense color picker to a small swatch row (no labels, no expanded grid)
- [x] Right panel: collapsible/minimizable with an easy expand button
- [x] v5.4 cursor fixes: smooth overlay cursor (no lag), count mode dot cursor, count cursor color matches session, Reset Scale returns to dark inactive state

## v5.6 — Unit Count UX & Panel Polish

- [x] Allow unit counting before scale is set (remove scale gate from count mode)
- [x] Remove "Save to Labor & Materials" button from Unit Count tab (redundant)
- [x] Redesign shape + color selector: single compact inline row, less space
- [x] Right panel: fully collapsible to a thin strip (like left sidebar), easy expand button
- [x] Toolbar Runs button: switches right panel to Runs tab, collapses Unit Count tab
- [x] Toolbar Unit Count button: switches right panel to Unit Count tab, starts counting immediately

## v5.7 — Trash/Clear/Panel/PDF UX

- [x] Trash button: delete active pins (count mode) OR active run points (measure mode) — whichever is active
- [x] Clear All: clears both pins AND runs on the current page (not separate buttons)
- [x] Remove the weird square/swatch preview to the right of the color swatches in Unit Count
- [x] Runs list: always visible (remove the collapsible dropdown, show runs directly)
- [x] Right panel: collapse to a very thin strip like the left sidebar, expand back with a button
- [x] PDF upload: ask user to confirm before loading a new PDF; warn that all pins/runs/scale will be cleared

## v5.8 — Right Panel Accordion Fix

- [x] Material search bar: restore visibility under Unit Count section
- [x] Right panel sections: mutually exclusive accordions (Runs / Unit Count / Materials) — clicking one collapses the others
- [x] Right panel collapse/expand: fix so the panel actually collapses to a thin strip and expands back reliably

## v5.9 — Panel & Cursor Polish

- [x] Right panel thin strip: add a visible expand button/chevron so user can click anywhere on the strip to restore the panel
- [x] Right panel header: add a reset-size button to snap the panel back to default 40% width after user drags the divider
- [x] Runs accordion: make it collapsible — clicking the header when Runs is already open should collapse it (not just stay open)
- [x] Cursor: always yellow (#F5C518) in both count mode and measure mode — no run-color matching for the dot or crosshair lines

## v5.10 — Right Panel Layout Reorder

- [x] Right panel: move Unit Count accordion to the top (above Runs)
- [x] Right panel: move Runs accordion below Unit Count
- [x] Right panel: rename "Materials" section to "Material Summary" and make it always-visible (non-collapsible), showing live totals

## v5.11 — Material Summary Reposition & PDF Tool Bug

- [x] Material Summary: remove the "Material Summary" heading, move the section inline below Runs in the scrollable area (grows with content, not pinned to bottom)
- [x] Fix: toolbar/tools disappear after loading a new PDF into an existing project

## v5.13 — Panel Expand Arrow & Toolbar Wrap

- [x] Fix: expand arrow (ChevronLeft) not visible on the collapsed right panel thin strip
- [x] Toolbar: when panel is narrow or collapsed, toolbar buttons/shapes wrap to next line so all tools remain accessible

## v5.14 — Run Continuity & Panel Toggle

- [x] Delete run: auto-create a replacement run (same number/color) so measuring can continue immediately without interruption
- [x] Right panel: replace separate collapse/expand arrows with a single toggle button that works in both states

## v5.16 — Clear Page & Single Toggle

- [x] Fix: "Clear Page" does not remove all pins and runs on the current page
- [x] Fix: two collapse/expand buttons still visible in the right panel (strip + header)

## v5.17 — Header Arrows, Page Label, PDF Tool Fix

- [x] Right panel header: add a left-pointing arrow (expand) next to the right-pointing arrow (collapse) so both directions are always available in the header
- [x] Right panel header: change "Pg N" badge to "Page N" (spell out "Page")
- [x] Fix: tools and cursor do not appear after replacing a PDF in the viewer (z-index / overlay not cleared properly)

## v5.18 — Panel Controls & Pin Size Fix

- [x] Remove Total Reset button from under the material summary section in the right panel
- [x] Add reset-to-default-size button in the right panel header (next to the toggle arrow) to snap panel back to 40% width
- [x] Dot shape: when panel collapses, the dot should drop into the shape list (not stay in header)
- [x] Pin shapes: scale with zoom — shrink as user zooms out so they don't clutter the drawing

## v5.19 — Measurement & UX Polish

- [x] Double-left-click on canvas in measure mode: drop a disconnected start point (lifts the pen) so user can start a new segment on the same run without connecting to the last endpoint
- [x] Remove Pause and Finish buttons from the measuring toolbar
- [x] Unit count sessions: remove the pencil rename button; make the session name label itself inline-editable on click

## v5.20 — UX Simplification & Feature Polish

- [x] Right-click pen-lift: right-click in measure mode lifts the pen (disconnects next segment); remove old right-click context menu
- [x] Run name inline edit: click run name in right panel to rename it directly (same as session rename)
- [x] Keyboard shortcut hints: small key labels on toolbar buttons (M=Measure, C=Count, Esc=exit, U=undo)
- [x] Empty state canvas: when no PDF loaded, show a clear upload prompt in the canvas area
- [x] Scale indicator: always show current scale ratio as a persistent badge in the toolbar
- [x] Contextual toolbar: show only relevant tools per mode (Measure mode / Count mode / Neutral)
- [x] Run list as compact table: Name | Length | Type columns, easier to scan (compact table with inline rename)
- [x] Material Summary highlight: briefly animate the row that changed when a run/pin is added (num-flash on totals)
- [x] Page thumbnails strip: horizontal strip of page thumbnails below hint bar for multi-page PDFs
- [x] Export button: CSV export of all runs + count sessions in right panel header (Download icon)

## v5.21 — Toolbar & PDF UX Fixes

- [x] Remove PDF thumbnail strip (too messy)
- [x] Clarify page number chips in toolbar (add "Pg" prefix so numbers are clearly page numbers)
- [x] Remove "Stop Measurement" and "Stop Count" buttons from the two top toolbar tools
- [x] Restore Upload PDF button in measure and count mode toolbars (always accessible); keep confirmation dialog
- [x] Fix undo glitch: PEN_LIFT sentinel now removed atomically with its paired point
- [x] Fix Clear Page cursor glitch: reset dragRef, isPanning, mousePos, crosshair on all Clear Page confirms

## v5.22 — Critical Cursor & Tool Fixes

- [x] Fix: cursor disappears after clicking Confirm in Clear Page dialog (stopPropagation on all overlay dialogs)
- [x] Fix: cursor disappears after clicking Confirm in PDF Replace dialog; tools stop working after new PDF loads (root cause: Document component not remounting + useEffect race condition resetting pageReady after onRenderSuccess. Fixed with key={pdfHash} on Document, removed pdfFile from useEffect deps, added cursor reset in onPageRenderSuccess)
- [x] Replace right-click pen-lift with simultaneous left+right click pen-lift (both-button detection in handleCanvasMouseDown)

## v5.23 — Navigation & UI Cleanup

- [x] Remove intermediate page between homepage and PDF tool (go directly from project list to PDF viewer)
- [x] Rework homepage to show projects directly with professional/clean design
- [x] Revert page numbers from "Pg N" back to plain numbers (cleaner)
- [x] Remove all residential/commercial/industrial/civil & underground verbiage (including trash view)
- [x] Ensure Measure and Count buttons always visible in top toolbar (easy to switch between modes)

## v5.25 — Measurement UX Improvements

- [x] Show per-segment subtotals in run panel for multi-segment runs (e.g. "45' + 32'" breakdown below total)
- [x] Lower zoom threshold for segment distance labels (MIN_SEG_SCREEN_PX: 40 -> 25)
- [x] Smooth pinch-to-zoom: incremental approach, simultaneous zoom+pan, isTouchingRef guard prevents mouse/touch conflict

## v5.26 — Pinch & Segment Label Fixes

- [x] Fix pinch jitter: bypass React state during gesture — apply CSS transform directly to DOM, sync React state only on touchend
- [x] Per-segment canvas labels: each segment group shows its total footage over its midpoint; individual line distances show when zoomed in
- [x] Run total only in toolbar: removed per-segment breakdown from right panel; right panel shows total footage only

## v5.28 — Pinch & Panel Touch Fixes

- [x] Fix pinch-to-zoom jitter: removed React state from pagesContainerRef transform in JSX; useLayoutEffect now exclusively drives the transform from refs on every render, so React's reconciler can never overwrite the gesture transform with stale state
- [x] Suppress left panel from opening during touch/pinch gestures: added touchAction:none + userSelect:none to viewport, preventDefault on 2-finger touchstart, and context menu suppression during touch
- [x] Added single-finger touch pan support (idle mode only) so users can pan on mobile without needing two fingers

## v5.29 — Pan Jitter, Sidebar & Label Fixes

- [x] Fix mouse pan jitter: stop calling setPanOffset during mousemove drag; write directly to DOM via ref, sync React state only on mouseup
- [x] Fix left sidebar activating during pan: body.bp-dragging class added on mousedown, CSS pointer-events:none on aside during drag; global mouseup listener cleans up if mouse released outside viewport
- [x] Fix measurement run total label occlusion: refactored drawRun into drawRunGeometry (lines+dots) + drawRunLabels (labels only); main draw loop now does all geometry first then all labels on top

## v5.30 — Material Database Overhaul

- [x] Schema: add category, userPrice, defaultPrice, lastUpdated columns to userMaterialsDb; push migration
- [x] Backend: add updatePrice, resetPrice, addSingle procedures to dataRouter; update bulkImport to handle new columns
- [x] CSV column mapping UI: after file select, show mapping screen before import
- [x] Replace-database confirmation dialog with stern warning
- [x] Inline-editable materials table with userPrice cell (saves immediately on blur/enter)
- [x] Age indicator: color-code lastUpdated text (green <30d, yellow 30-90d, red >90d)
- [x] Reset-to-default button (undo icon) with confirmation prompt
- [x] Red-flag empty price cells (both userPrice and defaultPrice null/0)
- [x] Add Custom Material button + quick-entry form
- [x] Wire MaterialDatabasePage into BidPhaseShell sidebar nav
- [x] Update estimating engine fallback: userPrice > defaultPrice, flag if both missing; CatalogPicker now shows user DB items with effective price

## v5.31 — Master Electrical Catalog & Run Cost Integration

- [x] Generate 623-item master electrical catalog (Distribution, Conduit, Wire, Rough-in, Devices, Civil) in materialCatalog.ts
- [x] Replace static materialCatalog.ts with new comprehensive catalog; added getConduitPricePerFoot() and getWirePricePerFoot() lookup helpers
- [x] Build DB seeder: hasMaterials + seedFromCatalog procedures; MaterialDatabasePage shows seed banner when DB is empty
- [x] Wire/conduit variable chart already visible; conduit type/size + wire type/AWG pickers confirmed working
- [x] Waste factor: simplified conduit runs to single shared slider (default 10%) for both conduit and wire
- [x] Auto cost-per-foot: conduit and wire size selection auto-looks up price from catalog via getConduitPricePerFoot/getWirePricePerFoot
- [x] Run totals show emerald-green material cost breakdown (conduit cost + wire cost + total) with cost/ft × billable ft formula displayed

## v5.32 — Catalog Expansion to 1,021 Items

- [x] Expanded master electrical catalog from 623 to 1,021 items
- [x] Added: Lighting (48 items: LED wafers, vapor tights, exit/emergency, outdoor, commercial), Low Voltage & Data (26 items: structured wiring, patch panels), Civil & Misc expanded (69 items: ground rods, grounding, marking tape, site materials), additional Distribution (252 total), Conduit Fittings (219 total), Wire & Cable (127 total)
- [x] Fixed all Unicode inch symbol and escaped-quote issues in description strings
- [x] TypeScript: 0 errors, dev server: clean

## v5.35 — Smart Fuzzy Search with Trade Slang

- [x] Build shared smartSearch utility: fuzzy matching + trade alias/synonym map covering boxes, conduit, wire, breakers, devices, fittings, and civil slang
- [x] Wire smartSearch into CatalogPicker (Unit Count) replacing current filter
- [x] Wire smartSearch into MaterialDatabasePage replacing current filter

## v5.36 — Trade Slang Aliases, Unit Count Material Picker, Custom Price, Run Tool

- [x] Add searchAliases field to CatalogItem interface; populate key items with trade slang (romex, jbox, 4 square, flex, greenfield, wiremold, etc.)
- [x] Update smartSearch to also score against searchAliases field
- [x] Unit Count: when "New Count Session" is clicked (or Count # is created), show a catalog picker inline so user can search and select a material to populate the session name and unit price — replaces the count line instead of creating a new one
- [x] Unit Count: each session row gets an inline custom price-per-item field (editable number input, saves immediately)
- [x] Runs panel: restore full run tool card — conduit type/size picker, wire type/AWG picker, waste factor slider (default 10%), material cost display — replacing the compact table view

## v5.37 — User DB Prices in Run Tool

- [x] Update getConduitPricePerFoot / getWirePricePerFoot to accept optional userMaterials array and apply userPrice > catalog default priority
- [x] Fetch user materials in UnifiedProjects via tRPC and pass them down to RunCard price lookups
- [x] Verify run tool cost display reflects user-overridden prices from Material Database

## v5.38 — Run Tool Overhaul

- [x] Add wireWasteFactor field to RunItem (default 10%); conduitWasteFactor already exists
- [x] Add conduitOnly boolean to RunItem (default false) — conduit-only run, no wire
- [x] Rename "Jacketed / Romex" run type to "Wire Only" (bare conductors, no conduit)
- [x] Conduit run mode: pull points, wire termination makeup, wire waste factor slider, conduit waste factor slider — all inputs allow 0
- [x] Wire-only run mode: service loop, makeup per termination, number of terminations, wire waste factor slider — all inputs allow 0
- [x] Conduit-only toggle inside conduit mode: hides wire section, excludes wire cost from totals
- [x] Conduit type list: derived from user DB (EMT/RMC/IMC/PVC/FMC/LFMC keywords), ordered most-to-least common, falls back to catalog
- [x] Wire type list: derived from user DB (THHN/NM-B/MC/SER/URD/XHHW keywords), falls back to wireTypes catalog
- [x] Live pricing: cost-per-foot re-reads from user DB on every render (already wired — verify)
- [x] TypeScript: 0 errors after all changes

## v5.39 — Run Tool Fixes

- [x] Rename "Conduit" run type button to "Conduit & Wire"
- [x] Wire Only mode: remove conductor size (AWG) picker — size is embedded in wire type selection
- [x] Run type: ensure selecting one type clears the other (no dual runType + conduitOnly conflict)
- [x] Add MC Cable sizes to materialCatalog: 14/2, 14/3, 12/2, 12/3, 10/2, 10/3 (per foot + per 250ft roll)
- [x] Add MC fittings to materialCatalog: MC connectors (straight, 90°), MC staples, MC straps
- [x] Add "MC Cable" as a dedicated category tab in WireTypePicker with all MC sizes
- [x] Fix conduit trade sizes per type: EMT (1/2–4"), RMC (1/2–6"), IMC (1/2–4"), PVC (1/2–6"), FMC (3/8–2"), LFMC (3/8–2"), ENT (1/2–2"), LFNC (3/8–1"), GRC (1/2–4") — only show sizes valid for each type
- [x] Diagnose and fix pricing calculation bug: MC/NM catalog lookup now uses full wireTypeId (e.g. mc-12-2 → wir-mc-12-2) instead of size-only fallback

## v5.40 — Price Sync + Run Type Rename + LFNC Expansion

- [x] Rename run type button from "Conduit & Wire" to "Conduit / Wire"
- [x] Add LFNC sizes 3/8", 1/2", 3/4", 1", 1-1/4", 1-1/2", 2" to materialCatalog.ts (per foot)
- [x] Add LFNC fittings: straight connectors, 90° connectors, couplings (all sizes) to materialCatalog.ts
- [x] Update conduit sizes map: LFNC now goes up to 2" (was 1")
- [x] Build tRPC mutation: upsertMaterialPrice(description, userPrice) — upserts userPrice on matching DB row by description keyword match
- [x] Build reusable PriceSyncDialog component: shown when user saves a price that differs from DB; "Yes, update DB" calls upsertMaterialPrice; "No, keep local" dismisses
- [x] Wire PriceSyncDialog into Unit Count custom price-per-item field: on blur, compare entered price to DB row for that session's material; if different, show dialog
- [x] TypeScript: 0 errors after all changes

## v5.41 — Catalog Sync, Grounding Conductor, Live Pricing, Measurement Fix

- [x] Verify all new catalog items (LFNC sizes/fittings, MC fittings) are in the master CATALOG array so seedFromCatalog pushes them everywhere
- [x] Add grounding conductor toggle to RunCard (off by default); when on, show size picker (14, 12, 10, 8, 6, 4, 2, 1/0 AWG); include grounding wire footage in billable wire total and cost
- [x] Rename "Conductors" label to "Current Carrying Conductors" in RunCard
- [x] Fix conduit/wire price lookup: selecting any conduit type/size or wire type/size must immediately recompute cost using the correct catalog ID key from user DB
- [x] Remove "Estimated Material Cost" section from right panel (replaced by live cost in Labor & Material section)
- [x] Wire live material cost display into the Labor & Material section so it updates as user toggles conduit/wire selections
- [x] Fix conductor count calculation bug: calcWire returns per-conductor footage but was not being multiplied by conductors in Wire Only cost display, totalWire aggregation, and wire map breakdown
- [x] Fix double-count bug in conduit mode: calcConduitWire already multiplies by conductors internally; removed redundant \* r.conductors in CrossPageTotals cost aggregation
- [x] Audit measurement tool: math chain confirmed correct (round-trip cancels); scale display formula verified (162 px/in = 72 points × scale 2.25)
- [x] TypeScript: 0 errors after all changes

## v5.42 — EGC Reposition + Calc Bug Fixes

- [x] Fix wire footage bug: 235 ft × 3 conductors × 0% waste should equal exactly 705 ft — changed wireTermMakeup/numPullPoints defaults from 2 to 0 in RunCard and CrossPageTotals
- [x] Fix conduit pricing bug: conduit cost is coming in way too high — findUserPrice now prefers per-foot rows and normalizes per-stick entries by dividing by stick length
- [x] Move EGC (grounding conductor) toggle to a prominent position in RunCard — now appears after conductor size section, before Estimating Inputs
- [x] Make EGC conductor material toggleable (Cu / Al) — added groundMaterial field to RunItem interface; Cu/Al toggle shown when EGC is enabled
- [x] EGC footage must be included in the total wire footage display and cost aggregation — added to totalWire in CrossPageTotals and cost uses groundMaterial
- [x] TypeScript: 0 errors after all changes

## v5.45 — Major Feature Expansion (6 Systems)

### 1. Database Schema Expansion

- [x] Add customerName, address, bidDate, notes, status (enum: Bidding/Won/In Progress/Lost) to projects table
- [x] Create master_items table (userId, itemCode, category, description, unit, masterMaterialCost, masterLaborHours, isActive)
- [x] Create master_assemblies table (userId, name, description, phase, isActive)
- [x] Create master_assembly_items join table (assemblyId, masterItemId, qty, sortOrder)
- [x] Create master_labor_rates table (userId, name, ratePerHour, type: journeyman/apprentice/foreman)
- [x] Create project_items table (projectId, masterItemId, description, unit, qty, masterMaterialCost, overrideMaterialCost, masterLaborHours, overrideLaborHours, phase, sortOrder)
- [x] Create project_assemblies table (projectId, masterAssemblyId, name, phase, sortOrder)
- [x] Create project_assembly_items table (projectAssemblyId, masterItemId, description, unit, qty, masterMaterialCost, overrideMaterialCost, masterLaborHours, overrideLaborHours)
- [x] Create bid_summary table (projectId, percentageLaborFactor, lumpSumHours, markupPct) — one row per project
- [x] Push all schema migrations with pnpm db:push

### 2. tRPC Procedures

- [x] projects router: add search query, update mutation (customerName, address, bidDate, notes, status)
- [x] masterItems router: list, create, update, delete, bulkImport
- [x] masterAssemblies router: list, get (with items), create, update, delete, addItem, removeItem, reorderItems
- [x] masterLaborRates router: list, create, update, delete
- [x] projectItems router: list (by projectId), add (from master or manual), update (qty/overrides), delete, resetToMaster
- [x] projectAssemblies router: list, add (from master), update, delete, updateItem (override), resetItemToMaster
- [x] bidSummary router: get, upsert (percentageLaborFactor, lumpSumHours, markupPct)

### 3. Homepage

- [x] Replace current homepage with clean project grid (Project Name, Customer, Bid Date, Status badge)
- [x] Large search bar at top — wildcard filter across projectName, customerName, address simultaneously
- [x] Status color badges (Bidding=yellow, Won=green, In Progress=blue, Lost=gray)
- [x] "New Project" button with modal (name, customer, address, bid date, status)
- [x] Click project → navigate to Project Detail view

### 4. Project Detail View

- [x] Editable header: Customer Name, Address, Bid Date (date picker), Status (dropdown), Notes (textarea)
- [x] Auto-save on blur for all header fields
- [x] "Back to Projects" button (large, obvious)
- [x] Estimating workspace below header (tabs: Assemblies, Standalone Items, Bid Summary, BOM/RFQ)

### 5. Master Items & Assemblies Management UI

- [x] Settings/Master Catalog page: list master items with search, add/edit/delete
- [x] Master Assemblies page: list assemblies, click to expand items, add/remove items, set qty
- [x] Master Labor Rates page: list rates, add/edit/delete

### 6. Project Assembly Workspace

- [x] "Add Assembly" button — opens master assembly picker, adds copy to project
- [x] Assembly card: shows name, phase, item list with qty/override price/override labor hours
- [x] Inline edit for qty, overrideMaterialCost, overrideLaborHours per item
- [x] "Reset to Default" button per item (replaces override with master value)
- [x] "Add Standalone Item" button — opens master item picker or manual entry
- [x] Phase grouping: items/assemblies can be tagged to a phase

### 7. Bid Summary

- [x] Show rawTotalHours (sum of all overrideLaborHours × qty across all items/assemblies)
- [x] percentageLaborFactor input (default 1.0) — multiplier on rawTotalHours
- [x] lumpSumHours input (default 0) — flat add/subtract
- [x] finalAdjustedHours = (rawTotalHours × percentageLaborFactor) + lumpSumHours
- [x] totalMaterialCost = sum of (overrideMaterialCost × qty) across all items
- [x] markupPct input — applied to material cost only
- [x] Grand total display: material + markup + (finalAdjustedHours × laborRate)

### 8. BOM & RFQ Generation

- [x] Aggregate all project items + assembly items by itemCode/description, sum quantities
- [x] Internal BOM view: description, SKU, aggregated qty, unit, overrideMaterialCost, extended cost
- [x] RFQ view: description, SKU, aggregated qty, unit — NO pricing or labor
- [x] Export BOM as CSV
- [x] Export RFQ as CSV (price-stripped)

### 9. Tests & Cleanup

- [x] Vitest: test bid summary math (rawHours × factor + lumpSum = finalHours)
- [x] Vitest: test BOM aggregation (same item across 2 assemblies sums correctly)
- [x] Vitest: test override/reset (override changes value, reset restores master)
- [x] TypeScript: 0 errors after all changes

## v5.46 — Dedicated Homepage + Classic Projects Card Layout (COMPLETE)

- [x] Create a new BidPhase Homepage (route: /home) — BP branding, tagline, "Go to Projects" CTA button
- [x] BP logo in sidebar navigates to /home (not directly to projects)
- [x] Add a /projects route that shows the classic card-grid layout
- [x] Projects page: dashed "+" card at end of grid to create a new project
- [x] New project creation: name-only inline input (no modal, no extra fields required)
- [x] Existing project cards: project name large, created date small, Open / Rename / Delete action row
- [x] Sidebar nav: add "Projects" nav item pointing to /projects
- [x] TypeScript: 0 errors after all changes

## v5.49 — Project Meta Fields + EGC in L&M Panel + Clear Page Reorder

- [x] Add customerName, address, bidDate, status optional fields to CivilProject interface in AppContext
- [x] Add updateProjectMeta function to AppContext to update those fields per project
- [x] Update ProjectsPage cards to show status badge, customer, address, bid date and allow inline editing via expand/collapse
- [x] Add EGC running total section to CrossPageTotals right panel (after Conductors, before Per-Page Breakdown) — shows billable footage per EGC size/material
- [x] Move Clear Page button to immediately after Unit Count button in idle toolbar (before Undo)
- [x] TypeScript: 0 errors

## v5.50 — RBAC + Assembly Builder + Admin Feature Flags

### Step 1: RBAC

- [ ] Add "contractor" to the role enum in schema.ts (alongside "user" and "admin")
- [ ] Push DB migration for role enum change
- [ ] Expose ctx.user.role to frontend via auth.me query
- [ ] Add useIsAdmin() and useIsContractor() hooks to frontend

### Step 2: Assemblies DB (already exists — verify and document)

- [ ] Confirm master_assemblies, master_assembly_items tables are live
- [ ] Confirm masterAssembliesRouter procedures are wired and functional
- [ ] Confirm laborHours field exists on assembly items

### Step 3: Assembly Builder UI

- [ ] Create standalone AssemblyBuilderPage accessible from sidebar
- [ ] List all master assemblies with search/filter
- [ ] Create/edit assembly: name, description, phase, add items from materials DB with qty
- [ ] Show labor hours total per assembly (sum of item qty × masterLaborHours)
- [ ] Wire to masterAssembliesRouter (list, create, update, addItem, removeItem)

### Step 4: Feature Flags System

- [ ] Add feature_flags table: id, flagKey (unique), label, description, enabledForContractors, updatedAt
- [ ] Push DB migration for feature_flags table
- [ ] Add featureFlagsRouter: getAll (admin), upsert (admin), getForUser (public — returns only keys + enabled state, no admin data)
- [ ] Add featureFlagsRouter to appRouter
- [ ] Add useFeatureFlag(key) hook to frontend that reads from getForUser query

### Step 5: Admin Settings Page

- [ ] Create AdminSettingsPage accessible ONLY when role === "admin"
- [ ] Add "Admin" nav item to sidebar (only visible to admins)
- [ ] Feature Flags section: list all flags with toggle switches, label, description
- [ ] Seed the "enable_labor_units" flag (default: OFF for contractors)
- [ ] Gate all labor-related UI in ProjectAssembliesTab, BidSummaryTab, BomRfqTab behind useFeatureFlag("enable_labor_units")
- [ ] Gate labor data in tRPC responses: strip laborHours fields from projectAssemblies/projectItems list when flag is OFF for contractor role
- [ ] TypeScript: 0 errors after all changes

## v5.50 — RBAC + Assembly Builder + Feature Flags (COMPLETE)

### Step 1: RBAC

- [x] Add `contractor` to the role enum in drizzle/schema.ts (alongside existing `user` and `admin`)
- [x] `adminProcedure` already existed in server/\_core/trpc.ts — no change needed
- [x] Owner openId is auto-promoted to `admin` on every login upsert in db.ts — no change needed
- [x] All existing pages remain accessible to contractor/user role by default

### Step 2: Assemblies Database

- [x] `master_assemblies` and `master_assembly_items` tables already existed from v5.45 — no new migration needed
- [x] `feature_flags` table added to schema (flagKey, label, description, enabledForContractors, timestamps)
- [x] DB migration pushed (pnpm db:push)
- [x] `getAllFeatureFlags`, `getFeatureFlag`, `upsertFeatureFlag`, `seedDefaultFeatureFlags` helpers added to db.ts
- [x] `seedDefaultFeatureFlags` called at server startup — seeds `enable_labor_units` flag (default OFF)

### Step 3: Assembly Builder UI

- [x] `AssemblyBuilderPage` created at client/src/pages/AssemblyBuilderPage.tsx
- [x] Create/rename/delete assemblies with name and optional phase
- [x] Expand assembly to see item list; add items from master catalog via search
- [x] Inline qty editing per item with auto-save on blur
- [x] Material cost and labor hours totals per assembly (labor columns hidden when flag is OFF)
- [x] `useFeatureFlag` and `useFeatureFlags` hooks created at client/src/hooks/useFeatureFlag.ts
- [x] Assembly Builder wired into BidPhaseShell routing at /assemblies with Package icon in sidebar

### Step 4: Admin Dashboard — Feature Flags UI

- [x] `featureFlagsRouter` created with `getAll` (admin only), `upsert` (admin only), `getForUser` (authenticated)
- [x] `AdminSettingsPage` created at client/src/pages/AdminSettingsPage.tsx
- [x] Toggle switches for each flag with ON/OFF badge and description
- [x] Role reference table showing admin/contractor/user distinctions
- [x] Admin Settings nav item in sidebar — only visible when `user.role === "admin"` (Shield icon)
- [x] Route `/admin` wired into BidPhaseShell

### Step 5: Labor Units Feature Toggle

- [x] `enable_labor_units` flag seeded as first toggle (default OFF for contractors)
- [x] `useFeatureFlag("enable_labor_units")` used in AssemblyBuilderPage to hide/show labor columns
- [x] `featureFlags.getForUser` returns all flags as `Record<string, boolean>` — admins always get true
- [x] System is scalable: add new flags via `seedDefaultFeatureFlags` or Admin Settings UI, consume with `useFeatureFlag(key)`

### Tests

- [x] All 38 existing vitest tests pass (0 regressions)
- [x] TypeScript: 0 errors

## v5.51 — Sidebar/Icon Swap, Unit Count Tools, Runs Mode, Plastic Boxes, Search Sync

- [x] Swap sidebar order: Assembly Builder below Material Database
- [x] Swap icons: Assembly Builder gets Database icon, Material Database gets Package icon
- [x] Add Clear Page button to Unit Count toolbar (same behavior as Runs clear page)
- [x] Add Delete button to Unit Count toolbar (delete active count session pins)
- [x] Clicking Runs tab in right panel re-enters measure mode for the active run
- [x] Add residential plastic boxes to materialCatalog.ts with trade slang aliases (1-gang, 2-gang, 3-gang, 4-gang, old work, new work, round, octagon, 4-square, weatherproof, PVC, handy box, gem box, etc.)
- [x] Sync all material search bars (Unit Count, right panel, Material DB) with user DB + master catalog
- [x] Unit Count app catalog syncs with Material Database (user DB rows appear in count search)
- [x] Master catalog count in Material Database page updates dynamically when admin adds/removes items
- [x] TypeScript: 0 errors

## v5.52 — Unified Search Aliases + Unit Count Toolbar Styling

- [x] Expanded ALIAS_MAP in smartSearch.ts with comprehensive trade slang: plug/outlet/receptacle/device, GFI/GFCI/ground fault, AFCI/arc fault, USB, spec grade, tamper resistant, weatherproof, 3-way/4-way/dimmer/fan switch, can/pot/wafer/downlight/troffer/strip/vapor tight, smoke/CO/combo detector, doorbell/chime/transformer, thermostat/stat, panel/loadcenter/breaker/CB, meter socket/base/can, disconnect/safety switch, conduit fittings, wire/cable types, boxes, strut/channel, and more
- [x] Removed all duplicate ALIAS_MAP keys (52 duplicates removed)
- [x] Unit Count toolbar Delete button now uses icon-only ghost style matching Runs toolbar Trash button
- [x] Unit Count toolbar Clear Page button now uses text+icon ghost style with hover:text-destructive matching Runs toolbar Clear page button exactly
- [x] Clear Page only shows when there is content on the page (same conditional as Runs toolbar)
- [x] TypeScript: 0 errors

## v5.53 — Assembly Add-Item Fix, Assembly Unit Counter, Multi-Circuit Runs

- [x] Fix Assembly Builder: catalog items with null category/itemCode now pass zod validation (z.string().nullable().optional())
- [x] Unit Count: count sessions can be linked to a master assembly — each pin represents one assembly instance
- [x] Unit Count: assembly search picker in active session config; shows assembly name badge when linked; X to unlink
- [x] Unit Count: "ASM" badge on session row when an assembly is linked; price-per-item field hidden for assembly sessions
- [x] Unit Count: Save to L&M expands assembly sessions into individual line items (item.qty × pin count per item)
- [x] Run Calculator (conduit mode): multi-circuit conductor groups — Add Circuit / Remove Circuit buttons
- [x] Run Calculator: each circuit has its own conductor count slider, Cu/Al material toggle, and AWG size grid
- [x] Run Calculator: wire cost and CrossPageTotals aggregate across all conductor groups per run
- [x] TypeScript: 0 errors

## v5.55 — Assembly Search Fix + Unit Counter Save-to-L&M Button

- [x] Assembly builder search: deduplicate DB results by description (keep oldest row, hide duplicates from repeated imports)
- [x] Assembly builder: server-side upsert — importing a catalog item that already exists returns the existing DB row instead of creating a new duplicate
- [x] Assembly builder: search panel closes immediately on item click (optimistic close, no stale results)
- [x] Assembly builder: all result buttons disabled immediately on click (prevents duplicate adds from multi-tap)
- [x] Unit counter: Save to L&M button added to each session row (visible when session has ≥1 pin)
- [x] smartSearch: added outlet cover / outlet plate / switch cover / switch plate / cover / screwless aliases
- [x] TypeScript: 0 errors

## v5.56 — Run Totals Fix, Section Reorder, Search Fix, Export Button, Assembly Badge

- [x] Fix run totals not updating on drag/extend: useEffect now depends on full point coordinates; drag-end auto-re-pushes footage if run was already pushed
- [x] Reorder RunCard: Run Type first → Current Carrying Conductors → EGC → Conduit details (Wire Only hides irrelevant fields immediately)
- [x] Remove duplicate Run Type toggle left at old position
- [x] Fix assembly builder search stale results: allItems fetched whenever assembly is expanded (staleTime:0) and force-refetched when add panel opens
- [x] Restore large full-width Export Material List (CSV) button with solid yellow background
- [x] Assembly count badge: solid yellow pill with Layers icon + assembly name (up to 12 chars)
- [x] TypeScript: 0 errors

## v5.57 — RunCard Reorder, Circuit Labels, Empty/Future Hide, Cover Plates

- [x] Reorder conduit RunCard: Conduit Type → Conduit Size → Empty/Future Pull toggle → Conductors → EGC → Estimating Inputs → Outputs → Fittings
- [x] Empty/Future Pull toggle now highlighted yellow when active (border + text)
- [x] Conductor groups and EGC hidden when Empty/Future Pull is on (no wire needed for stub-outs)
- [x] Circuit label changed from "Circuit 2" to "Circuit 2 of 3" so user knows total circuit count
- [x] Added 33 new white device cover plate items to master catalog: 1G/2G/3G/4G standard, midsize (Leviton 80601-W/80714-W), jumbo (Leviton 88001-W/88014-W), screwless (Leviton 84001-W/84003-W/84014-W), combination plates; all with searchAliases
- [x] Added smartSearch aliases: no screw, smooth plate, seamless plate, midsize plate, jumbo plate, oversized plate, double/triple/quad gang plate, 2/3/4 gang plate, combination plate, combo plate
- [x] TypeScript: 0 errors

## v5.58 — RunCard Reorder, Cover Plates Simplified, Search Engine v2

- [x] Move conduit type/size/empty selector to directly after Run Type toggle (before conductors)
- [x] Simplify cover plates: remove screwless/jumbo/midsize specialty items; replace with 20 standard mid-size (Midway) white cover plates (1G/2G/3G/4G × Blank/Duplex/Toggle/Decora/GFCI)
- [x] Rewrite smartSearch v2: per-token alias expansion, prefix-aware tiered scoring (exact→starts-with→word-boundary→contains), all-tokens-must-match filter, item index cache
- [x] Rich alias map: 150+ trade terms, abbreviations, brand names (Romex/NM-B, THHN/THWN, EMT/thin wall, GFCI/GFI, decora/rocker, outlet/receptacle, conduit bodies, panels, breakers, etc.)
- [x] TypeScript: 0 errors

## v5.59 — Assembly Picker UX, EGC Wire Totals, Locked Takeoff, Export Button

- [x] Unit counter: replace assembly text search with searchable dropdown (shows all assemblies, filters as you type, auto-fills session name from assembly name)
- [x] Unit counter: auto-fill session name from assembly name when assembly is linked
- [x] Run calculator: lock Measured Takeoff field — read-only when feetFromPlan=true; shows lock icon and hint; only plan tool can update
- [x] Run calculator: include EGC in billable wire length — conduitWireBillable now adds EGC footage; output shows breakdown (incl. X ft EGC)
- [x] Restore yellow Export button with dropdown: Export as CSV (Excel-compatible) and Export as PDF (print dialog) options
- [x] TypeScript: 0 errors

## v5.61 — PDF Performance Sprint

- [x] Bitmap cache: renderPageBitmap() renders pages via raw pdfjs-dist OffscreenCanvas and stores ImageBitmap per page, keyed by pdfHash+page
- [x] Prefetch ±2 adjacent pages in background after each page render (staggered 50ms apart to avoid blocking main thread)
- [x] pdfDocRef stores raw pdfjs document on PDF load for bitmap rendering
- [x] Crosshair-only redraw: snapshot canvas after full redraw; on mouse move only restore snapshot + draw crosshair lines (no full run/pin redraw on every mouse move)
- [x] Snapshot invalidation: re-captured whenever runs, pins, or page change so crosshair always restores to correct state
- [x] TypeScript: 0 errors

## v5.70 — Smooth Crosshair Rebuild (Dedicated Canvas Approach)

- [x] Rolled back to stable baseline before all RAF/snapshot jitter experiments
- [x] Crosshair moved to dedicated crosshairCanvas (zIndex 11, pointer-events:none) — main canvas never redrawn on mouse move
- [x] crosshairPosRef + RAF deduplicate crosshair draws; no React state change on mouse move = zero jitter
- [x] Viewport cursor: grab off-page at all times, grabbing when panning; canvas cursor:none in active tool mode
- [x] Page navigation (goToPage) now calls zoomReset() so clicking any page chip or arrow re-centers at 40% zoom
- [x] TypeScript: 0 errors

## v5.71 — Estimating Defaults to 0, Zoom Glitch Fix, Instant Page Load

- [x] Crosshair canvas size synced inside drawCanvas — prevents stale canvas dimensions after zoom causing crosshair to draw at wrong scale
- [x] bitmapCanvasRef added: displays cached bitmap instantly on page navigation (z-index 1, behind overlay canvas); eliminates blank-page flash when switching pages
- [x] onRenderSuccess caches current page to bitmapCanvas and prefetches adjacent pages
- [x] Instant bitmap display useEffect: draws cached bitmap to bitmapCanvas immediately when currentPage changes
- [x] All estimating input defaults changed to 0: conduitWasteFactor, wireWasteFactor, wirewasteFactor, makeupAllowance, serviceLoop, numTerminations, wireTermMakeup, numPullPoints
- [x] calcWire, calcConduitBillable, calcConduitWire function default parameters all changed to 0
- [x] All ?? 10 fallback defaults in run calculations changed to ?? 0
- [x] handlePush new run defaults changed to 0 for all estimating fields
- [x] TypeScript: 0 errors

## v5.72 — PlanPanel Consistency Fixes

- [x] Page centering on navigation works for all projects (old and new) — re-center again after cached/real page render so page changes always land with the full sheet visible
- [x] Bitmap cache and instant page load works for all projects — legacy saved PDFs now auto-derive and persist pdfHash on restore so old projects use the same bitmap cache + prefetch path
- [x] Restore scrollable page overview panel — wheel zoom is disabled while the overview overlay is open so the page picker can scroll naturally again
- [x] TypeScript: 0 errors

## v5.73 — Project Switching & Fast Page Load

- [x] useLocalStorage re-reads from localStorage when key changes (project switch) — fixes stale page/zoom/hash
- [x] PlanPanel tabKey-change effect resets all transient state (numPages, autoFittedRef, bitmapPageRef, mode, pan, zoom) on project switch
- [x] Document key includes tabKey so switching projects always forces a fresh react-pdf mount
- [x] Start zoom always 40% centered when opening any project
- [x] Page navigation works correctly across all projects
- [x] Instant bitmap cache loading works across all projects
- [x] TypeScript: 0 errors

## v5.74 — Smooth All Projects + Remove M Logo

- [ ] Fix lag/jitter on page load and navigation for all projects (match Pine St smoothness)
- [ ] Remove M logo/icon from measurement distance display on runs

## v5.74 — Smooth All Projects + M Logo Fix

- [x] Remove "M=measure" text from hint bar (was appearing as M logo next to run distance)
- [x] Skip pdfLoading gate when bitmap cache already has the current page — instant display on project switch
- [x] Replace heavy react-pdf thumbnail rendering in page overview with lightweight bitmap cache canvases
- [x] TypeScript: 0 errors

## v5.75 — Rename to HelixBid

- [x] Renamed all occurrences of "BidPhase" / "Bid Phase" to "HelixBid" across all source files, comments, UI text, exports, page titles, IndexedDB name, and package.json
- [x] Renamed BidPhaseShell.tsx → HelixBidShell.tsx and BidPhaseHomePage.tsx → HelixBidHomePage.tsx
- [x] All imports and references updated automatically
- [x] TypeScript: 0 errors

## v5.92 — Direct Anthropic API Configuration

- [x] Add an encrypted server-side `ANTHROPIC_API_KEY` secret for direct Anthropic requests
- [x] Configure BidRender's server-only direct Anthropic client without exposing credentials to the browser or GitHub
- [x] Add automated validation for the direct Anthropic configuration
- **REVERTED 2026-08-12.** A stopgap while the Forge gateway key was thought to
  be missing; the gateway works, so the second credential path was removed
  (`server/directAnthropic.ts`, `server/anthropic.secret.test.ts`). The app
  reaches Claude one way only, through `BUILT_IN_FORGE_API_KEY` — see
  `references/deploying.md` § 8. If direct Anthropic access is ever wanted
  deliberately, that doc needs updating too.

## v5.92 — GitHub Synchronization Verification

- [x] Review the newer GitHub schema changes and identify the exact migrations required by the synchronized code
- [x] Apply only verified, non-destructive schema migrations needed for the merged BidRender release
- [x] Verify the restarted application loads without server or client build errors

## v5.93 — Publish Verification & Internal Project Rename

- [x] Verify the saved checkpoint and GitHub `main` are aligned before publishing
- [x] Rename the internal Manus project identity from BidPhase to HelixBid
- [x] Validate the renamed project configuration and document the safe Publish behavior
- **Branding test reverted 2026-08-12.** `server/projectBranding.test.ts`
  asserted `VITE_APP_TITLE === "HelixBid"`, a variable this repo never sets, so
  it failed everywhere except the environment that defines it. The rename
  itself stands; only the test was removed.

## v5.94 — Archive Cleanup Activation

- [x] Inspect and apply the verified database migration 0026 required by the current BidRender GitHub main branch
- [x] Register the documented 30-day archive-cleanup heartbeat for the deployed application
- [x] Validate the migration and active scheduled job, then save a checkpoint synchronized with GitHub main

## v5.95 — Pre-Deploy Migration Synchronization

- [x] Pull the latest GitHub main branch and inspect migrations 0029, 0030, and 0031
- [x] Apply the verified pending schema migrations with `pnpm db:push` before release
- [x] Correct the discovered missing `pricing_defaults.productivityPct` column required by the merged release
- [x] Validate the migrated release, synchronize GitHub main, and save the publish-ready checkpoint

## v5.96 — R2 Backup Release & Verification

- [x] Pull the latest GitHub main and inspect the independent R2 backup tool plus all pending migrations
- [x] Re-run the GitHub release inspection cleanly from the newest main branch before any merge or migration action
- [x] Apply verified schema migrations and validate the backup-enabled release (checkpoint pending)
- [x] Add the four encrypted, server-only Cloudflare R2 credentials after production deployment
- [x] Add the required encrypted `R2_BUCKET` name and validate the R2 destination before running the backup
- [ ] Resolve the Manus source-storage 403 responses blocking the four stored PDF copies, then rerun and verify a complete production backup

## v5.97 — Source Storage Repair & Complete R2 Backup

- [x] Classify the four 403 storage keys as development fixtures rather than customer data
- [x] Resolve the 403 blocker by removing the four user-approved stale test references whose source objects no longer exist
- [x] Rerun and verify a complete R2 backup containing the database, manifest, and every remaining stored-file reference

## v5.98 — Approved Stale Test Data Cleanup

- [x] Remove only the four approved stale test bid/PDF records: Trace test, Copilot test, Stamp test, and Sheet test
- [x] Confirm the four `test/...` PDF references are gone before rerunning the backup

## v6.0 — Multi-Trade Foundation, Clients & Dashboard Entry

- [x] Add the `trade` axis to labor rates, kits and the company settings tables (migrations 0034/0035)
- [x] Keep labor rates and settings shared across trades with the `all` sentinel rather than stamping them electrical
- [x] Add client records (company/individual, address, phone, email, notes, archivable) linked to bids by a nullable `clientId`
- [x] Diagnose plan upload failing entirely — storage refusing the browser before any bytes leave (bucket CORS)
- [x] Replace the one vague upload error with six that say what happened and whether retrying helps
- [x] Raise the plan limit to 500MB and add the same-origin fallback for while CORS is unconfigured
- [x] Add a retry button to a failed upload, reusing the file already chosen
- [x] Build the Clients screen and the client control on a bid
- [x] Put "Upload a plan" and "Quick bid" on the Dashboard as the two ways to start
- [x] Remove the legacy splash page; `/`, `/home` and unknown routes land on the Dashboard
- [x] Delete six dead legacy page files and retire the `/trash` and `/project/:id` routes
- [ ] Apply the storage bucket CORS rule (references/deploying.md § 9) — plan upload above 25MB stays broken until it lands
- [x] Add ranged PDF loading so a 500MB set does not have to be fully resident in tab memory
- [ ] Verify plan tracing and scale-setting against a plan that actually uploaded

## v5.99 — Exact GitHub Main Deployment Sync

- [x] Synchronize the local project exactly with the latest GitHub `main` branch without local feature edits
- [x] Apply only the pending migrations provided by GitHub `main` using `pnpm db:push`
- [x] Validate the GitHub-aligned build and save the exact publish-ready checkpoint

## v6.09 — Bid 420001 Plan Storage 403

- [x] Inspect production logs and the bid 420001 database plan record for the failed plan request
- [x] Probe the recorded plan key through the configured server-side storage read path
- [x] Document the storage access-denied finding and the non-destructive recovery path

## Follow-ups from v5.129 — Docs & Changelog

- [ ] `references/deploying.md` § 8 says login is "OAuth-only; no password flow is wired up despite `passwordHash` existing on `users`" — untrue since v5.127/5.128. `server/routers/authRouter.ts` has bcrypt signup, login and change-password. That table is what someone reads to size the work of leaving Manus, and it currently overstates it by a whole login system.
- [ ] `server/backup.test.ts` uses `"bidrender-backups"` as a fixture bucket name. Harmless test data — the real bucket is `bidsoftware` — but it is now the last place that string survives, so it will read like the configured value to whoever finds it next.
- [ ] Decide whether v5.129 (the docs-only R2 key-replacement commit) belongs in `CHANGELOG.md`. Skipped at the time because nothing about the app's behaviour changed, which is the exemption CLAUDE.md allows.

## Migration cutover — DigitalOcean App Platform

- [x] Delete the old HelixBid Anthropic API key once the app is live on DigitalOcean and Manus is shut off. Deleted 2026-09-16. The live site runs on its own `ANTHROPIC_API_KEY`, verified working the same day.
- [x] Set a monthly spend limit on the Anthropic workspace — BidRender production, $50/month with an email alert at $25 (set 2026-09-16). The app's own limits cap one person per day; this is the only one that caps the account.
- [x] Set `ANTHROPIC_API_KEY` in the DigitalOcean environment. Confirmed set 2026-09-16, and verified on the live site after the v5.142 deploy — "Ask about this sheet" answers questions.
- [x] Set `CRON_SECRET` on DigitalOcean and, byte-identical, via `wrangler secret put CRON_SECRET`. Done 2026-09-17. Byte-equality was proved rather than assumed: a hand-triggered POST to `/api/scheduled/backupToR2` carrying the value from `.env.production.local` was accepted (200) by the live site before the Worker was given the same value. Note `.env` holds a DIFFERENT `CRON_SECRET` for local dev — taking that one is the easy mistake, and it fails silently, because the app's refusal is deliberately identical to every other refusal.
- [x] Fill in `APP_BASE_URL` in `workers/cron/wrangler.toml` and `wrangler deploy` the cron worker. Done 2026-09-17. Both triggers confirmed attached (`0 9 * * *`, `30 10 * * *`), and the times were moved from 02:00/03:30 UTC to 09:00/10:30 UTC so they land overnight Pacific rather than early evening. The Worker had to be deployed from a real terminal: registering the account's workers.dev subdomain is an interactive prompt, and a non-interactive shell answers "no" to it every time — see the comment in `wrangler.toml` for the full trap.
- [x] Set `PLAN_STORAGE=r2` plus the `R2_PLANS_*` values, so plan files go to Cloudflare rather than Manus.
- [x] Add a CORS rule on `bidrender-plans` for the live origin, exposing `ETag` — an upload in pieces cannot be reassembled without it. Verified 2026-09-16: a preflight from `https://bidrender.com`, `https://www.bidrender.com`, the `ondigitalocean.app` host and `http://localhost:3000` returns 204 with the origin allowed, and a real ranged GET exposes `ETag,Content-Range,Accept-Ranges,Content-Length`.
- [x] Set `R2_PLANS_READONLY_ACCESS_KEY_ID` and `R2_PLANS_READONLY_SECRET_ACCESS_KEY` on DigitalOcean, so the backup reads plans from R2 rather than buffering them through Manus. Confirmed 2026-09-16 in the App Platform settings: both present, encrypted, Run-time scope. This was the gate on v5.141 reaching `main` — group C removed the backup's fallback route for reading plans, so without these two keys the first nightly backup after the deploy would refuse outright.

## Manus removal — what is left

- [ ] Remove the dead Manus branch inside `server/_core/storageProxy.ts`. Since v5.141 it only ran when the storage backend was `manus`, which is no longer a backend, so it cannot be reached. **The `/manus-storage` web address itself stays exactly as it is** — it is written into `bid_pdfs.url` and the legacy `projects.pdfUrl` for every file already stored, so renaming it would break every existing plan link at once. It serves disk and R2 now; only the name is historical.
- [ ] Remove `BUILT_IN_FORGE_API_KEY` and `BUILT_IN_FORGE_API_URL` when the Manus AI fallback in `server/_core/llm.ts` goes. Nothing else needs them once that and the proxy branch above are gone. Neither is set on DigitalOcean, so that fallback is already dead on the live site — the app runs on `ANTHROPIC_API_KEY`. They are still read by `server/_core/env.ts`, which is what defines `ENV.forgeApiUrl` / `ENV.forgeApiKey`.

### Docs (group F)

- [x] `references/backups.md` § 4 — replaced the `manus-heartbeat` registration with the Cloudflare Worker sequence. Done 2026-09-17. Now carries the real order (`wrangler deploy`, THEN `wrangler secret put CRON_SECRET`), the five-field UTC times with their Pacific equivalents both sides of the November clock change, why the purge stays 90 minutes behind, and where to look in the dashboard. Points at `workers/cron/wrangler.toml` for the subdomain trap rather than repeating it.
- [x] `references/deploying.md` § 7 — same rewrite. Done 2026-09-17. The six-field seconds-first format is gone from both files; Cloudflare rejects it outright.
- [x] Sweep the rest of `references/` for Manus-era platform instructions. Done 2026-09-17. Findings recorded as the items below rather than fixed, so each can be judged on its own.
- [x] `references/disaster-recovery.md` rewritten for DigitalOcean + Cloudflare. Done 2026-09-17. It had gone wrong in the two most expensive ways a recovery plan can: it said login was OAuth-only and had to be rebuilt from scratch — untrue since v5.127/5.128, bcrypt sign-in restores with the database — and that `server/storage.ts` presigns through Forge, untrue since v5.141. Someone following it on a bad day would have budgeted weeks for work already done.

**Found by the sweep — actively misleading (a reader would take a wrong action). All eight fixed 2026-09-17 (v5.146); kept with their findings so the next reader can see what was wrong and judge the replacement:**

- [x] `references/backups.md` § 1 and § 2 both say the backup "falls back to reading through Manus" when `R2_PLANS_READONLY_*` is missing, and that "the Manus reader is still there". There is no Manus reader since v5.141 — the backup **refuses to start**. As written, a missing key reads as survivable when it stops backups dead. Worst of the set, and in a file that was otherwise just brought up to date.
- [x] `references/deploying.md` § 1–§ 4 describe the entire deploy procedure as: push to GitHub, then open a Manus session, run a pre-flight in the sandbox, `git pull`, save a checkpoint, press Deploy. None of that exists. Pushing `main` auto-deploys DigitalOcean now. A reader would either wait for a deploy step that never comes, or believe `main` has not shipped when it already has.
- [x] `references/deploying.md` § 6 recommends the navigation helper as the cheapest post-deploy probe "because it exercises `BUILT_IN_FORGE_API_KEY`, which exists only on deployed infrastructure". The app runs on `ANTHROPIC_API_KEY`; the Forge variables are not set on DigitalOcean at all. The probe is still a good one, for a different reason.
- [x] `references/deploying.md` § 8 — "Four Manus services the app cannot run without… Leaving Manus means replacing all four, including building a login system." Wrong on both halves: it already left, and the login system exists. This is the table someone reads to size the work, and it overstates it by an entire authentication rebuild.
- [x] `references/deploying.md` § 9 attributes the CORS rule to "the bucket behind `BUILT_IN_FORGE_API_URL`" and calls it "a Manus-side setting". It is the `bidrender-plans` R2 bucket, and it was configured 2026-09-16.
- [x] `references/environment.md` § 2 and § 6 say the Forge variables do double duty as object storage AND the LLM gateway, and that replacing storage means rewriting `storagePresignPut` / `storageGetSignedUrl` to sign against your own bucket. Both functions are gone. Storage is disk or R2 behind `server/storage.ts`, and adding a third backend means implementing four operations, not editing a router. Would send someone building what already exists.
- [x] `references/environment.md` § "Plan files — bucket `bidrender-plans`" says "Nothing reads these yet; they are slots for the R2 storage backend." Those are the live production storage credentials.
- [x] `references/environment.md` § R2 note still says "Every backup was taken by hand, and stays that way until the new host is running." Automatic since 2026-09-17.

**Found by the sweep — stale but harmless (historical record, or already labelled):**

- [ ] `references/periodic-updates.md` documents the Manus scheduler end to end — `manus-heartbeat`, AGENT cron, `user.isCron`, six-field expressions. Low priority **only because it already opens with a prominent header saying all of it is historical and describing what replaced it.** That header is what makes it honest rather than dangerous. Worth trimming eventually; do not remove the header before then.
- [ ] `references/database-digitalocean.md` mentions Manus throughout, almost all of it accurate history of how the DigitalOcean database was built and why it was not restored from the old one. Only the line saying plan files are "still Manus storage; replacing it is its own job" is stale.
- [ ] `references/backups.md` § 1 points the reader at `deploying.md` § 8 for "four Manus services" — a pointer to one of the wrong entries above. Fix alongside it.
- [ ] `references/takeoff-spec.md` — the two matches are the ordinary word "forget". No action; noted so the next sweep does not re-check it.
- [ ] `references/environment.md` § 1 lists `DATABASE_URL`, `JWT_SECRET` and the three OAuth variables as coming from "Manus environment settings" — they come from DigitalOcean now. Noticed 2026-09-17 while fixing § 2 and § 6, and deliberately left: only the source column is wrong, and the harder question sitting underneath it is whether `OAUTH_SERVER_URL` / `VITE_APP_ID` / `VITE_OAUTH_PORTAL_URL` still belong under "the app will not work without these" at all, now that sign-in is email and password. `VITE_OAUTH_PORTAL_URL` may still crash `AuthGuard` when absent; that wants checking against the code rather than assuming, and it overlaps Manus removal group B (`getLoginUrl`, `oauth.ts`). Fix the column and answer the question in one pass.

## Test suite health

**The three-command ritual that used to be here is gone — 2026-09-18.** It said
to flip `DISABLE_AI_FEATURES` in `.env`, run the suite, and flip it back. A check
that has to be remembered, performed and then undone is a check nobody performs,
and the undo was the dangerous step: forgetting it leaves a dev server able to
spend money.

**`vitest.setup.ts` now decides the AI environment itself**, unconditionally, and
blanks `ANTHROPIC_API_KEY` while it is at it. A suite's environment must not be
inherited from whoever's `.env` it happens to run under, and with the flag on,
a suite that ever forgot a mock would spend real money on every run. Both lines
are commented where they sit.

> **FIXED 2026-09-26 — the suite is 0 failures on `bidrender_test_clean`.**
> `server/v545.test.ts` failed 8 tests there with
> `companies_ownerUserId_users_id_fk`: written in the Manus era, it acted as a
> hand-built user `id: 1` — the owner's real account on the old dev database —
> and the scratch database has no user 1. It now inserts its own fixture user
> (5450), builds its context from that row as read back, and deletes it after.
> **Six more of its tests had been passing while testing nothing**
> (`if (!createdId) return;`), so the real count broken was 14, not 8; those
> guards are assertions now. The remaining non-passes are 4 deliberate
> `skipIf(!hasGateway)` model checks, and the `[BackupToR2] FAILED` line in the
> output is a passing test exercising that failure path.

**The baseline is now 0 failures.** The last 3 were all in `backup` and needed a
database grant rather than a flag; granted 2026-09-19, and `server/backup.test.ts`
now runs 32 passed / 0 failed. See below for what the grant was.

- [x] Grant the `bidrender` MySQL login rights to create the scratch schemas the backup tests and the verify tool need. Not a code fault and not fixable in the repo. (Was 26 across three files until 2026-09-18, when `vitest.setup.ts` took over the AI environment and `planCopilot` (21) and `navigation` (2) went green; 35 across five files before that, when the `bidrender_test` schema was behind.) Worth finishing because a suite that always shows red teaches people to stop reading it — which is how a real regression gets through.

  **This entry named one schema and there are five, which is why granting it and rerunning kept leaving failures on the board.** Confirmed 2026-09-19 by running the suite: the first failure reports `Access denied for user 'bidrender'@'127.0.0.1' to database 'bidrender_verify_selftest'` — not `bidrender_backup_restore_test`, the only name this entry used to give. The full set is `bidrender_backup_restore_test` (`server/backup.test.ts:246`), `bidrender_verify_selftest` (`:595`), `bidrender_verify_corrupt` (`:634`), `bidrender_verify_mismatch` (`:666`), and `bidrender_backup_verify` (the default in `server/backup/verifyBackup.ts:67`, used by `scripts/verifyBackup.mts`). The login holds `ALL PRIVILEGES` on `bidrender_local` and `bidrender_test` only, and bare `USAGE` globally, so it can create none of them.

  One grant covers all five, now and later — note the escaped underscore, because `_` is a wildcard in a MySQL grant pattern and an unescaped one would match far more than intended:

  ```sql
  GRANT ALL PRIVILEGES ON `bidrender_%`.* TO 'bidrender'@'127.0.0.1';
  FLUSH PRIVILEGES;
  ```

  Done 2026-09-19. **Run it against port 3307, not 3306.** Two MySQL servers run on
  this machine from the same `mysqld.exe`: the `MySQL80` Windows service on 3306,
  and the app's own instance on 3307 started by `BidRenderLocalstart-mysql.cmd`
  with `--defaults-file=BidRenderLocalmy.ini`. They have separate data folders,
  so separate `mysql.user` tables and separate root passwords — 3307's is in
  `BidRenderLocalpasswords.txt`. Granting on the wrong one fails with
  `ERROR 1410 ... not allowed to create a user with GRANT`, because `bidrender`
  does not exist on 3306 at all. Check with `SELECT @@port, @@datadir;` before
  granting; an access-denied from the wrong server looks just like a bad password.

- [ ] `server/backup/verifyBackup.ts` built its scratch connection with `mysqlConnection(scratchDatabaseUrl)` and no environment argument, so it inherited `DATABASE_CA_CERT` — **production's** certificate — and applied it to whatever local server the restore was pointed at. Fixed 2026-09-19; `VERIFY_DATABASE_CA_CERT` now covers a scratch server that needs its own TLS.

  Worth keeping as a written-down shape rather than a closed ticket. It was dormant for as long as `DATABASE_CA_CERT` was unset and broke the moment production moved to a managed database — the failure was `self-signed certificate in certificate chain` from the LOCAL server, naming a certificate that belongs to the database not being restored into. Nothing about the message points at the cause. The nightly verification would have failed the same way and just as quietly, leaving backups that nobody was confirming. Proved by changing that one variable and watching the error become a different one.

## Working on this repo — traps

**Running an OLDER build's tests against the shared test database puts the
old catalog names back.** Found 2026-09-26.

The suite starts the seeders, and a seeder only knows the names in its own
checkout. Point a worktree at an earlier commit — which a deploy of part of
`local-dev` does, to test exactly what is shipping — and it sees
`#8 XHHW aluminum` missing (the newer build renamed it) and inserts it as a
fresh row. Every later run of the current code then finds BOTH spellings, and
`renameBaselineMaterials` correctly refuses to merge them. On
`bidrender_test_clean` that left 46 stray rows, and
`materialsCatalog.test.ts > renames the reshaped rows in place` failed on a
catalog that was fine.

**It is a test-database fault, not a catalog one.** Production cannot get into
this state, because only one build seeds it at a time and never an older one
after a newer. To confirm rather than assume: restore a production backup,
start the build that is shipping against it, and check that no baseline row is
left on an old spelling.

**Repair:** list the baseline rows whose name is a key of
`RENAMED_BASELINE_MATERIALS` while the new name also exists, check nothing
references them (`assembly_materials`, forks via `baselineId`, run types,
`takeoff_groups`), and delete them. **Avoid it:** give an old-commit test run a
database of its own — `CREATE DATABASE … CHARACTER SET utf8mb4 COLLATE
utf8mb4_unicode_ci`, then `scripts/migrate.mts` against it, since a server
default collation fails at 0055.

**`users.lastSignedIn` reads back SEVEN HOURS in the future. Do not compare it
to the clock by eye.**

Found 2026-09-19 while working out whether a sign-in had succeeded. Read
straight out of the table it looked like the account had signed in seven hours
from now, which is the sort of thing that sends the next reader hunting for a
clock bug, a bad write, or a corrupted row. None of those is happening.

**What is actually going on.** The column is a `TIMESTAMP`, so the MySQL driver
timezone-converts it on the way out; `now()` is not a column and comes back
unconverted. `server/databaseConnection.ts` sets no `timezone`, so the gap is
exactly the machine's UTC offset — seven hours on PDT. The two values are
simply not in the same frame, and neither one is wrong on its own.

**Compare inside SQL, where both sides are in the database's frame:**

```sql
select email,
       timestampdiff(SECOND, lastSignedIn, now()) as secondsAgo
  from users
 where email = 'you@example.com';
```

A negative `secondsAgo` that is close to your UTC offset in seconds (25200 on
PDT, 28800 on PST) is this, not a real future timestamp.

**Why it is not being fixed today:** `lastSignedIn` is written in four places
(`authRouter.ts` signup and login, `_core/oauth.ts`, `_core/sdk.ts`) and **read
by nothing** — not retention, not analytics, not the UI. So it misleads a person
reading the table and costs the app nothing. If anything ever starts reading it,
fix the frame first, because every stored value is ambiguous until then.

**A failed sign-in leaves no trace anywhere. There is nothing to look at.**

Also found 2026-09-19. `authRouter.login` throws `UNAUTHORIZED` on both a
missing account and a bad password, and logs neither. There is no tRPC
`onError` handler, so nothing reaches the console either. The only auth line the
dev server ever prints is `[Auth] Missing session cookie`, which is an
unauthenticated page load — **not** a rejected login, and easy to mistake for
one.

The practical consequence: the only way to tell a successful sign-in from a
failed one, after the fact, is that a success writes `users.lastSignedIn` and a
failure writes nothing. That works for one known account and does not scale to
"a user says it will not let them in", where there would be no record that they
ever tried. Worth a counter or a log line before anyone but the author is
signing in; deliberately not built today.

**A single stray NUL byte makes `grep` skip a whole source file, silently.**

Found 2026-09-19 in `shared/materialsList.ts`, which had one NUL where a space
belonged, in the middle of an ordinary template string on line 142:

```ts
const key = `${material.name.trim().toLowerCase()}${material.unit}`;
//                                                 ^ this was a NUL, not a space
```

**Why it matters more than a typo.** ripgrep and grep treat any file containing
a NUL as binary. They do not search it and they do not error — `grep -rn` prints
`Binary file shared/materialsList.ts matches`, or with common flag combinations
prints **nothing at all**. So every repo-wide search that should have found
something in that file came back empty, and came back empty _confidently_. This
project's whole working method is "grep the reference files and the code before
specifying anything" (CLAUDE.md § Where decisions live). A file that cannot be
grepped is a file whose decisions are invisible to that method.

It had been there long enough that earlier searches touching this file were
lying. Nothing in the app misbehaved: the NUL worked fine as a map-key
separator, so there were no symptoms at all.

**How to spot it.** A file that `grep` calls "binary" when it is plainly source,
or a search that finds nothing where you are sure something is. To confirm and
locate:

```bash
file shared/materialsList.ts        # says "data" instead of "JavaScript source"
perl -ne 'print "$.\n" if /\x00/' shared/materialsList.ts   # the line number
```

To sweep the whole tree for others (there were none):

```bash
for f in $(find client/src server shared drizzle workers scripts -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' -o -name '*.mts' \)); do
  perl -ne 'exit 1 if /\x00/' "$f" || echo "NUL: $f"
done
```

**`git stash` is not safe in this checkout. Do not use it.**

> **A hook now refuses it** — `.claude/hooks/block-git-stash.mjs`, wired up in
> `.claude/settings.json`, denies any Bash command containing `git stash` and
> prints the worktree alternative. Added 2026-09-18 because this entry was
> written, read, and then ignored twice on the same day: a warning in a file you
> have to go looking in is not available at the moment the command is typed. The
> rule is also in CLAUDE.md now, which is read every session. **The recovery
> commands below stay here** — they are what you need when it has already
> happened, and that is a moment for a reference, not a guard rail.

Hit 2026-09-18:
`git stash push --include-untracked` reported failure, and left a state where
the stash entry EXISTED, the tracked modifications were still in the working
tree, and the untracked files had been **deleted from disk**. Half-applied in
the one direction that loses work — the files it removed were the only copies.
Almost certainly OneDrive: the folder is inside `OneDrive\Documents`, and the
sync client holds handles on files while git is trying to move them.

> **2026-09-24:** the working copy moved to `C:\dev\BidPhase`, outside OneDrive,
> so this checkout no longer has the cause. The hook stays anyway — CLAUDE.md
> § "Use `git worktree`, not `git stash`" says why.

**If it has already happened, the work is recoverable and here is where.** An
untracked file lives in the stash's third parent, which `git stash show` does
not list:

```bash
git show --name-only --format="" stash@{0}^3      # what was taken
git checkout stash@{0}^3 -- path/to/file          # bring one back
git reset -q HEAD path/to/file                    # un-stage it again
git diff stash@{0} --stat                         # empty = tracked files match too
```

Check that last one before dropping the stash. Then don't reach for stash again:
to test something against a clean tree, use `git worktree add` — a separate
directory, so nothing touches the files you are working in.

- [ ] Make `pnpm test` pass on a clean checkout so the workaround above can be
      deleted. Tracked under "Test suite health" above; noted here too because
      this is the section someone reads when something inexplicable happens.

**Four tables are on a different collation from the other 49, and the next
join against one of them will fail with no clue why.** Found 2026-09-18 while
writing the phase 6 backfill.

Every table in this schema is `utf8mb4_unicode_ci`. The DATABASE default is
`utf8mb4_0900_ai_ci`, and drizzle-kit's `CREATE TABLE` names no collation — so
a new table silently takes the database's instead. These four did:

- `ai_usage_daily`
- `bid_mounting_heights`
- `takeoff_height_defaults`
- `takeoff_mounting_heights`

**Nothing is broken today.** It only bites when a string column of one of them
is compared with a string column of an older table, and nothing does that yet.
When something does, MySQL refuses the whole statement:

```
ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations for operation '='
```

which says nothing about tables, columns or why, and lands wherever the query
runs — including inside a migration, mid-file, with earlier statements already
applied. That is exactly how it was found: the backfill joined a new table's
`label` to an old table's `assemblyName` and stopped on statement 4 of 4.

- [ ] Decide whether to convert these four to `utf8mb4_unicode_ci`. **Not
      urgent, and not obviously worth it**: `ALTER TABLE … CONVERT TO CHARACTER
SET` rewrites a live table, which is real risk for a problem nothing is
      currently hitting. The cheap half is already done — every new table names
      its collation explicitly (references/deploying.md § 5, and
      `drizzle/0053_worried_puppet_master.sql` as the worked example) — so the
      list above can only shrink, never grow. Read this entry before writing a
      query that joins one of their text columns to anything older.

**`pnpm test` WRITES TO WHATEVER `DATABASE_URL` POINTS AT, and in this
checkout that is the local dev database.** Hit 2026-09-18 — the suite was run
twice against `bidrender_local` before anyone read the warning `.env` carries
in its own header.

The mechanism, because it is not obvious from either file: `vitest.config.ts`
sets `setupFiles: ["dotenv/config", ...]`, so **every test run loads `.env`**.
`vitest.setup.ts` then fills only what `.env` did not supply (`||=`), so it
never overrides the database. There is no test database and no mocking — the
suites create, update and delete real rows, seed the baseline tables, and use
fixture user ids (4242/9999, 4243/9998) that they delete on the way in.

**What that costs.** Not much here, because `.env` points at the private MySQL
on port 3307 and the fixture rows are already all over it. It would cost a great
deal if `DATABASE_URL` ever pointed somewhere real, which is exactly why
`pnpm dev` refuses to read `.env.production.local` and why
`scripts/loadPlansEnv.mts` filters `DATABASE_URL` out of what a local run may
borrow. **The test runner has no such guard.**

To run the suite without touching the dev database, give the run its own
database — the value is what matters, not where it comes from, since
`dotenv/config` will not overwrite a variable already set:

```bash
DATABASE_URL='mysql://user:pass@127.0.0.1:3307/bidrender_test' pnpm test
```

`pnpm db:push` against that same URL first, once, to create the tables.

- [ ] Create `bidrender_test` and make it the default for `pnpm test`, so the
      safe path is the one you get by typing the obvious command. A guard that
      has to be remembered is not a guard. Until then, treat a bare
      `pnpm test` as "this writes to my dev data" — it does.

**Audited 2026-09-18 and left alone: the Manus Forge gateway's copy of the same
bug.** `server/_core/llm.ts` destructures a fixed list of `InvokeParams` fields
exactly as `invokeAnthropic` did, so a field added to that type goes nowhere
there either. It was NOT given the compile-time guard, for two reasons: `_core/`
is generated platform scaffolding that CLAUDE.md says to extend rather than
rewrite, and the branch is dead in production — `server/llm/index.ts` picks
Anthropic whenever `ANTHROPIC_API_KEY` is set, and it is set in
`.env.production.local`. Worth knowing rather than worth fixing; if the Forge
path is ever revived, give it the same treatment first.

- [ ] Delete the Manus Forge gateway path entirely (`server/_core/llm.ts`, the
      `BUILT_IN_FORGE_API_KEY` env var, and the lazy import in
      `server/llm/index.ts`). It cannot run in production and it carries a
      second, unguarded copy of the parameter-dropping bug that cost real money
      in the Anthropic adapter. Part of the "Manus removal" work above rather
      than its own job — noted here because the audit is what found it.

## Stage 5 follow-ups (references/stage-5-track-b-plan.md, 2026-09-27)

- [x] **BUILT 2026-09-29 (Track B; `8f74785`, `9295841`, `3fee5ee`): prices
      in the takeoff CSV (opt-in, off every time) and the "For your quote
      app" panel (five buckets per scope, pre-tax, a copy button per
      number).** What differs from the plan is in its "As built" table. Plan in
      `references/quote-app-panel-plan.md`. **Owner answered all seven
      questions the same day** (§ 1a). The panel shows the price TO THE
      CUSTOMER (markup, overhead and profit inside Material and Labor), with a
      worked example checked against the engine. With any unpriced line it
      lists them and shows no totals and no copy buttons. Subs go in Misc,
      attached items stay out. No migration for v1. **Handoff for Track A**
      (§ 10): H1 a quote bucket per expense, and H2 the example-price flag
      with a saved copy on each bid line.
- [ ] **Track A (migration): remove ONE mark's drop.** Asked for with "Undo
      drops" (built 2026-09-29, `34f8515`) and not built, because a drop is
      set on the count and nothing on `takeoff_stamps` can exclude one mark.
      Needs a nullable `takeoff_stamps.dropExcluded` (NULL = follows the
      count; additive). Spec and B's follow-up in
      `references/quote-app-panel-plan.md` § 10, H3.
- [x] **DONE — column 0098 (A, batch 1); code 2026-10-05 (Track B).** Only a
      NEW mark is a quantity anywhere (`shared/markStatus.ts`,
      `server/markStatusPricing.test.ts`). Still open, below: what remove and
      relocate cost, and folding C's "… - EXISTING TO REMAIN" twin counts.
- [ ] **Owner: what do REMOVE and RELOCATE cost?** Since 2026-10-05 neither
      is priced as a new device (correct: neither buys one) and the card says
      "N remove/relocate — labour not on the bid". Their LABOUR is not on the
      bid anywhere yet. Recommendation: one labour line per status per count,
      at a rate the owner sets (demo hours each, relocate hours each).
- [ ] **Track A (step 3 file) + C: fold the "… - EXISTING TO REMAIN" twin
      counts into `status`.** The code now reads `status`; the twin counts
      (`shared/existingToRemain.ts`) still price as NEW if sent. Per 0098's
      header this is a separate step-3 migration, now unblocked.
- [x] **DECIDED AND BUILT 2026-10-05: option C** — priced, with "Leave it
      off" on the run row (references/vertical-drops-plan.md § 4).
      **Decide: a RUN ending on an existing mark.** A run end can claim a
      mark (`startStampId`/`endStampId`) and then prices its own drop there.
      Not a mark count, so the status rule does not touch it; new conduit to
      an existing device can be real work. Found by the 2026-10-05 audit.
- [ ] **(was) Track A (migration): a STATUS on each mark — new / existing to
      remain / remove / relocate — so an existing device is never priced as
      new.** Asked for 2026-10-01 from the reader-accuracy hand count: many
      devices on the test sheets are drawn as existing to remain, and a count
      today cannot say so, so they were counted (and would be bid) with the
      new ones. Proposed: nullable `takeoff_stamps.status` enum
      (`new`,`existing`,`remove`,`relocate`), NULL read as `new` — additive,
      no backfill, step 1 of the three. The bid bridge
      (`shared/takeoffBridge.ts`) then counts only `new` (and `relocate`,
      which is labour) toward a line; `existing` is shown, never priced;
      `remove` wants its own demo labour line, owner to decide. **Until it
      lands, Track C's stand-in is a NAME**: a second count "<name> - EXISTING
      TO REMAIN" (`shared/existingToRemain.ts`, `scripts/readerTestExisting.mts`)
      — which still prices if sent to a bid, so it is a test-account tool and
      not the product answer. The migration should convert those names into
      the status and fold the twin count into its base. Where it fits with
      Find all matching's "maybe existing" flag:
      `references/find-all-matching-plan.md`. Batched with B's nine pin-style
      columns (next entry).
- [x] **DONE — 0099–0101 (A, batch 1).**
      **Track A (migration): nine nullable pin-style columns, BATCHED with
      the mark-status column.** Not built; queued 2026-10-01. Shape, letter
      and color on each of `assemblies`, `symbol_links` and `takeoff_groups`.
      They are saved company-wide the way run colors are, and a shipped
      assembly forks on edit. NULL means automatic, so they are additive with
      no backfill (step 1 of the three). Spec: Track B's
      `references/track-b-count-pin-styles-plan.md` § 6. **§ 12 of that plan
      (2026-10-01) is the EXACT list for A — 15 columns on five tables: these
      nine, the status, `takeoff_groups.symbolLookupKey`, and the connect
      point's `connectDx/Dy` (on `symbol_looks`) plus
      `takeoff_stamps.rotation/mirrored`.** Its 12 decisions are made. The
      batch-mate is nullable `takeoff_stamps.status`
      (`new`/`existing`/`remove`/`relocate`, NULL read as `new`), recorded in
      Track C's `todo.md` on `track-c`. B's style editor waits for the nine
      columns, and the status looks (§ 7) wait for the status column.
- [ ] **Track A (migration): the CONNECT POINT columns — put them in the
      batch above.** Built without them 2026-10-01 (Track B): runs now meet
      wall devices at the wall found in the drawing, by device family
      (`shared/connectPoint.ts`, `references/connect-point-plan.md`). What
      cannot be done without columns is a connect point SET PER SYMBOL. All
      additive, nullable, no default, no backfill — step 1 of the three:
      | Table | Column | Type | NULL means |
      | --- | --- | --- | --- |
      | `symbol_looks` (if A builds it in this batch; else `symbol_links`, not both) | `connectDx`, `connectDy` | `decimal(10,4)` | never answered — the family default applies. `0,0` is "it's the middle", a real answer, never written for NULL |
      | `takeoff_stamps` | `rotation` | `smallint` (0/90/180/270) | which way this copy faces is not known |
      | `takeoff_stamps` | `mirrored` | `boolean` | as `rotation` |
      The offset is measured from the capture box's centre, so it also needs
      the box: `captureX/Y/Width/Height decimal(12,4)` on the same row —
      already requested as R.11 / find-all-matching-plan § 6, ONE handoff, not
      a second copy. **Optional, owner's call (plan § 9 Q3):** to let an
      estimator CONFIRM a wall end the app found, `takeoff_runs.startConnect`
      / `endConnect` `enum('found','confirmed')` NULL — without it a found end
      counts and is shown, but cannot be marked checked. If the schema A sees
      does not match this list, stop and find out why before writing the .sql.
- [ ] **Track B, after the connect-point columns: the picker and per-symbol
      offsets** (plan § 2, § 3, § 5): the "Where does the pipe meet it?" step
      at capture with Skip and "It's the middle", the legend-row badge, turning
      per mark from Find all matching, then `connectPointFor` prefers the
      symbol's offset over the family default. NOT covered by today's build:
      an unconfirmed AI mark is still a snap target (the WRONG-NUMBER RISK
      entry above), because telling one apart needs the mark-status column.
- [x] **BUILT 2026-10-05 (Track B): chosen looks (count → symbol →
      assembly, editor from the card's swatch, "this job / every job") and
      mark status (looks, "Mark as…", the split in words, priced only when
      new).** Still open from this entry: the ring-around-the-symbol, faint
      marks, the CSV "Pin" column, step 0's `LETTER_MIN_PX`, and the editor
      on the Legend tab and the assembly editor (it opens from the count card
      only). "Placing as" (New / Existing in the count pill) BUILT
      2026-10-05.
      **Track B, after A's columns above: pin styles steps 2 and 3.** Step 1
      shipped 2026-10-01 (computed default shape by device family, the wide
      rectangle, letters and first-use colours, safety switch = DS). Still to
      build. The seam is the "NOT BUILT" block in `shared/pinLetters.ts`,
      which says where each one plugs in:
      (a) **chosen looks.** Add `chosen` to `PinCount` from the nine
      columns. Precedence is count → symbol → assembly → automatic. An
      assembly letter bumps; count and symbol letters never do, and a clash
      is flagged instead. Then the one style editor (plan § 6).
      (b) **mark status.** It is per mark, so `markAppearance` takes the
      stamp's status, and the overlay draws filled, hollow-solid, X or the
      arrow badge (§ 7), plus the "12 new · 4 existing" split on the card.
      Ship it only once the bid applies the status.
      Also still open from step 1: the ring-around-the-symbol at reading
      zoom, faint marks, the CSV "Pin" column, and the step 0 measurements
      (`LETTER_MIN_PX` 14 is still a judgement).
- [ ] **Track A (migration, optional): `symbol_links.originalLabel
varchar(255) NULL`.** Renaming a legend symbol shipped 2026-10-01
      (Track B) WITHOUT a column: `label` is the new name and `lookupKey` keeps
      the captured name's key, which is what matching uses. The one loss is
      capitals — "Reset to original" gives "linear type", not "LINEAR TYPE",
      and says so on the button. This column would hold the exact original.
      Additive, NULL = never renamed (or renamed before the column: fall back
      to `lookupKey`). Nothing is broken without it; batch it with the pin
      columns above rather than ship it alone.
- [ ] **Track B, small: `takeoffGroups.rename` has no locked-bid check.**
      Found 2026-10-01 while adding the legend rename, which does refuse. No
      screen calls it today (grep `takeoffGroups.rename` in `client/src`), so
      nothing can reach it from the app — close it before anything does.

- [x] **BUILT 2026-09-27 (Track B), owner's answers as recommended in
      `references/track-b-beta-plan.md` § 1.** `storageDelete` on both
      backends (asks the disk folder too when R2 is live, and drops the R2
      existence cache); every delete path goes through `server/storedFiles.ts`
      — rows first, then any file no row in any account names — and
      `server/storedFiles.test.ts` fails on a raw call. Also covers removing
      one plan set, the sample bid, logo replace/clear and the legacy project
      PDF. `scripts/sweepOrphanPlans.mts` for what is already left behind: dry
      run by default, by hand for the first month, refuses an empty database
      and (unless `--allow-majority`) a majority of orphans. Backups: 30 days,
      newest 7 good always kept, only after a good night
      (`references/backups.md` § 9). Probed on the real plan bucket with a
      key of our own: put, delete, gone. **Still to do: run the sweep against
      production** — dry run first, read the list. _Seen on the local dry run:_
      `.local-storage` holds a folder named `bid-plans/1/` + ANSI colour codes
      around `1728349` — some script wrote a coloured number into a storage
      key. Local only, found not chased.
      The request as it stood: **Leftover plan PDFs after delete — MUST BE FIXED BEFORE THE BETA: these
      are customer drawings.** Deleting a bid, whether by hand, with the
      archive's "Delete all", or by the nightly 30-day purge, removes only
      DATABASE rows. The `bid_pdfs` rows cascade away, but the files behind
      them stay in R2 (`bidrender-plans`) or on disk, with nothing pointing at
      them. Neither storage backend has a delete operation:
      `server/r2Storage.ts` ~227 says "the app never deletes or moves" an
      object. The comments at `server/scheduled/purgeArchivedBids.ts` ~79-86
      and `server/db.ts` `deleteBidForever` still blame the long-gone Manus
      storage API for this, which is out of date. The archive dialogs say
      plans "go with" the bid, which is true on screen and false in the
      bucket. **What needs deciding first:** the nightly backup copies plans
      into `bidsoftware`, so decide whether a deleted contractor's drawings
      may outlive the deletion in a backup, and for how long. That is a
      retention promise to customers, not a code detail. Then: a `delete`
      operation on the storage socket (both backends, the same shape as the
      other four), called for each `bid_pdfs.storageKey` BEFORE the row goes,
      and a one-off sweep for the files already orphaned (`pnpm r2:ls`
      against the `bid_pdfs` keys). Decided by the owner 2026-09-27: a
      separate piece after the Stage 5 Track B batch.
- [x] **BUILT 2026-09-27 (Track B), owner's answer: the totals and the
      materials list show what the bid prices.** One rule,
      `shared/runOnBid.ts`, asked by `groupRunFootage`, `takeoffRuns.totals`,
      `takeoffRuns.drops` and the materials list. Drafts count; runs with no
      type are left out and reported with their feet; branch wiring's wire is
      left out (its conduit counts — see the branch-wiring fix the same day).
      `takeoffRuns.test.ts` "equals the footage the bid prices" is the forcing
      test: one bid with every kind of run, totals equal to the bid's own
      footage exactly. Against the old router it read 100 ft to the bid's 175.
      T5 in `references/takeoff-spec.md` records the override. **Not done:
      measuring how many drafts exist on production — Track A.**
      The request as it stood: **The run totals and the bid can report different footage for the same
      runs. Look into it after the Stage 5 Track B batch** (owner,
      2026-09-27). Two differences are known, both read from the code and
      the second one measured: (1) **Draft runs.**
      `takeoffRuns.totals`, the "This bid, all sheets" block on the Plans
      screen, counts `status === "committed"` only, while
      `groupRunFootage`, which is what the bid prices from, counts drafts too.
      The materials list's footage is a THIRD reading: `totalQuantities` over
      every non-suggested run, drafts and untyped runs both included
      (`materialsListRouter.ts`, `realRuns`). (2) **Runs with no type.** The totals count
      them, and the bid cannot: there is no run type to make a line from. It
      is measured in `server/takeoffExport.test.ts`, whose "Draft or
      Finished" test has to add an untyped run's 10.56 ft to reconcile the
      export's Finished rows with the totals. The takeoff export carries a
      Status column so a file can be checked against the totals by hand.
      **Before changing either side,** decide what the totals block is FOR:
      if it is "what the bid prices", it should include drafts and leave out
      untyped runs; if it is "finished work", it should say so louder than
      its caption ("Finished runs only. Drafts and suggestions are not
      counted.") does today, and the bid should probably wait for a draft to
      be finished. Measure how many drafts exist on real bids first.

- [x] **BUILT 2026-09-27 (Track B): plans are easier to find, Phase 1**
      (`references/track-b-beta-plan.md` § 3). Dashboard "Recent plans" row
      and a Plans chip on every card with drawings, both from
      `getDashboardBids`; Plans is the primary button on a bid; the bid's
      "Plans screen" mentions are links; a `plans` navigation target.
- [ ] **Plans, Phase 2 — a Plans entry in the left menu — deferred by the
      owner (2026-09-27): "Phase 1 first, left-menu tab later".** The design
      is in `references/track-b-beta-plan.md` § 3 (a `/plans` index screen,
      not a dead end), and it means rewriting CLAUDE.md's "none of them is in
      the nav" and the eight-destination comments in the same change.
- [ ] **Not checked at phone width:** the Dashboard's "Recent plans" row and
      the card chip (checked at 1536 px only; `flex-wrap`, so expected fine).
      And on an account still showing the getting-started checklist, the row
      sits near the fold — worth a look if Phase 1 still feels hidden.
- [x] **MEASURED 2026-09-28 and left alone: `lastUsedAt` is right.** The
      entry below guessed it read 7 hours out like the Dashboard's
      newest-plan date. Asked the driver instead: `db.execute` returns a raw
      TIMESTAMP as zone-less text in the SESSION's time zone, and the local
      MySQL session is `SYSTEM` (Pacific). `li.createdAt` is filled by the
      database default, so its text is Pacific and `new Date(text)` reads it
      correctly — `materialUsage.test.ts` "dates the last use" passes on a
      Pacific laptop. Switching to `DATE_FORMAT(... 'Z')` would have made it
      7 hours EARLY. On production (UTC database, UTC Node) both forms agree.
      The entry as it stood: `getMaterialUsageForCompany` builds `lastUsedAt`
      with `new Date()` from a raw `MAX(...)` — the same shape that read 7
      hours out on the Dashboard's newest-plan date. Measure before changing.
- [ ] **The flip side, found by that measurement: locally, the Dashboard's
      newest-plan date is 7 hours EARLY for a real upload.** `lastPlanAt`
      uses `DATE_FORMAT(MAX(p.createdAt), '…Z')`, which is right for a row
      whose createdAt the APP wrote (drizzle writes UTC text) — which is what
      `dashboardPlans.test.ts` inserts — and wrong for one the DATABASE
      defaulted, which is every real upload. Production is unaffected (its
      session zone is UTC, so the two agree). The real fix is one rule for
      the connection — `timezone: "Z"` on the pool, or `SET time_zone =
'+00:00'` per session — so text means UTC everywhere; that touches
      every raw date read and wants its own look.

- [x] **BUILT AND SCREEN-PASSED 2026-09-28: the next Track B batch**
      (`references/track-b-next-batch-plan.md`, pass table at the top).
      Pieces 1, 2, 3 and 5 checked on screen; nothing needed fixing. Not
      merged. **Still open from the pass:** the layout at the shipped desktop
      width was not seen (the driven window was stuck at 766 px), and the
      Recent plans row at phone width.
- [ ] **No control removes a single mark (C6), and a dead prop hides that.**
      Found by the 2026-09-28 screen pass, trying to remove a run's end mark.
      `RunsPanel` accepts `onRemoveStamp` and has never called it (added in
      `ba6702c`, 2026-08-12); nothing else in the client calls
      `takeoffStamps.remove`. A reader seeing the prop wired in
      `TakeoffPage` would believe removal exists. D6 in `takeoff-spec.md`
      already decides the shape (tap a mark, Remove / Delete key / Undo).
      When it is built, the refresh is ready: `refreshFor("markRemoved")` in
      `removeStamp`, tested in `takeoffRefresh.test.ts`. Until then, either
      build it or drop the prop, so the wiring stops implying a feature.

## Plan viewer overhaul

- [ ] Give the plan reader zoomed-in tiles of a sheet rather than one shrunk image. Observed on the live site 2026-09-16: on dense sheets it runs, costs a call, and comes back having found no symbols — its own answer said the symbols were not legible at the resolution it was given. So this is not a prompt problem or a model-tier problem; it is being handed a picture in which the thing it is looking for does not survive. A receptacle symbol is a few dozen pixels on a full E-sheet scaled to fit a model's input, and downscaling removes it before the model ever sees it. Likely shape of the fix: render each page at takeoff zoom, cut it into overlapping tiles, read each tile, then merge the hits back into page coordinates — overlapping because a symbol on a tile seam would otherwise be halved and missed twice. Watch the cost: one sheet becomes N calls, so the per-person daily allowance in `shared/aiLimits.ts` is counting something much larger than it was designed around, and `PLAN_COPILOT_MODEL` is the expensive tier. Do this as part of the plan viewer overhaul, not before — the tiling wants the same render path the viewer is getting. **N is 6, and the rest of the cost question is answered: `references/ai-reader-cost.md` (2026-09-18) prices it on the real Old Blueridge sheets.** Decided there: Sonnet 5 at 150 px per paper inch, thinking off, 6 tiles, ~10.1c a sheet, 150 sheets a month inside the $99 flat price.

- [ ] Change `DAILY_LIMITS` in `shared/aiLimits.ts` from counting CALLS to counting SHEETS, plus a dollar backstop — 40 sheets and $6 per person per day. **In the same commit as the tiling above, and not before it.** Today one sheet is one call, so the current 150 is correct for how the app actually spends; changing it early would make the limit describe an app that does not exist yet. The moment a sheet is six calls, 150 calls means 25 sheets and a 40-sheet set dies two-thirds of the way through. Reasoning in `references/ai-reader-cost.md` § 7; the point is that once a sheet is several calls, "calls" stops tracking spend and spend is the only thing the breaker is for.

- [x] **OVERTAKEN, ticked 2026-09-27 (Track B tidy):** `layerColor` and its hash no longer exist. `shared/takeoffLayers.ts` ~223 says why: once a run type's band wore the colour its lines are drawn in, hashed swatches beside it said the opposite thing. The request as it stood: Give the conduit and cable layer swatches in `LayersPanel` the conduit-yellow and cable-emerald that every other surface uses. Noticed 2026-09-18 while making the run icons agree (v6.22). `layerColor` in `shared/takeoffLayers.ts` derives a colour by hashing the layer key against a fixed palette, so the Conduit-runs and Cable-runs swatches come out at whatever the hash lands on — while the tool buttons, the counted-items rows and the traced lines on the drawing itself all use `#F5C518` for conduit and emerald for cable. The panel that exists to say which of those lines you are looking at is the one surface that does not match them. **The fix touches how EVERY layer colour is derived, not just these two** — the same function colours the location layers, which have no natural colour of their own and want to stay visually distinct from each other, so it probably becomes "named colours for the keys that have one, hash for the rest" rather than a two-line change. That is why it is its own pass and not a tidy-up inside an icon commit. Same family as the icon mismatch it was found beside: one thing per concept, and this one is colour rather than shape.

- [x] **BUILT 2026-09-27 (Track B): "Export takeoff" (CSV).** On the Takeoff screen beside "Materials list", and "Takeoff" in the bid's Send menu. One table by sheet and one for the whole bid, same columns: plan file, page, sheet, title, Count/Run, item, **Status (Draft / Finished)**, unit, quantity, traced ft, vertical ft, wire ft, ground ft, note. Then notes saying what is not in it: no extra (§ 5j is not built), no fittings (they are on the Materials list), no suggested runs, and untyped runs by count. **Quantities only**, by the owner's decision: prices come later as an explicit choice, off by default. Run footage goes through `groupRunFootage` over `loadRunFootageInput`, the bid's own path, split by sheet and status. `server/takeoffExport.test.ts` holds the file equal to `footageByRunType` and `countStampsByGroup` on a bid with three sheets at three scales. **A measurement nobody took is blank, not 0:** a no-scale sheet's feet, a cable's wire and ground, and a vertical figure whose ends have no heights are all blank (the new `endsNotCountedCount` tells an uncounted 0 from a real one). On screen, "Bar layout check": one mark added, the next export read 3 + 1 = 4; mark removed afterwards. The original request follows.
      **There is no way to take a takeoff out of the app as numbers.** Asked 2026-09-19, and it is a door the product promised early: numbers come off the plans and go into whatever the estimator already uses. Two CSVs exist and neither is it. The **materials list** (Takeoff → "Materials list" → CSV, and the same dialog on the bid) is a SUPPLIER document — quantities with no prices, and `shared/materialsList.ts` has nowhere to put one on purpose; traced runs arrive in it as one lump of conduit, one of cable and one of wire, because nothing carries the run TYPE through to it. The **accounting export** (`shared/accountingExport.ts`) is the bid's money in QuickBooks invoice shape, with cost and margin deliberately absent. What is missing is the takeoff itself: **every count by type with its quantity, and every run by type with its traced, vertical and extra footage**, per sheet and for the bid, with the sheet each came from. Most of it is already computed — `takeoffGroups.list` has the counts, `takeoffRuns.totals` has the footage, `shared/csvWrite.ts` writes the file — so this is a new shape over existing numbers rather than new arithmetic. **Two things to get right:** it is an internal document, so unlike the supplier list it MAY carry prices, and the choice of whether it does has to be explicit rather than inherited from whichever builder was copied; and it must say what it does not include, the way the materials list already does about verticals and extra. See `references/plan-viewer-overhaul.md` § 5j for the extra footage it will have to show once that exists. **Build § 5n first** — an export of run footage by type, taken from a palette in which no type names a material, writes rows that carry a name and no specification.

- [ ] **Typecheck the tests.** `tsconfig.json` excludes `**/*.test.ts`, so `pnpm check` — the correctness gate — covers no test file at all. Measured 2026-09-20: making one field required produced 0 errors from `pnpm check` and 28 from a config that includes tests; after fixing those, **33 pre-existing errors remain across ten test files** (`server/pricing.test.ts` 7, `server/auth.email.test.ts` 4, `client/src/lib/tradeContent.test.ts` 4, and the rest in ones and twos). **Re-measured 2026-09-26: 124 errors across 23 files** — it has nearly quadrupled in six days, because nothing checks it. Largest: `server/takeoffMath.test.ts` 38, `server/materialMarkupAgreement.test.ts` 26, `server/accountingExport.test.ts` 12, `server/takeoffVerticals.test.ts` 8, `server/pricing.test.ts` 7. `server/v545.test.ts` had 2 and is now clean. Measured with a tsconfig that extends the real one and drops only the `**/*.test.ts` exclusion. **The growth is the argument for doing this soon:** every week it waits, the piece gets bigger. **Why it matters more than it looks:** every forcing function added on 2026-09-20 — the required field, the props union, the row-taking mapper — is enforced in `server/`, `shared/` and `client/src/` and is silently absent in the tests, so a fixture can construct a shape the production code cannot. That is the difference between a type-level guarantee and a type-level suggestion. **Do it as its own piece, not inside another change:** the 33 have to be read individually, and the failure mode of hurrying is a test "fixed" by weakening what it asserts. Flip the exclusion, fix them, and the gate finally means what CLAUDE.md says it means.
  - **2026-09-26: 124 → 4**, one commit per file (21 commits, `db116dd`..`72c11fa`), each with that file's test count identical before and after, no cast / `any` / `@ts-ignore`, no assertion weakened. The recurring causes were fixtures behind a type that grew (`separateGround`, `productivityPct`, `materialMarkup`, four `User` columns), `Partial` being shallow, read-backs typed `| undefined`, a nullable `breakdown` (from `88270df`), and the missing `target` below.
  - [x] **`server/takeoffBridgeFlow.test.ts` — fixed 2026-09-26, `3e8e973`.** The fork assertion read `forked!.id`, `undefined` because `assemblies.update` returns `{ assembly, forked }`, so that one assertion could never fail; it is now `expect(forked.assembly?.id).not.toBe(baselineId)`. **Correcting what was written here before:** "the test proves nothing" was too strong. Measured against an update made never to fork, the OLD test still went red — two assertions later, on a snapshot-hours mismatch (`expected 0.5 to be 1.25`), blaming the wrong thing. The new line fails at the fork itself (`expected 14391 not to be 14391`). The missing `category` was stated as `"Devices"`, which is what MySQL had been storing (measured, even under strict mode).
  - [x] **`server/permissions.test.ts` — the shipped type defect, fixed and deployed 2026-09-26, `e899092`.** The two `as unknown as [CompanyRole, …]` casts in `companyRouter.ts` are gone; `role: "owner"` is now a compile error and the `@ts-expect-error` lines are used. **Correcting the fix proposed here before:** no literal tuple was needed and `shared/permissions.ts` did not change — the cast was a zod 3 workaround, and zod 4's `z.enum` takes the already-correctly-typed filtered array. Emitted JS for the file is byte-identical, so the runtime refusal is the same code; checked live before and after the deploy (owner refused by `invalid_value` against `["admin","estimator","viewer"]`, the three normal roles invite).
  - [ ] **`tsconfig.json` sets no `target`.** Its only visible effect so far: iterating a Set, Map or `matchAll`, and top-level `await`, do not compile, so the codebase uses `Array.from(...)` (now in tests too). Deliberately not changed in passing: Vite and esbuild read `target` (it sets the default for `useDefineForClassFields`), so it can change how shipped classes compile. Decide it on purpose. **It is also what keeps `scripts/` out of `pnpm check`:** measured 2026-09-26, including all of `scripts/` reports 43 errors in 11 files, 42 of them this (39 top-level `await`, 2 iterations, 1 top-level `for await`) and 1 ordinary type error (TS2345). `migrate.mts` and `schemaDrift.mts`, both run against production during a deploy, are among them. Settle `target`, fix the one, then add `scripts/**/*` to `include`.
  - [x] **Flipped the exclusion — 2026-09-26.** `pnpm check` now compiles every test file (`server/**`, `client/src/**`, `scripts/**/*.test.ts`) under the same `compilerOptions`. Verified: clean on the codebase (534 files, up from 379 — the 151 tests, the 2 scripts they import, a JSON fixture and `pricing/movedFromSheet.ts`, both imported by tests); a planted error in a test fails it (exit 2, naming the line); warm run ~3.8 s → ~4.2 s, cold unchanged within noise; shipped output byte-identical once the build timestamp and the filename hashes it feeds are normalised (23/23 files, old config vs new).

## Material markup (references/material-markup.md)

- [ ] **Piece 2 — price bands.** Needs a PACK size / pack price on `materials` first (D3): bands key on the roll, the stick, the box, never the per-foot price. Then band rows in `markup_rules`, the D2 starter set (Route A only, dated, inert until accepted), and the shared starter-accept component (D6) that labor units will reuse. `getMarkupRuleSet` skips unaccepted starters already; `resolvePartMarkup` already walks bands, and returns "no rule" only because `packPrice` is always null today.
- [ ] **Piece 3 — categories.** A categories table (shipped + a company's own) and a nullable `materials.categoryId` read before the enum. The engine already reads category rules keyed by the category NAME, and there is no screen to write one. D5 overrides "Category is NOT user-extendable" and has to answer its clutter concern: a company's own category must not become a takeoff layer on every sheet by accident.
- [ ] **Pieces 4 and 5 — route A/B, the combined number, the blended markup.** Not started. The bid screen shows a "Material markup" row and "Profit 15% markup = 13% margin"; the combined effective margin and the blended material markup are still to come.
- [ ] **A per-LINE markup override on one bid.** Not in any piece yet. The item override is company-wide; the "one-way door" rule in CLAUDE.md says anything from the library can be overridden on one job. Wants a nullable column beside `snapshotMarkupPct` and a field on the line.
- [ ] **Re-apply on a line from before markup rules reads its parts from TODAY's links** — its assembly's current recipe, or the material its run type names now — because such a line stored no composition. After one re-apply it stores its parts like any other line. A line priced from a material by hand (bidsRouter `priceLineFrom`) that predates markup has no link to that material at all, and re-applies at the company default.
- [x] **FIXED — ticked 2026-09-27 (Track B tidy); the fix is the "BUILT 2026-09-27, option 2" note two entries down.** The card now resolves an unlocked bid's plan lines from the drawing. The speed cost is parked in its own open entry below. **Dashboard vs bid screen still differ on a bid whose plan quantities moved since they were sent** (bid 1164558 in the local copy: card $192.58, bid $378.15). Not markup: three of its lines are traced-run lines STORED at 0 ft, which the bid screen resolves live from the drawing (`getBidLineItems` → `withPlanCounts`) and the dashboard's SQL reads as stored. Checked 2026-09-25 against the rows. Found by the same before/after dump that found the marked-up-expense gap. Pre-existing; not fixed. **Since 2026-09-26 it also moves the card's "N lines not priced"** — the SQL decides with the stored qty (see `server/dashboardNotPriced.test.ts`, which locks its bids to test the rule apart from this).
      **PLANNED 2026-09-27 (Track B), not built.** _Cause, read from the code:_ the stored `bid_line_items.qty` of a line that follows the drawing is written only when the line is SENT (or sent again, `refreshRunTypeLineQty`) and when the bid is LOCKED. On an unlocked bid the bid screen re-derives it on every read (`getBidLineItems` → `withPlanCounts` → `withTracedFootage` for runs, `stampCountsForBid` for counted symbols); the dashboard SQL reads the stored column. So it is wider than traced footage: **a counted symbol marked after sending drifts too.** It moves the card's money, its "not priced" count (a line re-derived to 0 is never "not priced") and "Out for bid". _Measured:_ 0 stale lines in `bidrender_local_b` today (2 unlocked bids, 8 plan lines, all equal to the drawing) — latent, not live here. _Options:_ (1) **write the stored qty back whenever the drawing changes** — every mark/run/scale/height/tee/pull-point mutation re-derives the bid's plan lines and updates `qty` on unlocked bids; SQL stays right by construction; no schema change, but many write paths, and one forgotten path is the same bug again; (2) **re-derive on the dashboard read** — call `withPlanCounts` for only the bids that have plan lines and are unlocked, then price those bids through `bidRollup` instead of the SQL; no schema change, always right, costs one resolution per such bid on the screen the app opens on (measure first); (3) **mark cards "quantities moved"** — cheap, but states the number is wrong rather than fixing it. _Recommended:_ (2) for correctness now, measured on a large local copy; (1) later if (2) is too slow. **No option needs a migration or a change to `takeoff_runs` or `bid_line_items` structure**; a stored "stale" flag would, and none of the three needs one.
      **BUILT 2026-09-27 (Track B), option 2, owner's choice.** `getDashboardBids` counts each bid's plan lines; `bids.dashboard` prices an UNLOCKED bid with any through `priceForList` (`getRollupLines` resolves from the drawing, `bidRollup` prices, charges and tax included) and every other bid through the SQL. `server/dashboardFollowsDrawing.test.ts`: marks added after sending move the card with the bid ($114 → $190 was the red); a count whose marks are all gone stops being "not priced" on both; a LOCKED bid keeps its locked numbers on both. On screen: a throwaway bid sent at 3 marks, priced $38, then 2 more — card "Total due $190" = bid screen $190.00 (was $114). **Measured on `bidrender_local_b`, median of 15 after 3 warm-ups:** 3,000-bid account with no plan lines 89.7 → 92.9 ms (noise); user 1 (6 bids, "Bar layout check" resolved live) 12.5 → 26.5 ms. **It grows with UNLOCKED bids that have plan lines**, one resolution each (5-sheet real bid, run concurrently): 1 → +12.9 ms, 10 → +56.8, 25 → +118.4, **50 → +304.9 ms** (p90 355). Fine at today's data; past ~50 such bids the dashboard crosses the ~300 ms bar, the same straight-line growth the SQL rewrite removed. **Owner, 2026-09-27: leave it as is for now.** When it is picked up: **locking quantities is always done ON PURPOSE by the user, never automatically** — so a fix may NOT auto-lock won bids (the "lock-on-win" idea written here before is ruled out). What is left: resolve only Draft/Active bids live and let Won/Lost show their stored qty (then say so on those cards, since it can be stale), or option 1 (write qty back on every drawing change) to take the cost off the read.
- [ ] **Dashboard speed with many unlocked bids that follow the drawing — parked by the owner 2026-09-27.** See the entry above for the numbers (+305 ms at 50 such bids) and the constraint: **no automatic locking, ever; a lock is the user's decision.**
- [x] **FIXED — ticked 2026-09-27 (Track B tidy); the fix is the "FIXED 2026-09-27" note directly below.** **"Find a bid" and the archive read a bid's price SHORT by its marked-up charges.** Found 2026-09-26 comparing every local bid's card with its search row: "Markup check" is $452.57 on the dashboard card and the bid screen, $302.57 in search. `bids.search` and `bids.archived` call `rollUpBid(bid, lines, company)` without the 4th `expenses` argument, so a marked-up permit is left out — the same gap fixed on the dashboard on 2026-09-25. The search comment says it prices "through the same rollup the dashboard uses, so ... cannot show different money", which is exactly what it does not do.
      **FIXED 2026-09-27 (Track B).** Both now load the bid's charges (`db.getBidExpenseLines`), and `expenses` is REQUIRED on `rollUpBid` and `bidRollup` — the `= []` default is what let two callers compile without them. `server/bidPriceSurfaces.test.ts` prices four bids (no charges, marked-up, plain, both) on the bid screen, the card, "Find a bid" live and archived, and the archive list; the two marked-up cases failed by exactly the charge before the fix. Looked at locally: "Markup check" reads $452.57 / $453 on all four, and a second marked-up bid (made for the check, then deleted) read $281.60 everywhere, archived included.
- [x] **CLOSED 2026-09-27 — the fault this entry described did not exist.** It read: "A close-out's estimate leaves out the bid's charges", so "a bid with a MARKED-UP charge is closed out against an estimate that charge short of the bid screen". **Wrong, and written without measuring.** A close-out freezes HOURS only (`bid_closeouts.estimatedHours`, total and per line); a charge has no hours, so leaving charges out of `estimateFor` changed nothing stored. The money beside a close-out is the profitability report's revenue, priced at report time WITH marked-up charges (`analytics.ts` `priceBid`). The owner decided "fix it" on the strength of this entry; `estimateFor` now passes the bid's charges (consistent with the bid screen, no stored number moves), and `server/closeoutCharges.test.ts` pins both halves — it passed BEFORE that change too, and goes red by exactly the charge if the report's revenue drops it. Saved close-outs on bids with charges: 0 in `bidrender_local_b` and 0 in `bidrender_local` (neither has any close-out). Production's count: Track A, next rehearsal. **The lesson is CLAUDE.md § "A number that can be measured should not be asserted", again: the claim was about a quantity one query would have answered.**
- [x] **BUILT 2026-09-27 (Track B): every list says "Total due" and shows it.** Cards, "Out for bid", the status columns, "Find a bid" and the archive showed `finalPrice` unlabeled — the work plus MARKED-UP charges, which is neither the bid screen's "Bid price" (`workPrice`) nor its "Total due" (`totalDue`). Measured on a throwaway bid (permit $210 marked up, dump fee $40): Bid price $71.60, old list figure $281.60, Total due $321.60. Lists now show `totalDue` under `TotalDueCaption`; the card reaches it from SQL sums through `billTheBid`, the bid screen's own last step, lifted out of `bidRollup`. The proposal's "Your figures" and the Count screen said "Bid price" for `finalPrice`; both now use `workPrice`, and "Your figures" shows Total due above "On the proposal". `server/bidPriceSurfaces.test.ts` checks all four surfaces against `totals.totalDue`, including tax.
- [x] **FIXED 2026-09-27 (Track B): Direct cost names its marked-up charges.** Seen the same day: Materials $71.60, Labor $0.00, Direct cost $281.60 — a $210 permit inside Direct cost with no row. (That was a throwaway test bid with a $210 permit; "Markup check" has a $150 one and read $251.40 → $401.40.) **Measured, not assumed: the charge is in Direct cost AT COST, not marked up** — `sumMarkedUpExpenses` sums each charge's `amount`, and its overhead and profit are in the Overhead and Profit rows with the work's. Nothing was counted twice; the only fault was the missing row. The bid screen and "Your figures" now show "Marked-up charges (at cost)" under Labor (`totals.markedUpCharges`, from the same function as `directCost`). `server/directCostAddsUp.test.ts`: the rows sum to Direct cost, and the row is the cost, not the billed amount (overhead and profit are on in the fixture so the two differ). Checked on screen and at 358px.

## Lines that can't be priced (shared/linePricingProblems.ts, shipped 2026-09-26 as 88270df)

- [x] **BUILT 2026-09-27 (Track B).** `BidCostRow` carries `brokenLines`. The outcomes report returns `totals.incompleteBids`, and the profitability report returns `incompleteJobs` and a per-job `incomplete`. Both panels show one red "incomplete — N bids in this range have a line that can't be priced…" line when it is above zero (`IncompleteFiguresNote`), and a worst-jobs row wears `IncompletePriceTag` beside its revenue. `server/analytics.test.ts` § "a bid with a line that can't be priced". The original entry: **Analytics leaves a broken line out and does not say so.** `costSums` gates every per-line figure on `lineIsPriceable`, so analytics agrees with the bid screen, and it returns a `brokenLines` count, but `toBidCostRow` drops it and no analytics screen shows an "incomplete" marker. On production today there are 0 bid lines at all, so nothing is affected. Carry `brokenLines` through `BidCostRow` and mark the affected figures before a real company's history can contain one.
- [x] **Admin screen for the references — shipped 2026-09-26 as 66d9961.** "Pricing problems" on the Admin screen: `pricingProblems.list` / `counts` / `find` (all `adminProcedure`, cross-company); `recent` was replaced. The contractor-facing `lookup` is unchanged and company-scoped.
- [ ] **A contractor has no lookup screen of their own.** `pricingProblems.lookup` exists for them and is tested, but the reference only ever appears on the bid it belongs to, so there has been no need yet.
- [ ] **A live check of money agreement needs a PRICED fixture on the smoke account (1421).** Its first assembly is an unpriced starter, so the 2026-09-26 live check compared $0 with $0: it proved the bid opens and the card and bid agree, not that they agree on real money. That was proven locally (the suite, and the screen at $800 = $800). Price one assembly on 1421, or have the check create and delete one.
- [ ] **"Missing reference" is not detected, on purpose.** A line whose takeoff group or run type has vanished cannot happen: both are `RESTRICT` foreign keys, and `resolveLineQty` falls back to the stored quantity rather than zero. If either key is ever relaxed, that fallback becomes a silent wrong quantity and wants to be a problem code here.
- [ ] **Not a breaker-panel feature.** The request that produced this asked for per-PANEL isolation; there is no panel entity (a panel is a catalog material, an assembly, or a free-text circuit label). Isolation was built one level down, per bid line, where panels already live. A real panel schedule (panels → breakers → circuits) would be a new feature and needs a spec first.

## Seat limits (shared/seats.ts, shipped 2026-09-26 as 1952c2f)

- [x] **Seats per company, enforced at invite, accept and restore; admin sets the limit.** 0080 added `companies.seatLimit` (default 1); 0081 raised every company to what it uses. Production after 0081: companies 1, 2 and 3 each 1 of 1 — all three had one member and no pending invites.
- [x] **Run types were already company-wide.** Filed under `ctx.scope.dataUserId` (the owner) since v6.40. Production and local had no run type under a non-owner. The router comment that said "scoped to the USER" was the likely source of the belief; corrected, and `seats.test.ts` pins it.
- [x] **FIXED 2026-09-26 (Track B): the Crew page called a REVOKED invite "expired".** `TeamPage.tsx` branched on `acceptedAt` then `usable`, so anything unusable and unaccepted read "expired", including a code revoked a second ago. Now `inviteStatus` (`shared/permissions.ts`, tested in `server/permissions.test.ts`) decides joined / revoked / expired / pending, revoked winning over a passed date, and the `invites` query sends it. Looked at locally: company 1's revoked code reads "revoked".
- [ ] **A billing plan should set `seatLimit` through `db.setSeatLimit`**, so a downgrade hits the same "remove N first" refusal. Nothing else writes the column today except 0081.
- [ ] **Nobody but a platform admin can add a seat.** "Remove someone or add a seat" names an action an owner cannot yet take themselves; it becomes self-serve with billing.

## Run colours (T14) — Part A and Part B deployed 2026-09-27

Decisions and the reasons for them are in `plan-viewer-overhaul.md` § 6,
"RUN COLOURS (T14)". **No migration.** It ships as a code push and nothing
else. It rides the same deploy as 0087, and 0087 still goes first.

**DEPLOYED 2026-09-27 as `f1521c5`** with 0087 (rollback target `a64dfbc`).
Live-checked on bid 25: types coloured blue, pink, violet in order of first
use; a proposed drop read "To: Receptacle · proposed". See
`references/deploying.md` § 5b "Sixth run".

- [x] **Every existing drawing changes colour once, on purpose.** Types used
      to be hashed from their id and are now given colours in order of first
      use, so most runs change colour on the first load after the deploy. No
      number moves. On the fixture bid the five types moved one slot each.
      Shipped; production had 2 runs, on bid 23.
- [x] **Part B DEPLOYED 2026-09-27 as `45ada57`** (rollback target
      `f1521c5`; 0088 applied before the push, drift clean at 89; live-checked
      on bid 25 — `references/deploying.md` § 5b "Seventh run"). **A color the
      user picks for a type.** It shipped with B10–B12. Migration 0088,
      `takeoff_run_types.color`. The owner's five answers and the reasoning
      are in `plan-viewer-overhaul.md` § 6. Tests:
      `client/src/lib/runAppearance.test.ts` (rules) and
      `server/runTypeColor.test.ts` (routes). Checked on "Bar layout check":
      violet on 1/2" EMT, then Automatic, then red on shipped 3/4" EMT (fork
      1669, removed from the local database afterwards).
  - **Deploy: three steps, step 3 empty.** 0088 is ADDITIVE: one nullable
    varchar, no default, no UPDATE, so apply it BEFORE the push. Afterwards
    `scripts/schemaDrift.mts` should report no drift at 89. **If it does
    not, stop and find out why before pushing.** Nothing existing changes
    color: every type starts automatic.
  - `routerSnapshot.mts`: the new build adds `chosen` to `typeColors` (not
    in the snapshot) and `color` to `takeoffRunTypes.list` (not in it either),
    so the compare should be IDENTICAL with no `--added` needed. **If it is
    not, read every line.**
- [ ] **LATER (owner, 2026-09-27): "Restore to shipped" for run types.** Not
      now. Setting a color back to "Automatic" is how a color is undone; the
      company's copy stays. Only materials have a revert today. When it is
      built, one thing needs deciding first: runs traced after the fork store
      the FORK's id, so deleting it orphans them, and archiving it leaves them
      resolving to it.
- [ ] **Six colours wrap.** The seventh type on a bid shares the first type's
      colour. That is accepted for now. Part B is the answer if it turns out
      to matter.

## Quantity mode — flat footage under a type (D21, built 2026-09-26)

**DEPLOYED 2026-09-27 as `a64dfbc`** (rollback target `b69c35d`). 0086 applied
to production before the push; drift clean at 87; `fittingsImpact` 0 quantity
rows. Rehearsed on backup `2026-09-27T00-41-48Z`; results and the live checks
on bid 25 in `references/deploying.md` § 5b "Fifth run". Bid 25 back to 0
lines, 0 runs, no scaled sheet afterwards.

On `local-dev` as the ten "Quantity mode step N" commits.
A run carries `traceMode` (`route` | `quantity`, NULL is route) on every row;
a quantity trace is D20's legs without tees, its wire is its type's
(`quantityCircuit`, through `circuitWire`), and its drops are proposed at leg
ends and approved AS END KINDS — no table of answers. Modules:
`shared/traceMode.ts`, `shared/quantityDrops.ts`. Spec:
`plan-viewer-overhaul.md` § 5o.

- [x] **Deploy — three steps, and step 3 is empty.** Done as below.
  1. **0086 is step 1 (additive): apply it BEFORE the push.** One nullable
     enum column on `takeoff_runs`, no default, no UPDATE. Applied to
     `bidrender_local` and `bidrender_test_clean`; a second run applies
     nothing. Afterwards `scripts/schemaDrift.mts` should report no drift at
     87 — **if it does not, stop and find out why before pushing.**
  2. Push. **Not a catalog release** — no seed rows change.
  3. Nothing.
  - `scripts/fittingsImpact.mts` now needs 0086 too, and prints the
    quantity-trace row count: **0 on the day 0086 is applied**. Any other
    number means rows were written by a build that should not have been
    running — stop.
  - **One route-run wording changes with this release, deliberately:** a
    run level at BOTH ends on a job with no run height stops being called
    "counted flat only" (`verticalAtEnd` answers "level" before the gate).
    No number moves; a warning about a run with nothing missing goes away.
- [x] **FIXED 2026-09-26: the finish toast names the whole run.** `commit`
      returns `runFeet` and `legCount`, summed the way the leg header sums
      them, and the toast reads "Run finished — 2 legs, 96.3 ft traced". The
      old toast named only the root leg ("Run finished — 57.6 ft traced" for a
      three-leg, 121 ft trace), and had done since D20. Checked against the
      header on the fixture bid. Asserted in `server/branchLegs.test.ts`.
- [x] **FIXED 2026-09-26: an open drop's editor shows the proposed kind**,
      tagged "proposed", instead of "To: Not set", which contradicted the row
      above it. Nothing is written until Approve.
- [ ] **No AI path yet.** The reader cannot propose a quantity trace; when it
      can, it goes through `save` + `addLeg` like the hand path, so the counts
      agree by construction.
- [x] **DONE 2026-09-27: `scripts/routerSnapshot.mts`.** Read only.
      `snapshot <file> [--added card.notPriced,drops.runTypeId]` calls
      `totals`, `drops`, `bridgeForBid`, `listForSheet` and the `bids.search`
      card for every bid as its owner, and `compare` diffs two files. `--added`
      takes a field a release adds out of the compare and lists its values.
      Use the `parent.key` form whenever the name exists elsewhere: a bare
      `pathType` stripped it from run rows too, and the compare shifted by 220
      lines. `bids.get` is left out because it records pricing problems as it
      reads. First used for the 0087 deploy. Run it from a worktree of the old
      build as well as the new one.

## Branch legs on a traced run (D20, built 2026-09-26)

**DEPLOYED 2026-09-26 as `b69c35d`** (rollback target `e07f1e4`). 0085 applied
to production before the push; drift clean at 86; `fittingsImpact` 0 leg rows,
0 tees. Rehearsed on backup `2026-09-26T23-08-29Z`; results and the live
checks on bid 25 in `references/deploying.md` § 5b "Fourth run". Bid 25 back
to 0 lines and 0 runs afterwards.

On `local-dev` as the ten "Branch legs step N" commits. A run is a root row
plus leg rows (`parentRunId`); a tee (`takeoff_run_tees`) cuts the leg it
lands on, so every row is a leg between two nodes and the fitting and bend
counts need no rule of their own. `shared/runNetwork.ts` is the module.

- [x] **Deploy — three steps, and step 3 is empty.** Done as below.
  1. **0085 is step 1 (additive): apply it BEFORE the push.** One new table
     (named `utf8mb4_unicode_ci`), three nullable columns on `takeoff_runs`,
     and `teeBox`/`teeCover` appended to `bid_line_items.runMaterialRole`. No
     UPDATE. Applied to `bidrender_local` and `bidrender_test_clean`; a second
     run applies nothing. After it, `scripts/schemaDrift.mts` should report no
     drift on these tables — **if it reports any, stop and find out why before
     pushing.**
  2. Push. **Not a catalog release** — no seed rows change (the tee box and
     cover are the existing `4" square box` / `4-11/16"` rows and their blank
     covers, and the shipped pull boxes).
  3. Nothing.
  - `scripts/fittingsImpact.mts` now needs 0085 as well as 0082, and prints
    the leg and tee counts: **0 leg rows and 0 tees on the day 0085 is
    applied**, because no existing run changes. Any other number means rows
    were written by a build that should not have been running — stop.
- [ ] **T bodies at a tee — the catalog half is DONE, the takeoff half waits
      on Track A.** `takeoff_run_tees.fitting` reserves `body`. The 45 rows
      shipped 2026-09-27 on `track-c` (`tBodyName`, 5 rigid families × 9
      sizes, priced with cover and gasket). Nothing offers `body` yet, and a
      stored one still counts as unanswered. The owner's answers T1–T6 and the
      full design are in `references/materials-track-c-plan.md` § 4. In order:
  - [ ] **Track A — additive migration:** append `teeBody` to
        `bid_line_items.runMaterialRole` (like 0084/0085, no UPDATE). It
        goes out BEFORE the code. Needed because bid lines are keyed by run
        type + role, so a run type with box tees and body tees needs two lines.
  - [ ] **The wiring** (after the migration): `teeBody` in `TEE_KINDS` /
        `FITTING_WORDS` / `materialNameFor`; `teeFittingCounts` counting box,
        body and mark apart, with no cover line for a body; connectors at a
        body tee by `lbHubsTakeConnectors` (EMT yes; rigid, IMC, PVC no); a
        sticky "Tee: box / T body" toolbar choice, default box (T4), with
        `legSnap.ts` returning it instead of hard-coding `"box"`; a
        mismatched tee (legs differ in size or family) offers box only and
        says why (T5), and a stored mismatched body counts as unanswered.
        Tests: EMT body tee 3 connectors, rigid 0, no cover line, mismatch
        refused, 2 box + 1 body tees → two lines.
  - [ ] **Before that deploy:** count stored `fitting = 'body'` tees in
        production. Expected 0, because nothing offers it. If it is not 0,
        stop and find out why before going on: those bids would gain a line.
- [x] **A cable run's tee buys nothing.** Cable types have no fitting slot
      (the MC item below), so a branch on a cable run counts its footage and
      drops but no junction box at the split. Same fix as MC connectors.
      **FIXED 2026-09-29 (plan W4, owner Q2):** a tee on a cable run buys a
      4" square box and blank cover (`SMALL_TEE_BOX`, the pair a small-pipe
      tee already buys; `cableTeeRows`). Tees are now collected for cable
      rows; a cable-only tee goes to the lowest cable type touching it
      (`cableTeeOwners`). Pipe and cable cannot meet at a tee today (a cable
      branch on a conduit run is refused — pinned). **Found on the way, and
      fixed with it:** `sendToBid` decided tee ownership from the one type
      being sent, so a 1/2" and a 3/4" type sharing a tee, sent separately,
      STORED two boxes; the bid screen was right because it counts every
      type. `server/cableTeeBox.test.ts`: both red on `1f66d7d` (`[]`, and
      2 boxes for one tee). MC connectors and straps are still open, below.
- [ ] **The main past a tee and the branch both read "from a tee"** in the
      runs panel, because nothing stored says which is which. Worth storing if
      the wording confuses anybody.
- [ ] **Deleting the FIRST leg of a run deletes the whole run** (it is the
      root). The bin says so in its label. Promoting another leg to root
      instead is possible if anybody asks.
- [ ] **Recovering a stranded leg draft** — the draft remembers `legRootId`,
      but nothing on screen offers a stranded draft back at all yet (T7 is
      still half-wired).

## Fittings counted from the trace (shared/runFittings.ts, built 2026-09-26)

**DEPLOYED 2026-09-26 as `99b8c4e`** (rollback target `1952c2f`). 0082 and 0083
applied to production before the push; schema drift clean at 84. Rehearsed on
backup `2026-09-26T18-27-04Z` — results in `references/deploying.md` § 5b.
Live checks as the smoke account on www.bidridge.com: 1,190 active shipped rows
(the account sees 1,184 because six of its own deleted copies hide their
shipped rows); "emt coupling" lists set-screw first at every size; a 40 ft EMT
run on bid 25 sent 3 couplings, 2 connectors and 5 straps with their
sentences, every line read "Not priced" and the strip said 4 lines were left
out; the supplier list itemised the three fittings. The test lines, run and
sheet scale were removed afterwards — production back to 0 bid lines, 2 runs.

- [x] **FIXED 2026-09-26 (Track B): old disconnect and breaker spellings
      landed on the renamed row SECOND.** "30A fused disconnect" matched the
      new NEMA 1 row and the renamed NEMA 3R row equally, and the tie went to
      NEMA 1; "30A breaker" tied with "30A 2-Pole breaker". Decided by the
      owner: yes, an old spelling prefers the renamed row, so the disconnects
      go to NEMA 3R (outdoor). The rename map moved to
      `shared/renamedMaterials.ts` and `phraseTier` treats a row's former name
      as EXACT. `materialSearchRank.test.ts` loops the whole map; with the
      rule off, exactly those nine fail.
- [x] **FIXED 2026-09-26 (Track B): a comma in a search found nothing.**
      "#12 bare copper, solid" returned no rows while "#12 bare copper solid"
      found it — the tokenizer kept the comma on the word.
      `separateQueryWords` in `client/src/lib/smartSearch.ts` now turns
      , ; : brackets ! ? and a non-decimal full stop into spaces before the
      split, keeping " / - # . inside sizes. Pinned in `smartSearch.test.ts`.
- [ ] **`5/6" wafer LED downlight` (the old spelling) reads as a fraction
      and finds nothing.** Split out of the comma item above on 2026-09-26:
      a size-parsing problem, not punctuation. Found by
      `scripts/catalogRehearsal.mts search`. Planned 2026-09-29:
      `references/track-c-next-batch-plan.md` § S2.
- [x] **A count number in a search matches inside and at the start of
      SIZES: "2 gang box", "3 hole", "2 pole 20" lead with the wrong rows.**
      **FIXED 2026-09-29:** one count rule (`shared/searchCounts.ts`) read by
      the matcher AND the ranker; "2 gang box" leads with Double-gang box.
      Standard sweep unchanged; the new count sweep's 40 moved queries are
      listed in the plan, § S1-moved.
      Found 2026-09-29. "2 gang box" is a REGRESSION from `8c5c478` (the
      weatherproof rows): `Double-gang box` was 4th at `e70ec15` and is now
      out of the top five, behind `1/2" weatherproof box, single-gang` — the
      count "2" matches inside `1/2"`. "3 hole" leads with 3/4" and 3" one-hole
      straps; "2 pole 20" with `20 ft light pole`. The standard spot-check
      sweep has none of these queries, which is why it passed. Planned, with
      the risk to other count searches: `references/track-c-next-batch-plan.md`
      § S1.
- [ ] **`aliases()` drops a repeated word, which silently breaks alias
      PHRASES.** `server/seed/materials/types.ts`: it de-duplicates word by
      word, so "one hole 1 hole two hole 2 hole" was stored as "one hole 1
      two 2" and "2 hole strap" could not find `EMT strap`; my own "3 hole 5
      hole" on the weatherproof boxes became "3 hole 5". Both fixed by
      hyphenating (2026-09-29). NOT audited: other rows may have lost a
      phrase the same way. The audit is to compare each seed row's alias
      INPUT with what `aliases()` returned and list every word dropped that
      was not in the name — a script, not a grep, because the input is only
      visible in the seed source.

Couplings (sticks minus one per leg, drops included), connectors (one per
conduit end, by node degree) and straps (one near each box, then spacing)
reach the bid through Send, the markup engine and the quantity lock. D17(b)'s
per-end labour interim is retired — it was never built, so no number moved.
`scripts/fittingsImpact.mts` reports what a release does to existing bids.

**Before deploying — the rename needs its rehearsal.** This is a catalog
release: EMT couplings and connectors are renamed in place to "set-screw"
(`RENAMED_BASELINE_MATERIALS`: 18 new entries, and the 2 older
`EMT connector 1/2"` spellings re-pointed straight at the final name), and
63 rows are new — 36 compression/raintight EMT fittings and 27 one-hole
straps; the catalog is 1,190 rows (counted from `BASELINE_MATERIALS`
2026-09-26). Check it against a
restored copy of production with the build that ships, together with the
other pending rename rounds, per `references/deploying.md` § 5b. And 0082 and
0083 are both step 1 (additive): apply them before the push. 0083's backfill
fills only its own new column and is guarded on NULL. Then run
`scripts/fittingsImpact.mts` against production for the fitting counts; it
refuses to count without 0082. (Run 2026-09-26 without 0082: production has
2 bids, 2 untyped runs and no bid lines, so nothing there is affected.)

- [x] **DEPLOYED 2026-09-26 as `e07f1e4` (rollback target `99b8c4e`, backup
      `2026-09-26T20-57-13Z`): bends and pull points** (D19 in
      `references/takeoff-spec.md`), with the "Not priced, never 0 h" labor
      fix (`1956a90`). Rehearsal, migration and live checks are recorded in
      `references/deploying.md` § 5b "Third run". What the deploy needed,
      kept for the record — all done:
  - **0084 is step 1 (additive): apply it BEFORE the push.** Two new tables
    (both name `utf8mb4_unicode_ci`), nullable columns, enum values appended;
    no UPDATE. Step 3 is empty. Applied to `bidrender_local` and
    `bidrender_test_clean`; a second run applies nothing.
  - **It is a catalog release: 45 new baseline rows (the 45° elbows), no
    renames.** Rehearsed on `bidrender_local` only (1192 -> 1237, VERDICT
    CLEAN). Rehearse on a restored copy of PRODUCTION with the build that
    ships, per `references/deploying.md` § 5b, with the other pending rounds.
  - **Every field bend reads "Not priced" until hours are set.** No raceway
    ships `fieldBendLaborHours`; it is set per pipe on the Materials screen
    ("Field bend \_\_\_ h each").
  - The design as it was written before the build, kept for the record:
- [ ] **Double counting: a user's own assembly that already holds an elbow or
      an LB.** Now that the trace counts elbows and LBs, a company whose own
      assembly includes one (a panel feed with its 90s, say) will count it
      twice once the run's elbow reaches the bid. **No guard, by decision**
      (owner, 2026-09-26, answer 6) — the same stance as connectors below.
      No starter assembly carries an elbow, LB or pull box (searched the seed
      by those names). Worth a guard if it shows up in practice.
- [ ] **Field-bend and elbow hours may already be inside a pipe's per-foot
      labor unit.** A company whose EMT hours come from a book that folds in
      bends would count bending twice. Nothing moves by default (every shipped
      unit is NULL). The editor says "per bend"; worth a sentence on the
      Materials screen if a company reports it.
- [x] **FIXED 2026-09-26 (`1956a90`, deployed in `e07f1e4`): run-type lines
      printed "0 h" when their material had no labor unit.** A missing unit
      now stays NULL on every traced line; the hours cell reads "Not priced",
      a strip names the lines, and Send again fills the hours in once the
      part has them. **Still true:** lines sent BEFORE the fix froze the
      missing unit as 0 and read "0 h" — they cannot be told apart from a
      set zero. Production had no bid lines at deploy time, so no live bid
      carries any.
- [ ] **PVC sweeps are not in the catalog.** Sweeps wait for an Underground
      category (answer 2). **SWEEPS SHIPPED 2026-09-29 on `track-c`**,
      overriding answer 2 (plan § 8, S1; takeoff-spec D19 says so too): 56
      PVC rows on Conduit Fittings, and "sweep" taken off the PVC 90's
      aliases (S5). The run-type editor's 90°/45° pickers shipped the same
      day (S6, plan § 8b), and a traced sweep now counts as one bend on a
      sweep type (plan § 8a).
- [x] **FIXED 2026-09-29 (plan W1, owner Q1: name the part, or "bend").**
      The word follows the part the type buys (`bendWordsFor`,
      `shared/runFittingMaterials.ts`, from the same names as the sweep merge
      distance): sweep → "90° sweep", elbow or nothing chosen → "90° elbow",
      anything else → "90° bend"; where NO part matched, the panel and the
      materials list say "bend" (`unmatchedKindWords`). `words` is required on
      `countFittings`, like `mergeWithinFeet`. `runBendsBridge.test.ts` goes
      red on the old code with the exact old sentence. The entry as found:
- [x] **The sentence under a sweep row still says "90° elbows".** Found
      2026-09-29 looking at the run panel (plan § 8b): the fitting line is
      named `2" PVC Sch 40 90-degree sweep, 36" radius` and the caption
      under it reads "At least 2 90° elbows: 2 corners …". The kind is
      labelled "90° elbow" everywhere (`FITTING_KIND_LABELS`,
      `shared/runFittings.ts`, and the counted sentences in
      `shared/runBends.ts`), so saying "bend" instead changes the wording on
      every raceway, not just sweeps — the owner's call which. A caption
      naming the old part beside a row that is a different one reads as
      confirmation (CLAUDE.md rule 7), so it should not stay this way.
- [x] **Concrete ring cover — DECIDED 2026-09-29 (owner): no cover row.** A
      concrete ring is a 4" octagon and the shipped `4" round blank cover`
      fits it (plan § 9a).
      T bodies shipped 2026-09-27 (see "T bodies at a
      tee" above). **LL/LR/C SHIPPED 2026-09-28** (plan § 7, 135 rows,
      overriding T6's "until the takeoff proposes them"). The takeoff still
      proposes none of them: offering them at a pull point needs a new
      `runMaterialRole` (Track A) and is held (L5). **Covers are DECIDED
      (2026-09-27, owner, plan § 5 C1): every body is priced with its cover
      and gasket, no separate cover rows.** The LB rows now say so like the T
      rows, and `materialsCatalog.test.ts` fails on any "… conduit body" row
      without the description — LL/LR/C carry it.
      Replacement covers as their own rows: not now (C3).
- [ ] **Three local tables are on the wrong collation** —
      `ai_usage_daily`, `bid_mounting_heights`, `takeoff_mounting_heights`
      (reported by `scripts/schemaDrift.mts` on `bidrender_local`, 2026-09-26).
      Pre-existing, not from 0084; `deploying.md` has the CONVERT statements.
- [x] (The design as planned — two lines turned out wrong, marked.) **NEXT
      BUILD: bends and pull points.** Decided by the owner 2026-09-26.
  - **Bends from the trace geometry, in plain code, no AI:** each corner's
    measured angle, plus one 90 at each counted vertical drop. Legs already
    carry `points` and `drops` for this (`FittingLeg`), so it adds an
    `"elbow"` `FittingKind` rather than reshaping the input.
    > **Wrong, as built:** it DID reshape the input. A pull point at the top
    > of the END drop needs to know which end, and splitting a leg needs each
    > drop's feet, so `drops: number` became two `EndDrop`s. And "elbow" is
    > five kinds: `elbow90`, `elbow45`, `fieldBend`, `lb`, `pullBox`.
  - **A company setting: "factory elbows from this size up"**, default
    1-1/4". Below it, bends are field-bent — labor only, no fitting. PVC
    always uses factory elbows or sweeps. The size comes from the raceway's
    shipped name (`parseRacewayName`) compared through
    `shared/materialSizeOrder.ts`, never arithmetic on the text.
  - **Pull points:** add up the degrees of bend along each run. When the
    total passes the company limit (default 360°, the code max; 270° as an
    option), PROPOSE an LB or pull box at the spot where it tips over —
    proposed and marked on the drawing for approval, the same as drops,
    never added silently.
    > **"The same as drops" named nothing that existed:** drops have no
    > propose-and-approve flow today. Pull points are the first; they borrow
    > the plan reader's dashed-means-proposed convention, and their answers
    > live in `takeoff_pull_points`.
  - **Bend counts read "at least N"**, since plans do not show the kicks and
    offsets at boxes.
- [ ] **Fitting styles for the other families.** EMT has set-screw /
      compression / raintight. Still to add: FMC (squeeze vs screw-in), LFMC
      (straight vs 90, and the style picker for it), PVC (glue vs threaded
      adapter), and whatever else a family needs. PVC and RMC/IMC already
      count by their own rules (belled; coupling on each stick) without a
      picker.
- [ ] **Locknuts and bushings** at each connector (RMC/IMC, and EMT into a
      panel). The rows exist (`conduit bushing`, `conduit locknut`); nothing
      counts them yet. **Rule decided by the owner 2026-09-29, build HELD
      until Track A appends `locknut` and `bushing` to `runMaterialRole`
      (A1).** Three facts reported first, in
      `references/track-c-next-batch-plan.md` § W5: no connector row says it
      includes a locknut or insulated throat; wire size is known per run
      TYPE (its conductor), not per run, and not at all when a type names no
      conductor; the box at a run end is not known, so hubs are known only at
      LBs. A2/A3 there are the schema options if the owner wants those gaps
      closed. **No wire size (owner, 2026-09-29):** on small conduit, a type
      with no conductor chosen counts no bushing and says "wire size not
      set, bushings not counted" (plan § W5).
- [ ] **Commercial retail catalog gaps** — plan only, owner to answer RQ1–RQ5:
      `references/track-c-retail-catalog-plan.md`. First: MC runs count no
      connectors or straps, and there is no 12-4 MC. Surface raceway needs
      Track A's category enum first.
- [x] **FIXED 2026-09-29:** `dropFixtureUsersAfterAll` (`server/testFixtureUsers.ts`)
      deletes each file's fixture users in `afterAll`, and every `userId`
      table cascades from `users`. 23 files (the 20 below plus
      stampDeleteAndDropUndo, quoteAppPanel, planCopilot from the local-dev
      merge). Full run on `bidrender_test_c`: before, 21 files left 209 rows;
      after, 0, and a second run of the 23 is 0 with nothing to clear. A
      forced failing test in materialsList left 0 with the call, 46 without.
      Still open: switching the report to a failure (needs it to count
      user-owned rows only, so a seeder adding shipped rows is not flagged).
      The entry as it stood: **Tests leave user-owned rows behind: 20
      files, 195 rows per run.**
      Measured 2026-09-29 with `TEST_LEAK_REPORT` (vitest.setup.ts): materials
      93, assemblies 41, takeoff_run_types 37, then bids, users,
      company_members and others. Worst: materialsList (38), proposal (18),
      linePricingProblems (18), assemblyOverhead (16), extrasLaborSplit (13);
      the full list is in the plan, § 3. None crosses files today (distinct
      fixture ids) and SHARED rows are now a failure (`testLeakGuard.ts`);
      these are the owner's "fix as a separate change" (Q5). When they are
      clean, switch the report to a failure like the shared-row guard.
- [ ] **PVC expansion fittings** on long exposed PVC runs.
- [x] **MC cable connectors and straps.** MC needs the same counting — a
      connector at each end, straps at 6 ft and within 12 in of a box — and
      `countFittings` can serve it; the catalog has no MC connector rows by
      size yet, and cable types have no fitting slot.
      **BUILT 2026-09-29 (retail plan § R1):** `countCableFittings` over
      `cableLegs`, parts by `mcFittingNames`, 4 MC connectors + 2 MC straps.
      The type's existing connector/strap columns hold an override. NM still
      counts none (plastic box: none needed; box kind not known).
- [x] **FMC/LFMC straps.** Flex carries a strap spacing (4.5 ft / 1 ft) but
      `strapFamily` returns null for flex, so flex straps say "No catalog
      strap" until sized flex straps ship.
      **BUILT 2026-09-29 (retail plan § R7):** `<size> flexible conduit
one-hole strap`, 1/2" to 1-1/4", shared by FMC and liquidtight;
      `server/raceStrapCatalog.test.ts` checks every raceway's strap ships.
- [ ] **MC above a lay-in ceiling defaults to the ceiling-wire clip** (owner,
      2026-09-29). An MC run counted today buys `MC one-hole strap` every
      6 ft (§ R1), but above a T-bar ceiling MC is hung on the support wire
      with `Independent support wire clip`, not strapped. Wanted: when the run
      is above a lay-in ceiling, the strap line defaults to the wire clip, and
      a QUICK way to set that (one control on the run or run type, not a trip
      to the run-type editor per run). The type's strap override column can
      already hold the clip; what is missing is knowing "above lay-in" and the
      fast toggle. Decide where "above lay-in" lives (run, run type, or sheet
      area) before building — check `references/takeoff-spec.md` D3 first,
      which rejected a form on every run.
- [ ] **Purchase list rounds to whole PACKS, not only whole pieces** (owner,
      2026-09-29, starter assemblies plan D5). Built: `orderQty` in
      `shared/materialsList.ts` rounds a piece or box UP to whole after the
      sum, so a quarter tube never reaches a supplier. Not built: rounding to
      the pack a part is sold in (a box of 100 wire nuts), because the catalog
      has no pack size yet — `references/material-markup.md` D3. When pack
      sizes land, round there too, in the same function.
- [ ] **Starter assemblies: build the 168 once Track A lands H1 and H2**
      (`references/starter-assemblies-plan.md`,
      `references/track-a-handoff-starter-assemblies.md`). Order matters for
      H2: the null-hours code ships BEFORE the migration that clears the 8
      starters' placeholder hours, or every one prices at zero hours.
- [ ] **Double counting from a user's own box assembly.** No starter assembly
      carries a connector or strap, so nothing overlaps today. A company
      whose own box or device assembly includes an EMT connector will count
      that connector twice once the run's end connector reaches the bid. No
      guard, by decision (2026-09-26); worth one if it shows up in practice.
- [x] **DECIDED AND BUILT 2026-09-26: yes, Send-again refills a "Not priced"
      line, never a set price, never on a locked bid; and a style change
      swaps fitting lines on Send-again with the swap named in the preview.
      `shared/resendLine.ts`, `bid_line_items.runMaterialId` (0083), and the
      R4 note in `references/takeoff-spec.md`. The question as it stood:**
      **Does Send-again re-price a line that was sent unpriced?** A
      run-type line freezes its price at send (R4). A fitting sent while its
      catalog row was $0 therefore stays "Not priced" on that bid after the
      row is priced, and the only way out is removing the line and sending
      again. Re-snapshotting a $0 snapshot on Send-again would fix it without
      touching any price somebody chose — but it is an exception to R4 and
      the owner's call.
- [x] **(Resolved with the item above.) Changing a type's fitting style does
      not change lines already on a bid** — still true, by decision; Send-again
      now swaps them. The original note: Their material is frozen with their price (R4), the same as
      changing a type's raceway. The preview shows the new part while the
      bid line keeps the old name. Same decision as above, really.
- [x] **DECIDED AND BUILT 2026-09-26 (Track B): what a proposal says when a
      line inside it is not priced.** Owner: nothing, on the client's copy —
      no "not priced" text on the document. Unpriced lines do NOT block it
      (unlike a line the engine cannot price, which still refuses). Instead
      Print / Save PDF and Ctrl+P ask first ("N lines are not priced — Print
      anyway / Back to the bid"), and "Your figures" shows the count beside
      Materials, Direct cost and Bid price. Scope-only prints no money and
      asks nothing.
      **OVERRIDDEN 2026-09-29 by the owner (branch a-proposal-zero):** "a
      client document must never show $0 or a short total". Staging's bid 2
      printed TOTAL INVESTMENT $0.00 with one unpriced line. Now every figure
      worked out from the bid's price reads "Price pending" on the document
      (`clientFigure`, shared/proposal.ts), and Print / Save PDF / Ctrl+P is
      a BLOCK listing the unpriced lines by name, with no "Print anyway".
      Scope-only is unchanged.
- [x] **BUILT 2026-09-26 (Track B): bid totals say how many lines they leave
      out** — "$4,210.00 + 4 lines not priced", "$0.00 + 4 …" when every line
      is unpriced. Materials, Direct cost and Bid price on the bid screen and
      the Count screen (which gained a Materials total for it), the search
      results and the archive. One component, `NotPricedTotal`; the words in
      `client/src/lib/notPricedTotal.ts`; the server count is
      `rollUpBid().notPricedCount`, through `countNotPriced`. Total due and
      Labor carry no suffix — not asked for.
- [x] **BUILT 2026-09-26 (Track B), option (a): the dashboard cards say it
      too** — "$378 + 3 lines not priced", lines and parts, through
      `NotPricedTotal`. `lineNotPricedSql` in `server/db.ts` is the SQL copy,
      and `server/dashboardNotPriced.test.ts` is the parity test: one bid per
      branch of `lineNotPriced`, each counted both by the SQL and by
      `rollUpBid` over `getRollupLines`, which must agree with each other and
      with the written-out tally. Breaking the field-bend branch turns
      exactly that case red. Parts: frozen counts are summed in the same
      query; lines from before 0087 go through a second GROUP BY (bid,
      assembly) and `liveUnpricedParts`, the reader the rollup uses too.
      Looked at locally: all six of user 1's bids agree with "Find a bid".
      **Still open, from "Dashboard vs bid screen still differ" above:** on an UNLOCKED bid whose traced
      footage has moved since it was sent, the card reads run-type lines at
      their stored qty, so it can count one as not priced that the bid screen
      calls qty 0 (and the reverse). The suite locks its bids for that reason.
      The question as it stood:
      `bids.dashboard` sums lines in SQL (`getDashboardBids`) rather than
      running `rollUpBid`, so counting unpriced lines there means writing
      `lineNotPriced` a second time in SQL — hand-priced blank vs typed 0,
      run-type lines off a $0 catalog row, a field bend decided by its HOURS,
      and an assembly line whose whole cost is $0. Two copies of that rule
      will drift. Options: (a) the SQL copy plus a parity test running both
      over the same fixture lines; (b) a stored per-line flag written when a
      line is added or re-priced (a migration — Track A territory); (c)
      price the dashboard in JS again, which is what took it from ~100ms to
      ~600ms at 1,149 bids. **Visible now:** "Find a bid" shows
      "$378 + 3 lines not priced" directly above the dashboard card for the
      same bid reading a bare "$378".
