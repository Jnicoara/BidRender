# Plan viewer overhaul — the plan

Written 2026-09-17. **Nothing here is built yet.** This is the agreed shape of
the work, the order it happens in, and the decisions already made, so that none
of it has to be re-derived in six weeks.

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
   trusts and one they work around. **Open question:** makeup is almost
   certainly wire-only — pipe is cut to fit and has no tail. Confirm before
   building, because applying it to conduit would inflate every run.

### 2.2a Starter values — shipped, labelled, and dated

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
  per company, overridable per job.
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

**The rule:** a traced run owns the verticals at its own two ends. A stamp's
vertical is for devices **not** on a traced run. The UI has to make which one is
carrying it obvious, and the run breakdown showing its verticals explicitly is
half of that protection.

#### Verticals flow through the per-conductor maths

A drop adds to conduit **once** and to wire **once per conductor**. Vertical
footage must go through the same multiplication as traced footage, or the wire
number is wrong by however many conductors there are.

### 2.3 How the settings behave

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

---

## 4. Phase order

Each phase ships and gets used before the next starts.

| Phase  | What                                                   | DB change                |
| ------ | ------------------------------------------------------ | ------------------------ |
| **1**  | Zoom, pan, and the three viewer bugs                   | **No**                   |
| **2**  | Full-screen layout                                     | **No**                   |
| **3**  | Two-point scale calibration                            | No (reuses `scaleRatio`) |
| **4**  | Measure-only tool                                      | **No**                   |
| **5**  | Three levels of effort                                 | **Yes** — groups         |
| **6**  | Run settings: allowances, materials, sizes, ground     | **Yes**                  |
| **7**  | **Verticals: mounting heights on runs**                | **Yes**                  |
| **8**  | **Verticals on stamps**                                | **Yes** (small)          |
| **9**  | Editing runs: drag a vertex, insert/remove points      | No                       |
| **10** | AI reader tiling, and the daily-limit question with it | No                       |
| **11** | Tablet and touch                                       | No                       |

**Why verticals are 7 and 8 rather than earlier, despite mattering most.** They
depend on two things built just before them: the defaults-inheritance plumbing
from Phase 6 (null means "follow the setting"), and the per-conductor wire maths
that vertical footage has to flow through. Building verticals first means
building both twice.

**Runs before stamps, deliberately.** Run verticals carry most of the missed
footage and need no group concept. Stamp verticals are the smaller half and sit
on top of Phase 5's groups. Splitting them means the big win ships a phase
earlier.

**If verticals need to come sooner**, the minimum standalone version is:
company distribution height, per-device-type mounting heights, run start and
end elevation, and the breakdown that shows them. That does not need Phase 5 at
all — only Phase 6's inheritance pattern, which already exists elsewhere in the
app for overhead and profit.

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

## 7. Open questions

- **How far should sharp zoom go?** Re-rendering at high zoom costs render time
  on dense sheets (0.5–13s). There is a real trade between "sharp at 800%" and
  "instant". Suggested: sharp to ~400%, stretch beyond. Needs a look at a real
  E-sheet.
- **Do run extras need to know which sheet they are on?** A riser has drops on
  one sheet and rises on another. Affects the Phase 6 columns.
- **Does makeup apply to conduit, or wire only?** Almost certainly wire only —
  pipe is cut to fit and has no tail. Applying it to conduit would inflate every
  run. Confirm before Phase 6.
- **What is the height called?** "Ceiling height" is ambiguous: the pipe may run
  at the ceiling, above it, or at the deck, and three people will enter three
  different numbers under one label. Suggest **distribution height** — the
  elevation the raceway actually runs at — with ceiling height kept separate if
  it is ever needed for anything else.
- **Mixed heights on one sheet.** An office at 10 ft and a warehouse at 18 ft on
  the same drawing. Per-run override covers it. **Resist per-area heights** —
  that is a zoning feature and it is a lot of machinery for a case the override
  already answers.
- **Store elevations in inches, display in feet and inches.** `formatFeetInches`
  already exists. A mounting height of 18" typed as 1.5 is the obvious mistake.
