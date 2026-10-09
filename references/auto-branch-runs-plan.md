# Automatic branch runs between devices (PLAN, 2026-10-08)

**PLAN ONLY. Nothing is built.** Track C, on `track-c`. Owner's brief,
2026-10-08: work out the branch wiring between devices automatically
(everything except homeruns), with the same engine as the homerun
calculator, and no AI. **It must look and measure like a real electrician's
routing, or it does not ship.**

**In one paragraph.** Group each sheet's marked devices by their circuit tag
(already done for homeruns). Connect each circuit's devices by the shortest
right-angle network. Connect switched fixtures to their switch by switch
letter. Add drops, bends, makeup and waste with the rules traced runs and
homeruns already use. Price it on the circuit's run type, and retire the
assembly whip **only on the devices it covers**. Everything starts "not
confirmed", a traced run always wins, and **no route line is drawn** (§ 9).
It stays **off** until a bake-off against hand-traced runs lands within
±10% (§ 8).

**Read § 9 before building anything.** Two things in the brief — routing
around "no-go areas" and staying inside a building outline — are close to
the wording of the McCormick patent's dependent claims 4–6. The plan ships
them in a safe form first (flag, never route around) and holds the
route-around version for the attorney.

---

## 0. What is already decided — and what this plan changes

Searched first, per CLAUDE.md § "Where decisions live" (grep: branch run,
branch wiring, switch leg, device to device, no-go, non-wiring, auto run).

| Where                                                | What it decided                                                                                                                                                                                                                                                                                             | This plan                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D18**, `takeoff-spec.md` (2026-09-20)              | Devices carry the branch wire through their **whips** (`isBranchWhip` lines). Traced runs are homeruns. **One ownership function decides each foot before anything sums.**                                                                                                                                  | **Keeps it.** Auto branch footage is a third owner of the same feet, settled in that SAME function (`shared/branchWire.ts`): a device covered by an auto circuit loses its whip, every other device keeps it.                                                                            |
| **§ 5m.2**, `plan-viewer-overhaul.md` (2026-09-21)   | Routing between devices, specified as **AI** routing, with the whip retiring **per device instance, never per assembly** (`routedByRunId`, already in `branchWire.ts`), labelled an estimate in words, reviewed one circuit at a time, as "one proposed path over the drawing".                             | **Overrides two parts, keeps the rest.** (1) **No AI**: plain geometry, the same as the homerun engine. (2) **No path drawn over the drawing** (§ 9, patent). Kept: per-device retirement, "estimate" in words, review per circuit, the manual path always complete. § 5m.2 now says so. |
| **§ 5a**, `plan-viewer-overhaul.md`                  | Measure honest, pad visibly: nothing in the measuring path is biased; all padding is named and adjustable.                                                                                                                                                                                                  | **Keeps it.** The chain length is measured; routing %, waste and makeup are separate named lines, as on a homerun.                                                                                                                                                                       |
| `homerun-footage-plan.md`, `homerun-patent-notes.md` | Three methods (Measured / Average / Measured with a minimum), the leaving device (closest at right angles), drops from heights and ceiling areas, routing % added not multiplied, starts unconfirmed, traced wins. **Option A (2026-10-07): no homerun path is drawn**, guarded by `noHomerunPath.test.ts`. | **Reuses all of it.** Homeruns are not touched. The branch engine sits beside the homerun engine and calls the same pieces.                                                                                                                                                              |
| `starter-assemblies-plan.md` (D18 in the seed)       | Whip allowances: 25 ft receptacle, 20 ft switch leg, 35–40 ft for some.                                                                                                                                                                                                                                     | The whip stays the default and the fallback. It is what the bake-off has to beat.                                                                                                                                                                                                        |

---

## 1. Which devices, and in what groups

**Per sheet, per circuit tag.** `groupByCircuit` (`client/src/lib/circuitGroups.ts`)
already ties each tag ("2B-14") to its nearest mark and lists the circuit's
devices. It was measured against the owner's 243 hand marks on UNCC E111.
**It moves to `shared/`** (it is pure) so the server can price from it. The
client keeps calling it for the Circuits view.

