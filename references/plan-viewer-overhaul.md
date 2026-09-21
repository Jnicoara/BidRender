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

Agreed 2026-09-17, and **reconciled 2026-09-18 against a decision this section
contradicted without knowing it.** Read § 2.0 before anything else here.

### 2.0 These are TYPE controls, not per-run fields — D3(a) stands

**The conflict, plainly.** `references/takeoff-spec.md` decision **D3**, made
2026-09-14, asked how a traced run says what it is and chose between three
shapes:

> (a) Choose before tracing: "Trace…" asks which conduit or cable assembly,
> and remembers it for the next run — like the stamp tool.
> (b) Choose after: each finished run asks "What is this?" in the list.
> (c) The old per-run calculator form: type, size, conductors, material,
> fittings, waste, makeup allowance, service loop, terminations, pull points.
>
> **Pick: (a)**, with (b) as the way to change it later.
> **Bloat warning:** (c) puts a form on every run.

**This section was then written three days later, in a different file,
describing (c).** Not deliberately — nobody reread the older record — but the
table below is a form of per-run fields, which is the option that had already
been rejected by name.

**D3(a) stands.** It is the older decision, it is the one made against the old
screen's actual behaviour, and using the app on 2026-09-18 produced the same
conclusion independently: three runs on a sheet all called "Run on Sheet 3",
indistinguishable on the drawing, each needing its settings entered again.

**So the shape is a PALETTE, not a form.** A run type is defined once — "3/4in
EMT, 3 #12 THHN" — and armed in the toolbar exactly as a counted group is
armed for marks. Every run traced while it is held inherits it. Tracing six
identical homeruns becomes arming once and tracing six times.

**The division of ownership, decided 2026-09-18:**

- **The TYPE owns what it IS.** Raceway and size, conductors, material,
  allowances, and the name and colour that follow from them.
- **The RUN owns where it is and how long.** Its points, its location, its two
  ends, its heights — and any deliberate difference from its type, which it
  says out loud.
- **Circuits: the type supplies what a new run STARTS with; the run may
  differ.** A homerun type carrying 3 #12 is the starting point, not a
  constraint — a particular run may take two circuits in one pipe, and § 2.1 is
  emphatic that the app must never decide that. The run says when it differs.

**What this fixes beyond settings**, and the reason it is the keystone rather
than a convenience: runs of one type share a definition, so they share a name
and a colour without anybody typing either, and "which of these lines is which"
stops being a question. Naming (T11), colouring, per-run settings and duplicate
runs are one problem with one answer.

**Everything in § 2.1 to § 2.4 below is still correct about WHAT is
controlled.** What moves is WHERE the control lives: on the type, inherited by
the run, overridable on the run. § 2.5's inheritance gains one level — company
default → run type → this run — and keeps its rule that NULL means "follow the
level above" rather than a value copied down at creation.

> **The failure is worth more than the fix.** A decision was recorded in one
> document and a plan was written in another, and the newer one never
> reconciled. Nothing was wrong with either file on its own; the gap was
> between them, where no reader stands. It was found by using the app, which is
> the most expensive place to find it. See CLAUDE.md § Where decisions live.

### 2.1 What is controlled — now per TYPE, inherited by the run

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

> **RENAMED 2026-09-19 — they are EXTRA, not allowances.** "Extra wire" and
> "extra conduit" is what an estimator says out loud, and it does not read as
> padding the way "allowance" and "waste" do. See § 5j for the word, where the
> number is set and the arithmetic it has to show. Makeup keeps its own name,
> and § 5j says why. **Nothing below changes** — three quantities, three units,
> and the rule that a percentage is the wrong unit for makeup all stand.

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

| Phase   | What                                                                           | DB change                |
| ------- | ------------------------------------------------------------------------------ | ------------------------ |
| **1**   | ~~Zoom, pan, and the three viewer bugs~~ **shipped**                           | No                       |
| **1a**  | ~~Page-flip fit bug + tool discoverability~~ **shipped**                       | **No**                   |
| **2**   | ~~Two-point scale calibration~~ **shipped**                                    | No (reuses `scaleRatio`) |
| **3**   | ~~Sharp re-render of the visible area~~ **shipped**                            | **No**                   |
| **4**   | ~~The layout: top bar, collapsing panels, focus mode~~ **shipped**             | **No**                   |
| **4b**  | Measure-only tool                                                              | **No**                   |
| **5**   | **Verticals on runs — the money phase**                                        | **Yes**                  |
| **6**   | Group row, plain counting, and marks you can tell apart — § 5e                 | **Yes** — count groups   |
| **6b**  | **The bridge: counts onto the bid, then levels 3 and 2** — § 5f                | **Yes** (small)          |
| **6c**  | Takeoff-only jobs: stop nagging a finished count — § 5h                        | **Yes** (one column)     |
| **7**   | Run settings: allowances, materials, sizes, ground                             | **Yes**                  |
| **8**   | **Verticals on stamps**                                                        | **Yes** (small)          |
| **9**   | Editing runs: drag a vertex, insert/remove points                              | No                       |
| **9a**  | **AI-assisted legend capture** — see § 9, and § 9.6 for why it precedes 10     | **Yes** (small)          |
| **10**  | AI reader tiling, and the daily-limit question with it — **gated on § 15**     | No                       |
| **10b** | **AI-suggested known distances for calibration** — see § 13                    | No                       |
| **11**  | Tablet and touch                                                               | No                       |
| **12**  | **Alternates and allowances** — add/deduct priced apart from the base — § 5g   | **Yes**                  |
| **13**  | Per-bid proposal breakdown: where the choice is STORED, then the shapes — § 5g | **Yes** (small)          |

> **Phase 6 was split on 2026-09-18 and 6c inserted.** The bridge (6b) is the
> largest piece in this document and is not a step inside an appearance phase —
> § 5e records the cut and § 5f the finding behind it. **6c sits immediately
> after 6b rather than later**, and the reason is a consequence of Phase 6 rather
> than a preference: level 1 counting produces bids with no line items by design,
> which every pricing prompt in the app reads as unfinished. Phase 6 is what
> makes the nagging worse, so the fix belongs next to it, and it is one column.
>
> **Phase 12 ranks above 13, and that order was corrected on 2026-09-18.**
> Alternates started as a footnote under the breakdown work and outrank it:
> **a breakdown shape is a preference, while a missing alternate can make a bid
> non-responsive on the federal and public work this contractor bids** — one
> annoys a reader, the other gets the bid rejected unread. It is also not a
> presentation feature at all (§ 5g), so it must not be folded into 13.
>
> **Phase 13 leads with WHERE the choice is stored, not what the choices are.**
> The layouts, the sections and the pro-rata allocation rule all exist; what
> does not is any way to make the choice per bid rather than once for the whole
> company. The one shape with a further dependency is "by system", which wants a
> category snapshot a bid line does not carry yet — and reads better after 6b,
> when a plan-driven bid has real lines to group.

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

## 5d. Phase 5 — verticals on runs. PLANNED 2026-09-18, not built

The money phase, and the first database change since the viewer work started.
Everything below is governed by § 5a: measure honest, pad visibly. A vertical is
a measurement, not a pad, and it is shown as its own number everywhere it is
counted.

### The shape decision everything else follows from

**A vertical is never added into the traced length.** It is carried alongside
it — flat, vertical, total — all the way through to the bid.

Two reasons, and the second is the one that would be expensive to discover
later:

1. The estimator asked to see it separately, and a number folded in early can
   never be shown apart afterwards.
2. **§ 7.1 needs it separate.** The conduit allowance applies to traced length
   ONLY; the wire allowance applies to everything including verticals. If the
   vertical has disappeared into the run length by the time allowances arrive,
   that rule cannot be written without unpicking this phase.

So `runFeet` keeps meaning exactly what it means today, and the vertical footage
rides beside it as its own field. This is the thing most likely to be
"simplified" by someone who sees two numbers that could be added together.

Cable runs get verticals too. An MC whip drops off a ceiling like anything else,
and `cableFeet` takes the same treatment as `conduitFeet`.

### The data model

**Four levels, each one empty until somebody fills it, each empty level meaning
"ask the level above":** shipped → company → job → run. The same inheritance the
pricing defaults already use, one level deeper.

**Three new tables.**

`takeoff_height_defaults` — one row per company, holding the **distribution
height** and nothing else. Ships with no row at all, and no row means no
verticals anywhere. Its own table rather than two more columns on
`pricing_defaults`, because a height is a measuring setting and not a money one:
keeping them apart means a mistake here cannot reach overhead and profit.

`takeoff_mounting_heights` — the device types AND their heights, for both the
shipped list and the user's own. See the next heading; this is one table doing
one job, not two.

`bid_mounting_heights` — a job's overrides. A row exists only for a type actually
overridden on that job, and the rows die with the bid. A job can override a
height; it cannot invent a type. The one-off belongs on the run.

**One new column on `bids`** — `distributionHeightInches`, NULL to inherit. Same
shape as `productivityPct`, which is already the single-column override on that
table.

**Seven new columns on `takeoff_runs`:**

| Column                     | What it holds                                                           |
| -------------------------- | ----------------------------------------------------------------------- |
| `startKind`                | The height type key at the start. NULL = not answered, so no vertical   |
| `endKind`                  | The same for the end                                                    |
| `startHeightInches`        | This run's own start height. NULL = follow the setting                  |
| `endHeightInches`          | The same for the end                                                    |
| `distributionHeightInches` | This run runs at a different elevation. NULL = follow job, then company |
| `startStampId`             | The stamp at this end, once linked. The double-count rule reads this    |
| `endStampId`               | The same for the other end                                              |

**The run remembers WHAT is at each end, never HOW HIGH it is.** The height is
resolved live, every time a number is shown. That is the whole of § 2.5 applied
here: change the company receptacle height and every run ending at a receptacle
re-prices. Copy the height onto the run at trace time and forty runs freeze
silently at whatever the setting was that afternoon.

### Device types: one table, shipped rows and the user's own. ANSWERED 2026-09-18

**Asked:** does a user-added type need to be stored differently from a shipped
one, or can they be the same rows with a flag?

**First answer, given 2026-09-18: the same rows, flagged by a NULL `userId` —
the baseline-materials pattern. REVISED the same day, while building it, and the
revision is the one that shipped.**

**What shipped: the shipped types live in CODE (`SHIPPED_HEIGHT_TYPES`), and the
table holds only what a company has actually decided** — an override, a type of
their own, or a retirement. Three reasons, and the third settles it:

1. **A new shipped type needs no seed at all.** Adding an entry to the list
   ships it to every company the moment the code deploys — no migration, no
   backfill, and no startup re-stamp pass.
2. **"Reset to shipped" is a DELETE**, not a remembered number. With no company
   row, resolution falls through to the shipped list, so a reset cannot drift
   from what the app actually ships.
3. **MySQL ignores NULLs in a unique index.** App-owned rows with a NULL
   `userId` would make `unique(userId, typeKey)` stop protecting exactly the
   rows nobody owns — two shipped receptacles, and no complaint from the
   database. That is the hole `dedupeBaselineRows` exists to patch for
   materials, in application code, at seed time. **Not recreating a known flaw
   is worth more than matching the pattern that has it.**

**What did not change is the part that was actually being asked about.** Reading
is ONE path: `heightList` merges the shipped list with the company's rows, and a
type the user added behaves exactly like a shipped one — it appears in the run
pickers, it inherits company → job → run, and changing its height re-prices
every run pointing at it, live.

The reasoning is written at `SHIPPED_HEIGHT_TYPES` in `shared/takeoffHeights.ts`
as well, because the baseline-materials pattern is what a reader will expect and
"fixing" this to match it would quietly reintroduce the unique-index hole.

**The key is a string, not a row id.** Shipped types use fixed keys
(`distribution`, `receptacle`, `switch`); a user-added type gets a slug of its
label, made unique within the company. Renaming a type keeps its key, so a rename
never breaks a run pointing at it. A key also reads plainly in a run row when
something has to be debugged, which an id does not.

**`userId` is NOT NULL, and that is what makes the unique index real.** Every row
in `takeoff_mounting_heights` has an owner, because the unowned ones do not
exist — they are the code list. So `unique(userId, typeKey)` is enforced by the
database rather than by a startup pass, and there is nothing here for a
`dedupeBaselineRows` equivalent to clean up.

### Retire, never delete. CONFIRMED 2026-09-18

**Asked:** what happens to runs pointing at a custom type when it is deleted?
**Answer: it is retired, never deleted, and the reason is money rather than
tidiness.**

A run stores the type's key and resolves the height live. Delete the type and
every run pointing at it silently loses its drop — the footage falls, nothing on
screen says why, and the bid gets quietly cheaper. That is precisely the failure
§ 5a exists to forbid, arriving through the back door of a library edit.

So a retired type:

- leaves every picker, so it cannot be chosen again,
- keeps resolving its height for runs that already point at it,
- is labelled **retired** on those runs, so the estimator can see it and change it
  deliberately,
- reappears under "show all" in the heights screen, where it can be brought back.

This is the materials rule verbatim (`retireBaselineMaterials` sets
`isActive = false` and keeps the row, so a bid priced from it last month still
resolves the part it was priced from). Shipped types retire through a seed-file
list; the user's own retire through a status column on their row.

### The heights screen — simple by default, deep when asked

The general form of this is written up in `CLAUDE.md` § Customization available,
but never in the way. Here is what it means on this screen:

```
  Distribution height        10'-0"              the gate — see below

  Common
  Receptacle                  1'-6"   starter
  Switch                      4'-0"   starter
  Panel                       not set — no vertical counted
  Ceiling box / fixture       not set — no vertical counted
  Junction box, wall          8'-0"   starter, a guess
  Disconnect / equipment      5'-0"   starter
  Exit sign                   7'-6"   yours
  Thermostat                  4'-8"   yours

  › Show all heights (2 more)
  + Add a type
```

**The fold hides ours, never yours.** A type the user added is always visible,
because they added it and they are the one who uses it. Only shipped types the
trade meets rarely — floor box, underground — sit behind "show all", along with
anything retired.

**The fold hides two rows today, and it is built anyway.** That is deliberate and
worth writing down so nobody deletes it as dead weight: it exists so the screen is
the same shape when it is hiding twelve. A control added later, once the list is
already long, arrives after the screen has already taught people that this is a
screen with a lot on it.

**"Add a type" and "Custom height" are different things and must never be worded
as if they were the same.** One is permanent and lives in settings; the other is
one number on one run.

| Wording in the picker         | What it does                                    |
| ----------------------------- | ----------------------------------------------- |
| `Custom height for this run…` | One-off. Lives on the run, appears nowhere else |
| `Add a type to my heights…`   | Permanent. Appears in every picker from then on |

### The distribution height is the single gate

Everything is off until one number is set. No distribution height means no
vertical anywhere, on any run, whatever the device heights say — because a
vertical is the distance between two elevations and only one of them is known.

