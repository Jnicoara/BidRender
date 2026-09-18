# Plan viewer overhaul — the plan

Written 2026-09-17. **Phases 1, 1a, 2 and 3 are shipped; everything else is
still plan.** This is the agreed shape of the work, the order it happens in, and
the decisions already made, so that none of it has to be re-derived in six weeks.

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

| Phase  | What                                                     | DB change                |
| ------ | -------------------------------------------------------- | ------------------------ |
| **1**  | ~~Zoom, pan, and the three viewer bugs~~ **shipped**     | No                       |
| **1a** | ~~Page-flip fit bug + tool discoverability~~ **shipped** | **No**                   |
| **2**  | ~~Two-point scale calibration~~ **shipped**              | No (reuses `scaleRatio`) |
| **3**  | ~~Sharp re-render of the visible area~~ **shipped**      | **No**                   |
| **4**  | The layout: full screen, top toolbar, collapsing panels  | **No**                   |
| **4b** | Measure-only tool                                        | **No**                   |
| **5**  | **Verticals on runs — the money phase**                  | **Yes**                  |
| **6**  | Three levels of effort                                   | **Yes** — groups         |
| **7**  | Run settings: allowances, materials, sizes, ground       | **Yes**                  |
| **8**  | **Verticals on stamps**                                  | **Yes** (small)          |
| **9**  | Editing runs: drag a vertex, insert/remove points        | No                       |
| **10** | AI reader tiling, and the daily-limit question with it   | No                       |
| **11** | Tablet and touch                                         | No                       |

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

## 4b. Phase 3 — sharp re-render. BUILT 2026-09-17

### How it works

Two things are happening, and keeping them apart is the whole design.

**Display zoom** is a CSS stretch of a picture already drawn. Instant, free, and
soft once magnified past the resolution that picture was drawn at. That is all
Phase 1 shipped, and why 260% is already too blurry to read a callout.

**Render resolution** is what the worker actually rasterises at. Sharp at any
magnification, and it costs real time.

**The design: stretch while moving, re-render sharp once still.** The user never
waits for a zoom, and never stays blurry. The old PlanPanel had only the stretch
half, which is exactly why zooming into it went soft.

### Whole-page re-rendering does not work, and the numbers say so

For the 36×24 E-sheet tested. **"Sharp to" depends on the screen**, because
device pixels per bitmap pixel = zoom × devicePixelRatio — so a Retina or 4K
laptop, where DPR is 2, needs twice the render scale for the same zoom. The
table below gives both, and the DPR-2 column is the one to design against,
because that is what the measuring machine had and what most new laptops have.

| Render scale | Sharp to (DPR 1) | Sharp to (DPR 2) | Bitmap RAM |
| ------------ | ---------------- | ---------------- | ---------- |
| 1.5× (today) | 100%             | **50%**          | 38 MB      |
| 3×           | 200%             | 100%             | 154 MB     |
| 4×           | 267%             | 133%             | **273 MB** |
| 6×           | 400%             | **200%**         | **615 MB** |
| 7×           | 467%             | 233%             | **837 MB** |
| 8×           | —                | —                | **fails**  |

Sharpness at 400% on an ordinary screen costs 615 MB **for one page**, on a
laptop with a plan set open — and on a DPR-2 screen 400% is not reachable at
all, because the scale it would need does not allocate. **So it must render the
VISIBLE REGION only** — bounded by the viewport at roughly 26 MB whatever the
magnification, instead of growing with the square of the zoom.

pdf.js does this with `viewport.clone({ offsetX, offsetY })` onto a
viewport-sized canvas: the page is drawn at the high scale but translated so
only the wanted region lands on the bitmap.

### Render time: MEASURED 2026-09-17, and the answer is not what the plan assumed

**Step 1 is done.** The worker's `elapsed` is no longer discarded — every render
now logs its page, scale, pixel size and megabytes to the console — and a
dev-only `__planBench()` hook renders the current page at a ladder of scales.

Measured on **Old Blueridge school.pdf, sheet 5 (E1.3)** — a real dense
electrical floor plan, 36×24 in, on a DPR-2 screen with a GPU-accelerated
Chrome. Milliseconds are wall time from asking the worker to a pixel being
readable back, which forces Chrome to actually finish drawing.

