# Plan viewer overhaul — the plan

Written 2026-09-17. **Phases 1, 1a, 2, 3 and 4 are shipped; everything else is
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

| Phase   | What                                                                       | DB change                |
| ------- | -------------------------------------------------------------------------- | ------------------------ |
| **1**   | ~~Zoom, pan, and the three viewer bugs~~ **shipped**                       | No                       |
| **1a**  | ~~Page-flip fit bug + tool discoverability~~ **shipped**                   | **No**                   |
| **2**   | ~~Two-point scale calibration~~ **shipped**                                | No (reuses `scaleRatio`) |
| **3**   | ~~Sharp re-render of the visible area~~ **shipped**                        | **No**                   |
| **4**   | ~~The layout: top bar, collapsing panels, focus mode~~ **shipped**         | **No**                   |
| **4b**  | Measure-only tool                                                          | **No**                   |
| **5**   | **Verticals on runs — the money phase**                                    | **Yes**                  |
| **6**   | Three levels of effort                                                     | **Yes** — groups         |
| **7**   | Run settings: allowances, materials, sizes, ground                         | **Yes**                  |
| **8**   | **Verticals on stamps**                                                    | **Yes** (small)          |
| **9**   | Editing runs: drag a vertex, insert/remove points                          | No                       |
| **9a**  | **AI-assisted legend capture** — see § 9, and § 9.6 for why it precedes 10 | **Yes** (small)          |
| **10**  | AI reader tiling, and the daily-limit question with it — **gated on § 15** | No                       |
| **10b** | **AI-suggested known distances for calibration** — see § 13                | No                       |
| **11**  | Tablet and touch                                                           | No                       |

> **Phase 10 is gated.** Nobody has measured whether the reader counts
> accurately at the detail level it is priced at. § 15 specifies the bake-off
> that settles it and what it costs to run. It is an afternoon, and tiling is
> the biggest build on this list.

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

### Step 4 — the patch was still soft, and the reason was the rounding. FIXED 2026-09-17

Step 3 shipped and the sheet was tested at 150% on a real machine. The verdict
was **"better, but still pretty fuzzy"** — which was right, and the cause was in
this file's own arithmetic rather than anywhere exotic.

**Measured in the running app at 97% zoom on the DPR-2 screen: the sharp patch
was being displayed at 1.0335 bitmap pixels per device pixel.** Not one. The
browser was resampling every line on it down by 3.4%, and a one-pixel hairline
resampled by any amount is a grey smear.

Two causes, both of them halves of the same mistake — _close to 1:1 is not 1:1_.

**1. `SHARP_SCALE_STEP` rounded the render scale UP to a 0.25 step.** It was
written to stop a one-notch wheel zoom throwing away a good bitmap, and the
rounding direction was chosen so the picture could never be coarser than asked
for. The unexamined half is that **denser is not better**: 97% zoom wants 2.91x,
the step gave 3.0x, and the surplus resolution has to be squeezed away at
composite time. Worst case at the bottom of a step is 8% of squeeze.

So the scale is exact now (`sharpRenderScale` returns `base x zoom x dpr` and
nothing else), and `regionStillGood` compares scales **two-sided** against
`SHARP_SCALE_TOLERANCE` — an over-dense bitmap is refused exactly as an
under-dense one is. The cost is one extra region render per settle, which is
25–96ms measured; the thing it buys is the whole point of the layer.

**2. The patch's edges landed between device pixels.** Even at a perfect scale,
a composited layer whose origin is at device x = 228.88 is resampled. Fixed by
snapping both the viewport transform and the patch's own offset to whole device
pixels (`snapToDevicePixel`), and by sizing the patch from the BITMAP rather
than from `rect x drawnScale` — the worker rounds a region's pixel size up to
whole pixels, so the two differ by up to one pixel, which is enough to make the
ratio 0.9995 instead of 1.

**Re-measured after the fix, same sheet, same machine: 1.0000 bitmap pixels per
device pixel, with the patch's edges within 0.02 of a device pixel of the grid.**
Specification text at 176% is clean-edged.

#### What this cost, and what to not conclude

`view.x` and `view.y` are **not** rounded — only the transform that draws them
is. Every measurement, every hit test and every stored point still reads the
exact value, so snapping cannot accumulate into drift. The visible shift is at
most half a screen pixel.

**Do not reintroduce a scale step as an optimisation.** It looks free and it is
not: it trades a render that costs 25–96ms, once, after the user has stopped
moving, for a drawing that is softly wrong the whole time they are reading it.
The settle delay and `regionStillGood`'s rectangle test are what keep the render
count down, and they still do.

#### How to check it yourself, in the console

Every render logs one line, prefixed `[plan]`. On a sheet at rest there are two
kinds:

```
[plan] page 1 whole page at 1.50x — 1252ms, 3888x2592 (10.1 Mpx, 38 MB)
[plan] page 1 region 750x570pt at 921,579 at 2.91x — 71ms, 2249x1709 (3.8 Mpx, 15 MB)
```

- **`whole page`** is the backdrop — one per sheet, at `RENDER_SCALE`. It is
  always there and says nothing about sharpness.
- **`region`** is the sharp patch. **If there is no `region` line after you zoom
  and stop, the patch never fired**, and the drawing you are looking at is the
  stretched backdrop.
- **`ASKED ... CUT TO ...`** on a region line means the answer came back too
  small — the budget refused the scale, and the line says how many times softer
  than the screen the patch therefore is.

"It never asked" and "it asked and the answer was too small" are different
lines, deliberately, because they have different causes and different fixes.

## 4a. Phase 4 — the layout. BUILT 2026-09-17

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

### BUILT 2026-09-17 — and measured

Everything above was proposed and is now shipped. What it actually did, on the
same 1536x791 screen the "what it is today" table was measured on:

| Arrangement          | Drawing viewport | Share of screen |
| -------------------- | ---------------- | --------------- |
| Before this phase    | 827 x 646        | 44%             |
| Both panels open     | 796 x 689        | 45%             |
| Work pane folded     | 1196 x 689       | 68%             |
| Both folded          | 1436 x 689       | 81%             |
| **Focus mode (`F`)** | **1436 x 750**   | **89%**         |

**Panels open is 45%, barely up from 44%, and that is expected** — the width
lost to the two chevron rails very nearly cancels the height won by deleting the
bottom bar. The phase was never about the open arrangement. It is about the
other four rows, which did not exist before, and about it costing one keystroke
to reach them.

**Focus mode also hides the bid header**, which is where the last 8% comes from.
Everything on that row is about the BID — its name, its materials list, adding
another plan — and none of it is reached mid-count.

#### What was built

- **One top bar**, replacing the pager row AND the bottom tool bar. Sheet chip
  with prev/next and a thumbnail grid, then the tools (Conduit, Cable, Stamp,
  Measure), then the scale chip and its remedy, the zoom cluster and the focus
  toggle. It wraps rather than clipping.
- **The zoom controls are PORTALED up from `PlanPane`**, the same trick the
  trace layer already uses for its own chrome. Only the pane knows the zoom;
  only the bar has the room. `controlsTarget` is null-safe, so the component
  still works on its own.
- **`SidePanel`** — the fold, the chevron on the inner edge, and the drag. The
  rail IS the resize handle, because it is already exactly where one belongs
  and a second 4px target beside it would be a target nobody can hit. The
  chevron sits at the top of the rail and stops the drag.
- **`SheetChip`** — the sheet you are on, one click either way, and a 3-column
  thumbnail grid behind the name. Thumbnails are drawn at 360px, which is 160
  CSS px at DPR 2, because the point is recognising a sheet by its SHAPE and a
  blurred shape is no shape. Verified on the 5-sheet Old Blueridge set: the
  three specification sheets and the two floor plans are told apart instantly.
- **`lib/takeoffPanels.ts`** — the arrangement as a pure module with 10 tests.
  Focus mode has to put the panels BACK the way they were, which means the
  remembered arrangement and the one on screen are different things; written
  inline that is four booleans that can disagree, and the way it fails is that a
  panel never comes back.
- **`react-resizable-panels` is no longer used on this screen.** Its percentage
  units and imperative collapse were more machinery than three flex children
  needed once collapsing was the point rather than dragging.

#### Thumbnails are rendered ONLY while the grid is open

The worker draws one thing at a time. A background pass over a 40-sheet set
would queue itself in front of the sharp patch for the sheet being read — the
drawing would go soft every time the sheet picker was opened, which is a strange
thing for a picker to do. `SheetChip` reports `onBrowsing`, the pane renders one
sheet at a time while that is true, and each picture appears as it arrives.

#### What was NOT built

**Tablet and touch stay at Phase 11.** The rails are 18px, which is a mouse
target, not a thumb target.

**The bid header is hidden in focus mode rather than folded into the top bar.**
Folding it in was considered: at 1536px the bar already carries eleven controls
and adding a bid name, Materials list and Add PDF would make it wrap on any
laptop. One keystroke removes it entirely, which is better than making it
smaller.

### 4a.1 What live testing of Phase 4 changed

Phase 4 went live and was used. Three things came back, and only one of them was
about the layout.

#### Panning is no longer pinned to the sheet's edge

**The clamp allowed no overshoot, and that made the corner of a zoomed drawing
unreadable.** The sheet's edge stayed flush against the pane, so the only place
a corner could ever sit was jammed against the edge of the glass — never in the
middle of the screen, which is the part anyone actually reads from.

