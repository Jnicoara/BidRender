# Takeoff screen — master spec

> **Written 2026-09-14, and updated the same day with decisions (section 9),
> the V3 fix order (section 12), and sections 13–16.**
>
> **This is the single source of truth for the Takeoff screen** (a bid's Plans
> screen, `#/bids/:id/plans`). When this document and anything else disagree —
> `ASSEMBLIES_PLAN.md`, `CHANGELOG.md`, a code comment, or words on the screen —
> this document wins, and the other one is what gets fixed.

---

## Why this exists

The Takeoff screen was rebuilt from scratch starting Aug 12, working from the
takeoff section of `ASSEMBLIES_PLAN.md`. That plan said the PDF engine would
"stay as-is" and never mentioned zoom, pan, removing a mark, getting counts onto
the bid, tablets or offline use. Zoom and pan lived in the old screen, not in
the engine, so they were silently dropped. Several other features were half
built, and the changelog described some of them as working. Nothing compared
the new screen against the old one.

This document is that comparison, and the list everything gets checked against
from now on.

## How to use it

- **Before building anything on this screen, find its row.** No row, no build —
  add the row first, and get it approved.
- **When a row's status changes, change it here in the same commit.**
- **A changelog entry may only say something works if its row here says Works.**
- **Words on the screen are part of the spec.** Every sentence the screen shows
  has to be true today. Section 8 lists the ones that are not.
- **How the statuses were checked:** by reading the code on 2026-09-14 (branch
  `local-dev`). Only opening, uploading and drawing a real plan were also checked
  in a real browser. Anything marked Works should get a hands-on check before it
  is relied on.

### Keys used in the tables

| Status         | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| **Works**      | Built and connected end to end.                                             |
| **Half-wired** | Some of it is built, but a person cannot actually use it, or not all of it. |
| **Missing**    | Not in the current code at all.                                             |

| Need             | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| **Essential**    | You cannot do a real, accurate takeoff without it.          |
| **Nice-to-have** | Saves time or effort, but a takeoff can be done without it. |

| Source             | Meaning                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Old screen         | The pre-Aug 12 viewer, `PlanPanel.tsx`. Read it with `git show 0a270af^:client/src/components/PlanPanel.tsx`. The richest source. |
| Older viewer       | `PlanViewer.tsx`, a June viewer already unused by August. Minor source.                                                           |
| Changelog          | `CHANGELOG.md`, Aug 12–19.                                                                                                        |
| Plan               | `ASSEMBLIES_PLAN.md` — **incomplete**; see "Where things came from".                                                              |
| Current code       | `client/src/pages/TakeoffPage.tsx`, `client/src/components/takeoff/`, and the takeoff server routers.                             |
| Your request       | Asked for directly when this spec was commissioned.                                                                               |
| Earlier decision   | Decided before this spec (AI rules, "Where do I…?" wording, tablet use).                                                          |
| Decided 2026-09-14 | Decided by you after the first draft. Treat as a requirement.                                                                     |
| Proposed           | Suggested for discussion. Not decided.                                                                                            |

---

## Ground rules for every feature on this screen

1. **Simple and fast.** One way to do each thing. No per-item forms sitting on
   the drawing. Anything that adds a step to every job needs a very good reason.
2. **Works with fingers on a tablet.** Pinch to zoom, one finger to pan, and
   buttons big enough for a fingertip (about 44 pixels or more). Nothing may be
   reachable only by hovering a mouse, double-clicking, right-clicking or
   pressing a key. Keyboard shortcuts are welcome as extras on top of an
   on-screen control, never instead of one.
3. **Nothing silently changes a bid, and AI never finalizes anything.**
4. **No measurement without a scale you can trust.** Never guess a length.
5. **Words on the screen must be true.** If the code does not do it, the screen
   does not say it.
6. **Electrical first, not electrical only.** What you can stamp, and what a
   traced run can be, come from the trade's assemblies and materials. Adding
   plumbing or HVAC must be new content, not a rebuild of this screen.
7. **Honest about offline.** The screen says plainly what works without a
   connection and what does not (section 7).

---

## 1. Viewing the sheet

| ID  | What it does                                                                                                                                                   | Status      | Source                          | Need         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------- | ------------ |
| V1  | Attach plan PDFs to a bid: drop or pick files, several at once, up to 500MB each, with a progress bar, Cancel and Retry.                                       | **Works**   | Current code, Changelog         | Essential    |
| V2  | Start a new bid from a plan in one step from the Dashboard ("Upload a plan").                                                                                  | **Works**   | Changelog Aug 14                | Nice-to-have |
| V3  | Remove a plan from a bid, with a warning that says truthfully what is lost. Fixed first, ahead of zoom and pan.                                                | **Works**   | Current code; fixed 2026-09-14  | Essential    |
| V4  | A sheet list down the side, with real sheet names taken from the PDF's bookmarks, and renaming.                                                                | **Works**   | Plan item 1, Changelog          | Essential    |
| V5  | Move between pages: on-screen arrows, arrow keys, Page Up/Down, Home/End, and a "3 / 18" counter.                                                              | **Works**   | Old screen, Current code        | Essential    |
| V6  | Draw each page in the background so the app never freezes on a dense drawing.                                                                                  | **Works**   | Old screen, Current code        | Essential    |
| V7  | **Zoom:** mouse wheel, pinch, **+ / − / 0** keys, on-screen zoom buttons showing the %, opens fitted to the page at 40%, range 10% to 1000%.                   | **Missing** | Old screen, Your request        | Essential    |
| V8  | **Pan:** click and drag with a mouse, drag with one finger, and pinch moves the view while zooming.                                                            | **Missing** | Old screen, Your request        | Essential    |
| V9  | Marks and traced lines stay visible and tappable at every zoom level (they scale with zoom, with a minimum on-screen size).                                    | **Missing** | Old screen, Your request        | Essential    |
| V10 | Clicking an item in the counted list shows that exact mark on the drawing.                                                                                     | **Works**   | Plan item 5, Changelog          | Essential    |
| V11 | Plan addresses that expire mid-session are renewed without interrupting you.                                                                                   | **Works**   | Changelog Aug 15                | Essential    |
| V12 | A warning before opening a very large plan (over 150MB).                                                                                                       | **Works**   | Changelog Aug 14                | Nice-to-have |
| V13 | Resizable side panels.                                                                                                                                         | **Works**   | Current code                    | Nice-to-have |
| V14 | Crosshair lines across the whole sheet that follow the cursor.                                                                                                 | **Missing** | Old screen                      | Nice-to-have |
| V15 | Page thumbnail overview to jump between pages.                                                                                                                 | **Missing** | Old screen                      | Nice-to-have |
| V16 | Hide pages you do not need.                                                                                                                                    | **Missing** | Old screen                      | Nice-to-have |
| V17 | Keyboard shortcuts for tools (the old screen had **M** measure, **C** count, **U** undo).                                                                      | **Missing** | Old screen                      | Nice-to-have |
| V18 | Two drawings side by side.                                                                                                                                     | **Missing** | Plan item 2 (one reading of it) | Nice-to-have |
| V19 | **Sheet coverage:** see at a glance which sheets have been worked and which have not been touched, with a warning before a bid goes out with sheets untouched. | **Missing** | Decided 2026-09-14 (section 13) | Essential    |
| V20 | **Revision comparison:** see what changed between two versions of the same sheet, so an old revision is not bid.                                               | **Missing** | Proposed (section 14)           | Nice-to-have |

**Notes**

- **V3 — fixed 2026-09-14.** Removing a plan permanently deletes **every stamp,
  traced run, circuit and plan-reader result** on its sheets — the database
  cascades the delete from the plan (`drizzle/schema.ts`). The dialog used to
  mention only "sheet names and scales" and say "You can attach the file
  again", and the trash icon that opened it only appeared on mouse hover.
  - **What it does now:** before anything can be confirmed, the dialog counts
    what is on the plan (`bidPdfs.removalImpact`, counted from the same tables
    the delete empties) and lists it plainly — for example "14 stamps", "3
    traced runs, with 5 circuits", "1 plan-reader result" — then says it cannot
    be undone and that attaching the file again brings back the drawing only.
    The button reads "Delete plan and takeoff" when there is work to lose, and
    stays disabled until the count has loaded. If the count cannot be loaded,
    the warning still lists everything that would go, without numbers.
  - **The trash icon is always visible**, with a 44-pixel tap target.
  - **Where it lives:** the wording is `shared/planRemoval.ts`, tested in
    `server/planRemoval.test.ts`; the count and the delete are tested together
    in `server/planRemovalImpact.test.ts`.
  - **Not counted:** stamps tapped in the last moment that are still waiting in
    the browser to be sent (C8).
  - **Still open, not decided:** whether removing a plan should delete straight
    away, or keep it somewhere it can be restored for a while, the way archived
    bids work.
- **V6** — Real drawings failed to draw with "Cannot read properties of undefined
  (reading 'createElement')" until the fix of 2026-09-14. **That fix is on GitHub
  on the `local-dev` branch (v5.114), but not merged to `main` or deployed.** The browser console also shows
  "Setting up fake worker": the PDF is read inside the drawing thread rather than
  its own. It still draws, but may be slower on very large sets — worth checking.
- **V7, V8** — Never rebuilt. There is no zoom, pan, mouse-wheel or touch code
  anywhere in the current screen. Each page is drawn once and shrunk to fit the
  middle panel (`TakeoffPage.tsx:593`). A real 24×36 sheet was shown at about a
  fifth of its drawn size: labels unreadable. The old screen's details: zoom
  steps of 5%; could not zoom out past half of "fit to page"; **0** reset to 40%
  and re-centred; changing page re-centred; mouse wheel paused while the page
  overview was open.
- **V7, V8 (good news)** — Stamping, tracing and legend capture already convert
  a tap to a position on the sheet by the drawing's on-screen size
  (`TraceLayer.tsx:141-151`, `SymbolCapture.tsx:206-211`), and all lengths are
  worked out in PDF page units. Adding zoom will not change any measurement.
- **V9** — Today a stamp marker is about 4 pixels across on screen and a traced
  line is under 1 pixel wide, because the whole page is shrunk.
- **V18** — Plan item 2 says "two independently navigable panels side by side".
  It was built as drawing + work panel. See decision D14.

---

## 2. Setting scale