That is the answer to "nothing appears in a bid I did not ask for": one number,
typed once, turns the whole feature on, and until it is typed the app counts
exactly what it counts today.

### Starter values — shipped as conventions, dated, never as facts. SET 2026-09-18

| Type                   | Ships at              | Note                                               |
| ---------------------- | --------------------- | -------------------------------------------------- |
| Distribution           | **not set**           | The gate. Nothing is counted until this is entered |
| Receptacle             | 1'-6"                 | Convention                                         |
| Switch                 | 4'-0"                 | Convention, and the reach limit is why             |
| **Panel**              | **not set**           | Varies too much to guess — see below               |
| Ceiling box / fixture  | **not set**           | Often at distribution height, often not            |
| Junction box, wall     | 8'-0"                 | **Labelled a guess**, not a convention             |
| Disconnect / equipment | 5'-0"                 | Mounted for a reachable handle. 4'-0" reads low    |
| Floor box              | 0'-0"                 | Convention                                         |
| Underground / slab     | 1'-6" **below floor** | Entered as a positive depth — see trap 4           |

Every one of these carries the label and the date, exactly as a starter material
price does. **A convention is shown as a convention.**

**Panels ship with no vertical, and this is the correction that matters most.** A
panel is fed top, bottom or back depending on how the can is set, and a
surface-mounted panel with pipe entering the top may drop a foot from ceiling
height, or nothing at all. A shipped 6'-0" would have added invented footage to
the end of **every homerun on every job** — the largest single number in the
phase, and wrong. It ships not set, with a line asking for the estimator's own
number.

**Zero and not-set are different here, and that inverts a house rule.**
`references/writing-style.md` § 8 says a price nobody set shows `$0` and is
flagged, because blank reads as "not applicable". Heights cannot do that: `0'-0"`
is a real, correct height for a floor box. So an unset height shows the words
**"not set — no vertical counted"** and is flagged that way. Never a zero.

### What a run knows about its ends

**Picked by the user, never guessed from a nearby stamp** (§ 7). Guessing is right
most of the time, and the rest of the time it attaches a wrong height to a run
where nothing on screen looks wrong.

**The pickers are sticky.** The trace toolbar carries `From [ Panel ] → To
[ Receptacle ]` and they stay where they were left, exactly like the stamp tool
staying armed with an assembly. Thirty homeruns is one decision, not sixty. Each
finished run is stamped with what the pickers said when it was finished, and
changing them afterwards does not reach back and rewrite runs already traced.

What is copied down is the **kind**, never the height. That is not a violation of
§ 2.5 — it is the distinction § 2.5 rests on.

**`Distribution` is what the START picker defaults to**, and that default is a
defence rather than a convenience. See trap 2.

**The stamp suggestion, one tap, never automatic.** When a run is finished with a
stamp already sitting on its endpoint, a chip appears: `Receptacle stamped here —
use it?` Accepting sets the end kind and writes `endStampId`. This is § 5c in its
smallest possible form, and that link is what the double-count rule reads.

### The double-count rule, in code

**The rule:** a traced run owns the verticals at its own two ends. A stamp's
vertical is for a device that is NOT on a traced run.

**Where it lives:** one function in `shared/`, taking runs and stamps together and
deciding ownership before either is totalled. Not in the run path and again in the
stamp path — a rule enforced in two places is a rule that survives until somebody
edits one of them.

**The test has to be able to fail.** Stamps carry no verticals until Phase 8, so a
test written the obvious way would pass today without being capable of failing,
which is worse than no test at all. So it hands the ownership function a stamp
that DOES carry a vertical, sitting at a run's linked end, and asserts the footage
does not appear in the total. It fails today if the rule is missing, and it goes
on failing when Phase 8 gives stamps real heights.

**The gap, stated plainly:** ownership is knowable because the estimator tapped the
chip. A stamp sitting on a run end that was never linked is a possible double
count, and resolving it by distance is the guessing this section just refused. So
Phase 8 flags it — `this drop may be counted twice` — shown, never silently
resolved. One tap per run avoids it entirely.

### What is shown

A run, opened:

```
  Flat, traced                                   142.50 ft
  Rise at start   panel        10'-0" → 6'-0"      4.00 ft
  Drop at end     receptacle   10'-0" → 1'-6"      8.50 ft
  ──────────────────────────────────────────────────────
  Conduit                                        155.00 ft
  Wire            3 circuits, 3 conductors     1,395.00 ft
```

Each vertical names the device, both elevations and the answer, so it can be
checked in the estimator's head. That is the only test that matters.

A run, closed — **the full arithmetic, not a summary.** DECIDED 2026-09-18:

```
  Conduit      142.50 + 12.50 = 155.00 ft
  Wire       1,282.50 + 112.50 = 1,395.00 ft
```

`incl. 12.50 vertical` was the alternative and was rejected: it still makes the
reader do the subtraction to check it, and the entire point of the phase is that
vertical footage stops being invisible. Phase 4 bought the panel the room; this is
what it is spent on.

Bid totals, all sheets — flat and vertical named separately, never merged.

**The zero has to shout.** § 2.3 makes the argument and it applies here unchanged:
an unpriced material shouts, an unset height whispers. So:

- Distribution height not set, runs traced → the totals panel says so, plainly,
  with the count: `No vertical footage is in these numbers. 23 runs are counted
flat only.`
- Height set but a run has no ends picked → that run's row says `Verticals — not
set`. Not a blank, not a zero. "Nothing to add" and "nobody said" are different
  states and only one of them is finished.
- A run whose sheet has no scale → **nothing in the totals**, and the row says
  `Flat length not measurable — no scale on this sheet`. DECIDED 2026-09-18: the
  verticals are known for that run and could be shown alone, but a partial total
  reads as a complete one, and that is the failure that costs money. It stays out
  of the totals and says why on its own row rather than going quiet.

The materials list note gains a sentence naming the vertical total, so a number
that leaves the app carries its own explanation.

### Decided 2026-09-18 — the estimator's answers

1. **A company height change warns with a count** rather than freezing or silently
   re-pricing. Smallest change, and it keeps the inheritance that was asked for.
   **Freezing a bid's heights when it goes Active is the better long-term answer
   and should be revisited once win-rate tracking matters** — by then the number
   shown to a customer is a number worth being able to look back at, and
   inheritance cannot give that.
2. **Panels ship with no vertical.** See the starter table.
3. **Starter values as listed**, with disconnect at 5'-0" and the wall junction box
   labelled a guess.
4. **An unmeasurable run shows nothing in the totals** and says so on its row.
5. **The closed run row shows the full arithmetic.**
6. **Custom device types**: one table, shipped and user rows side by side, retired
   and never deleted.

### The traps

**1. A company height change re-prices jobs already quoted.** Inheritance means a
bid sent last week moves if the company height changes today. Answered above: warn
with a count.

**2. A run continuing through a box gets a phantom drop AND rise.** Panel →
junction box, then junction box → receptacle. Name the box at both ends and the
app adds a drop to it and a rise back out of it. If the pipe really goes down and
back up, correct. If it carries on at ceiling height, that is four feet of pipe
per box that does not exist, and twenty boxes is eighty feet in the wrong
direction. **Defence: `Distribution` is the START picker's default**, and the run
reads `Rise at start — none, continues at run height`.

**3. A riser already IS vertical footage.** Trace a riser on an elevation and its
height is in the traced length; give it end kinds and it is counted twice. **The
sheet-kind flag is NOT in Phase 5, and here is why** — it needs a new column on
`bid_pdf_sheets`, a UI home, and a concept the app does not otherwise have, and
the protection only fires if somebody remembered to tag the sheet, which is
exactly what they will not do. It is small code and a big concept, which is the
wrong trade. What ships instead costs nothing: both ends default to unanswered, so
a riser traced normally gets no verticals at all, and the ends control carries one
line at the point of the decision — `if this run IS the vertical, leave both ends
at distribution`. The sheet-kind column becomes worth having when something else
needs it too, most likely the reader skipping elevations.

**4. Below-floor heights are entered as a positive depth.** Underground and floor
boxes sit below the finished floor. The arithmetic handles a negative elevation
fine; the typing does not — `18` meant as a stub-up below slab would read as
eighteen inches above it, and the error is eleven and a half feet on every one.
**So those rows ask for depth below floor as a positive number and store the sign
themselves.** The field says `below floor` in its label, not in a hint.

**5. Settings belong to the company, not the person logged in.** New tables scope
to `ctx.scope.dataUserId`, as `server/scopeDiscipline.test.ts` requires. Otherwise
a foreman gets a private set of ceiling heights and nobody finds out until two
bids disagree.

**6. The vertical must stay separate for § 7.1.** Restated because it is the thing
a later tidy-up would break. See the top of this section.

### The migration

Seven statements, seven files, **one statement per file**.

That shape is the whole answer to "what if it half-fails". MySQL cannot undo a
table change, and drizzle records a file as applied only when the entire file
succeeds — so one six-statement file that dies on the fourth leaves three changes
made, nothing recorded, and a re-run that fails on `Duplicate column`. One
statement per file means a failure can only mean "that statement failed and
nothing was applied", and running again resumes exactly there.

Indexes and foreign keys are folded INTO each `CREATE TABLE` by hand, which MySQL
allows and drizzle-kit does not generate. A whole new table then arrives or does
not arrive, with nothing in between. The hand-edited SQL must keep drizzle's own
constraint names verbatim — `server/migrationRun.test.ts` checks them, including
the 64-character limit that broke 0004 on TiDB in July.

| #   | Statement                                                       |
| --- | --------------------------------------------------------------- |
| 1   | `CREATE TABLE takeoff_height_defaults` with its index and FK    |
| 2   | `CREATE TABLE takeoff_mounting_heights` with its indexes and FK |
| 3   | `CREATE TABLE bid_mounting_heights` with its indexes and FK     |
| 4   | `ALTER TABLE bids ADD distributionHeightInches`                 |
| 5   | `ALTER TABLE takeoff_runs` — all seven columns, one statement   |
| 6   | `ALTER TABLE takeoff_runs ADD CONSTRAINT` — startStampId        |
| 7   | `ALTER TABLE takeoff_runs ADD CONSTRAINT` — endStampId          |

**Migrate FIRST, deploy SECOND.** Not the other way round. Nearly every read in
this app is a bare `select()` that expands to every column the RUNNING build knows
about, so new code against an old database takes the whole takeoff screen down
with `Unknown column`, while old code against a new database simply ignores columns
it has never heard of. See § 5 of `references/deploying.md`, which is where this
was learned the hard way on the bid archive.

The order, watched:

1. **A fresh backup**, minutes before — not last night's.
   `DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/backup.mts`, then
   `verifyBackup.mts`.
2. **Rehearse on a copy.** Restore that backup into a scratch database and run all
   seven there. This is the only way to find out that statement 6 fails before it
   fails on real data.
3. `pnpm tsx scripts/schemaDrift.mts` — expect it to name the seven pending.
4. `pnpm db:push`.
5. `schemaDrift.mts` again — expect none. If it still names something, **stop and
   do not deploy.**
6. **Open the live site on the OLD code** and check a takeoff's totals are the
   numbers they were. This step has to be boring.
7. **Then deploy.** Merge, push `main`, watch Activity for three to six minutes,
   confirm the version tag moved.

**Statements 6 and 7 are the slow ones** — a foreign key makes MySQL check every
existing row. Seconds on a table this size, but they are the two to watch, and the
two most likely to fail: the live database is already missing five foreign keys
from the 0004 incident.

**Rollback:** migrations here are forward-only. If the code is rolled back the
columns stay behind, empty, read by nothing. "Undo the database change" is not on
the menu, which is the real reason for step 2.

**Existing bids read exactly the same afterwards.** Every new column is NULL on
every existing row, the two per-company tables start empty, and the shipped height
rows do nothing without a distribution height and an end kind. A test asserts it
directly: a run with every new field empty produces the quantities the current code
produces, so a future "helpful" default of 10 feet turns it red.

### Not in this phase

- **Stamp and group verticals** — Phase 8, on top of Phase 6's groups. A vertical
  belongs to the GROUP, not to each stamp (§ 7).
- **Allowances on verticals** — Phase 7, under § 7.1's split.
- **The sheet-kind flag** — trap 3.
- **Per-area heights** — settled against in § 7 and still settled.

## 5e. Phase 6 — three levels of effort, and marks you can tell apart

**Decided 2026-09-18, not built.** Four things came out of using the app after
Phase 5 step 4. One is a bug fix that belongs nowhere in particular; the other
three are Phase 6.

### The panning bug — NOT Phase 6, no database change

**Fixed 2026-09-18, with the false screen copy below.** `clampView` now decides
centring for the VIEW rather than per axis, and
`client/src/lib/planView.test.ts` covers the in-between state under "wider than
the pane but shorter than it". Two of those tests fail against the old rule and
three assert that everything else is unchanged.

**One thing worth recording, because it is why this shipped at all:** the
existing fixture is a 2000x1500 sheet in an 800x600 viewport — the SAME aspect
ratio, so on it the two axes overflow together at every zoom and the broken
state cannot be reproduced. The suite was thorough and still could not see this.
A fixture shaped like the viewport tests half the rule.

**The fault:** `clampView` (`client/src/lib/planView.ts`) applies one `axis()`
function to x and y independently, and its first branch forces an axis to centre
whenever the drawing is smaller than the viewport on THAT axis. So at a zoom
where the sheet is wider than the pane but shorter than it, sideways drags pan
and vertical drags are ignored. One gesture, two behaviours.

**The fix: decide per VIEW, not per axis.** If the whole sheet fits, centre both
— that behaviour is deliberate and stays. If EITHER axis overflows, apply the
overlap rule to both.

**Why, and this is the part worth keeping:** the code's own comment justifies
the centring with _"a sheet small enough to see whole is not one anybody is
repositioning"_. That reasoning is true when the whole sheet fits and false in
the in-between state, where the sheet is not small enough to see whole and the
user is demonstrably repositioning it — that is what the sideways drag IS. The
lock also contradicts the change shipped the same week that let a zoomed-in
corner sit in the middle of the screen instead of jammed against an edge.

Allowing it costs nothing that can be lost: `MIN_VISIBLE_FRACTION` still bounds
the drag. `fitView` is untouched, because at fit zoom the whole sheet fits by
definition and still centres.

### Stamps have to look different from each other

Every stamp is a 10px circle in `#F5C518` (`TraceLayer.tsx`). **That is the same
yellow as a conduit run and the same yellow as every warning in the app** — so
it is not only that stamps cannot be told apart from each other, a field of
stamps and a traced conduit run are currently the same colour. **Stamps and
traced runs must never share a colour.**

- **Shape comes from the CATEGORY, which every stamp already stores.** Five
  categories, five shapes, no setup. Making the estimator pick a shape per
  assembly is a setup chore that gets skipped, and a feature nobody configures
  is a feature that does nothing.
- **Colour is derived from the assembly**, deterministically, from a fixed
  palette. **No override in the first pass** — ship it and see whether anyone
  asks.
