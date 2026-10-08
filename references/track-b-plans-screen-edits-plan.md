# Track B: Plans screen edits (drag points, live distance, undo/clear, PDF loading)

> **2026-10-07: built (pieces a–g, added a–d). What is still open — including
> a wrong number when a run's END is dragged off or onto a mark — is in
> `references/track-b-plans-screen-gaps-plan.md`.**

**PLANNED 2026-09-29 on `track-b` at `5f14947` (local-dev, already up to date).
PLAN ONLY — no code yet. Not merged.**

Every file:line reference below was read on that commit. **The dev server was
not run and nothing was measured on a screen.** Where a claim needs measuring it
says so, and the measurement is the first step of that piece, not optional.

**No migration is needed for any of the four parts.** Nothing goes to Track A.
(The per-mark `takeoff_stamps.dropExcluded` column in `todo.md` H3 is unrelated
and stays with Track A.)

---

## Decisions this plan touches — read before approving

| Earlier decision                                                                                                    | What this plan does                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `takeoff-spec.md` **D7(a)**: "drag a point, add to the end, delete a point, rename"                                 | **Agrees.** Part 1 builds the drag and delete half of it (T8).                                                                                                                                                                       |
| `plan-viewer-overhaul.md` § 6 (line ~4259): "Dragging a vertex stays last and is cuttable"                          | **Moves it forward**, because the owner asked for it now. Phases 5–8 it was not to compete with are built.                                                                                                                           |
| `takeoff-spec.md` **D6**: undo of the last several actions, as a button and Ctrl/⌘+Z                                | **Agrees.** Part 3 builds it (C6).                                                                                                                                                                                                   |
| `takeoff-spec.md` **D6 "Leave out: the old 'Clear page'** … a one-tap wipe is how a whole takeoff gets lost"        | **OVERRIDES it — confirmed by the owner 2026-09-29, built.** The reason D6 gave is met a different way: it is never one tap (it shows exactly what goes and asks), and it is undoable in one step. Both files get a line when built. |
| `shared/quantityLock.ts` / overhaul § lock: a lock freezes bid quantities, and "drags a run" is why the lock exists | Drag, clear and undo are **refused on a locked bid**, with the existing lock message. See Part 1 § 3.                                                                                                                                |

---

## PART 2 FIRST — the preview segment (the possible wrong-number bug)

Put first because the brief says a wrong number is fixed first.

### What is true today (read, and the answer is reassuring)

- **The saved run never includes the preview segment.** The cursor position
  (`hover`) lives only in `TraceLayer`'s own state
  (`client/src/components/takeoff/TraceLayer.tsx:325`) and is never passed up.
  What gets saved is `tracePoints` (`TakeoffPage.tsx:2112`), which only a click
  appends to (`TraceLayer.tsx:641`).
- **The server does not accept a length from the client at all.** `save`
  recomputes `lengthInches` from the points it receives
  (`server/routers/takeoffRunsRouter.ts:539`, `:592`), and every bid line, total
  and materials figure recomputes from the stored points on read
  (`shared/takeoffQuantities.ts`, `shared/takeoffBridge.ts`). So a bid line
  cannot contain the preview segment unless a click put that point there.
- **The pill already shows two numbers**: "placed" (clicked points only) and
  "to cursor" (`TraceLayer.tsx:1380-1437`, fixed 2026-09-21 after bid 23). But
  "to cursor" is the WHOLE path plus the preview, not the preview on its own —
  which is why a stray mouse makes a big number appear. That is the display
  problem you saw; it is not a saved number.

### One suspect to MEASURE first — a double-click can add a stub point

Finishing with a double-click fires TWO pointerdowns, and each appends a point
(`TraceLayer.tsx:599-641`); the comment at `:650` says only one extra point is
added, which is not what the code does. If the mouse moves a pixel between the
two clicks, the run ends in a near-zero stub pointing in a random direction.
Length barely moves (about an inch), but the bend counter (`shared/runBends.ts`
`legBends`, `:289`) skips only an EXACTLY zero segment (`turnDegrees` returns
null at `:248`) — so the stub may be counted as **an extra elbow** on the bid.
**Not measured.** Step 1 of Part 2 is: write the test (near-duplicate end point
→ count bends) and see whether it goes red. If it does, it is a wrong number and
gets fixed before anything else in this plan: ignore the second click of a
double-click (`e.detail >= 2`) and drop any new point within a few screen pixels
of the last one.

