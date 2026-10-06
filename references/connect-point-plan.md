# Connect points — where the conduit really meets the device

**Status: PLAN ONLY, 2026-10-01 (Track B).** No app code, no migration.
Nothing here is built. Open questions for the owner are in § 9.

> **PARTLY BUILT, 2026-10-01 (Track B) — everything that needs no column.**
> `shared/connectPoint.ts`, `snapToMark` in `client/src/lib/legSnap.ts`,
> the `connectPoints` worker request, and the glyphs in `TraceLayer.tsx`.
>
> - **Default by family, not by symbol.** The pin's family (name > assembly
>   > category, `shared/deviceFamily.ts`) says wall or centre:
>   > receptacle, switch, data → wall; box, lighting, equipment, other →
>   > centre. A wall device's wall is the § 4.1 fallback — the nearest long
>   > line beside it — gated by step 0 below, which it passed.
> - **Every snap uses it, including the ORDINARY trace click.** § 1's table
>   says a run's first leg and every vertex click were not snapped; that
>   left the commonest case (click the symbol, double-click the next symbol)
>   ending at centres, so a click within reach of a mark now lands on its
>   connect point too. Alt, or Free on touch, still places a raw point.
>   Previewed before the click (ring + "at the wall" / "centre — no wall
>   found" at the cursor); the double-click test reads the snapped point
>   (`traceClickPoint`) — judged on the raw press it left a zero-length stub.
> - **Shown on screen** while tracing and on the selected run: a cyan tick
>   from the symbol's centre to a dot on the wall; an amber dashed "?" ring
>   where a wall device is met at its centre (scan, no wall, or an end
>   traced before this). Drawn over the touch handles.
> - **Not built (needs A's columns, § 5 / pin plan § 12):** a per-symbol
>   offset and "It's the middle", turning per mark, confirming an
>   unconfirmed wall end (§ 4.1's one-click confirm needs somewhere to keep
>   the answer), § 3.2's local match, "Re-check ends". § 9 Q3 is answered
>   provisionally as "count it": a wall end counts its length, unflagged on
>   the bid, but always visible on the drawing.
> - **Old runs keep their lengths** (§ 6): nothing re-reads a stored point.

## The problem

Many plan symbols are drawn standing OFF the wall: a wall receptacle is a
circle with two ticks, set out into the room with a short stem back to the
wall line. The count mark sits at the symbol's CENTRE, because that is where
the estimator clicks. The conduit does not go to the centre of a drawing of a
receptacle. It goes to the box, which is in the wall, where the symbol touches
the wall line.

A run that snaps to the mark therefore ends short. The owner's estimate is
**about a foot per end at 1/8" = 1'-0"** (1 ft = 9 page points at that scale,
which is about the stand-off of a typical symbol). This has not been measured
yet; step 0 in § 7 measures it. On a branch with twenty devices that is twenty
to forty feet of pipe and wire missing from the bid, **with nothing on screen
to say so**. That is the failure this app is built against. It has to be
solved before the AI traces runs, because the AI will snap to marks every
time, at volume.

**The idea evaluated here:** each captured symbol gets a **connect point**,
stored as an offset (distance and direction) from the symbol's centre. Runs
snap to the connect point, and the mark still shows at the centre.

**Verdict: adopt it, with two changes the code forces.**

1. **The offset is not enough on its own. Each mark also needs to know which
   way its copy of the symbol is turned.** A receptacle on the north wall and
   one on the south wall are the same symbol turned 180°, so the same offset
   points opposite ways. Hand-placed marks know nothing about turning today
   (§ 3).
2. **A hand-placed mark is wherever the click landed, not the exact symbol
   centre.** "Centre plus offset" inherits the click error. On vector sheets
   both problems have one fix: read the symbol under the mark from the line
   work (§ 3.2).

---

## 1. Where run snapping happens today

Checked in the code on track-b, 2026-10-01.

| #   | Where                                                                                                                 | When it fires                                                                                                                                                               | What it snaps to                                                                                                                                      | What it stores                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `client/src/lib/legSnap.ts` → `resolveLegStart`, called from `TraceLayer.tsx`. `quantitySnap` covers quantity traces. | **Only** the first click of a second or later leg, and a Shift-click to start a new leg. A run's first leg and every ordinary vertex click are **not** snapped (raw click). | In order: the nearest **mark centre** (the stamp's stored x/y); an end of this run's legs; a point along a leg. Never another run, never a wall line. | **Copies** the mark's x/y into the leg's points (`placeLegStart` → `setTracePoints([snap.point])`). Also stores `startStampId` (`server/db.ts` `addBranchLeg`, ~7845). A mark lying along a leg becomes a tee at the **projected** point, with `fitting: "mark"`. A quantity trace copies the point but keeps no link. |
| B   | `TraceLayer.tsx` → `snapEnd`                                                                                          | An **end** vertex dragged and let go near a mark.                                                                                                                           | Mark centre.                                                                                                                                          | **Copy only**: `movePoint(points, index, best)`, with no stamp id. **Not mentioned** in the todo.md legSnap entry; add it there.                                                                                                                                                                                       |
| C   | `TakeoffPage.suggestionForRun` → accepted in `runEnds.tsx`                                                            | A run's last point within 24 real inches of a mark (`SUGGEST_WITHIN_INCHES`, `shared/takeoffHeights.ts`).                                                                   | Proposes a link, and never moves a point.                                                                                                             | `endStampId` only (`takeoffRuns.setEnds`).                                                                                                                                                                                                                                                                             |

- **Reach** for A and B: `LEG_SNAP_PX = HIT_TARGET_PX × 0.75` = 13.5 screen
  px, turned into page points by `snapReach()` (`TraceLayer.tsx` 166, 392).
- **Length** reads only the run's stored points: `tracedRunOf` →
  `pathRealInches` (`shared/takeoffQuantities.ts`), or `typedLengthInches`
  when one was typed. **A mark's position is never re-read** when length is
  worked out. `startStampId` and `endStampId` matter only for drops and for
  "who owns this mark" (`stampsClaimedByRuns`).
- **What follows:** an error in the snapped point is baked into a stored
  number the moment the run is saved, and nothing later corrects it. It also
  means a fix **cannot** move an old run silently (§ 6).
- **Related open item:** todo.md, "Tracing snaps a run end onto a nearby
  mark's spot" (an AI mark in the wrong place gives a wrong length). It is the
  same place in the code. The connect point and the "do not snap to an
  unconfirmed AI mark" rule are one change to `resolveLegStart` and
  `snapEnd`. Build them together.

**Today there is no orientation, anchor or connect point anywhere** for
symbols or marks. Marks hold only x and y. `bid_pdf_sheet_text` stores text
without positions. Wall line geometry is not extracted on track-b. Track C's
`client/src/lib/vectorGeometry.ts` (on `track-c`) is the first code that reads
the PDF's line work.

## 2. How the connect point is set

**It is set on the captured symbol (the legend item), once.** It then reaches
every job, the same way the item's link to an assembly does.

### 2.1 At capture

The naming card (`SymbolCaptureForm`) gains one optional step under the
picture:

> **Where does the pipe meet it?** Click the spot on the picture.
> [the boxed symbol, enlarged, with a small crosshair] — _Skip_

- The click is stored as an offset from the **centre of the capture box**, in
  page points, in the symbol's own frame as drawn on the legend.
- **Skip is a first-class answer.** "Manual is the product": a symbol with no
  connect point snaps exactly as today, to the centre (§ 4 has the
  fallbacks). Nothing is asked again unless the estimator opens it.
- A **centre-mounted** symbol (a ceiling fixture, a floor box, a J-box) gets
  **"It's the middle"** as a one-click answer. That stores a zero offset,
  which is different from never answered (§ 5).
- The picture is the cropped thumbnail, so the click maps through the crop
  box. This is why the **capture box must be stored** (§ 5). Today only the
  picture is kept.

### 2.2 Later, from the right panel

- The legend row (`LegendPanel.tsx`) gets a small **connect-point badge**:
  a dot on the thumbnail where it is set, a dashed outline where it is not.
  Clicking it opens the same picker as at capture, with **Clear** and
  **It's the middle**. It goes beside the pencil added today for renaming,
  and is always visible so it works on a phone.
- **A locked bid does not stop it.** The connect point is library data, not a
  number on this bid. Changing it changes no stored run (§ 6), so nothing on a
  locked bid can move. Only a run traced **afterwards** uses it, and a locked
  bid takes no new runs anyway.
- **Several looks** (Track C's `multiple-looks-plan.md`): the picker opens on
  the look being edited. See § 5.3.

## 3. Turned and mirrored copies

### 3.1 Copies found by Find all matching (track-c)

Track C's matcher (`client/src/lib/findMatching.ts`) already returns, for
every copy, `rotation: 0 | 90 | 180 | 270` and `mirrored`, plus the copy's
**centre**. It works these out from eight orientations, where the "mirror x
first, then turn" rule is the `ORIENTS` table. So the connect point for a copy
is:

```
copyConnect = copyCentre + turn(rotation) · mirror(mirrored) · offset
```

It uses **the same matrix the matcher used** to find the copy. It must be
imported from `findMatching.ts`, not re-derived, so the two can never disagree
about which way "90°" turns. The matcher's centre is also better than a click:
it comes from the symbol's own line work, not from where a finger landed.

**Today the turning is thrown away.** Confirming a match queues an
**ordinary mark** (x, y only), so a confirmed copy forgets which way it
faced. **That is the column for Track A in § 5.**

### 3.2 Marks placed by hand

A hand mark has a click point and no turning. Three cases:

1. **Vector sheet, symbol has a look with a box:** when a run is about to
   snap to the mark, run the matcher **once, locally**, in a small window
   around the mark (about two symbol widths), with the item's look(s) as the
   pattern. This is the same code as Find all matching, aimed at one spot. If
   it finds the copy, use its centre and turning. Measured cost on Weld 1:
   0.09–0.3 s for a whole sheet (find-all-matching-plan.md § 2), so one window
   is far less. The sheet's geometry is already in the worker once read. If
   the window finds the copy, **write the turning onto the mark** (§ 5), so
   the next snap does not ask again.
2. **Vector sheet, no match in the window** (the drawing differs, or the look
   has no box): fall back to § 4.
3. **Scan:** there is no line work, so there is nothing to read. Snapping goes
   to the **centre, as today**, and the end ring says so (§ 4.3). The
   estimator places the end by hand with Alt (free point) if the centre is
   wrong. Scans are manual only, as asked.

**Rejected: guessing the turning from the run's direction** ("the pipe comes
from the left, so the wall is on the left"). Conduit regularly arrives from
the side or from above, so this is right often enough to be trusted and wrong
often enough to matter. That is the worst combination.

## 4. Symbols with no connect point

### 4.1 Vector sheets: the nearest wall line, unconfirmed

When the item has no connect point (never answered, not "it's the middle"),
and the sheet is vector:

- From the mark centre, look along the four axis directions, and along the
  copy's own axes if the turning is known, for the **nearest long straight
  segment** within a reach of about 1.5 symbol widths. "Long" is a wall,
  not a piece of the symbol: longer than 3× the symbol's box. It must also not
  be inside the capture box, which is the matcher's own exclusion rule (it
  already ignores "a gray wall behind it").
- Snap the run end to the **foot of the perpendicular** on that line.
- **Mark it "unconfirmed":** the end ring is drawn dashed with a "?". This is
  the visual language for provisional things everywhere on the drawing (pin
  plan § 8). The run row says "1 end placed at a wall, not confirmed". One
  click confirms ("Yes, it meets the wall here"). One click offers to save the
  offset to the symbol for next time, and that is offered **once per symbol**,
  not nagging (CLAUDE.md, "an offer to save something for next time is useful
  once").
- **An unconfirmed end still counts its length.** It is a better number than
  the centre, and leaving it out would understate more. But the bid's
  "not finished" amber mark counts it (Part A rule 5), the same as an
  unconfirmed match. **Decision for the owner (§ 9 Q3):** count it, or hold
  the run off the bid until confirmed.
- No line found within reach: the centre, as today, with the dashed ring and
  "placed at the symbol's centre". It is never silent.

### 4.2 What "wall line" means needs measuring first

Wall lines on electrical sheets are often a **lighter gray background**
(xref'd architecture) under darker electrical work. Track C's
`vectorGeometry.ts` already records how dark each segment is and whether it
is filled. Step 0 (§ 7) measures, on Weld 1 E-200 and UNCC E111, whether "the
nearest long segment" is actually the wall for real receptacles. Doors,
dimension lines, casework and hatching are all long straight segments too.
**Ship the fallback only if it picks the wall in at least 9 of 10 sampled
devices**; otherwise keep the centre plus dashed ring and rely on § 2.

### 4.3 Scans

Manual only, as asked. Snap to the centre. The dashed ring reads "centre — a
scan has no wall lines to find; Alt places the end yourself". No AI is used to
find walls. That would be a model call nobody pressed a button for (AI rule 1).

## 5. Where it is stored, and the columns Track A must add

**FLAG FOR TRACK A. Not numbered here; A numbers migrations.** Every column
is **additive and nullable** (step 1 of the three, CLAUDE.md § Deploying a
migration). NULL keeps today's behaviour, so the database may go ahead of the
code with no window.

### 5.1 On the symbol (or on each look, § 5.3)

| Column                                         | Type            | NULL means                         | Why                                                                                                                                                                                                                                     |
| ---------------------------------------------- | --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connectDx`, `connectDy`                       | `decimal(10,4)` | **never answered** (fallback, § 4) | The offset from the capture box's centre, in page points, in the legend's frame. **`0, 0` means "it's the middle"**, which is a real answer. NULL and zero must stay different (CLAUDE.md § Editing fields, rule 6: unset is not zero). |
| `captureX`, `captureY`, `captureW`, `captureH` | `decimal(12,4)` | old symbol, no box                 | **Already requested** (A's R.11 and find-all-matching-plan.md § 6). They define "centre" and map the click on the picture. One handoff, not two.                                                                                        |

**Scale:** the offset is in page points of the **sheet it was captured on**.
A symbol drawn at a different size on another set would need it scaled by the
size of the matched copy. The matcher does not handle other sizes today
(find-all-matching-plan.md § 2, "what it cannot do"), so v1 uses the offset
as stored and § 9 Q5 asks the owner.

### 5.2 On the mark

| Column                    | Type                      | NULL means        | Why                                                                                                          |
| ------------------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `takeoff_stamps.rotation` | `smallint` (0/90/180/270) | turning not known | Which way this copy faces. Written when Find all matching confirms it, or when § 3.2's local match finds it. |
| `takeoff_stamps.mirrored` | `boolean` NULL            | turning not known | Paired with `rotation`.                                                                                      |

**Batch them** with the queued mark-status column (`takeoff_stamps.status`)
and the pin-style columns (todo.md, Track A migration queue). It is the same
table and the same additive shape.

**Not stored:** the connect point per mark. It is **derived**
(centre + turn · offset) each time a run snaps. A stored copy would be a
second source that drifts the first time someone edits the symbol's offset.
The run's own points are what is frozen, and they already are (§ 6).

### 5.3 How it fits the other plans

- **Multiple looks (Track C, `multiple-looks-plan.md`):** yes, **each look
  needs its own connect point.** Two architects draw a GFCI differently, and
  the stand-off differs. If the owner picks C's look table, the
  `connectDx/Dy` columns go **on the look row**, beside its capture box, and
  not on `symbol_links`. The matcher reports which look found a copy, so the
  copy takes that look's offset. For a hand mark, the § 3.2 local match tries
  each look, in C's order (this set's look first). **Tell Track C:** its § 2
  table gains two columns. **The decision falls to whichever lands first:** if
  C's look table is approved, the columns go there; if not, on
  `symbol_links`. Do not add both.
- **Count by tag (`count-by-tag-plan.md`):** no change. The tag is text beside
  the symbol, and the connect point is part of the symbol. Every tag of
  "Linear" shares its connect point.
- **Pin styles (`track-b-count-pin-styles-plan.md`):** the pin stays at the
  centre, as asked. § 4 of that plan (the ring around the symbol when zoomed
  in) is unaffected. **One addition:** when a connect point is set, a small
  tick on the pin's ring shows where it is, only while the trace tool is
  armed. That is when it matters, and the rest of the time it is clutter.
  Drawn by the same shared pin function.
- **Several items on one assembly (pin plan § 11):** the connect point
  belongs to the ITEM, not the assembly. Two symbols of one assembly can stand
  off the wall differently, and § 11 gives each its own count anyway.
- **Unconfirmed AI marks (todo.md):** a mark the reader placed and nobody has
  confirmed is **not snapped to at all**. This is the safe answer to that open
  item, and it is one rule in the same function. Confirmed AI marks behave
  like any other mark.

## 6. Runs already drawn, and saved bids

- **No stored number changes.** Length comes from the run's own stored points
  (§ 1). Adding or changing a connect point moves no point, so every existing
  run, every live-following bid line and every locked line reads exactly what
  it did. This is true by construction, and a test pins it (§ 7, T6).
- **Only new snaps use it**: a new leg, a new end drag, or a re-trace.
- **Optional, and only on request:** a "Re-check ends" action on a run (and a
  count of runs that could use it, per sheet) shows each end it would move,
  with the feet it would add, **before** anything changes. Nothing is applied
  in bulk without that preview. Per CLAUDE.md, finished work does not change
  because the library did.
- **Locked bids stay locked.** "Re-check ends" is refused on a locked bid with
  the standard sentence (`lockedEditRefusal`). It also moves the run, which is
  already refused there (`lockedEdits.test.ts`). A locked bid's lines read
  their stored `qty` anyway (`withPlanCounts`).
- **CHANGELOG** says plainly: "runs traced before this keep their lengths".

## 7. How it is built, and the tests that must fail without it

**Step 0, measure first** (CLAUDE.md: a number that can be measured should
not be asserted). On Weld 1 E-200 (vector) and the Blueridge set (scan):

- the stand-off, centre to wall, of 10 real wall receptacles, switches and
  data outlets, in page points and in real feet. This replaces "about a foot"
  with a number;
- what share of hand clicks land more than 2 pt from the true centre
  (justifies § 3.2);
- whether "the nearest long segment" is the wall, out of 10 (the gate in
  § 4.2).

### Step 0 — measured 2026-10-01 (Track B)

`scripts/connectPointCheck.mts`, Weld 1 E-200 (vector, 1/8" = 1'-0"), the
owner's 46 hand marks on `bidrender_local_c`; 29 are wall families. Each
found foot was called by eye on a picture of the device.

| Device                   | Wall found | Stand-off (median, range) |
| ------------------------ | ---------- | ------------------------- |
| Duplex receptacle        | 8 / 9      | 4.8 pt (4.3–5.3)          |
| Double duplex receptacle | 5 / 5      | 4.5 pt (4.3–4.9)          |
| GFCI receptacle          | 1 / 1      | 4.7 pt                    |
| Telecom (data)           | 10 / 10    | 4.4 pt (4.3–4.8)          |
| Single-pole switch       | 3 / 4      | 4.9 pt (4.3–8.5)          |

- **The stand-off is about HALF a foot per end at 1/8", not a foot**:
  ~4.5 pt = 0.5 ft. The symbol touches its wall; the stand-off is its own
  radius. Still a wrong number on every wall device, at both ends.
- **The gate (§ 4.2) passed: 25 of the 27 walls found are right (93%).**
  Wrong: a switch beside a home-run arrow line (black, 4.9 pt), and a hand
  mark sitting in empty space. Two found nothing and keep the centre, with
  the "?" ring.
- **Two rules came out of the pictures**, each now a test: a reach of 14 pt
  took a room-name rule 13.1 pt away (reach is 9 pt), and a dashed line
  drawn THROUGH a telecom triangle at 2.4 pt beat the hatched wall at
  4.4 pt (lines nearer than 3 pt are skipped).
- **Not measured:** hand-click error (§ 3.2), and any scan — on a scan every
  wall device keeps its centre and says so.
- **If this is re-run and the table does not match, stop and find out why**
  before changing the reach or the length: either the drawing set differs or
  the finder changed, and those want different answers.

**Pure rules in `shared/connectPoint.ts`** (and `client/src/lib` for the
snap), each with a test that goes **red** on today's code:

| #   | Test                                                                                                                                                                                                      | Red today because                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T1  | `resolveLegStart` near a mark whose symbol has offset (0, +9): the snap point is the centre + (0, 9), not the centre.                                                                                     | It copies `stamp.x, stamp.y`.                                                       |
| T2  | The same with the mark turned 90°, 180° and 270°, and each mirrored: 8 cases. The connect point turns with the copy, **using the matcher's own `ORIENTS`**.                                               | There is no turning at all.                                                         |
| T3  | `snapEnd` (end drag) gives the same answer as T1. One function serves both, so a drag and a click can never disagree.                                                                                     | `snapEnd` copies the centre separately.                                             |
| T4  | A 3-leg run ending at two offset devices: `runFeet` is longer by exactly the two offsets' wall-ward lengths, at 1/8" scale.                                                                               | Ends land at the centres.                                                           |
| T5  | NULL offset versus `0,0`: NULL takes the fallback path (§ 4); `0,0` snaps to the centre **with no "?"**.                                                                                                  | No column exists, so the two cannot be told apart.                                  |
| T6  | **Old runs do not move:** store a run, add a connect point to its symbol, read `runFeet`, bridge quantity and a locked line's qty. All three are unchanged.                                               | Passes today, and must keep passing. It guards the change, it does not catch a bug. |
| T7  | The wall fallback (§ 4.1) on a fixture: a symbol box plus a long segment 9 pt away. It snaps to the foot of the perpendicular and is flagged `unconfirmed`. A long segment **inside** the box is ignored. | No fallback.                                                                        |
| T8  | A non-square fixture (a 2:1 symbol box with a wall on the LONG side only), so the four-direction search can find the wrong side. CLAUDE.md § "A test fixture shaped like its container".                  | No fallback.                                                                        |
| T9  | An unconfirmed AI mark is not snapped to; a confirmed one is.                                                                                                                                             | Every mark is a target.                                                             |
| T10 | Server: `drop` from a confirmed match stores rotation and mirrored; a hand drop stores NULL; a locked bid refuses both.                                                                                   | No columns (after A's migration).                                                   |

The screen part (the picker, the dashed "?" ring, the badge) is checked by
looking at it: E0.01 plus a drawing sheet of "Bar layout check", at 1536 px
and 390 px. Trace to a turned receptacle and read the run's feet before and
after.

**Order:** step 0 → A's columns (batched) → T1–T5 and T9 with the picker →
the local match (§ 3.2) → the wall fallback, only if step 0 clears its gate
→ "Re-check ends". **The AI tracing runs waits for T1–T4.**

## 8. Later: vertical drops (separate line, not this plan)

A run that meets a device at its connect point ends **at the device's
location in plan**. The vertical from the run's height down to the device is
a separate quantity that already exists: group drops (`takeoff_groups.dropKind`
and friends, `shared/groupDrops.ts`) and run-end heights. The two stack and
must not overlap:

- the connect point fixes **horizontal** footage, so the wall-ward foot is no
  longer lost;
- the drop adds **vertical** footage at that same point.

The only shared piece is `groupDrops.nearAnOpenEnd`, which decides "this run
end is at this device, so do not double count the drop". It measures from the
mark **centre** today, with a 24-inch reach. Once ends land on connect points,
that check should measure from the connect point. The distance shrinks, so
the rule gets more reliable, not less. **It gets its own line in todo.md when
this is built, not a change inside this plan.**

## 9. Open questions for the owner

1. **Should the app ask for the pipe spot at capture, or only when you choose
   to set it?** Recommended: **ask once, with Skip and "It's the middle" right
   there.** One click, and never asked again.
2. **Hand marks on vector sheets: is it OK for the app to quietly "read" the
   symbol under a mark to see which way it is turned (no AI, a fraction of a
   second), the moment you trace to it?** Recommended: **yes**. Without it a
   receptacle on the opposite wall gets its pipe spot on the wrong side.
3. **A run end the app placed at a wall line (not confirmed by you): count
   its length on the bid now and flag it amber, or keep the whole run off the
   bid until you confirm?** Recommended: **count it and flag it**. It is
   closer to right than the centre, and the flag stops it being missed.
4. **Old runs: leave them alone, with a "Re-check ends" button that shows you
   what it would add first?** Recommended: **yes, and never automatic.**
5. **The same symbol drawn bigger or smaller on another plan set: should the
   pipe spot scale with it?** Recommended for now: **no**; set it per look.
   Find all matching does not handle other sizes yet either.
6. **Should a symbol's pipe spot be one per legend item, or one per look
   (Track C's plan)?** Recommended: **per look, if you approve C's looks.**
   Otherwise per item.
7. **Should the AI tracing runs wait until this is built?** Recommended:
   **yes**. The AI would make this mistake on every device, at volume.