| scale | pixels      | Mpx   | MB  | ms    |
| ----- | ----------- | ----- | --- | ----- |
| 0.25  | 648×432     | 0.3   | 1   | 684   |
| 0.5   | 1296×864    | 1.1   | 4   | 547   |
| 1     | 2592×1728   | 4.5   | 17  | 531   |
| 1.5   | 3888×2592   | 10.1  | 38  | 568   |
| 2     | 5184×3456   | 17.9  | 68  | 608   |
| 2.2   | 5703×3802   | 21.7  | 83  | 187   |
| 2.5   | 6480×4320   | 28.0  | 107 | 195   |
| 3     | 7776×5184   | 40.3  | 154 | 235   |
| 4     | 10368×6912  | 71.7  | 273 | 305   |
| 5     | 12960×8640  | 112.0 | 427 | 491   |
| 6     | 15552×10368 | 161.2 | 615 | 757   |
| 6.4   | 16589×11060 | 183.5 | 700 | 1656  |
| 7     | 18144×12096 | 219.5 | 837 | 2436  |
| 8     | 20736×13824 | —     | —   | FAILS |

#### 1. Time barely depends on resolution — and below 5200px it gets WORSE

A 648×432 canvas takes **684ms**. A 6480×4320 canvas — **93 times the pixels** —
takes **195ms**. That is not a warm-up artefact: the ladder was run ascending,
descending, and with repeats, and the cliff sits in the same place every time,
between 5184px and 5703px wide.

The cause is Chrome's GPU-accelerated canvas. Below roughly 5200px a side the
canvas is GPU-backed and `page.render()` pays a fixed **~500–680ms** of overhead
that has nothing to do with the drawing. Above it Chrome gives up on
acceleration and rasterises in software, which for a sparse line drawing is
~**40ms to issue the commands plus ~4.3ms per megapixel**. Canvas allocation
itself is free at every size (15ms at 15552×10368), so the cost is genuinely
inside `page.render()`.

**`RENDER_SCALE = 1.5` sits in the slow zone.** Today every page flip pays about
550ms of pure GPU-canvas overhead for a picture that is already too soft.

#### 2. Parsing is paid once per page, then cached

Cold first render of each sheet at 1.5× (straight from the sheet list): 1849ms,
1155ms, 1045ms, 951ms, 862ms. Warm re-render of the same sheet at 1.5×: ~570ms.
So **parsing the content stream costs roughly 300–600ms, once per page**, and
pdf.js keeps the operator list afterwards. Sheet 1's extra second is the
document opening, not the sheet.

This is the question § 4b said had to be answered before the design could be
chosen, and the answer is: **the parse is a one-time cost per page, not a
per-render one.** Repeated region renders of a page the user is already looking
at do NOT re-pay it.

#### 3. So region rendering is NOT primarily a speed optimisation

Extrapolating the software path at ~4.3ms/Mpx, a viewport-sized region on this
screen (1600×1000 CSS → 3200×2000 device → 6.4 Mpx) costs about **30ms of
rasterising plus ~40ms of issuing — under 100ms** — and about **26MB**.

Against 757ms and 615MB for the whole page at 6×. The time saving is real but it
is not the argument. **The argument is memory and the allocation ceiling**, and
those are hard walls rather than slow paths.

#### 4. The ceiling is real, and whole-page rendering cannot reach the zoom the user already uses

8× fails cleanly — `createImageBitmap ... could not be allocated` — at
20736×13824. 7× works, at 837MB and 2.4 seconds. So the wall is somewhere near a
gigabyte of bitmap, and the last usable rung is slow enough to feel broken.

Now put that against sharpness. The canvas is displayed at its own pixel size in
CSS pixels, so device pixels per bitmap pixel = **zoom × devicePixelRatio**. The
picture is 1:1 only while that product is ≤ 1. On the DPR-2 screen measured, at
`RENDER_SCALE = 1.5`:

- sharp at 100% zoom needs **3×** — 154MB, fine
- sharp at 200% zoom needs **6×** — 615MB, the last comfortable rung
- sharp at **260%** — the zoom that was reported as too soft — needs **7.8×**,
  which **does not allocate**
- sharp at 400% needs 12×, which is not close to possible

**Whole-page re-rendering cannot reach the sharpness that was already asked
for.** That is a stronger proof than the memory table in the section above, and
it settles the design: the region is not an optimisation, it is the only way to
get there.

#### 5. What must NOT be concluded from this

**Do not build anything that depends on "bigger renders are faster."** That is
one machine, one GPU, one Chrome build, and the threshold is a driver decision.
On a laptop with acceleration blocklisted the software path would be used
everywhere and the ordinary shape returns — 1.5× fast, 6× slow. The safe reading
is the one that holds either way:

> In the range this feature cares about, **time is not the binding constraint.
> Memory and the allocation ceiling are.**

Raising `RENDER_SCALE` past the GPU threshold looks like a free win on this
machine — sharper AND three times faster — but it would cost 107MB per page
instead of 38MB, and it would be a pessimisation on any machine already using
the software path. **Not a change to make on one measurement.** Worth re-testing
on the real work laptop before it is considered.

### Panning

Panning changes the visible region exactly as zooming does, so it uses the same
path: the stretched bitmap moves instantly, and a new sharp region is requested
once movement stops.

**Render the viewport plus a margin**, so a small nudge is already covered and
does not trigger a fresh render. A render is only requested when the view leaves
what the current bitmap covers.

**Requests must be cancellable and coalesced.** A drag produces a stream of
positions, and every one of them starting a 3-second render would queue a minute
of work for a view nobody is looking at any more. Latest-wins, with a settle
delay.

Built exactly that way — `REGION_SETTLE_MS = 150` in `planView.ts`, and
`regionStillGood` on top of it so that even after the delay a view still inside
the margin asks for nothing. Ten zoom steps in a row produced **one** render.

### This IS the AI tiling machinery — BUILT 2026-09-17

Phase 10 needs exactly this: render a region of a page at high resolution.
Tiling a sheet for the reader is the same call in a loop with different
rectangles.

**So the worker's contract IS a REGION, not a viewport** — done, as step 2:

```
Main → Worker   { type: "render", pageNum, scale, hash, reqId, rect? }
Worker → Main   { type: "rendered", reqId, pageNum, hash, bitmap,
                  scale, rect, pageWidth, pageHeight, elapsed }
```

`rect` is `{x, y, width, height}` in page points, origin at the page's
top-left — the same space `PagePoint` uses. Omitting it means the whole sheet,
so every existing caller kept working untouched. The viewer asks for the part
someone is looking at; the tiler will ask for a grid of rectangles on the same
page. **Neither is special, and the worker knows about neither.** It was
tempting to teach it about "the current view"; that would have made it useless
to the tiler and forced the work to be written twice.

The maths lives in `shared/planRegion.ts` — pure, with 18 tests in
`server/planRegion.test.ts` (in `server/` because `shared/**` is not in the
vitest include list, so a test written beside the source would never run).

#### The scale travels with the bitmap, and that is not decoration

The worker returns the scale and rect it ACTUALLY used, which is not always
what was asked for:

- the rect is trimmed to the page, so a pan past the edge does not render blank
  paper — and an entirely off-page rect is refused rather than drawn;
- the scale is reduced if the bitmap would exceed `MAX_REGION_PIXELS`
  (96 Mpx / ~366 MB). It **degrades rather than refuses**, because a slightly
  softer drawing beats an error where a drawing should be — and it says so
  loudly in the console when it happens, per § 5a.

`RENDER_SCALE` is no longer read by anything that converts between canvas
pixels and page points. `PlanPane` keeps `drawnScale` beside the canvas, the
outer page keeps `pageCanvasScale` beside `pageCanvas`, and **both
`snapshotPage` call sites now read those.** The hazard flagged in Phase 1 is
closed: there is no longer a constant anyone has to keep in step by hand.

#### Verified against a real sheet, not just asserted

Region renders were compared pixel-for-pixel against the same rectangle cropped
out of a full-page render of the same sheet:

| case                       | result                                  |
| -------------------------- | --------------------------------------- |
| middle of the sheet, 2x    | 21,918 ink pixels, **0 mismatched**     |
| top-left corner, 3x        | 22,903 ink pixels, **0 mismatched**     |
| bottom-right corner, 3x    | 65,925 ink pixels, **0 mismatched**     |
| title block, 2.5x          | 79,753 ink pixels, **0 mismatched**     |
| running off the right edge | trimmed to 192pt wide, **0 mismatched** |
| entirely off the page      | refused, with a plain message           |

The corners matter: pdf.js viewports carry a y-flip, so an offset with the
wrong sign is invisible in the middle of a page and obvious at an edge.

At 7.8x a full-page comparison is impossible — the whole page at that scale
gets cut to 4.63x by the budget, which is the argument for this whole phase
restated as a fact. So that case was checked by rendering the same rectangle at
1.5x and 7.8x and correlating the two ink profiles: **0.844**, with mean ink
falling from 11.5 to 9.5 exactly as thinner-lines-at-higher-resolution
predicts. And it was looked at: fully legible specification text, against a
visibly soft page behind it.