`MIN_VISIBLE_FRACTION = 0.25` in `planView.ts`. The drawing may be pushed past
its own edges with empty ground showing, until only a quarter of the viewport's
width and a quarter of its height still have drawing on them. Measured live at
47% zoom: the stop lands at exactly 199 x 172 on a 796 x 689 viewport.

**Per AXIS, not by area** — an area rule at the same number would allow a
quarter of the width and a quarter of the height at once, which is six percent
of the screen in one corner. Per axis always leaves a band across a whole edge.

The pleasing part is that it is the same rule as before with one number changed:
`keep = viewport` reduces the arithmetic to exactly the old edge-pinned clamp.
Edge-pinning was never a separate rule. Fit still recentres, so there is always
a way home.

#### Things were cut off at the bottom of the window — three separate faults

Reported as the counted-items panel covering the drawing; it was nothing of the
kind. The standing rules that came out of it are in CLAUDE.md § Responsiveness
rule 4. What happened here:

1. **`RunsPanel` had an unconstrained flex child.** The legend slot sat between
   the scrolling list and the pinned totals with no `shrink-0` and no scroller,
   so it could never be shorter than its contents. Past a threshold it pushed
   the bid totals out of the window — cut in half, footage numbers gone, and
   nothing on screen saying there was more. The legend now lives inside the
   scroll region. One scroller, not two.

2. **`.tab-enter` slid the workspace pane down 6px.** The pane is exactly as
   tall as the container that clips it, so the slide moved its bottom past the
   clip. Worse than transient: caught in a backgrounded tab with `playState`
   "running", `currentTime` stuck at 0 and fill-mode `both` holding the FROM
   frame, the pane sat 6px low for as long as it was open. Opacity only now.

3. **`h-screen w-screen` on the shell.** The `100vh` hazard, pre-empted rather
   than suffered — see the rule. Now `h-dvh w-full`.

**The instrument mattered more than any one fix.** A detector that walks every
leaf element and flags text below the window with no scrollable ancestor was run
over all fourteen routes, at full height and with the shell squeezed to 480px.
It found the one screen that had the fault and cleared the other thirteen, which
is a far better answer than reading thirteen files.

#### Why it could not be reproduced locally

`DISABLE_AI_FEATURES=true` in a dev `.env` means the plan reader's panel is
absent, so the work pane is several hundred pixels shorter than a real user's
and the legend never got tall enough to push anything off. Written up in
CLAUDE.md § AI features, because the lesson generalises: **a local run renders a
smaller app than the live one, and "it looks right here" is weak evidence about
layout.**

#### The trade tool icons, third attempt

`Route` (two dots and an S-bend — a journey) and `Spline` (a bezier with control
handles — a drawing tool) both read as something other than what they arm.

Now `GitCommitHorizontal as ConduitIcon` — a straight line with a ring in the
middle, which is a run of pipe with a coupling on it — and `Cable as CableIcon`.

**Cable won on consistency rather than on the picture.** It is the same icon
already drawn beside every MC/Romex row in the counted-items list, so the tool
and the rows it produces finally say the same thing. `Shell`, a tight spiral,
is the better drawing of MC's spiral armour and was passed over for exactly that
reason: matching what is already on screen beat a cleverer picture that matched
nothing.

### 4a.2 The top bar, second pass — BUILT 2026-09-18

Three complaints from live use, all about the same bar, all fixed together.

**The scale warned twice and warned everywhere.** An amber "No scale" chip sat
next to a ScaleControl that said "Set scale" under a second warning triangle —
the same complaint, twice, in one bar, on every sheet without a scale. Including
specification and legend sheets, where there is nothing to measure at all.

Now there is **one chip**, and it is **plain grey until a measuring tool is
reached for**. Hovering, focusing or clicking a gated trace button raises it to
amber with its triangle, as does starting a calibration. The ScaleControl also
absorbed the not-to-scale note, so nothing was lost by deleting the second chip.

> **The principle, because it generalises past this bar:** a warning shown where
> there is no problem teaches people to skip warnings, including the one that
> matters. The scale is not a problem on a sheet nobody will measure — it is
> only a problem at the moment somebody tries.

**The disabled trace buttons could not deliver their own explanation, and
nobody had noticed for a whole phase.** They carried a `title` naming exactly
why they were off — and `disabled` brings `pointer-events: none` with it from
the button variants, which kills the tooltip along with the click. The reason
was written down and then made unreachable: no hover, no keyboard focus, no
response to a click.

They are `aria-disabled` now, so all three work, and clicking one says why in
words. **This matters more than a tooltip normally would**, because the quiet
scale chip above is only defensible if the explanation is genuinely available
somewhere — which it was assumed to be, and was not.

**Four tools in one row read as four peers, and they are three different
kinds.** Conduit and Cable measure distance, Stamp counts, and "Measure" set the
scale. The bar is now:

```
[ sheet ▾ ] │ [ Stamp ] │ [ Conduit ] [ Cable ] ⋯ [ Calibrate ] [ 1/4"=1'-0" ] │ zoom │ Focus
             └ counts ┘   └──── measure ────┘      └─ sets the scale ─┘
```

- **Stamp leads, alone.** It is the tool that always works, so on an unscaled
  sheet it should not have to be found among two dimmed buttons that do not.
- **A divider, and no words.** Group labels were specified and dropped: the bar
  already wraps on a narrow drawing pane, and wrapping is what pushed the scale
  control off the edge in the first place. On an unscaled sheet everything left
  of the divider is live and everything right of it is dimmed, which says the
  same thing for no width.
- **Calibrate moved to the right-hand group and was RENAMED from "Measure".**
  It does not measure anything — it sets the scale the other two measure
  against, so it belongs beside the scale chip it writes to. The rename is for
  the sake of **Phase 4b**, the measure-only tool, which needs that word
  honestly; two buttons both called some flavour of measure is the exact
  confusion this grouping exists to remove, so the word was handed over before
  it could be claimed.

**What only showed up in the running app, and the reason this got looked at
at all.** The regrouping typechecked, and it was wrong. Moved to the right-hand
group, Calibrate kept the `outline` variant it had worn among the tools — and
on that side every other control is borderless, so it became **the only bordered
button in the bar**. On a specifications sheet, with Conduit and Cable dimmed
and the scale chip deliberately grey, the loudest thing on screen was the button
that starts a calibration. **The nagging this whole change set out to remove,
arriving by a side door.** It is `ghost` now, at the weight of its neighbours.

The same look found a second fault: Calibrate was carrying `Ruler`, and so is
the scale chip immediately beside it. `Ruler` means THE SCALE everywhere in this
app — `SheetChip`, `SheetIndex`, `ScaleControl`, the materials list — so the two
controls sat two inches apart wearing the same glyph for different things.
Calibrate is `MoveHorizontal` now, a dimension line, which is what is actually
being clicked; `CalibrateLayer` changed with it so the button and the mode it
opens still agree.

> **Neither of these is visible in a diff, and both are obvious in a
> screenshot.** A layout change is not verified by `pnpm check`.

**And the two run icons are now DRAWN rather than picked.** § 4a.1 records three
rounds of choosing the nearest thing in lucide and is superseded by this: the
library has no picture of a length of conduit or of a cable with its conductors
showing, because outside this trade nobody needs one. `runIcons.tsx` draws both
on lucide's own grid — 24x24, stroke 2, round caps — so they carry the same
optical weight as `MapPin` and `Ruler` beside them.

Two things only showed up by rendering candidates at the real 14px, and both are
recorded in that file because neither is guessable from the path data:

- **Conduit needs pipe on BOTH sides of the coupling.** With the fitting on the
  very end, the two parallel lines become prongs and the icon reads as a PLUG
  going into a socket. A short tail past the coupling fixes it — and a coupling
  sits mid-run anyway, so the truthful picture is also the legible one.
- **Cable's jacket must be roughly twice the length of its conductors.** At
  similar lengths — the obvious proportions — it reads as a bowtie or a pair of
  scissors. A closed rounded rectangle for the jacket reads as a battery.

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

## 5c. THE APP SUGGESTS, THE ESTIMATOR CONFIRMS

**The governing rule for every AI feature this product will ever have.**
Decided 2026-09-17. It is short, and it is not negotiable.

**The AI does the work. The estimator makes every decision that has money
attached to it.** The app proposes; a person accepts. Never the other way
round.

A thing the model produced may sit on screen, be counted in a "found 47"
summary, be highlighted on the drawing and be one click from being real. What it
may never do is **arrive on the bid without somebody having said yes to it.**

### This is not new — it is the existing rule, extended

§ 5a governs measurement: nothing in the measuring path may be biased in the
estimator's favour, and all padding is explicit and adjustable. This is the same
principle one layer up, and the reader already obeys it in the one place it
exists so far. `shared/copilotConfidence.ts`:

> _"An illegible mark does not become a low-confidence proposal. It becomes a
> FLAG: this spot on the drawing needs your eyes, and nothing is proposed for
> it."_

and

> _"A wrong high-confidence proposal costs more than a missed one. A miss leaves
> the estimator counting a symbol by hand, which is what they do today; a false
> accept puts a quantity on a bid nobody checked."_

**That asymmetry is the whole rule.** Everything below is what it means for
features that do not exist yet.

### What it forbids, concretely

- **No auto-accept, at any confidence, ever.** Not "above 95% we just take it".
  A threshold that high is exactly where a mistake is least likely to be
  noticed, because everything around it was right.
