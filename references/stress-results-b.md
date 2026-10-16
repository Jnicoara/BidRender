# Track B — stress results (overnight 2026-10-14 → 15)

Screens B owns: Plans / takeoff, plan-reading help, starter offers. Every
number here was measured on this laptop (local MySQL 3307, dev server on
3002 unless it says "build"); the method is next to it. **Expected, not
bugs:** missing prices, missing hours, "Not priced" and "Example" labels.

## Round 1 — starter offers at scale

Method: `scripts/_stressOffers.mts` (throwaway, deleted) against
`bidrender_test_b`: N throwaway shops (users 7,000,000+), one probe
material, then K more changes; times read off `Date.now()` around each call.

| What                                   | 306 shops          | 2,006 shops          |
| -------------------------------------- | ------------------ | -------------------- |
| Preview, first edit of a row           | 928 ms → **27 ms** | 7,321 ms → **27 ms** |
| Confirm, first edit (forks every shop) | 932 ms             | **6,693 ms**         |
| Each later change to that row          | **414 ms → 10 ms** | 15–18 ms             |
| One shop's offer read                  | 9 ms               | 5 ms                 |
| Accept all (2 offers)                  | 20 ms              | 13 ms                |

- **Fixed — a change pinned nobody but still visited every shop.**
  `pinCompanies` asked the fork function about each of N shops (two queries
  each) to learn they already had a copy: 414 ms per change at 306 shops,
  about 4 s at 3,000, an hour for a 1,000-row sheet in ONE transaction.
  Now one query lists the shops with no copy the fork would reuse
  (`unpinnedOwners`); the fork stays the authority for every shop listed.
- **Fixed — the preview forked every shop to count them.** It is a
  rolled-back dry run; it now counts the same list (`countPins`) and forks
  nobody: 7.3 s → 27 ms at 2,006 shops. Plan test 14 (preview pins =
  Confirm pins) still holds, and now covers a shop with its own copy (not
  pinned, but offered).
- **Left, written up:** Confirm on a row's FIRST edit forks a copy for every
  shop without one — about 3.3 ms per shop (6.7 s at 2,006). It is one
  admin action per row, and live has a handful of shops today. The Confirm
  button now says "Saving…". A set-based fork would restate each table's
  fork rules, which is the risk `forkedRows.ts` exists to avoid; not worth
  it until there are thousands of shops. `morning-questions-b.md` Q2.

## Round 2 — Plans screen, thousands of marks

Method: `scripts/_stressSetup.mts` (throwaway) made bids for user 1 on the
local DB with the 18-sheet `weld2` set and N marks on sheet 1, placed through
the real `takeoffStamps.drop` route (500 a call, its limit; median 81 ms per
500). `scripts/_plansStress.mts` (throwaway, playwright, laptop 1536):
open the sheet, then 10 wheel zooms in, a 20-step drag, 10 zooms out, with a
`longtask` PerformanceObserver. "Long tasks" = main-thread blocks > 50 ms.

| Marks on the sheet | Build       | 10 zooms in                   | 20-step pan                       | Heap   |
| ------------------ | ----------- | ----------------------------- | --------------------------------- | ------ |
| 5                  | prod        | 520 ms, 0 long                | 364 ms, 0 long                    | 31 MB  |
| 1,000              | prod        | 681 ms, 0 long                | 397 ms, 0 long                    | 33 MB  |
| 5,000              | dev, before | 5,549 ms                      | **5,190 ms, 23 long (worst 459)** | 169 MB |
| 5,000              | dev, after  | 6,407 ms                      | **810 ms, 2 long**                | 208 MB |
| 5,000              | prod, after | 3,002 ms, 19 long (worst 260) | 509 ms, 1 long (90)               | 69 MB  |

- **Fixed — every pan step re-rendered every mark.** The marks were drawn
  inline in `TraceLayer`, fed an array rebuilt in `TakeoffPage`'s JSX on
  every render, so ANY state change on the Plans screen (each pan step, a
  panel, the crosshair) re-rendered all of them. Now a memoized `MarkLayer`
  with a stable click callback, and `layerStamps` memoized on the marks.
  Pan at 5,000 marks: 5.2 s → 0.8 s (dev), 23 → 2 long tasks.