**A screen-sized region at 7.8x took 83ms and 3198x1997 pixels (~24 MB).** The
whole page cannot be drawn at 7.8x at all.

#### What step 2 did NOT do

Nothing on screen changed. The viewer still asked for the whole sheet at
`RENDER_SCALE = 1.5`, because choosing the region and re-requesting it on
zoom/pan was step 3 — done below on the same day.

### Step 3 — the viewer uses it. DONE 2026-09-17

Four pieces, all on the viewer side, none of them in the worker.

**1. Which rectangle** — `visibleRegion` in `client/src/lib/planView.ts`. The
transform is `translate(x, y) scale(zoom)`, so a drawing point `p` lands at
`x + p * zoom`; reading that backwards and dividing by the scale the backdrop
was drawn at gives the visible span in page points. Grown by `REGION_MARGIN`
(0.15 of the visible extent on every side) so a nudge costs nothing. **It is
left unclamped deliberately** — the worker trims it, because a rect trimmed
twice against two different ideas of the page size is how a patch ends up a
line off at an edge.

**2. Which scale** — `sharpRenderScale`: `baseScale x zoom x devicePixelRatio`,
rounded UP to a 0.25 step so a one-notch zoom does not invalidate a good
bitmap. The DPR term is the whole of the original complaint: 260% on a DPR-2
screen wants 7.8x, which is the number § 4b measured as unreachable for a whole
page. `wantedRegion` returns null when that scale is not above the backdrop's
own — which is every fitted sheet, so a zoomed-out viewer asks for nothing at
all.

**3. Drawing it** — a second canvas, absolutely positioned **inside the same
single transform** as the backdrop and the trace overlay, with its CSS box given
in backdrop-canvas pixels: the returned rect in points times `drawnScale`. That
is what makes it land right under any zoom or pan without knowing about either.
Only its pixel DENSITY is higher, and that is the entire trick. The backdrop
stays underneath rather than being replaced, so there is never a blank hole.
DOM order is backdrop → patch → overlay, and the patch is `pointer-events-none`,
so clicks reach the trace layer exactly as before.

**4. Coalescing** — the settle delay, plus an identity check against the last
ask, plus effect-cleanup cancellation. There is no way to recall a render
already running in the worker and none is needed: an unwanted reply is closed
rather than shown, and the settle delay means asks do not arrive in a stream.

The scale the patch is positioned by is the one that came BACK, never the one
asked for. At a page corner the worker trims the rect and the patch has to sit
on the trimmed rectangle or it lands in the wrong place.

#### Measured live, 2026-09-17 — Old Blueridge school, sheets 4 and 5

| zoom | render scale | region      | bitmap    | MB  | ms  |
| ---- | ------------ | ----------- | --------- | --- | --- |
| 20%  | —            | none wanted | —         | —   | —   |
| 121% | 3.75x        | 600x456pt   | 2249x1709 | 15  | 34  |
| 151% | 4.75x        | 480x365pt   | 2279x1732 | 15  | 96  |
| 189% | 5.75x        | 384x292pt   | 2207x1677 | 14  | 74  |
| 224% | 6.75x        | 291x223pt   | 1968x1503 | 11  | 40  |
| 800% | 24x          | 91x69pt     | 2177x1654 | 14  | 43  |

**The cost does not move.** 11–15 MB and 25–96ms across the entire zoom range,
because the region shrinks exactly as fast as the resolution grows — the screen
does not get bigger when you zoom in. Against the whole-page numbers in the
table above: 6x alone is 615 MB and 757ms, and 8x does not allocate. **24x was
reached here for 14 MB.**

Checked at 800%: **one device pixel per bitmap pixel, exactly.** Sharp to the
limit of the glass at the maximum zoom the viewer allows.

#### What was verified in the running app, not just asserted

- **Sharp vs soft, same frame.** Hiding the patch at 189% and re-screenshotting
  gives the old blurry drawing in identical framing — so the patch is both
  doing the work and perfectly registered. No seam, no offset.
- **Panning** re-requests and re-lands; 49–60ms each.
- **A page flip drops the patch in the same commit as the page change.** A patch
  of sheet 5 over sheet 4 reads as corrupted data rather than a stale bitmap,
  and a flip is exactly when a render is most likely to be in flight. Every
  request carries the sheet it was made for.
- **Zooming back out removes it** and frees the bitmap, rather than leaving a
  sharp rectangle sitting on a fitted sheet.
- **At the sheet's top-left corner** the worker trimmed the rect to `0,0` and
  the patch sat on the corner with the border lines unbroken.
