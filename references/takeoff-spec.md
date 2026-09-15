# Takeoff screen — master spec

> **Draft for approval — written 2026-09-14.**
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

| Source           | Meaning                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Old screen       | The pre-Aug 12 viewer, `PlanPanel.tsx`. Read it with `git show 0a270af^:client/src/components/PlanPanel.tsx`. The richest source. |
| Older viewer     | `PlanViewer.tsx`, a June viewer already unused by August. Minor source.                                                           |
| Changelog        | `CHANGELOG.md`, Aug 12–19.                                                                                                        |
| Plan             | `ASSEMBLIES_PLAN.md` — **incomplete**; see "Where things came from".                                                              |
| Current code     | `client/src/pages/TakeoffPage.tsx`, `client/src/components/takeoff/`, and the takeoff server routers.                             |
| Your request     | Asked for directly when this spec was commissioned.                                                                               |
| Earlier decision | Decided before this spec (AI rules, "Where do I…?" wording, tablet use).                                                          |

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

| ID  | What it does                                                                                                                                 | Status         | Source                          | Need         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------- | ------------ |
| V1  | Attach plan PDFs to a bid: drop or pick files, several at once, up to 500MB each, with a progress bar, Cancel and Retry.                     | **Works**      | Current code, Changelog         | Essential    |
| V2  | Start a new bid from a plan in one step from the Dashboard ("Upload a plan").                                                                | **Works**      | Changelog Aug 14                | Nice-to-have |
| V3  | Remove a plan from a bid, with a warning that says truthfully what is lost.                                                                  | **Half-wired** | Current code                    | Essential    |
| V4  | A sheet list down the side, with real sheet names taken from the PDF's bookmarks, and renaming.                                              | **Works**      | Plan item 1, Changelog          | Essential    |
| V5  | Move between pages: on-screen arrows, arrow keys, Page Up/Down, Home/End, and a "3 / 18" counter.                                            | **Works**      | Old screen, Current code        | Essential    |
| V6  | Draw each page in the background so the app never freezes on a dense drawing.                                                                | **Works**      | Old screen, Current code        | Essential    |
| V7  | **Zoom:** mouse wheel, pinch, **+ / − / 0** keys, on-screen zoom buttons showing the %, opens fitted to the page at 40%, range 10% to 1000%. | **Missing**    | Old screen, Your request        | Essential    |
| V8  | **Pan:** click and drag with a mouse, drag with one finger, and pinch moves the view while zooming.                                          | **Missing**    | Old screen, Your request        | Essential    |
| V9  | Marks and traced lines stay visible and tappable at every zoom level (they scale with zoom, with a minimum on-screen size).                  | **Missing**    | Old screen, Your request        | Essential    |
| V10 | Clicking an item in the counted list shows that exact mark on the drawing.                                                                   | **Works**      | Plan item 5, Changelog          | Essential    |
| V11 | Plan addresses that expire mid-session are renewed without interrupting you.                                                                 | **Works**      | Changelog Aug 15                | Essential    |
| V12 | A warning before opening a very large plan (over 150MB).                                                                                     | **Works**      | Changelog Aug 14                | Nice-to-have |
| V13 | Resizable side panels.                                                                                                                       | **Works**      | Current code                    | Nice-to-have |
| V14 | Crosshair lines across the whole sheet that follow the cursor.                                                                               | **Missing**    | Old screen                      | Nice-to-have |
| V15 | Page thumbnail overview to jump between pages.                                                                                               | **Missing**    | Old screen                      | Nice-to-have |
| V16 | Hide pages you do not need.                                                                                                                  | **Missing**    | Old screen                      | Nice-to-have |
| V17 | Keyboard shortcuts for tools (the old screen had **M** measure, **C** count, **U** undo).                                                    | **Missing**    | Old screen                      | Nice-to-have |
| V18 | Two drawings side by side.                                                                                                                   | **Missing**    | Plan item 2 (one reading of it) | Nice-to-have |

**Notes**

- **V3** — Removing a plan permanently deletes **every stamp, traced run, circuit
  and plan-reader result** on its sheets. The database deletes them
  automatically (`drizzle/schema.ts`: sheets, stamps, runs and reader runs all
  cascade from the plan). The dialog mentions only "sheet names and scales" and
  says "You can attach the file again" — attaching it again brings none of the
  takeoff back. The trash icon that opens it only appears on mouse hover
  (`TakeoffPage.tsx:1787`).
- **V6** — Real drawings failed to draw with "Cannot read properties of undefined
  (reading 'createElement')" until the fix of 2026-09-14. **That fix exists only
  on the `local-dev` branch, uncommitted.** The browser console also shows
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