- **No remembered answer applying itself to a new plan set.** See § 9 — this is
  the sharp edge of the whole legend feature, and it gets its own rule.
- **No silent re-reads changing a number that was already confirmed.** Once an
  estimator has said yes, the app has their answer, not its own.
- **No confidence tuned up to look better.** See § 10.3.
- **No hiding what the app was unsure about.** A reader that flags ten uncertain
  marks is more useful than one that confidently reports 47 when the answer is
  52, because the first one can be finished and the second one cannot be
  checked.

### What it costs, and why that is the right trade

It costs clicks. Twenty symbols captured from a legend is twenty confirmations,
and it is tempting to say the app should just get on with it for the ones it is
sure about.

**The clicks are the product.** What a contractor is buying is a number they can
stand behind in front of a customer. A count they did not agree to is a count
they cannot defend, and the first time one of those loses a job the tool is
finished — not because the AI was usually wrong, but because it was wrong once
and nothing on screen had ever asked.

So the design job is never "how do we skip the confirmation". It is **"how do we
make the confirmation take a second instead of a minute"** — a tap instead of a
drag, a batch instead of a queue, a yes/no instead of a form. § 9 is that idea
applied to the legend, and it is the shape every future AI feature here should
take.

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

**NEVER CALIBRATE OFF THE GRAPHIC SCALE BAR.** Decided 2026-09-18, and this one
is filed here because it is the single most likely thing in this document to be
undone by somebody being sensible.

The scale bar is the obvious answer. It is a ruler, printed on the drawing, by
the people who drew it, with no text to misread. Every instinct says use it.

**It is the worst candidate on the sheet, and the reason is arithmetic, not
taste.** A printed scale bar is one to two inches of paper. § 4.2: calibration
error comes from the SPAN, and § 5b rates a span that short at **over 3%
implied error** — where a slip of a few pixels moves every measurement on the
sheet. A 100 ft dimension string with the same slop is 0.4% wrong. **The scale
bar is ten times less accurate than the dimension string printed beside it**,
and it looks ten times more authoritative.

So: the bar may be used as a plausibility CHECK on a ratio calibrated from
something longer. It is never the span. Anyone proposing otherwise — including
a later version of whoever wrote this — should be shown § 5b's table first.

**THE TWO 150s ARE DIFFERENT COUNTERS AND MUST NEVER BE MERGED.** Decided
2026-09-18. Stated in full in § 14.1; repeated here because the coincidence of
the number is a trap and merging them will look like tidying up.

- **150 per person per DAY** (`shared/aiLimits.ts`) is a **safety brake**. It
  exists to stop a retry loop costing a thousand calls at 3am. It is keyed to
  the individual on purpose, so one runaway browser tab cannot stop a colleague
  working, and it is set generously because a limit people work around protects
  nothing.
- **150 per account per MONTH** is the **entitlement being sold** — the thing
  inside the $99, the thing a pack tops up, the thing a meter shows.

One is about loops, the other about money; one is per person, the other per
company; one resets nightly, the other monthly. **Merging them either lets a
five-estimator company read 750 sheets a month inside one $99 fee, or stops a
solo estimator at 150 a day when they had bought 500.** If the shared number is
confusing, change the brake's number. Never the price.

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

- **How far should sharp zoom go? — ANSWERED 2026-09-17, and the question turned
  out to be the wrong one.** It assumed sharpness gets more expensive with zoom,
  and asked where to stop paying. Region rendering removed the premise: the
  region shrinks exactly as fast as the resolution grows, so the cost is flat at
  11–15 MB and 25–96ms across the entire range (§ 4b). 24x was reached for 14 MB.
  **Sharp goes all the way to `MAX_ZOOM`, and there is nothing to trade.**
- **How precise does a legend match have to be before it is worth suggesting?**
  A design target is set in § 9.5 and the instrumentation to settle it is
  specified there, but the number itself cannot be decided from a chair — it
  needs real sets in front of a real estimator.
- **Does the reader actually count accurately at 150 px/in? — NOT MEASURED, and
  it gates Phase 10.** The cost of a sheet read is measured (§ 11.5); its worth
  is not. Specified as a bake-off in § 15. DECIDED 2026-09-18: run the SMALL
  version — 5 sheets, two levels, single runs, about $3 and two hours — and run
  it when Phase 10 is actually next, not before. The two hours are the cost, and
  the answer goes stale if the model or the detail level moves in between.
- **Should AI suggest the known distance for calibration?** Proposed in § 13 as
  Phase 10b, behind both legend capture and tiling, with the risk it carries and
  the four things about it that would be mistakes.

## 9. AI-assisted legend capture — PROPOSAL, Phase 9a

**Proposed 2026-09-17. Recommended as the NEXT AI work, ahead of tiling — see
§ 9.6, which argues against the order § 10 ranks them in.**

Open a legend sheet. The app outlines every symbol it can see, with the label it
read beside each one. You tap the ones you want. Twenty symbols becomes one
screen instead of twenty drag-a-box-and-type operations.

Governed by § 5c throughout: the app outlines, the estimator confirms.

### 9.1 Why this is the best-value AI work in the product

**A legend sheet is the easiest thing in a plan set for a model to read.**
Symbols are isolated, spaced out, drawn at a readable size, and each one has a
text label right beside it. That is the opposite of a dense floor plan, where
the same symbol is overlapped by homerun arcs, circuit tags, dimension strings
and wall hatching.

**Capturing a legend by hand is exactly the setup work that makes a new user
quit.** It is twenty repetitions of the same fiddly operation before the app has
produced a single number. Nothing else in the product has that shape.

**It is the biggest accuracy jump available downstream.** Once symbols are
linked, counting on a floor plan is matching a known shape rather than guessing
at a squiggle — and `shared/copilotConfidence.ts` makes this structural rather
than merely helpful: **an unlinked symbol can never reach `high` confidence, no
matter what the model says about it.** A reader run against an empty legend
produces a list of `low` findings by construction.

**It is paid once per plan set, not per sheet.** On the cost figures in § 11.4
that is roughly a cent, against roughly eighteen cents for every dense sheet the
reader looks at. There is no other AI feature here with that ratio.

### 9.2 What it does, in order

1. **Read the sheet's text layer first, with no model call at all.** `pageText`
   already exists in the worker. Where a set is a real vector PDF, that layer
   contains the legend's labels with positions: it turns "read the label" from a
   task with an error rate into a lookup, and it tells the model where to look,
   because a legend symbol sits beside its label. Costs nothing and cannot
   hallucinate.

   **MEASURED 2026-09-18, and this was my assumption rather than a fact.** Both
   real sets in `.local-storage` are SCANS — one image per page, 10800x7200 at
   300 dpi. `pine st` has no text layer at all. Old Blueridge has an OCR layer
   and it is about two-thirds right; verbatim from its legend sheet:

   ```
   DUEX|RECEPTACLE|QUTLET     CONTRIOL|RIEFERENCE     RETERE|SHaDe
   ```

   "DUEX RECEPTACLE QUTLET" matched against `symbolLinks.lookupKey` (§ 9.3
   Stage 1) finds nothing and falls straight through to the expensive stages.
   **Measured saving on both real sets: $0.**

   Still build it — it costs nothing and some sets will be clean. But it is an
   accelerator, never a dependency, and it is **not a line item in a cost plan**.
   Everything below has to work as though the text layer were absent, because on
   the evidence available it usually is.

2. **Ask the model for boxes.** One call per legend region, on a region render
   (§ 4b) at a scale where the symbols are legible — the same machinery the
   viewer's sharp patch uses. It returns, for each symbol it can see: a
   rectangle in page points, the label it read, and a confidence.

3. **Outline them on the sheet.** Not a list in a panel — boxes drawn on the
   drawing itself, with the read label beside each. The estimator is looking at
   the legend; the proposals belong on it.

4. **Tap to confirm, tap to reject, tap to correct.** Confirming captures the
   crop as a `symbolLinks` row exactly as the manual path does today. Correcting
   means fixing the label or nudging the box.

5. **Then, and only then, offer a meaning.** A captured symbol with no assembly
   is already a supported state (`symbolLinks.assemblyId` is nullable on
   purpose, and the schema says why). Linking it to an assembly is a second,
   separate confirmation — see § 9.4.

6. **Manual circle mode stays, as the backup.** The drag-a-box capture that
   exists today (`SymbolCapture.tsx`) is not replaced and not hidden; it is what
   catches whatever the model missed. The change is that it stops being the
   first thing a new user is asked to do.

### 9.3 Matching a new symbol against ones already confirmed

**Question 1, answered: all three, as a funnel, in cost order — and the cheapest
one does most of the work.**

A user with a few jobs behind them has perhaps 30–200 rows in `symbolLinks`.
Comparing a new symbol against all of them with a model call is the wrong shape
before it is anything else.

**Stage 1 — the label, free and deterministic.** `symbolLinks.lookupKey` already
exists: the lower-cased, collapsed label, indexed, and already what uniqueness is
judged on. A legend's own label text (§ 9.2 step 1) matched against it settles
the easy majority outright. Real labels vary — `DUPLEX RECEPT.`,
`RECEPTACLE, DUPLEX 20A`, `DUPLEX RECEPTACLE, 20A, 18" AFF` — so this wants the
fuzzy ranking the product already has in `client/src/lib/smartSearch.ts` rather
than string equality. **Reuse that; do not write a second matcher.** Cost: zero
tokens, sub-millisecond, 200 candidates down to about three.