- **The overlay's on-screen rectangle still equals the backdrop's exactly** at
  every zoom tested. That is the invariant every traced length depends on, and
  this phase does not touch it: the overlay still reads `drawnScale`, which is
  still the backdrop's.
- No `CUT TO` warnings — nothing came near `MAX_REGION_PIXELS`, as intended.

23 new tests (17 in `planView.test.ts`, 6 for `containsRegion`). `pnpm check`
clean; suite at the known baseline of 26 failures / 3 files.

#### What step 3 did NOT do

`RENDER_SCALE` stays at 1.5. Raising it looks free on a machine whose Chrome
hands big canvases to the software rasteriser — sharper AND three times faster
— but it costs 107 MB a page instead of 38 MB and is a pessimisation anywhere
without that behaviour. Unchanged, per § 4b point 5.

Nothing prefetches. A region is asked for when the view settles, not before, so
moving to a new part of a sheet is a stretch followed by a sharpen rather than
an instantly-sharp arrival. Worth revisiting only if it is ever actually felt.

### snapshotPage — DONE in step 2

Flagged in Phase 1 (`TakeoffPage.tsx`, the `renderScale` note), scheduled here,
and closed on 2026-09-17.

`snapshotPage(canvas, renderScale)` is called in **two places** — `runReader`
and the co-pilot's `onAsk` — and both passed the constant. It divides
`canvas.width` by that scale to report the page's size in points, so the moment
resolution stopped being fixed a stale constant would have told the reader the
wrong size for the image it was given, and **every proposed stamp would land in
the wrong place.**

Both now pass `pageCanvasScale.current`, which is written by the same callback
that stores the canvas — the scale and the picture it describes cannot be set
apart. The overlay's `renderScale` reads `drawnScale`, set from the render that
produced the bitmap.

**The rule that made this safe is the one to keep:** the scale a bitmap was
rendered at travels WITH the bitmap, so the two cannot disagree. A constant kept
in step by hand is the bug waiting to happen, and this one had already been
noted twice before it was fixed.

## 4a. Phase 4 — the layout. PROPOSAL, not yet approved

**The whole point of this phase is that the drawing gets much bigger.**
Everything below serves that and nothing else.

### What it is today, measured

|                      | Pixels        | Share of a 1536×791 screen |
| -------------------- | ------------- | -------------------------- |
| Whole window         | 1536 × 791    | 100%                       |
| **Drawing viewport** | **827 × 646** | **44%**                    |

The drawing — the reason the screen exists — gets **under half the screen**,
with a 240px document column on the left, a 400px work pane on the right, a
pager row, and a tool bar along the bottom.

**With both side panels collapsed and the tools in one top bar: 1472 × 681,
83% of the screen — 88% more drawing.** That is the prize.

### The shape

```
┌──────────────────────────────────────────────────────────────┐
│ ← Bid   [E1.01 ▾] ‹ ›   tools…            zoom   scale   ⇤ ⇥ │  one top bar
├───────┬──────────────────────────────────────────────┬───────┤
│ sheets│                                              │ work  │
│ (◂)   │              THE DRAWING                     │ (▸)   │
│       │                                              │       │
└───────┴──────────────────────────────────────────────┴───────┘
```

**One top bar, replacing the pager row AND the bottom bar.** Tools where the
old tool had them. Removing the bottom bar alone gives back 41px of height
across the full width, and it is the bar that was clipping.

### The sheet list stays on the LEFT, and here is why

Moving it to the top was considered and rejected. Sheet names are long —
`E1.01 POWER PLAN — LEVEL 2` — so horizontal chips either truncate to
uselessness or eat the width the tools need. A 40-sheet set scrolled sideways
is worse than the same set scrolled down, and a vertical list shows fifteen
names at once where a horizontal strip shows four.

**So: keep it vertical and collapsible, and make it unnecessary to keep open.**
The top bar always carries a **sheet chip** — current sheet name, prev/next
arrows, and a click that drops the full list down. Collapsing the panel
therefore costs nothing: the sheet you are on is always named, and moving one
sheet either way is always one click.

**Plus a thumbnail grid** behind that chip, for "which sheet had the panel
schedule on it" — the question a list of names answers badly and a page of
pictures answers instantly. The deleted PlanPanel had this and it was right.

**The thumbnails must be big enough to recognise a sheet by its SHAPE.** On a
40-sheet set the names all blur together — `E2.01 POWER PLAN — LEVEL 2` against
`E2.02 POWER PLAN — LEVEL 3` — but a panel schedule looks nothing like a floor
plan, and a riser diagram looks like neither. Shape is what people actually
navigate by, so a postage-stamp grid would waste the whole idea. Fewer, larger
thumbnails beat more, smaller ones.