| ID  | What it does                                                                                                                                                                      | Status      | Source                   | Need         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------ | ------------ |
| S1  | Set a scale per sheet by typing it (`1/4" = 1'-0"`, `1" = 20'`, `1:100`) or picking a common one.                                                                                 | **Works**   | Changelog, Current code  | Essential    |
| S2  | Read the scale off the sheet; show it marked **Detected**; offer an unsure reading as a one-click suggestion; refuse "NTS".                                                       | **Works**   | Plan item 3, Changelog   | Nice-to-have |
| S3  | A sheet marked "not to scale" blocks measuring until you set a scale by hand.                                                                                                     | **Works**   | Changelog                | Essential    |
| S4  | No scale, no measuring: the tracing tools are hidden and the drawing says why and where to fix it.                                                                                | **Works**   | Changelog                | Essential    |
| S5  | Runs traced before a scale change say so, instead of quietly changing length.                                                                                                     | **Works**   | Changelog                | Essential    |
| S6  | **Scale from a known dimension:** tap both ends of something whose real length you know, type that length, and the sheet's scale is set from it. Points can be dragged to adjust. | **Missing** | Old screen, Your request | Essential    |
| S7  | **Measure between two points:** a quick check of any distance, not saved to the bid. Also how you check a detected scale.                                                         | **Missing** | Old screen, Your request | Essential    |
| S8  | **Sheet-size check:** notice when the PDF is not the true sheet size (for example a 24×36 set saved as 11×17) before any length is trusted.                                       | **Missing** | Your request             | Essential    |
| S9  | The sheet list shows how many sheets have a scale ("0/2 scaled").                                                                                                                 | **Works**   | Current code             | Nice-to-have |

**Notes**

- **S6, S8** — Today every length is worked out as _size on the PDF page × the
  written scale_ (`shared/takeoffGeometry.ts`). The written scale is only right
  if the PDF page is the size the drawing was made for. A 24×36 set printed or
  saved at half size (12×18, or 11×17) still says `1/4" = 1'-0"`, so every
  length comes out about half of what it really is — **with nothing on screen
  looking wrong.** A known dimension (S6) is immune to this, which is why the
  old screen worked that way. Common full sizes: 24×36, 30×42, 36×48, 22×34.
  Common half sizes: 12×18, 11×17.
- **S7** — The Detected badge's tooltip says "check it before measuring", but
  there is no tool on the screen to check it with (section 8).
- **Old screen extras for scale:** a "Scale Not Set for This Page" prompt with
  "Set Scale Now"; "Reset Scale" with a confirmation; a badge showing both the
  reference footage and the ratio ("50 ft ref · 1 in ≈ 20 ft").

---

## 3. Counting

| ID  | What it does                                                                                                                                                                                                                          | Status         | Source                                           | Need         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ | ------------ |
| C1  | **Stamp tool:** choose what you are counting once, then tap every place it occurs.                                                                                                                                                    | **Half-wired** | Plan item 7, Changelog, Current code             | Essential    |
| C2  | **Start the stamp tool by picking an assembly directly** (search, recently used), so things not in the plan's legend can still be counted.                                                                                            | **Missing**    | Your request, Plan item 7, Changelog             | Essential    |
| C3  | Plain high-contrast rings on the drawing, so you can see what has been counted.                                                                                                                                                       | **Works**      | Plan item 6, Changelog                           | Essential    |
| C4  | A counted-items list: each assembly with its count, and numbered chips that jump to each mark.                                                                                                                                        | **Works**      | Plan item 5, Changelog                           | Essential    |
| C5  | **Remove a stamp:** a visible remove control, the Delete key, and Undo.                                                                                                                                                               | **Half-wired** | Your request, Plan item 7, Changelog             | Essential    |
| C6  | **Undo the last stamp** (and undo a removal).                                                                                                                                                                                         | **Missing**    | Old screen, Your request                         | Essential    |
| C7  | Move a stamp by dragging it.                                                                                                                                                                                                          | **Missing**    | Plan item 7                                      | Nice-to-have |
| C8  | Stamps survive a crash or a lost connection: saved in the browser as you tap, sent in batches, re-sent later.                                                                                                                         | **Works**      | Changelog                                        | Essential    |
| C9  | **Legend:** drag a box around a symbol on the plan's legend, name it, link it to an assembly once; the link is remembered on every future job; unlink or remove it. **Reordered to FIRST 2026-09-21 — see § 5l of the overhaul doc.** | **Works**      | Plan items 4 and 9, Changelog                    | Essential    |
| C10 | **Location tags** (Underground, Slab/Floor, Wall, Ceiling/Overhead, Exposed, Roof) on stamps and runs: a sticky location chosen on the tool before tapping, plus "all of this assembly on this sheet".                                | **Half-wired** | Changelog, Your request, Decided 2026-09-14 (D8) | Essential    |
| C11 | **Layers:** show or hide marks by System (Devices, Lighting, Panels, conduit, cable) and by Location; warns when part of the sheet is hidden.                                                                                         | **Works**      | Changelog, Plan § Layers                         | Nice-to-have |
| C12 | Count without tapping each one (type a quantity, or rows × per row).                                                                                                                                                                  | **Missing**    | Old screen                                       | Nice-to-have |
| C13 | Remove every stamp of one assembly on a sheet at once.                                                                                                                                                                                | **Missing**    | Found in this review                             | Nice-to-have |
| C14 | **Schedule cross-check:** enter the quantities from the plan's own fixture and panel schedules and compare them with what was counted, with a clear flag when they disagree.                                                          | **Missing**    | Decided 2026-09-14 (section 13)                  | Essential    |

**Notes**

- **C1, C2** — The only thing that starts the stamp tool is clicking a legend
  symbol that is already linked (`TakeoffPage.tsx:2095`). To count one
  receptacle you first have to capture its symbol off the drawing and link it —
  which is nearly impossible without zoom (V7). Anything not in the legend
  cannot be stamped at all.
- **C5** — The remove action is built (`TakeoffPage.tsx:822`) and handed to the
  counted-items list (`TakeoffPage.tsx:2008`), but the list never shows a button
  for it (`RunsPanel.tsx:71`). Clicking a marker only highlights it. The Aug 12
  changelog says "Click any marker to select it and remove it if you misclicked."
- **C8** — Stamps that failed to send are re-sent along with the next stamp you
  place, or the next time that sheet is opened — not automatically when the
  connection returns.
- **C9** — The legend's Unlink and Remove buttons only appear on mouse hover
  (`LegendPanel.tsx:186, 200`).
- **C10** — The server can set a location on a stamp, on a run, and on every
  stamp of one assembly (`takeoffStamps.setLocation`,
  `takeoffStamps.setLocationForAssembly`, `takeoffRuns.setLocation`). **Nothing
  on the screen ever calls them**, and new stamps are saved with no location. So
  the Location half of Layers (C11) can only ever show "Untagged". The Aug 12
  changelog says tagging works.
  - **Decided 2026-09-14 (D8): keep location tags and wire them up.** Location
    changes price and materials in electrical work: underground usually means
    PVC rather than EMT, wet locations change the conductor type, and overhead
    work off a lift is slower per foot than work at wall height. On commercial
    jobs that is real money.
  - **How:** a sticky location chosen on the stamp or trace tool before tapping,
    so every mark gets it, plus "set the location of all of this assembly on
    this sheet". The Location filter in Layers (C11) stays, and starts working
    once marks carry a location.
  - **Question to settle when C10 is built:** should the assembly or material
    follow the location tag — for example a run tagged Underground pricing as
    PVC instead of EMT, or a wet-location device using a different conductor?
    If it does, the switch has to be shown, never made silently. Also settle
    how location relates to job-condition modifiers (working off a lift is
    already a modifier) and to vertical rise (T17), which also depends on where
    a device sits.