**Stage 2 — cheap shape descriptors, to rank those three.** Not pixel
correlation. Raw template matching on the stored thumbnails is brittle in
exactly the ways that matter: the same symbol is drawn at a different size on a
1/8" sheet than on a 1/4" one, line weights differ between offices, and the
thumbnails were captured at whatever resolution the sheet happened to be drawn
at. What survives all of that is a handful of scalars computed from the
binarised crop:

- aspect ratio,
- ink fraction (how much of the box is drawn on) — this is what separates a
  FILLED triangle from a hollow one, which is the exact distinction the § 9.4
  warning is about,
- connected-component count (one blob, or a symbol with a separate tick),
- whether the outer boundary is closed, and roughly how round it is.

Four or five numbers, compared by distance, computed on a canvas in about a
millisecond. It will not tell two similar symbols apart reliably, and it is not
being asked to — it is being asked to ORDER three candidates and to veto an
obviously wrong one. **Honest limit: this is a ranker, not a decider.**

**Stage 3 — the model, on the final yes/no only.** Vision is genuinely good at
"are these the same symbol, allowing for line weight and scale", and genuinely
bad value at being run 200 times. So it sees the new crop and the top one or two
stored thumbnails, once, as part of the call it is already making about this
legend sheet. Cost: negligible on top of step 2 of § 9.2.

**Stage 4 — the estimator.** Always. See § 5c.

**What is NOT realistic, so nobody spends a week finding out:** training anything,
embedding models over symbol crops, or full-page template matching across a set.
The library is too small to train on, the symbols are too similar for a generic
image embedding to separate, and a user with 40 symbols will never generate
enough labelled data to make any of it better than the funnel above.

### 9.4 THE THING THAT NEEDS CARE: a remembered match must never apply itself

**Engineering firms use different symbols.** There are common conventions and
every office has a house style. The same shape means different things on two
sets — a filled triangle might be an exit sign on one job and a special-purpose
outlet on another. The same office can change its own house style between a 2019
set and a 2026 set.

So the rule, which is § 5c with no discretion left in it:

> **A remembered symbol may be SUGGESTED on a new plan set. It may never be
> APPLIED to one.**

What that means in practice:

- The suggestion is a question with the evidence attached: the stored thumbnail,
  the new crop, and the label that was read. _"This looks like your duplex
  receptacle — yes or no?"_ Five seconds, once per set.
- **Confirmed once per plan set — per `bid_pdfs` document, not per user and not
  per customer.** A second PDF attached to the same bid is a second set and asks
  again. The unit is the drawing package, because that is the thing a legend
  belongs to.
- A rejection is remembered for that set too, so the app does not ask twice.
- Nothing about the suggestion may write to the bid. Confirming links a symbol
  to an assembly; it does not count anything.

**Why the confirmation cannot be skipped even when the app is certain.** A
symbol that silently means the wrong thing does not produce one wrong number —
it produces a whole sheet of wrong numbers that all look consistent with each
other, and it produces them under a label the estimator recognises and trusts.
It is the single most expensive failure available to this product, and five
seconds per set is an absurdly cheap insurance premium against it.

### 9.5 How confident before it is worth suggesting

**Question 2, answered — and the honest part of the answer is that the number
cannot be decided from a chair.**

The user's framing is the right one: a suggestion rejected nine times out of ten
is worse than no suggestion, because it costs attention every time and teaches
people to dismiss the whole mechanism. The quantity that matters is therefore
not the model's score but **precision** — of the suggestions shown, what
fraction get accepted.

**The design target: four out of five suggestions accepted.** Below roughly
three out of four, a suggestion becomes a thing you read and dismiss, which
costs more than picking the assembly from a list would have.

**This floor is NOT the reader's floor, and conflating them would be a mistake.**
`HIGH_CONFIDENCE_FLOOR` is 0.75 because there, a wrong accept puts a quantity on
a bid. Here the two error costs are different again:

- A wrong SUGGESTION costs one glance, and the fallback (pick the assembly from
  a list) is already fast. So the bar can sit lower than the reader's.
- A wrong ACCEPT costs § 9.4 — a symbol quietly meaning something else across a
  whole set. So the bar on what can be accepted without evidence is higher.

The resolution is not one number, it is **showing the evidence**. A suggestion
that displays the stored thumbnail beside the new crop is one a wrong answer
fails visibly — the estimator sees two different shapes and says no in half a
second. A suggestion that shows only a name is one a wrong answer passes. So:

- **Suggest at moderate confidence, always with both pictures and the read
  label.**
- **Ship the floor conservative and loosen it on evidence, never the reverse.**
  A floor that starts too high produces a few good suggestions and a quiet
  feature; a floor that starts too low produces noise and the feature is dead
  before it is measured.
- **Measure it.** Record accept/reject per suggestion with the tier it was shown
  at — outcome and tier only, no crops, no labels, no drawing content, following
  the `ai_usage_daily` precedent of storing sizes and never contents. That is
  what turns "is the floor right" from an argument into a number.

### 9.6 Where this belongs relative to the tiling work

**Question 3, answered: legend capture FIRST. This disagrees with the value
ranking in § 10, and the disagreement is deliberate.**

§ 10 ranks tile size above legend capture by EFFECT — that is right, and it is a
ranking of value, not of schedule. Three reasons the schedule inverts it:

1. **The expensive half of tiling is already built.** § 4b step 2 made the
   worker's contract a REGION, and said at the time that Phase 10 needs exactly
   this. What remains of "tiling" is choosing a grid, skipping empty tiles,
   dispatching in parallel and merging — real work, but not the hard part.

2. **A tiled read against an empty legend spends the expensive call to produce
   `low` findings.** That is not a tuning problem, it is `copilotConfidence`
   working as designed: an unlinked symbol cannot reach `high`. Building the
   accurate reader first means paying per sheet for a result the confidence
   rules will not let anyone act on.

3. **Once per set is cheaper to get wrong.** Legend capture is one or two calls
   per plan set (§ 11.4); tiling is roughly eighteen cents per dense sheet.
   Iterating on the cheap once-per-set feature until it is right, and then
   turning on the per-sheet one, is the order that costs least to learn in.

**So: § 9 is Phase 9a, § 10's tiling is Phase 10.** If only one ever gets built,
build this one.

---

## 10. The reader's accuracy — ranked by what each is worth

This is a ranking of VALUE. For the order to build them in, see § 9.6.

### 10.1 Zoomed-in tiles instead of one shrunk sheet — the biggest by far

Already the plan, and unchanged. **A receptacle symbol disappears before the
model ever sees it at full-sheet scale.** A 36x24 sheet handed over as one image
has its symbols reduced to a few pixels each; no amount of prompting recovers
information that is not in the picture. Nothing else on this list matters while
that is true.

The machinery is built (§ 4b). What remains is § 11.

### 10.2 Legend first — the biggest lever after tile size

See § 9. Restated here only so the ranking is complete: linking symbols turns
counting from recognition into matching, and the confidence rules already refuse
to call an unlinked symbol `high`.

### 10.3 Letting it say "I am not sure" — this stays, and it is a rule

It already works this way, and **that must not be treated as a first draft to be
improved on.** Writing it down as a law, since it was asked for as one:

> **Confidence is never tuned up to make the reader look better.** Not the
> floors, not the prompt, not the scoring. If the reader is unsure, the estimator
> is told it is unsure.

**A reader that flags ten uncertain marks beats one that confidently reports 47
when the answer is 52.** The first can be finished — the estimator looks at ten
spots and the count is right. The second cannot be checked at all, because
nothing on screen distinguishes the five it got wrong from the forty-two it got
right, and the only way to find them is to recount the sheet by hand, which is
the entire job the reader was supposed to do.

`shared/copilotConfidence.ts` already carries the reasoning, including the part
that is easiest to erode under pressure: an illegible mark becomes a FLAG with
nothing proposed, not a low-confidence proposal. **There is no allowed action
that turns an `unreadable` into a stamp**, and `shared/copilotActions.ts`
enforces it. Keep it that way.

The pressure to break this rule will come dressed as a metric — "we only propose
60% of what is on the sheet". The answer is that the other 40% is being reported
honestly, and a number that goes up by relabelling guesses as findings has not
moved.

### 10.4 Reading dense sheets twice and comparing — RECOMMENDED AGAINST as stated

**Question 4, and this is the item to cut.** The user already hedged it with
"only if the cost numbers support it". The problem is not the cost.

**Two passes of the same model over the same image are correlated, not
independent.** A symbol that is genuinely ambiguous is ambiguous both times; a
symbol that is clear is clear both times. So agreement mostly re-states the
confidence score the model already returned, and disagreement mostly surfaces
the borderline cases that `low` already flags. Double the bill for a signal
largely already in hand — and, worse, "two passes agreed" is a **more
persuasive-looking** badge than a confidence score, attached to no more
information. That is a § 5c problem, not just a cost one.

**The version that would genuinely be independent is worth keeping.** Shift the
tile grid by half a tile on the second pass. That breaks the correlation for a
real reason: a symbol cut by a seam in pass one is whole in pass two, and seam
losses are a failure mode tiling actually introduces. So:

- **Drop plain double-reading.**
- **Keep offset-grid re-reading as an option, and run it only over tiles that
  produced a flag or that sit on a seam.** The cost is then proportional to
  uncertainty rather than to sheet area, which is the right shape.