- **NOT the captured legend symbol.** It is the real symbol off the real
  drawing and it is tempting, but it is a raster crop that turns to mush at
  14px and only exists for symbols captured on that job. It belongs in the
  legend panel at 40px, not on the drawing at 14.
- **How many stay readable:** about five shapes (circle, square, triangle,
  diamond, hexagon) and six colours — the drawing underneath is black on white
  and three colours are already spoken for: conduit yellow, cable green, and
  the blue used for selection. Thirty combinations is more distinct marks than
  a sheet can usefully carry.
- **Marks must hold a SIZE ON SCREEN, between two stops — and the sentence this
  replaces was wrong in both directions.** It said marks "are drawn at a fixed
  pixel size today, so at 19% on a dense sheet they already overlap each
  other". Measured in the running app on 2026-09-18, they are nothing of the
  kind: the overlay sits INSIDE the viewer's zoom transform, so a mark tracks
  the drawing exactly.

  | zoom | mark  | zoom | mark   |
  | ---- | ----- | ---- | ------ |
  | 19%  | 3.8px | 92%  | 18.3px |
  | 24%  | 4.8px | 115% | 22.9px |
  | 47%  | 9.4px | 143% | 28.7px |

  So the fault is the opposite of the one described, and it is at both ends.
  Zoomed out to see a whole sheet a mark is under four pixels — smaller than a
  full stop, which is why nobody could see what had been counted. Zoomed in to
  place one accurately it passes 150 pixels at `MAX_ZOOM` and swallows the
  symbol it is marking.

  **Shipped: clamped to 10–26px on screen, growing with the paper in between.**
  Between the stops a mark feels stuck to the symbol; outside them it has
  stopped doing its job either way. The overlay divides the zoom back out, or
  the clamp would be applied to a number that is then scaled again — which is
  no clamp at all. `shared/takeoffMarks.ts` carries the measurements and the
  arithmetic; `client/src/lib/takeoffMarks.test.ts` asserts the round trip
  lands back inside the band at every zoom from 0.05 to 8.

  **Worth keeping from this:** the claim had been in the plan for a day and read
  as a fact. Two minutes in the browser with `getBoundingClientRect` replaced it
  with a table. A number that can be measured should not be asserted.

**No database change.** The category is already on the stamp; the colour is
derived. Only an override would need storage, and it is not in the first pass.

#### SHIPPED 2026-09-18 — shapes, colours, the clamp, and the yellow

Five shapes from `MARK_SHAPES`, six colours from `MARK_COLORS`, both decided by
the GROUP and both computed rather than stored — no column, no migration, and
nothing to configure. The five library categories keep a fixed shape so
"triangles are lighting" survives across jobs; everything else takes a stable
assignment from its own id.

**The collision is gone.** Marks were `#F5C518` — conduit yellow, cable green's
neighbour, and the colour of every warning in the app. The palette now excludes
all three reserved colours and a test asserts it, so the next person to add a
colour cannot quietly reintroduce one.

**The panel's swatch draws from the same function as the mark.** It is the
legend, and a legend that showed a yellow circle for every count would assert a
sameness the drawing contradicts. One function, so the two cannot disagree.

**A bug the tests caught in this module, worth recording** because it was in a
comment before it was in the code: the fallback key for a pre-phase-6 mark is
the assembly id NEGATED, to keep group 8 and assembly 8 apart — and the spread
function used `Math.abs`, which folds them back together. The comment claimed
the separation while the arithmetic removed it. Fixed with a sign-preserving
modulo.

**One instance of the yellow remains, deliberately not touched:** the plan
reader's LOW-confidence proposal is still `#F5C518`. A proposal is drawn dashed
and hollow, so it does not read as a placed mark — but it is the same collision
one step removed, on a sheet that also has conduit on it. Left alone because
changing it means a decision about the reader's own visual language, which is
§ 9's business, not this phase's. Noted so the next person meets it on purpose.

### Counting without an assembly — this is § 3, in four levels

Stamping demands an assembly today, so counting exit signs means borrowing an
unrelated assembly as a placeholder. That is backwards. The blocker is one
column: `takeoff_stamps.assemblyName` is NOT NULL and the whole stamp path
assumes an assembly behind it.

| Level                   | What it is                                    | What it needs                                                     |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| **1. Plain count**      | A typed name, nothing else. "Exit signs: 14." | The group row and a label. **Never reaches the bid** — a count    |
| **2. Count + price**    | A name and a dollar amount per item           | `unitCost` / `unitHours` on the group, **plus the bridge** — § 5f |
| **3. Count = material** | The part, no labour                           | A `materialId` on the group, **plus the bridge** — § 5f           |
| **4. Count = assembly** | What exists today                             | Nothing. Stays as the fullest option                              |

#### SHIPPED 2026-09-18 — the group row and level 1

Four migrations, split one statement per file as 0046–0052 established:
`0053` creates `takeoff_groups`, `0054` adds `takeoff_stamps.groupId`, `0055`
backfills a group for every mark already placed, and `0056` finally lets
`assemblyName` be null. That order is load-bearing: the backfill copies names
while the column still holds them.

**The backfill was rehearsed against a real database and the rehearsal earned
its keep twice.** It caught a collation mismatch that would have stopped the
migration on production mid-file (references/deploying.md § 5), and it proved
the counts are unchanged — same groups, same quantities, every mark attached,
compared against the old grouping rule row by row.

**What a person can do now that they could not:** type a name the library has
never heard of into the Stamp picker and count it. The offer appears whenever
the box has text in it, not only when nothing matches — a query that finds
something similar is exactly when somebody needs to say "no, not that one".

**One verb across the screen.** The toolbar, the overlay and the toast all say
"Counting" now. "Stamping" was the assembly-only word and it is not true of a
plain count; the panel it feeds has always been called Counted items.

### The GROUP carries its own shape and colour — decided 2026-09-18

**The question, found while building level 1:** § 5e said shape comes from the
CATEGORY, "which every stamp already stores" — five categories, five shapes, no
setup. That was true while every mark carried an assembly. A plain count has no
category and nothing to get one from, so step 3 had to answer what shape a
thing the library has never heard of gets.

**Decided: the shape and colour live on the group**, defaulting from the
category where there is one. Two rejected answers, and why:

- **A sixth shape reserved for plain counts** only postpones the problem until
  somebody has TWO plain counts on one sheet — which is the ordinary case the
  moment level 1 is used for what it is for, not an edge case.
- **Asking for a category when the count is made** puts a question at exactly
  the moment the feature exists to remove one. Level 1's whole claim is that
  you can count first and decide later.

**The deciding argument is coverage.** A category-derived shape works for three
of the four levels: assembly has one, material could borrow one, typed and
plain have nothing. A group-carried shape works for all four, because every
level IS a group. A rule that covers the whole feature beats a rule that covers
most of it and needs a special case for the rest — and the special case would
land on level 1, the level with the weakest claim to being second class.

**And it is cheap now in a way it would not have been before.** § 5e ruled an
override out of the first pass because it meant storage; the group row IS that
storage, already built, one row per counted thing rather than one per mark.
This is the second thing the row has paid for (the first was attaching a price
to a count made last week), which is worth noticing about the decision to make
it a row at all.

**What this does NOT become:** a colour picker in front of every new count.
Defaults are derived and silent — the category's shape where there is one, a
stable assignment from the palette otherwise — and changing one is a deliberate
act on a count that already exists. The § 5e rule stands: a feature nobody
configures must work without being configured.

#### The group is a ROW — this overrides what was approved on 2026-09-18

**Changed the same day it was approved, before anything was built.** The version
of this section approved that morning put `kind`, a label, `materialId`,
`unitCost` and `unitHours` **on `takeoff_stamps`**, one set of columns per
mark. **That is wrong, and a real group row replaces it.** Recorded as an
override rather than quietly edited, because the approved version is the one a
reader would otherwise take as current.

**Why it is wrong, in this document's own words.** § 7 already settled that "a
vertical belongs to the GROUP, not each stamp. Thirty receptacles in a room
share one height, and storing it thirty times is thirty places for it to
disagree with itself." **A price is the same kind of fact as a height.** Fourteen
exit signs at $38 stored on the marks is one number in fourteen homes, and the
first time thirteen of them are edited the count and the price disagree with
nothing on screen to say which is right.

**Two more things the row buys, neither of which per-stamp columns can do at any
price:**

- **Attaching a price later with every click intact** — which § 3.1 calls "the
  entire point of the three levels". On a group row that is an edit to ONE row.
  On per-stamp columns it is a rewrite of fourteen, and the tempting shortcut
  becomes asking the user to re-count.
- **Phase 8's stamp verticals**, which § 7 already decided belong to the group.
  The table pays for itself twice, and Phase 8 stops needing its own migration.

```
takeoff_groups          one row per counted thing per BID
  label                 "Exit signs"
  kind                  plain | typed | material | assembly
  assemblyId            level 4
  materialId            level 3
  unitCost / unitHours  level 2, typed
  laborRateId           only when unitHours is set — see § 5f

takeoff_stamps
  groupId               new. the mark keeps its position and points at the group
```

**Per BID, not per sheet.** Exit signs are one priced thing on the job even when
they are marked on five sheets, and a price per sheet is the same
disagree-with-itself problem one level up. The per-sheet panel still GROUPS by
sheet for display — a display choice over one set of rows, which is what
`groupStamps` already does.

**`assemblyName` becomes nullable here, and only here.** § 3.1 warns that level
1 "must not be smuggled in early by making a column nullable and hoping" — that
warning is about nullable WITHOUT a group, where nothing holds the label. With
the group row present the label has a home, which is the condition the warning
was waiting for. Existing rows keep their snapshots untouched; readers prefer
the group.

**Database change: yes.** A new table plus `groupId` on `takeoff_stamps`, both
additive, and a backfill making one group per existing (bid, assembly) pair so
today's takeoffs read identically. Same migrate-first-deploy-second shape as
Phase 5.

**Level 2 ships with a warning on the screen**, and the reasoning is the
unpriced-material rule (`CLAUDE.md` § Starter content) applied one level along:
a group carrying its own dollar amount is **a price that lives outside the
materials library**, so it is never re-priced when supplier costs move and never
appears in "what needs pricing". So it says so where it is set, and those groups
go in the needs-attention list — findable rather than forgotten. A price nobody
can find again is the quiet kind of wrong. The list itself, and the entry for
level 1, are in § 5f.

### Where Phase 6 now ends — the bridge is its own phase

**Decided 2026-09-18, on the finding that opens § 5f.** Levels 2 and 3 both need
a path from a count to a priced bid line, and that path **does not exist for any
level, including level 4**. It is the largest piece of work in sight and it is
not a step inside an appearance phase.

So **Phase 6 is the panning fix, the group row, level 1, and marks you can tell
apart — and it stops there.** Levels 3 and 2 leave with the bridge into Phase 6b
(§ 5f).

**Planned as the cut from the start**, rather than discovered halfway. The
alternative is finding out mid-phase that a "step" is phase-sized, with a
half-built bridge and a level 2 hanging off it. If 6b turns out to be
step-sized, nothing has been lost by drawing the line here.

### Why the appearance work belongs WITH the levels, not after

It is not in the phase table and is being added rather than confirmed. The
argument is causal: **the moment you can count "exit signs" without building an
assembly, the number of different kinds of mark on one sheet jumps.** Telling
them apart stops being polish at exactly the point level 1 ships, which is why
it goes in the same phase rather than the next one.

## 5f. Phase 6b — the bridge: counts onto the bid

**Designed 2026-09-18. Reviewed against the built code and SPLIT INTO TWO STEPS
on 2026-09-19; step one approved and building.** Read § 5f.0 before the rest of
this section: two things approved earlier are overridden here.

### 5f.0 Two overrides, recorded before anything that depends on them

#### OVERRIDE 1 — this phase is two steps. Level 4 crosses first

**Decided 2026-09-19, on reading the built code rather than the plan.** The
version of § 5f approved on 2026-09-18 reads as one job: "levels 3 and 2 live
here, behind the thing they both need". It is two.

**Level 2 does not exist.** `takeoff_groups.unitCost`, `unitHours` and
`laborRateId` were shipped as columns on 2026-09-18 and **nothing writes any of
them** — there is no price field on a count anywhere in the app. So the approved
§ 5f is a typed-price feature and a bridge, stacked, with the bridge underneath.

**Level 4 is complete and is what gets typed in by hand today.** A count made
with a library assembly already holds a name, materials at today's prices,
hours, a role and that role's rate, and `addAssemblyToBid` (`server/db.ts`)
already knows how to freeze all six onto a line. Nothing has to be invented for
it to cross.

So:

> **Step one is the bridge itself, proved on assembly counts only.**
> **Step two is the typed price, the material price, and traced runs** — all
> three of which fill the same group row from a different source and reuse every
> piece of step one.

**This is not a reduced version of the feature.** Step one builds the whole
mechanism — the link, the live count, the frozen price, the double-count guard,
and the fix to the supplier list — against the one level where every input
already exists. Levels 2 and 3 then become what this section already said they
were: "fill that cost from a material instead of typing it, same screen, same
fields, a toggle on where the number comes from".

**And it pays on the day it ships.** Count fourteen receptacles with a library
assembly, ask once, and they are on the bid at the prices that count was made
against. That is the hand-typing gone, which is the whole point of the phase.

#### OVERRIDE 2 — the FIRST crossing is an explicit act. D2(a) is amended, not abandoned

**Decided 2026-09-19. This overrides `references/takeoff-spec.md` D2 (decided
2026-09-14), which chose "live" and rejected a button by name.** That entry now
carries a line pointing here.

D2(a) rejected a button because it produces "a bid that goes stale when somebody
forgets to press it". That objection is real and it survives — it is just
narrower than it looks:

> **Asking is what creates the line. After that the count is live for ever.**

Once a group is on the bid, its quantity follows the marks with nothing to press
— which is exactly what D2(a) wanted and is most of what it was protecting. The
only thing that can go stale is a count that has **never** crossed, and § 5f's
needs-attention work makes that a listed, visible state rather than a silent
one. D2(a)'s objection is answered by making "not on the bid yet" impossible to
miss, rather than by removing the moment of choice.

**The reason that actually decides it is R4, not the interruption.** Costs
freeze when the line is created. If creation is automatic, **the app picks the
instant the estimator's money is frozen.** Type `3` on the way to typing `38`
and $3 is already on the bid, snapshotted, unreachable by any edit —
`bidsRouter.updateLine` deliberately does not accept snapshot fields. An
interruption costs a moment. A freeze at a moment nobody chose costs a job.

Two smaller facts point the same way. A level 1 count creates no line at all, so
"automatic" already needs an exception carved into it. And for an assembly count
there is no defensible automatic moment either — the first mark, or the
fourteenth, and both are arbitrary.

**Making the waiting work obvious — two places, both quiet, neither on the
drawing.**

