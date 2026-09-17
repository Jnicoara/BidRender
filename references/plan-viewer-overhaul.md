# Plan viewer overhaul — the plan

Written 2026-09-17. **Phase 1 is shipped; everything else is still plan.** This
is the agreed shape of the work, the order it happens in, and the decisions
already made, so that none of it has to be re-derived in six weeks.

**§ 4.1 is the most current part of this document** — it records what changed
after Phase 1 was tested on the live site, which was more than the planning
predicted.

The viewer is the heart of the product. Everything else prices what this screen
counts.

---

## 0. What already exists — read this before assuming anything is missing

The manual tools are further along than they look. What is missing is the
ability to **see what you are clicking**, not the clicking itself.

**Already working:**

- **Manual stamping** (`TraceLayer.tsx`) — arm the tool with an assembly, and
  every click drops one. Totals reach the bid. It recovers stamps clicked but
  never saved, after a crash or reload.
- **Manual run tracing** — click point to point, double-click to finish, Escape
  cancels, Backspace / Ctrl+Z undoes the last point. Conduit yellow, cable
  green. Measures against the sheet scale; conduit, cable and wire-per-circuit
  land on the bid. Runs can be deleted from `RunsPanel`.
- **Multiple circuits sharing one run** — already in the schema, and already
  the user's explicit choice rather than an assumption. `takeoff_run_circuits`
  is many-per-run, and its comment is deliberate: conductor count is _"Entered,
  never derived… guessing it would put a wrong wire quantity on a bid."_
- Scale control (ratio entry), layers, legend, sheet index, AI reader.

**The geometry is already right.** Everything is stored in PDF page points,
never screen pixels, with the reason written down: _"a length measured in
pixels would change with zoom."_ That was built for a zoom that does not exist
yet, which is why adding zoom does not disturb any stored measurement.

**Genuinely missing:** zoom, pan, full-screen, two-point scale calibration, a
measure-only tool, dragging a vertex, and per-run allowances.

---

## 1. The old PlanPanel — read it, do not restore it