---

## 11. The reader's speed

All four of these are agreed and none of them is controversial. The notes are
about how, and about the traps.

### 11.1 Run tiles in parallel, not one after another

**The parallelism is in the API calls, not the rasterising.** The worker
processes one message at a time (`pdfRenderer.worker.ts`), so tiles are
RENDERED serially whatever happens — and that is fine, because a region render
is 25–96ms measured (§ 4b) against seconds for a model call.

**Bounded concurrency, not unbounded.** Four in flight is the same number the
multipart uploader settled on for the same reasons: it saturates a normal
connection without turning one user into a thundering herd. Unbounded fan-out
over a sheet would also collide with the provider's rate limits and with the
per-person daily allowance (`shared/aiLimits.ts`), and the failure mode there is
a half-read sheet.

**The allowance has to change its unit in the same commit as this work, and
must not change before it.** `DAILY_LIMITS` allows 150 CALLS, sized when one
sheet was one call. At six calls a sheet that becomes 25 sheets a day, and a
40-sheet set fails two-thirds of the way through. The replacement is a count of
SHEETS plus a dollar backstop — 40 sheets and $6 per person per day — because
once a sheet is several calls, "calls" no longer tracks spend and the whole
point of the number is to be a circuit breaker on spend. Reasoning and numbers
in `references/ai-reader-cost.md` § 7.

### 11.2 Skip empty tiles — MEASURED 2026-09-18, and it saves nothing

**This was my assumption and it did not survive being measured. Keep the check,
budget zero for it.** The reasoning below is preserved because the RULE about
what may be skipped is still right; only the expected saving was wrong.

A lot of a floor plan is white paper. The check is cheap and it runs on a bitmap
already in hand: draw the tile down to something small, count pixels that are
not background, skip the tile if the count is zero.

**The white paper is real. It is just not in tile-sized pieces.** Only 3.4% of
sheet E1.02 is ink — but the blank space is scattered through the drawing rather
than gathered in blocks. Counting blocks with not one dark pixel, across all
five Old Blueridge sheets:

| Block size | p1  | p2  | p3  | p4  | p5  |
| ---------- | --- | --- | --- | --- | --- |
| 1 in       | 30% | 16% | 37% | 45% | 43% |
| 4 in       | 6%  | 0%  | 13% | 19% | 13% |
| 6.4 in     | 0%  | 0%  | 4%  | 4%  | 4%  |

A tile worth shipping covers **12.9 inches** (§ 11.5). At that size:

> **Blank tiles across all five sheets, at every resolution tested: ZERO.**

Every 13-inch square of a construction sheet touches something — the border, a
grid bubble, a dimension string, a keynote, wall hatching. The only case where
skipping saved anything at all was Haiku's smaller tiles at 200 px/in: 2–5 of 35.

So the reason to keep it changes. It is no longer a cost control; it is a
**fault detector**, which is what the "say how many were skipped" note below is
really for. At a shippable tile size the honest answer is always zero, so any
other answer means the renderer produced a blank tile — and that is worth
knowing immediately.

**Skip only tiles that are genuinely blank.** A threshold set to "nearly blank"
will eventually skip a tile containing one faint symbol, and that is a silent
miscount — the exact failure § 10.3 exists to prevent. Zero ink is a fact;
"not much ink" is a guess.

**Say how many were skipped**, in the run summary. A sheet where 30 of 40 tiles
were skipped is either mostly white paper or a rendering fault, and the number
is the only thing that tells them apart.

### 11.3 Show results as they arrive

Findings stream into the panel as each tile answers, rather than after the last
one. This is `CoPilotPanel` work rather than reader work, and it follows the
existing rule for a first load: progressive arrival, never a spinner replacing
content that is already on screen.

### 11.4 Cache by sheet — read once, never re-read unless asked

**Already true today** — the server returns a stored reading and re-reads only
when the user asks. Worth writing down is what must invalidate it: nothing
automatic. Not a new legend link, not a page re-render, not a new app version. A
re-read is an action the estimator takes, because a reading that changes under
somebody who has already confirmed half of it is a § 5c violation.

### 11.5 The cost numbers — MEASURED 2026-09-18, and the old table was wrong

**Full workings in `references/ai-reader-cost.md`.** This section is the
summary; that document is the arithmetic, the measurements it came from, and
the three options priced against each other.

**What the old table got wrong, because it is worth naming.** It said "an image
costs roughly (width x height) / 750 tokens". That is roughly right per pixel
and has **no ceiling in it**, and the ceiling is the fact that decides the
design:

> A vision model cuts an image into 28x28 patches and charges one token per
> patch — `ceil(w/28) * ceil(h/28)`. **Past its budget the image is not
> rejected, it is silently SHRUNK**, and nothing reports that it happened.

Sonnet 5 allows 4784 patches and a 2576px edge; Haiku 4.5 allows 1568 and
1568px. `shared/visionImageLimits.ts` does this arithmetic, with Anthropic's own
published examples as its tests.

Three consequences the old table could not express:

- **A whole 36x24 sheet as one image is capped at 2352x1568 — 65 px per paper
  inch — however big a picture you send.** Tiling is not an optimisation, it is
  the only way past that wall.
- **A tile has a natural size**: 1932x1932 on Sonnet 5, 1092x1092 on Haiku.
  Bigger is shrunk back; smaller wastes a call.
- **Haiku needs four times the tiles** for the same detail, which cancels most
  of its lower per-token price.

From `shared/aiPricing.ts`, Sonnet 5 at $2/$10 per million in/out. MEASURED on
the Old Blueridge sheets: 36x24in, a receptacle symbol's circle 0.17in across,
78 device symbols on E1.02, one finding ≈ 40 output tokens.

| Work                                            | Cost       |
| ----------------------------------------------- | ---------- |
| One 1932x1932 tile, in                          | $0.0095    |
| One 1092x1092 tile on Haiku, in                 | $0.0015    |
| A 36x24 sheet, Sonnet 5, 150 px/in, **6 tiles** | $0.057 in  |
| The same sheet's findings, out                  | $0.040 out |
| **One sheet, all in — THE DEFAULT**             | **$0.101** |
| The same on Haiku at 100 px/in, 12 tiles        | $0.046     |
| The same at 200 px/in with thinking, 15 tiles   | $0.278     |
| A 40-sheet set, every sheet read, default       | $4.05      |
| **A legend sheet, once per set**                | **~$0.03** |

Indicative, and they go stale silently — the console has the bill.

Three things follow, and the first two replace what the old table concluded:

- **Empty-tile skipping is worth nothing at shippable tile sizes.** Measured:
  zero blank tiles on all five sheets. See § 11.2, which now carries the
  numbers.
- **A cheaper model is worth 27%, not 50%**, unless the detail level drops with
  it. § 10.2's ordering is unaffected; the saving is just smaller than it looks.
- **§ 9.6's ordering argument holds by an order of magnitude**, not by a hair —
  3c once per set against 10c for every dense sheet. Unchanged, and if anything
  strengthened.

**Decided 2026-09-18:** the default is Sonnet 5 at 150 px/in with thinking off,
10.1c a sheet, with 150 sheets a month included in the $99 flat price. Thorough
mode (200 px/in, thinking on, 27.8c) does not fit inside a flat fee and is sold
as paid overage.

---

## 12. Question 4 — what I would cut, and what I would add

Asked directly: is anything in §§ 9–11 a bad idea or more trouble than it is
worth? Four answers, two of them "no".

### CUT: reading a sheet twice with the same grid

Covered in § 10.4. Correlated passes, a persuasive-looking badge over no extra
information, and double the bill. Keep the offset-grid variant, restricted to
tiles that flagged.

### ADD: read the legend's TEXT LAYER before spending a token — DOWNGRADED

Folded into § 9.2 step 1. Still worth building; **no longer worth counting on**,
and the original wording here was the thing that needed correcting most.

It said: _"On a vector plan set — which is most of them — the legend's labels
are in that layer exactly, with positions."_ That was an assumption, and
measuring it on 2026-09-18 did not support it. Both real sets are scans; one has
no text layer, the other has OCR that renders DUPLEX as "DUEX" and drops a
Korean character into the middle of the symbol schedule. See § 9.2 step 1 and
`references/ai-reader-cost.md` § 0.

The mechanism is still right where it applies: it converts the highest-error
part of the feature (reading a label) into a lookup, and hands the model a prior
for WHERE symbols are. It costs nothing and cannot hallucinate. It just
degrades to nothing far more often than this section claimed, so **build it as a
bonus and design as though it were absent.**

### NO OBJECTION: manual capture as the backup rather than the front door

Agreed without reservation, and it is barely a build: `SymbolCapture.tsx`
already implements drag-a-box capture. The change is which one a new user meets
first, not new machinery.

### NO OBJECTION, WITH ONE SHARPENING: remembering symbols between jobs

The risk was identified correctly and completely in the original ask — different
offices, different house styles, a filled triangle meaning two different things.
One thing to sharpen: **the same office can change its own house style between
sets**, so "remembered" must be re-confirmed per drawing package rather than per
customer or per user. § 9.4 says `bid_pdfs` document, and that is the reason.

### One thing NOT to build yet, though nobody asked for it