1. **The counted-items panel**, one line of words in a fixed position under the
   list: `3 counts are not on the bid yet`. Words with a number in them, in the
   same place whether the number is 0 or 9. Not a control that restyles, tints
   or appears as state changes — movement where the screen wants steadiness.
2. **The bid's warning strip**, which already sits directly under the number it
   contradicts. A count that has not crossed is money missing from the material
   total above it, which is the same relationship the labour entry already has.

**Never a badge on the drawing.** Unchanged from the approved version, and it
matters more once a send exists: level 1's whole promise is a quiet count, and a
marker nagging toward the bid breaks that promise on the screen where it was
made.

### The finding that made this its own phase

**Nothing about money reads a stamp. Not level 2 — level 4 either.**

A stamped assembly does not become money on a bid and never has.
`server/routers/materialsListRouter.ts` said it in its header until step one:
"stamping does not create a line item". Marks and runs reach the counted-items
panel and the supplier materials list, and stop. **A finished takeoff is typed
into the bid by hand.**

This was checked rather than assumed, after the design for level 2 was written
around the premise that a typed price was the thing with no path to the bid. The
takeoff spec had it right a fortnight earlier — R1, R2 and R4 are all listed
**Missing** — and the screen said the opposite anyway: "Everything you place
lands on the bid" was live copy until 2026-09-18 (fixed, § 5e).

So the bridge is not level 2's plumbing. **It is the most valuable single piece
of work in this whole document**, because it is the one that stops a takeoff
being typed in twice.

### What a bid line actually is

Six things, frozen at add time by `addAssemblyToBid` (`server/db.ts`), and
nothing else:

| On the line           | Example         |
| --------------------- | --------------- |
| a name                | "Exit sign LED" |
| a count               | 14              |
| material cost for ONE | $38.00          |
| labour hours for ONE  | 0.50            |
| an hourly rate        | $68.00          |
| a modifier percentage | 0%              |

Two things follow, and they are the whole design:

1. **A bid line does not know what an assembly is.** Where those six numbers
   came from is not recorded and never consulted again.
2. **A line with nothing behind it already works.** `assemblyId` is nullable,
   and the shipped sample bid writes lines with it empty and hand-set numbers
   (`server/db.ts`, `createSampleBid`). Those lines price, tax, roll up and
   print today.

### So a counted group becomes a REAL bid line

Not a thing alongside. The bid line is already "a name, a count, a price each,
optional hours each", which is a literal description of what a counted group
holds.

**What "alongside" would cost:** the proposal, the sales-tax base, overhead,
profit, the accounting export, the close-out comparison, the dashboard totals
and the analytics rollup all read bid lines. A second kind of money is eight
places to teach, and the failure mode is a total that is right on seven screens
and wrong on the eighth.

**One line per GROUP, marked "from plans", its count following the marks.** This
is D2(a) in `references/takeoff-spec.md` and it stands, amended by OVERRIDE 2
above: live after the first crossing rather than from it. Costs freeze when the
line is first created (R4). A group with no price — level 1 — creates no line at
all.

**The group row is what makes this small.** When this section was first written,
"one line per group" was a plan; the group is now a real row, one per counted
thing per bid, holding the label and the price. A bid line is a name, a count
and a price. They are the same shape, so the bridge is one column and a rule
rather than a new concept.

**"From plans" needs no column of its own.** A line is from the plans if it
points at a group. Read from the absence, exactly as `takeoffRunTypesRouter`'s
`needsSpecification` is read from a null material link, and for the same reason:
a second flag is a second thing that can drift out of step with what it
describes.

**A typed price enters as material money**, so markup, overhead and sales tax
treat it exactly as they treat a material. That is what is wanted for 14 exit
signs, and it is worth saying out loud because it means a typed price is inside
the tax base when `taxMaterials` is on. Step two.

### The rule the whole step follows

> **The plans own what it is and how many. The bid owns what it costs.**

Every answer below falls out of that one sentence, and anything that cannot be
derived from it is a decision that has not been made yet.

### What happens when the count changes — the walk-through

Fourteen exit signs, sent, priced at $38 each. The line says 14 and $532.

**Two more are found and marked.** The line says **16 and $608**, next time it is
looked at. Nothing to press, no notification, nothing to re-send — the number was
never stored as 14, it is the number of marks and always was.

**The price does not move.** Not when material prices change, not when the
library assembly changes. R4, and the same rule every other bid line already
follows.

**Where the number comes from — one place, not six.** `getBidLineItems`
(`server/db.ts`) resolves a from-plans line's quantity from its marks before
handing the line to anyone. Five routers and the bid screen read through it, and
`countBidsWithLineItems` joins the table directly and must be looked at
alongside. This keeps the count DERIVED — the rule `shared/takeoffCounts.ts` and
`takeoffGroupsRouter.list` already live by — without teaching six screens to
count marks. Storing the quantity and writing it on every mark change is the
shape that drifts: one missed write and the bid and the drawing disagree with
nothing on screen to say which is right.

**Renaming the count renames the line.** A deliberate departure from how an
assembly line behaves, and the reason is the distinction the snapshot rule
actually rests on: a line's name is frozen so **the library** cannot rename
something behind the estimator's back. **A group is not the library.** It is
their own row, on this bid, that they made and they renamed. Freezing it would
leave the panel and the bid calling one thing two names.

**Deleting every mark leaves the line at 0, saying so.** It does not vanish.
Money leaving a bid because somebody undid a click, with nothing on screen
recording that it happened, is the worse failure — and a line at 0 is findable,
removable, and obviously wrong, which a missing line is not.

**If the line has already been edited by hand.** Only three fields are editable
on any line today (`bidsRouter.updateLine`: `qty`, `name`, `unitLabel`); cost is
already frozen everywhere.

- **Quantity — REFUSED, with the fix in the sentence.** "This line counts 16
  marks on the plans. Change it by marking or unmarking on the Plans screen."
  Not a new restriction: D2(a) already decided it — _"that line's quantity is
  changed by stamping, not by typing — one source of truth"_. Allowing both is
  how a line reading 20 sits beside a drawing holding 16.
- **Name — REFUSED too, and the first draft of this was wrong.** The version
  approved on 2026-09-19 said a hand edit was allowed and "detached" the name
  from the count. **That state has nowhere to live.** Recording "this line's
  name no longer follows" needs a column, and the approved database change is
  three additive things with no fourth. Without one, a typed name is accepted,
  written, and then overwritten by the group's label on the very next read — a
  field that takes an edit and silently drops it, which is worse than one that
  says no. So the name follows the count, and the refusal says where to rename:
  "This line is named by the count it came from. Rename that count on the Plans
  screen and the line follows." Corrected while building, before it shipped.
- **Unit label — allowed**, unchanged. It says which repeating unit the line
  belongs to, which is a fact about the bid rather than about the drawing.
- **Deleting the line — allowed, and it is the clean undo.** The group returns
  to "not on the bid", reappears in the waiting list, and can be sent again.

### The double-count rule, in code — R3

**Three different double counts, and they need three different answers.** R3 has
been listed **Missing** in the takeoff spec since 2026-09-14; this is where it
gets built, and § 7 already ruled that it goes in the CODE rather than only in
this document.

**(a) The same count sent twice — PREVENTED.** One live bid line per group, held
by a unique index so the database is what is true, plus a check in the router
above it so what reaches the screen is a sentence rather than a constraint
violation. Same two-layer shape as `takeoffGroupsRouter.refuseDuplicate`.

**(b) The same thing counted on the plans AND added by hand — MADE VISIBLE, not
prevented.** Both lines are legitimate rows: six receptacles that are genuinely
not on the drawing is ordinary work. D2(a) already chose visibility here, and it
is right. Two places, because one is not enough:

- **At the moment of sending**, while somebody is looking: "This bid already has
  a line for Duplex receptacle added by hand (6). Sending the count adds a
  second line."
- **A standing check on the bid screen.** The hand-added line can arrive AFTER
  the send, so a warning that fires once catches only half the cases. One
  function in `shared/` — does any assembly appear on both a from-plans line and
  a hand-added one — read by the bid screen and covered by a test. **This is the
  half that makes R3 code rather than a note**, and it is the half a one-time
  warning would quietly leave out.

**(c) Wire counted twice** — a starter device assembly carries 25 ft of NM-B
built in (`server/seed/baselineAssemblies.ts`), and the run feeding that device
is also traced. Flagged in the takeoff spec since 2026-09-14. It cannot bite
until **runs** reach the bid, so it belongs to step two — named here so it is not
discovered there.

### The supplier materials list breaks, and it is fixed in the SAME step

**This is the one real breakage, and it is live rather than theoretical.**

`materialsListRouter` builds the list from two sources — marks on the drawing
and lines on the bid — and treats them as independent **because they were**. Its
header said so in as many words: "stamping does not create a line item — so a
bid can have either, both or neither".

The moment stamping does create one, a sent count reaches the supplier list
**twice**: once from its fourteen marks, once from its bid line. A supplier
quotes twice the parts, and nothing on the document says so.

So the fix ships in step one, not after it: a group with a live bid line is
counted from the line, not from its marks. **And the header comment changes with
it.** A comment asserting what the code no longer does is exactly the fault
`CLAUDE.md` § "And the same distrust applies to a comment" describes — it is
worse than no comment, because the next reader takes it as current and builds on
it. That is how § 2 of this document came to specify the option D3 had already
rejected.

### What step one does NOT change

**No existing bid reads differently.** Nothing creates from-plans lines
retroactively. Every line on every bid today has an empty link, prices
identically, appears identically, and exports identically. The only bid that
changes is one where somebody afterwards chooses to send a count.

**No pricing code changes.** `shared/pricing.ts` is untouched. A from-plans line
is an ordinary line with an ordinary snapshot, which is the entire reason this
was built as a real bid line rather than a thing alongside.

**The proposal, accounting export, close-out, dashboard and analytics need no
code change.** They read bid lines, and a from-plans line is a bid line. Their
totals move because the bid has more on it, which is correct.

**One behaviour worth naming rather than discovering:** `countBidsWithLineItems`
drives the onboarding checklist's "first bid" step. A from-plans line will tick
it. That is right — the work was done — but it is a path that check has never had
before.

### Database changes — three, all additive, riding with the production migration

1. **`bid_line_items.takeoffGroupId`** — nullable, null on every existing row.
2. **A unique index** on (bid, group), so one count cannot hold two live lines.
3. **A guard on deleting a count that is on the bid.** Neither obvious option is
   acceptable on its own: `set null` leaves a from-plans line pointing at
   nothing, frozen, with a quantity that no longer follows anything and no way
   to tell; `cascade` pulls money off a bid because somebody tidied a drawing.
   So the router refuses with a sentence naming the line, and the foreign key's
   RESTRICT is the backstop underneath it. `takeoffGroupsRouter.remove` already
   reports what it removed, and the screen already asks first.

