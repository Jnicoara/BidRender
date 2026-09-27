# Stage 5, Track B: plan for the next batch

**PLANNED 2026-09-27. Nothing here is built yet.**

This lane covers Stage 5 work that needs **no migration**, and does not touch
login, signup or email (Track A) or the materials catalog seed (Track C). Every
file:line reference below was read on `track-b` at `7f70757`, which is
local-dev merged in.

**Schema verdict: none of the four pieces needs a migration.** The one thing
that would need one, § 5j "extra" footage, is not part of this batch. It is
flagged for Track A below.

Suggested order: **2 → 1 → 3 → 4.** Delete-all is small, and it fixes a
permission gap found while researching it. The CSV is the biggest piece of
value. Select-text has the most moving parts on the most fragile screen.
Housekeeping comes last.

---

## 1. Takeoff CSV export: the "door out"

This is the open item at `todo.md` ~1322. Its prerequisite, § 5n (run types
that carry a specification), was built on 2026-09-20.

### What exists

- **Two CSVs, and neither is this one.**
  - The materials list (`shared/materialsList.ts`, built server-side in
    `materialsListRouter.ts`) is a supplier document. It carries no prices by
    design, and it lumps runs into four lines: conduit, cable, wire and ground.
  - The accounting export (`shared/accountingExport.ts`) is the bid's money in
    QuickBooks shape.
- **`shared/csvWrite.ts`** provides `csvRow`, `csvDocument` and `UTF8_BOM`. The
  BOM is added at download time, so tests compare clean text.
- **Counts per sheet.** `db.getStampsForBid` returns rows that carry `sheetId`,
  and `groupStamps` (`shared/takeoffCounts.ts:340`) groups them. The materials
  list already does this at `materialsListRouter.ts:189`. `takeoffGroups.list`
  gives whole-bid counts only.
- **Runs per sheet and per type.**
  - `quantitiesForRun` (`shared/takeoffQuantities.ts:614`) gives, for each run,
    `runFeet` (traced), `verticalFeet`, `groundFeet` and the wire split.
  - `groupRunFootage` (`server/runTypeFootageCore.ts:118`) gives whole-bid
    totals by type, but it merges traced and vertical footage and has no sheet
    split.
- **Sheet labels.** `sheetDisplay` / `sheetLabel` (`shared/sheetIdentity.ts`)
  and `db.getSheetJumpRows`. That query does not select `bidPdfSheets.id`,
  which stamps and runs point at, so the column needs adding. This is a code
  change only.
- **Buttons.** There is a "Materials list" button in the Takeoff header
  (`TakeoffPage.tsx:4595`) and an export dropdown on the bid
  (`BidsPage.tsx:611-667`).

### How I'd build it

- **Builder.** A pure builder in `shared/takeoffExport.ts`, following the
  accounting-export pattern: typed source in, document out, and a `toCsv`.
- **Router.** `takeoffExport.get({ bidId })` in a new router. It is scoped by
  `ctx.scope.dataUserId` and reuses the loaders the materials list already
  calls, so there is no new arithmetic.
- **One flat table.** A flat table sorts, filters and pivots in a spreadsheet;
  sectioned blocks do not. Columns:
  `Sheet | Sheet title | Kind (Count/Run) | Item or run type | Unit | Quantity | Traced ft | Vertical ft | Runs`
  - A count row fills Quantity only.
  - A run row fills Quantity (traced + vertical) and the split.
- **Then a "Whole bid" block,** with one row per item and per type. It is
  followed by **"Not included"** notes in the materials list's voice:
  - no extra, waste or makeup (§ 5j is not built);
  - runs on sheets with no scale (listed, with no feet);
  - branch-wiring runs (counted, not measured);
  - quantity traces with open ends;
  - verticals that are incomplete.
- **Forcing function.** A test asserts that the per-sheet rows summed across
  sheets equal the whole-bid rows, and that the whole-bid run rows equal
  `groupRunFootage` for the same bid. That makes it impossible for the export
  to disagree with what the bid is priced from. Fixture runs go on at least
  two sheets with different scales.
- **Placement.** An "Export takeoff (CSV)" button sits beside "Materials list"
  on the Takeoff page, and there is an entry in the bid's export dropdown. The
  filename is `<bid name> takeoff <date>.csv`.

### Open points

- **Drafts versus committed.** `takeoffRuns.totals` counts only committed runs
  (`takeoffRunsRouter.ts:1181`). `groupRunFootage`, and therefore the bid and
  the materials list, include drafts. The export will follow the bid, since
  that is what gets priced. The mismatch is a separate finding, and it should
  be measured before anything is changed.

