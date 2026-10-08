# Track B: Plans screen edits — what is left (2026-10-07)

> **STATUS, 2026-10-07 (later) — owner: build only in files Track C does not
> touch.**
>
> - **Gap 1 is DONE — by Track C on `c-homerun-footage`** (owner,
>   2026-10-07). Not built by B.
> - **Gap 5 is BUILT:** `server/previewNeverSaved.test.ts` and
>   `client/src/lib/traceSavePath.test.ts`. Each was shown red against a
>   mutation.
> - **Gap 6 is MEASURED on staging (R2):** `scripts/stagingUploadTiming.mts`.
>   - The PUT is most of the wait.
>   - The measurement found a fault this plan had not: every plan set
>     downloaded WHOLE in the background (pdf.js's stream). **Fixed** in
>     `shared/pdfRangeLoading.ts`.
>   - 6.2 ("Preparing sheets") is dropped: there is no silent stretch.
> - **Gaps 2, 3, 4 and 6.1** need a file C changes, so they are in todo.md,
>   "Plans screen gaps — AFTER TRACK C MERGES".

**Plan only when written.** This was asked again on 2026-10-07 using
the 2026-09-29 brief (drag points, live distance, undo/clear, PDF loading).
That brief already has a plan, `references/track-b-plans-screen-edits-plan.md`,
and **almost all of it is built and live on local-dev.** This file does not
repeat it. It lists what was checked, what is already done (skipped), and the
gaps still open, with a plan for each.

## What is already built — skipped

Each item below was checked against the code on 2026-10-07, not taken from the
older plan.

| Asked for                                                              | Built in                                                                                                                                                     | Checked how                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Drag a point, add one on a line, delete one                            | `de95988` — `runPointEdit.ts`, handles in `TraceLayer.tsx`, `takeoffRuns.setPoints`                                                                          | Read `setPoints`. It refuses a locked bid, pins tee ends, recomputes length from the points and drops pull answers whose corner moved |
| Recalculation after a drag (length, fittings, elbows, pull boxes, bid) | Same; `server/runSetPoints.test.ts`                                                                                                                          | The test covers length, fittings, bridge quantities and pull answers                                                                  |
| Typed length wins over a drag                                          | Same (`setPoints` never writes `typedLengthInches`)                                                                                                          | Read                                                                                                                                  |
| Undo for a drag                                                        | `restorePoints` on the undo stack (`1439e9c`, `de95988`)                                                                                                     | Read `TakeoffPage.tsx` undo switch                                                                                                    |
| "Run total" from clicked points only; small dim "Next" at the cursor   | `274e119` — `client/src/lib/traceReadout.ts`                                                                                                                 | **Mutation check below**                                                                                                              |
| Thinner, dimmer preview line; on/off                                   | `274e119` — 1/3 stroke, dashed, 0.45 opacity; Settings → Display "Next" toggle                                                                               | Read                                                                                                                                  |
| Undo / redo arrows for counts, runs, marks                             | `1439e9c` — `undoStack.ts`, 50 steps, Ctrl+Z / Ctrl+Shift+Z, toolbar arrows                                                                                  | Read                                                                                                                                  |
| "Clear all marks and runs on this sheet" with a count and confirm      | `8eb8671` — preview names what goes; one undo step brings it all back                                                                                        | Read                                                                                                                                  |
| No master clear across the plan set                                    | None exists                                                                                                                                                  | Searched                                                                                                                              |
| Totals, bid lines, materials list move after clear / undo              | `client/src/lib/takeoffRefresh.ts` + its test (`deleting marks or undoing drops refreshes the bid's lines and the materials list`, and the clear-sheet case) | Read the test names                                                                                                                   |
| "Select text" explained / renamed                                      | `8eb8671` — it is now **"Copy text"**                                                                                                                        | See Part 3 below for the plain-words answer                                                                                           |
| No white square on first load                                          | `2a939d2` — `planLoadState.ts`: "Opening plan set…" then "Drawing sheet N…"                                                                                  | Read                                                                                                                                  |
| Upload progress bar                                                    | `UploadProgress.tsx`: percentage, bytes, speed, time left                                                                                                    | Read                                                                                                                                  |
| Measure a ~50 MB set                                                   | `3db6903` — `Decant Facility.pdf`, 52.6 MB, **15 pages** (counted 2026-10-07)                                                                                | Table in the older plan, "Part 4 § 2 — MEASURED"                                                                                      |
| Lock gaps on run/mark edits                                            | `feadbc0`, `3aae7f1` — every run mutation now refuses a locked bid except one (gap 2 below)                                                                  | Mapped `refuseIfLocked` over every procedure in `takeoffRunsRouter.ts`                                                                |

## Part 2 first — the preview segment: NO wrong number found

The brief asked to say right away if the saved run, the bid line or the totals
include the preview segment. **They do not, and it is structural:**

1. The cursor position (`hover`) is state inside `TraceLayer`. It is never
   passed up. The run's points change in exactly four places
   (`TraceLayer.tsx` ~998, ~1008, ~1214, ~2514). Three remove the last point,
   and one adds the CLICKED point (`traceClickPoint`). None reads `hover`.
2. Every save in `TakeoffPage.tsx` — autosave, draft, leg, finish — sends
   `tracePoints`, the clicked points.
3. The server never accepts a length from the client. `save` and `setPoints`
   compute `lengthInches` from the stored points (`pathRealInches`). The bid
   line and totals read that.

**Mutation check, done 2026-10-07:** I put the old "to cursor" behaviour back
into `traceReadout.ts` (`runTotal` from points + hover). `traceReadout.test.ts`
went red ("expected 2711.77 to be close to 168"), and I reverted the change.

**The one gap:** that test guards the on-screen pill only. Nothing pins the
save path. That is safe today by construction, but a refactor could change it
silently. One small test is proposed (Gap 5).

## The gaps still open

### Gap 1 — WRONG NUMBER: dragging a run's END leaves it on its old mark

> **DONE 2026-10-07 by Track C** on `c-homerun-footage` (owner). B did not
> build it; the plan below is kept as the record of what was found.

**Found 2026-10-07 by reading `setPoints`.** It writes `points`,
`lengthInches` and `scaleRatioUsed`, and nothing else. A run's end can be
claimed by a mark (`startStampId` / `endStampId`, plus `startConnect` /
`endConnect` since 0104), and that claim decides the end's drop:
`endOfRun(kind, height, teeId, stampId, …)` takes the mark's height. So:

- **Drag an end OFF a receptacle** into open space: the run still says it
  ends at that receptacle. It keeps the receptacle's drop footage, and the
  receptacle stays "claimed", so its own drop is not counted again. The
  drawing says one thing and the wire quantity says another.
- **Drag an end ONTO a different mark**: the new mark is not claimed. Its drop
  is not added to the run, and the OLD mark is still claimed.

Neither looks broken on screen, and both are a wrong wire footage on the bid.
The client sends no stamp information on release either (checked
`TakeoffPage.tsx` `editPoints`).

**Recommendation:** treat an end drag the way a trace click is treated.

- On release, the client resolves the moved end with the SAME snap the trace
  click uses (`traceSnap` / `snapToMark`, which already skips unconfirmed
  marks).
- `setPoints` takes an optional `ends: { start?, end? }`, each
  `{ stampId, connect } | null`.
- The server clears the claim when the end left its mark, and takes the new
  claim through the same checks as `setEnds`: it refuses an unconfirmed mark
  and refuses a tee end.
- An end dragged off a mark keeps its KIND and loses its MARK, so the drop
  falls back to the kind's height. This is the same rule as an end that never
  had a mark.
- Undo already restores the whole network packet, including the claim.

**Overlap with Track C:** this decides drops at run ends, which is exactly what
`c-homerun-footage` is changing. **Build it after C merges**, on top of C's
`runVerticals.ts` / `homerunsCore.ts`. Before that, agree with C what "claimed"
means in C's new code.

**Tests that fail without it** (`server/runSetPoints.test.ts`):

- an end dragged off its mark comes back with `endStampId = null`, and
  `takeoffRuns.drops` / the bid line's wire quantity change to the kind-height
  figure;
- an end dragged onto mark B claims B and releases A, and A's own drop is
  counted again;
- dragging onto an unconfirmed mark is refused;
- undo puts the old claim back.

### Gap 2 — `setLocation` ignores the lock

`takeoffRuns.setLocation` is the one run mutation with no `refuseIfLocked`
(the others were mapped on 2026-10-07). Location is a label, not a number, so
nothing on the bid moves. But it is the same class as `3aae7f1`, and it lets
the drawing drift from a locked bid. **Recommendation:** add the guard in one
line. Test: `setLocation` on a locked bid is refused (`server/runSetPoints.test.ts`
or a lock test beside it).

### Gap 3 — closed bids (won / lost / archived)

There is still no status gate on any Plans edit. The older plan recommended
NOT adding one, because the lock is the "this is finished" tool, and that
still holds. **Recommendation: leave as is**, but show the lock offer once on
a won bid's Plans screen ("This bid is won — lock its quantities?"). Copy only;
needs no migration. Owner's call.

### Gap 4 — what undo can and cannot do (say it plainly on screen)

**Can be undone (one step each):**

- placing or deleting marks;
- deleting a count from a sheet;
- deleting a run;
- dragging, adding or removing a run's points;
- changing a run's ends;
- clearing a sheet;
- the drop answers.

**Cannot be undone today:**

- a mark's status, height, drop-excluded or location;
- adding a leg or a tee;
- circuits;
- a run's type, typed length or extras;
- trace mode and branch wiring;
- capturing a symbol;
- setting a scale;
- a sheet's name or number;
- removing a plan set.

**Recommendation:**

- Add a "Can't be undone" tooltip on the undo arrow when the last change was
  one of these, so nobody presses undo and gets an older step instead.
- Add undo next, in this order, for the ones that change a number: run type,
  typed length, circuits, legs.
- Leave labels, scale and plan sets out. Scale already has its own
  confirmation, and a plan-set removal has its own warning.

**One refresh gap found:** undoing a count deleted from several sheets only
refreshes the open sheet and the step's sheet (`sheetsToRefresh`). Other
sheets show their old marks for a moment when you switch to them, then
refetch, because the default `staleTime` is 0. That is a flash, not a lasting
wrong number. **Recommendation:** have a whole-count restore refresh every
sheet of the bid. Test in `takeoffRefresh.test.ts`: the group-restore step
names every-sheet refresh.

### Gap 5 — a test that pins the save path, not just the pill

Add a server test that `takeoffRuns.save` with points A→B stores the A→B
length, even when the caller also sends a `lengthInches` (zod strips it). Add
a source guard in `client/src/lib/` that `TraceLayer.tsx` never passes `hover`
into `onPointsChange`. Both fail if the preview ever reaches a saved run.

### Gap 6 — PDF loading: what is still slow, and the measurement still missing

**Measured locally (2026-09-29, Decant set, 52.6 MB, 15 pages, disk storage):**

- from picking the file to sheet 1 on screen is about **1.7 s**;
- 1.2 s of that is pdf.js drawing the first sheet;
- the upload ticket and attach take about 30 ms each.

So the app itself is not the slow part. On the live site the wait is the
network: 52.6 MB up to R2, which is about 21 s at a 20 Mbit/s upload, then
byte ranges back down.

**Not measured, and it is the one that matters:** a real upload to R2. It was
not done locally because `pnpm dev:r2` writes into the LIVE plans bucket.
**Recommendation:** do it on staging with the throwaway account. Staging has
its own bucket, so nothing touches production.

**What could be faster, ranked:**

1. **Open the viewer from the file already on this machine** while the upload
   runs. That removes the download half and shows sheet 1 in about 2 s
   instead of after the upload. This is the biggest win, and it touches
   `TakeoffPage.tsx` (C's file) and `planUpload.ts`.
2. **A progress line after attach.** Today the only signal after the bar
   finishes is "Reading sheet numbers N of M". Show "Preparing sheets N of 15"
   in the same place. Copy and wiring only.
3. Use pieces for files under 64 MB **only if** the staging measurement shows
   the single PUT is slow.

**Tests:** for 1, a `planLoadState` test that a local file source is used
before the upload finishes and swapped for the stored URL after, without
reloading the document (the `viewerUrlWindow` rule: the URL must not change
under an open plan). For 2, a pure test of the progress wording.

## Files — and which ones Track C's branch also touches

Track C's `c-homerun-footage` was diffed against local-dev on 2026-10-07.

| File                                                                                                   | Gap                               | C touches it?     |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------- |
| `server/routers/takeoffRunsRouter.ts`                                                                  | 1, 2                              | **YES**           |
| `server/db.ts`                                                                                         | 1                                 | **YES**           |
| `client/src/pages/TakeoffPage.tsx`                                                                     | 1, 4, 6                           | **YES**           |
| `client/src/lib/takeoffRefresh.ts` (+ test)                                                            | 4                                 | **YES**           |
| `client/src/components/takeoff/runEnds.tsx`                                                            | 1 (maybe, end wording)            | **YES**           |
| `client/src/lib/legSnap.ts`                                                                            | 1 (maybe, shared snap)            | **YES**           |
| `server/runVerticals.ts`, `server/homerunsCore.ts`                                                     | 1 (read only, to agree "claimed") | **YES**           |
| `CHANGELOG.md`                                                                                         | all                               | YES (append only) |
| `client/src/components/takeoff/TraceLayer.tsx`                                                         | 1, 5                              | no                |
| `client/src/lib/runPointEdit.ts`                                                                       | 1                                 | no                |
| `client/src/lib/undoStack.ts`                                                                          | 4                                 | no                |
| `server/takeoffRestore.ts`                                                                             | 4                                 | no                |
| `client/src/components/takeoff/UploadProgress.tsx`, `client/src/lib/planUpload.ts`, `planLoadState.ts` | 6                                 | no                |
| `server/runSetPoints.test.ts`                                                                          | 1, 2                              | no                |

**Gap 1 is the clash.** It should land after C, rebased onto C's drop code.
Gaps 2, 5 and 6 (item 2) can go before C. Gaps 4 and 6 (item 1) touch
`TakeoffPage.tsx`, so they should land after C too, to avoid a painful merge.

## Migrations

**None.** Gap 1 uses the existing `startStampId` / `endStampId` /
`startConnect` / `endConnect` columns (0104). Nothing goes to Track A.

## Suggested order

1. Gap 2 (one-line lock guard) and Gap 5 (save-path tests). Small, and before C.
2. Gap 6 item 2 (progress after attach), plus the staging upload measurement.
3. **After C merges:** Gap 1 (end drags), the only wrong number here.
4. Gap 4 (undo tooltip, whole-count refresh, then undo for run type and typed
   length).
5. Gap 6 item 1 (open from the local file), if the measurement supports it.

## Questions for the owner

1. Gap 1: an end dragged off a mark keeps its kind (receptacle, panel…) and
   drops the mark? (Recommend yes.)
2. Gap 3: no status gate on won bids, just a one-time "lock it?" offer?
   (Recommend yes.)
3. Gap 4: next undo coverage is run type, typed length, circuits, legs, in
   that order? (Recommend yes.)
4. Gap 6: OK to time one ~50 MB upload on staging with a throwaway account?
   (Recommend yes. It is the only missing number.)

**"Copy text" in plain words** (asked again): it lets you drag a box on the
drawing, reads the words printed inside it, and lets you copy them or search
the catalog for them. It saves nothing and changes no number. The label was
"Select text" until 2026-09-29. "Copy text" says what you get, so **keep it.**
