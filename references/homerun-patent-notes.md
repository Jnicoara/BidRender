# Homerun footage — notes for the patent review (US 11,120,171)

Written 2026-10-07 by Track C, from the code on branch `c-homerun-footage`
(not yet live — it waits for Track A's migrations 0125–0130). **Plan only:
nothing here changes code.** This describes what the software DOES; whether
any of it falls under the patent is the attorney's call, not ours.

**What we compared against.** First written against the owner's one-line
summary; **§ 4 below (added 2026-10-07) sets the claim wording beside what
the app does, element by element**, after the owner chose Option A (the
dashed display line is removed — see § 3).

**The patent:** US 11,120,171 B2, assignee McCormick Systems LLC (originally
McCormick Systems Inc). Status per the source: **active — reinstated
(January 2026), expires 2040-03-31.** Source:
https://patents.google.com/patent/US11120171B2/en.

---

## 1. How each homerun gets its length today

A **homerun** here is the circuit's run from the field back to its panel. One
homerun per circuit.

**What happens automatically, for every method:**

1. **Circuits are read from the drawing.** The browser reads circuit tags
   printed beside device symbols ("2B-1") and groups the marked devices by
   tag (`client/src/lib/circuitGroups.ts`). No AI; plain text positions.
2. **The panel is located** either by a person tapping its spot on the
   sheet, or automatically from a "PANEL 2B" label on the sheet when one
   exists (it then fills an empty panel spot only — never moves one a
   person placed).
3. **One "leaving device" is chosen per circuit:** the device in that circuit
   CLOSEST to the panel, measured at right angles (|Δx| + |Δy|). It is saved
   once, when the homerun is made; it changes only when a person presses
   "Re-match homeruns" or moves the panel by hand. A person may also pick it.

**Then, by method** (`shared/homerunFootage.ts`, `homerunFootage`):

| Method                      | Horizontal length                                                                                                                             | Needs the drawing?              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Measured** (default)      | The right-angle distance from the leaving device to the panel spot: \|Δx\| + \|Δy\| in page points, converted to feet with the sheet's scale. | Yes: devices, panel spot, scale |
| **Average**                 | A number the user types ("30 ft"), the same for every homerun on the bid or sheet. No geometry at all.                                        | No                              |
| **Measured with a minimum** | The Measured length, but never less than a minimum the user types.                                                                            | Yes                             |

To every method's horizontal length the app ADDS, by plain arithmetic:

- a vertical **up** from the device to the ceiling, and **down** from the
  ceiling to the panel (heights from the device's type, the panel, and the
  ceiling where the device sits — `shared/ceilingHeights.ts`);
- a **routing allowance** — a percentage the user sets ("+15%"), starting
  unapplied — and the wire / conduit **waste** percentages;
- a fixed **makeup** length per wire at the panel.

A person can **override** any homerun with a typed length, or mark it
**confirmed**. A homerun the person TRACES as a run on the drawing replaces
the computed one.

**Answers to the owner's four questions:**

- **Is a path drawn or calculated automatically?** The LENGTH is calculated
  automatically (Measured, Measured-with-minimum). It is a single number from
  two points; **no path is stored and no path is used in the arithmetic.**
- **Straight line, right-angle, or something else?** Right-angle **distance**
  only (the sum of the horizontal and vertical offsets) — equivalent to one
  corner. There is no straight-line ("direct") option and no multi-segment
  route that bends around anything.
- **Does the user pick a route type?** **No.** The user picks a METHOD
  (Measured / Average / Measured with a minimum), per bid with a per-sheet
  override, and a routing percentage. There is no direct-vs-orthogonal choice.
- **Is anything drawn on the sheet?** **No path, since 2026-10-07 (Option
  A).** Selecting a circuit rings its devices (the leaving one larger) and
  the panel stays marked with its label; **nothing is drawn between them.**
  Until 2026-10-07 a dashed one-corner right-angle line was shown there, for
  display only (never saved, never priced, the number never came from it).
  It is removed, and `server/noHomerunPath.test.ts` fails if any line,
  polyline, polygon or path element returns to that layer. Measured on
  screen at tablet size, circuit 2B-1 on UNCC E111: 7 device rings, 1 panel
  mark, 0 line elements; its length unchanged at 42.8 ft.

**Cost.** A homerun's footage (pipe, wire, fittings, labor feet) is added to
the bid lines of the homerun's run type, which are priced per foot like any
other line. There is no per-route cost shown; each homerun row shows feet.

## 2. Anything resembling avoid-areas or follow-a-cable-tray

- **Avoid-areas: nothing.** No feature steers or bends a homerun around a
  region. The nearest thing by name is **height areas** (`bid_height_areas`):
  outlines a person draws on a sheet to say "the ceiling here is 18'-0"". They
  change the HEIGHT used for drops of devices inside them. They do not
  change, block or redirect any path, and homeruns do not route around them.
- **Follow-a-cable-tray: nothing.** "Cable tray" exists only as a catalog
  material (a priced item with fittings). No route follows a tray, and the
  app has no concept of a tray's position on the drawing.
- **Traced runs** (separate from homerun computation): a person can draw a
  run of any shape by clicking points; the app measures what was drawn. The
  person chooses the path — they can draw it along a tray or around a room —
  but the software does not generate it.
- **Homeruns read from the drawing** (`client/src/lib/homeruns.ts`,
  read-only): on sheets where the engineer drew homeruns with arrowheads,
  the app reads the circuit tags at the arrow tips. It reads what was drawn;
  it does not generate routes, and it prices nothing today.

## 3. Design options that skip at least one of the patent's steps

Each still gives a usable homerun footage. Listed from smallest change up.

### Option A — No route drawn at all; length = distance × the user's factor — **CHOSEN AND BUILT 2026-10-07**

Keep the Measured arithmetic (right-angle distance + drops + the user's
routing %), and **remove the dashed display line** so nothing route-like is
ever generated or shown.

> **Withdrawn after reading the claims:** this option first suggested
> "optionally offer the plain straight-line distance". Claim 1 requires
> "generating a straight-line path … when a direct route is selected", so a
> straight-line choice would ADD an element rather than remove one. Not
> offered; there is still no route-type choice of any kind.

- **Skips:** generating or displaying a route; choosing a route type.
- **Accuracy:** unchanged — the number never came from the line. Right-angle
  distance with +15% routing is our current best estimate. A straight-line
  base is shorter by geometry alone: the same as right-angle for a device
  in line with the panel, about 29% shorter for one at 45° (there the
  right-angle distance is √2 ≈ 1.41 times the straight line).
  The factor that makes up for it has NOT been measured — it must be checked
  against hand-counted homeruns (UNCC E111's 38) before anyone relies on it.
- **Effort:** a few hours (delete the polyline, re-check the screen). The
  estimator loses a visual check of which device the homerun leaves from;
  the ring on the device can stay. **Done:** the line is gone, the leaving
  device's ring is larger, the length math is unchanged (its 87 tests pass
  untouched).

### Option B — The user traces each homerun; nothing is computed

Homerun length comes ONLY from a run the person draws (the existing trace
tool), tied to its circuit. The app measures; it never proposes a path. The
computed Measured method is removed or kept only as a labelled estimate
until traced.

- **Skips:** automatic route generation entirely; any automatic choice of
  path, panel connection or route type.
- **Accuracy:** the best of the three — the real path, around obstacles,
  along trays, through the actual corridor.
- **Effort:** highest for the user — UNCC E111 has 38 homeruns, so roughly
  38 traces per sheet (minutes each). Development: medium — tying a traced
  run to its circuit (`takeoff_run_circuits.panelCircuitId` exists and is
  read; nothing sets it yet) and a "trace this homerun" control.

### Option C — Typed lengths only (Average / per-homerun override)

Use the existing Average method (one typed length per bid or sheet) and
per-homerun typed overrides; no device-to-panel geometry is used at all. The
drops, routing % and waste are still added by arithmetic.

- **Skips:** reading points from the plan for routing; any route.
- **Accuracy:** lowest per homerun; acceptable in aggregate for repetitive
  work (offices, apartments) when the estimator knows the building. Poor on
  a large floor where the panel is at one end.
- **Effort:** none to build — it ships today. The user's effort is choosing
  and checking the average.

**Our suggestion to put to the attorney:** A is the smallest change and
loses no accuracy; B is the most defensible and the most accurate but costs
the estimator time; C already exists as a fallback. The three can coexist:
A as the default, B where accuracy matters, C where the drawing does not
help.

## 4. The claims, element by element — what the app does after Option A

**Wording below as shown on the source page (fetched 2026-10-07).** It was
read through a tool that passes the page through a summarising model, so
**check each quoted claim against the official text before relying on the
wording.** "Does the app do it?" describes the software only; whether a
difference matters legally is for the attorney.

### Claim 1 (independent) — ALL elements required

> "A computing device comprising: a processor; a display …; a user interface
> …; and a memory … storing program instructions that when executed by the
> processor, causes the processor to: display a floorplan of a blueprint
> file, wherein the blueprint file is a non-CAD file; select a scale factor
> for the floorplan; mark and labeling at least one electrical panel;
> generate wire routes from selected points on the floorplan to a desired
> electrical panel of the at least one electrical panel, wherein generating
> wire routes comprises generating a straight-line path from one of the
> selected points to the desired electrical panel when a direct route is
> selected; and generate a cost for each of the wire routes generated."

| Element                                                           | Does the app do it after Option A?                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display a floorplan of a non-CAD blueprint file                   | **Yes.** Plans are PDFs (vector or scanned), shown in the viewer.                                                                                                                                                                                                           |
| Select a scale factor for the floorplan                           | **Yes.** Each sheet's scale is set by the user, or read from the scale note printed on the sheet and applied automatically when that reading is unambiguous (`bidPdfs` scale detection, `scaleSource = "detected"`).                                                        |
| Mark and label at least one electrical panel                      | **Yes.** A panel's spot is tapped by the user or taken from a "PANEL 2B" label; it is drawn as a box labelled "2B".                                                                                                                                                         |
| Generate wire routes from selected points to a desired panel      | **No route is generated, stored or drawn.** The app computes ONE NUMBER per circuit: the right-angle distance between two points. The start point is chosen by the app (the circuit's device closest to the panel), not selected by the user, though the user may pick one. |
| … comprising a STRAIGHT-LINE path when a DIRECT route is selected | **No.** There is no "direct" choice and no straight-line path or distance anywhere in the homerun code. There is no route-type choice at all.                                                                                                                               |
| Generate a cost for each of the wire routes                       | **Not per route.** Homerun footage is added to the bid lines of one run type and priced per foot there; a homerun row shows FEET, never a cost. The bid's total does include the cost of all homerun footage together.                                                      |

### Claim 13 (independent) — Claim 1's elements, plus

> "… generating a multi-line path from one of the selected points to the
> desired electrical panel when an orthogonal route is selected, wherein
> adjacent lines of the multi-line path are orthogonal to one another;
> generate a cost for each of the wire routes generated; and generate an
> estimated material takeoff window, the estimated material takeoff window
> displaying calculated estimated costs for selected wire routes generated."

| Element                                                          | Does the app do it after Option A?                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-line orthogonal path when an ORTHOGONAL route is selected  | **No path is generated, stored or drawn**, and there is no "orthogonal" choice. **Flag, honestly:** the number we compute, \|Δx\| + \|Δy\|, is arithmetically the LENGTH a one-corner right-angle path would have. Until 2026-10-07 that path was drawn for display; it no longer is. Whether computing that length without generating the path matters is the attorney's question. Options B and C below avoid the computation altogether. |
| Cost for each route                                              | As claim 1: not per route.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Estimated material takeoff window with costs for SELECTED routes | **Partly resembles.** There is a materials list and a Totals tab showing homerun pipe, wire and fittings in feet, and a bid page with prices — for ALL homeruns on a run type together, not for routes the user selects, and not per route.                                                                                                                                                                                                 |

### Dependent claims 4–6 — non-wiring areas

> Claim 4: "… mark at least one non-wiring area on the floorplan."
> Claims 5–6: a first straight section to the non-wiring area, then a
> multi-line path "around the at least one non-wiring area".

**No.** Nothing marks an area to keep wiring out of, and nothing routes
around anything. The only outlines a user draws are **height areas** (a
ceiling height for devices inside), which never block or redirect anything.

### Dependent claims 7–9 — following a marked cable route

> Claim 7: "… mark at least one cable route on the floorplan." Claims 8–9:
> a line from a point to the cable route, then a multi-line path "following
> the at least one cable route when an orthogonal route is selected".

**No.** No cable route or tray is marked on a drawing, and no homerun follows
one. "Cable tray" is only a catalog material. A user can trace a run by
hand along any path, including along a tray; the app measures what the
person drew and generates nothing.

### Summary for the attorney

After Option A the app still does the first three elements of claims 1 and
13 (display a non-CAD plan, set a scale, mark and label a panel). It does
**not** generate, store or display any wire route, offers no direct or
orthogonal choice, draws no straight or multi-line path, and costs no
individual route. The closest point is that the Measured method's single
number equals the length of a one-corner right-angle path (see the claim 13
flag). The dependent claims' non-wiring areas and cable routes have no
counterpart. If that flag is a concern, Option B (user traces every homerun)
or C (typed lengths) removes the computed distance as well.

## Where the code lives (for anyone checking these notes)

- Arithmetic: `shared/homerunFootage.ts` (`homerunFootage`,
  `rightAngleDistance`, `leavingDevice`).
- Circuit grouping, closest device, panel from label:
  `client/src/lib/circuitGroups.ts`.
- The sheet layer for a picked circuit (rings and the panel mark, NO path
  since 2026-10-07): `CircuitLayer` in
  `client/src/components/takeoff/CircuitsView.tsx`; its guard is
  `server/noHomerunPath.test.ts`.
- Server side, saving and pricing: `server/homerunsCore.ts`,
  `server/routers/homerunsRouter.ts`, `references/homerun-footage-plan.md`.