- **Left, written up:** zoom still re-renders every mark (a mark's drawn
  size depends on the zoom), about 130–260 ms per wheel step at 5,000 marks
  in production, none at 1,000. Real sheets carry hundreds, not thousands.
  The fix is drawing marks at unit size under one CSS scale, which changes
  how every mark is painted — a visual change to check by eye, not a
  2 a.m. change.
- **Checked, not a bug:** Shift-click adds a mark to the selection (1 → 2
  on marks 35 pt apart). An early probe said otherwise because its five
  fixture marks overlapped 6 pt apart and the second click hit the first.
- Load to 5,000 marks visible: 6.8 s production, 4.7 s for the same sheet
  with 5 marks — the sheet's own render is most of it.

## Round 3 — the 500-sheet set (270 MB), byte ranges and fast clicking

Method: production build on 3002; playwright laptop. Requests to
`/manus-storage/` logged with their Range header and time; a page-level
wrapper on `Worker.prototype.postMessage` logged every job sent to the PDF
worker. `scripts/_pdfBytes.mts` (Node, a counting range transport) measured
pdf.js on its own. All throwaway, deleted.

- **Fixed — opening the set downloaded all 270 MB in the background.**
  Plan-viewer-overhaul § 17.3 measured this set opening on ~2.8 MB. Tonight,
  after sheet 1 drew (1.3 s), range requests walked the WHOLE file, 0 →
  270 MB in 1 MB steps, for ~30 s. pdf.js alone reads 4.1 MB for open +
  page 1 + its text, drawing and outline (Node). The walk came from the
  viewer's own `circuits` / `homeruns` jobs: when the sheet on screen has
  anything that reads as a circuit tag — the COVER sheet did — the worker's
  `panelsInDoc` read the text of every one of the 500 pages through pdf.js to
  find panel schedules. Now the server names the pages whose stored upload
  text has a "CKT" header (`bidPdfs.schedulePages`, 21 of 500 here) and the
  worker reads only those; null (text not stored for every page) keeps the
  old full read. Ranges after open: one sweep → **~35 requests, done at
  3.7 s**.
- **Also fixed, smaller:** the bookmark outline was read on EVERY open,
  though it only names sheet rows that do not exist yet; now only while a
  page lacks a row (`outlineNeeded`). It was not the walk (measured), but it
  was work on every open.
- **Fast clicking:** 20 "Next sheet" presses 60 ms apart land on sheet
  21/500 in 3.5 s, one long task (57 ms). (An earlier probe read "Sheet 6":
  its locator matched a sheet LIST row named "Sheet 6", not the chip.)
- Heap 38 MB with the set open.

## Round 4 — failure drills on the Plans screen

Method: `scripts/_drillEye.mts` (throwaway), production build, laptop. "API
down": playwright aborts every tRPC POST (`internetdisconnected`) while a
fresh plain count places 10 marks, then lets them through. "Storage down":
it aborts every `/manus-storage/` request on the 500-sheet set, then a sheet
change, then lets them through. Marks counted in the database afterwards.

- **Fixed — marks placed while the server was unreachable were never
  retried.** Before: 2 sends failed, a "Failed to fetch" toast for ~4 s, the
  10 marks stayed drawn, and 15 s after the connection came back the crash
  mirror still held all 10 — nothing would send them until another click or
  a reload. Now a send with no answer is retried on its own (2 s, 4 s, 8 s,
  16 s, then every 30 s, and at once on the browser's `online` event), and a
  message STAYS while marks wait: "10 marks are not saved yet — no
  connection… kept on this device… sent when the connection is back".
  After: 4 tries while down, sent and the message gone within 8 s of the
  connection returning; **database: exactly 10 marks** (the run before the
  fix: 0, its marks left in a browser profile the probe then discarded). A
  server REFUSAL (a locked bid) is not retried and keeps its own message.
  Not new, written down: a send that reached the server but lost its reply
  would be sent twice by a retry — the old "next click" resend had the same
  exposure.
- **Fixed — one sheet failing to load left the whole plan dead.** A failed
  sheet render set the DOCUMENT's error, which replaced the pane, and every
  render waited on that error clearing — which nothing did. With storage back,
  Next still showed "Large set 500 sheets.pdf could not be opened —
  UnknownErrorException: Failed to fetch". Now a failed sheet is that sheet's:
  "Couldn't load this sheet — The plan storage didn't answer — usually the
  connection. Your takeoff is saved. Press Try again once you're back
  online." over the drawing (opaque: the previous sheet showed through and
  read as this one), Next works, and Try again REOPENS the plan (pdf.js keeps
  a rejected page promise, so re-asking failed again) — drawn after.