**They ride with the production migration — one sitting, not two.** The
DigitalOcean database is built by running every migration against an empty
database (`references/deploying.md` § "A new database has to build from the
files alone"), so there is no cost to these landing in the same run. Two
constraints hold: a new migration must be dated after every existing one or
every existing database skips it silently, and one statement per file as 0046
onward established.

---

## 5f.2 Step two — the typed price, the material price, and traced runs

Everything below is designed and NOT approved for building. Step one ships
first.

### THE GATE ON STEP TWO: traced footage reaches the bid with NO LABOUR BEHIND IT

**Found 2026-09-19, while checking whether runs belong in step one. They do not,
and this is why.** Recorded as a gate rather than a note, at the estimator's
instruction, because it is the exact failure this project has a standing rule
about and it arrives wearing a correct-looking number.

**A run type names a raceway material and a conductor material. Materials in
this app carry no labour hours — nowhere in the schema.** So a traced run sent
to the bid through the obvious path arrives as **340 feet of pipe, at material
cost, with zero hours to install it.**

That line is materially right and wrong on the number that decides whether a job
is won at a loss. It does not look wrong. It totals, it taxes, it takes markup,
it prints on a proposal, and the only symptom is money — which is precisely the
failure `CLAUDE.md` § "AI features" records about `invokeAnthropic`: a hole the
types allowed, that nothing complained about, found a year late by accident. It
is also the failure `shared/takeoffQuantities.ts` already refuses to permit for
verticals, and for the same stated reason: **a total that is too high gets
queried, and a total that is too low looks like a competitive bid.**

**So: no traced footage reaches a bid line until labour on a run has an answer.**
Not a smaller version, not behind a flag, not "material only for now with hours
to follow". A priced run with no hours is the plausible-but-wrong number this
whole document exists to keep off a bid.

Two more things must exist before runs cross, and both are smaller than the
labour question:

- **The three allowances are not built** — no waste, makeup or routing columns
  exist on `takeoff_run_types` or anywhere else (§ 2.2, § 2.3). Measured length
  is not purchased length. Sending traced footage now is short by exactly the
  waste, and § 5a forbids the app quietly padding to cover it.
- **A run has no per-bid identity to hang a line off.** Six homeruns of ½" EMT
  across four sheets are one purchase. Exit signs on five sheets are one count
  only because the GROUP row holds them together; runs of one type have no
  equivalent row.

### How a traced run should eventually cross — the group row, again

**Recommended 2026-09-19, not approved.** Give a run type a **group row on the
bid**, the same row a counted thing gets. Then "½" EMT on this job" is a name, a
quantity and a price, and the bridge built in step one carries it with no second
mechanism to keep in step.

The alternative — a second link column and a second kind on the bid line — is
how one path starts lagging the other in small ways nobody lists, which is the
argument `takeoffGroupsRouter`'s header already makes for why stamping an
assembly does not bypass the group.

**What it is NOT:** one line per run. A conduit run is pipe, and wire, and the
drops at both ends folded into each — three quantities along one traced line
that `shared/takeoffQuantities.ts` goes to deliberate lengths to keep apart. Any
design that produces one line per traced path has collapsed them.

### 5f.3 Who owns the wire between devices — APPROVED 2026-09-20

**The gate above names labour as the blocker and the allowances as smaller. It
did not name the one that actually puts a wrong number on a bid**, which the
takeoff spec records separately: every starter device assembly already carries
wire inside it — 25 ft of 12-2 NM-B in the standard receptacle, 20–40 ft in
eight of eight — so the moment traced cable crosses, a job where you stamp
receptacles and trace their feeds counts the same cable twice. Two innocent
line items, neither wrong on its face.

**Settled by splitting the wire the way the trade does, so the overlap cannot
occur.** Full reasoning and the rejected alternative are in D18 of
`references/takeoff-spec.md`; this section is the mechanism.

- **Devices carry branch wiring between each other.** A whip per assembly — a
  troffer and a receptacle are different numbers. **Material only:** the
  assembly's typed hours already cover pulling it, which is what "0.45 h for a
  duplex rough-in" means.
- **Traced runs are homeruns only**, first device back to the panel.
- **One ownership function decides before anything sums**, the same
  construction as `totalVerticalFeet`: a foot of wire belongs to either the
  assembly or the run, never both. Not two checks that agree until somebody
  edits one.

**The per-job dial is the whip ONLY.** One number per bid for a building laid
out tighter or looser, ships at 0, applied at calculation time and written
nowhere — `productivityPct` is the precedent to copy, including its rule about
never being folded into another sum. **Traced footage is measured and is not
padded**, per § 5a.

**The guard asks, it does not decide.** `takeoff_runs` already carries
`startKind` / `endKind` and `"panel"` is a shipped height-type key, so
panel-to-device and device-to-device are distinguishable today. Copy
`shouldSuggestStampLink`: only ask where a double count is actually possible,
and only when both ends are POSITIVELY known non-panel devices — an unanswered
end is a different sentence, because a warning that fires on correct work is as
bad as silence. A junction box counts as a device and does ask, deliberately:
in the field a J-box is often mid-branch, which is the ambiguous case the guard
exists for. **The answer is recorded on the run**, like `endStampId`, because
re-asking is how a confirmed answer gets un-confirmed.

**Starter whips ship real, labelled and dated** — § 2.3, the deliberate
exception to the $0 rule, and for its stated reason: an unset allowance
whispers, and a zero one wins a bid you then lose money on. Residential
starters ship generous, commercial short or zero; that difference lives in the
SHIPPED VALUES and nothing at runtime reads `projectType`.

**THE WHIP IS AN INTERIM AND RETIRES PER DEVICE.** When AI routing between
fixtures lands, the routed footage replaces the whip for the devices it covers,
the way D17(b)'s per-end number retires to zero rather than being deleted.
**Per device instance, never per assembly** — routing one circuit of six
troffers must not zero the whip for the other forty on the job. So the whip
resolves per STAMP against a claim recorded on the stamp, the same shape as
`endStampId` claiming a vertical: claimed, never inferred. Any other
construction makes routing a second wire-counting path rather than a new way to
set an existing flag.

**And routing says what it counted**, in the voice the totals already use — "a
cable's ground is inside the cable and is already in the Cable figure", "no
vertical footage is in these numbers" — so nobody hand-traces the same wire on
top of it. The standing AI rules apply unchanged: routing is a button, never a
page load, and hand-tracing stays complete for somebody who never turns it on.

### Hours on a typed count — yes, and the rate is the real question

**Decided: level 2 carries optional hours.** It is nearly free. A bid line
already holds hours separately from money, so typed hours ride the field an
assembly's hours ride. Nothing in `shared/pricing.ts` changes.

**Hours are not money until something multiplies them, and that is the part that
needed deciding.** An assembly names a role and brings its own rate. A typed
count does not. Leave the rate at zero and 14 x 0.5 h costs $0 while the bid
looks finished — a failure the bid screen already warns about
(`client/src/pages/BidsPage.tsx`, "lines have hours but no labor rate").

- **Type hours, pick a role.** One dropdown, **shown only when hours are filled
  in** — the common case is material-only and must stay one field.
- **Default it to the company default role — and that wire-up is bigger than
  this section claimed.** CORRECTED 2026-09-19: the approved text said
  `pricing_defaults.defaultLaborRateId` "is written today and read by nothing
  that prices". Checked in the code: **it is neither written nor read.** No
  screen sets it — `bidsRouter.setPricingDefaults` does not accept it, and the
  only writer of a column by that name is `upsertBidSummary`, which writes the
  unrelated legacy `bid_summary` table. So this is a setting with no way in and
  no way out, and step two has to build both halves. **A setting that is stored
  and read by nothing is its own small lie**, and it is still in scope here — it
  is simply one screen larger than recorded.
- **No modifier list and no productivity override on a typed count.** The bid's
  productivity factor applies as it does everywhere. One escape hatch, not a
  second pricing system growing beside the first.

**Note the asymmetry this creates, deliberately:** materials carry no labour
hours anywhere in the schema, so level 3 (a count linked to a material) is
material-only by nature. A level 2 that can carry hours is therefore MORE
capable than level 3. That is not a mistake to tidy up — see the last paragraph
of this section on building them as one screen. It is the same absence the run
gate above turns on, seen from the other side.

### How it shows as what it is, without nagging

Three places, none of them shouting.

1. **Where it is set.** One line under the price field: this price lives on this
   job, it will not follow your material prices, and it will not appear in what
   needs pricing.
2. **On the item and on the line.** A small grey tag — "typed price" on the
   counted item, "from plans" on the bid line. **Grey, not yellow.** Yellow is
   already spent twice on that screen: conduit runs, and every warning in the
   app.
3. **The needs-attention list.** **It does not exist.** The closest things today
   are the yellow strip under the bid's labour total and the Materials screen's
   "No price" filter.

**Decided: extend the strip, do not invent a list.** The strip's rule is already
the right one — it sits directly under the number it contradicts — and a typed
price contradicts the material total:

> **3 counted items are priced by hand** — $1,240 of the material above is not
> from your materials library, so it will not move when your prices do.

**And a second entry, which matters more:** **level 1 counts that were never
priced.** "14 exit signs counted, no price" is money missing from the bid
entirely, which is worse than a price nobody can re-check. List only — **never a
badge on the drawing**, or level 1's promise of a quiet count is broken on the
screen where it was made.

**Step one adds a third entry to the same strip** — counts that are priced and
have not been sent (OVERRIDE 2). Three entries, one strip, one rule: it sits
under the number it contradicts.

### Converting a typed price into a real material later

**Realistic and cheap, because the group is a row.** Add a real exit sign
material with a real price, open the group, switch it from typed to that
material. One row changes. Fourteen marks stay where they are, the count stays
14, nothing on the drawing moves. `setLocationForAssembly` (`server/db.ts`)
is the precedent for retagging a whole group in one action.

**The bid line that already exists gets RE-SNAPSHOTTED, and says so** — "re-priced
from Exit sign LED, 18 Sep". The snapshot rule exists to stop the LIBRARY moving
a bid behind the user's back. This is not that: it is the user deliberately
changing where the price comes from, and freezing it here would leave a bid
stuck on a number they had just replaced. **It must not add a second line** —
that is a double count, and R3 exists to make those visible rather than
accidental.

This is the same distinction step one's renaming rule turns on: the group is the
user's own row on this bid, so the user moving it is not the library moving.

**What conversion cannot do is tell you the $38 was wrong.** Show both numbers
side by side and let the estimator look.

### Offering to put a typed price in the library — after, never before

**Asked for 2026-09-18. Plan only.** Once something has been counted with a
typed name and price, offer to add it to the library so the next job has it.

**The rule that shapes everything else: ask AFTER, never before.** An offer
that appears while somebody is counting rebuilds the interruption level 2
exists to remove. This is the catalog half of CLAUDE.md § "As manual or as
automated as the user wants".

**So it is not a prompt at all — it is an action on a row that already exists.**
The needs-attention strip already lists typed-price counts ("3 counted items
are priced by hand"). That entry gains "add to my library" as a one-tap action
on the count it names.

That placement answers the nagging question by removing it rather than
managing it:

- It cannot interrupt, because it lives in a list somebody opens rather than a
  thing that finds them.
- It cannot be shown twice, because it disappears when the count is saved.
- It needs no "don't ask again", no dismissal state, and no column to store one.
- And it is in the one place somebody is already reviewing what is unpriced —
  which is exactly when "should this be in my library?" is a live question.

**If an active offer is ever wanted on top of that**, the rules are: once per
count, ever; declining removes it permanently for that count; never more than
one on screen. But the list action should ship first and probably makes the
prompt unnecessary.

**Material or assembly, decided by what was typed, not by asking:**

| Typed             | Saved as                                                            |
| ----------------- | ------------------------------------------------------------------- |
| A price           | A material at that price                                            |
| A price and hours | A material, plus an assembly that contains it and carries the hours |

The second row is the one to be careful about, and it is why this is not a
one-line feature: "price plus hours" is two library rows, not one. An assembly
with hours and no materials is a legitimate but different thing (the labour-only
case the materials-list note already handles), and silently creating one
would lose the price. So the honest save creates both and links them, and says
so in one line before it does — naming the two things it is about to make.

**The labour rate comes along**, because level 2 already collects a role when
hours are typed. Nothing new to ask.

### Typing a name the library already has — three doors, and the middle one is the default

**Asked for 2026-09-18. Plan only.** The instinct to reject, recorded because
it was nearly asked for: **typing a price must never quietly overwrite the
library's.** That would make a keystroke on one job change what every other job
is priced from.

**But the danger is narrower than it looks, and the design should say so
honestly rather than inherit a fear.** Checked in `drizzle/schema.ts`: a bid
line freezes its four pricing inputs when it is added, so **a bid that has
already been priced does not move when a library price changes — including one
already sent.** What a library change actually moves is every FUTURE add, and
any count that has not yet become a bid line. That is a real exposure and worth
a warning; it is not the catastrophe of retroactively repricing sent work.

**Three choices, presented unequally on purpose:**

1. **Use the library's price.** The count becomes a normal material count
   (level 3) and re-prices when the library does.
2. **Use my price, on this job only.** The library is untouched; this bid
   carries its own number and says it does. **This is the default and the
   recommended one** — the person typed a price, so they mean a price, and
   "this job differs" is the common case.
3. **Update the library.** Deliberate, behind a warning naming what actually
   moves — every future bid and any count not yet priced, and **not** bids
   already priced. Same shape as the company-heights warning, with an accurate
   sentence rather than a frightening one.

**What it costs.** Option 2 is the level-2 path already specified, so it is
free. Option 1 is level 3, also already specified. Option 3 is a library write
plus the count-of-affected-bids query behind the warning — the one genuinely
new piece, and the smallest of the three. The work is almost entirely in the
moment of collision: noticing the name matches, and presenting three doors in
the right order without turning a typed word into a modal interrogation.

**What it must not become:** a dialog every time a typed name resembles
something. It fires on an exact match of a name the user already has, and on
nothing else.

### Where the line is drawn differently from how it was first asked for

- **Levels 2 and 3 are ONE feature with two price sources.** Once a group holds
  a typed cost and optional hours, level 3 is "fill that cost from a material
  instead of typing it, and keep the link so it re-prices". Same screen, same
  fields, a toggle on where the number comes from. Two screens that do almost
  the same thing will drift apart.
- **No "save this price to my library" button.** It will look obviously
  helpful. It is how a materials library fills with rows named "exit sign" at
  prices nobody sourced, and those rows then look exactly like real ones.
  Conversion goes one way only: go and add the material properly.
- **Level 1 and its needs-attention entry ship together.** "Never reaches the
  bid" is only safe when the count is findable somewhere.

---

## 5g. The proposal choice is made once for the COMPANY, and it has to be made per BID

**Asked and answered 2026-09-18. Not built.** The want: the same bid shown
several ways, chosen per bid, because a Dollar Tree remodel wants a lump sum and
a school district wants a breakdown.

### The headline, because everything else here is smaller than it looks

**`proposal_settings` is keyed by user and trade — company-wide.** Which
sections a proposal shows is one decision for every document the contractor ever
sends. **Switching sections off for the Dollar Tree job changes the school
district's proposal too.**

That is the whole gap. It is not layouts, not sections, not arithmetic: those
exist, and more of them than expected. **The document cannot be told apart from
the job it belongs to**, and no amount of new breakdown options fixes that,
because every one of them would land in the same company-wide row and be wrong
for the next bid out the door.

So the first piece of work here is **where the choice is stored**, not what the
choices are. Everything below is content for a control that does not yet have a
home.

### What a customer can be shown TODAY

More than expected, which is the other half of why the gap is where it is.

- **Three layouts** — classic, modern, minimal — plus an accent colour and a
  logo. Deliberately no template upload and no free-form editor: the user picks
  between finished documents (`shared/proposal.ts`).
- **Ten sections, eight of them switchable.** Only two cannot be turned off: the
  letterhead, because a document with no sender is not a proposal, and the total,
  because one that does not state a price is not either.
- **Two modes** — `full` and `scope-only`. Scope-only removes every money
  figure so a GC can agree WHAT is being done before bid day.
- **Scope of work** lists what is included **by name and quantity, never with
  unit costs**, and it already GROUPS by `unitLabel` — so "Room 101" or
  "Building A" is a heading today, for free, because that field is free text.
- **Price per unit** gives a per-room or per-apartment price.
- **Labor summary** gives total estimated hours.

**So a lump sum already exists**: switch off everything switchable and the
document is a letterhead and a number.

### What is missing, and it is one thing more than it looks

| Wanted                                  | Status                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Lump sum — one number                   | **Exists.** Hide the optional sections                                                            |
| By area or by room                      | **Mostly exists.** `unitLabel` groups the scope section already                                   |
| Labour and materials split              | **Missing.** Deliberately: the total folds materials, labour, overhead and profit into one figure |
| Full cost breakdown, every line priced  | **Missing, and deliberately refused** — see below                                                 |
| By system (lighting, power, fire alarm) | **Missing**, and the only one needing a database change                                           |
| **Chosen per BID**                      | **Missing, and this is the real gap**                                                             |

**The per-bid row is the headline above**, and it is the only one of these that
blocks the others. A lump sum "exists" today in the sense that the switches
exist — but switching them for one client re-dresses every proposal the company
sends, so in the sense that matters it does not exist either.

### What it needs, and how little of it is new arithmetic

**The allocation rule already exists and is already reasoned.** Per-unit pricing
scales a unit's direct cost by the bid's own cost-to-price ratio so the parts sum
to the quoted total, and `shared/proposal.ts` says why: "Anything else prints
per-room figures that visibly do not sum to the number underneath them, which is
the fastest way to lose an argument about a price."

**Every breakdown option is that same rule pointed at a different grouping.**
Which makes most of this presentation, not pricing:

- **Labour and materials split — no database change.** The rollup already
  carries `materialCost` and `laborCost` separately; the Bids screen shows
  both. The split must be of the PRICE, pro rata, not of the bare cost — two
  numbers that do not add up to the total are worse than one number.
- **Full breakdown, every line — no database change.** The lines and their
  snapshots are already there. What it needs is a decision, because
  `shared/proposal.ts` currently refuses it on purpose: "nothing on the page
  that invites a line-by-line negotiation of the contractor's margin." **That
  refusal is right for a Dollar Tree remodel and wrong for a school district,
  which is exactly why this becomes a per-bid choice rather than a setting.**
- **By system — the one database change, and it is small.** The grouping key is
  `assemblies.category`, which a bid line does not store; reaching it means a
  live join that returns nothing once the assembly is deleted. So: snapshot the
  category onto the line, exactly as `takeoff_stamps.assemblyCategory` already
  does and for the same stated reason.
  **Two warnings.** The five categories are library filing — Devices, Lighting,
  Panels, Equipment Connections, Low Voltage/EMS — **not the systems a customer
  would recognise**, and there is no fire alarm among them. A customer-facing
  "by system" summary either prints "Devices" as a heading or needs its own
  user-editable grouping. Decide that before building it.
- **By area — nothing to build, and a conflict to know about.** `unitLabel` is
  free text and already groups the scope section, so typing "First floor" works
  now. But a label also makes a unit a candidate for the template and
  mass-duplicate machinery (`bid_unit_links`), so areas and repeating units
  would share one field. Cheap today, worth a real `area` column later if it
  gets used.

### Storing the choice per bid — and the existing decision it has to answer

`proposalsRouter` deliberately does NOT store the mode: "A stored preference is
one that can be left on scope-only by accident and then printed as if it were
the priced proposal."

**That reasoning holds for scope-only and does not extend to a breakdown
shape**, and the difference is exactly what makes storing this safe: every
breakdown option states **the same final price**. Scope-only is dangerous
forgotten because it removes the price; a breakdown left on "by system" prints
the same total as a lump sum, in more detail. **So the breakdown may be stored
per bid. Scope-only stays transient.** Do not merge the two controls.

### Alternates and allowances — raised as a footnote, promoted on 2026-09-18

**These outrank every breakdown option in this section, including the
labour/materials split that prompted it.** Neither was asked for; both are
staying, and this one moves to the front.

An alternate is an add or deduct priced separately from the base bid — "deduct
$4,200 if the owner supplies the fixtures", "add $11,800 for the gym lighting
package". An allowance is a stated sum carried for work that cannot be priced
yet.

**Why this is not a nice-to-have.** This contractor bids federal and public
work, where alternates and allowances are requested constantly and the bid form
names them. **A breakdown shape is a preference — a missing alternate can make a
bid non-responsive and get it rejected unread.** That is a different category of
consequence from a proposal that groups its lines the wrong way, and it is the
reason this is written down here rather than left in a list of ideas.

It is also **not** a presentation choice, which is why it cannot ride along with
the rest of this section: an alternate is money that is deliberately NOT in the
base total, with its own scope and its own accept/reject state. That is data the
bid does not carry today, and it wants designing on its own terms — probably
closer to `bid_expenses` (a named amount with its own tax and markup flags)
than to anything in the proposal builder. **Not specified here, and not to be
bolted onto the breakdown control when that gets built.**

### Also noted, not scheduled

- **A schedule of values** — the breakdown a GC needs for progress billing, by
  phase rather than by system. A different audience from a proposal, and
  probably its own document rather than another option here.

---

## 5h. Takeoff-only jobs — is it a real state?

**Asked and answered 2026-09-18. Not built.** The want: sometimes a job is a
materials count for a supplier quote and nothing else — no labour, no overhead,
no proposal.

### The materials list already does the job

It works on a completely unpriced bid, by design and with tests that assert it:
no labour rate, $0 materials, no pricing defaults, and the quantities come out
identical to a priced bid. It is reachable from the takeoff screen's toolbar from
the first mark, ahead of "Add PDF", on the reasoning that a contractor asks for a
quote precisely because they do not yet know what things cost. It exports CSV and
PDF and carries no money anywhere.

**So nothing is blocked today.** The suspicion in the question — "am I just
describing not using features I do not need" — is half right.

### What is NOT right today: the app nags a finished job

A count-only bid is complete work, and the app treats it as an unfinished bid.
The pricing prompts are all correct for a real bid and all wrong for this one:
the $0-labour-lines strip, the getting-started push toward a labour rate, a
dashboard showing the job at $0, and `jobsWithoutLaborBasis` counting it in
analytics as a job that "carried no estimated hours". **A job that is finished
and permanently complained about is the actual complaint.**

**And level 1 makes it worse.** A bid full of level-1 counts has no line items by
design (§ 5e), so it looks unpriced to every one of those checks. The nagging
gets louder exactly as the feature that invites counting-without-pricing ships.

### Recommendation: one bit, and NOT a mode picked at the start

- **Not a mode chosen when the bid is created.** That is a decision made when
  the user knows least, and jobs change their mind — "I will price it after all"
  must not mean switching a mode off to be allowed to.
- **Not derived either**, though this codebase rightly prefers derived state
  (counts from rows, "a template is a template because other units point at
  it"). What the nags are about is **intent**, and no amount of data says whether
  a user MEANT to leave a job unpriced.
- **So: one nullable column on the bid**, doing one job — silencing the pricing
  prompts and keeping the job out of the analytics that assume a priced bid. It
  hides no features and changes no number.
- **Offered at the moment the app would otherwise nag**, not at the start: "This
  job has 240 counted items and no pricing. Is that deliberate?" → yes, it is a
  takeoff. **That turns a recurring nag into a question asked once**, which is
  the whole value, and it is why the column earns its place.

**Win and loss stay out of it.** A takeoff-only job is not won or lost, and it
must not reach win-rate analytics as either.

---

## 5i. Filtering a messy sheet — what Layers reaches, and what it does not

**Surveyed 2026-09-18 from a question about hiding everything except what is
being worked on.** Nothing here is broken; this is what exists and where it
stops.

### What it does today

Two axes, independent and combining, so "only devices, and only the ones
underground" is one state rather than a choice (`shared/takeoffLayers.ts`):

- **System** — the assembly's Category for a mark, and `Conduit runs` /
  `Cable runs` for a trace.
- **Location** — the six placed locations, plus an explicit **Unassigned** band
  rather than a hiding place.

Each row carries a count, and the panel says plainly when a subset is showing —
because a filtered takeoff that looks like a complete one is how somebody
quotes a job missing half its receptacles.

So: "only lighting" works for assembly-backed counts, "only conduit" works,
"only one location" works.

### Three gaps, in the order they will matter

**1. Every plain count lands in one `Uncategorised` band, so three counts are
one checkbox.** `systemKeyForStamp` returns `Uncategorised` when there is no
category, which is right for what it was written for — a mark whose assembly
predates category snapshotting still needs somewhere VISIBLE to live. Level 1
then arrived and every plain count has no category by definition, so exit
signs, floor boxes and fire alarm pulls share one row and cannot be isolated.

**The fix is cheap and the group row is why: the GROUP is the natural layer
key.** A counted group already carries the label a person would look for, it is
already one row per counted thing, and the panel already groups marks by it.
The category stays the key for assembly-backed counts — "show me all the
lighting" is a question about a category, not about one count — so the System
axis gains a band per plain count rather than replacing what is there. Sizing
is the only real question: forty plain counts would be forty rows, and § 6's
"customization available, but never in the way" rule applies — the common few
visible, the rest behind one control.

**2. Run types cannot be filtered because they do not exist.** Once § 2.0's
palette ships, a run type is the obvious System-axis key for traces, replacing
the two-row `Conduit runs` / `Cable runs` split with something that names what
the run actually is. That is not extra work on top of the palette; it is the
palette becoming visible in the one place that already filters.

**3. Circuits are rows, not a grouping.** `takeoff_run_circuits` belongs to one
run, so six lighting homeruns are six unrelated circuit rows that happen to
share a name. There is nothing to filter or colour by yet. Whether circuits
should become a shared entity is a real question and it is NOT answered here —
note it, and answer it when something needs it rather than inventing a table on
a hunch.

## 5j. EXTRA — the word, and the arithmetic it has to show

**Named 2026-09-19, at the estimator's instruction.** "Extra wire" and "extra
conduit" is what gets said out loud on a job, and it does not sound like
padding. **"Waste", "slack" and "allowance" are retired as user-facing words**
for these three numbers — here, in § 2.2, § 2.3 and § 7.1, and in
`references/takeoff-spec.md` T16 and R7, both of which carry a line pointing
here.

**This is a naming decision and nothing else.** Three quantities, three units,
three rules about what each one applies to — all unchanged. What changes is the
word on the screen and the fact that the number has to be visible.

**Why the word earns its own section.** An "allowance" sounds like a cushion
somebody added and could take off again, which is exactly the reading that gets
it argued down to zero. Extra conduit is conduit that gets bought, bent and
installed. A bid without it is not a leaner bid, it is a short one — and § 2.3
already records why the short one is the expensive mistake.

| What              | Unit                       | Applies to                       | Was called                             |
| ----------------- | -------------------------- | -------------------------------- | -------------------------------------- |
| **Conduit extra** | percentage                 | traced length ONLY (§ 7.1)       | conduit allowance; routing waste (T16) |
| **Wire extra**    | percentage                 | traced AND vertical (§ 7.1)      | wire allowance                         |
| **Makeup**        | feet per conductor per end | wire only, never conduit (§ 2.2) | makeup allowance (R7)                  |

**Makeup keeps its own name**, and that is deliberate rather than an oversight.
It is trade language for a real thing — the tail left at each end — not a
euphemism for padding, and it is not a percentage. Folding it into the word
"extra" is the first step toward somebody folding it into the wire percentage,
which is the mistake § 2.2 exists to prevent: it does not scale with length, so
a percentage is the wrong unit twice over. It shows as its own term.

### Where it shows — the same shape as the verticals arithmetic

Per run, one line per thing that gets bought, every term visible:

```
Conduit   112.00 traced + 8.50 vertical + 5.60 extra = 126.10 ft
Wire      336.00 traced + 25.50 vertical + 36.15 extra + 12.00 makeup = 409.65 ft
```

That is § 5d's rule extended by one term, and for the same stated reason: a
total with the extra folded in is exactly as invisible as not counting it. The
estimator has to be able to see where every foot came from.

**A term that is zero is dropped, EXCEPT when the zero means "nobody set
this".** `+ 0.00 extra` is noise standing where a number goes. But an extra of
zero because no value has ever been entered is the whisper § 2.3 warns about,
so it gets the treatment a flat-only run already gets: the run says it out loud,
and the totals panel counts them — "23 runs carry no extra".

In the bid total, the same shape:

```
Conduit   1,240.00 traced + 255.00 vertical + 62.00 extra = 1,557.00 ft
```

### Where it is SET — on the type, not on each run

§ 2.0's division of ownership decides this: the TYPE owns what a run is made
of, and a percentage covering route uncertainty is a property of the kind of
run, not of one traced line. The run may still differ and says when it does.

Inheritance follows § 2.5, gaining the level § 2.0 added:

> company default → run type → this run

NULL at any level means "follow the level above", never a value copied down at
creation.

**This reconciles takeoff-spec T16**, which said the routing factor is "a
company default, overridable per bid — not per run". That was written on
2026-09-14, before the run type existed, and its real target was D15's per-run
form. The chain above keeps that intact: the company default is still where it
starts, and there is still no form of nine fields on every traced line.

### Starter values — unchanged from § 2.3

10% wire, 5% conduit, 2 ft per conductor per end, more at panels. Shipped with
real numbers rather than zero, labelled as starters, dated, for the reasons
§ 2.3 gives. `server/seed/baselineRunTypes.ts` currently says in its header that
no allowances ship; that comment is where they will ship from, and it gets
rewritten rather than deleted.

### What this does NOT do

**It does not put traced footage on a bid.** § 5f.2's gate stands and is
unchanged: a run priced from its type reaches the bid as footage at material
cost with **zero hours to install it**, because materials carry no labour hours.
The extras are one of the three things that gate names, and they are the
smallest of them. Building them does not open the gate.

---

## 5k. Branching a run — asked 2026-09-19, recommended, NOT approved

**The ask:** while tracing conduit, start a new line but keep it on the same run
— a branch off the main route, or a second leg belonging to the same circuit.
Today every trace is its own run.

### Two different things are hiding in one sentence

1. **A branch.** A tee. A second path leaving the first somewhere along its
   length. One raceway system, one circuit, two routes.
2. **A second leg.** The same run continuing after a stop — the other side of a
   wall, another part of the sheet, a trace that was interrupted.

They want different mechanisms, and telling them apart is most of the design
work. The second one is largely **T7 (pick up an interrupted trace) and T9
(extend a finished run)**, both already on the essential list in
`references/takeoff-spec.md` and neither built. **Extending a run needs no
schema change at all** — it appends to a polyline that already exists.

### What D7 said, and why this overrides it

**D7 (2026-09-14)** chose how much run editing to build: "(a) drag a point, add
to the end, delete a point, rename", and deferred "(b) gaps inside a run and
splitting one run into two" with **"Add (b) only if it turns out to be
needed."**

**It has turned out to be needed**, said by the estimator on 2026-09-19 while
using the app. That is an override, and under CLAUDE.md § "Where decisions live"
it is recorded in both files: takeoff-spec's D7 gets a line pointing here.

### The recommendation: a leg is a ROW, not a longer polyline

Three shapes are possible. Only one of them leaves the existing arithmetic
alone.

1. **One run row, `points` becomes a list of paths.** One row, many polylines.
2. **A run row per leg, linked by a parent.** `takeoff_runs.parentRunId`, null
   on a plain run.
3. **A shared circuit entity every leg points at.**

**Pick 2**, for four reasons in descending order of how much they would hurt:

- **A run carries TWO ENDS, and the whole vertical calculation hangs off them**
  (§ 5d). One row with three paths has six ends and nowhere to put four of
  them. One row per leg keeps the ends exactly where `quantitiesForRun` already
  reads them, and Phase 5 needs no revisiting.
- **The tee end is a new end KIND, and it is the load-bearing part.** A branch
  that starts on another run has **no vertical at that end** — it is the same
  pipe at the same elevation. Without an end kind that contributes zero, every
  branch double-counts a drop. That is § 5d's double-count trap wearing a new
  hat, and § 5d already put the rule in code rather than only in prose.
- **Deleting a leg stays a delete.** Under shape 1 it is surgery on a JSON
  array, with the run's cached length and `scaleRatioUsed` to keep in step.
- **Totals need no new arithmetic.** `totalQuantities` already sums rows; the
  panel nests legs under the parent for display and nothing underneath changes.

**Shape 3 is probably right eventually and is the wrong first step.** § 5i
already notes that circuits are per-run rows today, that whether they should
become a shared entity is a real question, and that the answer should wait for
something that needs it rather than a table invented on a hunch.

### What a leg inherits, and what it must not

- **The type, from the parent — but the leg owns its own.** A branch off a 3/4"
  EMT run starts as 3/4" EMT, and in practice a branch is often smaller. It
  inherits, it may differ, and it says when it differs. That is § 2.0's rule
  verbatim.
- **Circuits: seeded from the parent, owned by the leg.** § 2.1 is emphatic
  that the app must never decide what a pipe carries.
- **One name for the whole thing.** Legs are not separately named. The panel
  shows the parent's name — "Panel A → Switch" — with "2 legs" under it, and
  the run's totals are the sum.

### The question this does not answer

**Where the branch starts.** Snapping the first click to a point on the
parent's path is the obvious answer and will be fiddly at 20% zoom. Proposed:
the first click of a branch snaps to the nearest point ON the parent path
within the hit target the runs already use (`HIT_TARGET_PX`, 18 screen pixels,
so aiming near a run is aiming at it), and the panel then states which run it
left and how far along. **Shown, never assumed** — if the snap picked the wrong
run, the vertical at that end is wrong, and § 5c's rule is that the app
suggests and the estimator confirms.

### Where it belongs in the order

**After T9 (extend), before anything reaches a bid.** Extend removes the "I
stopped and want to keep going" half of the ask with no schema change; what is
left is the genuine tee, and it is worth building against the smaller remaining
problem. The § 5f.2 gate covers legs exactly as it covers runs: no traced
footage reaches a bid line until labour on a run has an answer, however the
footage was traced.

---

## 5l. § 9 restated as ONE flow — one button, a list to correct, then counting

**Rewritten 2026-09-19 at the estimator's instruction, whose words this follows.**
§ 9 (legend capture) and §§ 10–11 (the tiled read) were written as two features
because they are two builds. **They are one thing to use**, and writing them
apart is how the first half ships as a feature nobody can finish with: a
captured legend that counts nothing is setup work with no payoff at the end of
it.

The flow, in order, with what each step already has behind it:

**1. One button: read the legend.** Not "capture a symbol", twenty times. It
scans the legend sheet and finds **every** symbol at once. § 9.2 steps 1–2 are
the mechanism: the text layer first where there is one (free, cannot
hallucinate, and **measured worthless on both real sets** — build it as an
accelerator, never a dependency), then one model call per legend region on a
region render at a scale where the symbols are legible.

**2. The right panel lists what it found.** So you can see at a glance whether
anything is missing. The boxes are still drawn on the drawing (§ 9.2 step 3) —
the estimator is looking at the legend and the proposals belong on it — but
**the list is what makes a miss visible.** A symbol the reader never boxed
leaves no trace on the drawing; it leaves a gap in a list you can read down.

**3. Next to each one, say what it is.** Four choices, and they are already the
four levels in § 5e, all shipped or specified:

| What you type beside a symbol      | Level |
| ---------------------------------- | ----- |
| An assembly from the library       | 4     |
| A material                         | 3     |
| A name and a price, hours optional | 2     |
| Just a name                        | 1     |

**Nothing new is needed in the data model for this** — the group row carries all
four, and level 1 and level 4 are live today. It is the same picker the Mark
tool already opens, reached from a legend row instead of a toolbar button.

**4. Then scan the plan set and mark every device it finds.** This is §§ 10–11's
tiled read, entered from the same place rather than from a separate control.
Per sheet, results shown as they arrive (§ 11.3), cached so a sheet is read once
(§ 11.4). **This is the step that is gated on § 15's bake-off**, which has not
been run.

**5. Each device type gets its own shape and colour.** **Built, shipped
2026-09-18** — `shared/takeoffMarks.ts`. Lighting is a triangle, Devices a
circle, Panels a square, Equipment connections a diamond, Low voltage a hexagon,
and the colour separates counts within a shape. Nothing here needs building; it
needs connecting to step 3, so the shape a symbol will be marked with is visible
in the list before a single mark is placed.

### REORDERED 2026-09-21 — memory first, bulk scanning last

**At the estimator's instruction, and it inverts the order above.** The flow in
steps 1–5 is still the right flow. What changed is which end of it gets built
first, and the reason is one sentence from the person who would use it:

> One symbol at a time is fine if it only happens ONCE.

Circling a symbol and saying what it is was never the burden this section
assumed. Doing it again on the next set is. So the value is not in reading
twenty symbols in one press — it is in never reading the same symbol twice.

**The order now:**

|         | What                                                                          | Blocked on                           |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| **(a)** | **Capture remembers, and suggests on the next set.**                          | Nothing.                             |
| **(b)** | **An AI suggestion can become a PLAIN COUNT**, with no library row behind it. | Nothing.                             |
| **(c)** | **Bulk scan the legend, then the set.** Steps 1 and 4 above.                  | § 15's bake-off, which needs tiling. |

**The ordering is not a preference, it is what is unblocked.** (c) is the tiled
read, and the tiled read is gated on a bake-off nobody has run — § 5m says so at
length and § 15 has said so since it was written. (a) and (b) are gated on
nothing at all. Shipping the blocked half first is how a captured legend that
counts nothing becomes setup work with no payoff, which is the exact failure the
2026-09-19 rewrite was written to avoid — arriving from the other direction.

**(b) is small and it is the one that removes a precondition.** A reader finding
is a proposal about a SHAPE on a drawing; it does not need a library entry to
become a count. Level 1 already exists for exactly this (§ 5e), and the four-way
picker in step 3 already offers it. What is missing is that an accepted AI
finding currently wants somewhere to land. Letting it land on a plain count is
the same rule CLAUDE.md states for the catalog: setup before value is what made
the old stamp tool unusable on a fresh set.

### THE RULE THAT DOES NOT MOVE: a remembered match never silently applies

A remembered symbol comes back as a **suggestion on the next set, confirmed
there**, and never as a mark that appeared because a previous job had one.

This is § 5c applied to memory rather than to a model, and it matters more here,
because a remembered match is more plausible than a fresh guess and therefore
easier to accept without looking. Two architects draw a duplex receptacle
differently; one of them draws it the way the other draws a floor box. A
silently applied memory is a wrong count with a confident provenance, which is
the worst kind this app produces.

So: remembered matches arrive in the same list, in the same unticked state an
uncertain finding arrives in, and the set they came from is named on the row.

### What is already built, measured 2026-09-21 rather than assumed

**MOST OF (a) IS ALREADY SHIPPED, and a first draft of this section said
otherwise.** It claimed "there is no suggestion surface on a new set". That is
wrong, and C9 in `references/takeoff-spec.md` has said so all along — it is
marked **Works**, with "the link is remembered on every future job". Checked
2026-09-21 rather than argued with:

- `symbol_links` is scoped to the USER, not the bid — `label`, `lookupKey`,
  `assemblyId`, `thumbnail`, `capturedFromSheetId`.
- `takeoffStamps.symbols` is documented in its own comment as "every symbol
  this user has captured, across all their jobs", and takes no bid argument.
- `TakeoffPage` loads it unconditionally, so opening a brand-new set already
  shows every symbol you have ever captured, one click from stamping.

**So (a) is not "build memory". It is "make the memory notice THIS set".** The
gap is narrower and more interesting than a missing surface:

- **Nothing matches a remembered symbol against what is on the sheet in front
  of you.** The panel is a flat list of everything you have ever captured, in
  capture order, whether or not any of it appears here. On the tenth job that
  list is the problem rather than the feature.
- **Nothing populates `capturedFromSheetId`**, so a row cannot say which set it
  was learned from — and the rule above requires saying so on the row.
- **`assemblyId` is the only destination**, which is exactly what (b) widens.

**The rule is not currently violated, and that is worth stating.** A remembered
symbol appears in a list; it does not place a mark. Nothing silently applies
today. What (a) must not do is buy matching at the price of that property.

### And the overlap question, asked and NOT answered

**The instruction was to check rather than assume how often the two real sets
share symbols. The honest answer is that it cannot be measured from anything
the app or the files currently hold**, and saying so is worth more than a
number nobody could reproduce:

- **Neither set has ever been counted.** `takeoff_stamps` holds zero rows for
  Old Blueridge school and zero for pine st. The stamps in the database belong
  to small scratch bids.
- **`symbol_links` holds three rows**, all generic fixtures with a NULL
  `capturedFromSheetId`. Nothing was ever captured from either set.
- **pine st has NO text layer at all** — 0 characters across 5 pages. Old
  Blueridge has ~4,500 characters, and it is OCR of a scan rather than drawn
  text: "oondut", "Normetalle", "Riating", and a Cyrillic е inside "Surface".
  So the two sets cannot even be compared by name.
- **They are different kinds of job** — a school against a set whose first sheet
  is "IL01 Illumination Plan" — which is the LEAST favourable pair for overlap.
  Two sets from one architect doing similar work is where memory pays, and that
  is not what these two are.

**So do not order the work on this.** The value of memory comes from a
contractor bidding similar work repeatedly, which is a fact about their year and
not about two fixtures. The cheap way to learn it is to **instrument (a) once it
ships** — record how often a remembered suggestion is accepted, rejected, or
never offered — which answers the real question with real sets instead of
answering a smaller question with these.

**One correction to step 1 above, from the same measurement.** It says the text
layer was "measured worthless on both real sets". That is right about the
legend, and it is worth being precise: one set has no text whatsoever, and the
other's is OCR too degraded to trust — which is a stronger statement than
"worthless" and it also decides § 5m's schedule cross-check. See there.

### What this rewrite changes, and what it does not

**The build order does not change.** § 9.6 stands: legend capture is Phase 9a
and the tiled read is Phase 10, in that order, for the three reasons given there
— the expensive half of tiling is already built, a tiled read against an empty
legend can only produce `low` findings by construction, and once-per-set is the
cheaper place to learn.

**The shape of the screen changes.** One entry point, one list, one verb. The
manual drag-a-box capture is not removed and not hidden (§ 9.2 step 6) — it
stops being the front door and becomes what fixes what the reader missed.

**One thing this flow adds that § 9 did not have.** Step 4 feeds back into step
2: a symbol found on a floor plan with no legend entry behind it is exactly the
finding that can never reach `high` confidence (§ 9.1,
`shared/copilotConfidence.ts`), and the honest place to show it is the legend
list, as a row that says "on the plans, not in the legend". The loop closes
there or it does not close at all.

---

## 5m. Checking what the reader counted — the surface, and the honest part

**Asked 2026-09-19, and it is the right question to ask:** "If I can't check its
work quickly I won't trust it, and if I don't trust it I'll count by hand anyway
— which makes the whole AI side worthless."

That is the gate on the whole AI investment, stated better than this document
had stated it. § 5c already says the app suggests and the estimator confirms;
this section is about whether confirming is actually possible at the speed of a
real job.

### What already exists — more than it looks

`CoPilotPanel.tsx` and `planCopilotRouter.ts`, shipped:

- **Three tiers in their own bands.** Confident, uncertain, and unreadable —
  and the third exists precisely so "I could not read this" never gets styled
  like an answer.
- **Confident proposals arrive ticked; uncertain ones arrive unticked.** The
  asymmetry is the design: accepting a confident batch is one press, accepting
  an uncertain one is a decision somebody made rather than one they failed to
  undo.
- **Bulk place and bulk dismiss**, over whatever is ticked.
- **Click a row and the viewer jumps to it** and rings the spot (`focusPoint`).
- **Nothing is placed until Place is pressed**, and the server re-checks every
  id against the same rules regardless of what the panel offered
  (`shared/copilotActions.ts`).
- **`plan_copilot_findings.stampId`** — every placed mark knows which finding it
  came from, and the link survives the mark being deleted.

So four of the five things asked for exist in some form. The gaps are specific.

### What is missing, in the order it will matter

1. **Provenance disappears the moment a finding is accepted.** A confirmed
   finding becomes an ordinary stamp, and the counted-items panel cannot say
   which of the 40 came from the reader or at what confidence — **although the
   database knows**, through `stampId`. This is the cheapest item on the list
   and it is most of the ask.
2. **There is no whole-set view.** The reader is per sheet and so is its panel.
   "Everything counted, by type, with quantities" across the bid does not exist
   for reader results, and a five-sheet set means opening five sheets to check
   one number.
3. **Jumping across sheets.** `onJumpTo` centres the current sheet's viewer.
   From a bid-wide list it has to change sheet, wait for a render and then
   centre — real work, and the thing that decides whether checking is fast
   enough to happen at all.
4. **Bulk is per sheet and per tier, never per TYPE.** "Accept every exit sign"
   is the operation an estimator actually wants. Today it is "tick the fourteen
   rows that say exit sign".
5. **Nothing shows what was rejected.** Dismissed findings are kept, and a
   rejection somebody wants back is a re-read and another call.

### What I would build

**One surface, bid-wide, named for what it does: what the reader counted.**

- **Rows by TYPE with a quantity**, not one row per mark. Forty lights is one
  row saying forty.
- **The three states shown separately, always** — confident, uncertain,
  unreadable — and never summed into a single "found 214". Summing them is the
  two-tier design the third tier was invented to escape.
- **Accept or reject a whole type in one press**, on this sheet or across the
  set.
- **A row expands to its marks**, and clicking one takes the viewer there,
  changing sheet if it has to.
- **A rejected pile that can be reopened**, so a wrong rejection costs a click
  rather than another read.

**And a placed mark keeps its provenance until somebody says otherwise** — but
**not as a different colour.** Colour belongs to the count (§ 5e), and a second
colour vocabulary on one drawing is the exact confusion that section's palette
exists to prevent. The Layers panel is the right home: an axis of "placed by",
with "me" and "the reader" as its two keys, filtered like every other layer.

### The honest part: a list of what it found cannot show what it missed

**This is the hard problem, and it is not a user-interface problem.** Everything
above verifies **precision** — is each thing it found really there. None of it
touches **recall** — did it find everything that is there. Forty lights listed,
jumped to and confirmed tells you nothing about the forty-first, and recall is
the number that decides whether a count can be trusted without a hand count.

Three things attack it. Only one is cheap, and the first one is not optional:

1. **§ 15's bake-off, which has still not been run.** Hand-count five sheets,
   compare. About $3 of API spend and two hours of counting, and it is the only
   way to learn the recall number. **Until it is run, nobody knows whether the
   reader misses 2% or 30%** — and no amount of interface makes up for not
   knowing. The decision of 2026-09-18 stands: run the small version when Phase
   10 is actually next, because the answer goes stale if the model or the detail
   level moves in between.
2. **Cross-check against a schedule — C14 in takeoff-spec, essential, not
   built.** **Measured 2026-09-21, and it changes how this gets built:** Old
   Blueridge school DOES carry a lighting fixture schedule (page 3, with types,
   catalogue numbers and wattages) and panel schedules (page 2) — but only as
   OCR of a scan, degraded enough to read "Riating" for "Rating". So the
   schedule must be read as an IMAGE, not lifted from the text layer. That
   matters most for the numbers, which is the whole point of the cross-check: a
   quantity mis-OCRed is a confident wrong comparison, and pine st has no text
   layer at all to fall back on. A lighting or panel schedule on the drawings states quantities
   independently of any symbol on a plan. **"The schedule says 43 type-A
   fixtures; the reader found 40"** is the single most valuable sentence this
   feature could ever print, because it is the only one that names a MISS rather
   than confirming a hit. It needs the schedule read, which is another model
   call on a page that is mostly text — the cheapest kind.
3. **Coverage — V19, essential, not built.** Not "did it find everything on this
   sheet" but "which sheets has anyone looked at". Cheap, mechanical, and it
   catches the largest miss available: a whole sheet nobody read.

**And the thing not to build:** a completeness score for a sheet. A model's own
certainty about what it did not see is the least reliable number it produces,
and "94% complete" printed beside a count would do precisely the damage the
third tier exists to prevent — an unreliable number, styled like a fact, one
glance from a quantity.

### 5m.2 AI ROUTING — the wire between devices. Specified 2026-09-21, not built

Everything above is about the reader COUNTING. This is the other half of the AI
work and it is the one D18 was designed around: the app already knows the whip
is an interim that retires per device when something routes the circuit. This
says what that something is.

#### The drawing does not show the route, so the AI ESTIMATES one

**Say that first, because everything else follows from it.** A lighting plan
shows where fixtures are and which circuit they are on. It almost never shows
the physical path of the wire between them. So the AI is not READING a route
off the drawing — it is proposing one, the way an estimator does: **square to
the building, along walls and ceilings**, not diagonal, not through anything.

That makes routed footage an **estimate**, and it must be labelled as one
wherever it appears. It is a better estimate than a whip, because a whip is one
average number for every device of a type on every job, and this one has looked
at where the fixtures actually are. It is still not a measurement, and the
moment it is presented as one, § 5a's rule is broken.

#### What it routes, on a lighting plan

**Between all the lights on one circuit, and back to the switch or the
occupancy sensor.** That is the branch wiring D18 gave to the devices, and it is
exactly the footage the whip stands in for.

**The homerun to the panel is a separate question**, and it is traced — by the
AI or by hand. **The manual option never goes away.** § 5c and CLAUDE.md's
standing AI rule both say it; here it is load-bearing rather than decorative,
because a homerun is one line an estimator can draw in three seconds and the AI
guessing it wrong is a long wrong number.

#### The order, and each step is a gate on the next

|       | Step                      | Why it is here and not earlier                                                                                                                                                                                                              |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Counting is reliable.** | Routing between devices it did not find is a route with holes in it, and the holes do not announce themselves. This is § 15's bake-off again, and § 5m's recall problem: until the miss rate is known, every number downstream inherits it. |
| **2** | **Find the circuits.**    | You cannot route a circuit you cannot identify. Circuit identity comes from the drawing's own labelling, and reading it is a different job from recognising a symbol.                                                                       |
| **3** | **Route.**                | Only now is there something to route: known devices, grouped by a known circuit.                                                                                                                                                            |
| **4** | **Homeruns.**             | Last, and optional forever, because the manual path is complete without it.                                                                                                                                                                 |

**Step 1 is the real gate and it is unchanged.** Nothing in this section can be
built usefully before the bake-off, which is the same sentence § 5m already
carries about checking. That is not a coincidence: routing is downstream of
counting, so it inherits counting's unknown recall and multiplies it by footage.

#### Review one CIRCUIT at a time

The review unit for counting is a TYPE — forty lights in one row (§ 5m). **The
review unit for routing is a circuit**, and that is a different shape on
purpose: a route is a path between specific fixtures, and "accept all routes" is
a press nobody can honestly make. One circuit shows as one proposed path over
the drawing, with its footage, and is accepted or redrawn.

That also makes the manual path the obvious fallback rather than a separate
mode: rejecting a proposed route leaves the circuit exactly where a hand-traced
run starts.

#### The footage lands on the devices it covers, and ONLY those

**This is already designed for and half-built.** D18's whip retires **per device
instance, never per assembly** — routing one circuit of six troffers must not
zero the whip for the other forty on the job. `shared/branchWire.ts` takes a
per-device `routedByRunId` and excludes exactly those devices from the whip
total, with `retiredWhipCount` travelling beside the number so a screen can say
how many.

What is missing is the claim itself: nothing sets `routedByRunId` yet, because
nothing routes. The mechanism is the same shape as `endStampId` claiming a
vertical — **a claimed answer, never inferred from proximity** (§ 5c).

#### And it says, in words, that it is counting the wire between devices

**Not a tooltip.** The estimator has to know, at the moment the footage appears,
that this run is the branch wiring their assemblies would otherwise have
carried — or they will trace it again by hand and count it twice. That is the
double count D18 exists to prevent, arriving through the one door D18 does not
guard.

The voice already exists and should be reused rather than invented: "a cable's
ground is inside the cable and is already in the Cable figure", "no vertical
footage is in these numbers". Same register, on the totals, next to the number.

**The standing AI rules apply unchanged.** Routing is a BUTTON — never a page
load, never a sheet opening. And hand-tracing stays complete for somebody who
never turns it on; a feature that only exists in the AI path is not shipped.

## 5n. A run type you can edit, and a run you can retype — ONE piece

> **BUILT 2026-09-20.** All three parts, plus the material picker extracted.
> Two things written below were wrong and are corrected in place: the rename
> question needed no flag and no column, and "four screens each roll their own
> material picker" was a miscount.

**Grouped 2026-09-19.** Three gaps found while answering "where do I set size
and conductors on a run I have already traced". They read as three small things
and they are one: **a run type can be named but never specified, so nothing
downstream can say what a run is made of.** Fixing any one of them alone leaves
the question unanswered.

### The three parts, and what is already there

**1. A type editor.** `takeoffRunTypes.update` is **built** — label, raceway
material, conductor material, conductor count, and fork-on-edit so that
changing a shipped row makes the contractor their own copy instead of everyone
else's. **Nothing in the client calls it**, and `RunTypePicker`'s create path
sends only a label, which is why a type invented mid-trace comes back labelled
"needs specification".

**Where it lives: in the picker, not a new screen.** The sidebar is eight
destinations, down from fourteen, and a ninth for a list most people will touch
twice is the fold-a-screen-back-in mistake in reverse. A row in the palette
gets an edit affordance and the form opens there — CLAUDE.md § "Customization
available, but never in the way". A library screen only if somebody asks for
one.

**The real work here is a material picker, and there is no reusable one.**

**CORRECTED 2026-09-20 — the count was wrong.** `materials.list` is fetched by
four screens, but three of them are LIST screens with filters (the materials
library, the material database) and only ONE is a picker: the Assembly
Builder's, with recents when the box is empty, `smartSearch` ranking once it is
not, and an arrow-key loop. The duplication being removed is of one picker, not
four — worth saying, because "four copies is four chances to drift" was the
argument for extracting it and only one copy existed.

**The SHAPE, though, is repeated five times**, over different item types:
`LegendPanel` and `StampPicker` over assemblies, this file over run types,
`KitsPage` over assemblies, and the Assembly Builder over materials. Extracting
a generic searchable picker is a real job and was deliberately NOT done here —
refactoring four working pickers while building a new feature is how one change
manufactures the fault another change was for. Noted, not scheduled.

**BUILT:** `client/src/components/MaterialPicker.tsx`, used by the Assembly
Builder and by the run-type editor. The search, the ranking and the keyboard
live in it; what is done with the chosen material stays with the caller, which
is the half that genuinely differs between the two.

**Say the fork out loud.** `update` returns `{ forked: true }` when it copies a
shipped row. If the screen stays silent, somebody edits "1/2in EMT" and has two
rows with one name and no idea why.

**2. Change a traced run's type.** There is no procedure at all. It mirrors
`setLocation` almost exactly — a dozen lines — plus the same picker mounted on
the run row.

**One decision to make first: does retyping RENAME the run?**

**ANSWERED 2026-09-20, and it cost nothing: it already does.** `runName` in
`shared/takeoffCounts.ts` resolves the type's LIVE label first, the run's
snapshot second and `takeoff_runs.name` last — so retyping renames what is shown
without writing to a row. No flag, no column, no migration.

The decision the estimator made — rename unless I renamed it by hand — is
already where that file says a rename belongs: **in FRONT of the type in the
resolution order**, as the one thing a person said out loud. Nothing in the app
can rename a run yet (T11), so there is no chosen name to overwrite today, and
when T11 arrives it changes `runName` rather than `setRunType`.

**This was nearly built the other way.** The sizing above assumed a
`nameIsCustom` column and the estimator had approved adding one. Reading
`runName` before writing the code is the only reason there is no migration in
this change.

**3. The spec on the run row.** `takeoffRunTypes.list` already returns the two
material ids and the conductor count; only the NAMES are missing, and the
takeoff screen does not fetch `materials.list` today. One line under the type
name — `3/4" EMT · 3 x #12 THHN` — and the run panel finally says what the run
is carrying rather than only what it is called.

### Why it is one piece and not three

An editor with no way to retype an existing run leaves every run traced before
today stuck on an unspecified type. A retype action with no editor can only
move a run between types that are equally empty. And the spec on the row is the
only thing that makes either of them verifiable by looking — without it, you
edit a type and nothing on the screen you are working on changes.

### Where it sits relative to everything else

**Before the takeoff CSV export** (todo.md), and that ordering is the point: an
export of run footage BY TYPE, from a palette where no type names a material,
writes rows that say "Conduit type 4 — 340 ft" and nothing else. The door out is
worth less than it looks until this exists.

**It does not open the § 5f.2 gate either.** A fully specified type still
reaches a bid as footage at material cost with no hours behind it. This makes
the runs describable; labour is what makes them priceable.

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

> **READ § 5l FIRST.** On 2026-09-19 this section and §§ 10–11 were restated as
> ONE flow, because that is how they are used: one button reads the legend, a
> list in the right panel is corrected, and then the plans are counted. Nothing
> below is withdrawn — the funnel, the matching, the confidence rules and the
> build order are all still the mechanism — but the front door is "read the
> legend", not "capture a symbol", and the drag-a-box tool is what fixes what
> the reader missed.

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

---

## 16. Mark first, name it after

**Planned 2026-09-21, not built.** Requested after bid 23: a way to just drop
marks, which land unassigned and flagged, then select them and assign them to a
MATERIAL, an ASSEMBLY, or a plain name.

**Pick-first stays the normal flow**, and that is a decision rather than a
concession. Arming a count and clicking forty times is the fastest way to do
forty of the same thing, which is most of what a takeoff is. This adds a second
door for the case pick-first is bad at — walking a sheet noticing things — and
it is also the shape AI suggestions will arrive in (§ 16.6).

### 16.1 What already exists, measured rather than remembered

More than half of it. Checked against the code on 2026-09-21:

| Piece                        | State                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| The four levels              | `TAKEOFF_GROUP_KINDS` is already `plain \| typed \| material \| assembly` (`drizzle/schema.ts`).      |
| Plain counts                 | Built and shipping. `takeoffGroups.create` makes a group with `kind: "plain"` and no price behind it. |
| A group's material           | `takeoff_groups.materialId` exists, with an FK and `onDelete: "set null"`.                            |
| Per-group cost and hours     | `unitCost` and `unitHours` columns exist, for level 2.                                                |
| Counting without a library   | The Mark picker already lets you type a name and count it.                                            |
| Growing a count into a price | § 3 promised it and the group concept delivers it — clicks belong to the group, not to the price.     |

**So the data model is largely there.** What is missing is a way to mark with
NOTHING armed, a way to select marks afterwards, and — the one with teeth —
materials are not yet a price source.

### 16.2 The three real gaps

**1. A mark needs an armed group today.** `TakeoffPage` refuses the click
outright: `if (!activeSheet || !armedGroup) return;`. Unassigned marks need
somewhere to go, and a group is the only thing marks can belong to.

**2. The Mark picker lists assemblies and only assemblies.** `StampPicker`
takes `assemblies: PickableAssembly[]` and searches that one list. Materials
must be choosable, which is a picker change rather than a model change —
`MaterialPicker` already exists and already ranks well (v6.3/v6.6).

**3. A material-backed count CANNOT REACH A BID, and this is the blocking one.**
`sendability` in `shared/takeoffBridge.ts` handles `plain` (refuses, by design)
and `assembly` (sends), and everything else falls through to
`unsupported-level`. So "assign to a material" is half a feature until the
bridge prices one: the count would look assigned and then refuse to send, which
is worse than not offering it.

### 16.3 The trap nobody would notice until a bid was wrong

**`takeoff_groups.materialId` is registered `unreviewed` in
`server/forkableReferences.test.ts`** — "Level 3 counts price from a material
directly; not traced."

The moment materials become a price source, that entry is a live instance of
the fork bug, and it is the money kind. Editing a shipped material FORKS it; the
group keeps the baseline's id; `mergeLibraryRows` hides the baseline. A count
assigned to a material the estimator has priced would snapshot the SHIPPED row's
$0 onto the bid line, permanently, because a snapshot is never re-priced.

**So step one of pricing a material count is `resolveMaterial`**, exactly as
`assembly_materials.materialId` already does, and the registry entry moves from
`unreviewed` to `resolver`. This is the sixth and seventh instances all over
again (v6.4) and it is cheap to get right BEFORE the feature, and expensive
after.

### 16.4 What it would take

Roughly in order, each shippable on its own:

1. **Price a material count.** `sendability` accepts `kind: "material"` with a
   `materialId`; the bridge prices it through `resolveMaterial` and snapshots
   like any other line. Registry entry updated. **No migration.** This is the
   piece that makes the rest honest.
2. **Materials in the Mark picker.** One picker, two sources, with the kind
   recorded on the group. Reuses `MaterialPicker`'s ranking rather than growing
   a second search. **No migration.**
3. **Mark with nothing armed.** A toolbar mode that drops marks into a
   per-sheet holding group — `kind: "plain"`, a reserved label, created on the
   first click. Everything downstream already understands a plain group, which
   is why this is small. **No migration**, if the holding group is an ordinary
   group with a known label. **A migration only if** it needs its own flag,
   which it probably does eventually: a reserved label is a string somebody can
   type, and § 16.5 says why that matters.
4. **Select marks and assign them.** The genuinely new interaction: rubber-band
   or click-to-toggle over existing marks, then "Assign to…" offering a
   material, an assembly, or a plain name. Moving marks between groups is a
   `takeoff_stamps.groupId` update — the column is already there.
5. **Flag the unassigned.** A count of unassigned marks per sheet, and a mark
   style that reads as provisional. Derived, not stored.

**Estimate: steps 1–2 are a day each, step 3 half a day, step 4 is the real
work — two to three days — and step 5 half a day.** Step 4 carries all the
interaction risk, because selecting on a zoomable canvas has to coexist with
panning and with the armed tools, and CLAUDE.md § "a comment claiming that
SOMETHING ELSE handles it" records what happened last time a drawing gesture
was assumed not to reach another layer.

### 16.5 Two decisions to make before building step 3

- **Is the holding group per SHEET or per BID?** Per sheet reads better — "11
  unassigned on this sheet" — but a bid-wide holding group makes assigning in
  one pass easier. Leaning per sheet, matching how every other count panel is
  keyed.
- **Does a reserved label need a real flag?** A label like "Unassigned" is a
  string an estimator can type themselves, and then their count silently joins
  the holding pen. A boolean column is one additive migration and removes the
  class. Recommend the column when step 3 is built, not before.

### 16.6 Why this is also the AI landing strip

An AI suggestion has exactly the shape of an unassigned mark: a position on a
sheet, no price behind it, and a human decision pending. If marks can already
land unassigned, be reviewed and be assigned in bulk, the reader's output needs
no second mechanism — it becomes a source of marks in the holding group, with
the same select-and-assign flow and the same flag.

That also keeps CLAUDE.md § "manual mode is the product" true by construction:
the manual path is not a degraded version of the AI path, it is the SAME path,
and the AI just fills it faster.