- **One tag, one device, one circuit.** A device belongs to at most one
  circuit, by construction (the existing nearest-tag rule). That is half of
  "never count a device twice". The other half is § 6.
- **Across sheets:** a circuit that continues on another sheet is two
  groups, one per sheet, each priced on its own scale. Nothing joins them
  (no geometry links two sheets). The sheet edge is a flag, § 3.
- **Low voltage is left out**, as it already is: an item none of whose marks
  carries a tag ("no circuit tags") gets no branch run and keeps its whip.
- **Homerun devices:** the device nearest the panel (`leavingDevice`, the
  SAME saved choice the homerun uses, `homerunFromStampId`) is where the
  branch network meets the homerun. The branch engine never computes
  anything toward the panel; that is the homerun's job, unchanged.

## 2. Connecting them

### 2a. The receptacle / general circuit

**Shortest right-angle network over the circuit's devices**, distances
`|dx| + |dy|` (`rightAngleDistance`, the homerun engine's own function).

Two shapes, chosen per bid (owner question Q1):

| Shape                        | What it is                                                                                                                                                                   | Looks like                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Tree (suggested default)** | Minimum spanning tree on right-angle distance, **at most 3 connections per box** (a box rarely takes more than 3 cables: in, out, one tee). Prim's, from the leaving device. | Receptacles daisy-chained along a wall, with a tee where a row splits. How a circuit is actually pulled. |
| **Chain**                    | One unbranched string from the leaving device: nearest neighbour, then a 2-opt pass to remove crossings.                                                                     | Strict daisy chain. Longer than the tree on spread-out circuits.                                         |

The tree is never longer than the chain, and the box cap stops the star a
plain spanning tree draws around a central device. **The bake-off decides**
(§ 8): whichever lands nearer hand-traced runs is the default.

### 2b. Lighting: fixtures to their switch

On the drawing, a fixture carries its circuit tag and a **switch letter**
("a", "b"), and the switch carries the same letter. The letter is read with
the same nearest-label rule as the circuit tag (TIE_REACH). It is already
recognised and kept OUT of homerun reading (`homeruns.ts`: "1S-11c" is a
switch leg).

1. **Fixtures with the same letter on the same circuit** are one switched
   group. They are connected to each other by § 2a's network.
2. **The switch leg** runs from the group's fixture nearest the switch, to
   the switch: one right-angle link, with **its own drop at the switch**
   (the same rule as a switch leg off a tee in `runDropCases.test.ts` § c:
   its own drop, none at the tee).
3. **Each switched group connects to the rest of the circuit** at its
   fixture nearest the circuit's network. That link carries the unswitched
   hot.
4. **3-way and 4-way.** Two switches with one letter in reach of each other
   are a 3-way pair: a **traveler link** between them, at the run type's
   conductor count **plus one** (3-wire). Three or more: the middle ones are
   4-ways, chained, each link 3-wire plus ground. The switch leg goes to the
   switch nearest the fixtures.
5. **Two fixtures groups on one switch** (a 2-gang box with "a" and "b"):
   each group gets its own leg to the same box.
6. **A switch with no fixtures of its letter, or fixtures with a letter and
   no switch**, is flagged (§ 3), never guessed.

Conductor counts come from the circuit's run type (§ 4). The neutral at the
switch (NEC 404.2(C)) is owner question Q4.

### 2c. What the engine produces per circuit

A list of **links**: (device A, device B, horizontal feet, drop at A, drop
at B, corners, conductor count, kind = branch | switch leg | traveler). **No
points are stored** (§ 9): a link is two device ids and its numbers. The
same inputs always produce the same links (deterministic tie-breaks: lower
stamp id first), so a refresh never reshuffles a circuit.

## 3. Staying in the building

### 3a. Building outline

**One outline per sheet.** The user taps its corners once (the existing
height-area drawing tool, `outlineFromTaps`), or presses "use my height
areas", which takes the outer edge of the sheet's height areas
(`bid_height_areas`). No outline = no outline check, and the circuit says
"no building outline on this sheet" in its row. Never inferred from the
drawing in the first build.

### 3b. No-go areas

Outlines the user draws for places wire cannot cross **above the ceiling**:
an atrium, an open-to-structure area, a cooler box, a rated shaft. **Interior
walls do NOT block** (a ceiling run goes over them), so nobody has to draw
walls.

### 3c. What happens when a link would cross one — TWO stages

| Stage                                                    | A link whose right-angle path leaves the outline or crosses a no-go area…                                                                                                                                                                         | Patent (§ 9)                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Stage A — flag (after the attorney's claim-4 answer)** | First the engine tries the OTHER one-corner L (horizontal-first vs vertical-first) and the next-best tree edge. If none stays clear, **the device is flagged**: "No clean path from Light 7 — fix it here", never guessed (§ 3d).                 | Safe: nothing routes around anything.                                                                        |
| **Stage B — detour (attorney first)**                    | A grid search (A\* on cells about 1 ft at the sheet's scale, right-angle moves only, a cost per turn so it prefers fewer bends — the way an electrician runs it) finds the shortest clear right-angle path; its LENGTH and corner count are used. | **High risk**: claims 5–6 ("a multi-line path around the non-wiring area"). Held until the attorney answers. |

Stage B is the brief as written. **It is held, not dropped**: the engine is
built so the detour drops in where Stage A flags, and nothing else changes.

### 3d. "Fix it here" — what the button offers

On a flagged device, in its row, in place (CLAUDE.md never-stuck rule):

- **Trace it** — opens the trace tool from that device; the traced run wins.
- **Type a length** for that one link.
- **Connect to…** — tap the device it should hang from.
- **Leave it on its whip** — that one device keeps its assembly whip.

### 3e. Later, optional: walls from vector PDFs

Reading wall lines from a vector PDF's own lines, to offer an outline or
no-go areas the user confirms. **Never required, never automatic**, and it
only proposes outlines; it never blocks anything a user did not accept. Not
in this plan's build stages beyond a note.

## 4. Drops, bends, makeup, waste, and which wire and pipe

**Same rules as traced runs and homerun, no new ones.**

| Piece             | Rule (existing code)                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drops**         | At each end of a link: device height (`resolveDeviceHeight`) up to the ceiling (`resolveHomerunCeiling` / `heightAreaAt`). A fixture at the ceiling drops 0. A device with no height set: "no vertical counted", said in words, as homeruns do. |
| **Bends**         | Conduit run types only. One 90 per corner of the link (1 for an L, 0 straight), plus one 90 at each counted vertical — `shared/runBends.ts`'s rule, applied to the link's corner count. Cable: none.                                            |
| **Makeup**        | Per conductor, per box end: `makeupDeviceInches`, or `makeupByKindInches` for that device's kind — the run type's own columns.                                                                                                                  |
| **Waste**         | The run type's `wireExtraPct` and `conduitExtraPct`. Material only.                                                                                                                                                                             |
| **Routing %**     | The bid's routing percentage, added (not multiplied), on labor and material — exactly as a homerun. Owner question Q5: share the homerun's number or have its own.                                                                              |
| **Wire and pipe** | The **circuit's run type**. Which one is owner question Q3; suggested: the bid's **branch run type** (new, per bid), defaulting to the homerun run type, so "EMT homeruns, MC branches" is one setting.                                         |
| **Labor feet**    | installed × (1 + routing), no waste, no makeup — the homerun's rule.                                                                                                                                                                            |

The arithmetic is one new pure function, `branchFootage` in
`shared/branchFootage.ts`, shaped like `homerunFootage` (same input
pieces, same `refused` reasons where they apply, same `pieces` breakdown) so
the screens can show both with one component.

## 5. The method, per bid

Mirrors `homerunMethod` (bid level, sheet override).

| Method                             | Branch feet                                                                                                | Label on screen              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Whips (default until proven)**   | Each device's assembly whip, as today. Nothing auto.                                                       | (today's wording)            |
| **Measured** (default once proven) | § 2 network + § 4 pieces.                                                                                  | "Measured (estimate)"        |
| **Allowance per device**           | A typed length per device ("15 ft"), on the branch run type. Labeled **"default length"**, never measured. | "Default length, 15 ft each" |
| **Measured with a minimum**        | Measured, but no link shorter than a typed minimum (two boxes back to back still need a whip of wire).     | "Measured, 6 ft minimum"     |

"Allowance per device" differs from the whip: the whip is the ASSEMBLY's
cable (NM-B in most starters), this is the BID's branch run type (EMT + THHN
on a commercial job). Owner question Q6 asks whether both are wanted.

## 6. Who owns each foot — never twice

In ONE function, `shared/branchWire.ts`, before anything sums (D18's rule):

1. **A traced run always wins.** A device that is an end or a tee of a
   traced run (`endStampId`, run network) is out of the auto network for
   the link the trace covers. A traced run tied to a circuit as its branch
   wiring replaces the whole circuit's auto footage, the same way a traced
   homerun replaces the computed one (`state: "traced"`).
2. **A device covered by an auto circuit loses its whip** — that device
   instance only (`routedByRunId` already does this for runs; the auto
   circuit becomes a second kind of claim, `routedByBranchCircuit`).
3. **Every other device keeps its whip.** Flagged devices, untagged devices
   not yet confirmed, low voltage, devices on a sheet with no scale.
4. **A device is in at most one circuit** (§ 1), so it cannot be routed
   twice.

The totals say, in words, how many whips were replaced: "Branch wiring:
measured for 42 devices on 9 circuits (estimate). 6 devices still use their
assembly whip." That sentence is what stops an estimator tracing the same
wire again by hand (§ 5m.2's warning).

## 7. Confirming, fixing, untagged devices

- **Everything starts "not confirmed".** It is still priced (like an
  unconfirmed homerun), and the totals say "N circuits not confirmed".
- **Fix a circuit, in place:** confirm; type a length for the circuit or
  one link; "Connect to…" to change where a device hangs; trace it; leave a
  device on its whip. Any fix confirms. **No dragging of a drawn line**,
  because there is none (§ 9). "Drag" in the brief becomes "Connect to…"
  plus "Trace it".
- **Untagged devices** (a circuited item with no tag in reach): the engine
  PROPOSES a group — the same height area, else devices of one item within
  a set distance of each other — and asks: "These 6 lights have no circuit
  tag. One circuit?" with Yes / Split / Leave on whips. **Nothing is priced
  until the user says yes**; until then they keep their whips.
- **Staleness** (CLAUDE.md § "A test that calls the server cannot see a
  screen"): branch totals depend on marks, tags, runs, heights and outlines
  on the whole BID. Every mutation that changes any of those invalidates
  through the screen's one refresh helper, and the check is: mark a light,
  watch the branch number move.

## 8. Proof: the bake-off, and the switch that stays off

**Off by default.** A `FEATURES` entry, `availability: "internal"`, until
the bake-off passes. Then the default method moves from Whips to Measured
by owner decision, not by code.

**The test, on real plans:**

| Sheet                                  | Why                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ |
| UNCC **E111** (power)                  | Receptacle circuits, 243 marks and 38 circuits already hand-checked.     |
| An **Old Blueridge** lighting sheet    | Switch letters, 3-ways, lay-in fixtures. (Its E0.01 has no scale: skip.) |
| A **residential** plan (owner to pick) | NM, long whips, small rooms.                                             |
| A **retail** plan (Dollar Tree type)   | Long fixture rows, one big room, a cooler as a no-go area.               |

1. **The owner (or an estimator) hand-traces the branch runs** on at least
   10 circuits per sheet, as traced runs answered "branch wiring". Their
   path, their judgement. Recorded before the engine is run on that sheet.
2. Run the engine on the same marks. Compare **per circuit** and **per
   sheet**, horizontal feet and installed feet separately (so a drop rule
   and a routing rule cannot hide each other).
3. **Also compare the whips** on the same devices. The engine has to beat
   the whip, or it adds machinery for nothing.

**Pass (suggested; owner question Q8):**

- per-sheet installed feet within **±10%** of hand-traced, on every sheet;
- at least **80% of circuits within ±20%**;
- **no circuit off by more than 50% without a flag on it** (a wrong number
  with no warning is the failure this app is built against);
- closer than the whips on at least 3 of the 4 sheets.

The results table goes in this file (§ 8b), with the sheet, circuit count,
hand feet, engine feet, whip feet, and what was off. **A fail is reported as
a fail**, with which circuits and why. A tree-vs-chain result settles Q1.

### 8b. Results

Not run.

## 9. Patent check — US 11,120,171 (McCormick), every display and engine idea

From `homerun-patent-notes.md` § 4 (claim wording fetched 2026-10-07 through a
summarising tool; **check against the official text**). Whether any of this
matters legally is the attorney's call; this table only says how close each
idea sits to claim language.

**The difference that matters most:** claims 1 and 13 are about routes
"from selected points on the floorplan **to a desired electrical panel**".
Branch links run device to device and device to switch; **none ends at a
panel**. The panel end stays with the homerun, which keeps Option A (one
number, no path). That is a real difference, not a guaranteed one.

| Idea                                                                                       | Nearest claim language                                                  | Risk     | Plan                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Right-angle LENGTH per link, from two device spots                                         | Claim 13, "multi-line path … orthogonal" (a one-corner L's length)      | Low–med  | Same flag as homeruns (§ 4 of the notes). Not to a panel. No route type choice. Keep.                                                   |
| **A drawn line along a link or circuit**                                                   | Claims 1/13 "generate wire routes" (displayed)                          | **High** | **Not drawn.** A guard test like `noHomerunPath.test.ts` on the branch layer: no line, polyline, polygon or path element.               |
| Rings on a circuit's devices; the leaving device larger; the switch ringed with its letter | None found                                                              | Low      | **The display.** Same as homerun's Option A.                                                                                            |
| Order numbers (1, 2, 3…) on the devices                                                    | Suggests a route order without drawing one                              | Medium   | **Not in the first build.** Ask the attorney.                                                                                           |
| A text list of links in the side panel ("Light 3 – Light 4, 12.5 ft")                      | Shows the network, not a path on the floorplan                          | Low–med  | Build; feet only.                                                                                                                       |
| **A cost per link, per circuit or per route**                                              | Claims 1/13 "generate a cost for each of the wire routes"               | **High** | **Never.** Feet per circuit; cost only on the bid's run-type lines, all together, as homeruns.                                          |
| A "branch takeoff window" with costs for SELECTED circuits                                 | Claim 13 "estimated material takeoff window … for selected wire routes" | High     | **Not built.** Totals are per run type, all circuits together.                                                                          |
| A route-type choice (direct / orthogonal)                                                  | Claims 1 and 13 ("when a direct / orthogonal route is selected")        | **High** | **Never offered.** Tree vs chain is a per-bid estimating method, not a route type; ask the attorney to confirm that reading.            |
| Straight-line distance anywhere                                                            | Claim 1                                                                 | High     | **None.** Right-angle only.                                                                                                             |
| **No-go areas** drawn by the user                                                          | Claim 4 "mark at least one non-wiring area"                             | **High** | Stage A: the area only FLAGS links that cross it. Ask the attorney before building even this, since marking is claim 4's whole element. |
| **Routing around** a no-go area (grid detour)                                              | Claims 5–6 "a multi-line path around the at least one non-wiring area"  | **High** | **Stage B, held for the attorney.** Length only, never drawn, never to a panel.                                                         |
| Building outline, runs never leave it                                                      | Same family as non-wiring areas (outside = no wiring)                   | Med–high | Stage A flag only; Stage B with the no-go answer.                                                                                       |
| Following a cable tray or marked route                                                     | Claims 7–9                                                              | High     | **Not in this plan.** Not proposed.                                                                                                     |
| Walls read from a vector PDF                                                               | None directly; feeds the no-go question                                 | Medium   | Later, optional, proposes only; after the no-go answer.                                                                                 |

**Put to the attorney, in one page:** (1) does device-to-device (never to a
panel) take branch links outside claims 1 and 13; (2) is flagging a crossing
of a user-drawn area "marking a non-wiring area" (claim 4); (3) is a detour
LENGTH, never generated as a displayed path, "generating a path around" it
(claims 5–6); (4) are order numbers on devices a displayed route.

## 10. What each track builds

### 10a. Database — Track A (all additive, nullable, no defaults: step 1 of three)

| Table                         | Column / table                                                                                                                                                                                                                                                                       | Why                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `bids`                        | `branchMethod` varchar(16) NULL — 'whips' \| 'measured' \| 'allowance' \| 'measuredMin'; NULL = whips                                                                                                                                                                                | § 5; varchar like `homerunMethod`, so a new value is code, not a migration. |
| `bids`                        | `branchAllowanceFt` decimal(8,2) NULL, `branchMinimumFt` decimal(8,2) NULL                                                                                                                                                                                                           | § 5                                                                         |
| `bids`                        | `branchRunTypeId` int NULL → `takeoff_run_types` (set null)                                                                                                                                                                                                                          | § 4, Q3; NULL = the homerun run type                                        |
| `bids`                        | `branchShape` varchar(8) NULL — 'tree' \| 'chain'; NULL = the shipped default                                                                                                                                                                                                        | § 2a, Q1                                                                    |
| `bid_pdf_sheets`              | `branchMethod` varchar(16) NULL                                                                                                                                                                                                                                                      | sheet override, as `homerunMethod`                                          |
| **new** `bid_route_areas`     | id, bidId, userId, sheetId (cascade), `kind` varchar(16) ('building' \| 'nogo'), name, `region` json, timestamps                                                                                                                                                                     | § 3. Separate from height areas, which mean a ceiling height, not a limit.  |
| **new** `bid_branch_circuits` | id, bidId, userId, sheetId, `circuitTag` varchar(32), `panelCircuitId` NULL, `confirmedAt` NULL, `overrideFt` decimal NULL, `memberStampIds` json NULL (user-confirmed untagged group), `hangFrom` json NULL (user's "Connect to…" answers: stamp id → stamp id), `tracedRunId` NULL | § 7. **No points, no path**: device ids and answers only.                   |

Nothing writes a computed length. Footage is computed when asked, like
homeruns, so a moved mark re-prices without a stale stored number.

### 10b. Server — Track C

`shared/branchFootage.ts` (pure engine: network, switch legs, pieces);
`groupByCircuit` moved to `shared/`; `branchWire.ts` takes the auto claim;
a `branchCircuits` router (list per sheet, confirm, override, hang-from,
confirm group, trace link); bid totals and `runTypeFootageCore` add the
branch footage on the branch run type's lines.

### 10c. Bid screen and Plans screen — Track B

- **Bid screen:** the branch method beside the homerun method (same
  control); a totals line in words ("Branch wiring, measured estimate: 1,240
  ft · 9 circuits · 2 not confirmed · 6 devices still on whips"); the
  run-type lines that take branch footage show it as its own piece.
- **Circuits view (Plans):** each circuit row gains a Branch figure and its
  state; open a row → its links as text, each with feet; the § 3d fix
  buttons on any flagged device; a confirm button.
- **Drawing tools:** "Building outline" and "No-go area" next to height
  areas (Stage A). "Use my height areas" for the outline.
- **The sheet:** rings only (§ 9). No line.
- **Untagged groups:** the § 7 question, one group at a time.

## 11. Test plan

**Pure (`shared/`, vitest), each red without its change:**

- Network: tree length ≤ chain length; box cap of 3 holds; deterministic
  on ties; leaving device is the homerun's choice when one is saved.
- **Fixture shapes that differ from the container** (CLAUDE.md § "A test
  fixture shaped like its container"): a long thin row of fixtures, an L, a
  square grid, and a circuit whose devices straddle a no-go area — so
  horizontal-first and vertical-first Ls give different answers.
- Switch legs: one group, two groups on one 2-gang, a 3-way (traveler +1
  conductor), a 4-way, a letter with no switch (flag), a switch with no
  fixtures (flag).
- Drops: fixture at ceiling = 0; receptacle at 18" under a 10 ft ceiling;
  device with no height = "no vertical counted", never 0 (CLAUDE.md § 6).
- Methods: allowance labelled "default length"; minimum applied per link;
  whips unchanged when the method is Whips (byte-identical totals on E111
  and Bar layout check — the feature off must change nothing).
- Ownership: a traced device is never also auto; a device in an auto
  circuit has no whip; an untagged unconfirmed device keeps its whip;
  **sum of owned feet with everything on = auto + traced + remaining whips,
  each device once.**
- Stage A: a link crossing a no-go area tries the other L, then flags.

**Server:** router tests through `createCaller`, scoped by
`ctx.scope.dataUserId`; a confirm/override round trip; a mark moved →
branch total moves.

**Guard:** `noBranchPath.test.ts`, the twin of `noHomerunPath.test.ts`.

**On screen:** look at the Circuits view and bid totals at laptop and
tablet size; mark a device, watch the number move (staleness).

## 12. Build stages (each one a gate on the next)

| Stage | What                                                                                                                            | Who       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **0** | Attorney reads § 9's one page. Owner answers § 13.                                                                              | Owner     |
| **1** | Pure engine (§ 2, § 4, § 5) and a bake-off script that prints per-circuit feet from a bid's marks. No UI, no columns.           | C         |
| **2** | **Bake-off** on the four sheets (§ 8). Fail = stop and report. Pass = owner decides Measured becomes eligible.                  | Owner + C |
| **3** | Track A's additive columns (§ 10a), step 1 of three.                                                                            | A         |
| **4** | Server: ownership in `branchWire.ts`, pricing, router, internal tier only.                                                      | C         |
| **5** | Bid and Plans screens (§ 10c), rings only.                                                                                      | B         |
| **6** | Switch legs and 3-ways, if not already in stage 1's pass.                                                                       | C         |
| **7** | Building outline and no-go areas, **Stage A (flag)**, and untagged grouping — only if the attorney clears claim 4 for flagging. | C + B     |
| **8** | **Stage B (detour)**, only on the attorney's clear answer to § 9 (3).                                                           | C         |
| **9** | Optional: walls from vector PDFs, proposing outlines.                                                                           | later     |

## 13. Owner questions (suggested answer first)

- **Q1. Tree or chain?** _Suggest: tree with a 3-per-box cap as the default,
  chain as the per-bid option; the bake-off picks the default._
- **Q2. Is the leaving device the same for homerun and branch?** _Suggest:
  yes, always the homerun's saved one._
- **Q3. Which run type prices branch wiring?** _Suggest: a per-bid branch
  run type, defaulting to the homerun run type._
- **Q4. Neutral at every switch (NEC 404.2(C))?** _Suggest: the switch leg
  uses the run type's conductor count, and a per-bid "neutral at switches"
  tick adds one; travelers always +1._
- **Q5. Routing % for branch: the homerun's number or its own?** _Suggest:
  its own, starting unapplied, because branch links are short and a
  homerun's corridor factor overstates them._
- **Q6. Keep both "Whips" and "Allowance per device"?** _Suggest: yes —
  Whips is the assembly's own cable, Allowance is the bid's run type._
- **Q7. Untagged devices: propose groups by height area and distance, and
  ask?** _Suggest: yes; nothing priced until confirmed._
- **Q8. Pass mark ±10% per sheet, 80% of circuits within ±20%, no unflagged
  circuit off by 50%?** _Suggest: yes._
- **Q9. Order numbers on devices?** _Suggest: no, until the attorney says
  they are not a displayed route._
- **Q10. Build Stage A (flag on no-go crossings) before the attorney
  answers?** _Suggest: no — wait, since drawing the area at all is claim 4's
  element._