- **Old screen counting, for reference:** named count groups ("Outlets - Room
  101") each with its own icon, colour and optional unit cost, optionally linked
  to an assembly; right-click deleted the nearest pin; **U** undid the last pin;
  a quick count by rows × per row; "Clear page" removed every mark on a page. The
  new screen replaced groups with assemblies on purpose (see D10).

---

## 4. Tracing and measuring

| ID  | What it does                                                                                                                                                      | Status         | Source                          | Need         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------- | ------------ |
| T1  | **Trace a conduit or cable run:** tap along the route, see the length, finish, undo a point, or discard.                                                          | **Works**      | Changelog, Old screen           | Essential    |
| T2  | Conduit is counted once per run; each circuit gets its own full length of wire per conductor; cable is its own raceway, with no conduit line.                     | **Works**      | Changelog                       | Essential    |
| T3  | Circuits on a run: add, change the conductor count, remove.                                                                                                       | **Works**      | Changelog                       | Essential    |
| T4  | **Say what a run is** — for example 3/4" EMT, or 12/2 MC — so it can be priced.                                                                                   | **Missing**    | Old screen                      | Essential    |
| T5  | Bid-wide totals of conduit, cable and wire from finished runs, leaving out drafts and runs on unscaled sheets.                                                    | **Works**      | Changelog                       | Essential    |
| T6  | Protect a trace in progress: saved to the server every few seconds, kept in the browser on every tap, and a warning before leaving the page.                      | **Works**      | Changelog                       | Essential    |
| T7  | **Pick an interrupted trace back up** and keep going.                                                                                                             | **Half-wired** | Changelog                       | Essential    |
| T8  | **Edit a finished run: drag a point** to fix it.                                                                                                                  | **Missing**    | Old screen, Your request        | Essential    |
| T9  | **Extend a finished run.**                                                                                                                                        | **Missing**    | Old screen, Your request        | Essential    |
| T10 | **Split a run**, or leave a gap inside one run ("lift the pen").                                                                                                  | **Missing**    | Old screen, Your request        | Nice-to-have |
| T11 | **Rename a run.**                                                                                                                                                 | **Missing**    | Old screen, Your request        | Nice-to-have |
| T12 | Delete a run.                                                                                                                                                     | **Works**      | Current code                    | Essential    |
| T13 | Footage labels on the drawing, on each segment.                                                                                                                   | **Missing**    | Old screen                      | Nice-to-have |
| T14 | Colour each run, and hide the other runs while working on one.                                                                                                    | **Missing**    | Old screen                      | Nice-to-have |
| T15 | Lengths do not depend on zoom level.                                                                                                                              | **Works**      | Current code                    | Essential    |
| T16 | **Routing waste factor:** an adjustable percentage added to traced length for offsets and obstructions a flat plan does not show, always visible with its amount. | **Missing**    | Decided 2026-09-14 (section 13) | Essential    |
| T17 | **Vertical rise per device:** the pipe and wire that run up to the ceiling space or down to the slab from each device, which a flat plan does not show.           | **Missing**    | Proposed (section 14)           | Essential    |

**Notes**

- **T1** — The length that follows your finger only appears with a mouse (it
  follows the pointer hovering). On a tablet you see the length after each tap.
  Finishing by double-tap is unreliable on touch, but a Finish button is there.
- **T2 — correction recorded 2026-09-14:** wire footage is **not** set equal to
  conduit footage. T2 already counts conduit once per run and a full conductor
  length for every conductor of every circuit
  (`shared/takeoffQuantities.ts:192-197`). What is actually missing is extra
  wire for makeup at each termination and at the panel — see R6 and R7.
- **T4** — A run today is only "conduit" or "cable". The materials list prints
  its footage as "awaiting a specification". The old screen sent each run to the
  estimate with conduit type and size, conductor count, size and material, wire
  type, and fitting counts. See D3.
- **T7** — A run saved to the server shows in the list as **Draft** with a
  "Finish run" button, but it cannot be continued — only finished as it is. The
  copy kept in the browser is loaded when the sheet opens
  (`TakeoffPage.tsx:1310`) but never shown or offered. The Aug 12 changelog says
  "an interrupted trace is offered back when you return to that sheet."
- **T11** — Every run is named "Run on (sheet name)" (`TakeoffPage.tsx`, three
  call sites), so the list fills with identical names. Naming runs by what they
  are (T4) would remove most of the need to rename. **Confirmed by use,
  2026-09-18**, along with the other half nobody had written down: they are
  also indistinguishable ON THE DRAWING, because colour carries only conduit or
  cable. Both are downstream of D3(a) — a run that inherits a named type gets
  its name and its colour from that type, so neither is a feature of its own.
  Do not build a naming scheme before the type exists; it would be rewritten.
- **Old screen extras for runs:** Pause, Resume and Finish; lift the pen by
  double-click, right-click or both buttons; saved favourite colours; per-segment
  labels that appeared once zoomed in enough; "Push" to send a run's total to
  the calculator with a per-segment breakdown.

---

## 5. Getting results onto the bid

| ID  | What it does                                                                                                                            | Status       | Source                          | Need         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------- | ------------ |
| R1  | **Stamped counts become quantities on the bid.** Building 2026-09-19 for assembly counts (level 4); typed and material counts follow.   | **Building** | Your request                    | Essential    |
| R2  | **Traced footage becomes quantities on the bid.** T4 now exists, but R2 is GATED on labor for a run — see the note below.               | **Missing**  | Your request, Old screen        | Essential    |
| R3  | A clear rule for when the same assembly is on the bid twice — once from the plans and once added by hand — so nothing is counted twice. | **Building** | Found in this review            | Essential    |
| R4  | Quantities from the plans follow the app's cost-snapshot rule: costs are frozen when the line is created, like every other bid line.    | **Building** | CLAUDE.md, Found in this review | Essential    |
| R5  | Materials list for a supplier: quantities only, no prices, built from stamps, runs and bid lines, as CSV or PDF.                        | **Works**    | Changelog Aug 14                | Nice-to-have |
| R6  | Other per-run estimating details from the old screen: service loop, pull points, fittings. Makeup is now R7; routing waste is T16.      | **Missing**  | Old screen                      | Nice-to-have |
| R7  | **Makeup allowances:** extra conductor at each termination and at the panel, from defaults set once, shown as its own amount.           | **Missing**  | Decided 2026-09-14 (section 13) | Essential    |
| R8  | **From a bid line back to the plan:** click a line that came from the plans and open the Takeoff screen on its marks.                   | **Missing**  | Proposed (section 14)           | Nice-to-have |

**Notes**

- **R1, R2** — The screen said "Everything you place lands on the bid"
  (`TakeoffPage.tsx`) while the code said the opposite: "stamping does not
  create a line item" (`server/routers/materialsListRouter.ts`). The copy was
  corrected on 2026-09-18 and **R1 is being built on 2026-09-19** for counts made
  with a library assembly. See D2, and the override on it below.
- **R2 depends on T4 — and, since 2026-09-19, on one thing more.** A run that
  cannot say whether it is 3/4" EMT or 12/2 MC has nothing to price against, so
  R2 could not be built until T4 existed. T4 now does exist — a run type ships a
  raceway material, a conductor material and a conductor count — and checking
  what that unblocked found a second, larger blocker: **materials carry no labor
  hours anywhere in the schema**, so a traced run priced from its type reaches
  the bid as footage at material cost with **zero hours to install it**. That is
  a plausible-looking total, wrong in the direction nobody queries. R2 is gated
  on an answer for labor on a run, and on the allowances that turn a measured
  length into a purchased one. Written up as a gate rather than a note in
  `references/plan-viewer-overhaul.md` § 5f.2.

  **The labour half of that gate was answered on 2026-09-20 — see D17.** And the
  sentence above needs reading with care, because it is true of the schema and
  was wrong as a premise: **"materials carry no labor hours" was the state, not
  the design.** A default labour unit per catalog item with a per-line override
  was decided and built, and lost when the catalog was rewritten — see
  "Materials carry a labor unit" in `ASSEMBLIES_PLAN.md`. D17 was first answered
  under the wrong premise and revised within the hour once that came to light.

  **The answer:** a run's labour reads the same material rows everything else
  does — pipe hours off the raceway, wire hours off the conductor times the
  conductor count — plus D17(b)'s fixed amount per counted end, which is an
  interim for fittings that are not yet COUNTED and which retires to zero rather
  than being deleted.

  **Also still true and still unbuilt: there is no run → bid link at all.**
  `bid_line_items` has `takeoffGroupId` and no run equivalent, so runs reach the
  materials list and nothing else. R2 is that bridge, and the labour answer is
  what unblocks writing it — not a fix to something already wrong.

- **R6** — On the old screen these lived on each run's calculator card, all
  defaulting to 0 and typed by hand per run. Makeup has moved to R7 and routing
  waste to T16; what remains here is service loop, pull points and fittings.
  **Since D17(b), fittings also carry an interim that retires when they land:**
  the per-end labour number on a run goes to zero once a run type can COUNT its
  couplings, connectors and straps. Hours themselves stopped being the blocker
  on 2026-09-20, when materials gained labour units.
  See D15 before bringing any of it back: it is the biggest bloat risk in this
  document.
- **Watch for double counting before R2 ships — SETTLED 2026-09-20, see D18.**
  Starter device assemblies already carry wire — 25 ft of 12-2 NM-B inside the
  standard receptacle (`server/seed/baselineAssemblies.ts:98-108`), and
  **eight of eight starter assemblies carry 20–40 ft** of cable or conductor.
  Once traced cable also reaches the bid, the same wire could be counted twice,
  and R3 as built cannot see it: `doubleCountedAssemblies` keys on
  `assemblyId`, and a traced-run line has none.

  **D18 removes the overlap rather than detecting it.** Devices own the branch
  wiring between each other, traced runs are homeruns only, and one ownership
  function decides before anything sums. The guard for the ambiguous case — a
  run with devices at both ends — ASKS.

---

## 6. AI assistance

Two separate AI features touch this screen. **They stay separate** — different
jobs, different permission lists (`shared/copilotActions.ts` says why) — and must
never be merged into one "AI" box.

| ID  | What it does                                                                                                                                                                                                                                                                | Status         | Source                               | Need         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------ | ------------ |
| A1  | **Plan reader (this screen only):** reads the sheet on screen, proposes stamps from your linked legend symbols as dashed rings, summarizes the scope, answers questions about the sheet, and learns your corrections per architect. You tick proposals and press **Place**. | **Works**      | Changelog Aug 13, Plan § AI co-pilot | Nice-to-have |
| A2  | Suggested routes: shown dashed, with "Accept this route"; accepting leaves a draft you must still finish.                                                                                                                                                                   | **Works**      | Current code                         | Nice-to-have |
| A3  | Plan reader answers point to where on the sheet the answer came from.                                                                                                                                                                                                       | **Half-wired** | Plan § AI co-pilot                   | Nice-to-have |
| A4  | Plan reader flags related details on other sheets.                                                                                                                                                                                                                          | **Missing**    | Plan § AI co-pilot                   | Nice-to-have |
| A5  | **"Where do I…?" bar (app-wide, not part of this screen):** you type what you are trying to do and it offers a button to the right screen. It never explains or changes anything.                                                                                           | **Works**      | Earlier decision                     | Nice-to-have |

**Constraints on A1 and A2 — decided, not open questions**

- **Narrow scope.** It may only take actions from its fixed list
  (`shared/copilotActions.ts`): propose a stamp, flag something for review,
  summarize scope, answer a question, confirm stamps, record a correction. The AI
  picks from that list; it can never invent an action.
- **Never finalizes anything.** Nothing it finds is placed until a person ticks
  it and presses Place. The server refuses any write without that confirmation,
  and refuses to start if a write action is ever added without one.
- **It counts; it never prices.** Every cost still comes from the pricing engine.
- **What Place does today:** proposals become ordinary stamps. Stamps do not
  reach the bid (R1), so once R1 is built, a placed proposal must follow exactly
  the same path as a hand-placed stamp — no separate AI route onto the bid.

**Notes**

- **A1** — Switched off on your local copy (the `DISABLE_AI_FEATURES` setting),
  and it needs a connection. It reads each sheet you open automatically unless
  you turn that off, which costs money per sheet (D11). Its "correct this"
  control only appears on mouse hover (`CoPilotPanel.tsx:391`).
- **A2** — The screen can show and accept a suggested route; what creates those
  suggestions was not reviewed for this spec.
- **A3** — Answers are told to use only the sheet on screen, but are not made to
  point to where on the sheet they came from, which the plan requires.
- **A5** — Shown only on the Dashboard and the first-run screen today, not on
  the Takeoff screen.
  - **Wording rule (decided):** it is worded "Where do I…?" on purpose — it
    navigates, it does not explain. Never label it "Ask AI" or "Help". Today its
    input reads "Where do I edit labor rates?", but its button says **Ask** (see
    section 8).
  - **Open decision:** should it be reachable from every page, including this
    one? See D12.

---

## 7. Tablets and offline use

BidRender installs as an app (a PWA), and doing a takeoff on a tablet at a job
site is a real use. **But today "offline" means only that the app's frame opens
without a signal.** On purpose, the offline support never stores bid or plan
data (`client/public/sw.js`, lines 5–16), so **a takeoff cannot be opened or done
offline today.**

### What breaks with no connection

| Part of the screen                                          | With no connection                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Opening a bid's plans, sheet names, scales, marks and runs  | **Does not open.** All of it comes from the server.                                                |
| The plan file itself                                        | **Does not open.** Its address comes from the server and expires after about half an hour.         |
| Tapping stamps                                              | Kept in the browser. Sent only when that sheet is next opened with a connection, not on reconnect. |
| Tracing                                                     | Each tap is kept in the browser, but finishing a run needs the server.                             |
| Scale, legend capture and linking, circuits, deleting a run | Fail with an error message.                                                                        |
| Uploading plans, the materials list, the plan reader        | Need a connection.                                                                                 |

**Also worth checking on a production build:** the offline support is only
turned on in production builds, never in local development. It does not exclude
plan files, so an installed app may keep a separate copy of a large PDF each time
its address renews (about every half hour), filling the tablet's storage. It may
also mishandle the partial "range" reads the viewer makes.

### What does not work on a touchscreen

- **No pinch zoom and no one-finger pan** (V7, V8).
- **Targets far too small:** stamp markers about 4 pixels, traced lines under 1
  pixel (V9), and many small buttons sized at 20–24 pixels — for example unlink
  a legend symbol, and undo a traced point.
- **Controls that only appear on mouse hover** — invisible on a tablet:
  - rename a sheet (`SheetIndex.tsx:164`)
  - unlink or remove a legend symbol (`LegendPanel.tsx:186, 200`)
  - correct a plan-reader finding (`CoPilotPanel.tsx:391`)
- **The live length while tracing needs a hovering mouse** (T1).
- **Double-tap to finish a run is unreliable** (the Finish button works).
- **Dragging a finger on the drawing may scroll the page instead**, because
  nothing tells the browser that drags on the drawing belong to the tools. This
  affects legend capture especially.
- **Screen wording assumes a keyboard and a computer** (section 8, items 8–9).
- **Cramped in portrait:** the side panel takes about a third of the width by
  default.

---

## 8. Words on the screen that overstate or misdescribe

Checked sentence by sentence against the code. Highest risk first.

| #   | Where                                                       | What it says                                                                    | What actually happens                                                                                                                                                                            | Risk   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | "Remove this plan?" dialog (`TakeoffPage.tsx`)              | Said only sheet names and scales would go, and "You can attach the file again." | **Fixed 2026-09-14 (V3):** it now counts and lists every stamp, traced run, circuit and plan-reader result that will be deleted, and says attaching the file again brings back the drawing only. | Fixed  |
| 2   | Screen subtitle (`TakeoffPage.tsx:1650-1651`)               | "Everything you place lands on the bid."                                        | Nothing placed on this screen becomes a line on the bid (R1, R2).                                                                                                                                | High   |
| 3   | Plan reader intro (`CoPilotPanel.tsx:266`)                  | "Nothing lands on the bid until you say so."                                    | Even after you press Place, nothing lands on the bid; Place only makes stamps.                                                                                                                   | High   |
| 4   | Counted items, empty (`RunsPanel.tsx:157`)                  | "Stamp an assembly onto the plan…"                                              | You cannot pick an assembly to stamp; you must capture and link a legend symbol first (C1, C2).                                                                                                  | Medium |
| 5   | Detected scale tooltip (`ScaleControl.tsx:258`)             | "Read from this sheet — check it before measuring"                              | There is no tool on this screen to check a scale with (S7).                                                                                                                                      | Medium |
| 6   | Naming a legend symbol (`SymbolCapture.tsx:106`)            | "Used to recognise it again on the next set of plans."                          | Only the AI plan reader recognises symbols. With the reader off, nothing is recognised; the link is reused only when you click it.                                                               | Medium |
| 7   | Layers warning (`LayersPanel.tsx:243`)                      | "Showing part of this sheet. Totals below cover the whole bid regardless."      | The totals below are for traced runs only. Stamp counts are not totalled for the whole bid anywhere on this screen.                                                                              | Low    |
| 8   | Stamping and tracing hints (`TraceLayer.tsx:416, 454, 468`) | "click to place · Esc to stop", "(Enter or double-click)", "(Escape twice)"     | Mouse-and-keyboard wording; wrong on a tablet.                                                                                                                                                   | Low    |
| 9   | Upload box (`TakeoffPage.tsx:1723-1726`)                    | "Drop plan PDFs here … or click to choose files from this computer"             | Computer wording; on a tablet you tap to choose.                                                                                                                                                 | Low    |
| 10  | "Where do I…?" button (`NavigationHelper.tsx:75`)           | "Ask"                                                                           | Close to the "Ask AI" wording you ruled out; the rule is that it navigates, not answers.                                                                                                         | Low    |

### Changelog entries the code contradicts

| Date   | The changelog says                                                                                                | The code                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Aug 12 | Stamp tool: "Pick an assembly once" … "Click any marker to select it and remove it if you misclicked."            | Only a linked legend symbol starts it (C1, C2). There is no way to remove a stamp (C5). |
| Aug 12 | Location: "You can tag one at a time, or tag every stamp of one assembly on a sheet in a single action."          | Nothing on the screen can set a location (C10).                                         |
| Aug 12 | Tracing: "an interrupted trace is offered back when you return to that sheet."                                    | Only a server-saved draft appears, and it cannot be continued (T7).                     |
| Aug 12 | Split view: a "reserved panel on the right that the counted-items list will fill in a later phase (it says so…)". | Out of date: that panel is filled now.                                                  |
| Aug 13 | Plan reader: "Nothing it finds reaches your bid until you tick it and press Place."                               | Pressing Place does not reach the bid either (R1).                                      |
| Aug 19 | "The plan screen stopped underselling itself … It now says what the screen actually does."                        | The new subtitle overstates (item 2 above).                                             |

---

## 9. Decisions for you

Where the old and new screens differ, or where something could make the screen
more complicated. Each has options, a pick, and the reason.

**Decided 2026-09-14:**

- **D2** — (a): counts go onto the bid live, with the rules listed under it.
- **D8** — keep location tags: a sticky location on the tool, plus "all of this
  assembly on this sheet". The Location filter stays and gets wired up.
- **D11** — (a): the plan reader does not read sheets automatically.
- **D15** — the old per-run estimating form does not come back; anything needed
  is set once in assemblies or company defaults (see R7 and T16).
- **Fix order** — V3 is fixed first, ahead of zoom and pan (section 12). Done
  2026-09-14.

Everything else below is still open until you say so.

**D1 — How zoom stays sharp.**

- (a) Draw each page once and enlarge it, as the old screen did. Fast and simple;
  gets soft above about 150%.
- (b) Same as (a), then redraw sharper a moment after you stop zooming. Sharp at
  any zoom; more work.
- (c) Draw the sheet in tiles, like a map. Sharp and light on memory for huge
  sheets; much more work.
- **Pick:** (a) first, then (b) straight after. (c) is not worth it yet.
- Also pick: a small zoom control (−, %, +, fit) floating in a corner of the
  drawing, big enough for a finger.

**D2 — How counts reach the bid (R1). Decided 2026-09-14: (a). AMENDED
2026-09-19 and again 2026-09-24 — read both overrides below before building
against this.**

> **"Follows the marks for ever" now has ONE end: the estimator locking the
> bid.** `references/plan-viewer-overhaul.md` § 5f.0 OVERRIDE 3 (2026-09-24)
> amends (a) a second time: a bid carries `quantitiesLockedAt`, and while it is
> set every from-plans line reads the number the drawing gave when it was
> locked. Unlocking hands it back, after a confirmation naming every quantity
> that will move.
>
> **Why:** (a)'s rule is right while a bid is being built and wrong the day
> after it was sent, when opening the drawing to look at something moves a
> number behind a price a customer already has. Nothing here is automatic — no
> status change locks a bid — so (a) still describes every bid until somebody
> says otherwise. The decision, the copy and the comparison live in
> `shared/quantityLock.ts`; the check itself is in `withPlanCounts`
> (`server/db.ts`), which is the one place every reader of a bid passes through.
>
> Recorded in both files per `CLAUDE.md` § "Where decisions live".

> **The FIRST crossing is now an explicit act.** `references/plan-viewer-overhaul.md`
> § 5f.0 OVERRIDE 2 amends (a): asking is what CREATES the line, and from then
> on its quantity follows the marks with nothing to press. Everything (a) says
> after the moment of creation stands unchanged.
>
> **Why, in one line:** costs freeze when the line is created (R4), so fully
> automatic creation means the app choosing the instant somebody's money is
> frozen — typing `3` on the way to `38` freezes $3, and no edit can reach a
> snapshot afterwards. This entry's objection to a button, that a bid "goes
> stale when someone forgets to press it", survives and is answered instead by
> making "not on the bid yet" a listed, visible state rather than a silent one.
>
> Recorded in both files per `CLAUDE.md` § "Where decisions live". The gap that
> rule exists to close is exactly this one: a decision recorded only in the
> newer file is invisible to whoever opens the older one first.

- (a) **Live:** each stamped assembly is one bid line, marked "from plans", and
  its quantity follows the stamps.
- (b) **A button:** "Send counts to bid", showing what will change first.
- (c) Keep them separate (today).
- **Pick:** (a). It is the simplest and matches how people think about a takeoff.
  (b) adds a step and a bid that goes stale when someone forgets to press it. (c)
  means typing everything twice.
- Rules that come with (a):
  - Costs freeze when the line is first created (R4).
  - That line's quantity is changed by stamping, not by typing — one source of
    truth.
  - The same assembly added by hand stays a separate line marked "added by hand",
    so a double count is visible rather than hidden (R3).

**D3 — How a traced run says what it is (T4, R2). STILL STANDS — confirmed
2026-09-18.**

> `references/plan-viewer-overhaul.md` § 2 was written on 2026-09-17
> describing option (c), the per-run form this decision rejected by name. It
> did not cite this entry and nobody reread it. Reconciled on 2026-09-18: that
> document's § 2.0 now records that (a) stands and restates its own § 2.1–2.5
> as controls on the TYPE, inherited by the run.
>
> **The decision was re-reached independently by using the app** — three runs
> on one sheet, all named "Run on Sheet 3", each needing its settings entered
> again. When the same answer arrives twice by different routes, it is the
> answer.

- (a) Choose before tracing: "Trace…" asks which conduit or cable assembly, and
  remembers it for the next run — like the stamp tool.
- (b) Choose after: each finished run asks "What is this?" in the list.
- (c) The old per-run calculator form: type, size, conductors, material,
  fittings, waste, makeup allowance, service loop, terminations, pull points.
- **Pick:** (a), with (b) as the way to change it later.
- **Bloat warning:** (c) puts a form on every run. Waste, makeup and fittings
  belong in the assembly or company defaults, set once.

**D4 — Which scale method comes first (S1, S6).**

- (a) Written scale first (today), with "set from a known dimension" one tap
  away.
- (b) Known dimension required on every sheet.
- **Pick:** (a), protected by the sheet-size check (D5). (b) adds a step to every
  sheet of every job.

**D5 — How strong the sheet-size check is (S8).**

- (a) Show the PDF's page size beside the scale ("page is 11×17"), and warn when
  it is not a normal full-size sheet.
- (b) Require one known-dimension check per PDF before the first measurement.
- (c) Show the size only, no warning.
- **Pick:** (a). It catches the dangerous case without slowing normal sets. Offer
  (b) as the one-tap fix the warning points to.

**D6 — Removing and moving stamps (C5–C7, C13).**

- **Pick:**
  - Tap a mark to select it, then a Remove button, the Delete key and Undo
    (essential).
  - An undo of the last several actions on the sheet, as a button as well as
    Ctrl/⌘+Z.
  - Moving by drag, and "remove all of this assembly on this sheet", later.
- **Leave out:** the old "Clear page". Undo covers mistakes, and a one-tap wipe
  is how a whole takeoff gets lost.

**D7 — How much run editing (T8–T11).**

- (a) Drag a point, add to the end, delete a point, rename.
- (b) (a) plus gaps inside a run and splitting one run into two.
- **Pick:** (a). Add (b) only if it turns out to be needed. Name runs
  automatically from what they are (D3), so renaming is rare.

> **OVERRIDDEN IN PART, 2026-09-19: (b) turned out to be needed.** The estimator
> asked, while using the app, to branch a run — start a new line and keep it on
> the same run, either as a tee off the main route or as a second leg of the
> same circuit. That is the half of (b) about one run holding more than one
> path. **Splitting one run into two is still not asked for and stays deferred.**
>
> The design is in § 5k of `references/plan-viewer-overhaul.md`: a leg is its
> own ROW linked to a parent, not a longer polyline, because a run carries two
> ends and the whole vertical calculation hangs off them. It is recommended and
> not approved, and it belongs **after T9 (extend a finished run)** — extending
> needs no schema change and removes the "I stopped and want to keep going" half
> of the request on its own.

**D8 — Location tags (C10, C11). Decided 2026-09-14.**

- **Decision:** keep them. Location changes price and materials: underground
  usually means PVC rather than EMT, wet locations change conductor type, and
  overhead work off a lift is slower per foot than work at wall height.
- **Chosen:** (a) a sticky location on the tool before tapping, plus the bulk
  part of (b), "all of this assembly on this sheet".
- **Not chosen:** tagging marks one at a time after placing, and dropping
  location altogether.
- **The Location filter is not hidden** — it gets wired up as part of C10.
- **Open question for when C10 is built:** whether the assembly or material
  follows the location tag (PVC vs EMT), and how that is shown. See the C10
  note.

**D9 — The legend's job once direct picking exists (C2, C9).**

- **Pick:** keep it as a shortcut, and as what the plan reader learns from, but
  collapsed by default so it does not crowd the counted list.

**D10 — Counting without tapping (C12) and the old count groups.**

- **Pick:** do not add this to the Takeoff screen. The Count screen and the bid
  already take typed quantities. Two ways to count on one screen is how counts
  get entered twice.
- Do not bring back the old free-named count groups. Counting by assembly is what
  lets the count be priced.

**D11 — Should the plan reader read sheets automatically? (A1) Decided 2026-09-14: (a).**

- (a) Off by default, with a Read button.
- (b) On by default (today).
- (c) Ask once per bid.
- **Pick:** (a). Automatic reading costs money on every sheet opened, including
  schedules and details nobody takes off.

**D12 — Should "Where do I…?" be reachable from every page? (A5)**

- (a) A small button in the app's frame, on every screen, that opens it.
- (b) Dashboard and first-run screen only (today).
- (c) A box built into the Takeoff screen.
- **Pick:** (a). It is available everywhere without adding anything to the Takeoff
  work area. (c) is clutter on the busiest screen in the app.

**D13 — How far to take offline takeoff (section 7).**

- (a) **Honest online takeoff:** a clear "You're offline" banner; keep taps and
  traces safe; send them automatically when the connection returns.
- (b) **Download a bid for offline:** keep its plans, sheets, scales and legend on
  the tablet; record everything offline; sync later.
- (c) Leave it as it is.
- **Pick:** (a) now. (b) is a large project with real decisions about two devices
  changing the same bid, so decide it on its own.

**D14 — Two drawings side by side (V18).**

- **Pick:** not now. It doubles what the screen has to manage, and a sheet list
  plus zoom covers most of the need.

**D15 — Bringing back the old per-run estimating details (R6). Decided 2026-09-14: as picked.**

- **Pick:** not on the Takeoff screen. Put anything that is really needed into
  assemblies or company defaults, set once.
- **Bloat warning:** this was the single most complicated part of the old screen.

**D16 — Fixing the changelog (section 8).**

- (a) Edit the old entries.
- (b) Add a new dated entry that corrects them.
- **Pick:** (b). The changelog is a history; a dated correction keeps the record
  honest about when things were claimed.

**D17 — Where labour for a traced run lives (R2). Decided 2026-09-20, then
REVISED the same day. Read the revision; the first pick is kept only to show
what changed.**

The gate R2 had been blocked since 2026-09-19 on the belief that materials
carry no hours anywhere in the schema.

- **(a)** One number on the run type, hours per foot, entered by hand.
- **(b)** Two numbers on the run type — pipe per foot, plus wire per
  conductor-foot.
- **(c)** Pipe only; the wire pull is a line the estimator adds themselves.
- **First pick, and SUPERSEDED within the hour: (b).**

**Why it was superseded, because the reason matters more than the answer.** All
three options existed only because materials were believed unable to carry
hours. That belief was true of the live schema and false as a decision: a
default labour unit per catalog item, with a per-line override, **was decided
and built** — `master_items.masterLaborHours` and
`project_assembly_items.overrideLaborHours` — and was dropped when the catalog
was rewritten to `materials` / `assembly_materials`, with nothing recording the
loss. See "Materials carry a labor unit" in `ASSEMBLIES_PLAN.md`.

So the question "where do a run's hours live" had been asked with the only good
answer already removed from the board.

- **REVISED PICK: a run's labour comes from the SAME material rows everything
  else reads.** Pipe hours off the raceway material, wire hours off the
  conductor material times the conductor count. Nothing is typed on the run
  type, and the same figure is never maintained in two places.
- **BUILT the same day**, as the per-foot figure on the type:
  `shared/runTypeLabor.ts`, shown on the palette and in the type editor. See
  "Run types read the same number" in `ASSEMBLIES_PLAN.md` for the three
  properties that matter — a cable must not be multiplied by what is inside its
  jacket, a partial figure always carries what it is short by, and this is the
  TYPE's number rather than a particular run's.

**This gets (b)'s benefit for free.** (b) was picked so that changing 2 #12 to
3 #12 would move the labour by itself rather than leaving a type reading "3 #12"
priced as if it were two. Reading the material row does that, and also means
re-pricing #12 THHN's labour once updates every run and every assembly that
touches it.

**What still has to be entered by hand is an ASSEMBLY's hours**, and that half
of the rule is untouched: an assembly's number is the operation, not the sum of
its parts. Materials carrying units does not change that — see the cross-check
rule in `ASSEMBLIES_PLAN.md`.

**D17(b) — The fixed cost at the end of a run. Decided 2026-09-20. INTERIM.**

- (a) A vertical foot costs the same as a flat foot.
- (b) Per foot, plus **a fixed amount per counted end**.
- (c) Verticals priced per foot at their own higher rate — which is how the
  trade actually factors them, as a labour condition.
- **Pick: (b), knowingly as an interim. (c) is the eventual right answer.**

**Why (c) is right in the trade and not yet reachable here.** In a real
estimating package the fixed cost of a drop does not live in the run's per-foot
number at all: every strap, fitting, connector and box carries its own labour
unit and is counted separately. With that in place the run is just pipe and (c)
is correct.

**The blocker moved on 2026-09-20 and is now much narrower.** It used to be that
a fitting could not carry hours at all. Once materials carry labour units, a
strap and an EMT connector have hours like anything else. **What is still
missing is only the COUNTING** — a run type names one raceway, one conductor and
one ground, and has no model for "a coupling every 10 ft, a connector at each
end, a strap every 4 ft". That is R6, still **Missing** and **Nice-to-have**.

**The measured consequence of picking (c) before that exists**, at a generous
vertical rate: a 2'-0" drop bills 0.22 h where the work is a stop, a strap, a
connector and a box. (b) bills 0.38 h for the same drop and 0.78 h for an 8'-6"
one. The short drop is where (c) fails, and short drops are the common case.

**NAME IT FOR WHAT IT IS.** The per-end number is **the stop, the strap, the
connector and the box at a termination** — never "vertical overhead" and never
"end allowance". The honest name is what makes the retirement below legible.

**How this ends, and it is not a deletion.** When a run type can count its
fittings, this number **goes to zero** rather than being removed. A zero with an
honest name tells the next reader what it stood in for; a deleted field tells
them nothing. Anyone reaching this section because the number looks redundant
should check whether fittings are being counted before touching it.

**D18 — Who owns the wire between devices (R2, R3). Decided 2026-09-20.**

The double-count R3 flagged before R2 ships — starter device assemblies already
carry 20–40 ft of cable each, eight of eight in the seed — is settled by
splitting the wire the way the trade already does, rather than by detecting the
overlap after the fact.

- **DEVICES carry the branch wiring between each other.** A troffer includes an
  average whip of MC to the next fixture; a receptacle includes the cable to the
  next receptacle. That is what makes dropping devices fast.
- **TRACED RUNS are homeruns only** — first device on the circuit back to the
  panel.
- **Each foot belongs to exactly one of them, so there is no double count by
  construction.** Not a reconciliation, not a warning: an ownership rule, in one
  function, deciding before anything sums. Same shape as `totalVerticalFeet`,
  which already does this for a drop owned by either a run or a stamp.

**Three parts, and one thing that was rejected.**

1. **A whip length per ASSEMBLY.** A troffer and a receptacle are not the same
   number. Material only — see below.
2. **One per-JOB adjustment** for a building laid out tighter or looser, rather
   than editing every assembly. Per bid only, ships at 0.
3. **A guard that ASKS.** A run with a panel at one end is a homerun and passes
   silently. A run with devices at BOTH ends is branch wiring the assemblies
   have already counted, and the app asks rather than deciding.

**REJECTED: hanging the whip off `projectType`.** Residential wants a generous
whip and commercial a short one, and the starter assemblies already carry the
tag — but reading that tag at runtime is wrong three ways. `PROJECT_TYPES` is
`residential | commercial | both` and the column is NULLABLE, so two of the four
states have no answer and most starters are `both`. The tag is per-assembly
while a bid mixes, so a residential assembly used on a commercial job would pull
a residential whip invisibly. And it would turn a **library filter into a
pricing input**, so retagging an assembly to fix a filter would silently
re-price every bid using it — which is exactly what "Project Type is a filter,
not a structural split" in `ASSEMBLIES_PLAN.md` forbids.

**Instead the tag informs the SEED, not the arithmetic.** Ship a generous whip
on the residential starters and a short or zero one on the commercial ones.
Nothing at runtime reads `projectType`. This is also more correct: the whip is a
fact about how that device is installed, not about the job, so a residential
assembly used on a commercial job rightly keeps its own — and the job-level dial
in part 2 is where job character belongs.

**Material only. The assembly's typed hours already cover pulling it**, because
that is what "0.45 h for a duplex rough-in" means — the whole operation at once.
Adding whip labour would be the parts-sum error the cross-check exists to refuse.

**The adjustment applies to the WHIP only.** Traced footage is measured, and
§ 5a forbids the app quietly padding measured length.

**Starter values ship real, labelled and dated**, per § 2.3 of
`references/plan-viewer-overhaul.md` — the deliberate exception to the $0 rule.
A zero whip is the failure that section names: an unset allowance whispers, and
"a zero allowance wins a bid you then lose money on."

**THE WHIP IS AN INTERIM, and it retires PER DEVICE.** When AI routing between
fixtures on a circuit lands, that routed footage replaces the whip for the
devices it covers — automatically, the way D17(b)'s per-end number retires to
zero rather than being deleted. **Per device instance, never per assembly:**
routing one circuit of six troffers must not zero the whip for the other forty
on the job. So the whip is resolved per STAMP with a claim recorded on the
stamp, the same construction as `endStampId` claiming a vertical — a claimed
answer, never inferred. Building it any other way makes routing a second
wire-counting path instead of a new way to set an existing flag.

**SPECIFIED 2026-09-21 — § 5m.2 of `references/plan-viewer-overhaul.md`.** The
routing this paragraph anticipated now has a design: the drawing does not show
the physical route, so the AI ESTIMATES one square to the building; on a
lighting plan it runs between the lights on a circuit and back to the switch or
sensor; homeruns are separate and the manual path never goes away; review is
one CIRCUIT at a time; and the order is counting-reliable, then circuits, then
routing, then homeruns — so it inherits § 15's bake-off as its first gate.

**And when it routes, it says so plainly**, in the voice the totals already use
for what is and is not included — "a cable's ground is inside the cable and is
already in the Cable figure", "no vertical footage is in these numbers" — so
nobody traces the same wire by hand on top of it.

**D17(c) — The fork behind all of it. RESOLVED 2026-09-20.**

Recorded as open earlier the same day, and closed hours later once the history
above came to light. Kept rather than deleted, because the fork is the thing a
future reader would otherwise re-open.

- **(a) Materials gain an hours column.** Direct; every fitting in the catalog
  becomes priceable at once.
- **(b) Run fittings are expressed as ASSEMBLIES**, keeping hours in one place.
- **RESOLVED: (a).** It is not a new idea — it is the restoration of a capability
  this app shipped and then lost in a rewrite, and it is how the trade's own
  reference works, NECA being a book of hours per installed item rather than per
  recipe. (b) would have needed an assembly wrapping every material, which is a
  different product from the one planned.

**The objection that survives, and is part of the build rather than after it:**
a material with no hours set is invisible in a way a material with no price is
not. `shared/materialPricing.ts` flags unpriced rows and the Materials screen
filters to exactly those; hours need the same flag and the same filter. **A
missing hour is worse than a missing price** — a missing price understates one
line, a missing hour is multiplied by the rate across every line that touches
that material. Hence a NULLABLE column with no default: never-set and
deliberately-zero must not be the same value.

**Smaller calls:**

- Crosshair lines (V14): **skip** — no use on a touchscreen.
- Page thumbnails (V15) and hiding pages (V16): **skip** — the named sheet list
  covers it.
- Tool keyboard shortcuts (V17): **a few**, only as extras on top of on-screen
  buttons.

---

## 10. Things the old screen did that no request or plan mentions

Checked against the deleted `PlanPanel.tsx`. These may have been forgotten.

- Numbered page buttons, a page thumbnail overview, and hiding pages (V15, V16).
- "Clear page": removed every run and pin on a page, with a confirmation (D6).
- "Hide other runs" while working on one (T14).
- Run colours, with saved favourite colours (T14).
- Footage labels on each segment, shown once zoomed in enough (T13).
- Lifting the pen mid-run by double-click, right-click, or pressing both mouse
  buttons (T10).
- Pause, Resume and Finish for a run.
- Sending a run to the calculator with conduit type and size, conductors, wire
  type and fittings (T4, R6).
- Named count groups with their own icon, colour and optional unit cost; right-click
  to delete the nearest pin; **U** to undo; rows × per row counting (C12, D10).
- A "Scale Not Set for This Page" prompt, draggable scale points, "Reset Scale"
  with confirmation, and a badge showing both the reference footage and the ratio
  (S6).
- Keyboard: **M** measure, **C** count, **U** undo, **+ / − / 0** zoom (V7, V17).
- Full-width crosshair lines that followed the cursor (V14).
- A warning before replacing a PDF that the marks on it would be cleared.
- Touch handling that stopped the side menu opening during a pinch.

## 11. Found during this review, not in any plan

- **Removing a plan wipes its takeoff.** The dialog now says so, with counts —
  fixed 2026-09-14 (V3).
- **Four controls only appear on mouse hover** (section 7). The fifth, removing
  a plan, was fixed with V3.
- **The offline support may store a new copy of a plan PDF every half hour** on
  an installed app (section 7).
- **Stamps that failed to send are not retried when the connection returns** —
  only with the next stamp placed, or when the sheet is reopened (C8).
- **Stamp counts are never totalled across the whole bid** on this screen — only
  per sheet (section 8 item 7).
- **The PDF drawing fix is on GitHub on `local-dev`, but not merged to `main` or
  deployed** (V6).
- **Pages are drawn once at 1.5× size** — the sharpness limit once zoom exists
  (D1).
- **The PDF reads inside the drawing thread ("fake worker")**, which may be slower
  on very large sets (V6).

## 12. Fix order, dependencies, and essential rows not working today

### Fix order

1. **V3 first — done 2026-09-14.** A truthful remove-plan warning with counts,
   and the hover-only trigger made always visible, in the same change.
2. Everything after that is still to be ordered.

### Dependencies

- **R2 cannot be built until T4 exists.** A run that cannot say whether it is
  3/4" EMT or 12/2 MC has nothing to price against.
- **R3 has to be settled before R1 or R2 ships**, including wire already built
  into device assemblies (see the notes under section 5).
- **R7 makeup and T16 routing waste only reach the bid through R2**, so they
  need T4 and R2 as well. Both can show on a run's own totals before then.
- **R8 needs R1 and R2** — a bid line has to come from the plans before it can
  point back to them.
- **C14 needs C1 and C2** — counts have to be by assembly, and startable
  directly, before they can be compared with a schedule.
- **T17 vertical rise overlaps C10** — where a device sits decides which rise
  applies.
- **V7 and V8 (zoom and pan) come before V20's overlay view**, and make R8's
  jump useful.

### Essential rows that are not Works today

Grouped by section, not ranked.

- **Viewing:** V7 zoom, V8 pan, V9 marks visible at any zoom, V19 sheet
  coverage.
- **Scale:** S6 scale from a known dimension, S7 measure two points, S8
  sheet-size check.
- **Counting:** C1 and C2 start the stamp tool by picking an assembly, C5 remove
  a stamp, C6 undo, C10 location tags, C14 schedule cross-check.
- **Tracing:** T4 say what a run is, T7 pick up an interrupted trace, T8 drag a
  point, T9 extend a run, T16 routing waste factor, T17 vertical rise
  (proposed).
- **Onto the bid:** R1 counts, R2 footage, R3 no double counting, R4 cost
  snapshots, R7 makeup allowances.
- **Wording:** section 8 items 2–3.

---

## 13. Added 2026-09-14 — DECIDED (treat as requirements)

You listed these as A1–A4. They are renamed to fit the tables, because A1–A5
already mean the AI rows in section 6.

| You called it                    | Spec ID | Where it sits in the tables     |
| -------------------------------- | ------- | ------------------------------- |
| A1 Sheet coverage tracking       | **V19** | 1. Viewing the sheet            |
| A2 Cross-check against schedules | **C14** | 3. Counting                     |
| A3 Makeup allowances             | **R7**  | 5. Getting results onto the bid |
| A4 Routing waste factor          | **T16** | 4. Tracing and measuring        |

### V19 — Sheet coverage tracking

**What it does.** Every sheet in the sheet list shows whether it has been worked:

- **Not started** — nothing placed on it.
- **Worked** — at least one stamp or traced run.
- **No work here** — you marked it: a cover sheet, a detail, another trade's
  sheet.

The top of the list reads "7 of 12 sheets worked", beside the existing scaled
count. Before a bid is sent (the Send menu or the proposal) or marked Won, it
warns — "3 sheets not started: E3, E4, E5" — with a way to carry on anyway. It
warns; it does not block.

**Already in the code.**

- The sheet list already counts scaled sheets the same way
  (`client/src/components/takeoff/SheetIndex.tsx:191, 199`).
- Stamps and runs are already fetched per sheet
  (`server/routers/takeoffStampsRouter.ts:137-141, 202-215`,
  `server/routers/takeoffRunsRouter.ts:121-129`), but nothing asks "which sheets
  of this bid have anything on them" in one go.
- A sheet has nowhere to store "no work here" (`drizzle/schema.ts`,
  `bidPdfSheets`: name and scale fields only), so that needs one new field.
- There is no "finalize" step today. A bid is Draft, Active, Won or Lost
  (`drizzle/schema.ts:1680`), with a Send menu and a proposal on the bid screen
  (`client/src/pages/BidsPage.tsx:536-551`) and the status change at
  `BidsPage.tsx:598`. The warning belongs on Send, on the proposal, and on
  moving a bid to Won.

**Simpler version, and the bloat check.** Automatic "worked / not started" plus
the one-tap "no work here" gets nearly all the value. Leave out a separate
"marked done" tick per sheet: a tick is one more thing to forget, and the warning
already names the sheets nobody has touched.

**Tablet and offline.** Sheet rows need tap targets of about 44 pixels, and "no
work here" must be a visible control, not a hover. Coverage comes from the same
server data as the rest of the screen, so it has the same offline limits
(section 7).

### C14 — Cross-check counts against the plan's own schedules

**What it does.** Plans carry fixture and panel schedules with quantities. Beside
each counted assembly in the counted-items list is a **"Schedule says"** number:
tap it, type the number, press Enter. When it matches the count it turns green
and says so; when it does not, it says plainly "Schedule 24 · counted 22". You
can also add a schedule line for something not counted yet ("Type F — schedule
12, counted 0"), which is exactly the miss this exists to catch.

**Already in the code.**

- Counts are already grouped per assembly (`shared/takeoffCounts.ts`, shown in
  `client/src/components/takeoff/RunsPanel.tsx`) — the "counted" side.
- Nothing reads schedules today. The plan reader is told to ignore them
  (`server/routers/planCopilotRouter.ts:220`).
- The viewer already pulls the text off each page for scale detection
  (`client/src/pages/TakeoffPage.tsx:480-482`). That text could one day
  pre-fill schedule numbers, but typing comes first.
- Quick number entry already exists as a shared field (`InlineNumberField`, per
  `CLAUDE.md` § Editing fields): select on tap, Enter saves, Escape undoes.

**Simpler version, and the bloat check.** One number per counted assembly, typed
into the list you are already looking at — no separate schedule screen. Reading
the numbers off the drawing automatically is a later, proposed step, and would
need a connection.

- **Flagged for you:** you asked for this per sheet. Fixture schedules usually
  cover the whole set, so a whole-set schedule compared with one sheet's count
  would always disagree. I'd compare against the whole bid's count by default,
  and allow per sheet where a schedule really is per floor. Your call.
- **Panel schedules** (circuits per panel) are harder: they compare against
  traced circuits (T3), which are typed in freely today. Start with fixture and
  device schedules, and do panels after T4.

**Tablet and offline.** A number field brings up the number keypad on a tablet,
and the mismatch flag must be words, not only a colour. Same offline limits as
the rest of the screen.

**Depends on.** C1 and C2 (counting by assembly, started directly) and C5 (so a
miscount can be fixed once the check finds it).

### R7 — Makeup allowances (extends R6)

> **2026-09-19: makeup KEEPS its name while the two percentages become
> "extra".** It is trade language for a real thing — the tail left at each end —
> rather than a euphemism for padding, and it is not a percentage. Renaming it
> to "extra" is the first step toward somebody folding it into the wire
> percentage, which is the mistake it exists to avoid: it scales with conductors
> and ends, never with length. Shown as its own term. See § 5j of
> `references/plan-viewer-overhaul.md`.

**What it does.** Adds conductor length for making up connections:

- **At each termination** (a box, device or piece of equipment): a set number of
  feet per conductor.
- **At the panel:** a set number of feet per conductor, once per circuit.

Both are set **once**, in company defaults, and can be raised on an assembly that
needs more (a large piece of equipment, for example). They are never a form on
each run (D15). They show as their own amount wherever wire totals show: "Wire
900 ft + makeup 84 ft".

**Defaults — picked, and why.** Starting points, not code rules; change them to
match your crews.

- **1 ft per conductor at each termination.** The electrical code's minimum is
  6 inches of free conductor at a box. Making up a device — stripping, splicing,
  folding back — uses more than the minimum, and a foot covers it without
  padding.
- **5 ft per conductor at the panel.** A conductor enters the panel and runs
  along the gutter to its breaker, and a typical panelboard is several feet tall.
  On a job with 40 homeruns of 3 conductors each, that is 600 ft at the panels
  alone — which is why it matters.

**How terminations are counted — flagged, not decided.** The simplest rule: every
traced run has 2 ends and each end is a termination; the panel allowance is added
once for each circuit on the bid. The catch: circuits are typed in by name today
(T3), so the same circuit on two runs could get the panel allowance twice unless
the names match exactly. Settle this when R7 is built.

**Already in the code.**

- The wire math is correct, and has no makeup in it
  (`shared/takeoffQuantities.ts:192-197`).
- The old screen had makeup, service loop and termination counts, **all
  defaulting to 0 and typed per run**
  (`git show 0a270af^:client/src/components/tabs/UnifiedProjects.tsx`, lines
  569–579).
- Company defaults already live in one place (`pricing_defaults`: overhead,
  profit, productivity) and are inherited by bids (`CLAUDE.md` § Company
  defaults) — the right home for these.
- **Double-counting risk:** starter device assemblies already include wire — 25
  ft of 12-2 NM-B per standard receptacle
  (`server/seed/baselineAssemblies.ts:98-108`). Makeup must not be added on top
  of wire an assembly already allows for.

**Tablet and offline.** Set once on a settings screen and applied by
calculation. No touch or offline issue of its own.

**Depends on.** T4 and R2 to reach the bid; T3 circuits for the panel allowance.

### T16 — Routing waste factor

> **RENAMED 2026-09-19: it is EXTRA.** "Routing waste factor" is not what an
> estimator says out loud, and "waste" reads as something that could be argued
> down to zero rather than as conduit that gets bought and installed. It is now
> **conduit extra** and **wire extra**, two percentages rather than one, because
> § 7.1 of `references/plan-viewer-overhaul.md` already applies them to
> different footage. The word, the display and where it is set are specified
> there in § 5j. **The unit and the reasoning below are unchanged.**
>
> **Also reconciled there: "not per run" stands, but the chain is now three
> levels** — company default → run type → this run — because the run TYPE did
> not exist when this row was written (D3(a), and § 2.0 of the overhaul). What
> this row was refusing is D15's form of nine fields on every traced line, and
> that refusal is intact.

**What it does.** A percentage added to traced length, because a pipe drawn on a
flat plan understates the real run: offsets, going around beams and ducts, and
bends the drawing does not show. It applies to conduit and cable length, and so
to the wire pulled through it.

- **Where it is set:** a company default, overridable per bid — the same pattern
  as the productivity factor. Not per run: that is the per-run form D15 ruled
  out.
- **Always visible, with its amount:** on each run ("112 ft traced + 10% routing
  = 123.2 ft"), on the totals ("includes 10% routing"), and on the bid line. It
  shows even at its default, because a number that changes your footage must
  never be invisible.

**Default — picked, and why: 10%.** Estimators commonly allow roughly 5–15% for
routing on runs measured off plans, depending on how crowded the building is.
10% sits in the middle, is easy to check in your head, and setting it to 0 turns
it off. It is **only** routing: it does not cover makeup (R7), vertical rise
(T17) or material cut-off waste, and must never be stacked on those without
saying so.

**Already in the code.**

- Measuring deliberately adds no waste and no rounding, leaving that to pricing
  (`shared/takeoffGeometry.ts:158-166`) — so this percentage belongs in pricing,
  not in the measuring math.
- The company-default-with-bid-override pattern already exists for productivity
  (`shared/pricing.ts`; shown on the bid at
  `client/src/pages/BidsPage.tsx:849-874`). Changing the company default gets the
  same warning panel as the other company defaults (`CLAUDE.md` § Company
  defaults).
- The materials list already tells a supplier its quantities carry no waste
  allowance (`server/routers/materialsListRouter.ts:209-211`). Once T16 exists,
  that note has to say what was added.

**Tablet and offline.** Calculation only. The per-bid override is a number field
following the standing field rules.

**Depends on.** Shows on runs as soon as it exists; reaches the bid with R2.

---

## 14. Added 2026-09-14 — PROPOSED (not decided)

You listed these as B1–B3. Renamed to fit the tables:

| You called it                | Spec ID | Where it sits in the tables     |
| ---------------------------- | ------- | ------------------------------- |
| B1 Vertical rise per device  | **T17** | 4. Tracing and measuring        |
| B2 Revision comparison       | **V20** | 1. Viewing the sheet            |
| B3 Bid line back to the plan | **R8**  | 5. Getting results onto the bid |

### T17 — Vertical rise per device

**The problem, plainly.** A plan is drawn looking down from above, so it only
shows horizontal distance. A receptacle box sits about 18 inches off the floor,
but its pipe usually runs up the wall into the space above the ceiling, turns,
and heads to the next box or back to the panel. (The run back to the panel is the
**homerun**.) That vertical piece — the **rise**, or **drop** when it comes down
from above — never shows on the plan. With a 10 ft ceiling it is about 8–9 ft
per receptacle, less for a switch mounted higher, and different again when the
pipe comes up out of the slab instead (a **stub-up**). Multiply by hundreds of
devices and it is a lot of pipe and wire.

**Three ways to handle it.**

1. **Heights: a ceiling height per sheet, and a mounting height per assembly.**
   The app works out each device's rise as the difference. Most accurate: it
   adapts when one floor has 10 ft ceilings and another has 14 ft. But it needs
   two numbers set, and it needs to know whether the pipe runs above the ceiling
   or under the slab. A sheet with mixed ceiling heights would need heights per
   area, which is where it turns into bloat.
2. **A flat rise per device type, set once on the assembly.** "Receptacle: 9
   ft", "Switch: 7 ft", "Ceiling light: 2 ft". Simple, one place to set it, and
   close enough on most jobs. On a tall-ceiling job you change the number or use
   a different assembly.
3. **Nothing new: put the rise inside the assembly's materials**, the way the
   starter device assemblies already include 25 ft of 12-2 NM-B per receptacle
   (`server/seed/baselineAssemblies.ts:98-108`). No new feature at all. But it
   is invisible on the takeoff and the bid — you never see "rise" as its own
   number — and on pipe jobs it mixes vertical pipe in with everything else.

**My pick: 2, shown openly.** A "rise per device" figure on the assembly, set
once, that shows as its own line on the bid ("Rise: 24 receptacles × 9 ft = 216
ft of 1/2" EMT, plus wire"). It keeps to the rule that nothing silently changes
your numbers, works on any sheet, and needs no heights typed in per job. Move to
option 1 only if tall-ceiling commercial work shows the flat numbers are too far
off.

**How it overlaps location tags (C10).** Where a device sits decides which rise
applies: a device tagged **Wall** or **Ceiling/Overhead** rises to the ceiling
space; one tagged **Slab/Floor** gets a short stub-up instead. So the assembly
could carry two figures — overhead rise and slab stub-up — and the sticky
location (D8) picks between them. That keeps it to one choice per job, not a
form per device.

**Watch for double counting.** If a device assembly already includes wire for its
drop, as the starter receptacles do, adding rise would count that wire twice.
Before T17 is built, decide whether device assemblies keep their built-in wire
(simplest for residential cable jobs) or leave vertical footage to T17 (clearer
for commercial pipe jobs).

**Already in the code.** Assemblies carry per-device material quantities
(`server/seed/baselineAssemblies.ts:98-134`), and the server can already store a
location on each mark (C10). Nothing about ceiling or mounting heights exists.

**Complexity.** Option 2 is small once T4 and R2 exist. Option 1 is medium, and
grows if heights vary within a sheet.

**Tablet and offline.** Set in the library and applied by calculation. No issue
of its own.

### V20 — Revision comparison

**What it would do.** Stop you bidding Rev 1 when Rev 3 is out, and show what
changed between them.

**How big a build — assessed in four levels.**

1. **Small: revision awareness.** Read the revision and date off each sheet's
   title block, from the text the viewer already pulls off every page
   (`client/src/pages/TakeoffPage.tsx:480-482`), and show "Rev 3 · 08/02" in the
   sheet list. When a new PDF arrives with the same sheet names, say "E1: Rev 3
   replaces Rev 1" and mark the older one as superseded. Title blocks vary, so a
   wrong reading needs a quick manual fix. **This catches the real risk** —
   bidding the wrong revision — for the least work.
2. **Medium: overlay view.** Show both versions on top of each other in two
   colours, so unchanged lines look the same and changes stand out, lined up by
   picking two matching points. Needs zoom and pan (V7, V8) first, and is heavy
   on a tablet's memory with two large sheets.
3. **Large: automatic change highlighting.** The app finds and circles changes
   itself. Sheets shift, text reflows and scans are noisy, so it raises false
   alarms unless carefully tuned. Not recommended now.
4. **Large: carry marks forward.** Move stamps and runs from Rev 1 onto Rev 3.
   Needs level 3 to know what moved. Not recommended now.

**My pick:** level 1 once the essentials are done, level 2 after zoom and pan,
and neither level 3 nor 4 for now.

**Already in the code.** Nothing tracks revisions. The plan reader's architect
matching already recognises "rev" markers in sheet text, in order to strip them
(`shared/planSource.ts:94-103`), and the plan reader is told to ignore revision
clouds (`server/routers/planCopilotRouter.ts:220`).

**Tablet and offline.** Level 1 is fine on a tablet. Level 2 may struggle for
memory on large sets. Both need the plans open, so the same offline limits apply.

### R8 — From a bid line back to the plan

**What it would do.** On the bid, a line that came from the plans has a "Show on
plans" link. It opens the Takeoff screen on that assembly's marks, with the
sheets that have them highlighted in the sheet list.

**Already in the code.** Inside the Takeoff screen this already works: a numbered
chip in the counted list jumps to its mark
(`client/src/components/takeoff/RunsPanel.tsx:139-141`, which calls
`client/src/pages/TakeoffPage.tsx:2003-2006`). What is missing:

- Bid lines do not know they came from the plans, because R1 and R2 are not
  built.
- The Takeoff address, `/bids/:id/plans` (`client/src/lib/appRoutes.ts:185-186`),
  cannot yet say which sheet or assembly to open. Adding that means updating the
  address tests (`client/src/lib/appRoutes.test.ts`).

**So it is an extension, not new work** — small once R1 and R2 exist, because D2
already marks those lines "from plans".

**Simpler version.** Open the Takeoff screen filtered to that assembly rather
than to one exact mark: a bid line is a whole assembly's count, not one stamp.

**Tablet and offline.** Same as the Takeoff screen. Most useful once zoom (V7)
lets the jump actually show the mark up close.

---

## 15. Adjustments that change your numbers — are they visible?

Checked 2026-09-14. The rule: **anything that changes a quantity, an hour or a
price must be visible where it changes it.**

| Adjustment                        | What it does                                                                                                                  | Where you can see it                                                                                     | Visible where it matters?                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Assembly overhead hours           | Adds flat setup, testing and cleanup hours to an assembly's labor, before modifiers (`shared/pricing.ts:76-82`)               | Only on the Assemblies screen: "Includes X h of assembly overhead" (`AssembliesLibraryPage.tsx:338-340`) | **No.** Not on the bid breakdown. Starter assemblies ship with 0; one assembly in the Aug 19 backup has it set. |
| Job-condition modifiers           | Adds a percentage to a line's labor                                                                                           | The bid line shows the modifier names and "frozen" (`BidsPage.tsx:737-739`)                              | **Partly.** The names show; the percentage and the hours it added do not.                                       |
| Productivity factor               | Scales every labor hour, company-wide or per bid                                                                              | Bid breakdown, whenever it is not 0 (`BidsPage.tsx:849-874`)                                             | Yes.                                                                                                            |
| Wire built into device assemblies | Every starter receptacle adds 25 ft of 12-2 NM-B; a dedicated circuit adds 35 ft (`server/seed/baselineAssemblies.ts:98-134`) | On the assembly                                                                                          | **Not on the Takeoff screen** — a stamp shows "1 placed", never its wire. Double-count risk once R2 ships.      |
| Frozen rates on bid lines         | A line keeps the labor rate it was added with, by design (`shared/laborRatePricing.ts:86-90`)                                 | A $0 rate is flagged on the bid (`BidsPage.tsx:821-845`)                                                 | **Partly.** A line frozen at an old, non-zero rate is not flagged after the rate changes (section 16).          |
| Detected scale                    | Applied automatically when the reading is confident                                                                           | "Detected" badge (`ScaleControl.tsx:258-260`)                                                            | Yes.                                                                                                            |
| Runs on sheets with no scale      | Left out of the totals                                                                                                        | Said under the totals (`RunsPanel.tsx:419-420`)                                                          | Yes.                                                                                                            |
| Layer filters                     | Hide marks from the drawing and the counted list                                                                              | Warning in Layers (`LayersPanel.tsx:243`)                                                                | Yes, though see section 8 item 7.                                                                               |
| Rounding                          | Traced lengths to 1/100 ft (`shared/takeoffGeometry.ts:163-166`); money to the cent (`shared/pricing.ts:169-196`)             | —                                                                                                        | Too small to matter.                                                                                            |

**Requirement for everything new in this spec:** T16 routing waste, R7 makeup and
T17 rise each show their own amount on the run and on the bid line, the way the
productivity factor already does. The two "No" rows above should be fixed the
same way.

---

## 16. Outside the Takeoff screen — flagged so it is not lost

These belong to the **bid screen**, not this one, but they decide whether a bid
is right no matter how accurate the takeoff is.

**Labor rate — what the Aug 19 backup actually shows.**

- **Your Journeyman rate is $43.00/hr** — your own copy of the starter
  Journeyman, last changed Aug 14. Starter assemblies use the Journeyman role by
  default (`server/seed/baselineAssemblies.ts:90`), and a bid line follows your
  copy (`shared/laborRateLookup.ts`).
- **Your 7 existing bid lines are priced at $68.00/hr**, not $43. A line keeps
  the rate it was added with, so they still carry an older figure.
- **The shipped starter roles are all $0:** Apprentice, Journeyman,
  Foreman/Master Electrician, Supervisor and Project Manager.
- **No company default labor rate is set** for your account
  (`pricing_defaults`).

You said the Journeyman rate has no real dollar value. If $43 is a placeholder
rather than your actual cost, every bid's labor is wrong — and the $68 already
on your lines disagrees with it. **The bid screen does not point out that
disagreement**: its warning only fires for a $0 rate
(`shared/laborRatePricing.ts:86-90`). The live site may also have changed since
Aug 19.

**Also on the bid screen:** that $0 warning tells you to "give it a role, then
re-add the line" (`client/src/pages/BidsPage.tsx:840-842`). The wording is right
when a line has no role, and wrong when the role exists but its rate is $0.

---

## Where things came from

- **Old screen** — `client/src/components/PlanPanel.tsx` (3,646 lines), inside the
  old Residential / Commercial / Civil / Industrial workspaces. Retired from use
  Aug 12, deleted Aug 18 in commit `c7eed51`. Still readable in git history at
  `0a270af^`. `client/src/components/tabs/PlanViewer.tsx` (727 lines) is an
  earlier June viewer, already unused by August.
- **Changelog** — `CHANGELOG.md`, entries Aug 12 through Aug 19.
- **Plan** — `ASSEMBLIES_PLAN.md` § TAKEOFF PAGE REDESIGN, § LAYERS and § AI
  CO-PILOT. **Incomplete as a spec for this screen:** it said the PDF engine would
  "stay as-is" and never mentions zoom, pan, removing marks, getting counts onto
  the bid, sheet size, tablets or offline use. Where it and this document
  disagree, this document wins.
- **references/** — nothing takeoff-specific. `deploying.md` covers plan storage
  and upload setup; `environment.md` covers the plan reader's model setting.
  Offline behaviour comes from `client/public/sw.js`.
- **Current code** — `client/src/pages/TakeoffPage.tsx` and
  `client/src/components/takeoff/*`, the server routers `bidPdfs`, `takeoffRuns`,
  `takeoffStamps`, `planCopilot` and `materialsList`, and `shared/takeoff*.ts`.
- **Your requests and earlier decisions** — zoom and pan details, scale from a
  known dimension, the sheet-size check, stamp removal, direct assembly picking,
  counts onto the bid, run editing, location tagging, the separate plan reader and
  "Where do I…?" bar, the AI rules, tablet and offline use, and wording accuracy.

## Keeping this true

- Any change to the Takeoff screen updates its row here in the same commit.
- A new capability gets a row before it is built.
- A changelog entry about this screen names the row it changes, and may only say
  "works" if that row says Works.
- Any new sentence on this screen is checked against the code before it ships,
  and section 8 is re-run when the screen changes.