- An 8 MB set behaves differently on purpose: under 50 MB it is fetched
  whole up front, so storage going down later changes nothing on screen.

## Round 5 — two tabs on one bid; Back mid-save

Method: `scripts/_tabsEye.mts` (throwaway), production build, two tabs of one
signed-in browser on bid 1728470; marks counted in the database after.

- **Two tabs: fine.** Tab A placed 3 marks; tab B showed them as soon as it
  was switched back to (React Query refetches on `visibilitychange`; marks
  are stale at once). An early probe said B stayed stale: it fired a
  `focus` event, which React Query 5 does not listen to, then a
  `visibilitychange` on `document`, which does not reach `window`.
- **Back right after placing: fine.** 4 marks, then the app's own Back to
  the bid page within the batch delay: **4 in the database**, nothing left
  in the crash mirror. (A first probe "went Back" to the about:blank page
  its own loader opens first, which unloads the whole document — not what a
  person does.)

## Round 6 — touch (`pnpm device:touch`), the morning after

Method: production build; a FRESH throwaway bid per run (the 18-sheet set,
no marks); iPad both ways, phone 390, phone 375. The 2026-10-15 overnight
run had flagged "Select + two taps" (morning question Q3).

- **Not caused by the MarkLayer change.** Start-of-night code (d0152f60,
  built in a worktree) fails the same step intermittently; the change stays.
  A first comparison said otherwise only because it ran on a bid carrying
  other runs' marks.