**Do not let the reader propose symbols the legend does not contain**, however
obvious they look. The model knows what a duplex receptacle usually looks like;
this product deliberately does not use that knowledge, because symbol meaning
comes from the user's legend links and nowhere else
(`shared/copilotConfidence.ts` says so explicitly). It will be tempting when a
sheet has no legend. The answer to a sheet with no legend is to ask for one.

---

## 13. AI-suggested known distances for calibration — PROPOSAL, Phase 10b

**Proposed 2026-09-18. Recommended AFTER tiling, not before it — see § 13.6.**

Press a button on a sheet with no scale. The app reads the printed dimension
strings on the drawing, finds the LONGEST one it can read with confidence, and
offers it: the crop it read, the two endpoints it would calibrate between, and
the ratio that falls out. You check it and accept, or you ignore it and
calibrate by hand as you do today.

Governed by § 5c throughout: **the app suggests, the estimator confirms.** And
by § 5a: the offered ratio is the measured one, never a tidied one.

### 13.1 Why this is a better idea than it first sounds

Reading small printed text off a scan is precisely what a vision model is good
at and what a human on a 27-inch monitor is bad at. That alone would make it a
convenience. The reason it is more than a convenience is § 4.2's arithmetic:

> **Calibration error comes from the SPAN, not from the sharpness of the
> clicks.** A 100 ft dimension with 3 px of slop is 0.4% wrong. A 10 ft span
> with the same slop is 4.4% wrong.

A person calibrating by hand picks a dimension they can find, which in practice
is a short one near where they happen to be looking. **A model can read every
dimension string on the sheet at once and offer the longest.** That is easier
for the estimator AND more accurate than what they would have chosen — the two
usually trade against each other, and here they do not.

So the ranking rule is explicit: **longest usable span first, always.** Not the
clearest, not the nearest, not the highest-confidence read. Length is the thing
that governs the error, and confidence is a gate rather than a sort key.

### 13.2 THE RISK, which is the largest in the product

**A wrong calibration multiplies into every measurement on the sheet.** Every
run, every vertical, every foot of wire, all wrong by one constant factor, with
nothing on screen looking broken. It is the same failure `detectSheetScale`
already guards against in `bidPdfsRouter.ts`, and it is the reason only a HIGH
confidence reading auto-applies there.

**And the OCR evidence is actively discouraging.** § 12 records it: on the real
scanned set, the text layer renders DUPLEX as "DUEX" and drops a Korean
character into the symbol schedule. A model that mangles a word has a dictionary
working against the error and still lost. **A number has no dictionary.**
`124'-0"` misread as `124'-6"` is 0.3% — invisible and harmless. The same string
misread as `12'-4"` is off by a factor of ten and produces a plausible-looking
sheet where every run is ten times too short.

The consequence for the design: **the verification the estimator performs must
be VISUAL, not arithmetic.** A number on its own to nod at is not verification,
because the wrong number looks exactly like the right one.

### 13.3 What it shows before anything is accepted

Four things, all at once, for each candidate:

1. **The crop of the drawing where it read the number**, rendered at a zoom
   where the estimator can read the same characters themselves. The region
   renderer from § 4b already does exactly this — it takes a region and a
   scale, and 300 px/in over a 4in crop is well inside the sizes it handles.
2. **The two endpoints it would calibrate between, drawn on the drawing**, so
   it is visible at a glance whether they land on the right extension lines or
   on something else entirely.
3. **The ratio in plain terms** — "one inch of paper is 8 feet of building" —
   beside the notation, because the notation is what people skim and the
   sentence is what people check.
4. **How far off a standard scale it lands**, the same check manual calibration
   already performs, and **the span rating from § 5b** so a short offer is
   labelled short rather than silently accepted.

**A wildly non-standard ratio is treated as evidence of a misread, not as a
finding.** If the read number implies something like `1:63.5` on an
architectural sheet, the most likely explanation is that a digit was wrong. It
is not offered with a warning — it is **not offered**. See § 13.5.

**Note the boundary against § 5b:** standard-scale proximity is used here as a
PLAUSIBILITY FILTER on whether to speak at all. It is never used to adjust the
number. What gets offered, and what gets stored if accepted, is always the
measured ratio.

### 13.4 The endpoints come from the estimator, not from the model

**The single most important design decision in this section**, and it departs
slightly from the ask in a way that removes most of the risk.

Vision models read text well and report precise pixel coordinates badly. Asking
one for the exact endpoints of an extension line is asking it for the thing it
is worst at, and a 40 px error on a 3000 px span is 1.3% — silently, on the
number that multiplies into everything.

So the split is:

- **The model supplies the NUMBER and the NEIGHBOURHOOD** — what the dimension
  string says, and roughly where on the sheet it is. Both are text-reading
  tasks.
- **The existing two-point calibration tool supplies the GEOMETRY**, pre-seeded
  with the model's approximate endpoints as draggable handles, at the zoom the
  crop was read at.

The estimator sees the two markers exactly as asked for, and nudging them is the
same two clicks they would have made anyway — except the sheet is already at the
right place and the distance is already typed in. **The unverifiable half of the
model's answer is never stored.**

This is also much less to build: it is a pre-seed of a tool that already exists,
not a second calibration path.

### 13.5 How confident it has to be before saying anything

**Silence beats a wrong number here**, and the thresholds are set accordingly.
An offer requires ALL of:

| Gate                  | Rule                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corroboration**     | Two independent dimension strings imply ratios within **1%** of each other, OR (single reading) the implied ratio lands within **2%** of a standard architectural or engineering scale |
| **Span**              | Rates `good` by `shared/planCalibration.ts` — under 1% implied error. A `usable` or `short` candidate is not offered at all                                                            |
| **Character clarity** | The model reports no ambiguous character in the number. Any hedge on a digit drops the candidate silently                                                                              |
| **Sanity**            | The implied ratio is inside the range real drawings occupy. Outside it, discard rather than warn                                                                                       |

**If nothing clears all four, the panel says "Nothing I could read with
confidence — calibrate by hand" and stops.** It does not fall back to the best
of a bad set. A feature that always produces an answer teaches people the answer
is always worth something.

**At most three candidates, longest first.** Eight candidates is not more
thorough, it is a chore, and a list people scroll turns into a list where people
click the first row without reading it. Three is enough for corroboration and
short enough to actually check.

**It never auto-applies, at any confidence.** This is deliberately stricter than
`detectSheetScale`, which does auto-apply a high-confidence reading, and the
difference is worth stating because the precedent will be raised. A printed
`1/4" = 1'-0"` note is a STATEMENT BY THE DRAFTER that the app is repeating. A
suggested calibration is the app's OWN arithmetic over its own reading of a
number and its own guess at two endpoints — three places to be wrong instead of
one, and no author to have checked it.

### 13.6 Where it belongs: after legend capture AND after tiling

**Phase 10b.** Both of the other two come first, and neither ordering is close.

**Behind legend capture (Phase 9a)** for the reason § 9.6 already establishes:
legend capture is the highest-value AI work in the product, it is once per set,
and it is the cheapest place to learn how suggest-and-confirm should feel before
that pattern is applied to something riskier.

**Behind tiling (Phase 10)** for three reasons:

1. **It is the same machinery.** Reading a dimension string means rendering a
   zoomed region and asking the model to read small text in it. That is tiling's
   problem statement with a different prompt. Built after tiling, this is a
   prompt, a schema and a panel. Built before it, it is a second, parallel
   region-dispatch mechanism that tiling then has to be reconciled with.
2. **Manual calibration already works.** This replaces about fifteen seconds of
   work, once per sheet, on a path that is shipped and correct. Tiling replaces
   counting seventy-eight symbols by eye. The value gap is not subtle.
3. **It is the riskiest of the three and should be built last on purpose.** A
   bad legend suggestion is visibly wrong and gets rejected. A bad count is
   checkable against the drawing. A bad calibration is a plausible number that
   poisons everything downstream. Build the pattern where mistakes are cheap
   before applying it where they are not.

### 13.7 What it costs per call

Two stages, because one stage cannot work. Rates and the patch arithmetic from
§ 11.5 and `shared/visionImageLimits.ts`.

| Stage                                                                                           | Cost        |
| ----------------------------------------------------------------------------------------------- | ----------- |
| **Locate** — whole sheet at the vision cap (2352x1568, 4704 patches), out ≈ 6 candidate regions | ~$0.013     |
| **Read** — 3 crops at 300 px/in (≈1200x450 each), out ≈ the numbers and hedges                  | ~$0.010     |
| **One sheet, all in**                                                                           | **~$0.023** |

Roughly **2 to 3 cents a sheet** — about a quarter of a full sheet read (10.1c),
and it only runs on sheets somebody intends to measure on. A 40-sheet set where
ten sheets get traced is about 30 cents.

**Why the locate stage cannot be skipped.** A whole 36x24 sheet is capped at
2352x1568 however big a picture is sent — 65 px per paper inch (§ 11.5). Text
printed 3/32" tall is six pixels tall at that size. The number is not readable
at the scale the sheet is readable at, which is the same wall tiling exists to
get past, so the first pass finds WHERE the dimension strings are and the second
pass reads them at a zoom that has the characters in it.

### 13.8 The text layer: a cross-check, never a source

**On the real scanned sets, no.** § 12 downgraded this for legend capture and
the downgrade applies harder here, because a digit error has nothing to catch
it. Build as though the text layer is absent.

**Where it does apply, it applies as agreement rather than as input.** If the
text layer contains a number at the location the model read, and the two match,
that is a genuine second witness and satisfies the corroboration gate in § 13.5.
If they disagree, the candidate is dropped. The text layer never supplies a
number that vision did not also read.