`PlanPanel.tsx`, 4,563 lines, deleted in `c7eed51` (v5.101, "Delete the
four-workspace design's leftovers"). Recoverable with
`git show c7eed51^:client/src/components/PlanPanel.tsx`.

It had scroll-to-zoom, click-drag pan, a precision crosshair, per-segment
footage labels, page thumbnails, keyboard shortcuts, and **working two-point
scale calibration**.

**Do not start from it. Three reasons, the third decisive:**

1. **It is welded to things removed on purpose** — `react-pdf`, IndexedDB PDF
   storage, per-workspace `localStorage`. Today's viewer renders in a Web
   Worker so a dense sheet cannot freeze the app, and streams pages by byte
   range so a 2GB set never lands in memory whole. Restoring PlanPanel drags
   all of that back.
2. **Its zoom has a ceiling.** It renders once at fixed resolution and zooms by
   CSS stretch. Past that resolution it goes soft — which is exactly the
   complaint this overhaul exists to fix. The current worker already takes a
   resolution parameter, so we can re-render sharp.
3. **Its scale maths is worse than what we already have.** It stored pixels per
   foot, tied to render resolution. Today's schema stores a ratio in PDF
   points, which is resolution-independent. Taking the old maths would be a
   step backwards.

**Take the interaction design, not the code.** The calibration flow, segment
labels, crosshair, keyboard shortcuts and zoom-toward-cursor are a
specification that has already survived real use. Retype them against today's
architecture.

---

## 2. Run tracing — the full specification

Agreed 2026-09-17. This is the whole of it in one place.

### 2.1 Per-run controls

| Control                             | Today                           | Notes                                                       |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| Count conduit, wire, or both        | **Missing**                     | Three states, not a pair of checkboxes that can both be off |
| Conductors per circuit              | **Exists** (`conductorCount`)   | Entered, never derived                                      |
| Ground present                      | **Folded into conductor count** | Needs separating — see below                                |
| Number of circuits                  | **Exists**                      | Many `takeoff_run_circuits` per run                         |
| Copper or aluminium                 | **Missing**                     | Per circuit, not per run                                    |
| Different circuit sizes in one run  | **Missing**                     | Wire size lives per circuit                                 |
| Multiple circuits share one conduit | **Exists**                      | The user's choice, never inferred                           |

**On sharing a conduit:** in practice you would usually run a second pipe
rather than mix a large and a small circuit, but it comes up and somebody may
want to price it that way. **Both must be possible, and the app must never
decide which.** The schema already works this way; the UI has to keep it that
way and not "helpfully" split or merge anything.

**On the ground:** today a 2-wire-and-ground circuit is stored as
`conductorCount = 3`. That is not wrong, but it cannot answer "how much bare
copper" separately from "how much insulated", and a ground is frequently a
different size and sometimes a different material. Splitting it is the right
call, and the migration is mechanical.

### 2.2 The three allowances — each measuring what it actually is

This is the part most estimating tools get wrong by making everything a
percentage.

1. **Conduit allowance — a percentage.** Route uncertainty: the jog around a
   duct, the offset that was not on the plan. Scales with length, because a
   longer route has more chances to deviate.

2. **Wire allowance — a percentage.** The same uncertainty _plus_ the extra
   wire consumed by every bend and offset. **Normally higher than conduit**,
   and the UI should not make them look like one number applied twice.

3. **Makeup / slack — FEET PER CONDUCTOR PER END, never a percentage.** The
   tail left at the panel and at each device. **This does not scale with run
   length** — you leave the same slack on a 20 ft run as on a 200 ft run — so a
   percentage is the wrong unit twice over: it under-allows short runs and
   wildly over-allows long ones. It scales with **conductors**, because every
   conductor gets its own tail, and with **ends**, of which there are normally
   two. More is left at a panel than at a device.

   Getting this unit right is the difference between a number an estimator
   trusts and one they work around.

   **Makeup is WIRE ONLY.** Confirmed 2026-09-17. Pipe gets cut to fit and has
   no tail. Applying it to conduit would inflate every run on every bid.

### 2.3 Starter values — shipped, labelled, and dated

**These ship with real numbers, NOT zero.** This is a deliberate exception to
`CLAUDE.md` § Starter content, and the reasoning is worth keeping:

An unpriced material **shouts** — it renders as `$0` and the Materials screen
filters down to exactly those. An unset allowance **whispers**. It makes a
total quietly a little low and nothing on screen says so.

And the two failures are not symmetric. A wrong-high allowance loses a bid you
might have wanted. **A zero allowance wins a bid you then lose money on.** An
underbid that wins is the more expensive mistake, so the default must err
toward covering the work.

So they follow the **material-price pattern instead**: ship a starting value,
label it a starter, show when it was last changed, and prompt the estimator to
set their own.

| Setting           | Starter                                        | Basis                                  |
| ----------------- | ---------------------------------------------- | -------------------------------------- |
| Wire allowance    | **10%**                                        | Common convention                      |
| Conduit allowance | **5%**                                         | Common convention                      |
| Makeup            | **2 ft per conductor per end**, more at panels | Common convention                      |
| Drops / rises     | **0**                                          | Facts about a specific run — see § 2.4 |

**These are common conventions, not measured from anyone's jobs, and the UI
must say so.** The relationship matters as much as the values: wire always
exceeds conduit, because wire follows the same route plus every bend consumes
it. If someone sets them equal, something is wrong.

### 2.4 Verticals — the biggest single source of missed footage

**Tracing a plan measures FLAT OVERHEAD DISTANCE ONLY.** The drawing does not
know the ceiling is 10 ft or that the receptacle sits at 18 inches. Every
vertical — every drop, every rise — is invisible to a traced line.

**On a commercial job the verticals are a large share of the total.** Thirty
receptacles at 18 inches, dropped from a 10 ft ceiling, is 8.5 ft each:
**255 ft of conduit and the same again in wire per conductor**, none of which
appears in the traced length. Miss it and the bid is under before anything else
is counted.

**This is not solved by typing drop and rise feet per run.** Nobody types it
forty times, and the number they would type is a fact about the building, not
about that run. So it is solved by **mounting heights, applied automatically**.

#### The model

- **A distribution height** — the elevation the raceway actually runs at. Set
  per company, overridable per job. **Called that, never "ceiling height"**:
  the pipe may run at the ceiling, above it, or at the deck, and three people
  will enter three different numbers under an ambiguous label. Ceiling height
  stays out of the model entirely unless something genuinely needs it.
  **Stored in inches, displayed in feet and inches** — `formatFeetInches`
  already exists, and 18" typed as `1.5` is the obvious mistake to design out.
- **A mounting height per device type** — receptacle 18", switch 48", panel,
  ceiling junction box, and so on. Set per company, overridable per job.
- **Each run carries a START elevation and an END elevation, separately**,
  because a run normally goes panel to device and the two ends differ.
- **The vertical is computed and SHOWN, never hidden.** The run breakdown lists
  the traced flat length and each vertical as its own line. An estimator has to
  be able to see where every foot came from — the same reasoning that keeps
  `modifierPct` and `productivityPct` separate in the pricing breakdown.
- **Overridable on any run that differs.** Null means "follow the setting".
- **Stamps carry verticals too.** A fixture whip, a device dropped off a
  homerun that was never traced. This is what stops anyone trying to draw
  little vertical stubs on a flat plan, which cannot be done.

#### How the app knows what a run ends at — it asks, it does not guess

**The run carries an end device type, chosen by the user.** It is NOT inferred
from a stamp that happens to sit near the endpoint. Snapping a run end to a
nearby symbol is the kind of magic that is right most of the time and silently
wrong the rest, and a wrong vertical is invisible in a total.

#### The double-count trap — the one that will actually bite

A vertical belongs to **either the run or the stamp, never both.** If a run's
end drop is counted and the receptacle stamped at that same point also carries
its own drop, the footage is counted twice and nothing catches it.

**The rule, and it goes in the CODE, not only in this document:** a traced run
owns the verticals at its own two ends. A stamp's vertical is for devices
**not** on a traced run. Enforce it where the quantities are computed, so a
future change cannot quietly reintroduce the double count; a rule that lives
only in prose is a rule that survives exactly as long as the person who read it.

The UI makes which one is carrying it obvious, and the run breakdown showing its
verticals explicitly is the other half of the protection.

#### Verticals flow through the per-conductor maths

A drop adds to conduit **once** and to wire **once per conductor**. Vertical
footage must go through the same multiplication as traced footage, or the wire
number is wrong by however many conductors there are.

### 2.5 How the settings behave

**Defaults set once, inherited by every new run, overridden only where a run
differs.** Six controls on forty runs is forty times six decisions, and nobody
does that — they set nothing and the allowances stay wrong. **The sliders are
for the exception, not the routine.**

This follows the pattern already established in `CLAUDE.md` § Company defaults:
a run stores **NULL** to mean "follow the default", so changing the default
re-prices every run still inheriting it. It must **not** copy the value down at
creation, which would silently freeze every run at whatever the default
happened to be that day.

**A slider adjusts up or down with an obvious reset to baseline**, and a run
that has been overridden must say so, or nobody will know which of forty runs
they touched.

---

## 3. Three levels of effort

A user should be able to:

1. **Drop plain points and get a count.** No assembly, no pricing. Just "there
   are 34 of these."
2. **Drop points carrying a custom dollar or hours amount.** No library needed.
3. **Use full assemblies**, as today.

**The clicking is identical in all three.** What differs is only what is
attached to the group.

**Level 1 must be able to grow into level 3** — attach an assembly to a group
already counted, with every click intact.

**Why this matters more than it looks:** today the stamp tool makes you choose
an assembly _before your first click_. That is setup work demanded up front,
before the user has seen the thing work, and it is the most likely reason a new
user gives up. Counting first and pricing later is the natural order of the
job.

### 3.1 The small version that ships early — and what it is not

Live testing found the real prerequisite is worse than "pick an assembly
first": the stamp tool can **only** be armed from a captured legend symbol that
has already been linked to an assembly. On a set whose legend has not been
captured, there is no way to stamp anything at all.

**The small version (Phase 1a, no schema change):** arm the stamp tool by
choosing an assembly straight from a list, the way every other assembly picker
in the app works. Legend capture stays as the fast path for a symbol used over
and over, but stops being the only door. `assemblyId` and `assemblyName` are
filled exactly as they are today, so nothing in the data model moves.

**Be clear about what this is not.** It is still level 3 — a stamp carrying a
priced assembly. **True level 1, dropping plain points that carry no assembly
and no price, needs `takeoff_stamps.assemblyName` to stop being required AND
needs the group concept**, so that a group counted today can have an assembly
attached next week with every click intact. That is Phase 6, and it must not be
smuggled in early by making a column nullable and hoping: the group is the
thing that lets clicks survive being priced later, which is the entire point of
the three levels.

---

## 4. Phase order

Each phase ships and gets used before the next starts.

> **Re-ordered 2026-09-17 after testing Phase 1 on the live site.** The order
> below is the current one; § 4.1 records what the testing changed and why.

| Phase  | What                                                    | DB change                |
| ------ | ------------------------------------------------------- | ------------------------ |
| **1**  | ~~Zoom, pan, and the three viewer bugs~~ **shipped**    | No                       |
| **1a** | Page-flip fit bug + tool discoverability                | **No**                   |
| **2**  | Two-point scale calibration                             | No (reuses `scaleRatio`) |
| **3**  | Sharp re-render of the visible area                     | **No**                   |
| **4**  | The layout: full screen, top toolbar, collapsing panels | **No**                   |
| **4b** | Measure-only tool                                       | **No**                   |
| **5**  | **Verticals on runs — the money phase**                 | **Yes**                  |
| **6**  | Three levels of effort                                  | **Yes** — groups         |
| **7**  | Run settings: allowances, materials, sizes, ground      | **Yes**                  |
| **8**  | **Verticals on stamps**                                 | **Yes** (small)          |
| **9**  | Editing runs: drag a vertex, insert/remove points       | No                       |
| **10** | AI reader tiling, and the daily-limit question with it  | No                       |
| **11** | Tablet and touch                                        | No                       |

### 4.1 What live testing of Phase 1 changed

Zoom, pan and measurement invariance all held. Everything below came out of
using it on a real drawing set, which found things no amount of planning had.

**The blocker: most real sheets do not state a scale ratio.** So the only scale
tool that exists is useless on them, and the consequences cascade — no scale
means tracing is off, which means the trace buttons are hidden, which means the
screen offers nothing to do at all. **Two-point calibration is not a
nice-to-have, it is the thing that makes the screen work**, and it moved from
Phase 3 to Phase 2.

**Sharp re-render moved in and got bigger.** 260% is already too soft to read a
power pole callout. Worse, the whole-page approach hits a wall exactly there:

| Render scale | Sharp to | Bitmap RAM (36×24 sheet) |
| ------------ | -------- | ------------------------ |
| 1.5× (today) | 100%     | 38 MB                    |
| 3×           | 200%     | 154 MB                   |
| 4×           | 267%     | **273 MB**               |
| 6×           | 400%     | **615 MB**               |

So it **must render only the visible area**, not the whole page. That is
bounded by the viewport — roughly 6 MB at any magnification — instead of
growing with the square of the zoom. It is also the machinery the AI tiling
needs (§ tiling), so building it here pays twice. Poor image quality will hurt
the reader for exactly the same reason it hurts a human.

**Tool discoverability was the real felt problem.** On an unscaled sheet there
was no tool to find: trace buttons hidden, stamp tool unarmable because the
legend was empty. Two fixes, both small, both moved to the front:

- **Show disabled tools with a reason, never hide them.** A hidden tool looks
  like a tool that does not exist.
- **Arm the stamp tool by picking an assembly directly**, without capturing a
  legend symbol first. See § 3.1 — this is a UI change with no schema work, and
  it is NOT the same thing as true level-1 counting.

**The page-flip fit bug.** Phase 1 re-fits on canvas size, on the reasoning that
a new raster is what changes. Every sheet in a set is usually the SAME size, so
it never re-fires and the zoom carries over. It must key on the page and the
document, not the geometry.

**The no-scale notice still is not right.** Out of the drawing was an
improvement; a large black box in the corner is not the answer. It belongs in
the top toolbar as a status item with its own "Set scale" button, which means
it is part of the layout phase rather than a thing to patch again first.

### 4.2 Why calibration comes BEFORE sharp zoom

The obvious objection: you must click a known dimension accurately, so surely
sharpness comes first. **Checked, and it does not hold** — because calibration
error is set by the SPAN you calibrate over, not by how sharp the pixels are.

Calibrating over a 100 ft dimension at 1/8" = 1'-0" spans about 1,350 px. Click
each end 3 px out and the scale is 0.4% wrong. Calibrate over a 10 ft span and
the same sloppiness is **4.4% wrong** — on every measurement on that sheet,
because a calibration error multiplies into all of them.

**So the mitigation is a long span, not a sharp one**, and that is a design
requirement on Phase 2 rather than a dependency on Phase 3: the calibration UI
must push toward the longest available dimension, show the span it is about to
use, and say plainly when a short one will not be trustworthy.

### Why verticals moved to Phase 5

**Moved 2026-09-17, and the reasoning first given for holding them back was
wrong.**

They were placed after groups and run settings on the claim that they depended
on two things those phases would build. Checking the code rather than assuming:

- **The per-conductor wire maths already exists.** `wireFeetByCircuit` is
  documented as _"the full run length once per conductor"_. Vertical footage can
  flow through it today.
- **The defaults-inheritance pattern already exists**, for overhead, profit and
  the productivity factor. It is a pattern to copy, not one to build.

So the dependency was overstated. Verticals are the single largest source of
missed footage, and groups and run settings are the two largest phases in the
plan — holding the money item behind them cost weeks for no technical reason.

**Runs before stamps, still.** Run verticals carry most of the missed footage
and need no group concept at all. Stamp verticals are the smaller half and sit
on top of Phase 6's groups, so they stay at Phase 8.

**What the reorder costs, named precisely so nobody has to guess later:**
`shared/takeoffQuantities.ts` gets restructured twice instead of once — first to
add verticals to a run's length, then again when allowances arrive and the
composition order has to be settled. That is one module of pure functions with
tests against them, which is the cheap kind of rework: no data migration, no UI
rebuild, and the tests say immediately if the second change breaks the first.
The breakdown UI is extended rather than rebuilt, and mounting heights and
allowances would be separate settings sections either way.

**The minimum Phase 5 is:** company distribution height, per-device-type
mounting heights, run start and end elevation with the end device type picked by
the user, the vertical maths, and the breakdown that shows it.

**Why the AI tiling is late:** it needs the render-at-resolution machinery from
Phase 1, so building it earlier means writing that twice. And manual mode has
to stand alone first — until it does, improving the AI is polishing the thing
you cannot yet rely on. When it lands, one sheet becomes many AI calls, so the
per-person daily limit in `shared/aiLimits.ts` is suddenly counting something
far larger than it was sized for. **That gets answered in the same phase, not
after the bill.**

---

## 5. Known bugs folded in

Both in Phase 1.

**The "No scale set" warning sits over the drawing** (`TraceLayer.tsx:197`,
`absolute inset-0 … pt-10`) and swallows clicks in that region.

**It stays up after a scale is set.** Cause found: setting a scale calls
`refreshSheets()`, which invalidates `bidPdfs.sheets` only
(`TakeoffPage.tsx:725`). The warning reads a **different** cached query,
`takeoffRuns.measurability`, which nothing invalidates. One missing line.

**And a third, found while looking:** when there is no scale, `TraceLayer`
returns early and renders **nothing at all** — no stamps, no existing runs. So
on an unscaled sheet you cannot see stamps you already placed, and **the stamp
tool is unusable**, even though counting receptacles has nothing to do with
distance. A missing scale currently disables a tool that does not need one.

---

## 6. Decisions already made — do not re-open without saying why

**NO CONDUIT FILL CHECKING. EVER.** Decided 2026-09-17. The app prices what the
estimator says and stays silent on whether it physically fits.

Once a run can hold different wire sizes and materials in one pipe, somebody
will eventually put six circuits in a half-inch conduit, and the obvious next
feature looks like fill checking. **It is not.** Fill depends on jurisdiction,
insulation type and adopted code year; getting it 95% right is worse than not
having it at all, because an estimator would begin to trust it and stop
checking. A silence nobody relies on beats a warning that is right most of the
time.

**This request will come back.** It will look reasonable and small. It is
neither.

**Nine controls on a run is too many.** The run panel shows what differs from
the defaults and keeps the rest behind one "more" control. A crowded panel is
one people stop reading.

**Level 2 — a custom dollar or hours amount per point — is an escape hatch, not
a headline.** Build it because it is cheap once groups exist, but do not design
the screen around it, and drop it first if Phase 5 runs long.

**Dragging a vertex stays last and is cuttable.** Undo-and-re-click already
works. If it competes with anything in Phases 5–8, it loses.

## 7. Settled — answered 2026-09-17

- **Makeup applies to WIRE ONLY.** Pipe is cut to fit and has no tail.
- **The height is called "distribution height".** Ceiling height stays out of
  the model entirely unless something genuinely needs it later.
- **Run extras need no sheet awareness.** A run already belongs to a sheet, and
  a riser is traced as separate runs per sheet — which is how it would be
  estimated by hand anyway. No new work.
- **Elevations stored in inches, displayed in feet and inches.**
- **No per-area heights.** Per-run override is enough; per-area is a demo
  feature that gets used twice.
- **The double-count rule goes in the CODE**, not only in this document.
- **The run end device type is picked by the user, never guessed** from a nearby
  stamp.
- **A vertical belongs to the GROUP, not each stamp.** Thirty receptacles in a
  room share one height, and storing it thirty times is thirty places for it to
  disagree with itself.
- **The run breakdown stays long.** Five or six rows per run is the honest
  version and it is not to be shortened to save space — the estimator has to see
  where every foot came from. It gets designed properly when Phase 5 arrives,
  never compressed to fit.

### 7.1 Which allowance applies to verticals — and why they differ

Answered 2026-09-17. **The split tracks WHY each number exists, not where the
footage came from.** That distinction is the whole point and is the thing most
likely to be "simplified" away by someone who sees two percentages and assumes
they are the same idea applied twice.

**CONDUIT allowance — traced length ONLY.** It exists to cover _route
uncertainty_: the jog around a duct, the offset that was not on the plan. A drop
from a known distribution height to a known mounting height contains none of
that. It is arithmetic between two numbers the estimator typed. Adding a
percentage to it is putting a fudge factor on a measurement that is not fuzzy.

**WIRE allowance — EVERYTHING, verticals included.** A different reason, which
is why it gets a different answer. Wire allowance is not only route uncertainty
— it is **wire consumed by bends and offsets**, and a drop is full of them: the
90 at the top, the offset into the box. Those eat wire whether or not the
vertical distance is known exactly.

**This also preserves the rule that wire always exceeds conduit** (§ 2.3), and
now for a reason visible in the maths rather than merely asserted in a default.

**Do not collapse these into one percentage applied to one total.** They measure
two different things that happen to share a unit.

## 8. Still open

- **How far should sharp zoom go?** Re-rendering at high zoom costs render time
  on dense sheets (0.5–13s). There is a real trade between "sharp at 800%" and
  "instant". Suggested: sharp to ~400%, stretch beyond. Needs a look at a real
  E-sheet. **A Phase 1 decision, and the only question still open.**
- **How far should sharp zoom go?** — see above. The only question left open,
  and it is a Phase 1 decision to be made against a real E-sheet.
