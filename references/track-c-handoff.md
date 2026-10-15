# Track C — handoff, 2026-10-06

## (newest) 2026-10-14 → 15, overnight run #2 — see `references/overnight-log.md`

**Item 1 — security sweep: `references/security-sweep.md`.** 21 findings,
13 fixed on track-c (not merged). The attacker test
(`server/crossCompanyAttack.test.ts` + `server/attack/`) runs every route
as a stranger, a viewer, an estimator and signed-out in ~90 s; every new
route is attacked automatically.

- **FOR TRACK A (parked, each needs a live look / R2 / changes live
  behaviour):** A-S9b session cookie `SameSite=None` → `Lax`
  (`_core/cookies.ts`; the CSRF guard already closes the form-POST hole);
  A-S12 `clientKey` trusts the FIRST X-Forwarded-For entry — per-sender
  limits are dodgeable until it reads what DO/Cloudflare actually append;
  A-S13 signed upload URLs don't bind Content-Length and tickets are
  unlimited (storage abuse); A-S14 the signup race (yours already).
- **FOR TRACK A (stress, 2026-10-15) — Q-AUTH1:** 11 sign-ins at once
  stall every other request ~0.7 s (`bcryptjs` on the main thread).
  Worker pool or native `bcrypt`; no stored hash changes.