**One genuinely better path, for vector sets, with no model in it at all.** On a
true vector plan set the dimension string's text is in the text layer WITH its
position, and the extension lines are vector paths with exact coordinates. The
paper distance between a dimension's terminators can be computed outright —
exactly, free, offline, with nothing to hallucinate. **If that is ever built it
outranks this entire section on a vector set**, and this section becomes the
scanned-set fallback rather than the primary path. It is not scheduled, both
real sets measured so far are scans, and it should not hold this up — but it is
the better answer where it works and it belongs written down.

### 13.9 Four things about this that would be bad ideas

**1. Calibrating off the graphic scale bar. Filed in § 6 as a decision not to
re-open, because this is the one that will be undone by somebody being
sensible.**

It is the most tempting candidate on the sheet and the worst one available, and
the gap between those two facts is why it needs writing down plainly rather than
noting in passing.

**Why it is tempting:** it is a ruler. Printed on the drawing, by the people who
drew it, expressly so it can be measured against. No text to misread, no digit
that could be a 6 or a 0, no extension lines to find. Anyone looking at this
problem for the first time will reach for it, and will be right to wonder why
this document does not.

**Why it is wrong, in one line:** a printed scale bar is one to two inches of
paper, and § 5b rates a span that short at **over 3% implied error** — the
band where a slip of a few pixels moves every measurement on the sheet. The
100 ft dimension string printed a few inches away is **0.4%**.

**So the bar is roughly ten times less accurate than the dimension beside it,
while looking considerably more official.** Offering it as the calibration
source does not merely fail to help — it contradicts the one insight (§ 13.1)
that makes this whole feature worth building, which is that the model should
find the LONGEST span because length is what governs the error.

Use it as a plausibility check on a ratio calibrated from something longer.
**Never as the span.**

**2. Station marks, in version one.** The span is excellent, which is exactly
what makes them attractive. But stations run along an alignment, and the paper
distance between two stations equals their difference only where that alignment
is straight. A model cannot reliably tell a straight run from a long flat curve,
and the failure is a plausible number again. Civil sheets are a later,
deliberate piece of work, not a bonus candidate type.

**3. Running it when a sheet opens.** Forbidden already by the standing rule in
CLAUDE.md — no AI call from a page load, ever — and worth restating here
specifically, because this is the feature where "it would be so helpful if it
just knew" will be most persuasive. It is a button.

**4. A confidence score shown as a percentage.** "87% confident" invites the
estimator to accept 87 and reject 61, which is a judgement neither of them can
actually make from the number. The gates in § 13.5 are binary for that reason:
either it is worth showing or it is not, and what gets shown is the evidence —
the crop, the endpoints, the ratio, the span rating — not a self-assessment.

---

## 14. Paid extra sheets when the monthly allowance runs out

**Planned 2026-09-18. Nothing here is built.** $99 a month includes 150 sheets
of AI reading (§ 11.5). This is what happens at 151.

**The rule that governs all of it: nobody is ever charged without opting in.**
That is not softened anywhere below, including by the auto-refill option, which
is off until switched on and asks again the first time it fires.

### 14.1 READ THIS FIRST: the 150 that exists is not the 150 being sold

`shared/aiLimits.ts` has a plan-reader allowance of **150 — per person, per
DAY** — and it is a **circuit breaker, not a budget**. Its own comment is
explicit: it exists to stop a retry loop costing a thousand calls at 3am, it is
set generously on purpose, and it is keyed to `ctx.user.id` rather than the
billing account precisely so one person's runaway cannot stop their colleagues
working.

The 150 in the price is **per account, per MONTH, and it is an entitlement**.

**These are two different counters on two different axes that happen to share a
number, and conflating them would be a genuinely expensive mistake** — it would
either let a five-estimator company read 750 sheets a month inside one $99 fee,
or stop a solo estimator at 150 a day when they had bought 500.

**Both stay.** The breaker keeps its job and its number. The entitlement is new.
If the coincidence is confusing, change the breaker's number, not the price.

### 14.2 The currency: credits, so thorough mode does not need a second meter

One unit — a **sheet credit** — and different reads cost different numbers of
them:

| Read                                  | Cost to run | Credits |
| ------------------------------------- | ----------- | ------- |
| **Default** — Sonnet 5, 150 px/in     | 10.1c       | **1**   |
| **Thorough** — 200 px/in, thinking on | 27.8c       | **3**   |

Thorough is 2.75x the cost to run and charges 3, which rounds in the right
direction and needs no second balance, no second meter and no second purchase
flow.

**Thorough draws only from PURCHASED credits, never from the included 150.**
That is § 11.5's decision — it does not fit inside a flat fee — carried through
literally. The alternative, one pool that thorough spends 3 of, is simpler and
was rejected: it lets a subscriber turn $99 of included reading into 50 thorough
sheets costing $13.90 to serve, which is the flat fee's whole exposure showing
up through a side door.

### 14.3 What to charge, and the reasoning

**Recommendation: packs, not per sheet.** Three reasons, the first of which is
decisive on its own:

1. **Stripe's fee floor makes per-sheet absurd.** 2.9% + 30c. A single 25c
   charge costs 31c to collect. Per-sheet pricing is not a pricing choice, it is
   a way of paying Stripe more than the product earns.
2. **A pack is one consent, honestly given.** Buying 150 sheets is a decision
   made once, with a number attached. Per-sheet billing is either a charge per
   click — unusable — or a running tab, which is exactly the "found out from the
   bill" failure the standing AI rules exist to prevent.
3. **It is one purchase to reconcile**, in the app and on the card statement.

**The packs:**

| Pack           | Price    | Per sheet | Cost to serve | Gross margin |
| -------------- | -------- | --------- | ------------- | ------------ |
| 50 sheets      | **$15**  | 30.0c     | $5.05         | ~61%         |
| **150 sheets** | **$39**  | 26.0c     | $15.15        | ~57%         |
| 500 sheets     | **$119** | 23.8c     | $50.50        | ~54%         |

Margins are after Stripe (2.9% + 30c) and after the 10.1c-a-sheet serving cost.
**The 150 pack is the recommended default** — it is one more month's worth,
which is a quantity somebody can reason about without arithmetic.

**Why roughly 2.5x cost and not 2x or 5x.** Three anchors, and they agree:

- **Against the cost to serve**, 26c on 10.1c is a 57% gross margin. Below
  typical software margins, comfortably above cost recovery, and defensible out
  loud to a customer who has read Anthropic's price list — which is the real
  test, because that customer exists and 5x would be indefensible to them.
- **Against what it replaces**, a dense sheet counted by hand is twenty to forty
  minutes of estimator time. At $60 an hour that is $20 to $40 of labour. 26c
  is not within two orders of magnitude of the value, which is why this does not
  feel like gouging from the buying side.
- **Against the flat fee**, $99 for 150 included works out at 66c a sheet if the
  whole subscription is attributed to reading — which it should not be, since
  the subscription is the whole product. **Overage priced BELOW the implied
  included rate is the right direction**: the person buying more is the
  product's best customer, and charging them a premium for being successful with
  it is how good accounts get resented.

**Auto-refill exists and is OFF.** An explicit opt-in toggle — "when I run out,
buy another 150 pack automatically" — with its own confirmation, an email the
first time it fires, and a visible way to switch it off in the same place. It is
the only mechanism that could charge somebody who was not looking, so it gets
the strictest treatment in the feature.

### 14.4 What happens at the limit if they do not buy

**AI pauses. Everything else works. Manual mode is untouched.** This is the
existing behaviour and it is already correct — the requirement is to keep it,
not to build it.

**Verified in the code 2026-09-18:**

- `checkDailyLimit` returns a message that already names the number, says when
  it resets, and says what still works: _"Everything else works as normal — you
  can still count and stamp by hand."_
- `planCopilotRouter` catches `AiLimitReached` separately from every other
  failure, with the comment _"Out of allowance is not a failure to hide behind a
  generic message — it has its own sentence, and it is the one case the user can
  act on."_ The run is still recorded so the panel can say what happened.
- Stamping, tracing, calibration, legend capture and symbol linking have no AI
  gate at any point. `createSymbolLink` has no model call, no allowance check
  and nothing to fail — which CLAUDE.md names as the test of whether the
  manual-mode rule is still being kept.

**Three things the monthly version must not break**, because each is an easy
mistake to make while adding a counter:

1. **No modal, no interstitial, no app-wide banner.** Running out of AI reading
   must not be an event that interrupts someone stamping by hand. It is a line
   in the reader's own panel and nowhere else.
2. **The existing sentence keeps its shape** — number, when it comes back, what
   still works — with one thing added: a **Buy more sheets** button, in the
   message, going straight to the packs.
3. **The counter must fail CLOSED, like the breaker does.** `server/llm` refuses
   when the counter cannot be read, and its comment says why: _"A limit that
   fails open is not a limit."_ An entitlement that fails open is worse — it
   fails open into somebody else's money.

### 14.5 The usage meter

**Where it lives:** the plan reader's own panel header, permanently.
`38 of 150 sheets this month` with a thin bar. Beside it, once any have been
bought, `+ 120 bought`. That is the whole thing when nothing is wrong.

**At 80%** — `120 of 150 this month` in amber, with `Buy more` beside it. One
line, in the place it already occupies, with no new surface appearing.