### What to build

1. **"Run total"** in the pill = clicked points only. It never changes when the
   mouse moves. It replaces "placed".
2. **"Next"** = a small dim label AT THE CURSOR, showing only the preview
   segment (last point → cursor). Removed from the pill, so the pill has one
   number and cannot be misread. The fixed-width slots from 2026-09-24
   (`TraceLayer.tsx:1394-1407`) stay, so the undo arrow does not move.
3. **Thinner, dimmer preview line**: from `2/3` of the run stroke at 0.75
   opacity (`:1236`) to about `1/3` at 0.45. Checked by looking at 19% and at
   max zoom, per CLAUDE.md.
4. **On/off setting: cheap, recommend yes.** Settings → Display already stores
   crosshair colour and size per user per device
   (`client/src/hooks/useCrosshairColor.ts`). One more key of the same kind,
   "Show next-segment length", default ON. Off hides the "Next" label; the thin
   line stays, because without it you cannot see where the next click goes.

### Tests (and which fail without the change)

- `client/src/lib/traceReadout.test.ts` (new): the readout math moves out of
  the component into `traceReadout(points, hover, ratio) → { runTotal, next }`.
  **Fails without the change**: "runTotal is identical for every hover
  position" and "next equals only the last-point-to-cursor segment" — today's
  code has no such function, and the moment anyone folds `hover` back into the
  total it goes red.
- `server/tracePreviewNeverSaved.test.ts` (new): save a run from clicked points,
  read `listForSheet`, `totals`, `bridgeForBid` and the materials list; every
  length equals `pathRealInches(clickedPoints)`. **Honest note: this passes
  today**, because the bug is not there. It is a guard, not a fix-test. There
  is no fix for it to fail without.
- `shared/runBends.test.ts` (added case): a run ending in a near-duplicate point
  counts no extra bend. **This is the measurement above** — if it fails today,
  it is the wrong-number bug and the fix makes it pass.

---

## PART 1 — Drag run points to edit

### 1. How it works (recommendation)

- **Select a run** (click it, as today), and its points show as small round
  handles. Handles only on the selected run, so a busy sheet stays readable.
- **Drag a handle** → the line follows the pointer live; **let go** → it saves.
  Escape during a drag puts it back and saves nothing.
- **Add a point**: a faint "+" handle at the middle of each segment of the
  selected run; drag it and it becomes a real point. (Same gesture as every
  drawing tool; no mode to learn.)
- **Delete a point**: select a handle (click) and press Delete, or
  right-click → "Remove point". Refused if it would leave fewer than 2 points.
- **Ends on a tee cannot be dragged** — the server pins them back to the tee
  (`takeoffRunsRouter.ts:579-595`), so a handle that moved and snapped back
  would read as a bug. They show as a locked handle with a tooltip.
- **Ends on a mark**: the link is by id (`startStampId`/`endStampId`), so
  dragging an end away keeps the claim. Recommend: the handle snaps to a mark
  when released within snap reach (same `snapReach` as tracing), otherwise it
  keeps its link and we say nothing — changing a link on a drag is a bigger
  decision than this piece.