| ID  | What it does                                                                                                                                                        | Status         | Source                               | Need         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------ | ------------ |
| C1  | **Stamp tool:** choose what you are counting once, then tap every place it occurs.                                                                                  | **Half-wired** | Plan item 7, Changelog, Current code | Essential    |
| C2  | **Start the stamp tool by picking an assembly directly** (search, recently used), so things not in the plan's legend can still be counted.                          | **Missing**    | Your request, Plan item 7, Changelog | Essential    |
| C3  | Plain high-contrast rings on the drawing, so you can see what has been counted.                                                                                     | **Works**      | Plan item 6, Changelog               | Essential    |
| C4  | A counted-items list: each assembly with its count, and numbered chips that jump to each mark.                                                                      | **Works**      | Plan item 5, Changelog               | Essential    |
| C5  | **Remove a stamp:** a visible remove control, the Delete key, and Undo.                                                                                             | **Half-wired** | Your request, Plan item 7, Changelog | Essential    |
| C6  | **Undo the last stamp** (and undo a removal).                                                                                                                       | **Missing**    | Old screen, Your request             | Essential    |
| C7  | Move a stamp by dragging it.                                                                                                                                        | **Missing**    | Plan item 7                          | Nice-to-have |
| C8  | Stamps survive a crash or a lost connection: saved in the browser as you tap, sent in batches, re-sent later.                                                       | **Works**      | Changelog                            | Essential    |
| C9  | **Legend:** drag a box around a symbol on the plan's legend, name it, link it to an assembly once; the link is remembered on every future job; unlink or remove it. | **Works**      | Plan items 4 and 9, Changelog        | Nice-to-have |
| C10 | **Location tags** (Underground, Slab/Floor, Wall, Ceiling/Overhead, Exposed, Roof) on stamps and runs, one at a time or all of one assembly on a sheet at once.     | **Half-wired** | Changelog, Your request              | Nice-to-have |
| C11 | **Layers:** show or hide marks by System (Devices, Lighting, Panels, conduit, cable) and by Location; warns when part of the sheet is hidden.                       | **Works**      | Changelog, Plan § Layers             | Nice-to-have |
| C12 | Count without tapping each one (type a quantity, or rows × per row).                                                                                                | **Missing**    | Old screen                           | Nice-to-have |
| C13 | Remove every stamp of one assembly on a sheet at once.                                                                                                              | **Missing**    | Found in this review                 | Nice-to-have |

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
- **Old screen counting, for reference:** named count groups ("Outlets - Room
  101") each with its own icon, colour and optional unit cost, optionally linked
  to an assembly; right-click deleted the nearest pin; **U** undid the last pin;
  a quick count by rows × per row; "Clear page" removed every mark on a page. The
  new screen replaced groups with assemblies on purpose (see D10).

---

## 4. Tracing and measuring

| ID  | What it does                                                                                                                                  | Status         | Source                   | Need         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ | ------------ |
| T1  | **Trace a conduit or cable run:** tap along the route, see the length, finish, undo a point, or discard.                                      | **Works**      | Changelog, Old screen    | Essential    |
| T2  | Conduit is counted once per run; each circuit gets its own full length of wire per conductor; cable is its own raceway, with no conduit line. | **Works**      | Changelog                | Essential    |
| T3  | Circuits on a run: add, change the conductor count, remove.                                                                                   | **Works**      | Changelog                | Essential    |
| T4  | **Say what a run is** — for example 3/4" EMT, or 12/2 MC — so it can be priced.                                                               | **Missing**    | Old screen               | Essential    |
| T5  | Bid-wide totals of conduit, cable and wire from finished runs, leaving out drafts and runs on unscaled sheets.                                | **Works**      | Changelog                | Essential    |
| T6  | Protect a trace in progress: saved to the server every few seconds, kept in the browser on every tap, and a warning before leaving the page.  | **Works**      | Changelog                | Essential    |
| T7  | **Pick an interrupted trace back up** and keep going.                                                                                         | **Half-wired** | Changelog                | Essential    |
| T8  | **Edit a finished run: drag a point** to fix it.                                                                                              | **Missing**    | Old screen, Your request | Essential    |
| T9  | **Extend a finished run.**                                                                                                                    | **Missing**    | Old screen, Your request | Essential    |
| T10 | **Split a run**, or leave a gap inside one run ("lift the pen").                                                                              | **Missing**    | Old screen, Your request | Nice-to-have |
| T11 | **Rename a run.**                                                                                                                             | **Missing**    | Old screen, Your request | Nice-to-have |
| T12 | Delete a run.                                                                                                                                 | **Works**      | Current code             | Essential    |
| T13 | Footage labels on the drawing, on each segment.                                                                                               | **Missing**    | Old screen               | Nice-to-have |
| T14 | Colour each run, and hide the other runs while working on one.                                                                                | **Missing**    | Old screen               | Nice-to-have |
| T15 | Lengths do not depend on zoom level.                                                                                                          | **Works**      | Current code             | Essential    |

**Notes**

- **T1** — The length that follows your finger only appears with a mouse (it
  follows the pointer hovering). On a tablet you see the length after each tap.
  Finishing by double-tap is unreliable on touch, but a Finish button is there.
- **T4** — A run today is only "conduit" or "cable". The materials list prints
  its footage as "awaiting a specification". The old screen sent each run to the
  estimate with conduit type and size, conductor count, size and material, wire
  type, and fitting counts. See D3.
- **T7** — A run saved to the server shows in the list as **Draft** with a
  "Finish run" button, but it cannot be continued — only finished as it is. The
  copy kept in the browser is loaded when the sheet opens
  (`TakeoffPage.tsx:1310`) but never shown or offered. The Aug 12 changelog says
  "an interrupted trace is offered back when you return to that sheet."
- **T11** — Every run is named "Run on (sheet name)" (`TakeoffPage.tsx:1346`),
  so the list fills with identical names. Naming runs by what they are (T4) would
  remove most of the need to rename.
- **Old screen extras for runs:** Pause, Resume and Finish; lift the pen by
  double-click, right-click or both buttons; saved favourite colours; per-segment
  labels that appeared once zoomed in enough; "Push" to send a run's total to
  the calculator with a per-segment breakdown.

---

## 5. Getting results onto the bid

| ID  | What it does                                                                                                                            | Status      | Source                          | Need         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------- | ------------ |
| R1  | **Stamped counts become quantities on the bid.**                                                                                        | **Missing** | Your request                    | Essential    |
| R2  | **Traced footage becomes quantities on the bid** (needs T4 first).                                                                      | **Missing** | Your request, Old screen        | Essential    |
| R3  | A clear rule for when the same assembly is on the bid twice — once from the plans and once added by hand — so nothing is counted twice. | **Missing** | Found in this review            | Essential    |
| R4  | Quantities from the plans follow the app's cost-snapshot rule: costs are frozen when the line is created, like every other bid line.    | **Missing** | CLAUDE.md, Found in this review | Essential    |
| R5  | Materials list for a supplier: quantities only, no prices, built from stamps, runs and bid lines, as CSV or PDF.                        | **Works**   | Changelog Aug 14                | Nice-to-have |
| R6  | Per-run estimating details: makeup allowance, service loop, terminations, waste, pull points, fittings.                                 | **Missing** | Old screen                      | Nice-to-have |

**Notes**

- **R1, R2** — The screen says "Everything you place lands on the bid"
  (`TakeoffPage.tsx:1651`). The code says the opposite: "stamping does not
  create a line item" (`server/routers/materialsListRouter.ts:20`). Nothing that
  prices a bid reads stamps or runs. Today a takeoff has to be typed into the bid
  by hand. See D2.
- **R6** — On the old screen these lived on each run's calculator card. See D3
  and D15 before bringing any of it back: it is the biggest bloat risk in this
  document.

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

HelixBid installs as an app (a PWA), and doing a takeoff on a tablet at a job
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
  pixel (V9), and many small buttons sized at 20–24 pixels — for example remove
  plan, unlink a legend symbol, and undo a traced point.
- **Controls that only appear on mouse hover** — invisible on a tablet:
  - remove a plan (`TakeoffPage.tsx:1787`)
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

| #   | Where                                                       | What it says                                                                                                                                                              | What actually happens                                                                                                                              | Risk   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | "Remove this plan?" dialog (`TakeoffPage.tsx:2145-2147`)    | "…detached from this bid straight away, along with its sheet names and scales. The bid itself, and everything priced on it, is untouched. You can attach the file again." | Also permanently deletes every stamp, traced run, circuit and plan-reader result on those sheets. Attaching the file again brings none of it back. | High   |
| 2   | Screen subtitle (`TakeoffPage.tsx:1650-1651`)               | "Everything you place lands on the bid."                                                                                                                                  | Nothing placed on this screen becomes a line on the bid (R1, R2).                                                                                  | High   |
| 3   | Plan reader intro (`CoPilotPanel.tsx:266`)                  | "Nothing lands on the bid until you say so."                                                                                                                              | Even after you press Place, nothing lands on the bid; Place only makes stamps.                                                                     | High   |
| 4   | Counted items, empty (`RunsPanel.tsx:157`)                  | "Stamp an assembly onto the plan…"                                                                                                                                        | You cannot pick an assembly to stamp; you must capture and link a legend symbol first (C1, C2).                                                    | Medium |
| 5   | Detected scale tooltip (`ScaleControl.tsx:258`)             | "Read from this sheet — check it before measuring"                                                                                                                        | There is no tool on this screen to check a scale with (S7).                                                                                        | Medium |
| 6   | Naming a legend symbol (`SymbolCapture.tsx:106`)            | "Used to recognise it again on the next set of plans."                                                                                                                    | Only the AI plan reader recognises symbols. With the reader off, nothing is recognised; the link is reused only when you click it.                 | Medium |
| 7   | Layers warning (`LayersPanel.tsx:243`)                      | "Showing part of this sheet. Totals below cover the whole bid regardless."                                                                                                | The totals below are for traced runs only. Stamp counts are not totalled for the whole bid anywhere on this screen.                                | Low    |
| 8   | Stamping and tracing hints (`TraceLayer.tsx:416, 454, 468`) | "click to place · Esc to stop", "(Enter or double-click)", "(Escape twice)"                                                                                               | Mouse-and-keyboard wording; wrong on a tablet.                                                                                                     | Low    |
| 9   | Upload box (`TakeoffPage.tsx:1723-1726`)                    | "Drop plan PDFs here … or click to choose files from this computer"                                                                                                       | Computer wording; on a tablet you tap to choose.                                                                                                   | Low    |
| 10  | "Where do I…?" button (`NavigationHelper.tsx:75`)           | "Ask"                                                                                                                                                                     | Close to the "Ask AI" wording you ruled out; the rule is that it navigates, not answers.                                                           | Low    |

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
more complicated. Each has options, a pick, and the reason. **Nothing here is
decided until you say so.**

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

**D2 — How counts reach the bid (R1).**

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

**D3 — How a traced run says what it is (T4, R2).**

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

**D8 — Location tags (C10, C11).**

- (a) A "sticky" location chosen on the tool before tapping ("Wall"), so every
  mark gets it.
- (b) Tag after placing: select marks and choose, plus "all of this assembly".
- (c) Drop location tagging and the Location half of Layers.
- **Pick:** first decide whether location changes the price or the materials (for
  example, underground means PVC). If it does, (a) plus the bulk part of (b). If
  it does not, (c).
- **Bloat warning:** until this is decided, hide the Location filter — it can
  only ever show "Untagged" today.

**D9 — The legend's job once direct picking exists (C2, C9).**

- **Pick:** keep it as a shortcut, and as what the plan reader learns from, but
  collapsed by default so it does not crowd the counted list.

**D10 — Counting without tapping (C12) and the old count groups.**

- **Pick:** do not add this to the Takeoff screen. The Count screen and the bid
  already take typed quantities. Two ways to count on one screen is how counts
  get entered twice.
- Do not bring back the old free-named count groups. Counting by assembly is what
  lets the count be priced.

**D11 — Should the plan reader read sheets automatically? (A1)**

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

**D15 — Bringing back the old per-run estimating details (R6).**

- **Pick:** not on the Takeoff screen. Put anything that is really needed into
  assemblies or company defaults, set once.
- **Bloat warning:** this was the single most complicated part of the old screen.

**D16 — Fixing the changelog (section 8).**

- (a) Edit the old entries.
- (b) Add a new dated entry that corrects them.
- **Pick:** (b). The changelog is a history; a dated correction keeps the record
  honest about when things were claimed.

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

- **Removing a plan wipes its takeoff**, and the dialog does not say so (V3,
  section 8 item 1).
- **Five controls only appear on mouse hover** (section 7).
- **The offline support may store a new copy of a plan PDF every half hour** on
  an installed app (section 7).
- **Stamps that failed to send are not retried when the connection returns** —
  only with the next stamp placed, or when the sheet is reopened (C8).
- **Stamp counts are never totalled across the whole bid** on this screen — only
  per sheet (section 8 item 7).
- **The PDF drawing fix is only on `local-dev`, uncommitted** (V6).
- **Pages are drawn once at 1.5× size** — the sharpness limit once zoom exists
  (D1).
- **The PDF reads inside the drawing thread ("fake worker")**, which may be slower
  on very large sets (V6).

## 12. Essential rows that are not Works today

For deciding the order. Grouped by section, not ranked.

- **Viewing:** V3 (truthful remove-plan warning), V7 zoom, V8 pan, V9 marks
  visible at any zoom.
- **Scale:** S6 scale from a known dimension, S7 measure two points, S8 sheet-size
  check.
- **Counting:** C1 and C2 start the stamp tool by picking an assembly, C5 remove a
  stamp, C6 undo.
- **Tracing:** T4 say what a run is, T7 pick up an interrupted trace, T8 drag a
  point, T9 extend a run.
- **Onto the bid:** R1 counts, R2 footage, R3 no double counting, R4 cost
  snapshots.
- **Wording:** section 8 items 1–3.

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