### Collapsing

**A chevron tab on each panel's inner edge**, always visible, pointing the way
it will move. Not a menu item, not a keyboard-only affordance: the control has
to be on the thing it controls, or nobody finds it.

State is remembered per user. Collapsing is the common case on a laptop, so it
must not need redoing every time a bid opens.

**A NEW user starts with both panels OPEN.** Remembering the choice is right;
defaulting to the collapsed end of it is not. Someone seeing this screen for the
first time has to be shown what is there before they can decide to hide it, and
a first impression of a bare drawing with two chevrons teaches nothing about
sheets, layers, the legend or the counted-items list. Hiding is a thing you
learn once you know what you are hiding.

### The no-scale notice becomes a status chip

Out of the drawing entirely, into the top bar beside the zoom: either the scale
itself (`1/4" = 1'-0"`) or **`No scale` with a `Set scale` button right next to
it**. Status and its remedy in the same place, permanently, rather than a panel
that appears over the work and has to be dismissed.

### Focus mode: yes, and it is one key

Both panels collapsed, top bar only. Worth having as its OWN control rather
than "collapse two things", because mid-takeoff the point is to get maximum
drawing without hunting for two separate chevrons — and to get it all back the
same way. One key on, same key off.

### Not in this phase

Sharp re-render is Phase 3 and lands first. Tablet and touch stay at Phase 11 —
this is laptop and desktop only.

## 4c. Typed-length runs — draw the path, type the length

**Proposed 2026-09-17. Recommended as Phase 3a, and it may deserve to jump the
queue — see below.**

Draw the polyline to show WHERE the conduit goes, then type `60 ft` because you
know the pull. The line records the route; the number comes from the estimator,
not the geometry.

### Why this matters more than it sounds

Today a sheet with no usable scale means **conduit cannot be counted at all**,
and that is not an edge case:

- **Riser diagrams** — never to scale, and full of conduit.
- **Detail blow-ups** — drawn at a different scale from the sheet around them,
  so the sheet's own ratio measures them wrong.
- **A homerun** where the plan shows the path and the estimator knows the length.
- **One-line diagrams.**

Calibration (Phase 2) fixes a sheet whose scale is merely _unstated_. It cannot
fix a sheet that **has no single scale**, and a riser never will.

### What it takes

**One nullable column**, `takeoff_runs.typedLengthInches`. Null means "measured
from the points", which is today's behaviour and needs no backfill. Non-null
means the estimator supplied it and the geometry is decoration.

This is necessary rather than avoidable: `lengthInches` is documented as
_"Cached from the points at save time. Recomputed on read"_, so a typed value
stored there would be silently overwritten the next time anything recalculated.

**`shared/takeoffQuantities.ts`** — `runFeet` returns the typed length when
there is one, without consulting the ratio. Everything downstream (conduit,
cable, wire per conductor, allowances, verticals) is unchanged, because they all
take a length and do not care where it came from.

**The gate changes meaning, and this is the real win.** Tracing is currently
disabled outright on an unscaled sheet. It becomes available with the condition
attached: _you can draw this, you will just have to type the length._ The tool
stops being absent and starts being conditional.

**UI**: after drawing, "or type the length" beside the measured figure; on an
existing run, the ability to switch. A typed run must be **visibly** typed
wherever its footage appears, for the same reason a short-span calibration is
marked — a number the estimator supplied and a number the app measured are
different kinds of fact and should not look identical.

### Where it belongs

**Phase 3a, sharing ONE migration with the short-span marker.** Both are small
nullable additions, and a migration needs a manual production step — so two of
them is two chances to forget, for no benefit.

**It may deserve to go first.** It is independent of the rendering work
entirely, it is mostly UI because the maths is maths being SKIPPED, and it
unblocks real work today. If the Phase 3 measurement comes back badly — if
parsing rather than painting is the cost, and region rendering saves little —
then Phase 3 needs rethinking and this is ready to go in the meantime.

## 4d. Photos and sketches as plans — IDEA ONLY, not scheduled

Let the uploader take a photo or an image, not only a PDF. A hand sketch, or a
phone photo of one: count lights and outlets on it, draw runs on it. Mostly
smaller residential work.

**The scale problem is already solved.** A sketch states no scale, but if the
estimator knows one wall is 12 feet they click it and everything measures.
That is Phase 2, built.