- A handle's pointerdown calls `e.stopPropagation()` — without it the sheet pans
  under the drag (CLAUDE.md § "a comment claiming that SOMETHING ELSE handles
  it"; `beginPlainPan`, `TakeoffPage.tsx:978`). The drag follows window
  pointermove/pointerup, copying the Shift-box pattern (`TraceLayer.tsx:446-485`).

### 2. What recalculates

**Almost everything already recalculates from the points on read**, so the work
is making the server write and the screen refresh:

| Thing                             | Stored or live                                          | What happens on a move                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Length                            | Live; `lengthInches` is a cache rewritten on save       | Recomputed on save.                                                                                                                                                                                          |
| Fittings, elbows, connectors      | Live (`runBends.ts`, `fittingRowsByRunType`)            | Follow automatically.                                                                                                                                                                                        |
| Pull-box / LB proposals           | Proposals live; ANSWERS stored by position              | A corner that moved loses its answer and is proposed again (`dropOrphanedPullPoints`, decision 2026-09-26). **The screen says so** ("1 pull-point answer cleared — the corner moved"), and undo restores it. |
| Branch legs                       | Tees stored with x,y; legs are rows                     | Tee ends pinned; a leg's other points move freely.                                                                                                                                                           |
| Quantity-trace drops              | Decided live by position (`JOINED_WITHIN_POINTS` 0.5pt) | Moving a leg end onto/off another leg can add or remove a proposed drop. Proposals re-read; approved answers stay.                                                                                           |
| Drops from marks (`GroupDrop`)    | On the group, not on run points                         | Unaffected.                                                                                                                                                                                                  |
| Verticals                         | Live, from end kinds and stamp ids                      | Unaffected by geometry.                                                                                                                                                                                      |
| Bid lines, totals, materials list | Live from the drawing unless locked                     | Follow, via `refreshRuns` (`TakeoffPage.tsx:2673`), which already invalidates the bridge, totals and materials list.                                                                                         |

**Do NOT reuse `save` for this.** It defaults `status` to `"draft"`,
`isSuggestion` to false and `location` to null (`takeoffRunsRouter.ts:447-460`),
so saving only new points would **demote a finished run to a draft and clear its
location**. New narrow procedure `takeoffRuns.setPoints({ id, points })`: checks
the run's bid, refuses on a locked bid, pins tee ends, recomputes length, drops
orphaned pull-point answers **and returns the answers it dropped** (for undo).
The pinning and orphaning code is lifted out of `save` into one helper both
call, so the two cannot drift.

### 3. Typed length, locked and closed bids

- **Typed length**: kept. `setPoints` never touches `typedLengthInches`, and the
  panel already shows "typed X · drawn Y" (`takeoffQuantities.ts:239`) — so the
  drawn figure moves and the bid quantity does not, which is what "typed" means.
  Recommend a one-line note on the run while dragging: "Typed length is used —
  the drawing changes, the bid doesn't."
- **Locked bid**: refused, handles not shown, the existing lock sentence in the
  run panel. A drag is precisely the thing the lock exists to stop.
- **Closed/Won/archived**: there is no status gate on any run edit today, and
  the lock is the tool for "this is finished". Recommend not adding a second
  gate.
- **Pre-existing gap, not fixed here unless you say so:** `save`, `remove`,
  `addLeg`, `setTypedLength` and stamp `remove`/`removeMany` do not check the
  lock (`refuseIfLocked` is used at `:841, :910, :1585, :1611` only). On a locked
  bid the NUMBERS still cannot move (lines read the frozen `qty`), so it is not
  a wrong number, but the drawing can drift from the bid. Recommend a separate
  small piece.

### 4. Undo for a drag

Every drag, add-point and delete-point is one entry on Part 3's undo stack:
`setPoints(before)` plus re-inserting the pull-point answers the move dropped.
Ctrl/⌘+Z and the toolbar arrow both do it.

### Files

`TraceLayer.tsx` (handles), `TakeoffPage.tsx` (wiring, selected run),
`RunsPanel.tsx` (notes), `takeoffRunsRouter.ts` (`setPoints`, helper out of
`save`), `server/db.ts` (re-insert pull-point answers), new
`client/src/lib/runPointEdit.ts` (pure: move/insert/remove, tee-locked ends,
min-2 rule).

### Tests that fail without the change

- `client/src/lib/runPointEdit.test.ts`: remove refuses below 2 points; insert
  lands between the right pair; a tee-pinned end cannot move.
- `server/runSetPoints.test.ts`: `setPoints` on a committed run **keeps status
  `committed` and its location** (the `save` trap — goes red if someone swaps in
  `save`); refuses on a locked bid; length, fittings and bridge quantities
  follow the new points; a typed length is unchanged; a moved corner's pull
  answer is dropped and returned, and restoring it brings it back.

---

## PART 3 — Undo, and clear this sheet

### What is true today

- **Delete marks** (one or a selection) exists (`34f8515`):
  `takeoffStamps.remove` / `removeMany` (`takeoffStampsRouter.ts:180`, `:199`).
  **There is no restore and no soft delete** anywhere for marks or runs.
- "Undo drops" (`client/src/lib/dropUndo.ts`) is one level, on one group's drop
  setting only.
- While tracing, Backspace / Ctrl+Z / Escape take back the last point.
- **There is no sheet-wide delete.**

### How undo works (recommendation)

**Restore with the SAME ids, not soft delete.** A mark's id is pointed at by run
ends (`startStampId`/`endStampId`), tees and AI findings, all `ON DELETE SET
NULL`. Re-inserting with new ids would leave a restored run end no longer
attached to its mark — a changed vertical count, silently. Soft delete
(`deletedAt`) would need a migration and a filter on every read, and nearly every
read is a bare `select()`: one missed filter counts deleted marks, which is a
wrong number. So instead: **a delete returns a restore packet** (the rows and
every link that pointed at them), the client keeps it on the undo stack, and
`restore` re-inserts with the original ids and puts the links back. MySQL never
reuses an auto-increment id, so the id is still free. **To verify by asking
MySQL before building on it** (explicit-id insert into `takeoff_stamps` and
`takeoff_runs` after a delete), per CLAUDE.md's "a number that can be measured".

**The stack**: per bid, up to 50 steps, kept in the page. **Redo: cheap, recommend
yes** — each entry already holds both directions.

**Can be undone:**

| Action                              | Undo does                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Placing marks (a click, or a batch) | Removes exactly those marks.                                                                                  |
| Deleting marks (one or a selection) | Restores them, same ids, run ends and tees re-attached.                                                       |
| Finishing a run (and its legs)      | Removes the run.                                                                                              |
| Deleting a run or one leg           | Restores it with its legs, tees, circuits and pull-point answers, same ids. (Biggest piece; can ship second.) |
| Dragging / adding / removing points | Puts the points back and restores any pull-point answer the move cleared.                                     |
| Clear this sheet                    | Restores everything it removed, in one step.                                                                  |

**Cannot be undone, and the screen says so where it matters:**

- Anything **after a reload or after leaving the bid** — the stack lives in the page.
- Anything done **in another tab or by a colleague**.
- Changing the **scale**, a run's **type/spec**, circuits, ends, the job
  heights, a count's **name/assembly**, drops (it has its own "Undo drops"),
  plan uploads and removals, and anything on the bid page itself.
- An undo whose target has changed since (for example, the count those marks
  belonged to was deleted): refused with a plain sentence, the stack entry dropped.
- On a **locked bid**: nothing to undo, since placing/deleting is refused.

The button's tooltip names the step ("Undo: 3 marks placed"), so nobody undoes
blind. While tracing, Ctrl+Z keeps its current meaning (last point); the toolbar
arrow is disabled then.

### Clear all marks on this sheet

- In the sheet's "…" menu, not the toolbar (a destructive action does not get a
  permanent button).
