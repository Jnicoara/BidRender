# Homerun footage — notes for the patent review (US 11,120,171)

Written 2026-10-07 by Track C, from the code on branch `c-homerun-footage`
(not yet live — it waits for Track A's migrations 0125–0130). **Plan only:
nothing here changes code.** This describes what the software DOES; whether
any of it falls under the patent is the attorney's call, not ours.

**What we compared against.** Only the owner's one-line summary of the patent
— auto-generated wire routes from points on a PDF plan to a marked panel; a
straight line when "direct" is chosen, a right-angle multi-segment line when
"orthogonal" is chosen; avoid-areas; follow-a-cable-tray; a cost per route. We
have NOT read the claims. Every "resembles" below is against that summary.

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
- **Is anything drawn on the sheet?** **Yes, one thing, for display only:**
  when the user selects a circuit in the Circuits panel, the sheet shows that
  circuit's devices ringed and a **dashed one-corner right-angle line** from
  the leaving device to the panel (horizontal leg, then vertical leg —
  `CircuitLayer` in `client/src/components/takeoff/CircuitsView.tsx`). It is
  not saved, not priced, and disappears when the circuit is unselected. The
  number does not come from it; the line illustrates the distance.

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

### Option A — No route drawn at all; length = distance × the user's factor

Keep the Measured arithmetic (right-angle distance + drops + the user's
routing %), and **remove the dashed display line** so nothing route-like is
ever generated or shown. Optionally offer the plain straight-line distance
instead, with the routing % carrying the difference.

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
  the ring on the device can stay.

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

## Where the code lives (for anyone checking these notes)

- Arithmetic: `shared/homerunFootage.ts` (`homerunFootage`,
  `rightAngleDistance`, `leavingDevice`).
- Circuit grouping, closest device, panel from label:
  `client/src/lib/circuitGroups.ts`.
- The dashed display line: `CircuitLayer` in
  `client/src/components/takeoff/CircuitsView.tsx`.
- Server side, saving and pricing: `server/homerunsCore.ts`,
  `server/routers/homerunsRouter.ts`, `references/homerun-footage-plan.md`.