### Schema

**None.**

---

## 2. Archive "Delete all"

### What exists

- **Screen and procedures.** `BidArchivePage.tsx` has a per-row Trash button
  and an `AlertDialog` (:232-265). `bids.deleteForever`
  (`bidsRouter.ts:696-709`) calls `db.deleteBidForever`, which is one scoped
  `DELETE`. Every foreign key cascades.
- **Bulk deletion already exists.** `purgeExpiredBids`
  (`server/scheduled/purgeArchivedBids.ts:87-106`) loops, uses try/catch on
  each bid, and returns `{ purged, ids }`.
- **Found while researching: `bids.delete` is enforced nowhere.**
  - `shared/permissions.ts:70` defines it as "Permanently delete an archived
    bid. Separated from edit: unrecoverable", and withholds it from
    estimators.
  - The bids router is `scoped("bids.view", "bids.edit")`, so **an estimator
    can permanently delete a bid today.**
- **Also found: plan PDFs are never removed from storage.** Only the database
  rows go. Neither storage backend has a delete operation, and the comments
  explaining why still blame the long-gone Manus storage API.

### How I'd build it

- **Procedure.** Add `bids.deleteAllArchived({ expectedCount })`.
  - It is gated by `requireCapability("bids.delete")` and still filters by
    `ctx.scope.dataUserId`.
  - It loads `getArchivedBids`. If the length is not `expectedCount`, it
    refuses with "The archive changed; look again". The count the person
    confirmed is then the count that gets deleted, not whatever is there by
    the time the click lands.
  - It then deletes each bid through `deleteBidForever` in the purge's loop
    style and returns `{ deleted }`.
- **Same gate on `deleteForever`,** so the capability means what
  `permissions.ts` says it means.
- **UI.**
  - A "Delete all" button in the archive header. It is hidden when the archive
    is empty or the person lacks `bids.delete`.
  - The dialog reads "Delete all 12 archived bids for good?", then "This can't
    be undone. Their takeoffs, line items and plans go with them."
  - The buttons read "Keep them" and "Delete 12 bids permanently". This
    follows the existing dialog and `writing-style.md:184`: delete means
    forever, and says so.
- **Tests,** added to `bidArchive.test.ts`:
  - only archived bids go, and live bids survive;
  - another company's archive survives;
  - an empty archive deletes 0;
  - a stale `expectedCount` deletes nothing;
  - an estimator is FORBIDDEN, both here and on `deleteForever`.
  - These will need the first test caller that carries a company role.

### Schema

**None.**

### Not in this piece

- **Deleting orphaned plan files from R2 or disk.** That is its own job: a new
  storage operation, and a decision about the backup, which may still hold the
  file. See Q5.

---

## 3. "Select text" tool on the plan viewer

### What exists

- **No prior decision covers it.** There is nothing in `takeoff-spec.md`,
  `plan-viewer-overhaul.md` or `todo.md`. The related rules it must respect
  are:
  - § 17.6: nothing positional is stored; re-extract each page in the viewer
    worker, which took about 50 ms for one page.
  - § 17.6: say what it could not see.
  - § 13.8: the text layer is a cross-check, never a source, and OCR text can
    be wrong ("DUEX").
- **Precedent.** `SymbolCaptureLayer` (`SymbolCapture.tsx:176-323`) is a
  box-drag in page points. It has its own z-layer, calls `stopPropagation` and
  `setPointerCapture`, and handles Escape in the capture phase. The new layer
  copies it almost line for line.
- **Positions exist but are discarded.**
  - `positionedItems` (`shared/sheetPageText.ts:41-63`) returns
    `{ s, x, y(baseline), w, h, vert }` in the same scale-1 page space the
    overlays use.
  - The viewer worker's `"text"` message (`pdfRenderer.worker.ts:334-355`)
    throws the positions away.
- **There is no tool enum.** Each tool is its own boolean or nullable state
  (`calibrating`, `tracing`, `armedGroup`, `capturingSymbol`), kept apart by
  hand-written guards in the toolbar.
- **Catalog search runs in the browser.** It is `useMaterialSearch` over
  `allMaterials`, which the takeoff page has already loaded.

### How I'd build it

- **Worker.** Add a new `"textItems"` message to the viewer worker. It returns
  `positionedItems` for one page from the already-open document. This is the
  same extract a future search-highlight needs.