- New query `takeoffSheet.clearPreview({ sheetId })` returns the exact counts;
  the confirm reads e.g. **"Remove 12 runs (3 with branch legs) and 40 marks in
  5 counts from E1.01? 2 counts have no marks on any other sheet — their bid
  lines will read 0. You can undo this."** Button: "Remove 52 items".
- Mutation `takeoffSheet.clear({ sheetId })`: one transaction, refused on a
  locked bid, returns the restore packet. Keeps: the sheet, its scale, the
  counts themselves (they are bid-wide), legend captures (they belong to the
  user, not the sheet).
- **Undoable: yes**, one step, same mechanism.
- No plan-set-wide clear (as asked).

### After a clear or undo, everything must move at once

Two new refresh events in `client/src/lib/takeoffRefresh.ts` (`QUERIES_MOVED_BY`):
`sheetCleared` and `undo`, each invalidating the bid-quantity set (totals,
drops, `bridgeForBid`, `bids.get`, `materialsList.get`, `takeoffGroups.list`)
**and the per-sheet lists for the sheet the action was on**. Today the per-sheet
lists are only invalidated for the ACTIVE sheet (`TakeoffPage.tsx:2298-2305`), so
an undo after switching sheets would leave the other sheet's marks stale on
return — exactly the CLAUDE.md "staleness" class.