- **Test fixed — it tapped where the marks HAD been.** Putting the count
  down moved the drawing on a phone (the marks rose 25 px; measured from
  their bounding boxes), so the remembered points missed. The script now
  taps the nearest drawn mark; its phone branches cover every phone size
  (it read "phone" only, so 375 looked for a tablet's Select button); a
  failure names the locator it waited for.
- **Fixed in the app — "Name this symbol" outlived a sheet change and a
  Trace,** still showing the previous sheet's symbol, and covered the trace
  bar's Finish on both iPad sizes. It now goes when a trace starts, a count
  is armed, or the sheet changes (`@/lib/captureLifetime`, tested).
- **Result:** iPad landscape, iPad portrait and phone 390 pass every check,
  twice, on fresh bids.
- **Open at 375 px only** (morning-questions-b.md Q3): (1) a mark re-placed
  just after Undo is still pending when the script counts, so one of the two
  marks cannot be selected yet; (2) the trace is already finished by the
  time the script looks for Finish — a click on "Finish" is logged right
  after the second point, and it is not yet known whether the second tap
  landed on the floating Finish or the script's own tap did. Not a lost
  mark or a wrong number; a finger at 375 px may end a trace one point
  early. A double-click guard for fingers was tried and reverted: no
  `dblclick` fired.
- Noted: on a phone the drawing shifts 25 px when a count is put down (the
  "Counting …" line above it goes away) — a jump, not a fault.

## Round 7 — the two 375 px touch steps (2026-10-15, second morning)

Both were the APP, not the script, and the same fault twice: at 375x667 the
drawing is short and a floating panel's live buttons sat on top of it.

- **Select picked one mark of two.** The "1 mark selected" panel wrapped
  into four rows of 44 px controls (Move to, Mark as, a height, No drop) and
  covered the top half of the drawing; the second mark sat under the height
  control, so the tap opened that instead. Not "still pending" as noted
  before — the mark was saved (count read 3 = expected). Fixed: with a
  finger those extras wait behind one **More** button; Delete and ✕ stay.
  Laptop unchanged.
- **A trace ended at its second point.** In trace mode the toolbar takes
  three rows at 375x667, the drawing is about 220 px tall, and the trace
  pill (top, three rows) covered most of it: the script's tap aimed at the
  drawing landed on Finish (screenshot: "Run finished … 72 ft" after two
  taps). Fixed: with a finger the pill docks to the BOTTOM of the drawing
  and drops what is shown elsewhere (run type, point count, From → to, the
  total repeated on Finish). Seen by eye at 375 and on an upright iPad,
  where it now sits at thumb height clear of the sheet.
- **Result:** `pnpm device:touch` passes at iPad landscape, iPad portrait,
  phone 390, 375 and 425 — every check, every size.
- **Still true, not fixed:** at 375x667 the trace toolbar's three rows leave
  a short drawing, and the bottom-docked pill still covers its lower part;
  two fingers move the sheet out from under it. Shrinking that toolbar is
  its own change.

**Update, third night:** the toolbar is two rows and the pill one at 375
(`b7230030`); the drawing went 237 → 351 px tall.

## Round 8 — zoom at 5,000 marks (2026-10-15, third night)

Method: production build on 3002, laptop 1536, bid 1728469 (5,000 marks on
one sheet). A throwaway playwright script: 16 single wheel steps 300 ms
apart, each timed from the wheel event to two animation frames later (the
frame the zoom is painted in), plus a burst of 8 steps 40 ms apart. Chrome
trace and CPU profile for where the time goes. Scripts deleted after use.

| Build                                   | Per step, median | Worst | Long tasks (16 steps) |
| --------------------------------------- | ---------------- | ----- | --------------------- |
| before (two runs)                       | 149 / 166 ms     | 244   | 17                    |
| marks drawn once, scaled by a CSS var   | 116 ms           | 210   | 13                    |
| + mark size settles 200 ms after a stop | **33 ms**        | 91    | 4                     |

- **Cause:** a mark's size depends on the zoom, so every step re-rendered
  all 5,000 (React), and then — once that was gone — restyled all of them
  (trace: ~115 ms of style recalculation a step, forced inside the wheel
  handler's `clientWidth` read).
- **Fix (`TraceLayer.tsx`):** each mark is drawn once at a fixed unit size
  and scaled by `--mark-s`; the size follows the zoom once it has been still
  for 200 ms. During a wheel gesture the marks ride the drawing's zoom; when
  it stops they settle to their clamped size in one restyle (~120 ms, once).
  Crossing the zoom where letters appear re-renders the layer once (~95 ms).
- **Checked:** drawn size = the clamp rule at 19%–386% (a hexagon is 0.866
  of its diameter wide: 10 → 8.7, 23.2 → 20.2, 26 → 22.5 px); letters,
  shapes and a selected mark (a fifth larger) by eye; `pnpm device:touch`
  all five sizes 84 ok / 0 FAIL.

## Round 9 — the first starter change at 2,006 shops (2026-10-15, third night)

Method: `scripts/_stressPin.mts` (throwaway, deleted) against
`bidrender_test_b`: 2,000 throwaway shops (users 7,000,000+, removed after),
then the FIRST change to one shared row per table through
`applyStarterChange`, timed with `Date.now()`, then undone. After the fix it
also counted, per change: copies, pinned copies, distinct owners, pins
logged, and an assembly's recipe lines / a run type's extras on the copies.

| First change to a shared… | Before    | After      |
| ------------------------- | --------- | ---------- |
| material                  | 6,239 ms  | **460 ms** |
| modifier                  | 4,942 ms  | **286 ms** |
| run type                  | 7,032 ms  | **484 ms** |
| assembly                  | 18,845 ms | **1,263 ms** |

- **Cause:** `pinCompanies` forked one shop at a time — five round trips a
  shop (its own check, the fork's check, the shared row, the insert, the
  pin flag), plus an assembly's recipe copied line set by line set.
- **Fix:** `forkForOwners` (server/db.ts): the copies that already exist,
  the shared row once, one multi-row insert per 500 shops, the new ids read
  back by owner (not trusted to be consecutive), children in bulk; one
  UPDATE for the pin flag. **`forkMaterial` and the other four ARE this
  function with one owner**, and the recipe/modifier/step rows come from
  the same builders a save uses — no second copy of any copy rule
  (`shared/forkedRows.ts`'s worry). An assembly whose recipe points at a
  company's own or a deleted material still copies one shop at a time,
  because that read differs per shop.
- **Checked:** 2,000 copies, 2,000 pinned, 2,000 owners, 2,000 pins logged
  per change; 10,000 recipe lines = 5 × 2,000. `server/forkForOwners.test.ts`
  counts MySQL's `Questions` for a 40-shop fork: under 12 (material) and 25
  (assembly); 161 and 641 with one-at-a-time forks (seen red). 16 fork
  suites, 204 tests, green.