### The real catch: a photo is not flat

**A page shot at an angle does not have one scale.** Perspective makes the near
edge larger than the far edge, so calibrating on the left makes the right read
long. A flatbed scan is fine. A casual snapshot is not.

**And the span rating cannot catch this.** `assessSpan` rates how much a click
slip matters; it assumes a single linear mapping across the whole image, which
is exactly the assumption perspective breaks. A photo can produce a "good span"
calibration that is confidently wrong everywhere except where it was measured.

**But the VERIFY step would catch it**, and this is the argument for building
that first: calibrate on one known distance, then check against another
somewhere else on the image. On a flat scan the two agree. On an angled photo
they disagree, and by how much and in which direction says how badly it is
skewed. The feature the estimator wanted for confidence turns out to be the
detector for this.

So: flag an image that looks angled rather than measuring it silently, and lean
on verification rather than trying to judge the photo itself.

**Hand sketches are usually COUNTED rather than measured anyway**, which means a
useful first version could ship with counting only and measuring withheld until
verification exists.

### Can an angled photo be detected? Honestly: not reliably

Three approaches, and all of them fail in the cases this feature is for:

- **Find the page's four corners** and check for a rectangle rather than a
  trapezoid. Works for a whole sheet on a contrasting surface. Fails on a
  close-up of part of a plan, a sheet on a similar-coloured desk, or a sketch on
  a page with no clean border.
- **Find long straight lines and test whether parallels converge.** Convergence
  means perspective. But a hand sketch has no straight lines worth the name, and
  a real drawing legitimately contains converging lines — an isometric or a
  one-line diagram would trip it constantly.
- **EXIF.** Phones record their own orientation, not the angle to the subject.
  Useless here.

So a detector would be right most of the time on a number that **multiplies into
every measurement on the sheet** — which is the same shape as conduit fill
checking, and gets the same answer. **Do not build a detector that is usually
right.** 95% right is worse than absent once somebody starts trusting it.

**Instead: warn once, plainly, on every photo upload.** Something to the effect
of _measuring on a photo is only as good as how square the photo is; a scan is
fine, a snapshot taken at an angle will read long on one side._ One clear
sentence, every time, no cleverness.

**And lean on verification, which is a measurement rather than a guess.**
Calibrate on one known distance, check against another elsewhere in the image.
Flat scan: they agree. Angled photo: they disagree, and the size and direction
of the disagreement says how badly. The estimator performs it deliberately and
reads a real result, instead of the app guessing on their behalf.

### Formats, and the HEIC problem

**JPG and PNG are straightforward.** HEIC is not: iPhones shoot it by default
and Chrome, Firefox and Edge will not display it.

**The good news is that the common path already avoids it.** Picking a photo
through a file input on iOS Safari usually hands over a JPEG, because iOS
converts on the way out. HEIC mostly arrives when someone AirDrops the original
to a desktop and uploads it from there.

**So v1: detect HEIC and refuse it precisely.** Sniff the magic bytes
(`ftypheic`, `ftypheix`, `ftypmif1`) rather than trusting the extension, and say
exactly what to do — open it and share as JPEG, or set Settings → Camera →
Formats → Most Compatible. A named problem with a named fix beats a file that
uploads and then will not display.

**Converting HEIC server-side is the piece most likely to cost more than it is
worth.** Native `libheif` is a deployment dependency on a platform where the
build is already delicate; a wasm decoder avoids that but is slow and wants the
whole image in memory, which runs straight into the rule that nothing on the
file path may buffer a whole file. Worth revisiting only if refusal turns out to
be a real irritation in practice.

### The four questions, for both ideas

**1. Where in the order?**

- **Typed-length runs: Phase 3a**, possibly jumping ahead — see § 4c.
- **Photos: Phase 12, after touch.** It is a new INPUT type, and the viewer it
  would be viewed in is still being rebuilt. Adding a second kind of document
  mid-rebuild means doing the layout, the rendering and the tiling work twice.

**2. Database changes?**

- **Typed lengths: yes** — one nullable `takeoff_runs.typedLengthInches`.
- **Photos: yes, but small** — one column on `bid_pdfs` saying what kind of
  document it is. Everything else is untouched, which is the next answer.

**3. Does an image share the sheet and stamp model? YES, and not as a fudge.**

The model already fits, because nothing downstream knows what a "page point"
physically is. For a PDF it happens to be 1/72 inch of paper. For an image it
can simply be one image pixel — and **calibration establishes the ratio
empirically either way**, which is exactly what it was built to do.