### Tests that fail without the change

- `client/src/lib/takeoffRefresh.test.ts`: `sheetCleared` and `undo` invalidate
  the bridge, totals and materials list, and the per-sheet list **of the entry's
  sheet, not the active one**.
- `client/src/lib/undoStack.test.ts` (new, pure): push/undo/redo order, cap of
  50, a new action clears redo, a refused undo drops its entry.
- `server/sheetClear.test.ts`: preview counts match what `clear` removes;
  after `clear`, the bridge quantity, totals and materials list drop by exactly
  the sheet's share; after `restore`, **every one returns to the exact figure
  before** (before-and-after of the same queries, not a count of intent);
  refused on a locked bid.
- `server/stampRestore.test.ts`: delete marks that are a run's end and a tee,
  restore, and the run's `endStampId`, the tee's `stampId` and the vertical
  count are back.
- `server/runRestore.test.ts`: delete a run with legs, a tee and a pull answer;
  restore; length, fittings and bridge equal the before figures.

Then the screen check: place, undo, redo, clear, undo — and watch the totals and
the counted-items panel MOVE each time, per CLAUDE.md.

### What is "Select text" for?

**Plain words:** you drag a box on the drawing and it reads the words inside
it — a part number, a fixture schedule line, a note — straight out of the PDF.
You can copy them, or search the catalog with them. **It saves nothing and puts
nothing on the sheet** (`TextSelect.tsx:340-377`; button at
`TakeoffPage.tsx:5187-5205`, tooltip "Drag a box to copy part numbers and
notes (T)").

**Recommendation: rename it to "Copy text".** "Select" sounds like selecting
marks, which is now a real thing on this screen (click / Shift-drag selects
marks since `34f8515`) — two "select"s doing different things is the confusion.
Keep the T shortcut. It only works on sheets whose PDF has real text; a scanned
sheet returns nothing, and the tool should say that rather than show an empty
box (check what it shows today when looking).

### Files

`TakeoffPage.tsx` (toolbar arrows near `:5205`, sheet menu, Ctrl+Z outside
tracing), new `client/src/lib/undoStack.ts`, `takeoffRefresh.ts`,
`takeoffStampsRouter.ts` (`removeMany` returns a packet, `restore`),
`takeoffRunsRouter.ts` (`remove` returns a packet, `restore`), new
`server/routers/takeoffSheetRouter.ts` (or in the stamps router), `server/db.ts`,
`server/routers.ts`, `TextSelect.tsx` (label), `references/takeoff-spec.md` (D6
override line, C6/C13 status).

---

## PART 4 — PDF loading

### 1. The white square — cause found by reading, to confirm by looking

The page drops its "Opening {file}…" state as soon as the worker says the file
is loaded (`TakeoffPage.tsx:1152`) — **before any sheet is drawn.** The canvas
then shows empty: it has no size yet, so the browser gives it its default
300×150, white with a shadow (`:1670-1673`), at the top-left because the view
starts at zoom 1, 0,0 (`:746`). That is the square. It stays until the first
render returns (`:1204`). Then there can be one more frame of the full bitmap at
zoom 1 before the fit runs, because the fit is in a `useEffect` after paint
(`:817-823`).

**Fix:** keep the "Opening…" panel until the first sheet is drawn AND fitted;
hide the canvas until then (fit in a layout effect, or fit before first paint).
Show the sheet in one step at its fitted size. Message: "Opening plan set…" then
"Drawing sheet 1…". A byte-progress bar only when pdf.js reports progress (the
whole-file fallback); otherwise the two-step text with a thin moving bar, since
range loading has no honest total. Also hold the thumbnail loop (`:1422-1472`)
until the first sheet is drawn — today it starts at the same moment on the same
worker and slows that first sheet.

### 2. Upload speed — NOT measured yet; the measurement is step 1

No 50 MB, 15-page file was uploaded for this plan. What the code shows:

- **A 50 MB file is one PUT** (pieces start above 64 MB, `shared/multipartPlan.ts:38`).
- **An upload progress bar already exists** (`UploadProgress.tsx`: waiting,
  uploading with speed and time left, "Finishing…", done, failed). What has no
  indicator: getting the upload ticket, and the time after "done" until sheet 1
  shows and the sheet list fills.
- **There is no timing for any phase** except the render itself.

**Step 1:** add `console.info("[upload] …")` timings — ticket, PUT (ms and MB/s),
attach, time to first sheet drawn, sheet-name reading — then upload a real
50 MB / 15-page set with `pnpm dev:r2` and write the table here. Recommendations
below are ranked by what the code suggests, and are to be re-ranked by that
table:

1. **Show the sheet from the file on your computer, not a re-download.** After
   uploading, the viewer fetches the same bytes back from R2, and below 50 MB
   pdf.js downloads the whole file again in the background. The sheet reader
   already reads the local file (`sheetReader.worker.ts:69-82`). Likely the
   biggest win on time-to-first-sheet; could even show sheet 1 while the upload
   is still going.
2. **Stop four PDF readers competing for the first sheet.** Renderer, sheet
   reader, their nested workers, and thumbnails all start together. Start the
   sheet reader and thumbnails after sheet 1 is drawn.
3. **Progress updates re-render the whole 6,200-line page** on every XHR
   progress event. Throttle to about 4 a second.
4. Create sheet rows at attach (the server already knows the page count from
   the client) instead of after the viewer parses the file, so the sheet list
   is not empty meanwhile.
5. If the measured PUT is slow on a real connection, lower the pieces threshold
   so 4 parallel pieces are used for 50 MB too. Measure first; one PUT is often
   fine.

Also found: if the bucket's CORS rule is missing, the same-origin fallback is
capped at 25 MB (`server/planUpload.ts:83`), so a 50 MB file fails with a 413.
Not a speed issue; noted because it looks like one.

### Files

`TakeoffPage.tsx` (loading state, fit timing, thumbnail start, progress
throttle, local-file open), `client/src/workers/pdfRenderer.worker.ts` (open
from a File/ArrayBuffer), `client/src/lib/planView.ts`, `UploadProgress.tsx`,
`client/src/lib/sheetReadJob.ts` (start later), `server/routers/bidPdfsRouter.ts`
(only if sheet rows move to attach).

### Tests that fail without the change

- `client/src/lib/planView.test.ts` / new `planLoadState.test.ts`: a pure
  "what to show" function — `loading` until first render AND fit; **fails
  today** because loading ends at document-loaded.
- `client/src/lib/uploadProgressThrottle.test.ts` (new): at most N updates per
  second, and the final 100% is never dropped.
- The white square itself can only be checked by looking (no component tests
  here): open the fixture bid "Bar layout check" cold, with the network
  throttled, and watch.

---

## Files touched — for clash checking

| File                                                                    | Parts       |
| ----------------------------------------------------------------------- | ----------- |
| `client/src/pages/TakeoffPage.tsx`                                      | 1, 2, 3, 4  |
| `client/src/components/takeoff/TraceLayer.tsx`                          | 1, 2        |
| `client/src/components/takeoff/RunsPanel.tsx`                           | 1           |
| `client/src/components/takeoff/TextSelect.tsx`                          | 3 (label)   |
| `client/src/components/takeoff/UploadProgress.tsx`                      | 4           |
| `client/src/pages/SettingsPage.tsx`                                     | 2 (setting) |
| `client/src/hooks/useCrosshairColor.ts` (or sibling)                    | 2           |
| `client/src/lib/takeoffRefresh.ts`                                      | 3           |
| `client/src/lib/planView.ts`, `sheetReadJob.ts`                         | 4           |
| `client/src/workers/pdfRenderer.worker.ts`                              | 4           |
| new `client/src/lib/traceReadout.ts`, `runPointEdit.ts`, `undoStack.ts` | 1–3         |
| `server/routers/takeoffRunsRouter.ts`                                   | 1, 3        |
| `server/routers/takeoffStampsRouter.ts`                                 | 3           |
| new `server/routers/takeoffSheetRouter.ts`, `server/routers.ts`         | 3           |
| `server/db.ts`                                                          | 1, 3        |
| `shared/runBends.ts` (only if the double-click test is red)             | 2           |
| `server/routers/bidPdfsRouter.ts`                                       | 4 (maybe)   |
| `references/takeoff-spec.md`, `plan-viewer-overhaul.md`, `CHANGELOG.md` | all         |

`TakeoffPage.tsx` is the clash risk: every part touches it. Anyone else working
on the Plans screen should land first or rebase onto this.

**Migrations: none.**

## Suggested order

1. Part 2's double-click measurement (a possible wrong number).
2. Part 2 (readout, line, setting).
3. Part 4 § 1 (white square) — small and self-contained.
4. Part 3 undo stack + marks restore + refresh events, then clear sheet.
5. Part 1 (drag points), onto the undo stack.
6. Part 3 run restore.
7. Part 4 § 2 measurement, then whichever speed-up the table favours.

One commit per piece, `pnpm check` and `pnpm test` each time, one screen pass at
the end looking at all of them together (CLAUDE.md: a fix can manufacture the
fault another fix was for).

## Questions for the owner

1. **Clear this sheet overrides D6** ("leave out Clear page"). Confirm, with
   confirm-plus-undo as the answer to D6's worry? (Recommend yes.)
2. Drag, clear and undo **refused on a locked bid**? (Recommend yes.)
3. Rename "Select text" to **"Copy text"**? (Recommend yes.)
4. Fix the existing **lock gaps** (delete marks/runs, add legs on a locked bid)
   as a separate small piece? (Recommend yes, separately.)

---

## ADDED 2026-09-29 (owner, mid-build): delete button, card controls, run ends

Planned before building, as asked. **No migration.** Every end of every leg
row already stores `startKind`/`endKind` and a per-end height override
(`startHeightInches`/`endHeightInches`), and every quick pick below maps onto
a kind that already ships (`shared/takeoffHeights.ts`). Nothing goes to Track A.

**Read before approving: one premise in the request was not true.** Run cards
do NOT have an undo arrow today, only a trash can. So item 2 adds the undo
arrow to BOTH kinds of card, not just to count cards.

### 1. Toolbar Delete

- Beside Undo/Redo. Disabled with nothing selected. With marks selected it
  reads "Delete 3 marks"; with a run selected, "Delete run" (or "Delete leg").
- More than one mark confirms (the existing `deleteNeedsConfirm` question).
  One mark or one run does not, because both are one Ctrl+Z away.
- Keys: Delete removes the selection (marks first, else the selected run;
  a picked run POINT still wins, as now). Ctrl+Z undoes, Ctrl+Y and
  Ctrl+Shift+Z redo — already built in piece d.

### 2. Count cards: trash and undo

- **Trash = delete this count's marks on THIS sheet.** The count stays, and
  its bid line follows the marks. Decided this way because it matches what
  the run card's trash does (removes something drawn on this sheet), and
  because deleting the COUNT reaches other sheets and the bid line itself,
  which is a different act with its own rules (`takeoffGroups.remove`).
  Confirm when more than one mark; undoable.
- **Undo arrow on every count card and run card**, enabled only when the
  NEWEST step on the undo stack is about that card. Its tooltip names it.
  Undoing out of order ("the step before last, but only for this count")
  would restore a state the rest of the drawing has moved on from, so it
  is not offered. Each undo entry gains a `subject` (a count id or a run's
  root id) so a card can ask.

### 3. Run ends, in the run card

- Selecting a run, on the plan or its card, shows a **Run ends** section
  listing EVERY end of every leg: branch ends show as "branch tee, carries
  on", read-only (D20).
- Each open end has one-tap picks, mapped to kinds that ship:
  device box → Receptacle, panel → Panel, J-box → Junction box (wall),
  fixture → Ceiling box / fixture, stub-up → Underground / slab,
  nothing → carries on at run height. The drop comes from that kind's
  existing height, and the height is editable per end through the existing
  `HeightFields` (the per-end override columns).
- Clicking an end dot on the plan selects the run and scrolls its end
  into view, highlighted.
- The yellow "N runs have only one end counted" line becomes a **Set ends**
  button that selects the first such run and opens its Run ends section.
- Undo: `setEnds` returns a sealed network packet (as `setPoints` does), and
  every end change is one step.

### 4. Wrong-number checks (each fails without its change)

- `setEnds` does NOT check the lock today. Fixed first, with a test that
  goes red without it (same class as piece a).
- Server: after an end change, and after its undo, `takeoffRuns.totals`, the
  bid's line quantity (`bids.get`) and `materialsList.get` all move, measured
  before and after. Same for a count card's sheet delete.
- Client: `takeoffRefresh` test that an end change and a card delete move
  `bids.get` and `materialsList.get` (they ride on "run" and "markRemoved").

### Build order

a. `setEnds` lock gap (fix + red test). b. Toolbar Delete. c. Count card
trash (server `removeForGroupOnSheet`) + card undo arrows. d. Run ends
section, quick picks, Set ends button, end undo. e. Wrong-number tests,
full suite, on-screen check.

---

## Part 4 § 2 — MEASURED 2026-09-29 (before changing anything in upload)

`Decant Facility.pdf`, 52.6 MB, one PUT (under the 64 MB pieces threshold).
**Local disk storage, `pnpm dev`, localhost** — NOT `pnpm dev:r2`: that would
write a 52 MB test file into the live plans bucket under keys built from local
bid ids that can collide with production's, and that was not done without the
owner's say-so. Driven Chrome tab was `hidden` (timers throttled; worker
renders and network are not). Logged by `client/src/lib/uploadTiming.ts`.

