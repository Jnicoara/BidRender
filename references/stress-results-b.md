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