So an image is a one-page document. `bid_pdf_sheets`, `takeoff_stamps` and
`takeoff_runs` are unchanged, and every tool built for PDFs works on it. Only
two things differ, and both are at the very bottom:

- **Rendering** — decode an image instead of asking pdf.js for a page.
- **Scale detection from text** — does not apply, and falls straight through to
  "no scale set", which is already a handled state.

**One path is the honest answer here, not the convenient one.**

**The table stays called `bid_pdfs`.** It will hold images too, and renaming it
is churn on a table referenced by every stamp and run — the same reasoning that
keeps the `/manus-storage` route. Noted so nobody later "tidies" it.

**4. What is a bad idea, said now**

- **Automatic perspective correction — no.** De-skewing a photo is a real
  computer-vision problem, and a half-corrected image is worse than an
  uncorrected one the user was warned about, because the warning stops applying.
- **HEIC conversion in v1 — no**, per above.
- **Measuring on photos in v1 — hold it back.** Counting is safe and is most of
  the value for a sketch. Measuring should wait for verification to exist, so
  there is a way to find out whether the image is flat.
- **On typed lengths, one real hazard:** the drawn line becomes decoration, and
  `lengthInches` is documented as recomputed on read. Something will eventually
  "helpfully" recompute a typed run from its geometry and silently replace a
  number the estimator typed. **That must be guarded in the code, not only
  here** — a test that fails if a typed length is ever overwritten.
- **And typed runs must look different from measured ones** wherever their
  footage appears. A number the estimator supplied and a number the app measured
  are different kinds of fact.

## 5a. MEASURE HONEST, PAD VISIBLY

**The governing rule for every number this screen produces.** Decided
2026-09-17. It is short, and it is not negotiable.

**Nothing in the measuring path may be biased in the estimator's favour.** Not
the calibration, not a traced length, not a vertical, not a rounding. A
measurement reports what it measured.

**All padding is explicit, named, and adjustable** — the conduit and wire
allowances, makeup, the verticals. Every one of them appears as its own line in
the run breakdown (§ 2.4), and every one can be turned up by an estimator who
wants to be conservative on a particular job.

### Why this is a rule and not a preference

The tempting version is a small safety margin somewhere in the measuring —
calibration rounding a span slightly long "to be safe", a length rounding up to
the next foot. It feels prudent and it is corrosive:

- **It inflates every measurement on the sheet by an amount the estimator
  cannot see**, cannot inspect, and cannot dial back.
- It is **a fudge factor buried where nobody would look for it**. On a big job
  it loses a bid for a reason that cannot be found afterwards.
- It **double-counts against the allowances**, which already exist to cover
  exactly this and do it in the open.

**The codebase already carries this rule in one place**, and the reasoning
generalises exactly — `toBillableFeet` in `shared/takeoffGeometry.ts`:

> _"Deliberately NOT rounded up to a whole foot here. Waste and rounding are a
> pricing decision, and inventing them inside a measuring function would make
> the same run price differently depending on where it was rounded."_

### What to do instead when unsure: say so, loudly

**Uncertainty shown beats uncertainty hidden.** Where the app cannot be
confident, it says so plainly and lets the estimator decide, rather than
quietly leaning one way:

- A **short calibration span** is called out with the error it implies (§ 5b).
- A calibrated result that lands **well off any standard scale** should say so —
  it may be right, and it may mean the sheet was scaled in printing or the
  wrong dimension was clicked.
- A **sheet marked not-to-scale** refuses rather than measuring anyway.

**Pushing toward a longer calibration span is not a violation of this rule** —
it is free accuracy with no bias in it, which is exactly the distinction. Better
input, not a thumb on the scale.

## 5b. The calibration span warning

Accuracy is governed by the SPAN calibrated over, not by how carefully the
clicks were made — see § 4.2 for the arithmetic. `shared/planCalibration.ts`
rates a span by the error it implies rather than by an arbitrary length:

| Rating     | Implied error | What it says                                        |
| ---------- | ------------- | --------------------------------------------------- |
| **good**   | under 1%      | A small slip barely moves the scale                 |
| **usable** | 1–3%          | Longer would be steadier; zoom in before each click |
| **short**  | over 3%       | A slip moves EVERY measurement on this sheet        |

**A calibrated ratio is never rounded to the nearest architect's scale.** A real
sheet lands on something like `1:97.3`, and rounding it to `1/8" = 1'-0"` would
throw away the accuracy just bought while looking more authoritative than the
honest number. `formatRatio` already falls back to `1:nnn` for this.

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