| Phase                          | Time                | From pick |
| ------------------------------ | ------------------- | --------- |
| Upload ticket                  | 29 ms               | 29 ms     |
| Transfer, one PUT (localhost)  | 128 ms              | 156 ms    |
| Attach                         | 27 ms               | 183 ms    |
| Viewer opened the file         | 338 ms              | 521 ms    |
| Sheet 1 drawn (render 1177 ms) | 1224 ms             | 1745 ms   |
| Sheet names read (parallel)    | 752 ms after attach | —         |

**What this says, and what it cannot.** Everything the APP does between the
pick and sheet 1 on screen is about 1.6 s, and 1.2 s of that is pdf.js drawing
a 3672x2376 raster. So on the live site the wait is the NETWORK: 52.6 MB up to
R2 (about 21 s at 20 Mbit/s upload), then the viewer pulling byte ranges back
down. The transfer rate above is localhost and means nothing for that.

**Re-ranked recommendations (nothing changed yet — owner to choose):**

1. **Open the viewer from the file on this machine** instead of re-reading it
   from R2 (recommendation 1 above). Removes the download half entirely and
   could show sheet 1 while the upload is still going. Biggest win.
2. **Pieces for 50 MB** (4 in parallel) only if a real upload shows the one
   PUT is slow on the owner's connection. Needs one timed upload on
   `pnpm dev:r2` or the live site — the one thing still unmeasured.
3. Thumbnails already wait for sheet 1 (piece g, part 1). Throttling the
   progress re-renders is not worth doing on this evidence: the transfer is
   network-bound, not render-bound.