- **Pure logic.** Put it in `client/src/lib/textSelection.ts`, where vitest can
  reach it:
  - intersect the dragged box with item boxes (top edge = `y - h`; sideways
    items have `w` running vertically);
  - group items into lines and order them;
  - join and normalise whitespace.
  - Test fixtures: a rotated sheet, sideways text, and a box that clips half a
    word. Sheet shapes must differ from the viewport shape (see CLAUDE.md on
    fixtures shaped like their container).
- **`TextSelectLayer`.** It is mounted beside `SymbolCaptureLayer`.
  - Drag a box, then a popover (portalled to `chromeTarget`) shows the text it
    found with **Copy** and **Search catalog**.
  - Copy uses `navigator.clipboard.writeText` in try/catch, with the
    `ErrorBoundary.tsx:77` pattern, and a toast.
  - A "Select text" toolbar button sits after the Measure group. It is not
    gated on having a scale.
- **What it says when there is nothing to copy.**
  - A sheet with no text layer: "This sheet is a scanned image. There's no
    text on it to copy." It says so as soon as the tool is armed on that sheet,
    not after a drag that finds nothing.
  - A box with nothing in it: "No text inside that box."
  - A sheet whose text layer is an OCR layer (a scan with text): a small line,
    "Read from the sheet's text layer. Check it against the drawing."
- **One tool at a time, by construction.** Arming any tool goes through one
  `disarmOtherTools(except)` helper instead of adding a fifth hand-kept guard.
  This follows CLAUDE.md: write the guard, don't comment that it isn't needed.
  The helper also flushes the stamp queue, the same rule that bit on
  2026-09-19.
- **Search catalog.** Show the top matches inline in the same popover, using
  `useMaterialSearch(allMaterials)` on the copied text, without leaving the
  sheet. See Q3.
- **No AI call anywhere.** This is plain code over the PDF.

### Schema

**None.** `bid_pdf_sheet_text.hasTextLayer` already exists server-side, but the
live extract answers "is there text?" without a server call.

### Verify on screen

Check it on the "Bar layout check" fixture, where sheet 1 has text, and on a
scanned sheet. Then arm Count, then Select text, then Trace, then drag. Each
must disarm the last, and none may pan the sheet during a drag.

---

## 4. Also in this lane, from `todo.md`

- **Analytics leaves out lines it cannot price, without saying so**
  (`todo.md` ~1350). `costSums` returns `brokenLines`, but `toBidCostRow`
  (`db.ts:10458`) drops it. Carry it through `BidCostRow` and mark those
  figures "incomplete" on the analytics screen. No schema change, and it is
  small.
- **Stale checkboxes, already done** (housekeeping only):
  - ~1320: the layer swatch colours. `layerColor` no longer exists
    (`shared/takeoffLayers.ts:223`).
  - ~1338: dashboard versus bid. Fixed by option 2, recorded at ~1340.
  - ~1342: search and archive short by charges. Fixed at ~1343.
- **Looked at and left out:**
  - The run-colour, tee and leg items (~1400-1510) are either owner-parked or
    "if anybody asks".
  - The fittings and catalog items are Track C.
  - The stranded leg-draft recovery (~1507) could fit, but T7 is half-wired and
    wants its own look.

## For Track A

- **§ 5j "extra" footage** needs extra and makeup columns on
  `takeoff_run_types`, plus a company default. Until then, the CSV says "no
  extra included".

---

## Questions for the owner, each with a recommendation

1. **Should the CSV carry prices?** *Recommended: no, not in v1.* Ship
   quantities first, since that is the "door out". Add prices later as an
   explicit "Include my prices" choice in the dialog, off by default. That
   avoids a spreadsheet being forwarded to a supply house with margins in it.
2. **Should `bids.delete` be enforced, stopping estimators deleting bids
   permanently?** *Recommended: yes, on both the per-bid delete and Delete
   all.* The permission table already promises it; the code just never
   checked. It changes what estimators can do today.
3. **Where should "Search catalog" go?** *Recommended: show matches inline in
   the select-text popover.* The alternatives are to pre-fill the Count
   picker, which searches assemblies rather than the catalog, or to jump to
   the Materials screen, which leaves the sheet.
4. **Should Select text have a keyboard shortcut?** *Recommended: `T`,* which
   is free. Or none, if you'd rather keep the keyboard for counting.
5. **Orphaned plan files in storage** after a delete or the purge.
   *Recommended: a separate piece, after this batch.* It needs a storage
   delete operation and a decision about backups.
6. **Should the CSV include draft runs?** *Recommended: follow the bid, which
   includes drafts,* and measure the mismatch with `takeoffRuns.totals` as its
   own item.