**At 100%** — the existing out-of-allowance message, plus the button.

**Nowhere else.** Specifically not a dashboard tile, not a login banner, and not
an email at 80%. § 1 of this document's own complaint applies: a warning in a
place with nothing to do about it is a warning people learn to ignore. An email
at 100% is defensible because the work actually stopped; at 80% nothing has
happened yet.

**The data is mostly there.** `ai_usage_daily` already stores calls per user per
day per feature, and `aiUsageRouter` already sums a month of it — but as
`adminProcedure`, across every account, for the spend report. The meter needs
the same SUM scoped to one billing account and readable by that account. Small,
but it is a new query and a new procedure, not a reuse of the existing one.

### 14.6 Rollover

**Recommendation: the included 150 resets monthly and does not roll over.
Purchased credits never expire.**

The two halves are different things and the difference is the justification:

- **The included allowance is monthly CAPACITY, not property.** Rolling it over
  turns a subscription into a bank: somebody who skips two quiet months arrives
  in March with 450 sheets of entitlement, and the flat fee stops covering the
  flat cost precisely in the month when usage spikes. Every flat-rate plan that
  rolls over unused capacity ends up capping the rollover, which is a second
  rule to explain and the first one people get wrong.
- **Purchased credits are prepaid goods.** They were paid for with money, in a
  quantity the customer chose. **Expiring them is taking something already
  bought**, it produces the single worst support conversation available, and it
  saves the business nothing — the cost was incurred at purchase, not at use. A
  credit sitting unspent for a year is not a liability worth managing for a
  product at this scale.

**Spend order: included first, then purchased, oldest purchase first.** Nobody
should ever burn a credit they paid for while a free one sits unused, and the
meter shows both balances so the order is visible rather than assumed.

### 14.7 Where Stripe fits, and what must exist first

**The largest thing in this section: there is no billing system.** No Stripe
dependency, no customer records, no subscription, no webhook handler anywhere in
the repository. **The $99 subscription this overage attaches to does not exist
in code either.** Selling packs on top of a subscription that is not yet billed
is building the first floor before the ground floor.

**So the order is: subscription billing first, packs second.** Most of what
packs need is machinery the subscription needs anyway.

**What has to exist, in order:**

1. **A billing account concept**, keyed to `ctx.scope.dataUserId` rather than
   `ctx.user.id`. The whole company shares an entitlement even though they do
   not share the per-person breaker (§ 14.1).
2. **A Stripe customer per billing account**, and the $99 subscription itself.
3. **A monthly entitlement counter** — read against `ai_usage_daily` summed over
   the billing period, not a stored decrementing number. A counter derived from
   the usage rows cannot drift away from what was actually spent; a stored one
   can, and reconciling it afterwards is guesswork.
4. **A credits ledger**, append-only: granted, spent, refunded, with the Stripe
   object that caused each row. Append-only so a disputed charge can be
   reconstructed rather than argued about.
5. **Stripe Checkout for the packs** — one-time payments, not subscription
   items. Hosted checkout rather than a card form in the app: it moves PCI scope
   and 3DS handling to Stripe, and there is nothing to gain by owning it.
6. **A webhook on `checkout.session.completed`** that grants the credits,
   **idempotent by session id**. Stripe retries; a duplicate grant is free money
   and a missing grant is a paid customer with nothing to show for it. This is
   the one place in the feature where getting it wrong is silent.
7. **Refunds and disputes.** A refunded pack claws back its UNSPENT credits and
   leaves the spent ones alone — the reading was performed and cost money. A
   chargeback pauses AI until settled, and says so plainly.
8. **Stripe Tax on from the first charge.** US sales tax on software is
   state-by-state and retrofitting it means reopening past invoices.
9. **A receipt and a purchase history in the app**, not only in Stripe's email.
   Somebody will need it for a job's books.

**One thing to decide before building, not during:** whether packs are available
to accounts without an active subscription. **Recommendation: no.** Credits on a
lapsed account are a support problem with no upside, and "resubscribe to use the
sheets you bought" is a sentence nobody should have to read.

---

## 15. THE GATE: nobody has measured whether the reader counts accurately

**Open, and it blocks Phase 10.** Flagged 2026-09-18 as the missing measurement
under everything above.

### 15.1 What is not known

§ 11.5 measured what a sheet read **costs**: 10.1 cents at the default of
Sonnet 5, 150 px/in, thinking off. That number is solid — it came from real
sheets and the patch arithmetic in `shared/visionImageLimits.ts`.

**Nobody has measured what it is WORTH.** There is no figure anywhere in this
document for how many of the 78 device symbols on E1.02 the reader actually
finds at 150 px/in, how many it invents, or whether 200 px/in finds materially
more. The detail level was chosen by cost and by the patch ceiling, which is a
reasonable way to choose a starting point and not a measurement of anything.

**Three decisions already rest on that unmeasured number:**

- **Tiling (Phase 10) is the largest AI build in the plan**, and § 10.1 ranks it
  first by value on the argument that a symbol invisible at full-sheet scale is
  recoverable at tile scale. True as far as it goes, and it does not say
  recoverable _how completely_.
- **§ 14's economics assume the default is the right default.** If 150 px/in
  turns out to be materially worse than 200, the real per-sheet cost is 27.8c,
  not 10.1c, and every margin in § 14.3 is wrong by a factor of nearly three.
- **Thorough mode is priced as a premium.** If it finds nothing the default
  misses, it should not be sold at all; if it finds substantially more, it may
  belong in the default rather than in the overage.

### 15.2 The bake-off

**Read the same real sheets at each detail level, and compare every reading
against a hand count of the same sheet.**

- **5 to 10 sheets**, weighted toward dense ones — E1.02 and its equivalents,
  not a title sheet. The dense sheet is where the reader either earns its price
  or does not.
- **Three levels:** Haiku at 100 px/in, the default (Sonnet 5, 150 px/in), and
  thorough (200 px/in, thinking on).
- **Each sheet read TWICE at each level.** A single run cannot distinguish "the
  reader missed three" from "the reader misses three _sometimes_", and the
  second of those is a different product. Run-to-run variance is a result, not
  noise to be averaged away.
- **Hand count first, with the readings unseen.** A count made after seeing the
  model's answer is not an independent count, and everyone who has ever done it
  says otherwise.

**What comes out of it**, per level: **recall** (how many real devices found),
**precision** (how many proposed that are not there), **variance** between the
two runs, and a **breakdown by symbol type** — because a reader that finds every
receptacle and no junction box is a different problem from one that misses 8%
evenly, and only the first one has a fix.

### 15.3 What it costs, so it can be authorised knowingly

**The API spend is trivial. The time is the real price, and it is the estimator's
own.**

| Item                                               | Cost          |
| -------------------------------------------------- | ------------- |
| 10 sheets x Haiku 100 px/in x 2 runs               | $0.92         |
| 10 sheets x default 150 px/in x 2 runs             | $2.02         |
| 10 sheets x thorough 200 px/in + thinking x 2 runs | $5.56         |
| Legend capture, once per set, two sets             | $0.06         |
| **API total**                                      | **~$8.56**    |
| With re-runs after a prompt fix, and slack         | **under $15** |

**The hand counts are 4 to 7 hours.** Ten dense sheets at twenty to forty
minutes each, done carefully enough that the result can be trusted as the answer
key — and done BEFORE the readings are seen. Against an estimator's own time
that is $250 to $500 of real cost, which is thirty times the API bill.

**So the thing being authorised is an afternoon and a half, not fifteen
dollars.** A smaller version — 5 sheets, two levels, single runs — is about $3
and two hours, and would settle the largest question (is the default good enough
to build tiling on) while leaving the variance question open.

### 15.4 DECIDED 2026-09-18: the small version, and not yet

**Not authorised tonight, and deliberately so.** When Phase 10 is actually the
next thing to build, run the SMALL version:

- **5 sheets**, weighted to dense ones.
- **Two levels** — the default (Sonnet 5, 150 px/in) and thorough (200 px/in,
  thinking on). Haiku is dropped: § 11.5 already measured that it saves 27%
  rather than 50%, which is not enough to justify a third of the hand-counting.
- **Single runs.** The variance question stays open and is worth reopening only
  if the recall numbers come back close to the line.

**About $3 of API spend and two hours of hand-counting.** It settles the one
question that gates the build — is the default detail level good enough to
build tiling on — and leaves run-to-run variance for later.

**The reason for waiting is the two hours, not the three dollars.** The
measurement is only worth taking when its answer changes what gets built next,
and the answer goes stale if the model, the detail level or the prompt moves in
between. Running it early buys a number that has to be re-earned.

### 15.5 The gate

**Phase 10 should not start until this is run.** Not because the answer is
expected to be bad — the reasoning behind tiling is sound — but because tiling
is the biggest build on the list and it is currently justified by an argument
rather than by a measurement, and the measurement costs an afternoon.

**What each outcome would mean:**

- **Default reaches high recall with few false positives** — build tiling as
  planned, § 14's pricing stands, thorough stays as paid overage.
- **Default is materially worse than thorough** — the default detail level is
  wrong, the real cost per sheet is closer to 27.8c, and § 14.3's prices need
  recomputing before anything is sold.
- **Neither level is accurate enough to act on** — the most valuable possible
  result, and the one worth spending an afternoon to find out before spending
  weeks. The reader becomes a first pass that speeds up a human count rather
  than a count, and it should be described that way in the product.