- **FOR TRACK A (drill, 2026-10-15) — Q-DB1:** a database that stops
  answering can wedge the server until restart: stuck pooled connections
  are never thrown away (mysql2's `timeout` returns them out of step), and
  `/api/version` still says 200. Fix + check App Platform's health check.
  `references/stress-results.md` "Third round"; `todo.md`.
- **New guards other tracks will meet:** `server/libraryRefs.ts`
  (`requireLibraryRefs`) — any route storing a material / assembly /
  labor rate / modifier / work step / kit id must call it;
  `server/csrfGuard.ts` — a non-JSON POST to `/api/trpc` is refused (our
  client and scripts all send JSON); `proposals` writes need
  `settings.edit`; legacy `masterAssemblies` item db functions take the
  owner.
- **For Track B:** `BidRenderShell.tsx` changed — `NavBtn` / `NavSection`
  moved to module level (they were rebuilt on every render and ate the
  first tap). `client/src/lib/shellNavStable.test.ts` now fails on ANY
  component declared inside another in client/src.

**Items 4–6 (the endless part) — what other tracks will meet.**
Numbers and drills: `references/stress-results.md`; every change in
`references/overnight-log.md` with BEFORE → AFTER.

- **A valid session the database can't load is SERVICE_UNAVAILABLE, not
  signed out** (`server/_core/context.ts` `sessionUnavailable`; `auth.me`
  and both "must be signed in" checks). The client shows "Can't reach
  BidRidge right now" (`AuthGuard`). A failed list says so
  (`components/LoadFailed.tsx`) instead of "No bids yet" / "Nothing here".
- **Signed out mid-edit** keeps the address and says why on the sign-in
  form (`lib/sessionExpiry.ts`, `main.tsx`).
- **`InvokeParams.timeoutMs`** (AI): honoured by the Anthropic adapter
  (timeout, no retries) and the gateway (one AbortSignal). "Find it" uses
  15 s. **The plan reader has none yet — Q-AI1.**
- **`shared/csvWrite.ts` `defuseFormula`** — every CSV cell; the
  early-access export now uses the shared writer.
- **`parseTypedNumber`** (`lib/inlineEdit.ts`) in every self-saving number
  box and the Materials editor; other Save forms listed in todo.md.
- **Races:** a lost `sendToBid` answers CONFLICT; markup override falls
  back to update; `saveCloseout` takes a bid row lock (`inOneTransaction`).
  `db.isDuplicateKey` is exported. `server/weirdInputs.test.ts` (edges +
  twice-at-once over every route) and `server/sendRace.test.ts` guard them.
- **Dashboard drops check** skips bids with no drop kind (`bidsWithADropKind`):
  2.4 s → 0.4 s under load.
- **Pages load on demand** (`BidRenderShell`: every page is `lazy(reloadingImport(...))`; `lib/lazyPage.ts`). **For Track B:** TakeoffPage is now a lazy import in the shell — a merge touching those imports keeps the pattern. 834 → 217 KB before the Dashboard shows.
- **Sidebar**: one scroll area (the menu vanished on a sideways phone).
- **Pages are `preloadable`, not `lazy`** (`lib/preloadable.ts`, 2026-10-15).
  React 19 holds a Suspense reveal ~300 ms; the loader shows its own
  fallback and swaps the page in with plain state, so the Dashboard shows
  at ~400 ms instead of ~890. **For Track B:** a new page in the shell is
  `preloadable(loadX, PageLoading)` and its loader goes in `PAGE_LOADERS`.
- **A screen that failed to load must say so — never draw from defaults.**
  Database-down drill (2026-10-15): 16 screens said "No roles yet", sales
  tax OFF, "0 lines", a bid "may have been deleted", or went blank. Each
  now shows `LoadFailed`; a section that did `if (!data) return null`
  returns `LoadFailed` when the query `isError`. App-wide net:
  `lib/dataReach.ts` + `DataUnreachableBar` (top of the screen, clears
  itself). **For Track B:** the Plans screen (TakeoffPage) was NOT drilled
  — it is yours; `isReachFailure(error)` tells "out of reach" from "gone".
- **`InlineNumberField` shows "saved" only for a save that landed**
  (2026-10-15). Return the save's promise from `onSave`/`onClear`
  (`mutateAsync`): the green tick waits for it, and a refused save turns
  the field red with the typed value kept (Enter retries, Esc reverts).
  A caller returning nothing still flashes at once — the old fault. **For
  Track B:** the call sites in `components/takeoff/` (CountLaborNote,
  HomerunControls, RunsPanel) are untouched; returning `mutateAsync`
  there gives the Plans screen the same honesty. Also: a page or list
  keeps its data when a background REFRESH fails — use `isLoadingError`
  (nothing to show) rather than `isError` for "Couldn't load".
- **A bid in Recently deleted says so** on the bid page and Count
  (`components/bid/ArchivedBidNotice.tsx`: deletion date + Restore). The
  server still accepts edits to an archived bid (`todo.md`). **For Track
  B:** the Plans screen does not show it — `<ArchivedBidNotice bidId
archivedAt />` drops in anywhere the bid is loaded.
- **Validation refusals now read as sentences** (`lib/errorText.ts`,
  2026-10-15): a zod "too_big"/"too_small" on a string or number becomes
  "The name is too long — 255 characters at most" and the like, from the
  issue's path and limit. Anything else keeps the general line. Every
  `toast.error(errorText(e))` on every track gets it with no change.
- **Finished mutations are let go at once** (`main.tsx`, mutations
  `gcTime: 0`, 2026-10-15). Their callbacks closed over the Plans screen's
  canvas ref and kept the whole drawing alive 5 minutes per visit (+14,590
  nodes each). **For Track B:** nothing to change in TakeoffPage; but a
  future `useMutationState` / `useIsMutating` would see no FINISHED
  mutations — pending ones are unaffected. `references/stress-results.md`
  "Memory".
- **"Where do I…?" forgives a one-letter typo** (`searchHelp`, exact hits
  still first).

**FOR TRACK B — smoke flow 3 fails locally, not from tonight's changes.**
**Update 2026-10-15 03:16: it PASSED in a full desktop run (46/46).** The
look-alike prompt depends on what the account has already captured, so
leftover captures from earlier runs are the likely difference — not
confirmed. If it fails again, look at the account's captured symbols first.

Run locally against `bidrender_local_c` (desktop): capturing "CI SWITCH"
raises the look-alike check — "This look also matches 4 places a look of CI
DUPLEX also finds on this sheet. Add it anyway?" — and the test does not
expect it, so it waits for "CI SWITCH" and fails. Deterministic (2 of 2).
Re-run with `takeoffStampsRouter.ts` put back to tonight's starting
commit (13c4bcc2): same failure, so not C's `captureSymbol` change.
Screenshot: `references/overnight-shots/smoke-flow3-lookalike-local.png`.
Either the fixture's switch and duplex look alike to the matcher at local
rendering, or the step should answer "Save anyway". Everything else in the
smoke suite passed locally (127). With a local-only patch answering "Save anyway", flows 1–15 all pass.

**FOR TRACK B (from the stress run):** the 500-sheet set opens its first
sheet in ~3.0 s and sheet 400 in ~2.5 s at laptop size ON THE DEV SERVER.
**On the production build (2026-10-15) it is 1.9 s at laptop and phone, next
sheet 0.8–1.0 s — just under the 2 s budget, ~100 ms to spare.** Range loading is fine (7.2 MB / 2.1 MB); the time is the
viewer's open + render. Numbers and method: `references/stress-results.md`. A sheet with 2,000 marks on it draws in 2.0–2.3 s on the dev server — but **0.9–1.1 s on the production build** (re-measured 2026-10-15), so nothing to chase.
Also: a plan whose file is missing says "could not be opened … (404)" —
honest, but it could say what to do ("upload it again"). A CORRUPT file
says "InvalidPDFException: Invalid PDF structure." — pdf.js's words; "This
file isn't a readable PDF — delete it and upload it again" would serve a
contractor (screenshot: `overnight-shots/drill-storage-corrupt-15s.png`).

**Item 3 — guide mode: `references/guide-mode.md` (G1–G8).** A one-tip
strip at the bottom of the main column (`GuideStrip`, mounted in
`BidRenderShell`) + a local "Where do I…?" (`HelpSearch`). **For Track B:**
on the Plans screen the strip steps aside while a `PlanTips` card is on
screen, detected by its **"No more tips"** button text — rename that button
and update `planTipOnScreen()` in `GuideStrip.tsx` in the same commit.
`e2e/smoke/guide.spec.ts` goes red if they drift. No TakeoffPage change.
**`device:audit` now refuses to report when not signed in** (it had
silently measured the landing page when the server's JWT_SECRET differed).

**Item 2 — e2e + screenshots.** `e2e/smoke/newScreens.spec.ts` (29 pass
at laptop, iPad both ways, phone 375 — new `phone-375` project in
`e2e/playwright.config.ts`). Shots: `references/overnight-shots/`. Local
smoke account on `bidrender_local_c`: smoke-c@example.com (in the
git-ignored `.env.test.local`), plus estimator-c@example.com as its
estimator.

## (newest) 2026-10-14, overnight run — see `references/overnight-log.md`

The owner's overnight queue (11 items) is worked in order; each item's
commit, tests and Gate result are one line in `references/overnight-log.md`.
Questions that need the owner are in `pricing/morning-questions.md`.

**Item 1 — Fasteners & Anchors: Q1–Q14 all YES as suggested**
(`pricing/fasteners-anchors-name-review.md` "Owner's answers"), nothing
applied: the ten renames, Q7 retires `Plastic conduit clip`, Q13 pack
fixes, and **M1 powder load, M2/M3 3/4" and 1" conduit hangers accepted**
(COMMON; `new-rows-source-check.md` marks them accepted — still 64
families, 62 COMMON, 2 SPECIALTY). No starter edit.

**Item 2 — the last three shelves reviewed (read-only, source rule, nothing
applied), from the owner's live workbook copy** (`C:\dev\BidPhase\pricing`,
saved 19:29 on 2026-10-14; it already carries the owner's own pack fixes on
rows 1598, 1602, 1666, 1688, 1693, 1719). All 138 names match
`BASELINE_MATERIALS` one for one. **The sheet ends at row 1719: every shelf
now has a review.**

- `pricing/equipment-appliances-name-review.md` — rows 1582–1646, 65 rows:
  30 OK, 28 need words, 7 owner picks; 39 rows used. **Q1 is a STARTER EDIT
  (PG19: the generator battery charger line → M1 battery)**; Q11 changes
  what CW2's pedestal line counts. 26 questions; M1–M4 proposed.
- `pricing/distribution-equipment-name-review.md` — rows 1647–1691, 45 rows:
  6 OK, 27 need words, 12 owner picks; 14 rows used by 10 starters. **Q15 is
  a STARTER EDIT (DV32 loses its separate duplex: the prewired poke-through
  includes it)**; Q1/Q12/Q13/Q16 make built-to-order gear SPECIALTY (price
  blank). 19 questions; M1–M5 proposed (M5 conditional).
- `pricing/consumables-name-review.md` — rows 1692–1719, 28 rows: 5 OK, 20
  need words, 3 owner picks; 7 rows used. No starter edit. 18 questions;
  M1–M2 proposed.
- The 11 proposed rows are in `new-rows-source-check.md` as "waits for".

**Item 3 — `pricing/morning-questions.md`**: the 63 open questions, ⚠ ones
first (two starter edits: Equipment Q1 → PG19, Distribution Q15 → DV32).
Later items append anything they park under "From the overnight build work".

**Item 4 — merged `origin/local-dev` as `0c8e324f`** (A's 0157–0163,
B's plan-reading help 1–5b and phone bottom bar). Conflict only in this
file, both sides kept. **C's databases are at 164**: `bidrender_test_c`
matches the schema, 205/205 FKs; `bidrender_local_c` migrated the same
(still C's scratch copy, not exact — see below).

**Item 5 — layout, built on track-c (NOT merged; nothing changes a bid
number; no migration).** BEFORE → AFTER rows in `overnight-log.md`.

- **Nav** (`BidRenderShell.tsx`, `appRoutes.ts`): Work = Dashboard, **Bids**
  (`/bids`, new `BidListPage` — the Dashboard's `BidSearchPanel` full page),
  **Plans** (`/plans`, new `PlansIndexPage` — every bid with drawings +
  Upload a plan), Clients; Library = Materials, Assemblies; bottom =
  Performance, Labor rates, **Recently deleted**, Settings, Crew, Admin.
  Phone bar: Dashboard, Bids, Plans, Materials, **More** (popover).
  `/bids` left `RETIRED_PATHS`; CLAUDE.md § Architecture, todo.md and
  track-b-beta-plan.md record the override. `useStartBid` hook shares the
  three ways to start a bid.
- **Recently deleted** (`/trash`, `TrashPage`): archived bids, materials,
  assemblies, kits, modifiers, clients with Restore — existing calls only.
- **Bid page**: the rail is client + total (sticky); close-out, extras, tax,
  pricing settings sit under the lines. Settings › Pricing 2×2 on ≥1280 px.
- **Back** returns to where a bid was opened from (`BID_ORIGINS`).
- **Step bar** (`BidStepBar`, rule `shared/bidSteps.ts`, read-only
  `bids.progress`, refreshed after any mutation in `main.tsx`): bid page and
  the Plans header (laptop).
- **Homerun icon** (`HomerunIcon`, solid arrow + ticks); sign-in tagline;
  help bar wording. **Parked with sketches**: `overnight-parked.md` (slimmer
  toolbar, touch hint for B's tips, work-tag label).
- `pnpm device:audit --check` at laptop, both iPads, phone 375: 0 hard faults.
- **For B when merging**: `TakeoffPage.tsx` changed in ONE place (the
  header blurb → `BidStepBar`), plus `HomerunsView.tsx`'s icon.

**Items 6 + 7 — pricing safety steps 1, 5, 6 and price-history RECORDING
(on track-c, NOT merged; no migration — uses A's 0157–0163).**

- **The price door** (`server/db.ts`): `updateMaterial` / `createMaterial`
  take a price only as `PricedWrite` = `priceWrite` pair
  (`shared/packPricing.ts`, round UP) + `PriceWhy`; `costPerUnit?: never`
  catches a spread too. One transaction; a `material_price_history` row
  only when the number changed. Writers: materials.update/.create,
  importPrices (importId NULL until PS step 4), save line as assembly,
  revert to shipped (as `typed` — Q-PH1 drafts a `reverted` enum for A).
- **Forcing tests**: `priceHistoryDoor.test.ts` (every direct `materials`
  write must be in a named function; red on a planted write) and
  `priceHistoryRecording.test.ts` (10). `typedPriceFixture.ts` for fixtures.
- **Pack entry** on screen (step 5): editor More options + "unit or pack"
  price row; Supplier pricing pack box. **Sanity warning NOT built** (step 3
  waits on the Platt export, Q4/Q8).
- **Step 6**: `realPackFromSheet` built and run over the catalog; NOT
  written (A's hold until the owner's sheet — Q-PS6).
- **Price-history screen** also built (item 11): `materials.priceHistory`
  - `PriceHistoryPanel` (editor › More options › Price history).

**Items 8–11.**

- **Copy** (item 8): the clear fixes, plus `CAPABILITY_LABEL` / `roleLabel`
  on Crew and one name for deleted things ("Recently deleted"; the bids-only
  page is "Deleted bids"). The rest, with reasons:
  `references/copy-review-2026-10-14.md`. Naming decisions C1–C3 are in
  morning-questions.
- **Error toasts** (item 11): `client/src/lib/errorText.ts` on 96 sites.
  **For Track B:** the 67 `toast.error(x.message)` in `TakeoffPage.tsx` and
  `components/takeoff/` were left alone; the same one-line change applies.
- **Step-bar switch** (item 9): Settings › Display. Parked ideas:
  `overnight-parked.md` P4 (copy a bid — a money question), P6.
- **Scripts typecheck** (item 10): `tsconfig.scripts.json` is the second
  pass of `pnpm check`.
- **Todo housekeeping** (item 11): the `aliases()` audit was measured and
  closed, and the white-box entry closed (B fixed it in `14fead91`).
- **State at the end:** `pnpm check` green on both passes; tonight's 16
  test files pass (211 tests); `device:audit --check` shows 0 hard faults
  at four sizes. Dev server stopped; MySQL 3307 left running. Not merged:
  everything is on `track-c` only.

## (newest) 2026-10-14, late night — Strut answers, Fasteners & Anchors review; Example-tag item moved to B

**Standing rule: never stop MySQL 3307** (all tracks share it). No dev
server, no database touched this round.

**Moved to Track B (owner, 2026-10-14):** B owns the whole starter-offers
build, including the queued rule that `applyStarterChange` writes the
"Example" tag (§ "MOVED TO TRACK B" below, under the Service Entrance
entry). **C does not build it.**

**Strut & Supports: Q1–Q9 all YES as suggested**
(`pricing/strut-supports-name-review.md` "Owner's answers"), nothing
applied: channel `12 ga, pre-galvanized, slotted`; `{size} EMT strut
strap`; `Strut channel nut, 3/8"-16, with spring`; fittings by shape and
holes; `{size} EMT clip, rod/wire hanger`; `Temporary pole, 6x6 x 16 ft
treated post` (PG20 by key); stiffener kept as a seismic brace; Q8 packs
(straps, channel nut, wing fitting `each`); **M1 `3/8"-16 x 1" hex bolt,
zinc` accepted** (COMMON, HD). No starter edit.

**`pricing/fasteners-anchors-name-review.md`** — rows 1568–1581, 14 rows,
fresh workbook copy (unchanged); matches `BASELINE_MATERIALS` one for one.
Read-only, under the source rule.

- **Counts:** 2 OK, 10 need words, 2 owner picks. 4 rows used (hanger wire
  7 starters, wedge anchor 6, beam clamp 3, J-hook 3). No run type.
- **Strut Q5 check:** `Rod hanger clip` is a rod-to-flange clip (Platt
  Caddy 6TI24), NOT the Strut EMT clip — neither retires; Q9 renames it.
- **Could price wrong:** hanger wire priced from a 100 ft roll (~8x low,
  7 starters); a bare J-hook with no mount (3 data starters); ten anchors
  and screws with no size; pins with no powder loads.
- **Packs:** 10 guessed; beam clamp `each`, drop-in `box of 50`, drywall
  anchor and Tapcon `pack of 75`, toggle `pack of 10`, rest read at the
  three stores.
- **Missing:** M1 `.27 cal` powder load (HD), M2/M3 3/4" and 1" conduit
  hangers (Platt) — in `new-rows-source-check.md` as proposed (now 64
  families, 62 COMMON, 2 SPECIALTY).
- **Owner questions:** Q1–Q14, incl. Q7 retire `Plastic conduit clip`.
  No starter edit proposed.

**Next shelf in app order: Equipment & Appliances (from row 1582).**

## 2026-10-14, night — Connectors answers, Strut & Supports review

**Standing rule (owner, 2026-10-14): never stop MySQL 3307** — every track
shares it; the owner stops it at end of day. Track C ran no dev server and
touched no database this round.

**Connectors & Terminations: Q1–Q9 all YES as suggested**
(`pricing/connectors-terminations-name-review.md` "Owner's answers"), for
A's end-of-pricing job, nothing applied: the 14 crimp lugs renamed with
stud size and one description; sleeve descriptions; cord grip ranges;
`#8-#10 stud` on ring/spade terminals; push-in 3-port; insulated NM staple;
DIN rail and terminal block named; **Q8 pack fixes for the pack pass**
(anti-short `bag of 100`, 3/8"/1/2" MC connectors `box of 50`, big
splices, SE connector and ferrule kit `each`, crimp terminals `bag of
100`); **Q9 M1 `#6 copper compression lug, 2-hole, 1/4" stud` added**
(COMMON, Platt). No starter edit.

**`pricing/strut-supports-name-review.md`** — rows 1519–1567, 49 rows,
fresh workbook copy (unchanged); matches `BASELINE_MATERIALS` one for one.
Read-only, under the source rule.

- **Counts:** 26 OK, 22 need words, 1 owner pick. 9 rows used (T-grid
  clips in 5 and 6 starters; PG16, MS5, MH12, DV30, PG20). No run type.
- **Could price wrong:** strut with no finish (hot-dip ≈ 2x
  pre-galvanized); strut straps that don't say EMT or rigid; the temp pole
  post with no length (PG20).
- **Packs:** 29 guessed from words; straps, channel nut and wing fitting
  should be `each`.
- **Missing:** M1 `3/8"-16 x 1" hex bolt, zinc` (COMMON, Home Depot) —
  added to `new-rows-source-check.md` (now 61 families, 59 COMMON).
- **Owner questions:** Q1–Q9. No starter edit proposed.

**Next shelf in app order: Fasteners & Anchors (from row 1568).** Its
`Rod hanger clip` must be checked against Strut Q5.

## (newest) 2026-10-14, end of day — SOURCE RULE for new rows, Low Voltage answers, Connectors & Terminations review

**THE OWNER'S SOURCE RULE (2026-10-14) — A FOLLOWS IT FOR EVERY NEW ROW
FROM EVERY NAME REVIEW, PAST AND FUTURE:**

- **COMMON** (found at **Home Depot, Platt or Stoneway**): add the row; its
  **Example price comes from those three only**. Other sites are comparison.
- **SPECIALTY** (found at none of the three): **still add the row** so it
  can be counted, with the **price BLANK** (no Example price) and the
  description **"Specialty - price from your supplier."** The bid's "not
  priced" warning covers it.

**`pricing/new-rows-source-check.md`** applies it to every accepted new row
from the 14 earlier reviews plus Connectors M1: **60 families, 58 COMMON,
2 SPECIALTY** (Life Safety M1 sampling tube and M2 remote test station),
each with its store, part and link. **It overrides each review's "Listing"
column for price**; every earlier review now ends with a pointer to it. Five
rows change what A adds (⚠ in the file): Boxes M9 (fan rating
unconfirmed), M13 (Arlington FN101F, not Cantex), M16 (Carlon B432A, not
the 2-gang parts named), Service Entrance M1 (3/0–4/0 only), Low Voltage M3
(OM3/OM4 LC part). **Breakers H3's condition is met**: Platt Eaton DH361UGK
or HD Square D VHU361. A also checks that seeding accepts a shipped row
with no price without writing a $0 example. If A's count of accepted new
rows differs from 60, stop and find out why.

**Low Voltage: Q1–Q14 all YES as suggested** (review's "Owner's answers").
No starter edit. Cable rows get descriptions, not renames.

**`pricing/connectors-terminations-name-review.md`** — rows 1422–1518, 97
rows, fresh workbook copy (unchanged since the Low Voltage read); matches
`BASELINE_MATERIALS` one for one. Read-only; written under the source rule.

- **Counts:** 71 OK, 25 need words, 1 owner pick. 12 rows used — including
  `Wire nut, 22-8 AWG (tan/red)` (133 starters), `MC anti-short bushing`
  (37) and `3/8" MC connector` (36). No run type.
- **Could price wrong:** P1 anti-short is a guessed box of 25 (Platt sells
  100s), 3/8" MC connector a guessed box of 25; P2 set-screw splices a
  box of 100 and the 2" SE connector (PG3, CW3) a box of 25 though sold
  each; P3 1-hole lugs with no stud size (PG15, PG16). The wire nut's
  guessed box of 100 happens to be right.
- **C1:** the crimp lug descriptions contradict their names.
- **Missing:** M1 `#6 copper compression lug, 2-hole, 1/4" stud` (COMMON,
  Platt).
- **Owner questions:** Q1–Q9. No starter edit proposed.

**Next shelf in app order: Strut & Supports (from row 1519).**

## 2026-10-14, latest — Life Safety answers, Low Voltage review

**Life Safety: Q1–Q13 all YES as suggested** (`pricing/life-safety-name-
review.md` "Owner's answers"), for A's end-of-pricing job, nothing applied.
That includes **Q12, the one starter edit: CS14's `Relay module, smoke
alarm` line becomes M1 `Duct detector sampling tube, 2-4 ft duct`, x1**,
and **all four missing rows**: M1 sampling tube, M2 `Duct detector remote
test station`, M3 `Magnetic door holder, 24V`, M4 `Hardwired heat alarm,
120V`. Q9 moves the exit combo to Lighting Hardware. Expected counts for
A's before-and-after: Life Safety **26 → 29**, Lighting Hardware **+1** —
if either differs, stop and find out why.

**`pricing/low-voltage-name-review.md`** — rows 1353–1421, 69 rows, fresh
workbook copy; the sheet matches `BASELINE_MATERIALS` one for one.
Read-only.

- **Counts:** 18 decided (the cable names frozen 2026-10-07), 31 OK, 14
  need words, 6 owner picks. 28 rows used by starters; no run type.
- **Could price wrong:** P1 `In-ceiling speaker` is `each` / 1 but sold in
  pairs (MS10 would price double); P2 racks, the media enclosure and patch
  panels with no size; P3 one "Landscape light fixture" for four products
  (LT18).
- **Packs:** F connectors (box of 25 from a word; sold in 10s and 50s),
  RJ45 ends (each; sold in 50s), eight low-voltage wall plates (box of 25
  from "plate"; sold each).
- **Missing:** M1 landscape spot light, M2 surface mount data box, M3 LC
  fiber connector, M4 firestop cable pathway.
- **Owner questions:** Q1–Q14. No starter edit proposed. Cable rows get
  descriptions, not renames, so `frozen-names.json` does not move.

**Next shelf in app order: Connectors & Terminations (from row 1422).**

## 2026-10-14, later — 480V YES, Grounding answers, A's three items confirmed, Life Safety review

**Breakers, round 3** (`pricing/breakers-name-review.md` "Owner's answers,
round 3"): **the 480V proposal is YES** — add H1 `30A 3-Pole bolt-on
breaker, 480Y/277V`, H2 `70A 3-Pole bolt-on breaker, 480Y/277V`, H3 `30A
non-fused disconnect, 3-pole, NEMA 1, 600V`; PG16 → H2; MH11 → H1 + H3.
**Owner's condition: A finds a real distributor price for the HU361 (H3)
before applying it** — not eBay, not the NEMA 3R HU361RB. If none is found,
stop and ask. Nothing applied.

**Grounding & Bonding: Q1–Q11 all YES as suggested** (review's "Owner's
answers"). No starter edit; the review's "For A" is the job list.

**A's three items for C (A's `boot-seed-plan.md` § 6, PS-M1..M6 and
PH-M1) — C agrees with all three, two notes:**

1. **`packQty` and `packLabel` = offer; `packPrice` and
   `priceCheckAcceptedAt` = not-editable — AGREE.** Qty and label must move
   together (a label without its qty states a wrong pack — the same
   companion rule as the example tags), so both are offers. `packPrice` and
   `priceCheckAcceptedAt` are company values the seed never carries; a fork
   does not copy a dismissal. **Note 1:** `boot-seed-plan.md` still says
   `packLabel` is "a finding field (stamped)" (§ 6 opening) and "everyone"
   (§ 6 list); A updates both lines to "offer" so the plan says one thing.
   **Note 2:** no `packQty` offer may be generated before § E's 380
   word-guessed packs are relabelled (`pack-label-scan.md` § E), or every
   company is offered the guessed packs — `Dishwasher whip` as a box of 100.
2. **The 3 new material links exempt in `forkableReferences.test.ts` —
   AGREE.** `material_price_history.materialKey` deliberately names the
   shared item (`materialItemKey`), never a fork; `material_price_history.
materialId` and `price_import_rows.materialId` record the row actually
   written. C's plans called that resolver "the row itself", which is the
   same thing as exempt. **Note:** the `why` should say "a record of the row
   written — never re-point it", not "nothing reads it", because the
   history screen will read these.
3. **PH-M1 `unitOfSale` as `enum('each','foot','box')` from
   `MATERIAL_UNITS_OF_SALE` — AGREE.** It is the option C offered; a unit
   added in one place shows as schema drift. Pack wording ("100 ft coil")
   is `packLabel`, never a unit. 0163 is C's SQL word for word, checked
   against `price-history-plan.md` § 6.

(Read from A's checkout `C:\dev\BidPhase`, which was mid-merge — 0157–0163
staged, `CHANGELOG.md` conflicted. Read only; nothing there touched.)

**`pricing/life-safety-name-review.md`** — rows 1327–1352, 26 rows, fresh
workbook copy; the sheet matches `BASELINE_MATERIALS` one for one.
Read-only.

- **Counts:** 9 OK, 12 need words, 5 owner picks. 14 rows used by starters;
  no run type; every row `each` / 1, none on § E.
- **Could price wrong:** P1 CS14 (commercial duct detector) buys the 120V
  house-alarm relay and no sampling tube; P2 "smoke detector" finds both
  the 120V alarm and the system head; P3 panels with no size ($438–$1,444
  for a 5-zone conventional, $961–$979 for a 50-point addressable).
- **Missing:** M1 duct detector sampling tube, M2 duct detector remote test
  station, M3 magnetic door holder, M4 120V heat alarm.
- **Owner questions:** Q1–Q13. **One starter edit proposed (Q12, waits for
  a yes): CS14's relay → M1 sampling tube.** Q9 moves the exit combo to
  Lighting Hardware.

**Next shelf in app order: Low Voltage (from row 1353).**

## 2026-10-14, late — Breakers round 2, Lighting answers, the pack-word list, Grounding & Bonding review

**Breakers, round 2** (`pricing/breakers-name-review.md` "Owner's answers,
round 2"), for A's end-of-pricing job, nothing applied: **the 22 bolt-on
moves YES; M6 `40A 2-Pole bolt-on breaker` YES and CW2 moves to it (23
moves); CS15 stays plug-on.** PG16/MH11: owner said fix them, so the file
now **proposes** H1 `30A 3-Pole bolt-on breaker, 480Y/277V` (EDB34030,
$265–$549), H2 `70A 3-Pole bolt-on breaker, 480Y/277V` (EDB34070,
$329–$360), H3 `30A non-fused disconnect, 3-pole, NEMA 1, 600V` (HU361,
heavy duty; no distributor price found) and the moves PG16 → H2, MH11 → H1

- H3. **That part waits for the owner's yes.**

**Lighting Hardware: Q1–Q14 all yes as suggested** (Q3 a description, not
lumens; Q11 A checks first). Recorded in the review's "Owner's answers".
**The job's starter edits: LT23 and LT26 to the 6 ft whip** (Q12).

**`pricing/pack-label-scan.md` § E — every row whose pack came from a word
in its name**, as the owner asked: **380 box packs** (84 box of 100, 18 box
of 10, 278 box of 25) and **47 per-foot rows made a 10 ft stick**, each with
its row, the word, what the sheet holds now and column I. **4 have a typed
price, all on packs the owner had already overwritten** (752; flex 154, 155,
160). 7 marked ACCIDENTAL — **`Dishwasher whip` (RS4) is a "box of 100" from
"washer"**, `Screwless wall plate` from "screw", and the five lighting rows.

**For A — owner, 2026-10-14: change `pricing/buildStarterSheets.mts` (and
`packFor` in `pricing/starterSheetLayout.ts`) so the sheet NEVER guesses a
pack from words in the name.** Packs come from a value written per row; a row
without one is `each` / 1 and the build lists it. Add a test that fails if
`packFor` guesses. Relabel § E in the same pass as A–D, before more prices
are typed. Details in § E "for A".

**`pricing/grounding-bonding-name-review.md`** — rows 1308–1326, 19 rows,
workbook read from a fresh copy; the sheet matches `BASELINE_MATERIALS` one
for one. Read-only.

- **Counts:** 5 OK, 1 decided, 10 need words, 3 owner picks. 6 rows used by
  starters; no run type.
- **Could price wrong:** P1 the rod clamp (10 starters) and pipe clamp (5)
  are "box of 25" from the word "clamp"; P2 rods don't say copper-bonded or
  galvanized; P3 an unnamed exothermic mold ($342–$432, one connection each).
- **Missing:** M1 exothermic mold handle clamp.
- **Owner questions:** Q1–Q11. No starter edit proposed.

**Next shelf in app order: Life Safety (from row 1327).**

## 2026-10-14, night — Breakers answers recorded; Lighting Hardware name review

**Breakers, owner's answers** (`pricing/breakers-name-review.md` "Owner's
answers"), for A's end-of-pricing job: **Q1 and Q3–Q8 yes, as suggested;
Q9 waits for the brand-variants pass; Q2 yes** (add M1–M5 bolt-on; the
existing rows become plug-on only, "bolt on" moves to M1–M5) **plus a
starter list the owner asked for.** Nothing applied.

- **The list (waits for the owner's yes, like the 4" box supports):** of the
  64 starters that use a breaker row, the 26 `commercial` ones were read;
  **22 move** to a bolt-on row (9 to M1, 4 to M2, 5 to M3, 3 to M4, PG15 to
  M5), each with its row now, its bolt-on row and the price change from one
  supply house (+$21.39 / +$46.22 / +$46.22 / +$173.44 / −$4.07 per
  breaker). `both` and `residential` starters stay plug-on.
- **4 do not move:** CW2 (40A; suggested new M6 `40A 2-Pole bolt-on
breaker`), CS15 (shunt-trip stays plug-in), **PG16 and MH11 feed 480V
  loads from 120/240V breakers** — and MH11's disconnect is a 240V switch.
  A new question, raised in the file; nothing changes until answered.

**`pricing/lighting-hardware-name-review.md`** — rows 1149–1307, 159 rows,
workbook read from a fresh copy; the sheet matches `BASELINE_MATERIALS` one
for one. Read-only.

- **Counts:** 93 OK, 27 decided (wafer/disc/retrofit sizes; tape channel),
  8 need words, 31 owner picks. 58 rows used by starters; no run type.
- **Could price wrong:** P1 five rows got a box pack by accident from
  `packFor`'s word rules (`pricing/starterSheetLayout.ts` 448/459) — **the
  pole anchor bolt kit (3 starters) is "box of 100", so a ~$107 set prices
  at ~$1**; P2 high bay and area light have no wattage ($123 vs $230); P3 a
  bollard and an EV pedestal priced on a 20 ft pole's footing and bolts; P4
  GC4's remote head has nothing to run it.
- **Same pack fault on later shelves:** `Furniture feed connector` (1666),
  `Strut wing connector` (1557), `2" SE cable connector` (1494).
- **No 8 ft prefab fixture whip found** (all 6 ft) — LT23/LT26 use one; Q12.
- **Missing:** M1 `Pole anchor bolt kit, 1" x 36", set of 4` for the 30 ft
  pole.
- **Owner questions:** Q1–Q14. Starter edits only if Q12 is yes (LT23, LT26
  to the 6 ft whip).

**Next shelf in app order: Grounding & Bonding (from row 1308).**

## 2026-10-14, evening — Panels answers recorded; Breakers name review

**Panels, owner's answers** (`pricing/panels-name-review.md` "Owner's
answers"), for A's end-of-pricing job: **Q1–Q10 all yes, as suggested.**
Names carry the words; S1–S3 search-word fixes; pole count on every
disconnect (2-pole), plus 3-pole fused 100A/200A in NEMA 1 and 3R (4 new
rows); **PG17 → `100A fused disconnect, 3-pole, NEMA 1, 240V`, keeping its
3 fuses — the job's one starter edit**; generator-ready, 400A, meter
center (125A per position), meter-main (8-space outdoor), panelboard
interior (225A) renamed; panel parts generic with descriptions; M1 60A
fused pullout added. Nothing applied.

**`pricing/breakers-name-review.md`** — rows 1068–1148, 81 rows, workbook
read from a fresh copy; the sheet matches `BASELINE_MATERIALS` one for one.
Read-only.

- **Counts:** 65 OK, 8 decided (half-size, names frozen), 3 need words
  (125–200A 3-pole → molded-case), 5 owner picks (accessories). 18 rows used
  by starters; no run type.
- **Could price wrong:** P1 plug-on and bolt-on are one row, and its search
  words say both — commercial starters price panelboard breakers at
  load-center prices; P2 125–200A 3-pole are ~$475–$525 frame breakers, not
  plug-ons; P3 back-fed main kit plus a hold-down kit, twice.
- **No US listing found for a 1/2-inch half-size breaker**, so Q4 asks A to
  confirm the 2-pole 40A/50A half-size rows before pricing (names stay).
- **Missing:** M1–M5 bolt-on breakers (20A 1-Pole, 20A/30A 2-Pole, 30A/100A
  3-Pole).
- **Owner questions:** Q1–Q9. No starter edit proposed.

**Next shelf in app order: Lighting Hardware (from row 1149).**

## 2026-10-14, later — price history: owner's answers recorded

**`references/price-history-plan.md` § 9: Q1–Q8 all yes, as suggested.**
Recording ships in the same release as PS-M1..M6, with PH-M1 right behind
them; the screen comes in a later release. Example-price changes are shown only while the
shop uses the shipped price; bid-line prices are not recorded; kept
forever; labor later in its own table; anyone who sees Materials sees it;
"last changed … before history was kept" shown; one history per item
with a supplier filter. Nothing built.

**For A:** PH-M1 (§ 6) is a confirmed part of the PS-M1..M6 release, queued
directly after PS-M6.

**Panels review (`pricing/panels-name-review.md`) Q1–Q10 shown to the
owner again; still waiting for answers.**

## 2026-10-14, after the restart — PRICE HISTORY plan (plan only)

Items 1–4 of the restart prompt were already in `4eaa756e` (Service Entrance
answers, Wire & Cable skipped, Panels review, the Example-tag QUEUED entry);
nothing was redone.

**`references/price-history-plan.md`** — plan only, no code, no migration.

- **One insert-only table, `material_price_history`** (PH-M1, SQL draft in
  § 6, for A, **queued after PS-M1..M6**): per change of a company's price —
  per-unit price and the one before, unit, pack qty/label/price, supplier
  text, sheet date, who (the person), how (`typed` · `imported` ·
  `import_undone` · `starter_accepted`), Example tag. Keyed on
  `materialItemKey`, so a fork never splits an item's history.
- **One door:** `db.updateMaterial`/`createMaterial` take a price only with
  a `priceWhy` (union type), record in the same transaction, only when the
  number changed. A source-scan test goes red on a price write elsewhere.
- **Shipped prices are not copied:** their history is `starter_changes`,
  read as "BidRidge example price". Accept (not built) records
  `starter_accepted` — waits on `c6d80249` like the QUEUED item.
- **View-only, never read by pricing; bid-line prices not recorded.**
  PH-M2 (`supplierId`) waits for multi-supplier's `suppliers`.
- **Owner questions Q1–Q8** with suggested answers. Q1 is the urgent one:
  ship recording with PS-M1..M6, screen after, because nothing can be
  backfilled.
- Cross-referenced from `multi-supplier-plan.md` § 6 and
  `pricing-safety-plan.md` § 6.

## 2026-10-14, latest — Service Entrance answers recorded; Panels name review; one item QUEUED

**Service Entrance, owner's answers**
(`pricing/service-entrance-name-review.md` "Owner's answers"), for A's
end-of-pricing job: **Q1–Q8 all yes, as suggested.** Names carry the missing
words (old names stay search words); one SE cable cap, 1/0–4/0; SE elbows
1-1/4", 1-1/2", 2" aluminum SLB (the old name is a search word on 2");
generic bonding jumper kit with the suggested description; `Meter sealing
ring, ring-type socket`; the adapter ring retired (hidden); `Ground rod
inspection well, 10", HDPE`; M1 sill plate and M2 SE strap added. **No
starter edit.** Nothing applied.

**Wire & Cable: no name review** (owner, 2026-10-14). Its names were frozen
2026-10-07 and SER has its own plan.

**`pricing/panels-name-review.md`** — rows 965–1067, 103 rows, workbook read
from a fresh copy; the sheet matches `BASELINE_MATERIALS` one for one.
Read-only.

- **Counts:** 74 OK, 1 decided (400A meter base = CL320), 21 need words, 7
  owner picks. 21 rows used by starters; no run type.
- **Could price wrong:** P1 `400A main panel, 42-space` is a $5,700–$7,100
  commercial load center; P2 "heavy duty" search word on every 240V
  (general duty) switch; P3 no pole count on any disconnect, so PG17's 3
  fuses imply a 3-pole switch the row does not name; P4 panel covers $40 or
  $800; P5 meter centers with no rating per position; P6 an unsized
  panelboard interior.
- **Search-word/description gaps (S1–S3):** 12 older main-breaker rows lack
  the NEMA words, 6 main-lug rows lack the "Main-lug only" description.
- **Missing:** M1, a 60A fused pullout disconnect.
- **Owner questions:** Q1–Q10, each with a suggested answer. Q3 (pole
  count) would make PG17 the job's one starter edit.

**Next shelf in app order: Breakers (from row 1068).**

### MOVED TO TRACK B (owner, 2026-10-14) — `applyStarterChange` writes the "Example" tag

**Track C does not build this.** B owns the whole starter-offers build, this
rule included; the text below stays as the spec C handed over.

When a starter change sets a price, hours or a rate, `applyStarterChange`
writes the matching "Example" tag **in the same change**:
`materials.isExamplePrice` / `isExampleLaborHours`,
`labor_rates.isExampleRate`, `assemblies.isExampleHours`, and the steps'
`isExampleMinutes` (`drizzle/schema.ts`; `shared/exampleTags.ts`), so a changed
starter number is never shown untagged. **Build it only after A's boot
change (`c6d80249`) lands on local-dev and track-c has merged it**, because
A's `starterDrift` calls `applyStarterChange`; building it first means two
versions of the same function to reconcile.

## (newest) 2026-10-14, later — Wall Plates answers recorded; Service Entrance review; Gate green on b11abf2e

**Gate for the local-dev push of `b11abf2e`** (run 38511437076, attempt 2;
attempt 1 died on a Docker pull before any test): test ✓, deploy-staging ✓,
**smoke ✓ 96 passed / 2 skipped**, step 10 green. Staging `/api/version`:
`commit b11abf2e`, built 2026-10-14 04:39:54Z. So F13 and
`applyStarterChange` are on staging (not live).

**Wall Plates & Misc, owner's answers** (review's "Owner's answers"), for
A's end-of-pricing job: **Q1–Q10 all yes, as suggested.**

- Q2 retires six generic plates (map in the table).
- Q5 relabels stainless, midway, oversized, 3- to 6-gang and screwless
  plates to `each` / 1.
- Q7 retires the stainless flip cover into the die-cast extra-duty in-use
  cover.
- Q10 adds M1 and moves LT17 to it. **That is the job's one starter edit.**

**`pricing/service-entrance-name-review.md`** — rows 955–964, 10 rows,
workbook read from a fresh copy. Read-only.

- **Counts:** 1 OK (mast guy kit), 3 need words, 2 owner picks, 1 two
  products in one row ("Meter seal": an $18 sealing ring vs the utility's
  tag), 3 decided (the masts, already retiring into rigid).
- **No starter or run type uses the shelf.**
- **Could price wrong:** a ground rod well at $11 (valve box) vs $100–140;
  an SE elbow at $23 (1/2") vs $245 (2") with no size; the meter seal; the
  SE cap priced from HD's conduit "SE cap".
- **Missing:** M1, an SE cable sill plate; M2, an SE cable strap.
- **Owner questions:** Q1–Q8.

**Next shelf in app order: Panels (965–1067).** Note: **Wire & Cable (rows
3–117) has never had a name review.** The reviews began at Conduit. Its
names were frozen in the 2026-10-07 rename, and SER has its own plan
(`references/ser-rename-plan.md`), so it may not need one. Say so if it
does.

## (newest) 2026-10-14 — Wall Plates & Misc name review; C's databases made exact; Gate for b11abf2e

**`pricing/wallplates-misc-name-review.md`** — spreadsheet rows 862–954, 93
rows, read from a fresh copy of the workbook. Read-only.

- **Counts:** 74 OK (the 2026-10-08 cover family is sound, and every
  starter's plate matches its device), 11 need words, 8 owner picks.
- **Could price wrong:**
  - P1: every plate is `box of 25`, but stainless, midway, oversized and
    3/4-gang plates are sold each, so a typed price comes out 1/25 of cost.
  - P2: stainless grade, 430 $1.01 vs 302 $2.91.
  - P3: the in-use covers on DV8, LT17, MH6 and PG20 do not say
    "extra-duty", which NEC 406.9(B)(1) requires for 15/20A in a wet
    location.
  - P4: six generic plate rows duplicate family rows.
  - P5: the screwless plate is about 10x a standard one.
  - P6: Device shim is `each`, but it is sold in 5/25/100 (for the pack
    scan).
  - P7: the panel filler plate fits one panel family.
- **Missing:** M1, a deep in-use cover (for LT17's transformer plug); M2, a
  GFCI/decorator flip cover.
- **Owner questions:** Q1–Q10, each with a suggested answer.

**Next shelf: Service Entrance (from row 955).**

**C's databases now match the Gate's** (`schemaDrift.mts`: matches,
196/196 on both).

- **`bidrender_test_c` was rebuilt the Gate's way:** DROP; CREATE
  `utf8mb4_unicode_ci`; `scripts/migrate.mts` (157 applied);
  `scripts/seedBaseline.mts` (1,717 materials, 24 run types). DV33 is clean:
  `starterAssembliesSeed.test.ts` passes, along with
  `starterChanges` and `lockedWarningsFrozen` (29/29).
- **`bidrender_local_c` was fixed IN PLACE, not rebuilt**, because it holds
  the 4,237 bids `bidTotals` measures and the "Bar layout check" fixture.
  The drift script's own statements were applied: 3 collation `CONVERT`s
  and 5 FKs. `bidTotals`: all 4,237 unchanged.
- **One of the drift script's suggestions cannot run.**
  `project_assembly_items_projectAssemblyId_project_assemblies_id_fk` is 66
  characters, so MySQL refuses it (`ER_TOO_LONG_IDENT`). Migration 0004
  names it `project_assembly_items_projectAssemblyId_fk`, and that name
  worked. That is a small fault in `scripts/schemaDrift.mts`'s suggested
  SQL, for whoever next touches it.

## FROM THE OWNER (2026-10-14, via Track B) — STARTER OFFERS MOVED TO B

**Track B now builds the whole starter-offers feature**
(`references/starter-offers-plan.md`), including the parts that plan and
`baseline-screen-plan.md` § 10a marked C: the Example-tag companion in
`applyStarterChange`, the offer read (with B's per-field fix to § 10a.3,
plan § 3a), Accept/Ignore, `recountsDrafts` and the draft count. **C stays
on catalog reviews.** Do not start any of those; B will touch
`server/starterChanges.ts` and `shared/starterChange.ts`, so say so in your
handoff before editing either. The owner answered that plan's Q1–Q7: all
yes, as suggested.

## FROM TRACK A (2026-10-14) — PS-M1..M6 = 0157–0162, PH-M1 = 0163, on local-dev + STAGING DB

Built word for word, on `origin/local-dev` as `656b0fb8`, and applied to
the **staging DB** (164, 205/205) before that push; not on live (152).
Merge local-dev and migrate your DBs to 164 before building on them. Three
calls A made for you to confirm or overturn:

1. `STARTER_FIELDS.materials`: `packQty`, `packLabel` = **offer**;
   `packPrice`, `priceCheckAcceptedAt` = **not-editable** (step 6 seeding).
2. Forkable registry: `price_import_rows.materialId`,
   `material_price_history.materialKey`, `.materialId` = **exempt**.
3. PH-M1 `unitOfSale` = the enum from `MATERIAL_UNITS_OF_SALE`, not varchar.

## START HERE (2026-10-13, night) — F13 finished; applyStarterChange built; Switches answers recorded

**State.** track-c merged local-dev at `dc08f1a2` (A's 0152–0156) as
`4ebff8d6`. C's databases migrated: `bidrender_test_c` and
`bidrender_local_c` both record **157**. `schemaDrift.mts`:
**test_c matches, 196/196.** **local_c does NOT**: 191/196 FKs (5 missing,
first `assemblies(laborRateId)`) and 7 columns on `utf8mb4_0900_ai_ci` in
`ai_usage_daily`, `bid_mounting_heights`, `takeoff_mounting_heights`. None
of it is from 0152–0156 (they applied clean); local_c was not built from
migrations. It is C's scratch copy and nothing deploys from it; rebuild it
from migrations if a check ever needs it exact.

**1. Switches answers** — `pricing/switches-name-review.md` "Owner's answers":
Q1–Q11 all yes as suggested. Q3: 829 hidden into 837, "3-way dimmer" kept as
a search word, DV15 moves to 837 (the job's ONE starter edit). Q9: 861
becomes W2 (the cover), old name kept as a search word, moves to Wall Plates
& Misc. Q10: 846 hidden. Q11: W1 and W3 added. Nothing applied; for A's
end-of-pricing job.

**2. F13 — finished** (`734c8258`). A locked bid's server-side warning
counts are frozen at the lock in `bids.lockedWarnings`.

- `db.lockBidQuantities(bidId, at, countWarnings)`: the callback is
  **required**, so no caller can lock without freezing. It runs after the
  quantities are written; its answer goes in the same statement as
  `quantitiesLockedAt`. `unlockBidQuantities` clears both in one statement.
- `server/bidWarnings.ts` is the ONE live computation (`planAttentionFor` +
  `bidDropsNotPriced`) and `lockBid`. The Lock button, `leaveDraft` and
  A's `scripts/freezeSentBids.mts` all lock through `lockBid` (that script
  is A's: its one line changed, same behaviour plus the freeze).
- Readers: `bids.get` (`fromPlans`, `dropsNotPriced`, new
  `warningsFrozenAt`), the quote panel, the proposal
  (`dropsNotPricedShown`), and every list through `dropsNotPricedForBids`,
  which answers a locked-frozen bid from its frozen counts without
  recounting.
- **On screen:** "These warnings are as counted when this bid was locked,
  Oct 13. Unlock it to count them again." under the strip, only when a
  frozen count is showing. **Looked at** on "Bar layout check" at laptop
  (1536x864) and iPad portrait (820x1180): it locked, the note sat under
  the four warnings at both sizes, and Unlock put it back (lock column and
  `lockedWarnings` both NULL again, read back from the row).
- **For B:** `bids.get` has a new field `warningsFrozenAt`; the note is in
  `BidsPage.tsx` beside the strip.
- Bids locked before today have `lockedWarnings` NULL and show live counts
  (never frozen by a read). If A wants them frozen, `freezeSentBids.mts`'s
  lock does it only for bids it locks; an unlock-and-relock freezes any.

**3. applyStarterChange — built** (`1ac7487f`), `server/starterChanges.ts`,
per `baseline-screen-plan.md` § 10a.3.

- **One transaction:** new `db.inOneTransaction(work)`. While it runs,
  `getDb()` hands out the transaction (AsyncLocalStorage), so every
  existing fork function joins it unchanged; an inner `db.transaction`
  nests as a savepoint.
- **Kinds built:** `field`; `part_add` / `part_remove` / `part_field` on
  `assembly_materials` (keyed by material id; line fields qty,
  overrideLaborHours, isBranchWhip, as `assemblyMaterialLine`);
  `part_add` / `part_remove` on `assembly_modifiers`.
- **Refusals** (all listed, whole batch refused): table, row not shared,
  `starterChangeRefusal`, the column's own type and nullability (blank is
  never 0), the sheet's above-zero fields (`ABOVE_ZERO_FIELDS` in
  `shared/starterSheetChecks.ts`: costPerUnit, laborHours,
  fieldBendLaborHours), references and parts must be shared + active +
  not hidden (`STARTER_REFERENCES`), the same thing twice in one batch.
- **Pins:** every company with no copy is forked as it is now,
  `isPinnedCopy = TRUE`, one `starter_change_pins` row. "Has a copy" is
  the table's own fork function (it returns an existing copy), so the rule
  is not restated; run types reuse only an ACTIVE fork, as `forkRunType`
  already does. An `everyone` field pins nobody.
- **Undo:** `undoStarterChange` (refused "changed again since …" unless
  the row still holds the change's new value) and `undoStarterBatch`
  (`preview: true` writes nothing). Both write a new `undo` batch with
  `undoesChangeId`; pins already made stay.
- **`takeoff_run_types` classified** (`StarterTable` "runTypes"): `label`
  and every part column / count / extra % / makeup are offers, `color` is
  everyone, `pathType` is a UNIT, `trade`/`status`/`archivedAt` app-kept.
  `isActive` moved from the common list to the four tables that have it.
- **Company edits set a pin FALSE:** `updateMaterial`, `updateLaborRate`,
  `updateModifier`, `updateAssembly`, `updateRunType`, and the recipe
  setters (`setAssemblyMaterials` / `Modifiers` / `Steps`, because a
  recipe-only save never calls `updateAssembly`).
- **NOT built yet:** offers / Accept / Ignore, `hideStarterItem`
  (hide / unhide / item_add), run-type EXTRAS (and editing a pin's extras
  does not unpin it yet), kits, labor steps, any router. **Nothing calls
  `applyStarterChange` from a screen.**
- **For A — do not wire a caller on a shared database before the boot
  change (§ 6, F2–F6).** `seedBaselineMaterials` re-stamps shared rows from
  the seed on every start, so a logged change to a seeded field (a price)
  would be written back over by the next boot with no log. Pinned
  companies would keep the old value; everyone else would read the seed's.

**4. A's two guard decisions — CONFIRMED, with one addition.**

- `isPinnedCopy`, `hiddenAt`, `replacedById` as internal (`NOT_EDITABLE_COMMON`):
  **right.** C went one step further: they are now also in
  `LIBRARY_OWNERSHIP_FIELDS` (and `forkRunType`'s exclusions), so a fork
  never COPIES them and a company patch cannot set them. Before this, a
  fork of a hidden shared row would have carried its `hiddenAt` and
  `replacedById` onto the company's copy. Test: "a fork never copies the
  starter's hiding".
- The five `replacedById` as `unreviewed` in `forkableReferences.test.ts`:
  **right, and they stay unreviewed.** Nothing C built today reads or
  writes `replacedById`. They become `resolver` entries when
  `hideStarterItem` and the replacement swap read them.

**Proof**

- **Tests that go red when the guard is removed** (each removed, run, and
  restored; 11 of 11 red): no pin on an offer field (5 fail); no
  transaction (1); refusals ignored (3); a material edit keeps its pin (1);
  a recipe-only save keeps it (1); a fork copies `hiddenAt` (1); the lock
  does not freeze (3); unlock keeps the frozen value (1); the lists ignore
  frozen (1); the proposal reads live (1); the bid page reads live (2).
- **Totals unchanged:** `bidTotals.mts` on `bidrender_local_c`, the
  starting code (`4ebff8d6`, its own worktree) against this code: **all
  4,237 bids, totalDue, not-priced and incomplete unchanged.**
- **Locked bids refuse change:** a locked bid's totals, warnings, drops and
  frozen date read identical across a starter price + hours change and its
  batch undo (`starterChanges.test.ts`, the last test).
- New tests: `starterChanges.test.ts` (11, on its OWN shared probe rows,
  deleted with every copy at the end), `lockedWarningsFrozen.test.ts` (4),
  `frozenWarnings.test.ts` (2); `starterChange.test.ts` now checks run
  types' columns too. `pnpm check` clean. On `bidrender_test_c`: 175 files,
  **2,212 passed, 1 skipped, 1 failed** — the one below.
- **Not caused here, found on the way:** `starterAssembliesSeed.test.ts`
  "gets every starter…" fails on `bidrender_test_c` (DV33 holds the retired
  "Floor box cover", 1605, not "Floor box cover, duplex"). It fails
  identically on the starting code, so it is that database's state; the
  Gate runs on a fresh one.

## (earlier) 2026-10-13 — Receptacles answers recorded; Switches name review; nothing applied

**Receptacles, owner's answers** (review's "Owner's answers" section), for
A's end-of-pricing job: **Q1–Q13 all yes, as suggested.**

- Q5: two duplexes. DV11 takes 2 × `duplex-receptacle`; the quad rows
  (816, 817) are hidden; "quad", "fourplex" and "4-plex" become search words
  on the duplex rows.
- Q9: countertop 20A TR duplex stainless; floor 15A TR duplex wood floor;
  815 loses "countertop"/"island".
- Q11: R3 (30A locking raised cover) for CS7/CS8, **after A checks** whether
  the L5-20 (CS6) and 6-30R fit the single-receptacle cover.
- Q12: R1, R2 and R3 are all added.
- **Starter edits in that job:** DV3 (Q13), DV11 (Q5), RS13 (Q6), CS7 and CS8
  (Q11).

**`pricing/switches-name-review.md`** — rows 828–861, 34 rows. Workbook read
from a fresh copy.

- **Counts:** 5 OK, 27 need words, 1 owner pick (low-voltage momentary), 1
  not a real product ("Weatherproof toggle switch" — it is a standard toggle
  plus a lever cover).
- **Could price wrong:** P1 "Dimmer" and "3-way dimmer" are one LED product
  ($33), and a rotary ($17) does not fit DV5's plate; P2 timer switch $39
  spring-wound vs $74–$110 programmable vs countdown (DV19); P3 the ceiling
  sensor row names both kinds, DV30 prices the low-voltage one ($184 vs
  $118); P4 toggle rows carry "rocker decora" search words (8 starters, all
  toggle plates); P5 "commercial spec grade" on the 20A rows is two grades.
- **Missing:** W1 decorator 15A single-pole and 3-way, W2 weatherproof toggle
  switch cover, W3 20A double-pole switch.
- **Owner questions:** Q1–Q11, each with a suggested answer.

**Next shelf: Wall Plates & Misc (862–954).**

## (newest) 2026-10-13 — Underground + pack-scan answers recorded; Receptacles name review; nothing applied

**Underground, owner's answers** (review's "Owner's answers" section), for
A's end-of-pricing job:

- **Q1:** names. The warning tape is renamed in the SAME commit as its 18
  run types (`WARNING_TAPE.materialName`).
- **Q2–Q9:** yes, as suggested. Q3: per foot, labelled with the real reel
  (3000 ft, 1000 ft, 500 ft, 1000 ft). Q8: "trench marker post" stays a
  search word.
- **Q10:** add U1, U2 (detectable tape, its own optional row) and U3.

**Pack scan, owner's picks** (`pack-label-scan.md` "Owner's answers"): T8
tubes case of 25; spade terminals bag of 100; tape light channel 1 m (3.3 ft),
each; surface raceway 10 ft lengths for 500/700, 5 ft for 2400. **A relabels
every row in the scan in ONE pass, before the owner types those prices.** The
2400 5 ft length sits on top of surface raceway Q6 (still per foot, base plus
cover); its description changes to say a 5 ft price.

**`pricing/receptacles-name-review.md`** — rows 788–827, 40 rows, the shelf
after Boxes. Workbook read from a fresh copy.

- **Counts:** 10 OK, 27 need words, 2 owner picks (quads), 1 two-in-one
  (floor receptacle assembly).
- **Could price wrong:** P1 DV11 prices one quad device ($32) where DV22
  prices two duplexes; P2 the EV starter (RS13) prices a $10 flush 14-50R,
  EV-rated is $70–$126; P3 standard vs decorator is 2× on the two most-used
  rows (18 starters, all on duplex plates); P4 pop-up countertop $50–$300;
  **P5 CS7/CS8 (30A locking) use the 15/20A single-receptacle cover**, and a
  30A locking device needs the 1.719" opening (Raco 811C) — a Boxes-shelf
  row A's review did not raise; P6 DV3 "Dedicated 20A receptacle" prices the
  15A duplex.
- **Missing:** R1 decorator TR duplexes, R2 industrial 14-50R (EV), R3 30A
  locking raised cover.
- **Owner questions:** Q1–Q13, each with a suggested answer.

**Next shelf: Switches (828–861).**

**F13 waits:** when A's handoff says BS-M3..M6 and F13-M1 are on local-dev
and staging, F13 wiring is next (a separate prompt). See START HERE (b).

## (newest) 2026-10-13 — Surface raceway answers recorded; pack-label scan; nothing applied

**Surface raceway, owner's answers, for A's end-of-pricing job.** They are
in the review's "Owner's answers" section.

- **Q1:** names, not descriptions.
- **Q2:** one 500/700 entrance end (code + seed pair) and an offset
  connector.
- **Q3:** carry BOTH 1-gang depths. 644 becomes the 1-3/4" deep box that
  DV34 uses, and a 1-3/8" shallow row is added.
- **Q4:** retire = hide (`isActive = false`), never delete.
- **Q5:** one standard-plate row; the old plate names stay search words.
- **Q6:** 2400D is one per-foot row.
- **Q7:** ivory is the standard.
- **Q8:** add S1–S4.
- **The P1 and P3 packs are not answered;** they are folded into the scan
  below.

**`pricing/pack-label-scan.md`:** every pack-qty-1 row that is really sold
on a reel, roll, length or box, with a listing for each, so A can relabel
them in one pass.

- **Top three:**
  - warning tape: 18 run types, 1000 ft roll;
  - grounding pigtail: 15 starters, bag of 50;
  - 12 ga hanger wire: 7 starters, bundle of 100 × 12 ft, NOT the 100 ft
    roll.
- **Also wrong:** tracer wire's roll is 500 ft, not 250.
- **Waiting on owner picks:** the T8 tube case, the spade terminals, the
  tape channel and the surface raceway lengths.
- **What was read:** the search scope is stated in the file. The 1,145
  `each` rows were filtered by name, not read one by one.

## (newest) 2026-10-13 — mast answer recorded; Surface raceway name review; nothing applied

**Mast answer, for A's end-of-pricing job.** The owner said yes: the
2-1/2" and 3" `Service mast, …, 10 ft` rows (963, 964) retire into
`2-1/2" rigid conduit` and `3" rigid conduit`, the same way as the 2". Each
old name stays as a search word on its rigid row. It is recorded in
`pricing/conduit-name-review.md` under "Owner's answers", PG2.

**`pricing/surface-raceway-name-review.md`** covers rows 636–659, the next
shelf in app order after Conduit Fittings. It uses the same format.

- **Counts:** 13 OK; 6 need words; 4 are not real products or not Wiremold
  ones (the 2400D divider clip, the end cap, and both device plates, since
  the box takes a standard NEMA plate); 1 row holds two products (2400D
  base + 5 ft cover).
- **Could price wrong:**
  - **P1:** raceway packs say per foot / 1, but HD sells 700WH at $17.25
    per 10 ft. That price typed as a pack gives 10× per foot.
  - **P2:** DV34's box depth is unnamed (V5747 $8.44 vs V5748 $12.73).
  - **P3:** coupling packs say 25; the real pack is 10.
- **Q2 is a code + seed pair:** one V5785 entrance end for 500 and 700
  (`SHARED_500_700_PARTS`).
- **Missing items:** S1–S4 (flush extension adapter, round extension box,
  blank cover, and the 2400D coupling).
- **Owner questions:** Q1–Q8, each with a suggested answer.

The workbook was read from a copy. **Next shelf: Underground (660–669).**

**Underground, done the same day: `pricing/underground-name-review.md`.**

- **Counts:** 10 rows; 1 OK, 9 need words. None is a non-product.
- **For A first (U-A):** the sheet's `usedBy`
  (`pricing/starterSheetLayout.ts`) ignores run-type EXTRAS. So
  `Underground warning tape` reads "Not in an assembly" and sorts last,
  although all 18 shipped underground types price it.
- **The tape's name is matched exactly by `WARNING_TAPE` (U-B),** so a
  rename is a seed + run-type pair.
- **P1, could price wrong:** the four reel items (mule tape, pull rope,
  tracer wire, warning tape) say per foot / 1. A reel price typed as the
  pack prices each foot at the whole reel. The tracer label says 250 ft;
  the roll is 500 ft.
- **P2:** the handhole is box + cover, about $490 together at Platt.
- **Missing items:** U1 intermediate spacers, U2 detectable tape (optional)
  and U3 PVC conduit end caps.
- **Owner questions:** Q1–Q10, each with a suggested answer.

**Next shelf after Underground: Boxes is done (A); then Receptacles
(788–827).**

## (newest) 2026-10-12 — Conduit name review for the owner; nothing applied

`pricing/conduit-name-review.md`, in the same format as A's Boxes review.
It covers rows 118–635 (Conduit + Conduit Fittings, 518 rows): 349 are OK
and 169 need a word or two. No row is a non-product, and none is two
products in one.

- **Weightiest:** liquidtight connector (10 starters), flex connector and
  flex conduit (5 each), raintight EMT connector (4).
- **Missing items:** 6, X1–X6 (nipples, chase nipples, watertight hubs, PVC
  end bells, the 3/8" FMC connector, larger EMT two-hole straps).
- **Owner questions:** Q1–Q6.
- **For A:**
  - Most of these names are BUILT by `shared/runFittingMaterials.ts`. A
    rename there is a code + seed pair; Q5 suggests the description route.
  - Flex pack labels say "10 ft stick" on coils (rows 156–159, 161–164).
  - PG2 may double-count the 2" rigid coupling.

Workbook read from a copy only. Waits for A's end-of-pricing job and the
owner's answers.

**Owner's answers, same day: all recorded in the review's "Owner's answers"
section. A's end-of-pricing job applies them; nothing is applied on
track-c.**

- **Q1–Q4:**
  - Q1: zinc die-cast for EMT set-screw and compression.
  - Q2: malleable iron, Form 7, for rigid conduit bodies.
  - Q3: squeeze flex connectors.
  - Q4: clamp-on weatherheads.
- **Q5: the missing words go in DESCRIPTIONS, not names.** No renames and no
  `runFittingMaterials.ts` change.
- **Q6:** 8" travel only.
- **Other answers:** flex is steel; the raintight connector is insulated; the
  liquidtight connector is straight, insulated, steel.
- **Search words:** "set screw connector", "Form 7", "squeeze connector",
  "entrance cap", "service head".
- **PG2:** drop the 2" rigid coupling line. `Service mast, 2", 10 ft` retires
  into `2" rigid conduit`, with its old name kept as a search word.
- **Add all 6 missing items (X1–X6).**
- **Flex rows 156–159 and 161–164 get coil packs;** the owner leaves them
  blank until then.

## (newest) 2026-10-12 — step-times DRAFT for the owner; nothing built

`references/step-times-draft.md`: minutes for the 47 steps already in the
app (two rounded up from the sheet's Draft: S16 8→10, S44 15→20), 62 NEW
steps S48–S109, and step lists + totals for Track B's top 30 residential
and top 30 commercial (30 of the 60 already have lists in the app). Every
step says what it assumes; unsure ones are ⚑ and rounded up. No published
table used. **Later, for C:** add S48–S109 and the 30 new lists to
`server/seed/starterLaborSteps.ts` (all not set) once local-dev unfreezes;
A rebuilds the sheet. The workbook was only read, from a copy.

## (newest) 2026-10-12 — pricing-safety PLAN written; nothing built, nothing merged

`references/pricing-safety-plan.md` covers todo.md "Before beta: wrong
numbers on bids": pack price + pack qty entry, per M / per C import with
preview and undo, and the sanity warning. **For A: SQL drafts PS-M1–M6**
(§ 6, all additive, step 1). **For the owner: Q1–Q10** (§ 8). Pointers added
in multi-supplier § 4.4 / § 4.5 / § 6 and material-markup D3. **Live fault
found:** the price parser drops "/M" and "/C" today, and a test pins it
(plan § 1.1). **Q1–Q10 all approved as picked (owner, same day).** A is
hiding the import button on local-dev (Q10). Build waits on A's columns
and, for the UOM reading and the threshold measurement, the Platt export
the owner is getting (Q4). Do not build or merge until told.

## START HERE (2026-10-13) — panel-label offer built; F13 rule built, WIRING WAITS ON ONE COLUMN FROM A; NOT merged (live release first)

**Owner: build on track-c, do not merge; the live release goes first.**
Track-c has local-dev merged in at `00a2702` (A's `applyMathVersion.mts` and
`freezeSentBids.mts` came with it). Actions run 38324733231 (`9291c70`):
attempt 2 was in progress past the image pull when checked. See the end of
the session for its result.

**(a) Panel-label fill is a one-tap offer (the Q19 rule).**

- The page no longer places a "PANEL 2B"-labelled panel while showing the
  sheet. `labelPanelsToAssign` (`client/src/lib/homerunSync.ts`) lists
  label-found panels with NO saved spot.
- **"Assign N panels from labels"** on the Plans toolbar, beside the homerun
  offer, places them. It is hidden on a locked bid.
- `homeruns.placePanel` takes **`by: "hand" | "label"`, required with no
  default**, so a call that does not say is refused. Both page callers
  failed the typecheck until they said.
- **Seen:** laptop, iPad portrait and landscape, on the scratch bid's E111
  with panel 2B's spot cleared for the check. **Viewing left the spot empty
  in the database at all three sizes.**
- ~~The button itself was NOT seen.~~ **Seen 2026-10-13**, on a throwaway
  one-sheet plan built for the check: a "PANEL 2B" label and three duplexes
  tagged 2B-1/3/5, scale 1/4". Run as a throwaway Playwright script at
  laptop (1536x864), iPad landscape (1180x820) and iPad portrait (820x1180),
  with the iPad sizes tapped by touch, one throwaway bid per size. At each
  size, **viewing** showed "Add 3 new homerun circuits" and "Assign 1 panel
  from labels". It left the panel with no row, added no circuits and moved
  no bid total. **The Add tap** put 3 circuits on the bid, with panel 2B
  made but given no spot. **The Assign tap** gave 2B a spot at its label and
  removed the offer. **A second visit** moved nothing and offered nothing.
  All three sizes ended on the same 226.62 ft of homerun conduit and labor
  and the same bid totals. Those were $0 because the homerun type was never
  sent: the check is that the numbers matched, not that they were priced.
  The bids (deleted forever, plan files with them) and the script are gone.
  Before that the button was only reasoned about: E111's 2B was placed by
  hand, and a label wins over a hand spot (`circuitGroups` `spotOf`).

**(b) F13: a locked bid's warning counts frozen at the lock.**

- **Which counts:** the SERVER-side ones that read the library live on a
  locked bid. These are `dropsNotPriced` (assembly mount type, company
  heights) and `planAttentionFor` (counts not sent, counted with no price,
  double-counted, runs with no wire, runs not on the bid). The bid screen's
  line-derived strips read frozen line snapshots and already hold still.
- **Built:** `shared/lockedWarnings.ts`, the rule:
  - `freezeAt(counts, at)` returns a deep copy;
  - `shownWarningCounts(bid, live)` gives frozen when locked with a frozen
    value, live when unlocked, and live for a bid locked before freezing
    existed (never frozen by a read).
  - Tests: `server/lockedWarnings.test.ts` (5).
- **NOT wired, because it needs a column and C cannot add one.** The
  drizzle-guard fails a track branch on any `drizzle/` change, the schema
  declaration included. **For A, F13-M1** (additive, step 1, nullable, step
  3 empty; nothing reads it until C wires it):

  ```sql
  -- F13-M1: a locked bid's server-side warning counts, frozen at the lock
  -- (shared/lockedWarnings.ts FrozenWarnings: {at, counts}). NULL = never
  -- frozen: unlocked, or locked before this column — both show live counts.
  ALTER TABLE `bids` ADD `lockedWarnings` json NULL;
  ```

- **C's wiring once it exists** (three call sites, one commit):
  1. `db.lockBidQuantities` (the button AND `leaveDraft`) computes the live
     counts and writes `freezeAt(...)`.
  2. `db.unlockBidQuantities` writes NULL.
  3. `bids.get`, the proposal, the quote panel and the dashboard cards
     (`dropsNotPricedForBids`) read through `shownWarningCounts`. The strip
     then says "as at lock, Oct 12".
- A's `freezeSentBids.mts` may want to fill it for bids already locked. That
  is a write of the values in effect, so no number moves.

**Proof**

- **bidTotals:** 4,237 / 4,237 Total due unchanged, against a fresh
  measurement taken on this session's starting code (`before4`).
- **8 guards each red when removed:** `by` required; only label spots
  offered; a saved spot never offered; offer hidden at 0; locked shows
  frozen; unlocked shows live; frozen is a copy; a foreign value is ignored.
- 5 changed test files, 68 tests, green; `pnpm check` is clean.

## EARLIER (2026-10-12, late night) — F11 and F12 built on track-c, NOT merged (waits for the owner's go)

**Owner, this session:** both § 10a.5 picks are APPROVED and recorded in
`baseline-screen-plan.md` § 10a.5: the Accept button warns "N draft bids
use this and will re-count", and kits and labor steps stay outside offers
for now. **A applies BS-M3 – M6 after the live release.** F13 waits for a
design call.

**F11: new homerun circuits are a one-tap offer, never added by viewing
(Q19).**

- `homeruns.syncSheet` gained **`create`, REQUIRED with no default**, so no
  caller creates by omission. Both page callers failed the typecheck until
  they said which.
- With `create: false` (the visit, and Re-match) the bid gets no circuit and
  no panel. The call returns `waiting`, the count of circuits the bid lacks.
- The page keeps `waiting` per sheet and shows **"Add N new homerun
  circuits"** on the Plans toolbar, beside Circuits and not inside it, so a
  hidden offer cannot quietly leave feet off. The tap sends `create: true`.
  The offer is hidden on a locked bid.
- Tests: `homerunsRouter.test.ts` gains "a sheet visit adds nothing; the
  offer adds" (3 tests). The 15 existing calls say `create: true`.
  `homerunSync.test.ts` pins the wording.

**F12: "Part changed — Send again" on a run line.**

- The decision is NOT re-made on the bid screen. `bridgeForBid` (the Plans
  screen's query) already carries Send again's plan per line
  (`resendPlans`). `client/src/lib/partChanged.ts` only matches its SWAPS to
  bid lines by run type and slot.
- The bid screen reads it only when the bid has a run line, and its refresh
  helper invalidates it.
- Each line says "Part changed: set-screw coupling → compression coupling, 10. Still priced at the old part — press Send again on the Plans screen",
  and the warning strip counts the lines. Nothing re-prices: R4 holds.
- Tests: `partChanged.test.ts` (3).

**Proof**

- **bidTotals:** 4,237 / 4,237 Total due unchanged against the measurement
  taken before ALL of 2026-10-12's work.
- **Guards** (each red with it removed, file restored byte-for-byte):
  - visit creates no circuit;
  - visit creates no panel;
  - `create` is required;
  - offer hidden at 0;
  - archived line ignored;
  - matched by extra.

  **One is not an independent guard:** F12's "swaps only" check. A refill
  plan carries no `text`, so the `if (text)` filter excludes it either way.
  It is belt and braces, not a tested guard.

- 5 changed test files, 62 tests, green; `pnpm check` is clean.
- **Looked at: laptop, iPad portrait and iPad landscape**, no sideways
  scroll anywhere.
  - **F12**, on "Bar layout check": user 1's copy (1667) of run type 31 was
    switched to compression for the check. The strip and 2 line notes
    showed: coupling and connector both swap with the style.
  - **F11**, on "Sheet check (Claude, delete me)", sheet E111: 3 circuit
    rows were saved and removed for the check. "Add 3 new homerun circuits"
    showed (44 px on touch), and was gone after the tap.
  - Both fixtures are restored: 38 circuits back by their ids, 1667 back to
    set-screw, shared type 31 untouched.
  - **Found by looking and fixed:** with 2 lines the strip said "the new
    part"; it now says "parts".

**Still writes on a visit, NOT in F11's scope:** a panel found by its
"PANEL 2B" LABEL fills an existing panel's empty spot on view
(`TakeoffPage`, the label `placePanel`). Measured footage can then appear
for circuits already on the bid. It is the same class as F11 and F15;
offering it is the owner's call.

## TO TRACK A — 2026-10-12 (night): your 14 BS-M3–M6 decisions are ANSWERED, final SQL in `baseline-screen-plan.md` § 10a

A's session-36 note (`b90ea3d2`) was on A's local `local-dev` and not yet on
GitHub when this was written, so it is not merged here. The answers cite its
numbers.

**Where:** `baseline-screen-plan.md` § 10a, which **replaces** the BS-M3–M6
table rows, the `eddc870` BS-M3 SQL and the BS-M5 pattern block. § 10a.1
holds the 14 answers, § 10a.2 the hand-written SQL, and § 10a.3 the
`applyStarterChange` spec (stored, pinned, undone, offers).

**The calls, in one line each:**

- **Tables:** five tables: materials, assemblies (with parts), labor rates,
  modifiers, run types. Run-type extras, kits and labor steps wait.
  `targetTable` and `field` are `varchar(64)`, checked in code.
- **Values:** JSON `{"v": …}`, so SQL NULL = n/a and `{"v":null}` = the
  column was NULL.
- **Parts:** one change per part (`part_add` / `part_remove` /
  `part_field`), keyed by the PART id, not the child row.
- **The log is append-only.** An undo is a new change with
  `undoesChangeId`; there is no `undoneByChangeId`.
- **Companies:** keyed by the owner's `users.id` everywhere
  (`companyOwnerUserId`); `starterSeenAt` stays on `companies`. Unique pins
  and answers per change per company. Answers are per change; an undo
  leaves old answers alone.
- **`isPinnedCopy`:** NULL = own copy, TRUE = pin, FALSE = a pin the
  company has since edited. Every company-edit path sets FALSE; C adds that
  with the code.

**A:** number, rehearse and apply them as written. All are step 1, step 3 is
empty, and `bidTotals` should come back identical. **The owner has two
number-facing points in § 10a.5**; neither blocks applying the SQL.

## FROM TRACK A — 2026-10-13 (session 39): BS-M3–M6 and F13-M1 ARE APPLIED — F13 can be finished

Your § 10a.2 SQL and F13-M1, word for word, on `local-dev`, its test DB
and the **staging database** (NOT live — live is 152 and stays there until
the next release). Numbers:

| File                         | Yours  | What                                                          |
| ---------------------------- | ------ | ------------------------------------------------------------- |
| `0152_starter_change_log`    | BS-M3  | `starter_change_batches`, `starter_changes`                   |
| `0153_starter_change_pins`   | BS-M4  | `starter_change_pins`                                         |
| `0154_starter_pinned_hidden` | BS-M5  | `isPinnedCopy`, `hiddenAt`, `replacedById` on the FIVE tables |
| `0155_starter_offer_answers` | BS-M6  | `companies.starterSeenAt`, `starter_offer_answers`            |
| `0156_bid_locked_warnings`   | F13-M1 | `bids.lockedWarnings json NULL`                               |

`drizzle/schema.ts` declares all of it: `starterChangeBatches`,
`starterChanges`, `starterChangePins`, `starterOfferAnswers`,
`bids.lockedWarnings`, `companies.starterSeenAt`, and the three columns on
`materials`, `assemblies`, `laborRates`, `modifiers`, `takeoffRunTypes`.
Expect **157 migrations, 196/196 FKs** — if a database you test on prints
anything else, stop and find out why before going on.

**What you can do now:**

1. **Merge `local-dev` into `track-c`**, then migrate `bidrender_test_c`
   (and `bidrender_local_c` if you run on it) with `scripts/migrate.mts`;
   `schemaDrift.mts` should say "matches", 196/196.
2. **F13 can be finished**: the three call sites in your F13 note
   (`lockBidQuantities` writes `freezeAt(...)`, `unlockBidQuantities` writes
   NULL, the readers go through `shownWarningCounts`). Nothing writes the
   column today, so every bid reads NULL = live counts, as before.
3. **`applyStarterChange`** can be built against real tables.

**Two guards made me decide something on your files — check you agree:**

- `shared/starterChange.ts`: `isPinnedCopy`, `hiddenAt`, `replacedById`
  added to `NOT_EDITABLE_COMMON` (machinery, written only by
  `applyStarterChange` / `hideStarterItem` — your header already said
  "hiding"). The header's "not applied yet" now says 0152–0155 exist and
  nothing reads them. `takeoff_run_types` is still not in `StarterTable`;
  your § 10a.1 #2 says you classify it before your code ships.
- `server/forkableReferences.test.ts`: the five `replacedById` are
  **`unreviewed`** (since 2026-10-13), like `materials.parentId`, ceiling
  7 → 11 (it was really 6 + 5). Each entry says what is owed: anything that
  FOLLOWS a `replacedById` (to show "replaced by …" or swap an item) must go
  through the table's resolver, because a company may have forked the
  replacement. Turn them into `resolver` entries when your code reads them.

**Live:** 0152–0156 go on live BEFORE any code from local-dev `≥` this
commit is pushed to `main` (step 1). That is A's job at the next release.

## FROM TRACK A — 2026-10-12 (session 37): smoke steps when F11 and the panel-label offer merge

F15 (scale is a one-tap offer, Q19) broke smoke step 2 on local-dev: it
waited for "1/2 scaled" that no longer arrives by viewing. A fixed it in
`e2e/smoke/flow.spec.ts` — step 2 now taps "Use … — read off the sheet",
and step 11's 77.78 ft depends on that tap.

**When F11 (homerun offer, `9291c708`) and the panel-label offer
(`540ac344`) merge to local-dev, C updates any smoke step that expects
circuits or panels to fill in on their own** — tap "Add N new homerun
circuits" / "Assign N panels from labels" first. Checked 2026-10-12: no
step in `e2e/smoke/` does this today, but grep again at merge time
(`homerun|circuit|panel`) — a step added in between would fail the same
way step 2 did, on staging, after the Gate's test job passed.

**C's answer, 2026-10-13, after merging local-dev (`c8df3f6`) into
track-c:** no change was needed. A grep for
`homerun|circuit|panel|syncSheet|placePanel` across `e2e/smoke/*`,
`.claude/skills/run-bidrender/smoke.mjs`, `scripts/deviceTouch.mts` and
`scripts/deviceAudit.mts` found nothing that expects circuits or panels to
fill in. The smoke plan (`e2e/smoke/fixturePlan.ts`) has no circuit tags and
no "PANEL" label, so neither offer can appear on it. Every "panel" hit is the
plan viewer's side panel. **Grep again** if a step or a fixture with circuit
tags is added before the merge.

## FROM TRACK A — 2026-10-12 (session 36): BS-M3–M6 — NOT applied; this is exactly what A needs from C

**Settling who waits on whom (owner asked):** your "FOR TRACK A — what the
baseline screen waits on" says these need "A's migration (drafts in
`baseline-screen-plan.md` § 10)". **There are no drafts to apply.** § 10
has one-line table summaries for BS-M3–M6, the BS-M5 three-column pattern,
and the `eddc870` BS-M3 SQL, which is superseded (it has no `kind` or
`version`, and holds `decimal` values only). The plan itself says "Full SQL
for BS-M4 to BS-M8 is written when a piece is scheduled". Writing it means
deciding how `applyStarterChange` stores, pins and undoes, and that code is
yours (owner Q12). **So the next move is C's: answer the list below,
ideally as hand-written SQL in § 10, and A numbers, rehearses and applies it
the same day.** Every item is a decision, not a typo.

**BS-M3 — `starter_change_batches` + `starter_changes`**

1. **Which tables a change can target.** `StarterTable`
   (`shared/starterChange.ts`) has 4: materials, assemblies, laborRates,
   modifiers. § 3 and BS-M5 name 7, adding `takeoff_run_types`, `kits` and
   `labor_steps`. Say which are in this build. That fixes `targetTable`
   (enum or varchar).
2. **`field`:** an enum of column names, or `varchar(64)` checked by
   `starterFieldKind`? (With an enum, every new column needs a migration.)
3. **Old/new value type.** Names are offers (Q17), so `decimal` cannot hold
   them. Options: `text` plus a value-type column, a `json` column, or
   separate `oldNumber`/`oldText` columns. Your `sameStarterValue` compares
   "0.5000" to 0.5 and null to not-0, so whichever it is must round-trip
   NULL distinctly from 0 and from "".
4. **Recipe, kit and run-type PARTS.** A changed parts list is rows in
   `assembly_materials` (and kit / run-type children), not a field. One
   change per child row (`kind` add/remove/qty, with the child's id), or one
   change carrying the whole list as JSON? This decides whether `kind`
   needs more values than `change,add,hide,unhide`.
5. **`version`:** the row's version after this change. Confirm it is the
   shared row's `version` column (materials, assemblies, labor_rates,
   modifiers, run types, kits have one).
6. **`undoneByChangeId`:** a nullable self-FK (`ON DELETE set null`), or no
   FK? And a batch undo: one `undo`-source batch whose changes each point
   back?
7. **Batch `editorUserId`:** `ON DELETE set null` as `eddc870` had, so
   history outlives the account. Confirm, and NULL = the seed boot.

**BS-M4 — `starter_change_pins`**

8. `forkId` points into whichever table the change targets, so it has no FK
   (as `eddc870`'s `forkId`). Confirm. **The company:** the owner's
   `users.id` (the `userId` convention, FK `ON DELETE cascade`) or
   `companies.id`? Unique on (changeId, companyOwnerId)?

**BS-M5 — `isPinnedCopy`, `hiddenAt`, `replacedById`**

9. **Which tables** (same answer as 1).
10. **`labor_steps` has `baselineId` and `isActive` but NO `version` and NO
    `baselineVersion`**, so it cannot be pinned or offered as § 2 describes.
    Either it gains both, or it is out of this build (Q8 put step minutes
    "later").
11. **`replacedById`:** a self-FK (`ON DELETE set null`) or a bare int?
    And is it only legal on a shared row (`userId IS NULL`), enforced by
    code only?

**BS-M6 — `companies.starterSeenAt` + `starter_offer_answers`**

12. Key `starter_offer_answers` by company owner `users.id` or by
    `companies.id`? (`starterSeenAt` is on `companies`, so the two halves
    would key differently unless decided.) Unique on (company, changeId).
    FK to `starter_changes` `ON DELETE cascade`?
13. An answer per change (one field), or per batch for "Accept all"? Your
    `acceptAllTakes` returns rows, so per change is assumed. Confirm.
14. **Undo:** when a change is undone, what happens to its `accepted`
    answers? (§ 4 says companies that accepted are offered the undo, which
    is a new change, so the old answer stays. Confirm.)

**What A will do with the answers:** hand-write 0152+ (add-only, step 1,
nullable, no defaults except counters), apply to the local, test and
staging databases with a backup, a rehearsal on a restored copy, and
`bidTotals` before/after. Nothing reads them until your code ships, so
bid totals cannot move.

(**Answered** in `baseline-screen-plan.md` § 10a; see "TO TRACK A" above.)

## FROM TRACK A — 2026-10-12 (session 34): your schema comment is in; BS-M3–M6 wait for your `applyStarterChange` spec

- **`quantitiesLockedAt` comment applied** to `drizzle/schema.ts` on
  local-dev, your text word for word. It names `leaveDraft`
  (`server/bidProtection.ts`), which is on `track-c` and NOT yet on
  local-dev — so until you merge, local-dev's comment describes code it
  does not have. **Merge `track-c` soon**; your merge brings no `drizzle/`
  diff for it.
- **Baseline drafts re-checked (`baseline-screen-plan.md` § 10 table):**
  BS-M1 → `0150`, BS-M2 → `0151` (applied: local, test, staging DB). BS-M7
  was `0148`. **BS-M8 dropped** — your F9 fix needs no migration.
  **BS-M3–M6 NOT applied:** the `eddc870` BS-M3 SQL cannot record a name
  change (Q17) or a recipe change, and covers only materials/assemblies;
  BS-M4–M6 have no SQL. **Send A the final SQL for BS-M3–M5 with
  `applyStarterChange`** (what it logs, which tables it pins) — A numbers
  and applies it, as before.
- **Found while building § 1:** `resolveScope` PROVISIONS a company for an
  account that never had one — it does not fail closed for a new user.
  Now refused for `starter_editor` first. Worth knowing for anything that
  assumes "no membership = refused".
- **Your DBs**: `bidrender_test_c` and `bidrender_local_c` need 0150–0151
  (`scripts/migrate.mts` after merging local-dev; expect 152), or
  `starterEditorLogin.test.ts` and the schema-drift test fail on them.

Written for a restart. Worktree `C:\dev\BidPhase-C`. **Latest: the first
section below** (`c-sch80-500` merged to local-dev 2026-10-09 and looked
at on screen; C's databases have 142 migrations, through A's 0141).
**Earlier, 2026-10-08:**
`c-homerun-footage` is MERGED into local-dev by Track A (`bea4d8f`, with
0125–0134); that branch is finished. Current work is on
`c-homerun-wiring` (from local-dev), merged into local-dev by C once CI is
green. `main` was `24105ad`. C's databases `bidrender_local_c` and
`bidrender_test_c` both have **135** migrations (through 0134). If `git log
origin/local-dev` or `scripts/schemaDrift.mts` says
otherwise when you read this, stop and find out why before going on — either
this file is stale or the state moved.

## START HERE (2026-10-12, evening) — baseline screen, C's number rules: built on track-c, NOT merged (waits for the owner's go)

**Merging: the owner fast-forwards local-dev by hand.** Claude Code's
permission check refuses C's push to local-dev ("Modify Shared Resources").
`71e84fb` stopped being a fast forward when A pushed `c54416c`. So track-c
merged local-dev again: `f02e1b1`, with A's 0150–0151 (starter_editor) and
the SER rename.

- C's local databases have **152** migrations, and dependencies are
  installed (`qrcode`).
- The 12 test files C changed today pass: 236 tests.
- Once track-c's Gate is green, the owner runs the one-line
  `git push origin <track-c head>:refs/heads/local-dev`.
- If local-dev has moved again, it is not a fast forward: merge again first.

**What C built of the baseline screen on today's database** (owner Q12: C =
number rules + tests; `baseline-screen-plan.md` § 11):

- **`shared/starterChange.ts`, the field rules (§ 3).** EVERY column of
  `materials`, `assemblies`, `labor_rates` and `modifiers` has a kind:
  - `offer`: numbers and names (Q17);
  - `everyone`: finding fields (Q21);
  - `unit`: never changed (`unitOfSale`, `rateType`);
  - `not-editable`: ids, versions, example tags, status, the company's own.
  - `starterChangeRefusal` gives the reason. **The test fails on any column
    left unclassified**, so a new column must be decided before the screen
    can touch it.
- **`offerBucket` / `acceptAllTakes` (§ 2, Q18):** a copy still on the old
  value is offered and in Accept all. A company's own value is listed
  apart and never in Accept all. "0.5000" equals 0.5, and null is not 0.
- **`shared/starterSheetChecks.ts`, one copy of the sheet's row checks
  (§ 5).** The price and hours rows of `pricing/loadStarterSheets.mts` now
  go through it, and the screen's upload will too.
  - Blank = no value. Bad numbers, units, duplicates, strangers and bend
    hours off a raceway are refused.
  - **The loader's dry run on the real sheets is byte-identical before and
    after the refactor.** exceljs came from a scratch install, per
    `pricing/README.md`.
- **The pinning premise, MEASURED (§ 2 "To prove, not assume"):**
  `server/starterPinning.test.ts`.
  1. A company with a bid on a starter assembly reads its bid, every
     assembly's price and recipe (with part prices), labor rates and run
     types.
  2. EVERY active starter material, rate, modifier and assembly is forked
     for it, and its reads come back identical.
  3. **Then the starter itself is changed** (part prices +$7, every
     starter rate +$11, assembly hours +1), and the company still reads
     identical. The shared rows are restored in a `finally`.
  4. **It goes red with no pins, and red with fork resolution broken**
     (`resolveForkedRow`).
- **F15, the scale as an offer (Q19).** `detectSheetScale` never writes a
  scale, on any bid. Every reading becomes `detectedScaleText`, and
  `applied` is always false.
  - `ScaleControl` shows a visible one-tap "Use 1/8" = 1'-0" — read off
    the sheet" beside Set scale. It is hidden on a locked bid, and the tap
    is the ordinary `setSheetScale`.
  - Four tests that pinned auto-apply were rewritten and say so
    (`planSheets` ×2, `lockedPlans`, `sheetScalePersistence`). With the old
    router they fail: 3 failed.
  - **Looked at:** laptop, iPad landscape and iPad portrait (44 px tall on
    touch, no sideways scroll), on fixture "Bar layout check" sheet E1.00,
    with a reading stored by hand and the viewer's detection request
    blocked so it stayed. The tap applied it and the offer went. Sheet
    E1.00 is restored (no scale, no reading).
  - Old sheets keep their "Detected" badge.
- **Proof:**
  - `bidTotals.mts` on `bidrender_local_c`: 4,237 / 4,237 Total due
    unchanged against the measurement taken before ALL of today's work
    (bid protection, B's merge and this).
  - 8 rule guards each red when removed, the pinning test red two ways, and
    F15 red against the old router.
  - Changed test files: `starterChange` 13, `starterPinning` 1, and
    `planSheets` + `lockedPlans` + `sheetScalePersistence` 72, all green.
  - `pnpm check` is clean.

**Not built yet, and NOT waiting on A — C's next:**

- **F11:** new homerun circuits as a one-tap offer on Drafts. Today a sheet
  visit creates them (`TakeoffPage` `syncHomeruns`; `homerunSyncStep` needs
  an "offer" outcome).
- **F12:** "Part changed — Send again" as a run line's fix-it.
- **F13:** a locked bid's "drops not priced" count still reads live
  (`bidDropsNotPriced`). The open question: freeze it with no column, or
  count only the drops the lock froze. Decide before building.

### FOR TRACK A — what the baseline screen waits on (2026-10-12)

C cannot build these on today's database. Each needs A's migration, and then
C's code. **Corrected after A's note at the top of this file:** A will not
apply BS-M3–M6 from the old drafts. `eddc870`'s BS-M3 cannot record a name or
recipe change, and covers only materials and assemblies. **C owes A the
final SQL for BS-M3–M5, together with the `applyStarterChange` spec** (what
it logs, which tables it pins). That is C's next baseline task, so this list
waits on C first and on A second.

- **BS-M3:** `starter_change_batches` + `starter_changes` (with `kind`,
  `version`). Needed by `applyStarterChange`'s log, undo and the sheet
  upload's batch.
- **BS-M4:** `starter_change_pins`. Needed to record which copies a change
  created, so undo knows them.
- **BS-M5:** `isPinnedCopy`, `hiddenAt`, `replacedById` on the seven tables.
  Needed to mark a pin as "not my change", for Hide, and for the
  replacement. **Until then a pin looks like the company's own edit.** The
  numbers are proven unaffected (`starterPinning.test.ts`); the badges and
  "My changes" are not.
- **BS-M6:** `companies.starterSeenAt` + `starter_offer_answers`. Needed for
  the "New" badge and for Accept / Ignore.
- **BS-M1 / BS-M2:** the `starter_editor` login and its factors. These are
  A's own piece, which A is building now.
- **BS-M8:** not needed. F9 shipped without it (`scaleSource = "manual"`
  with no ratio).
- **The boot change (§ 6, F2, F4–F6)** is A's: the seed proposes and the
  owner confirms. It needs BS-M3.
- **The `quantitiesLockedAt` comment:** DONE by A (session 34), word for
  word. Until track-c reaches local-dev, local-dev's comment names
  `leaveDraft`, which is only on track-c.

## EARLIER (2026-10-12, later) — BID PROTECTION built on track-c (math version, auto-lock, frozen settings)

Built on A's 0148 / 0149 (local-dev `1091f7e`, `7561ab8`, pulled into
track-c). **C's local databases: 150 migrations.** No migration written or
applied by C.

**What it does**

- **Math version (0148).**
  - `shared/mathVersion.ts`: `CURRENT_MATH_VERSION` and the registry
    `MATH_CHANGES`, plus `atLeast`, `reasonsBetween` and `canUpdateMath`.
  - New bids start at the current version. Both inserts into `bids` set it
    (`db.createBid`, the sample bid).
  - **Version 1 = remove/relocate labor:** `roleCountsOnBid`
    (`shared/roleLines.ts`) gives a bid below 1 no role counts. Nothing is
    waiting and Send adds no labor lines, which is what live does today.
    Live has no role-line code at all, so this is the whole of the change.
  - **Strip:** `bids.mathChanges` / `bids.dismissMathChanges`, shown on the
    bid screen and Quick bid by `MathChangeStrip`, never on the proposal (a
    test scans the document).
  - **Button (Q22):** `bids.mathUpdatePreview` (old → new, writes nothing)
    and `bids.updateMath`, for an unlocked Draft only.
- **Auto-lock (Q15), no migration.** `bids.update` Draft → non-Draft and
  `bids.create` non-Draft call `leaveDraft`, which uses `db.lockBidQuantities`
  (the Lock button's path) unless the bid is already locked.
  - Active → Won does not lock, and Unlock is unchanged.
  - `offersLockOnStatusChange` no longer asks on a change from Draft.
  - `shared/quantityLock.ts` and two router comments are rewritten. **The
    schema comment marked REVERSED is NOT**: the Gate's `drizzle-guard`
    refuses any track-branch commit touching `drizzle/`, a comment
    included. Its replacement text is below, for A.
- **Freeze (Q16, 0149).** `freezeBidSettings` fills NULL overhead / profit /
  productivity groups with the values in effect, and keeps a person's own
  override (filling only its inherited overhead mode).
  - It writes the tax-switch group (only if `salesTaxEnabled` is NULL),
    `taxRateFrozenPct` and `taxRateFrozenDetail`, and sets `settingsFrozenAt`.
  - Pricing goes through `taxRateForBid` / `taxRulesForBid` in `billTheBid`,
    the one place tax is applied. Order: typed rate, then frozen (only when
    `settingsFrozenAt` is set), then live.
  - Pinning another area or changing the address on a frozen bid re-freezes
    the rate (`refreezeTaxRate`). Without that, the control would do nothing
    visible.
  - A bid moved back to Draft keeps what was frozen.
  - CLAUDE.md § "Settings are inherited…" is amended and
    `companyDefaults.test.ts` is extended, in the same commit.

**FOR TRACK A — the release step's functions (`server/bidProtection.ts`)**

- `priceBidAtVersion(bid, userId, version)`: one bid's `totalDue`,
  `workPrice`, `notPriced` and `incomplete` at any version. Read-only.
- `moveBidToMathVersion({ bid, userId, at, to?, seen, dryRun? })`: refuses
  anything but an unlocked Draft. Prices from and to, sets the version, and
  writes a `bid_math_changes` row only if Total due moved. Use `seen: false`
  in the release step so the strip shows, and run `dryRun: true` first.
  **Today, 0 → 1 moves no total**, because no pricing branch reads the
  version yet. So the release step should write zero change rows. If it
  writes any, stop.
- `freezeBidSettings({ bid, userId, at, dryRun? })`: for bids already
  Active / Won / Lost before this ships. `dryRun` returns the patch and
  writes nothing.
- `leaveDraft(bid, userId, at)`: lock + freeze, if A also wants existing
  non-Draft bids locked (the owner's Q15 covers bids LEAVING Draft; locking
  old ones is A's and the owner's call).

**Proof**

- `bidTotals.mts` on `bidrender_local_c`, before (the track-c code before
  this work) and after: **all 4,237 bids, Total due unchanged; not-priced
  and incomplete unchanged.**
- **Every guard goes red with it removed: 13 removals, each with the file
  restored byte-for-byte afterwards.**
  - New-bid version: 2 failed.
  - v1 gate: 2 failed.
  - Leave Draft on update: 6 failed.
  - Create outside Draft: 1 failed.
  - Freeze in `leaveDraft`: 5 failed.
  - Frozen rate read: 1 failed.
  - Frozen switches: 1 failed.
  - No lock offer from Draft: 1 failed.
  - `updateMath` refusal: 1 failed.
  - Unseen filter: 1 failed.
  - Refreeze on pin: 1 failed.
  - Math dry run: 1 failed.
  - Freeze dry run: 1 failed.
- **Changed test files:** `bidProtection.test.ts` (new),
  `companyDefaults.test.ts` and `quantityLock.test.ts`: 66 passed.
  `pnpm check` is clean.
- **Looked at on screen** (playwright, fixture bid 1728378, phone 390 and
  laptop 1536, no sideways scroll). The strip, the button, the preview,
  Update and "Got it" all work. Draft → Won in the status menu showed the
  locked banner, no "Lock this bid?" prompt, and no math strip.
  - **Three wording faults found by looking, and fixed:**
    - The preview said "$2,430.00 → $2,430.00" when nothing moved. It now
      says "Total due stays…".
    - "Total changed" now says "Total due changed".
    - The reason said remove/relocate marks "now add" labor. They "can now
      add" it: updating sends nothing by itself.
  - The sentences live in `shared/mathVersion.ts` and are tested.
  - The fixture was put back to a Draft (version NULL, unlocked, unfrozen),
    and the after-measurement confirms its total.

### FOR TRACK A — replace the `quantitiesLockedAt` comment in `drizzle/schema.ts`

The code it describes is on local-dev. C cannot make this edit, because
`drizzle-guard` fails any track-branch commit that touches `drizzle/`, a
comment included. First tried in `15f5050`, then amended out. Comment only:
no column changes and no migration. In the `quantitiesLockedAt` comment on
`bids`, replace the section headed "── Independent of `status`, and never
set by it — REVERSED 2026-10-12 ──" (both of its paragraphs, down to "Same
column — no migration was needed for this.") with:

```ts
     * ── Set by a person, AND by the bid leaving Draft (owner Q15, 2026-10-12) ─
     * Written by `bids.lockQuantities` / `bids.unlockQuantities`, which a person
     * presses, and by `leaveDraft` (server/bidProtection.ts) when `bids.update`
     * moves a bid out of Draft or `bids.create` makes one outside it — through
     * the same `db.lockBidQuantities`, so a lock is one thing however it came.
     * Unlock is one click away, as before.
     *
     * This paragraph said "independent of `status`, and never set by it" until
     * 2026-10-12: a lock the app applied was "a number frozen at an instant the
     * app chose". Q15 reversed that (baseline-screen-plan.md § 9 F1), because
     * an unlocked Won bid re-counted whenever the library moved — the worse of
     * the two. Same column; no migration was needed.
```

Until A does, that comment still says the paragraph "stays until the code
that does it lands (Track C)". The code has landed, so the comment is stale.

**The full suite found what the 3 changed files did not (Gate 38296979664,
4 files red), and the fixes are in the next commit:**

- `fixLine.test.ts` (2): its Won and Lost bids are now auto-locked, so the
  fix was refused as locked. Those tests are about the question an UNLOCKED
  closed bid asks, so they now assert the lock and then unlock, as a person
  would.
- `materialMarkup`, `materialMarkupAgreement` and `quoteAppPanel` (2
  each): their bid fixtures are partial objects cast `as unknown as Bid`,
  with no 0149 columns. A missing `settingsFrozenAt` is `undefined`, which
  is `!== null`, so it read as "frozen with no rate" and dropped the tax.
  The fixtures now carry the columns as NULL. Real rows come from full
  `select()`s, so production was not affected.
- `linePricingProblems.test.ts` has the same kind of fixture but no tax, and
  is left alone.

**Startup no longer fills blanks on company copies** (A's `7561ab8`). None
of these tests expect a restart to fill one.

**Earlier the same day:** C waited for A's migrations (below).

**Local databases: 148 migrations** (through A's 0147).
`bidrender_local_c` and `bidrender_test_c` were both migrated by C:
0144–0145 as the owner asked, then 0146–0147, which A put on local-dev
mid-session. The local tests needed them, since `schema.ts` declares
`scopeTag`. If `scripts/schemaDrift.mts` says otherwise, stop and find out
why before going on.

**1. Drive-time note: branch `c-drive-note`, MERGED (fast-forward
`17e42c0..4be57f8`).**

- A job-cost tile's working ("6 trips × 1.5 h × $85.00/h"; lift rental
  has one too) goes into `bid_expenses.notes` (0145). It shows in small
  grey text under the charge on the bid screen and Quick bid. That is one
  component, `BidExpensesSection`.
- `jobCostCharge()` in `client/src/lib/jobCostTiles.ts` builds the charge,
  so the suite can reach it.
- **Never on the quote:** `proposals.document` maps a charge to name and
  amount by hand. A test scans the built document for the working and the
  rate.
- **A new amount without a new working clears the note**
  (`updateOnBid`), so it can never state a sum the charge no longer has.
  Blank is stored as NULL.
- **Tests:** 4 in `server/bidExtras.test.ts` ("a charge's working note") and
  1 in `jobCostTiles.test.ts`. **Red without the fix (3 failed), green
  with it.** `pnpm check` is clean.
- **Looked at on screen** (playwright, fixture bid 1728378 "Quick bid job
  costs check", user 1):
  - Laptop 1536: fine.
  - Phone 390: **one fault found by looking, and fixed.** The note was
    truncated to "… × $85.00…", which cut off the rate. It now wraps.
    No sideways scroll.
  - The fixture now has a Drive time charge with a note. Leave it or delete
    it.
- **Gates:** branch 38284042427 green; the merged commit 38285535698 green.
  **local-dev Gate 38286657519 on `4be57f8` was pending when this was
  written (it deploys staging). Check it once.**
- No migration and no number change: a note is words. Existing charges
  stay NULL.

**2. Owner answers Q14–Q22 recorded** in `baseline-screen-plan.md` § 12.
All are the suggested answers except **Q19**: reading the scale off the
drawing (F15) and adding new homerun circuits (F11) become **one-tap OFFERS
on Drafts, never automatic from viewing.** § 12 says what that changes in
C's build. F15 needs **no migration**, because `detectedScaleText` already
holds a suggestion. That was checked against `bidPdfsRouter.ts`
`detectSheetScale`.

**3. `references/bid-methods-plan.md` (plan only).**

- The owner's no-stacking rule **overrides `material-markup.md` D1**. Both
  files say so.
- The engine enforces it with a union type. The owner's 0%/50% test is
  specified.
- Drafts BM-M1–M10 are below for A.
- **All 16 owner questions answered (2026-10-12): every pick approved.**
  One addition to Q1: new-shop setup asks "How do you usually bid?"
  (Cost + O&P / Markup + hourly rate), Cost + O&P preselected. It writes
  `pricing_defaults.pricingMethod`, so no extra column. Q15's column is
  BM-M10.
- Every existing bid stays on the old stacked math (`pricingMethod` NULL).
  Only an accepted Draft offer moves one.

### FOR TRACK A — bid methods drafts (not urgent; nothing is built on them yet)

All add-only, step 1, nullable, NULL = old meaning; step 3 empty. Full SQL
with comments: `bid-methods-plan.md` § 9. In short:

```sql
ALTER TABLE `bids` ADD `pricingMethod` enum('markup_rate','cost_op') NULL;              -- BM-M1
ALTER TABLE `pricing_defaults` ADD `pricingMethod` enum('markup_rate','cost_op') NULL;  -- BM-M2
ALTER TABLE `pricing_defaults` ADD `materialMarkupMode` enum('flat','brackets') NULL;   -- BM-M3
ALTER TABLE `labor_rates` ADD `chargeRate` decimal(10,4) NULL;                          -- BM-M4
ALTER TABLE `bid_line_items` ADD `snapshotChargeRate` decimal(10,4) NULL;               -- BM-M5
-- BM-M6 CREATE TABLE wage_rate_sets; BM-M7 CREATE TABLE wage_rate_set_rates (see § 9)
ALTER TABLE `bids` ADD `wageRateSetId` int NULL;                                        -- BM-M8 (+ FK)
ALTER TABLE `bids` ADD `registeredApprentices` boolean NULL;                            -- BM-M8
ALTER TABLE `bids` ADD `buildingSqFt` decimal(12,2) NULL;                               -- BM-M9
ALTER TABLE `wage_rate_sets` ADD `fringePaidAsCash` boolean NULL;                       -- BM-M10 (after BM-M6)
```

**The owner answered all 16 (2026-10-12), so the drafts are final, but they
are NOT needed yet.** The build comes after scope tags and the baseline
screen. Add them when C starts the bid-methods build, not before.

## EARLIER (2026-10-10, night) — F9 scale fix and F10 homerun fix MERGED to local-dev (`95fb513`)

Both were found by the audit in `baseline-screen-plan.md` § 9. Both are
fixed with no migration, a test that fails without the fix, and branch
Gates green. They merged together, and the combined commit `8a593af` had
its own green Gate before the push.

**F9 — a removed scale came back when the sheet was viewed.** Branch
`c-scale-cleared` (`67ee526`, Gate 38081790230 green; with local-dev
merged, 38082668001).

- `clearSheetScale` now stores `scaleSource = "manual"` with no ratio,
  meaning "a person decided: no scale". It used to store "none". Detection
  never overrides "manual", and the browser only asks for detection on
  "none". Every footage path measures nothing without a ratio: all six
  readers of `scaleSource` were read before choosing this.
- **Test:** `server/sheetScalePersistence.test.ts` "a REMOVED scale stays
  removed…" was red before the fix (1 failed) and green after.
  `planSheets.test.ts` asserted `"none"` after a clear, which pinned the
  fault; that line now says `"manual"` and explains why.
- **Looked at on screen** (fixture bid 1164558 "Bar layout check", sheet
  E0.01): after Clear, the control reads "Set scale", "0/5 scaled" and
  "0 ft of runs (6 not measured)". The sheet still had no scale after
  viewing it again. **Limit:** none of this fixture's five sheets reads a
  CONFIDENT scale, so the screen check could not exercise detection
  itself. The server test does that with the exact viewing call. Sheet
  E0.01 was restored to its hand-set 3/16" scale, unchecked, and the bid
  total is back at $378.15.

**F10 — a hand-placed panel could re-match homeruns on the next sheet
opened.** Branch `c-homerun-rematch` (`bbb5f85`, Gate 38082036734 green).

- **REPRODUCED, at logic level, not in a browser.** No local bid has
  circuit-tagged devices on two sheets (measured: one bid has circuits,
  all on one sheet), so a two-sheet browser run could not be set up.
  Steps taken:
  1. Moved the page's sync decision, unchanged, into `homerunSyncStep`
     (`client/src/lib/homerunSync.ts`).
  2. Built the signatures with the real `syncSignature`.
  3. Ran the sequence "sheet A synced → panel placed by hand, same leaving
     devices → sheet B opened". On the OLD logic, sheet B's sync went out
     with `rematch: true`, and the placement never re-matched sheet A at
     all (2 tests red).
- **Fix:** the re-match arm carries the SHEET id. Armed for this sheet:
  send a re-match now, even if the report is unchanged. Any other sheet:
  an ordinary visit (create only). Tests: 12 green.
- **Still worth doing:** a browser check with a real two-sheet set that has
  circuit tags, when one exists.

**(Fixed 2026-10-12: both are at 148 now, see START HERE.)** **Local databases are BEHIND.** Track A added 0144 (`workTag`) and 0145
(`bid_expenses.notes`), and `bidrender_test_c` and `bidrender_local_c` do
not have them, so local DB-backed tests fail with "Unknown column
'workTag'". Not applied here, because the owner said no migrations this
session. Apply them (or reset from migrations) before the next local test
run. GitHub's Gate is unaffected.

**local-dev Gate 38083404900** on `95fb513` was pending when this was
written. It deploys staging. Check it once.

**Q-M5 is done by A** (0145, `bid_expenses.notes`). The job-cost tiles'
working note can now be stored; that is C's next small piece
(`quick-bid-plan.md` § 6).

## EARLIER (2026-10-10, latest) — baseline plan REWORKED to offers; audit of silent number moves

**`references/baseline-screen-plan.md` rewritten (plan only, no code).** The
owner answered § 10 and changed the rule: a starter change must NEVER reach
an existing company, even one on the Example values. App updates still reach
everyone; app MATH changes follow rule (c).

- **Design:** pin (give each existing company a copy as it stands), then
  change, then OFFER ("N starter updates available", accept one or all).
  New companies get the latest because they have no copy. Units are never
  changed. Hide is for new companies only, with a replacement when a
  company's assemblies use the item. Adding shows "New" and moves nothing.
- **Rule (c), § 8:** `bids.mathVersion` plus a `bid_math_changes` row and a
  "Total changed because…" strip on Drafts. **Must land before
  remove/relocate labor goes live** (it raises totals on Active/Won bids
  with such marks otherwise).
- **Audit, § 9, F1–F17.** Money on a line is always frozen. What moves
  unasked:
  - **F1:** quantities on any UNLOCKED bid, Won included, follow library
    values live.
  - **F2–F6:** the boot rewrites the starter on every deploy, and pass 2
    writes companies' own copies.
  - **F7:** shipped heights and bend defaults live in code.
  - **F8:** inherited margin and tax on Won bids.
  - **F9:** "Remove scale" is undone by viewing the sheet. **Confirmed by
    reading.**
  - **F10:** a hand-placed panel can re-match homeruns on a later sheet.
    **Plausible; reproduce first.**
- **Migrations BS-M1–M8** (additive; step 3 empty). Open owner questions
  **Q14–Q22**; 14, 19 and 22 move numbers.
- local-dev Gate 38079512981 (job costs merge): **GREEN** — test,
  deploy-staging and smoke all passed. Job costs are on staging.

## EARLIER (2026-10-10, late night) — Quick bid phase 1 (job costs) on `c-quick-bid`; FOR TRACK A: Q-M5

**Branch `c-quick-bid` (from local-dev `c649268`), commit `200e310`.**
Built per `quick-bid-plan.md` § 6 with the owner's answers (§ 12, Q6: drive
time is a flat cost):

- **Quick bid gets ONE "More options" fold** under the counting box, closed
  by default; its header says "Job costs: 4 · $2,430.00" when closed. The
  basic loop (type → qty → Enter) is unchanged.
- **Job costs inside it:** the bid's charges plus four tiles: Permit, Lift
  rental (days × $/day), Dumpster, Drive time (trips × h/trip × $/h, a flat
  `bid_expenses` amount, never hours). Blank or zero is refused, never $0.
  A missing rate says "No labor rate — type one, or set a default rate in
  Settings." The rate is prefilled from the company's DEFAULT labor rate.
- **The search box finds the tiles** ("permit", "dump", "drive", "travel",
  "scissor"); Enter opens the tile with its first box focused, and adding
  sends focus back to the search.
- **Quick bid totals** now show **Job costs** and **Total due** when there
  are any. "Bid price" stays `workPrice`, as on the bid screen.
- **One component, two screens:** `BidExpensesSection` is now the body of
  the bid screen's "Additional expenses" too, so the bid screen gained the
  same tiles. The rules live in `client/src/lib/jobCostTiles.ts`.
- **Tests:** `jobCostTiles.test.ts` (10). Red with blank-as-0 (2 failed)
  and with the rate left out of drive time (1 failed); green restored. The
  touched-file tests (sourceHygiene, bidLineUndoWired, mostUsedRow) pass:
  22 in all. `pnpm check` clean.
- **Looked at on screen** (playwright, real viewports: phone 390,
  iPad portrait 820, iPad landscape 1180, laptop 1536), fixture bid
  **1728378 "Quick bid job costs check"** (user 1, `bidrender_local_c`;
  leave it or delete it). No sideways scroll, no text below the edge, no
  overlaps; tiles and boxes are 44 px on touch. **One fault found by
  looking, and fixed:** typing "2 Enter 450" at machine speed put 450 into
  the Days box (focus moved a frame late). Focus now moves at once inside an
  open tile.
- **Bid totals:** `bidTotals.mts` before vs after on `bidrender_local_c`:
  all 4,236 existing bids unchanged. The only differences were the two
  fixture bids the check created (1728377 deleted afterwards). No server,
  shared or drizzle file changed.
- **Gate:** run 38078650646 on `200e310` GREEN. **MERGED into local-dev**
  (`f50e713`, after merging local-dev's two docs-only commits in;
  fast-forward push `2e7de83..f50e713`). local-dev Gate 38079512981 was
  pending when this was written: **check it once**; it also deploys
  staging. `track-c` has merged local-dev.

### FOR TRACK A — Q-M5 (additive, step 1, not urgent)

The plan assumed `bid_expenses.notes`; **it does not exist**. The working
("6 trips × 1.5 h × $85.00/h") cannot go in the name, because names print
on the customer's proposal. So the working is shown, not stored, until:

```sql
ALTER TABLE `bid_expenses` ADD `notes` varchar(512) NULL;
```

Hand-written, NULL = no note, safe before the code. Then C writes and
shows it (bid screen only, never the quote). `quick-bid-plan.md` § 6, § 9.

## EARLIER (2026-10-10, night) — owner answers recorded; baseline screen PLANNED

- **Owner answers recorded** (`d9d49b8`): quick-bid Q1/Q2/Q3/Q6/Q8 in
  `quick-bid-plan.md` § 12, status-and-scope Q10 in § 8. All six took the
  suggested answer.
- **`references/baseline-screen-plan.md`, plan only, no code.** It covers
  the admin screen on live for the shipped starter's prices, labor hours
  and assembly hours: a `starter_editor` login with no company plus an
  authenticator code; one `applyStarterChange` path with a field-by-field
  push under a double guard (tag not FALSE AND value equals the old
  starter); a change log with undo; sheet upload with preview; export to
  seed plus a drift line; "My changes" and "Copy from my company". Three
  additive migration drafts (BS-M1–M3) are for A. **13 owner questions;
  5, 6, 7 and 13 move numbers on new lines.**
- **Found while planning, not fixed:** editing an assembly's OVERHEAD
  hours does not clear `isExampleHours` (`assembliesRouter.ts:316` clears
  it on base hours only). The plan fixes it with the push code. Today it
  only means a shop's edited overhead still shows "Example hours".

## EARLIER (2026-10-10, evening) — remove/relocate MERGED to local-dev (`d832e34`); FOR TRACK A: recount bids with remove/relocate marks before it goes live

**Both known gaps below are FIXED on `c-remove-relocate` `d832e34`**, and
that commit is now local-dev (fast-forward push `07c7407..d832e34`;
local-dev is checked out in A's folder, so C pushed the commit, it did not
check the branch out). `track-c` has merged it (`d024c09`).

- **Warning strip:** a remove / relocate line with no hours now has its own
  entry per kind — "1 remove line has no hours — its labor is not in the
  total above." — with a **Set remove hours** / **Set relocate hours**
  button that scrolls to the first such line and focuses its hours box. It
  is no longer counted in "N lines are not priced … type a price" or in
  the hand-priced "no labor hours" entry (`missingEntryCounts` skips role
  lines; `roleLinesWithoutHours`, `roleHoursStripText` in
  `shared/roleLines.ts`). The "no labor hours" entry gained a **Set hours**
  button (every warning gets a fix-it).
- **"0 h" on a free count with no hours** now reads **"Hours not set"**,
  tappable to focus the box. The hours-cell decision moved to
  `client/src/lib/bidHoursCell.ts` so the suite reaches it.
- **Tests:** red without the fixes (3 failed: noHours 4 vs 1; "hours" vs
  "handHoursNotSet" twice), green with them — removeRelocateLabor 11,
  bidHoursCell 4, freeCount, fixWalk: 45 passed. `pnpm check` clean.
- **Looked at on screen**, tablet portrait 820×1180 (playwright, bid
  **1728376 "Remove relocate check"** on `bidrender_local_c`, user 1 — a
  fixture with an install, a remove, a relocate and a free-count line, all
  without hours; leave it or delete it): no "0 h" cells, three "Hours not
  set", all three buttons focus the right box, nothing sideways or below the
  edge.
- **Gates:** branch Gate 38069818821 on `d832e34` GREEN; local-dev Gate
  38070648397 on `d832e34` GREEN.
- **No numbers moved by this fix** — wording and buttons only.

### FOR TRACK A — before remove/relocate goes LIVE

**This code raises totals ONLY on bids that have remove or relocate marks**
(a sent count gains a labor line per kind; with hours set, that labor is
added to the total; with hours not set, the line is "Not priced" and the
bid says "+ N not priced"). Bids with no such marks are unchanged
(measured: all 4,235 on `bidrender_local_c` unchanged, 0 had such marks).
**In the release plan, A must count the LIVE bids with remove/relocate
marks** (`takeoff_stamps.status IN ('remove','relocate')`, grouped by bid)
and recount those bids' totals before and after, so the owner knows which
live bids move and by how much before it ships. No migration (0110 / 0111
/ 0115 already exist).

### Owner questions — explained in plain words (2026-10-10)

Given to the owner in chat: quick-bid Q1, Q2, Q3, Q6, Q8 and
status-and-scope Q10, each with what it means on a job, the suggested
answer and what it does to the numbers. **ANSWERED the same evening — all
six took the suggested answer.** Recorded in `quick-bid-plan.md` § 12 and
`status-and-scope-plan.md` § 8 Q10.

## EARLIER (2026-10-10, later) — remove/relocate labor on `c-remove-relocate`; quick-bid plan written

**JOB 1 — remove / relocate labor, built on `c-remove-relocate` (`a7fe812`,
branched from `track-c`, pushed).** Owner answers are in
`status-and-scope-plan.md` § 8. What it does: a count with remove or relocate
marks puts ONE labor line per kind beside its install line ("Remove duplex
receptacle × 2"). The hours freeze at send: the count's per-bid override,
else the assembly's, else NOT SET, which shows "Not priced" (never $0) with
a "Set remove hours" / "Set relocate hours" fix-it on the line. Only NEW
marks price material. A role line has no `assemblyId`, no material and is
ticked labor-only. Rules: `shared/roleLines.ts`. Status in
`remove-relocate-labor-plan.md`.

- **No migration.** 0110 / 0111 / 0115 already exist. So the merge gate is
  the CI Gate alone.
- **Gate:** run 38024821205 on `a7fe812` was IN PROGRESS when this was
  written (one-off check, no watcher). **Check it once. If it is green, pull
  local-dev, merge `c-remove-relocate` into it, and push. If it is red, read
  the failure first.**
- **Measured:** `bidTotals.mts`, track-c vs c-remove-relocate on
  `bidrender_local_c`: "ok all 4235 bid(s): totalDue unchanged; not-priced
  and incomplete unchanged". 0 of 4,235 bids have remove/relocate marks,
  and 0 role lines exist. The new test `server/removeRelocateLabor.test.ts`
  is 9/9 green and red without the change (6 failed). The 8 touched test
  files give 163 passed, 1 skipped. `pnpm check` is clean.
- **Looked at on screen** (820×1180): the bid line shows "Hours not set",
  "Not priced", and a "Set relocate hours" button that focuses the box. The
  count card shows the split, "1 relocate — labor not on the bid", "Add
  relocate labor to bid" and the "Hours…" fold. Nothing is below the edge.
- **Known gaps, not fixed:** (1) the bid's warning strip text ("Type a
  price on a line priced by hand") also counts role lines, whose fix is
  hours, not a price. The wording wants a role-aware branch. (2) This one
  is older: a free count with no hours shows "0 h" in the bid hours cell
  (the role line was fixed to "Hours not set").

**JOB 2 — `references/quick-bid-plan.md` (plan only).** It covers typed
footage with no plans, homeruns by average, rooms with an ADDED difficulty
factor, a status chip per line, job-type checklists, job costs in one spot,
and phone walking. It lists four additive migration drafts for A (Q-M1 to
Q-M4, unnumbered: A assigns the numbers) and nine owner questions. Q1, Q2,
Q3, Q6 and Q8 change bid numbers. The suggested first build is job costs
on Quick bid, which needs no migration.

**Was still with the owner (answered 2026-10-10 evening — yes to both):** `status-and-scope-plan.md` § 8 **Q10** (does a
"By others" / "Excluded" line leave the materials list and the drops?). It
changes numbers on two screens, so it was sent back.

## EARLIER (2026-10-10) — step-based labor, code half on `c-step-labor`: MERGED (see below); FOR TRACK A: migration 0143

**Branch `c-step-labor`, from `origin/a-catalog-reality` `8f28a85`** — A's
catalog merge was NOT on local-dev when this started (local-dev was
`aaed2a8`), and a-catalog-reality already contains local-dev, so it is the
"local-dev after A's merge" the owner asked for. **When A pushes it to
local-dev, merge local-dev into `c-step-labor` first.** Do NOT merge
`c-step-labor` into local-dev until the owner says so. `c-pvc-4080` left
alone (A merged it into the catalog job).

**MERGED to local-dev 2026-10-10** (fast-forward from `c-step-labor`)
after: Gate 38019884197 on `21468a9` green (full suite); Track A applied
0143 to staging 03:34 UTC (backup
`staging-2026-10-10T03-30-47Z-before-0143.sql`; rehearsed on its restore:
1 applied, 144, 180/180 FKs, 1,062/1,062 bids unchanged with the old code,
this code and after its first boot; on staging 1,066/1,066 existing bids
unchanged). The local-dev push is what deploys this code to staging; A
checks that Gate.

**Merge order (owner, 2026-10-10):** wait until A has (a) pushed the catalog
job to local-dev — DONE, `334104a` / `8f28a85` / `aec561b` on local-dev as
of 2026-10-10 02:20 UTC — AND (b) applied migration 0143 — NOT YET (0143 is
on `c-step-labor` only). Then: pull local-dev, merge it into
`c-step-labor`, push, check the Gate ONCE (no background watcher), and
merge to local-dev only after it is green (pull first). Every bid total
must stay unchanged (measure with `scripts/bidTotals.mts` before and after).
**Laptop rule (owner):** never run the full suite here — low memory; GitHub
Actions runs it. Run only the test files touched.

**THE OWNER PRICES CABLE PER-FOOT HOURS FIRST (owner, 2026-10-10).** Step
totals stay "not set" on every starter that carries cable (28 of the 30)
until the cable rows have hours per foot, because the cable step reads each
cable's own per-foot hours (Q1). So the order is: the owner fills the cable
rows on `pricing/labor-units-starter.xlsx` (hours per 100 ft) → A loads
them → THEN the step minutes and overheads on the Steps / Step totals tabs
can unlock step totals, and only then can `starterHoursClearable` let any
typed starter hours clear (Q2/Q7). Typing step minutes before the cable
hours is harmless, but nothing will price from steps until both exist.

Plan and owner answers: `references/step-based-labor-plan.md` (§ 13
answers and the bid-number check; § 14 the Steps / Step totals tabs for A's
one sheet rebuild). Same file on `track-c` (`519e099`).

### FOR TRACK A — migration 0143 (only A runs it on shared databases)

File on the branch: **`drizzle/0143_labor_steps.sql`** + journal entry
(`when` 1789963300000), **renumbered from 0142 on 2026-10-10** because A's
`0142_search_misses` took that number (same `when` as the old 0142 entry —
so a database that had C's old 0142 recorded must drop that record and the
two tables before migrating, or the migrator counts A's 0142 as applied;
C's two databases were reset that way). Renumber again freely if 0143 is
taken first. Hand-written,
ADDITIVE, step 1 of the three steps — **safe before OR after the code**:

```sql
CREATE TABLE `labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`baselineId` int,
	`stepKey` varchar(32),
	`name` varchar(255) NOT NULL,
	`unit` varchar(64) NOT NULL DEFAULT 'each',
	`minutes` decimal(8,2),
	`reasoning` text,
	`isExampleMinutes` boolean,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `labor_steps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `labor_steps_userId_idx` ON `labor_steps` (`userId`);
CREATE INDEX `labor_steps_baselineId_idx` ON `labor_steps` (`baselineId`);
CREATE TABLE `assembly_labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assemblyId` int NOT NULL,
	`kind` enum('step','cable') NOT NULL DEFAULT 'step',
	`laborStepId` int,
	`count` decimal(10,2) NOT NULL DEFAULT '1',
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `assembly_labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `assembly_labor_steps_assemblyId_assemblies_id_fk` FOREIGN KEY (`assemblyId`) REFERENCES `assemblies`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `assembly_labor_steps_laborStepId_labor_steps_id_fk` FOREIGN KEY (`laborStepId`) REFERENCES `labor_steps`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `assembly_labor_steps_assemblyId_idx` ON `assembly_labor_steps` (`assemblyId`);
```

- **Before 0143** the code runs: every step read treats ER_NO_SUCH_TABLE as
  "no steps" (`stepsTablesMissing`, server/db.ts — only that error; anything
  else throws), the seed pass does nothing, and pricing is exactly today's.
  `schemaCheck` / `schemaDrift` still REPORT the two tables missing, loudly,
  until it runs. Measured: the assembly, kit, example-tag and bid-line
  suites, 166 green on `bidrender_test_c` WITHOUT the tables (the one red,
  DV33 in `starterAssembliesSeed`, is the same red from a clean
  `a-catalog-reality` checkout on that database — not this change).
- **After 0143**, first boot seeds 47 shipped steps (all minutes NOT SET) and
  the step lists of the 30 starters (194 lines). **No number moves**:
  measured on `bidrender_local_c`, old code before vs new code + 0143 +
  seed after — `bidTotals` "all 4235 bid(s): totalDue unchanged; not-priced
  and incomplete unchanged"; `routerSnapshot` 0 of 4,235 bids differ.
  **Re-measured after the renumber (2026-10-10):** both C databases reset to
  local-dev's state (old 0142 record and the two tables dropped, A's
  `0142_search_misses` applied from local-dev's own `drizzle/`), `bidTotals`
  taken with local-dev's code (`f03e8ef`), then 0143 applied, the step seed
  run (47 steps, all not set; 30 lists, 194 lines), `bidTotals` with
  `c-step-labor`: **"ok all 4235 bid(s): totalDue unchanged; not-priced and
  incomplete unchanged"**.
- `schemaDrift` on `bidrender_test_c` after 0143: "Database matches the
  schema", foreign keys 180/180.
- C applied 0143 to C's OWN `bidrender_local_c` and `bidrender_test_c` (both
  now **144** migrations, through 0143). Nothing shared was touched.

### What the code does

- `shared/assemblyHoursSource.ts` — THE decision: typed > steps (all timed)
  > not set; one untimed step = not set; the cable step reads each cable's
  > own per-foot hours (Q1); `starterHoursClearable` (Q2/Q7 rule); no "0 min".
- Bid snapshot, assembly preview, kit preview all price through it
  (`assemblyHoursSourceFor`). Bid lines freeze it, as before.
- `laborSteps` router (list / setMinutes forks a shipped step / create /
  acceptAll = "Use these times"); `assemblies.update` takes `steps`;
  `assemblies.get` returns `hoursSource`. Forks copy the step list.
- Seed: `server/seed/starterLaborSteps.ts` (library + 30 lists, NO minutes);
  generated-by-A's-loader `starterStepMinutes.ts` and
  `starterAssemblyOverhead.ts` ship EMPTY — the loader spec is plan § 14.
- Screen: assembly editor → **"More options"** (closed by default) →
  "Build hours from steps"; the quiet grey line under the hours ("Steps: 0
  of 8 timed" / "Steps add to 0.51 h" / "Priced from its steps: …").
  **Looked at on screen, tablet portrait 820×1180** (playwright,
  `scripts/deviceAudit.mts` helpers, user 1, Duplex receptacle standard):
  closed and open; unset minutes show "not set", never "0 min"; the cable
  row says its hours per foot are not set; no sideways scroll, nothing cut
  off. Nothing saved.

### Tests

`server/stepLabor.test.ts` (21) and `client/src/lib/assemblyStepsDraft.test.ts`
(5). **Red without the change:** the bid snapshot put back to typed-only
hours → 2 failed ("expected null to be '0.5000'", "… '0.2000'"); restored
→ green. `pnpm check` clean. **Full suite on `bidrender_test_c`: 375 of
379 files green.** Of the 4 red, three were this change and are fixed
(American spelling "colours"/"armour" in two step reasonings; `stepKey` added
to backup.test's identifier list; `assembly_labor_steps` given its two
decisions in forkableReferences.test) — those four files 65/65 green after.
The fourth, `starterAssembliesSeed` DV33, is the pre-existing red described
above. The Gate on the push is the full proof on a fresh database.

## Earlier (2026-10-09, later) — Gate green; looked at on screen; one false sentence fixed

- **Gate 37977597726 on `47e4bd8` (the merge): ALL GREEN** — test,
  deploy-staging, smoke; drizzle-guard skipped (no `drizzle/` change).
- **On screen, laptop 1536×864 and tablet 820×1180** (playwright via
  `scripts/deviceAudit.mts` helpers, Bar layout check 1164558, user 1).
  Two runs added by API (a 500 run, a 2" Sch 80 trench) and one 500 run
  traced through the UI, all three removed afterwards; nothing sent, the
  bid's lines untouched. Seen right: the conduit picker's
  **"Underground (18)"** fold, closed by default, below the six saved
  types; opened, **Sch 40 ½"…4" then Sch 80 ½"…4"**; the 500 type beside
  700 and armable (the UI trace armed it). The 500 Traced-footage block
  names only 500 parts (coupling, entrance end, support clip "not set",
  inside elbow), "Send 4 lines"; the Sch 80 block's tape says "the flat
  length only, not the risers". No horizontal overflow at either size.
- **Found and fixed: "Nothing traced under this type yet." beside 80 ft of
  traced raceway.** Wire comes from a run's circuits, and a run traced
  through the UI has none until somebody adds wires — so the wire rows were
  0 ft, and `runRowSendability` said every 0 ft row was "nothing traced"
  (panel AND the post-Send toast; every conduit type, 700 and EMT too).
  It now takes a REQUIRED `typeTraced` (`runTypeTraced(rows)`, shared) and
  says "No wire on these runs yet — open a run to add its wires." when the
  pipe has feet. Test in `server/takeoffBridge.test.ts`, **red without the
  fix** ("expected 'No wire…', received 'Nothing traced…'"), green with it;
  five related files 96 green; `pnpm check` clean. Looked at again on
  screen at both sizes after the fix.
- Stale comment in `RunTypePicker.tsx` ("ten shipped underground types")
  now says 18.
- Dev server stopped, whole tree; port 3004 free. Temp scripts deleted.

## Earlier (2026-10-09) — `c-sch80-500` MERGED into local-dev; Q11 answered

**Merged.** A's seed (`8f3045c`) and A's 0141 were on local-dev, so
`origin/local-dev` (`679cce8`) was merged into `c-sch80-500` and the result
pushed to local-dev as a fast-forward. Conflicts: `baselineRunTypes.ts`
and `perFootSeed.test.ts` took A's (a superset, as A's note below said);
CHANGELOG and this file kept both. **C's databases `bidrender_local_c` and
`bidrender_test_c` now have 142 migrations** (0141 applied this session).

- **`sch80And500Runs.test.ts` now runs on the SHIPPED rows**: the shipped
  `2" PVC Sch 80, underground` type (waste set → it forks; the fork keeps
  the shipped tape, which the tape line proves) and the shipped 500 type,
  raceway and parts. The stand-in company type and the shared fixture rows
  are gone; the file seeds the catalog it reads in `beforeAll`.
- **Tests:** the nine Sch 80/500 files (`sch80And500Runs`,
  `sch80And500Seed`, `surfaceRacewayFittings`, `runTypeFold`,
  `perFootSeed`, `catalogReview20261008`, `catalogReviewSeed`,
  `runNoWire`, `runTypeExtras`) — **118 green** on `bidrender_test_c`;
  `pnpm check` clean. Full suite: the Gate on the local-dev push.
- **E111 1728359 and Bar layout check 1164558 unchanged:** `bids.get`,
  `bridgeForBid`, `materialsList.get`, `takeoffSummary.forBid`, local-dev
  tip vs the merge, same `bidrender_local_c` — identical apart from the
  `preparedOn` clock.
- ~~Not done: looking at the fold and the 500 Send block on screen~~ —
  done the same day, see above.
- **Q11 (auto branch runs) answered by the owner: YES.** A detour over 3×
  the straight right-angle distance is a WARNING with the fix-it buttons,
  priced, never a block. Written into `auto-branch-runs-plan.md` § 3c,
  § 3d, § 11, § 13 on **`track-c`** (`77479ce`) — that plan lives on
  `track-c` only, not on local-dev yet.

## Earlier (2026-10-08, proof session) — tape test proven; runNoWire reds explained and fixed; still NOT MERGED

Still on `c-sch80-500`; no merge until A's seed landed (it has — above).

- **Sch 80 tape test proven.** `extraFeetForRun` temporarily made to follow
  every foot (risers included) → `sch80And500Runs.test.ts` red "expected
  116.6 to be 110"; restored → green; tree clean before commit.
- **The 9 runNoWire reds: test setup, not a bug.** The file read shipped
  rows by name and never seeded; `#12 THHN green Copper` is new with A's
  catalog review, so right after 0140 it was absent until some other file
  seeded. Reproduced on a scratch DB (seeded at `ca8030c`, migrated to 0140):
  11 red, "reading 'id'". Now it seeds in `beforeAll` → same DB 18/18 green.
- **Shuffling found two more, in `runTypeExtras.test.ts`**: user created only
  in the first describe; the $0.25 tape fork leaked into the "not priced"
  test. File-level user + per-test reset of the company's own rows: 8/12
  shuffle seeds red before, 12/12 green after.
- Eight touched test files (108 tests) green on shuffle seeds 1–8 on
  `bidrender_test_c`; `pnpm check` clean. Full suite not run on the laptop.
  Details: `sch80-and-500-plan.md` § 7b. Scratch DB and worktree removed.
- **Gate 37882413912 on `f4604c0`: test GREEN (full suite)**; drizzle-guard,
  deploy-staging and smoke skipped, as expected on a `c-*` branch.

## Earlier (2026-10-08, build session) — Sch 80/500: C's half BUILT on `c-sch80-500`, NOT MERGED

**DO NOT MERGE `c-sch80-500` INTO local-dev UNTIL TRACK A'S SEED LANDS**
(owner, 2026-10-08). The exact list A must add is
`sch80-and-500-plan.md` § 7c — nine Sch 80 underground types, the 500
rename/retire/nine adds, the 500 run type, and A's seed tests. When it is on
local-dev: merge local-dev into `c-sch80-500`, switch the Sch 80 case in
`server/sch80And500Runs.test.ts` to the shipped type (§ 7b), run the touched
files, Gate, then merge — and look at the fold and the 500 Send dialog on
screen (plan § 6).

Branch from `origin/local-dev` `d36bfc9` (A's 0140 included). Built:
`undergroundRunTypeLabel(size, schedule)` (schedule required), the fold
sorting Sch 40 then Sch 80 by size, and the 500/700 fitting family as a
closed list (`surfaceRacewaySeries`; 1500 off; `isSurfaceRaceway700`
deleted) with `fittingRowsByRunType` branching on it. The seed file was
touched only to pass `"PVC Sch 40"` to the two existing label calls. Tests
and their red-without-it checks: plan § 7b. Full suite NOT run on the
laptop. `bidrender_local_c` and `bidrender_test_c` now have **141**
migrations (0140 applied this session). One unexplained first-run red in
`runNoWire.test.ts` straight after applying 0140, not repeated — § 7b.
**Gate 37877582385 on `c-sch80-500`: test GREEN (full suite, 10m36s);**
drizzle-guard and deploy-staging skipped, as expected on a branch with no
`drizzle/` change. Gate did not run on `c-*` branches before — `gate.yml`
now includes `c-*`, as it already did `a-*`.

## Earlier (2026-10-08, session after) — owner's Sch 80/500 answers recorded; "0 marks" flash fixed

## FROM TRACK A (2026-10-09) — A's Sch 80 / 500 seed IS ON local-dev: merge `c-sch80-500` now

A's seed (`sch80-and-500-plan.md` § 7c, all four items) is on
`origin/local-dev` as **`8f3045c`** (tip `13b0dd9`), and on **staging**
(814/814 bids unchanged; `deploying.md` § 11 "Sch 80 / 500 seed"). Gate
37882505343 green (test, deploy-staging, smoke).

What C needs to know for the merge:

- **A took C's label change and fold sort FILE-IDENTICAL** from
  `c-sch80-500` (`shared/undergroundRunTypes.ts`,
  `client/src/lib/runTypeFold.ts` + `.test.ts`, and the call sites in
  `catalogReview20261008.test.ts`, `catalogReviewSeed.test.ts`,
  `runNoWire.test.ts`, `runTypeExtras.test.ts`), so those merge clean.
  NOT taken: `surfaceRacewayFittings.ts` / its test, `server/db.ts`,
  `sch80And500Runs.test.ts`, `gate.yml` — still C's to land.
- **Expect conflicts** in `server/seed/baselineRunTypes.ts` and
  `server/perFootSeed.test.ts` (A's version is a superset — take A's), in
  `CHANGELOG.md`, this file and `sch80-and-500-plan.md` (docs; keep both).
  `catalogReview20261008.test.ts` now expects 18 underground types and the
  500 type in the "#12 + ground" list.
- Seeded names exactly as § 7c: the nine 500 parts, `Surface raceway, 500
series` (renamed in place — #1683 on staging), the 500 cover retired.
  A's tests: `server/sch80And500Seed.test.ts` (fixture 91354).
- Still C's per § 7c/§ 6: switch the Sch 80 case in
  `sch80And500Runs.test.ts` to the SHIPPED type; once C's family code is in,
  its fixture 500 rows are no longer inserted (they exist); look at the fold
  ("Underground (18)") and the 500 Send dialog on screen.

## LATEST (2026-10-08, session after) — owner's Sch 80/500 answers recorded; "0 marks" flash fixed

**Part 1 — answers recorded, nothing built.** `sch80-and-500-plan.md` § 5
now holds the owner's five answers (clip spacing "not set" for 500 and 700;
separate 500/700 fitting rows; 500 type 2 #12 + ground only; Sch 80 NOT
Specialty; GR2 follows whatever pipe is traced, Sch 80 included), with
`per-foot-items-plan.md` § 7 Q1 and Q5 pointing there. **Wiremold check
(legrand.us, the maker's own pages):** flat elbow (V511 / V711) and inside
elbow (V517 / 717) are series-specific; the parts Wiremold sells as
"500/700" — 5711 twist elbow, V5783/V5784 elbow box connectors, 615 wire
pulley — are none of the nine planned rows, so nothing merges. Coupling,
tee, entrance end, clip, box, plate were not checked part by part; they stay
separate by the owner's rule. **A's 0140 (`a-catalog-review`) IS now on
local-dev** (ancestor of `91df8ea`), so the build may start — re-check the
plan's § 4 against local-dev first.

**Part 2 — the "0 marks" flash (todo.md, smoke step 10 finding).**
`sheetLine` (`client/src/lib/panelTabs.ts`) takes NULL for "not loaded"
and says "This sheet: loading…"; TakeoffPage computes `sheetLoaded` (marks
AND runs answered) and passes null to `ThisSheetLine` in the panel and on
the phone bar; RunsPanel takes a required `sheetLoaded` and its Counts /
Runs empty states show "Loading this sheet's marks/runs…" instead of
"Nothing counted…" until then. Test: `panelTabs.test.ts` +2, red without
the fix. On screen (playwright, marks response held 8 s, Bar layout check 1164558) at 1366×768 and 820×1180: loading → "3 marks · 6 items · 358 ft
of runs", no 0 in between. Script in the session scratchpad, not committed.

**Merged.** track-c `8af794d` Gate 37871005353 GREEN (test, drizzle-guard).
Merged into local-dev as **`cd8db42`** (CHANGELOG conflict with A's catalog
entry: both kept). local-dev Gate 37871700999: **test GREEN,
deploy-staging REFUSED** — "this push changes drizzle/ against what staging
runs: 0140_material_specialty.sql, \_journal.json, schema.ts". That is A's
0140, already on local-dev with its staging code push pending (A's
handoff); A's own `91df8ea` Gate 37870430753 failed identically. Nothing of
C's touches `drizzle/`. **Staging will not carry this fix until Track A
pushes staging**; not C's step.

## EARLIER (2026-10-09) — per-foot work MERGED; three leftovers fixed

**Job 1 — merged.** `c-per-foot-logic` went onto local-dev as ONE squash
commit, **`94d63fd`** (fast-forward of `ee7576c`). Took A's 0139 file and
journal entry, dropped C's stand-in, deleted A's `elbowFlat` tripwire in
`feetForRole` (`elbowFlat` was already in `FITTING_KINDS` from C's 700
code; `pnpm check` clean). **Why squashed:** `drizzle-guard` lists every
non-merge branch commit touching `drizzle/` (`git log --no-merges
origin/local-dev..HEAD -- drizzle/`), so the stand-in commit `92a7ef4` kept
it red even after the merge's tree equalled local-dev's — a merge does not
clear it. Full history stays on `origin/c-per-foot-logic` (merge `8141b66`).
`origin/track-c` was force-pushed (with lease) from that merge to the squash.
E111 1728359 and Bar layout check 1164558: `bids.get` + `bridgeForBid` +
`materialsList.get` + `takeoffSummary.forBid` byte-identical, 261df22 vs the
merge, same `bidrender_local_c`. CI: track-c Gate 37863259085 — test GREEN,
drizzle-guard GREEN. **local-dev Gate 37864063102 GREEN** — test,
deploy-staging, smoke. Staging `/api/version` served `94d63fd` (built
00:32 UTC).

**On staging (2026-10-09 00:40 UTC), through staging's own HTTP API** — no
staging JWT secret on the laptop, so no minted session: a throwaway account
(`track-c-check-<ms>@example.com`, random password not kept; staging email
fails closed) made bid **772**, attached a one-page PDF, traced a 700 run
(40 ft, a square corner, 20 ft, panel → device box, run height 10 ft, ends
5 ft / 1'6") and a 50 ft 2" underground trench, and Send all sent 9, refused
none. Lines: 700 raceway 73.5 ft, coupling 7, entrance end 1, **inside
elbow 1 (`elbow90`), flat elbow 2 (`elbowFlat`)**; 2" PVC 50 ft, **tape 50
ft (`extra`)**, connector 2, strap 10. Identical to the same fixture run
locally. Bid 772 archived (purges in 30 days); the account is left. Script:
not committed (scratchpad) — it is ~90 lines of fetch + the gate HMAC.

**Job 2 — `c-leftovers` (from `94d63fd`), one commit:**

- **a. No wire with no material.** `circuitNeedsPickedWire` in
  `shared/runNoWire.ts` (type, extra count): true when the type names no
  conductor AND says so on purpose — an underground trench (it carries an
  extra) or an empty pipe (count 0). `takeoffRuns.addCircuit` refuses with
  "Use "Pick the wire"…"; `listForSheet` rows carry `pickWireToAdd` from the
  same function, and the open run's circuit editor shows "This run's type
  names no wire." + Pick the wire / No wire (empty pipe) instead of "Add
  wires to this run" (empty pipe: Pick the wire only). **Deliberately NOT
  every no-wire type:** a raceway-only shop type with hand-added circuits is
  the manual way to measure wire (materials list "Wire, insulated"); 19
  existing tests rely on it. Looked at on screen at laptop and 820×1180
  (throwaway bid on the Old Blueridge set, deleted).
- **b. Send-dialog extras keyed by type + material + slot:**
  `run:<type>:extra:<materialId|none>:<extraKey>` (slot too, so two extras
  of one material still differ). `SendTarget` carries `extraKey`;
  `takeoffRunTypes.sendToBid` takes optional `extraKey` and sends that one
  extra. Before: one key twice, and Send all's second item reported "Nothing
  was added" because the first sent both.
- **c. Legend tab at 820×1180.** `phone` in RunsPanel is every touch layout,
  tablet included; its `px-2.5` made the tabs 331 px in a 312 px panel, so
  Legend ended at x=840. Now `px-1` (flex-1 still spreads them; measured
  62–64 px each, strip 311/311). **`pnpm device:audit` gained a hard fault,
  `cutTabs`**: a tab not wholly inside its strip and the window — the
  sideways-strip exemption had hidden it. Red before (3 faults, all
  tablet-portrait), 0 after, plans/plans-totals/capture at all four sizes.

**Tests** (`bidrender_test_c`): `runNoWire.test.ts` (+4: pure rule,
trench refused + `pickWireToAdd`, empty pipe refused, raceway-only still
allowed; the old "refuses an empty pipe on a run that already has wire"
now seeds its circuit with `createRunCircuit`, since addCircuit refuses
one there), `takeoffSummary.test.ts` (+1, two extras), `runTypeExtras.test.ts`
(+1 DB, Send all sends both). Mutation-checked: rule → 3 red; key → 2 red;
send filter → 1 red. 13 touched files, 205 passed. Full suite: CI.

**Not done:** "Pick the wire then a ground" `(2)` twin names (below) still
open.

## EARLIER (2026-10-08, late) — wire on underground runs; tape line checked on screen

Same branch, `c-per-foot-logic`, **still NOT merged into local-dev** (waits
for A's 0139 — the section below still applies word for word). **No new
column was needed**, so nothing here is for Track A.

**How a user put wire on an underground run before this (the owner's
question 1).** Only by editing the TYPE in the picker (pencil → Conductor,
count, ground), which forks it for the whole shop and moves every run of it.
From the warning itself there was no way: a route run's "Add wires" added a
circuit the type named no material for, so the wire row read "can't go on
the bid as it stands"; a quantity trace said "the type says no wire" and
offered nothing. Ignored, **the bid came in without the feeder** — said in
amber, never priced. "Empty pipe" did not exist as an answer at all: a
spare conduit stayed flagged forever.

**What is built (no column — D3(b), the existing per-run "Made of" path):**

- **"Pick the wire"** on the run's no-wire line (route and quantity) opens
  the run's `RunSpecEditor` with its wire, count — and a **ground** slot,
  shown only when the type names no ground (otherwise picking the wire left
  the circuit's ground counted with nothing named: seen on screen). Saving
  goes through `takeoffRuns.respecify`, which points the run at a type
  saying exactly that, found or made.
- **"No wire (empty pipe)"** on the same line and inside the editor:
  `respecify({ emptyPipe: true })` → a type with conductor count **0**
  (already "says no wire" in `typeCarriesWire`; NULL stays "not said").
  `runCarriesNoWire` now takes the type's answer (REQUIRED third argument,
  `emptyPipeLookup(palette)`), so a 0-type run is not flagged; all three
  callers (runs list, summary, plan attention) pass it. Refused, with the
  way out named, on a route run whose circuits already carry wire.
- **The trench keeps its tape.** `respecify` now carries the current
  type's EXTRAS (rule 7 — the editor does not show them): a match must have
  the same extras (`extrasSignature`), and a made type copies them. Before,
  picking a wire for an underground run would have landed it on a tape-less
  type and **dropped the tape off the bid** — the wrong number this job was
  for, from the fix itself. Made types are named
  `2" PVC Sch 40, 2 #6 THHN Copper, underground` /
  `2" PVC Sch 40, empty pipe, underground` (`saysUnderground`); a type with
  other extras gets `+ <extra>`.
- **Send dialog, never stuck:** the "no wire" item reads "N conduit runs
  with no wire picked — No wire picked, so none is priced. Pick the wire, or
  say it is an empty pipe." with a button ("Go to the run and pick its
  wire") that opens the first such run on its sheet with the editor open and
  scrolled into view (`fixAt` on the item, `openRunAt` in TakeoffPage —
  the drops readout uses the same function now).

**Job 2 — the tape line on screen** (playwright, real viewports 1366×768,
820×1180, 1180×820; a throwaway bid on the Old Blueridge set, deleted
after, with its made types). No sideways scroll anywhere; the Send dialog
scrolls its list inside with Cancel/Send on screen at 1366×768. Fixed:
the Runs panel's tape explanation restated the row ("211.12 ft of
Underground warning tape: 211.12 ft over 2 runs…" under "Underground
warning tape 211.12 ft") — now `how`, the sentence without its opening;
the bid note keeps the full `why`. The Send dialog showed tape = pipe feet
with no word on why — it now carries the `how` under extra lines (`note`).
Picker opened below the fold after the jump — now scrolls into view.

**Seen, not changed:** at 820 wide the panel's tab strip runs "Legend" past
the right edge (pre-existing; not checked whether it scrolls). The open
run's own "Add wires to this run" (circuit editor) still adds a circuit on
a type with no wire named — it then reads "can't go", visible, not silent.
`takeoffSummary` keys a run row `run:<type>:<role>`, so a type with TWO
extras would collide on `run:<type>:extra` — one shipped extra today, but
it needs the extra key before a second ships. Picking wire without a ground
and later with one makes a `(2)` twin name (labels do not name the ground).

**Numbers:** HEAD `4147269` vs this tree, same `bidrender_local_c`, read
only — `bids.get` + `bridgeForBid` + `materialsList.get` +
`takeoffSummary.forBid`: identical on E111 1728359 (pipe 3,996.04 ft) and
Bar layout check 1164558 ($378.15, 7 lines) except the reworded no-wire item
and its new `fixAt` (and the list's timestamp). Note E111 1728359 is owned
by local user 22173517 — run it as that user.

**Tests** (`bidrender_test_c`): `runNoWire.test.ts` (+6, incl. 5 DB: asks,
empty pipe keeps tape and reuses its type, picked wire priced with tape,
ground named and sendable, refusal), `runRespecify.test.ts` (+8),
`takeoffSummary.test.ts` (+2), `runExtrasPerFoot.test.ts` (`how`).
**Mutation-checked, 13 of 13 red.** CI: Gate 37857115190 (`8277522`, pushed to `track-c`) — `test` GREEN, `drizzle-guard` red by rule until A's 0139. The local full-suite rerun was stopped for low memory; the earlier full run was 5978 passed with one failure, in a test edited while it ran, which passes now.

## WHERE THINGS STAND (2026-10-08, before the section above — still true)

**Branch `c-per-foot-logic` now holds the per-foot SERVER HALF, wired**, on
top of local-dev `08205a6` (A's 0135–0138 + seed). Pushed; **NOT merged
into local-dev, on purpose: it waits for A's 0139 (`elbowFlat`) to be on
local-dev.** The branch carries a STAND-IN `drizzle/0139_elbow_flat_role.sql`
(+ journal entry) only so its CI can apply the role. **At merge: take A's
0139 file and journal entry, delete the stand-in**, re-point
`server/teeBodyRole.test.ts` (it names `0139_elbow_flat_role.sql` as the
newest list) at A's file name, and run that test. Same enum statement, so a
database that ran the stand-in accepts A's unchanged. C's databases
(`bidrender_local_c`, `bidrender_test_c`) have 140 recorded (the stand-in).

What is built (plan § 9 step 2):

- **Extras' feet.** `groupRunFootage` keeps every counted run's flat and
  vertical feet + resolved raceway waste on the type row (`extraRuns`;
  traced runs, mark drops as vertical only, homeruns), and
  `extraFeetForRuns` sums them. `feetForRole`'s `extra` tripwire is gone —
  the role is excluded from its switch and read in `withTracedFootage`
  through the line's `extraFeetPerFoot`.
- **One bid line per extra.** `runTypeRows` takes the type's extras
  (required) and emits role `extra` + `extraKey`. Bridge, send, Send again
  and `releaseArchivedPlanSlot` match lines by `runLineSlot(role,
runExtraKey)`, never the role alone. RunsPanel's send preview shows the
  extra's sentence (the one screen change — see "not looked at" below).
- **`bids.setExtraShared({ bidId, lineId, shared })`** — 0 / NULL on one
  extra line; refused on a locked bid and on any non-extra line. There is
  no "sent" marker in the schema; the lock is the only freeze.
  `bids.get` lines carry `extraNote` (how the feet were reached) and
  `extraShared`.
- **Materials list** lists each extra off the same runs, through the bid
  line's shared answer; unscaled runs go in the notes.
- **Extras CRUD**: `takeoffRunTypes.extras / addExtra / updateExtra /
removeExtra`; foot-sold materials only; a shipped type forks first (and a
  type already forked is resolved, not forked twice). No editor UI yet.
- **`takeoff_run_type_extras.materialId`** is now a resolver in
  `server/forkableReferences.test.ts` (`getRunTypeExtrasFor`).
- **700 family wired**: `fittingRowsByRunType` sends a type whose SHIPPED
  raceway is `Surface raceway, 700 series` to `countSurfaceRacewayFittings`;
  parts go out as coupling / connector (entrance end) / strap (clip, not set)
  / elbow90 (inside) / **elbowFlat** / teeBox (`SURFACE_RACEWAY_PART_ROLE`).
  `elbowFlat` is in `FITTING_KINDS`; a pipe answers 0 and the row stays
  quiet (`fittingRowSpeaks`).

**Numbers (local `bidrender_local_c`, read only).** Old code (worktree of
`08205a6`) vs new, same database, `bids.get` + `bridgeForBid` +
`materialsList.get`: **identical** on E111 bid 1728359 (pipe 3,996.04 ft)
and Bar layout check 1164558 ($378.15, 7 lines). The only diff is a new
`elbowFlat` fitting row at 0 per conduit type in the bridge, hidden by
`fittingRowSpeaks`. What the new counting gives on the same drawings
(computed, nothing written): E111 as a trench = 3,553.53 ft tape (drops not
in it), 3,731.23 ft at 5% waste, 0 ft shared; as 700 = 380 couplings, 38
entrance ends, 38 inside elbows, 76 flat elbows, clips not set — the same
figures this file predicted before the wiring. Bar layout's 2" PVC run =
80.24 ft tape (84.25 at 5%); as 700 = 1 inside elbow and the 131° corner
named for its 45°.

**Tests:** `server/runTypeExtras.test.ts` (10, DB), plus
`runTypeFootageCore.test.ts` (+2), `takeoffBridge.test.ts` (+3),
`surfaceRacewayFittings.test.ts` (+4); `perFootSeed.test.ts` now expects the
tape line (40 ft); `teeBodyRole.test.ts` pins 0139's append. **Mutation-
checked, 10 of 10 red:** no extraRuns push; shared answer ignored on read;
live line matched by role only; 700 branch removed; preview ignoring the
shared answer; elbowFlat speaking at 0; no lock check; materials list
skipping extras; flat elbow mapped to `elbow45`; drops counted as flat.

**Not built (next):** `qtySource` and the traced-parts JSON (0137/0138) are
still unread — `shared/tracedParts.ts` belongs with the bid half and the
GR2/GR5/DV34 recipe changes (plan § 9 step 3, after B's gap 11). The
"Shared trench?" button on the bid line and the run-type editor's Extras
block are screens nobody has built.

**CI (Gate 37847472206, pushed to `track-c`):** `test` GREEN — the full
suite. `drizzle-guard` RED, and that is the rule working: a track branch
may not touch `drizzle/`, and this one carries the stand-in 0139 and the
`schema.ts` enum line. It clears when A's 0139 is on local-dev and the merge
takes A's files (the branch's own `drizzle/` diff is then empty). Do not
"fix" it any other way.

**On screen (local, 2026-10-08):** a throwaway bid with a 52 ft 1"
underground run (deleted after). The Runs panel reads "Underground warning
tape 52 ft" with "52 ft of Underground warning tape: 52 ft over 1 run, the
flat length only, not the risers" under it; the Send dialog lists the tape
as its own 52 ft new line. Read from the DOM — **the driven tab was hidden,
so no screenshot: the LAYOUT is still unlooked-at**, at laptop or 1180x820.
Seen in passing, not changed: an underground type's send says "Cannot go on
the bid: Wire for 1 conduit run — conduit with nothing pulled through it",
which is true (no wire, by design § 3b) but reads as a fault on a trench.

## Earlier (2026-10-08, later)

**Branch `c-per-foot-logic`** (from local-dev `df25451`), pushed, **NOT
merged into local-dev — on purpose.** The owner's instruction: it merges
when A's M1–M4 have landed and C wires it up. It holds the per-foot plan's
counting that needs NO new column, as pure functions with tests:

- `shared/surfaceRacewayFittings.ts` — the 700 family (plan § 3c): couplings
  off 10 ft lengths; ONE entrance end per run at its start (none on a branch
  leg, none at an open quantity-trace start); corner = inside elbow, end drop
  = flat elbow (read by `legBends`, the same as a pipe's elbows); tee = a 700
  tee fitting (none on a tee standing on a counted box); clips "not set"
  while spacing is NULL; a corner that is not square buys its 90s and NAMES
  the 45° part it cannot buy. No field bend, 45, LB or pull box.
- `shared/runExtrasPerFoot.ts` — tape and any extra (§ 3a): `flat` or `all`
  feet × feet per foot, the run's raceway waste on top (bought, not
  installed), the line's shared-trench 0 vs NULL, unmeasurable runs counted
  apart and never added as 0.
- `shared/tracedParts.ts` — a part "from the traced run" (§ 3d): traced
  beats typed beats default; GR2's pipe falls back to its own 10 ft
  "default length" (read from the GR2 recipe in the test, not restated);
  tape with nothing traced is NOT PRICED; covered = priced on the run line,
  0 on the assembly line; coverage by material lineage.
- Tests: `surfaceRacewayFittings.test.ts` (18), `runExtrasPerFoot.test.ts`
  (10), `tracedParts.test.ts` (16). **Mutation-checked:** removing the
  branch-leg skip, counting drops as inside elbows, buying a tee on a mark,
  tape following risers, dropping waste and ignoring coverage each turn a
  named test red.

**Real numbers (local `bidrender_local_c`, read only, nothing written):**

- **E111 bid 1728359** — its footage is all 38 computed homeruns (no
  hand-traced runs left): pipe 3,996.04 ft (matches the earlier figure) =
  3,553.53 ft flat + 442.51 ft drops. As 700: 380 couplings, 38 entrance
  ends, 38 inside elbows (homerun corners), 76 flat elbows (2 drops each),
  clips not set. As a trench at 5% waste: 3,553.53 ft tape + 177.70 waste =
  3,731.23 ft — the drops are NOT in the tape.
- **Bar layout check 1164558** (real traced runs): the 2" PVC run's one
  corner is past 90°, so it buys 1 inside elbow and says the 45° part needs
  adding by hand. That case is why the sentence names the angle, and is now
  a test.

**FOR TRACK A, before M2 is final — a role the plan missed.** The 700 type
counts an inside elbow AND a flat elbow, two different parts on ONE run
type. `bid_line_items_bid_runtype_role_uq` allows one line per (bid, type,
role), so both cannot go out as `elbow90`. Entrance end → `connector`, clip
→ `strap`, tee → `teeBox` and inside elbow → `elbow90` can reuse existing
roles; **the flat elbow needs its own** (e.g. append `elbowFlat` to
`runMaterialRole` in M2, beside `extra`). Reusing `elbow45` would work in
the database and lie on every screen that labels the role. Not decided —
A's and the owner's call. Plan § 4 M2 says the same.

**Not done, and still waiting:** everything that reads a new column (extras
CRUD, the bridge, `setExtraShared`, freezing traced parts), and the seed
content (A's). The five owner questions below are still unanswered.

## Before that (2026-10-08, end of session)

**No job is in progress.** Working tree clean; `c-homerun-wiring` and
`local-dev` both at `11dbd02` (or later, if this commit). No WIP anywhere.
No dev server or background check left running.

**Per-foot extras plan — APPROVED by the owner** (`11dbd02`,
`references/per-foot-items-plan.md`). 700 is its own run type with 700
fittings; tape is the only shipped extra, on ten new underground PVC Sch 40
types; "shared trench" = 0 per bid line; GR2's pipe uses the traced run,
else 10 ft "default length".

**Order — do not start C's part early:**

1. **Track A first:** migrations M1–M4 (plan § 4) AND the seed content
   (eleven run types, tape extras, seven 700 fittings, 700 rename/retire,
   starter recipe changes). Not C's.
2. **Then C: the server / run-type half** (plan § 5 first list, § 9 step 2)
   — only once A's M1–M4 are on local-dev and on C's databases
   (`scripts/schemaDrift.mts`). Extras' feet, the bridge, extras CRUD and
   fork, `setExtraShared`, the 700 family's fitting rules.
3. **The bid-screen half waits for Track B's gap 11** ("fix this line"
   panel, `never-stuck-plan.md` § 3) and is built on top of it.

**Five owner questions (plan § 7) — still WAITING on the owner.** Suggested
answers, **NOT YET CONFIRMED** — do not build on them as decided:

1. 700 clip spacing: ships "not set" unless the owner gives a figure.
2. Add Sch 80 underground types (as well as Sch 40).
3. Merge the 500-series base/cover into one row, the same way as 700.
4. DV34 keeps its wire nuts.
5. GR2's elbow/connectors and GR5's connectors follow the traced pipe.

Note: Q2 and Q3 suggestions differ from the plan text, which ships Sch 40
only and leaves 500 alone. If the owner confirms them, update plan § 3b /
§ 3c and § 0 in the same edit.

## Earlier (2026-10-08) — 0131's two columns WIRED, branch `c-homerun-wiring`

- **Extra bends per homerun** (`bids.homerunExtraBends`): read by
  `loadBidHomeruns` and `forBid`, written by `setBidSettings`
  (`extraBends`, 0–4, NULL puts the question back). Stepper + "Accept 1" in
  HomerunControls; the folded card says "N extra bends per homerun · not
  confirmed" on its own line (the summary line is cut on a tablet).
- **Through ceiling / Box to box** (`takeoff_runs.runsAt`):
  `takeoffRuns.setRunsAt` writes root + every leg, NULL for ceiling; new legs
  copy it. Two gaps the old list did not name are fixed:
  `GroupableRun` lacked it (bid path) and `stampsClaimedByRuns` let a
  box-to-box run's marks drop on their own (`boxToBox` on the claim, required).
- **Run-ends list wording** (`@/lib/runEndWords`): amber only when
  something is missing; a level end says "level with the run" / "box to box
  — no drop". It used to say "no height for this type" for every uncounted
  end, which was true of one reason in four.
- **Numbers, E111 bid 1728359:** old code (worktree of local-dev) vs new,
  same database: identical — 3,996.04 ft conduit, 11,988.13 ft wire, 114
  field bends (38 "not confirmed"). Accept 1 moved nothing but the label. A
  10.09 ft run between duplexes 231916/231918: 27.09 → 10.09 ft conduit
  (−17.00), its 2B-1 wire 54.18 → 20.18 ft; field bends 116 → 114. Fixture run
  deleted after; the bid diffed back to identical.
- **Tests:** `runsAtBoxToBox.test.ts` (5), `homerunsRouter.test.ts` (+4),
  `groupDrops.test.ts` (+1), `runEndWords.test.ts` (4),
  `homerunText.test.ts` (+3). Five go red with the claim, leg copy or loader
  read taken out.
- **Sent / won bids:** there is no automatic freeze on status (by design,
  `shared/quantityLock.ts`). They are safe here because NULL was already
  counted as 1, so no stored bid changes number. A LOCKED bid refuses both
  controls and moves nothing (tested).
- **Cover plates audit:** `references/cover-plates-audit.md` (report only).

## How C merges (owner's rule, 2026-10-06)

**CI is the full suite, not the laptop.** Before merging into local-dev:

1. `pnpm check` and the tests the change touches, locally.
2. Push `track-c`, then wait for the GitHub Actions **Gate** run's `test` job
   to go green: `gh run list --branch track-c` / `gh run watch <id>`.
3. Pull local-dev, merge, push, and confirm the local-dev run's `test` job
   is green too.

A full local suite only when CI cannot tell you something. `gh` lives at
`C:\Program Files\GitHub CLI\gh.exe`; a shell started before it was
installed does not have it on PATH, so use the full path there.

**Read the JOB, not the run.** A local-dev run also deploys staging and runs
the `smoke` job; on 2026-10-06 every local-dev run was red on `smoke`
(`touch.spec.ts`, tracked in `track-a-handoff.md`) while `test` was green. A
red run is not by itself a red suite:
`gh run view <id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'`.

## Done

- **Multiple looks** (`references/multiple-looks-plan.md` § 10), on A's
  `symbol_looks` (0102):
  - Capturing a name already in the legend asks "Add this as another look?"
    (Yes / No, a separate item / Cancel). It stays one item: one count, one
    price. A new item gets its first look with its box. An old picture
    becomes a box-less first look only when a second look is added (no
    backfill).
  - Find all matching searches the box plus up to 5 saved looks, this set's
    first, merged so one device is one find (`client/src/lib/lookMatching.ts`).
    It can also search the looks with no box. This works on vector sheets
    (another set's look is rebuilt from that set's drawing) and on scans
    (same-set looks only).
  - The legend row shows "N looks".
  - Server tests: `server/symbolLooks.test.ts`.
- **Per-set naming, the owner's rule.** A look from another plan set may
  suggest a match, never label one. A find that only another set's look made
  is flagged "Found only by a look saved on …" and is never clear, so Confirm
  all never takes it. The rule is written into:
  - `multiple-looks-plan.md`
  - `check-my-marks-plan.md`
  - `find-all-matching-plan.md` § 4a
  - `plan-viewer-overhaul.md` § 9.4
- **Blueridge answer key** (`reader-accuracy/answer-key.json`, git-ignored,
  local):
  - The `sameAs` lists are per sheet now (`sheets[...].sameAs`, read before
    the file-wide ones), and marks can be struck (`dropMarks`), both handled
    in `scripts/readerAccuracyReport.ts`.
  - On E1.01 the "point" marks are the 7 OS occupancy/daylight sensors. The
    8th mark, on the C fixture "(A-8)", is struck.
  - On E1.02 the owner's "GFCI receptacle" count is the duplex above the
    backsplash (NOTE 7). Weld 1 and UNCC still read GFCI.
- **Scans, 85 / 85** under the corrected key: 85 found, the struck mark being
  the old miss. Demolition finds: 8/8 and 37/37 labelled. Re-run with
  `pnpm tsx scripts/scanMatchingCheck.mts` (about 2 min; it reads `dropMarks`).
- **Q6 decided:** scans stay as built, with no "Confirm all — checked by eye"
  button.
- **Remove and move a look** (plan § 5, done 2026-10-05). "N looks" on the
  legend row opens the item's looks; each has "Move" (a list of the other
  items) and an × that asks once. `takeoffStamps.removeLook` / `moveLook` /
  `looksFor`. Neither writes a mark, count, bid line or snapshot — the tests
  read all of them on an open and a locked bid, before and after. The item's
  shown picture follows (`thumbnailAfterRemoval`). A move onto an item that
  already has the same look is refused. In an open Find all matching,
  unconfirmed finds the look made are dropped unless the box found them too
  (`dropLookMatches`, plan § 7).
- **Look-alike warning, all of plan § 4** (2026-10-05/06). Before ANY
  capture saves — a new item's first look or a look added to one — the
  boxed symbol is searched on its sheet together with other items' looks on
  that set (`looksOnSet`, max 12) and, when adding, the item's own looks.
  `takeoffStamps.checkLookAlikes` (read-only) names every other item whose
  marks it lands on, or whose looks find the same spots; the card also says
  when device words differ ("Your other look has 'GF' beside it; this one
  doesn't", `lookWordNotes`, from DEVICE_WORDS only, no AI). Cancel first;
  "Save anyway" / "Add anyway". On a scan it saves and says it could not
  compare. **The check moved OUT of `captureSymbol` on 2026-10-06**: the
  spots come from the client either way, so a gate there guaranteed nothing,
  and it gave the save a second result shape.
- **"From a new look"** (plan § 8 test 7, 2026-10-06). A find only an added,
  never-confirmed look made needs a look; Confirm all leaves it. Confirming
  one by hand trusts that look (`trustLooks`). The item's first look
  (`searchLooks.isFirst`) and the box are trusted. "Confirmed once" is kept
  in the browser (`@/lib/trustedLooks`) for want of a column — it fails
  toward untrusted; see the migration request below.
- **Lines crossing symbols** (2026-10-06): measured, then built.
  `find-all-matching-plan.md` § 4b has the numbers; `scripts/lineCrossingCheck.mts`
  re-runs them. On Weld 1 E-200 crossing lines cost nothing: the 2 misses are
  not crossing lines, nothing is falsely found, no template is dirty (a first
  reading said the GFCI's was; it was the GFCI's own lines). Built anyway,
  for other exports, each made to happen in a fixture: lines running through
  the box kept out of the template, a copy cut by a crossing line offered as
  "maybe — a line crosses it" (never clear), a second anchor. E-200 reads
  exactly as before. Scans: 85/85, nothing to build.

- **Scale check** (2026-10-06, `@/lib/scaleCheck`, worker `scaleEvidence`):
  a set scale is checked against the door swings on the drawing, with the
  sheet's stated scale as tie-breaker. Amber "Scale may be wrong" beside
  the scale, "Use X" / "Keep"; never applied by itself. No test sheet has a
  scale bar or a dimension line (measured), so doors are the check.
  12/12 deliberate 2x mis-settings caught on Weld 1 + UNCC; Weld E-100's
  own "1/4"" note was questioned (its doors say 1/8"). **Owner, 2026-10-06:
  Weld is our own generated set, the note was our mistake — FIXED in the
  file** (`reader-accuracy/plans/Weld 1.pdf`, git-ignored, both E-100 notes
  now 1/8"; an incremental update, every other byte original). E-100 now
  passes clean (seen on screen: 1/8" no warning; 1/4" → "title and door
  swings say 1/8""). The three `.local-storage` copies and C's local DB rows
  (`bid_pdf_sheet_text`, `detectedScaleText`, `byteSize`) were updated to
  match. **Not updated:** staging's copy and the other worktrees' copies
  (A, B, the OneDrive folder) — copy C's file over theirs if it matters.
  Scans say they cannot check. `code-first-ceiling.md` § g. SEEN ON SCREEN
  (UNCC E111 set to 1/8"): "Scale may be wrong: title says 1/4" Use it
  Keep"; "Use it" set 1/4" and the warning cleared on the re-check.
- **Panel + fixture schedules, read-only** (2026-10-06,
  `@/lib/panelSchedules`, worker `schedules`, `SchedulesView`): a
  "Schedules" button on a sheet that has one. UNCC E003: panels 2A / 2B /
  2HA, 42/42 each, name read from "PANEL 2B" UNDER the table (the study
  had said it was not in the text); E004: 6/6 fixture types. Writes
  nothing. Seen on screen; the look caught an even-side description losing
  its first word (fixed, test). weld2's PANELBOARD SCHEDULES sheets have no
  text — code cannot read them. Columns for Track A, fitted to A's ONE
  table `bid_panels` + `bid_panel_circuits`: todo.md § "Track A next
  migration batch".
- **Circuits from device tags, read-only** (2026-10-06,
  `@/lib/circuitGroups`, worker `circuits`, `CircuitsView`: a "Circuits N"
  toggle where a sheet has tags; a docked panel built for tablets). **The
  owner's model: plans tag devices ("2B-1"), they rarely draw homeruns** —
  the drawn-homerun reader below is a kept rare-case helper, not tuned
  further (its leftovers: todo.md § "Low priority — homerun reader
  leftovers"). Each tag goes to its nearest mark within 24 pt; where two
  marks share a spot (a duplex beside a data outlet) the item most often
  tagged on its own wins; an item never tagged here (data outlets, 73) is
  listed once, not flagged mark by mark. Panel spot from a "PANEL 2B" label,
  else tapped by the user (kept per browser, `bidridge:panel-spots:`, for
  want of a column); closest device at right angles. **Measured on UNCC E111
  against the owner's 243 hand marks** (`codeFirstCeiling.mts circuits`):
  duplex 108/108, USB 38/38, GFCI 4/4, J-box 11/20 grouped, 9 flagged
  untagged, 0 off schedule. **Hand check of circuits 2B-1..2B-21 (20; 2B-14
  has no marked device), by eye on tiles with every link drawn: 102 devices
  grouped, 0 on the wrong circuit, 1 missed (2B-4's J-box, tag 26 pt away —
  flagged orange, not wrong); 19 of 20 circuits exactly right.** Outside the
  sample: 2B-31's J-box lost its tag to the duplex beside it; 4 data outlets
  took a tag at floor boxes and the 6-30R spot (no 6-30R mark in the count).
  E111 has no panel label (panels are drawn on ED111, another scale), so it
  waits for a tap. SEEN ON SCREEN at tablet size (1180x820, touch): 0
  buttons under 44 px; place 2B by tap; pick 2B-2 → rings + dashed
  right-angle path to the panel. The look caught "584 pt" shown as a
  distance (now feet only, with a scale), the "place the panel first" line
  repeated on every row, and rings 2 px wide at fit zoom — all fixed.
- **Homerun footage — DESIGN ONLY** (2026-10-06,
  `references/homerun-footage-plan.md`): Measured / Average / Measured with
  a minimum, per bid with a per-area (= per-sheet) override; drops by the
  existing drop rule; routing factor ADDED to waste on material, never
  multiplied; overridable, starts unconfirmed. Overrides "no per-area /
  ceiling heights" — noted in vertical-drops-plan § 2 and overhaul § 6.
  Four owner questions in § 11 — **ANSWERED 2026-10-06**: routing + waste
  ADD (25%), waste material only; makeup at the panel end only; unconfirmed
  homeruns COUNT with "+ N unconfirmed"; per sheet for now, BUT retail
  sheets mix drop ceiling and open deck, so a one-tap homerun height
  override (§ 6, `bid_panel_circuits.homerunCeilingInches`) and height areas
  inside a sheet BEFORE BETA (todo.md, new table `bid_height_areas`). Not
  built: the footage math waits for Track A's columns. Columns: todo.md
  "Homerun footage".
- **Homerun footage CALCULATOR, standalone** (2026-10-06,
  `shared/homerunFootage.ts`, plan § 10 step 1). Pure: devices, panel
  spot, scale, ceiling, method (Measured default / Average / Measured with
  a minimum), routing, waste → wire, conduit and labor footage, every piece
  shown (run, up-drop, down at panel, 5 ft panel makeup, routing, waste).
  § 11 as answered: routing + waste ADD, waste material only, makeup at the
  panel only, unconfirmed COUNT ("+ N unconfirmed"). Also the ceiling chain
  (homerun → area → sheet → job → company), the height-area pick (smaller
  outline wins; a shared wall is not an overlap) and a traced homerun
  suppressing the computed one. **Wired to nothing** — no table, no bid, no
  screen. `server/homerunFootage.test.ts` (44); each owner rule was broken
  on purpose once and the suite went red. Known answer from UNCC E111
  circuit 2B-1 (`codeFirstCeiling.mts homerunexample`): 546.24 pt =
  30.346 ft out, + 12.5 ft drops = 42.846 ft; wire 58.558 ft per
  conductor, 175.674 ft for 3. **Assumed, not read:** the panel spot is a
  tap on E111's "existing electrical room … in this vicinity" note (E111
  draws no panel), and the 10'-0" ceiling and 6'-0" panel are the plan's
  example heights — E111 states neither. C's local DB is one migration
  behind local-dev (`takeoff_stamps.labelWords`), which is why that script
  section reads marks with plain SQL.
- **Homeruns, read-only** (2026-10-06, `@/lib/homeruns`, worker
  `homeruns`, `HomerunsView`: a "Homeruns N" toggle on a sheet that has
  any, labels beside each arrow). **UNCC draws NO homeruns** (every device
  is tagged "2B-1"; its arrows are keynote leaders) — the homeruns are on
  Weld 1 E-100/E-200 and weld2. Hand check of 23 by eye: **19 found, 0
  wrong tag, 0 false on UNCC's 273 device tags; 1 false on weld2 p8**.
  Stacked heads = circuits 7/7; wire notes 2/2 ("3 wires + ground (from
  the note)"); no sheet draws ticks and none are claimed. **Tied to a
  schedule: none possible on the test sets** — UNCC has the readable
  schedule but no homeruns, Weld's schedules have no text; every label says
  "Panel 3LP: no schedule read on this set" and the tie is fixture-tested.
  Wire counts are never inferred. Seen on screen (E-200, bid 1728356);
  labels covering their own tags and two boxes stacked were caught there
  and fixed. `code-first-ceiling.md` § d has the misses; section
  `homerunreader` of `codeFirstCeiling.mts` re-measures. Columns for A:
  todo.md § "Homeruns read from the plan".
- **Code-first ceiling study** (2026-10-06, plan only, NOT merged):
  `references/code-first-ceiling.md`, numbers from
  `scripts/codeFirstCeiling.mts`. Top 3 by payoff: tie labels to devices
  (USB 0 -> 38/38, GF 1 -> 4/4 on UNCC E111), use CAD layers when present
  (Weld 1: demolition / existing / telecom sorted free, search 14x faster),
  read panel schedules from text (UNCC 3/3 panels, 42/42 circuits). New
  this study: UNCC E111 HAS a hand count (243, sheet 234268) — 93% found.

## Not built yet

1. **Seen on screen 2026-10-06 (Weld 1 E-200):** a NEW item's capture
   warned "1 mark counted as Look test tag", and one warned "12 places a
   look of Look test third also finds and 1 mark counted as …", Cancel
   first. **Still not seen on screen (second try, 2026-10-06):**
   - the device-word note — **and it cannot show on today's sheets**: the
     matcher's word ring reads 1 of 45 labelled devices on UNCC E111 (USB
     labels sit 14.3 pt out, just past it) and Weld 1 has no GF text at the
     GFCI. A GFCI + plain-duplex look pair was added on E-200 and correctly
     said nothing. Fix the ring first (`code-first-ceiling.md` § b, rank 1);
   - "Found only by a look added recently" in the Find panel — the setup
     was in place (GFCI item with an added duplex look) when the Chrome
     window was minimized and the tab went hidden. Rests on its tests.
     **Found on screen and fixed:** a click with no drag opened the name card
     and saved an item with no picture, no look and no check
     (`isCaptureBox`, `shared/symbolCapture.ts`).
   - **Labels tied to devices: SEEN ON SCREEN 2026-10-06 (UNCC E111).** A
     plain duplex boxed: 141 found, 97 clear, 44 need a look; 36 rings say
     "USB" and 3 say "may be a GFCI", each with "Beside it: …"; the selected
     USB find reads "Needs a look — "USB" is written beside it — it may be a
     USB receptacle … Beside it: USB", and Confirm all takes only the 97.
     The ring fix also makes the device-word NOTE on the capture card able
     to show — not re-checked on screen. CAD layers (job b) were not seen on
     screen: the tab went hidden; they rest on the measurement and tests.
   - **Driving the browser:** the extension's drags often send no
     pointermove, so boxes come out empty and short pans do nothing.
     Dispatch PointerEvents in-page instead (memory: local verification
     gotchas).
2. ~~Demolition plans on VECTOR sheets by their title~~ **DONE 2026-10-06**
   (`@/lib/vectorPlans`): the scans' `planTitles` / `planRegions` on the
   vector text, with an ink map from the line work, plus one vector-only
   step — a region grows LEFT to the white gap (E-200's demolition title
   sits ~300 pt right of its drawing's edge). Known answer on Weld 1 E-200:
   demolition-plan finds clear **4 -> 0**, marked demolition **2 -> 21 of
   21**, plan A's 53 untouched; the same with no layer information. Hand
   count unchanged (44/46). The scan path is unchanged.
3. **"Find on this sheet" from one look** (plan § 5), the third action on a
   look.
4. **The per-row choice in whole-legend capture** (`LegendCapture.tsx`): a
   matching name keeps "left as it is", which is the decided default. The
   choice to make it another look is missing.
5. **Sending looks to the Reader** (plan § 3): every look under the item's
   one label, the set's own first, up to the cap. Measure first with
   `scripts/readerAccuracy.mts` methods (b)/(d), 1 look against 3.
6. **Size-aware matching across plan sets.** The line matcher compares exact
   sizes, so a look from a set drawn at another size finds nothing. Seen on
   screen: a UNCC duplex look found 0 on Weld 1 E-200. Candidate:
   `scaleTemplate` (already in `findMatching.ts`, used by the sheet check)
   at a few sizes, with every such find staying a suggestion under the
   per-set rule.

## Plans screen polish — DONE 2026-10-06

Asked by the owner as three items; none was written in this file before.

1. **Layers higher**: out of the Legend tab (4th of 5) to under "This
   sheet", pinned on every tab (`RunsPanel` `layers` slot). It filters marks
   AND runs, so it could not go in one tab. Still shut by default with
   "N hidden" in its header; the open body is capped at 40dvh because it
   sits outside the panel's one scroller.
2. **Set scale**: a yellow button on a sheet with no scale (grey where the
   sheet says NOT TO SCALE), muted once set. Narrows overhaul § 4a.2 —
   noted there and in `ScaleControl`'s header. Trade-off seen: E0.01, a
   notes sheet with nothing to measure, shows it yellow too.
3. **Dashboard**: "Recent plans" moved up under the start cards; once
   graduated, "Upload a plan" is its own yellow button and "New bid ▾" is
   outline (`NewBidMenu`). The sidebar Plans entry stays deferred (todo.md,
   owner 2026-09-27).

Seen on screen with playwright (laptop, tablet, phone; graduated header
seen by giving user 1 a labor rate for the shot, then setting it back to
0); `pnpm device:audit --check` 0 hard faults on dashboard / plans /
totals / capture. C's local DB was brought to all 125 migrations to run it.

## The exact next step

### MERGE NOTE FOR TRACK A (2026-10-08) — `c-homerun-footage` is ready; A merges it

> **DONE by Track A, 2026-10-08:** merged into local-dev as `bea4d8f` with
> 0131 (`bids.homerunExtraBends`, `takeoff_runs.runsAt`, both NULL = today's
> behaviour) and the example tags (0132–0134). Staging was migrated through
> 0134 first, with every bid total unchanged, and now serves `bea4d8f` (Gate
> green). Mirror branch deleted. **Nothing reads the two new columns yet**:
> C wires them and enables the two held controls (`track-a-handoff.md`
> session 17).

**local-dev (`615f122`) is merged INTO the branch** (merge `96635c1`). A
merges the branch into local-dev WITH migrations 0125–0130 (pairing rule).
**local-dev still ends at 0124 — no renumbering needed;** if anything lands
above 0124 first, renumber 0125–0130 above it before merging.

**What clashed, and how it was fixed:**

| File                                                        | Clash                                                                                                                                              | Fix                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/lineNotPriced.ts`                                   | B's `hours` and C's `drops` on `NotPricedTally`; **git kept TWO `tallyLeavesOut` functions** (B's read hours, C's read drops)                      | One type with both; ONE `tallyLeavesOut` reading lines, parts, hours AND drops |
| `shared/proposal.ts`                                        | same `pricePending` line                                                                                                                           | kept B's `hoursPending`                                                        |
| `client/src/lib/notPricedTotal.ts`                          | B restructured suffix/headline (priced items, then hours)                                                                                          | B's shape, drops in the priced group                                           |
| `client/src/lib/notPricedTotal.ts` — **NO conflict marker** | B's new `materialsShare` (totals split) built the tally field by field and **silently dropped `drops`**: Materials row lost "+ N drops not priced" | carries drops (missing drop MATERIAL); `laborShare` unchanged                  |
| `notPricedTotal.test.ts`, `dashboardFollowsDrawing.test.ts` | C's one-token `, 0` edits vs B's edits                                                                                                             | took B's files whole, re-added the required `dropsNotPriced` argument          |
| `server/routers/assembliesRouter.ts`                        | imports                                                                                                                                            | both kept                                                                      |
| `CHANGELOG.md`                                              | both sides' 2026-10-07 entries                                                                                                                     | both kept                                                                      |

**Kept from local-dev, checked present:** Most used row (`MostUsedRow`,
both pickers), totals split (`materialsShare`/`laborShare`), upload stream
fix (`disableStream` in `shared/pdfRangeLoading.ts`), Labor-only tick box
(beside C's "Mounts at" in the assembly editor).

**Checked:** `pnpm check` clean; touched tests 152/152 locally
(dropsNotPriced, notPricedTotal, dashboardFollowsDrawing, proposal,
deviceMountKind, groupDrops, assemblies). Full suite: GitHub Actions run
37709024423 on the mirror branch `a-ci-c-homerun-footage` (the Gate does
not run on `c-*`; a `track-*` name would trip drizzle-guard on A's 0125–0130
commits). **Delete `a-ci-c-homerun-footage` after merging.** On screen at
1180x820 touch: E111 38 homeruns / 11,988.1 ft wire / 2B-1 42.8 ft
(unchanged by the merge); Ceilings panel opens; Most used row shows (3
throwaway bids made for it, deleted); bid totals "Materials $0.00 + 205
drops not priced", Labor without it; no page errors.

**A must check after merging:** (1) CI green on local-dev; (2) apply
0125–0130 to staging BEFORE the code reaches it (step 1, additive — the
Gate's deploy refuses a drizzle/ change anyway). The catalog rename was
checked: no test this branch adds or changes looks a material up by a
renamed name (`'1/2" EMT'` is not renamed; `"#12 THHN"` is used only in
local-dev's own tests).

**Patent Option A — DONE on `c-homerun-footage` (2026-10-07).** The dashed
one-corner device-to-panel line is removed from `CircuitLayer`; a picked
circuit's devices are ringed (leaving device larger) and the panel stays
marked, with NO path between them. Length math untouched (homerun suites
pass unchanged). Guard: `server/noHomerunPath.test.ts` (reads the layer's
source, comments stripped; red on the old file). Seen at 1180x820 touch on
E111, circuit 2B-1: 7 rings, 1 panel mark, 0 line elements, 42.8 ft.
`references/homerun-patent-notes.md` § 4 now quotes claims 1, 13 and 4–9
(fetched from Google Patents; attorney to verify the wording) and says per
element what the app does. Honest flag in it: |Δx| + |Δy| equals the length
of the one-corner orthogonal path even with nothing drawn. Do NOT add a
straight-line / "direct" option (claim 1).

**Drops not priced are in the bid's not-priced check — DONE on
`c-homerun-footage` (2026-10-07, owner YES).** `NotPricedTally.drops`
(optional, so B's lines-only tallies need no edit), `withDropsNotPriced`
(adds nothing when 0), `tallyLeavesOut` (the print's gate),
`db.bidDropsNotPriced` → `bids.get.dropsNotPriced` and the proposal's tally.
`bidNotPricedCount(lines, dropsNotPriced)` takes it as a REQUIRED argument.
Seen at 1180x820 touch on E111 (a $100 line added for the check, removed
after): totals "$100.00 + 205 drops not priced", strip "205 drops not priced
— drop material not set …", proposal "Price pending", Print blocked:
"205 drops are not priced … until they are priced on the Plans screen".
**Merge hazard for A/B:** local-dev's own `tallyLeavesOut` (with `hours`)
must keep drops — `server/dropsNotPriced.test.ts` guards it (todo.md).
Not in analytics or dashboard cards (todo, owner's call).

**Patent notes — PLAN ONLY:** `references/homerun-patent-notes.md` for the
attorney (US 11,120,171): how each method gets its length (right-angle
distance, no route stored, one dashed display line when a circuit is
picked), nothing like avoid-areas or tray-following, and options A (drop the
display line), B (user traces every homerun), C (typed lengths only).

**Viewing never changes a saved number; drop material not set is said; run
names say "No drop here" — DONE on `c-homerun-footage` (2026-10-07).**

- **Homeruns:** `syncHomerunCircuit` takes `repoint` (required). A visit's
  `homeruns.syncSheet` only creates circuits it has not seen (leaving device
  written once); `rematch: true` re-points UNCONFIRMED ones (confirmed never)
  and returns `{ created, repointed }`. Sent by "Re-match homeruns on this
  sheet" (Circuits panel, beside Confirm) and by the first sync after a
  panel is placed or removed BY HAND (`rematchOnNextSync`). A "PANEL 2B"
  label only fills a panel with no saved spot — it used to move a
  hand-placed one back on every visit.
- **Seen at 1180x820 touch, UNCC E111:** three open/close visits — totals
  identical (38 homeruns, 3,996.04 ft pipe, 11,988.13 ft wire, same leaving
  devices). Then 3 unconfirmed homerun devices pointed elsewhere by SQL (as an
  old sync left them): 3 visits identical at 4,271.28 / 12,813.84 ft (the old
  code moved them on the first); "Re-match" → toast "3 homeruns re-matched
  to the device now closest", 3,996.04 / 11,988.13 ft; 3 more visits
  identical.
- **No drop material:** `groupDrops` reason is `DROP_MATERIAL_NOT_SET`
  ("drop material not set") with `notPricedDrops` (wanted, with a height,
  not claimed); row "Drop material not set — 86 drops not priced";
  Totals "205 drops not priced — drop material not set on 5 counted items.
  Not in these totals."; materials list "NOT on this list: …". Never 0 ft.
  The BID page does not say it yet (todo, owner's call).
- **Run name:** `runNameParts` names an end at run height
  `END_NO_DROP_LABEL` — "Panel → No drop here" (owner wrote "No drop";
  kept the full phrase so name, row, chip and picker are one string).
- Tests: `homerunsRouter.test.ts` (three visits identical — red with the old
  re-pointing; Re-match re-points unconfirmed only), `groupDrops.test.ts`
  +3 (+1 reworded), `deviceMountKind.test.ts` +1 (Totals + materials list),
  `takeoffVerticals.test.ts` run name.

**Count drops from the item, Data/TV type, "No drop here" picker — DONE on
`c-homerun-footage` (2026-10-07, owner's three YESes), no new column.**

- **Count drops:** `loadGroupDrops` resolves each count's kind with
  `deviceKind` (count's "Each drops to", else its item's "Mounts at"; the
  row says "— from the item" and "(default height)"). The run type a drop is
  made of is still asked per count. **No box twice:** a box a computed
  homerun rises from (up-drop counted) is claimed like a run end's
  (`groupDrops` `homerunClaims`, REQUIRED); the row says "N marks are where
  a homerun rises". `takeoffRuns.drops` labels by the resolved kind.
- **Data / TV / Low voltage:** shipped type `low-voltage`, 18", common.
  Starters MS6/MS7/MS8 ship `mountsAt: "low-voltage"` (insert, plus a
  fill-only pass in `seedBaselineAssemblies` — never over an answer).
- **Wording:** `endKindLabel(distribution)` = `END_NO_DROP_LABEL` ("No drop
  here"), so the picker beside the chip and the trace toolbar match it; the
  picker now sizes to its text (it cut "No drop he" at tablet size — seen).
  The "Mounts at" picker was widened too (cut "Data / TV / Low voltage –").
- **Measured, old rule vs new on the SAME data** (code switched, all
  counts given 1/2" EMT as their drop type, items: duplex, double duplex,
  USB, GFCI → Receptacle; switch → Switch; J-box → wall J-box; data/TV →
  Data/TV):
  - UNCC E111: count drops 108 → 205, pipe 918.00 → 1,645.00 ft, wire
    3,672.00 → 6,580.00 ft; **boxes counted twice 22 → 0**; homeruns
    76/76 either way (3,996.04 ft).
  - Weld 1 E-200 (answer-key bid 1728355): count drops 0 → 30, pipe 0 →
    173.50 ft, wire 0 → 694.00 ft (no homeruns on that bid).
  - Data/TV on E111: homerun drops 75 → 76 of 76, installed 3,987.54 →
    3,996.04 ft, wire 11,962.63 → 11,988.13 ft.
  - Hand checks: E111 190 × 8.5 + 15 × 2 = 1,645; Weld 11 × 2 + 15 × 8.5 +
    4 × 6 = 173.5.
- **Seen at 1180x820 touch:** "Mounts at" lists "Data / TV / Low voltage —
  1'-6"" and saved it on the data item; the five E111 counts read "… — from
  the item", "(default height)", "22 / 5 / 7 / 1 marks are where a homerun
  rises"; a run end at "No drop here" shows it on chip and picker.
- **Left in C's local DB:** the "Mounts at" answers on user 22173517's
  items (that is the shop library). Every count's drop type and the test
  runs were put back.
- **Measuring note:** opening the Circuits panel re-points unconfirmed
  homeruns, so homerun numbers move between visits (todo.md).
- Tests: `deviceMountKind.test.ts` +5 (2 red with the change switched off),
  `groupDrops.test.ts` +3 (homerun claims), `takeoffVerticals.test.ts`
  (new type; end label — red before).

**Shop default heights + "No drop here" — DONE on `c-homerun-footage`
(2026-10-07), no new column** (the owner asked for columns; every answer
already had one — table in `migrations-next-batch.md` § Batch C, todo.md
beside it).

- **Device type from the item:** `deviceKind(dropKind, assemblies.mountHeightTypeKey)`
  (0110, unread until now) for homeruns (`loadBidHomeruns`) and linked run
  ends (`getMarksLinkedByRuns`), resolved through forks
  (`getAssemblyMountKinds`). Set as "Mounts at" in the assembly editor
  (`assemblies.mountTypes`, library permission); refused if not a height
  type (`server/knownHeightKind.ts`, shared with run ends). Count drops
  unchanged (todo, owner's call).
- **"default height"** where the type's height is in use: homerun rows
  ("8.5 ft up (default height)", `homerunBreakdown` takes the source,
  required) and run ends (`@/lib/heightSourceWords`). A device with no type:
  "up not counted — device type not said".
- **Open space:** the chip "Nothing" is now **"No drop here"** (same saved
  answer: end kind `distribution`); an unanswered end reads "nothing there —
  no drop counted" with "Pick what is here … or No drop here"; a drag that
  leaves an end bare lights it in Run ends and says so in a toast.
- **UNCC E111 (bid 1728359), duplex count answered as Receptacle, panel
  6'-0" on the bid:** before 62 of 76 homerun drops (14 up missing: 7 USB,
  3 GFCI, 3 J-box, 1 TV data), 4,028.31 ft pipe, 12,084.94 ft wire. After
  "Mounts at" (USB by tablet screen; GFCI — a shipped item, forked — and
  J-box by API): 75 of 76, 4,119.31 ft (+91.00 = 10 × 8.5 + 3 × 2), wire
  12,357.94. The 16 in the earlier note could not be reproduced: the
  leaving devices have been re-synced since. Circuits panel on screen: 37
  rows "(default height)", 1 "device type not said".
- **Open-space end, on screen at 1180x820 touch:** a run onto duplex A,
  8.5 ft drop, 3 straps. Dragged into open space: end lit, "nothing there —
  no drop counted", 17 ft, "At least 3 straps … (1 run has a drop with no
  height …)". "No drop here": "no drop here", warning gone, 3 straps, kind
  `distribution` saved. Fixture run removed; the homerun setup on the bid
  (scale, panel spot, homerun type, duplex Receptacle, panel 6'-0", the
  three "Mounts at") is LEFT for the next check.
- Tests: `server/deviceMountKind.test.ts` (8; 5 red with `deviceKind`
  ignoring the item), runSetPoints +1, `heightSourceWords.test.ts`,
  homerunText +2, runEndPicks label.

**Track B's Gap 1 is FIXED on `c-homerun-footage` (2026-10-07)** —
`references/track-b-plans-screen-gaps-plan.md` on branch `track-b`, which C
cannot edit: **Track B, mark Gap 1 done there and do not build it again.**
A run end that is dragged (or moved by removing an end point) now claims the
mark it is let go on, or nothing in open space. What "claimed" means is
unchanged: `startStampId` / `endStampId`, the run takes that box's drop and
the mark's own drop is held back (`endOfRun`, `groupDrops`).

- Client: `endClaimsAfterEdit` (`@/lib/legSnap`) in TraceLayer's one
  `commitEdit`, same `snapToMark` as a trace click (never an unconfirmed
  mark); an exact hit on a mark's connect point wins, since the drag snapped
  there. An end that did not move and a tee end are not sent. Undo and redo
  carry the claims (`undoStack` `setPoints` / `restorePoints` `ends`).
- Server: `setPoints` takes optional `startStampId` / `endStampId`, checked by
  `requireClaimableMarks` (shared with `setEnds`: own sheet, confirmed),
  refuses a mark on a tee end, and clears that end's `startConnect` /
  `endConnect` when the claim changes. The end keeps its KIND.
- Tests: `server/runSetPoints.test.ts` (7 new; 3 go red with the claim write
  off — off the mark, onto B, connect cleared) and `legSnap.test.ts` (6).
- **Seen on screen, 1180x820 touch, UNCC E111** (bid 1728359, fixture removed
  after): a 10 ft run ending on duplex A. Before: run 10 + 8.50 drop,
  107 duplexes drop on their own (909.50 ft), EMT 928.00 ft. Dragged onto B:
  claims B, run `13.28 + 8.50`, A drops again, EMT 931.28. Dragged into open
  space: claim gone, run 17 ft with no drop, 108 duplexes drop (918.00), EMT
  935.00 — before the fix this read 17 + 8.50 from A and 107. Ctrl+Z:
  "Undone: run points edited", back on A, `9.98 + 8.50`, 107.
- **Seen and left as is:** an end dragged off a mark that had no kind of its
  own (it read the mark's) is "nothing there", so the fittings say "1 run has
  a drop with no height, so its length is short". True — nobody has said what
  is at that end — but owner's call whether the end should keep the device's
  kind instead.

**`c-homerun-footage` IS READY FOR TRACK A** (since 2026-10-07, when
homerun couplings, connectors and straps landed — the owner's condition:
"this must be done before Track A merges the branch"). Everything added
since (height areas; one ceiling rule for every drop; pass-through drops;
homerun bends) is on the same branch and ready with it.

**THE MERGE RULE — for Track A:**

1. **The branch merges TOGETHER WITH A's migrations 0125–0130**
   (`a-batch-c-0125`, already merged into the branch). Never the branch
   without them: its code reads `bid_panels`, `bid_panel_circuits`,
   `bid_height_areas`, the `bids` / `bid_pdf_sheets` homerun columns and
   `takeoff_run_circuits.panelCircuitId`, and a bare `select()` on a
   database without them takes the Plans screen down. Never the migrations
   without the code either (pairing rule).
2. **If ANY other migration lands on staging or live first, A renumbers
   0125–0130 above it before merging.** The migrator skips a file numbered
   below one already applied (§ R.1 in migrations-next-batch.md), so a
   0125 behind an applied 0131 is silently never run. Checked 2026-10-07:
   local-dev still ends at 0124, so no renumbering yet.
3. **Two more columns are asked** (migrations-next-batch.md § Batch C):
   `bids.homerunExtraBends` and `takeoff_runs.runsAt`. The branch does NOT
   need them to merge — it treats them as not set (1 extra bend,
   unconfirmed; every run through the ceiling) and holds their two
   controls. When they land, C wires them (the list of what is owed is in
   that section).
4. **These change bid numbers** (owner-approved): runs and count drops now
   read the sheet's ceiling and height areas; a pass-through box counts two
   drops; homeruns count bends. Before/after for UNCC E111 are in
   homerun-footage-plan.md § 10.

**Homerun footage steps 2–4 are BUILT on branch `c-homerun-footage`
(2026-10-07), on Track A's 0125–0130 (`a-batch-c-0125`). DO NOT merge that
branch into track-c or local-dev:** staging would get code that asks for
columns it does not have. Track A merges it WITH the migrations (pairing
rule 3). What is on it, and what is not, is in
`homerun-footage-plan.md` § 10; the two notes for A are in
`migrations-next-batch.md` § Batch C. **track-c itself does not have this
work** — anything new on track-c meanwhile must not touch
`groupRunFootage`'s inputs, or the merge will conflict (the branch makes
`homeruns` a required input).

C's two local databases (`bidrender_local_c`, `bidrender_test_c`) are at
**131 migrations** (through 0130) since 2026-10-07 — ahead of track-c's
code, which is fine (additive). The server tests for the branch need
`bidrender_test_c`: `server/homerunsRouter.test.ts` (12),
`server/homerunsCore.test.ts` (22), `server/homerunFootage.test.ts` (44),
plus `client/src/lib/homerunSync.test.ts` and `homerunText.test.ts`.

Homerun fittings: DONE (plan § 10), bends included since 2026-10-07.
Height areas: DONE, reachable from "Ceilings" on every scaled sheet, read
by every drop. Reshaping an area is a before-beta todo. Next on homeruns,
when the owner says: tying a traced run
to a circuit (`panelCircuitId` is read, nothing sets it); per-sheet
average/minimum amounts on screen.

**Older next step (still open), item 1, the on-screen pass**, then item 2. For the screen: Weld 1 E-200
(vector) on "Legend capture check" (bid 1728356) and the trick from
2026-10-05 — a mark on a tag square, then box the same square as another
item — gives the card its warning in one capture.

## Migrations Track A would need

**None for anything above.** Everything listed runs on existing tables.
**New, 2026-10-06 — all three are in `todo.md` § "Track A next migration
batch" (Find all matching / looks), where A numbers them:**

- `symbol_looks.confirmedAt` (timestamp NULL, additive): when a look was
  first confirmed by hand. Today that lives in each browser
  (`@/lib/trustedLooks`), so a colleague's browser asks again — safe, but
  not shared. With the column, `searchLooks` returns it and the browser
  copy goes.
- **Words on a mark** — `takeoff_stamps.labelWords` (text NULL, additive):
  the labels Find all matching tied to a device when it was confirmed
  (`tieLabels`: "USB", `54"`, "(E)", "A2"). Today they show on the FIND
  only and are gone once the mark is placed, so a mark cannot say "54 inch
  height" or "tag A2" later, and the bid cannot price by them. NULL = never
  read (a hand mark, or before the column). A HEIGHT needs no new column:
  `takeoff_stamps.mountHeightInches` + `mountHeightSource` already exist
  (0098, on staging) — a `mountingHeightIn` asked for here on 2026-10-06 was
  a duplicate of Track C's own 2026-10-01 request, withdrawn after A caught
  it. Search todo.md for the TABLE before asking for a column. Status
  "existing" needs nothing new: mark status already holds it.

Requests that already stand, unchanged:

- `bid_pdf_legend_entries.lookId` (nullable, set null): only if A builds its
  per-set legend plan. It would also become a third way for a set to confirm
  a look (`shared/symbolLooks.ts`, `lookConfirmsSet`).
- The decision log for scan finds (`scanned-plans-plan.md` § 5), for a future
  detector. Not urgent.
- A unique key on `symbol_links (userId, lookupKey)` (A's R.6). "One item per
  name" is still enforced only in code.
