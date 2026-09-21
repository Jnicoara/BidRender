# Assemblies Plan

Planning document for the assemblies/estimating rebuild. No code changes — this captures the intended data model, pricing behavior, screens, and build order.

## DATA MODEL

- **Materials** — name, unit of sale (each / foot / box), cost per unit, **and a
  default labor unit** (hours per unit of sale). See
  [Materials carry a labor unit](#materials-carry-a-labor-unit) — this was
  decided, built, and then lost in a rewrite, and is being restored.
- **Labor Rates** — hourly cost per role (apprentice / journeyman / foreman). Fully separate from assemblies.
- **Modifiers** — adjust labor hours. Two kinds:
  - A shared **global list** usable by most assemblies (height, outdoor, existing/retrofit, etc.).
  - **Assembly-specific one-off modifiers** (e.g. isolated ground for register/computer circuits).
  - Multiple modifiers on one line item **ADD together** — they do not compound/multiply.
- **Assemblies** — bundle materials + base labor hours + applicable modifiers into a reusable recipe. Each assembly belongs to:
  - A **Category**: Devices, Lighting, Panels, Equipment Connections, Low Voltage/EMS.
  - A **Trade** field, for future multi-trade expansion.
  - An optional **Project Type** tag: Residential / Commercial / Both.

### Project Type is a filter, not a structural split

Project Type exists to **filter** the library, nothing more. It does not fork the catalog in two:

- **Materials, Labor Rates, and Modifiers stay fully shared** across residential and commercial. There is no residential copy and commercial copy of anything.
- Where labor genuinely differs by context, that is handled through the existing fork/customize system (see [CUSTOMIZATION MODEL](#customization-model)) — a user forks the one assembly and adjusts it. The library is never duplicated wholesale.

**Not the same thing as Trade.** Trade separates electrical from plumbing/HVAC for unlock gating; Project Type separates residential from commercial work _within_ a trade. Two independent axes — every starter assembly in [STARTER_LIBRARY.md](STARTER_LIBRARY.md) already carries this tag.

### Materials carry a labor unit

**Decided originally, built, then silently dropped. Re-decided 2026-09-20.**

**The model.** A material carries a **default labor unit** — hours per its unit
of sale, so hours-per-foot on EMT and hours-each on a device box. An assembly's
component line can **override** it for that recipe. This is how the trade's own
reference works: the NECA Manual of Labor Units is a book of hours per installed
item, not per recipe.

**It was built.** `master_items.masterLaborHours` held the default;
`project_items` and `project_assembly_items` held it snapshotted as
`masterLaborHours` alongside an `overrideLaborHours` the user edited per bid.
Those columns are still in `drizzle/schema.ts` today and the build is recorded
in `todo.md` (the `project_items` / `project_assembly_items` entries, and
"Inline edit for qty, overrideMaterialCost, overrideLaborHours per item").

**Then the catalog was replaced and the field did not come across.**
`master_items` became `materials`, which carries `costPerUnit` and no hours at
all. `master_assembly_items` became `assembly_materials`, which is
`assemblyId, materialId, qty, sortOrder` — no hours and no override. The
`master_*` tables survive in the schema with a server router and **zero client
references**; they are vestigial.

**Nothing recorded the reversal, and that is the actual fault.** This document
described the new model as though it had always been the plan. CLAUDE.md's
"Data model" section still described the OLD one as current. So the written
record disagreed with itself in both directions at once, and the only way to
find out which was true was to read the schema. On 2026-09-20 that cost a
design conversation that had to be stopped and restarted: an answer was given
from the live schema ("materials cannot carry hours") that read as a decision
when it was only a consequence.

**The rule this earns:** when a rewrite drops a capability, say so where the
capability was decided — not only where the replacement is described. A
replacement documented on its own is indistinguishable from a plan that never
included the thing it replaced.

### What must come with it

Three things are part of the job, not follow-ups:

1. **A missing hour has to be as visible as a missing price.**
   `shared/materialPricing.ts` flags every unpriced material and the Materials
   screen filters to exactly those; hours need the same flag and the same
   filter. **A missing hour is worse than a missing price** — a price that is
   not set understates one line, while an hour that is not set is multiplied by
   the rate on every line that touches that material. The column is therefore
   NULLABLE with no default: nobody-set-it and deliberately-zero must not be the
   same value.
2. **Two places can hold hours, so ownership is decided in ONE function.** Not
   a rule in a comment — a guard, the same shape as `totalVerticalFeet` in
   `shared/takeoffHeights.ts`, which decides who owns a vertical before it sums
   anything. A rule enforced in two places survives until somebody edits one.
3. **The typed number on an assembly prices. Always.** An assembly's hours are
   **the operation, not the sum of its parts** — 0.45 h for a duplex rough-in is
   what it takes to do the whole thing at once, and summing the components would
   throw away exactly the efficiency being claimed. Component hours are shown
   **beside** it as a cross-check — "your parts add to 0.62, you typed 0.45" —
   **always visible, never a warning.** It exists so the gap can be seen and
   judged, not closed. A 27% gap IS the efficiency; a screen that nags toward
   making them match is arguing against the model.

### Run types read the same number

A traced run's labor comes from the **same material rows**, not from a second
figure typed on the run type: pipe hours off the raceway material, wire hours
off the conductor material times the conductor count. One number in one place
serving both assemblies and runs — the same figure is never maintained twice.

This **supersedes the shape of D17 in `references/takeoff-spec.md`**, which
picked two hand-entered numbers on the run type. What survives from D17 is the
**fixed amount per counted end** — the stop, the strap, the connector and the
box at a termination — which is an interim standing in for fittings that cannot
carry hours yet, and which retires to zero rather than being deleted when they
can. See D17(b) and the open fork at D17(c).

**BUILT 2026-09-20 — the per-foot half.** `shared/runTypeLabor.ts` turns a run
type into what ONE FOOT of it is made of, and `laborForRun` prices that from the
material rows. The palette and the type editor both show the figure, through one
sentence builder so they cannot word it differently.

Three things worth knowing before building on it:

- **A cable is one foot of one thing.** Its count describes what is inside the
  jacket, so multiplying by it would bill a 12-2 MC at three times its labour.
  Its ground gets no line either, for the same reason the materials list gives:
  the ground is in the jacket and already paid for.
- **A partial figure never appears without what it is short by.** A type whose
  pipe is costed and whose wire is not returns a confident, low number that
  looks exactly like a finished one.
- **This is the TYPE's figure, not a run's.** A run may carry circuits that
  differ from its type's counts (§ 2.1), so anything pricing an actual run reads
  that run's circuits, the way `quantitiesForRun` already does for footage.

**Still unbuilt: the run → bid bridge (R2).** `bid_line_items` has no run
equivalent of `takeoffGroupId`, so runs still reach the materials list and
nothing else. The labour answer is what unblocked writing it; it is not itself
the bridge, and R2 also wants R7's allowances and R3's double-count handling.

### Where labor hours come from

The CORE assemblies in [STARTER_LIBRARY.md](STARTER_LIBRARY.md) ship with materials but **no labor hours**. Those get populated by the user, from their own field experience, with the **NECA Manual of Labor Units** as a general reference.

**Read for understanding, then write independently.** Numbers are arrived at in the user's own terms and expressed in their own words — never transcribed or copied across from the manual. NECA's tables inform judgement; they are not a source to be reproduced.

### Modifiers replace difficulty tiers — don't build both

NECA expresses job difficulty as **Normal / Difficult / Very Difficult** columns. The [Modifiers](#data-model) system already does that job, additively and with more granularity: height, outdoor, retrofit, tight space, and so on stack to describe _why_ a particular install is harder, rather than collapsing it into one of three buckets.

So:

- **There is no separate difficulty-tier field, and one should not be added.** It would duplicate Modifiers and force the user to answer the same question twice.
- **A single baseline hour per assembly**, with modifiers applied on top. NECA's "Normal" column serves only as an informal reference point when settling on that baseline — not as a stored tier.

### Linear-footage assemblies use per-100-ft or per-1000-ft rates

Conduit and wire labor is conventionally quoted per 100 ft or per 1000 ft rather than per foot. That is **standard industry practice and needs no special handling** — it is simply the unit the hours are expressed in. Nothing in the data model has to change to accommodate it; it does not imply a second rate system or a distinct assembly type.

## CUSTOMIZATION MODEL

- Users get a personal **fork/copy** of baseline library items and can edit freely.
- Forked items **track which baseline item they came from**.
- Baseline updates **never auto-overwrite** a user's personalized copy — surfaced as "update available" instead.
- Users can create fully **custom** materials / labor rates / assemblies with no baseline link.
- **"Revert to Original"** — discards a user's personal changes and restores the current baseline version.
- **Category is NOT user-extendable.** It stays a small, deliberately curated list — users pick from it when building a custom assembly but cannot add new entries to it. This keeps the category-as-layer reuse (see [LAYERS](#layers)) safe from clutter: no user action can silently add a new layer to every takeoff sheet.

## PRICING FLOW

1. **Direct Cost** = Materials + (Labor hours × modifiers, summed not compounded) × Labor Rate
2. **+ Overhead** — optional, on/off, percentage or flat amount. Applied _before_ profit.
3. **+ Profit** — explicit choice between:
   - **Markup %** → `price = cost × (1 + markup%)`
   - **Target Margin %** → `price = cost / (1 - margin%)`
   - Never assumed silently — the user picks.
4. **= Final Bid Price**

Settings exist at two levels:

- **Company-default level** — auto-fills new estimates.
- **Per-project override level.**

## PROJECT ESTIMATES

- When an assembly is added to a project, **snapshot its current costs into the project record** rather than linking live to master pricing — so a submitted bid never silently changes if master rates update later.
- **Snapshot timing is unconditional.** Costs snapshot the moment an assembly is added to _any_ bid, regardless of that bid's status. There is no live-linked mode.
- **The "update available" nudge is status-gated.** It appears only on bids still in **Draft**. Once a bid is **Submitted**, it is fully frozen — no nudge at all, even if the underlying baseline or the user's own library item changes.
  - Corollary: the nudge is a Draft-only affordance. Won / Lost / Complete bids inherit Submitted's frozen behavior.
- **Bids carry a Project Type tag too** — the same optional Residential / Commercial / Both value used on assemblies (see [DATA MODEL](#data-model)). This is what lets the [DASHBOARD](#dashboard) split reporting by residential vs. commercial later: win rate, average margin, and outstanding value per project type.

## CONDUIT & WIRE CALCULATION

### Two path types

The tracing tool supports two kinds of run, chosen per path:

1. **Conduit + pulled wire** — EMT, PVC, rigid. Conduit and wire are calculated **separately**, per the rules below.
2. **Cable run** — Romex/NM-B, MC cable. **Cable footage only**, because the cable _is_ the raceway. There is no separate conduit quantity to count.

The rules that follow describe path type 1. A cable run still gets length, termination allowance, live tally, and waste factor — but the conduit-specific rules (shared-run conductor multiplication, conduit fill) simply do not apply to it.

- Trace conduit runs on the plan; **length calculates automatically including offsets**.
- **Wire footage auto-calculates** from conduit length + termination allowance (2–3 ft at panel, 6–12 inches per device) × number of conductors — built into the calculation directly.
- **Shared conduit runs** — trace the physical path once, assign multiple circuits to it. Conduit counted once; wire multiplies correctly by total conductors sharing it.
- **AI-suggested home run routing** — proposes a starting path from device to panel. Always editable/draggable, never a locked black-box number.
- **Live running tally** of footage by conduit size and wire type as runs are traced.
- **Conduit fill** — soft reference warning only, _not_ a certified code-compliance guarantee.
- **Adjustable waste factor %** per material/job.

## APP LAYOUT

Four main areas:

- **Dashboard** — active bids, due dates, win rate, business overview.
- **Bids** — list of all projects.
- **Library** — Materials / Labor Rates / Assemblies.
- **Settings** — company info, default overhead/margin, team.

Inside a bid: **Overview → Takeoff → Pricing → Proposal** (running total always visible everywhere).

Design principles:

- New estimates pre-fill from saved defaults.
- Search beats browsing.
- Advanced options hidden behind a toggle by default.
- One clear primary action per screen.

## DASHBOARD

**Top** — four numbers: Active bids, Win rate, Outstanding bid value, Average margin.

**Below** — Due soon list, Recent activity list.

No charts on the default view — deeper trends live in a separate **Reports** section.

**Bid status flow** (foundational — powers win rate and future labor-unit learning):

`Draft → Submitted → Won or Lost → (if Won) Complete`

Soft dashboard reminder for old bids without a final status.

## TAKEOFF PAGE REDESIGN

Underlying PDF rendering engine **stays as-is**. This redesigns the surrounding workflow:

1. **Sheet index** — auto-detected real sheet names from title blocks, clickable sidebar.
2. **Split-screen** — two independently navigable panels side by side.
3. **Auto scale detection** — reads stated scale/page size, pre-fills calibration.
4. **Persistent legend panel** — extracted symbol legend stays visible while working elsewhere.
5. **Live synced running list** — counted/measured items appear instantly; clicking highlights location on drawing.
6. **Visual marking of already-counted items** — avoids double-counts or misses.
7. **Stamp tool** — pick an assembly **once**, then click multiple locations on the plan to drop it repeatedly without re-selecting each time. Each drop feeds the live running list (5) and visual marking (6) already described. The behavior is identical for residential (fewer, spread-out drops) and commercial (many drops per sheet) — only the volume differs. Clicking an existing pin selects it, so it can be moved or deleted.
8. **AI auto-fill** — AI drives the _same_ stamp tool to detect and drop pins automatically for a chosen symbol type, color-coded by confidence (matching the existing AI review-queue pattern). Every AI-dropped pin behaves **identically to a manually placed one**: same live list, same visual marking, same editability. And the same rule applies — once a human touches a pin, AI never silently overwrites it again.
9. **Symbol-to-assembly linking** — clicking or circling a symbol in the persistent legend panel (4) loads that assembly for stamping, instead of searching for it by name. The first click on an unlinked symbol prompts a one-time _"which assembly does this match?"_; every future click loads it instantly.
   - This link table is also **what AI auto-fill (8) reads to interpret the plan**, rather than guessing generically. Unlinked symbols get proposed at lower confidence for the user to confirm.
   - Ties directly into the **legend memory per architect** feature — links learned on one job carry forward to the next set of plans from the same architect.

**Priority order:**

1. Sheet index + split-screen
2. Auto scale + legend panel
3. Live list + visual marking + stamp tool
4. Symbol-to-assembly linking
5. AI-assisted detection with review-queue pattern, including AI auto-fill

Stamp tool sits in tier 3 because the live list and visual marking are what a drop feeds — the three ship as one working loop. Symbol linking precedes AI because it's the lookup table AI depends on.

## LAYERS

_Revised design — supersedes the earlier single-grouping-plus-custom-tags approach._

**Two independent, toggleable layer groups** rather than one.

### 1. By System

Reuses the existing assembly **Category** field: Devices, Lighting, Panels, Equipment Connections, Low Voltage/EMS.

### 2. By Location

A new, **separate** list: Underground, Slab/Floor, Wall, Ceiling/Overhead, Exposed, Roof.

### Why these are two different kinds of thing

This is the distinction that drives the whole design:

- **Category is a fixed property of the assembly itself.** A duplex receptacle is always "Devices," on every job, forever. It travels with the library item.
- **Location is NOT fixed to the assembly.** It's tagged on the **specific placed item** at the moment it's counted on a takeoff plan — because the same assembly can sit in different physical locations on different jobs, or even on the same job.

Collapsing these into one list would force a false choice; keeping them separate is what makes both useful.

### Behavior

- Both groups toggle **independently** and **combine** — e.g. show only Electrical **and** only Underground at once.
- Layer state affects **both** the drawing view and the live counted-items list.
- Color-coded checklist.
- Default: **all layers on** when a sheet is first opened.

### Trade-agnostic by design

The Location list is **shared across all trades** — "Underground" means the same thing for electrical conduit and plumbing pipe. That shared vocabulary is what enables **cross-trade conflict visibility** later, once more than one trade exists (see [MULTI-TRADE STRUCTURE](#multi-trade-structure)). System/Category grouping stays trade-scoped via the **Trade** field.

### Implementation timing

**Location tagging is not part of Foundation.** It lands with the [TAKEOFF PAGE REDESIGN](#takeoff-page-redesign) (build step 6), because a location tag only exists once there's a placed item on a plan to attach it to. Nothing in the Foundation schema stores it today — Category alone is live.

## MULTI-TRADE STRUCTURE

**Trade-gated per unlock:**

- Baseline assembly library
- Symbol recognition on takeoff

**Shared across all trades regardless of unlock:**

- Dashboard, Bids, Settings
- Takeoff page tools
- Labor rate structure
- Proposal generator
- Pricing engine

A single bid can include line items from **any trade the user currently has unlocked**.

Future trade expansion (plumbing, HVAC, etc.) will involve **real trade experts** building those baseline libraries — not internal guesswork.

## PROPOSAL & BUSINESS SCOPE

- The app **fully owns the estimate/proposal document end-to-end**, including a reusable exclusion/qualification language library and branded output.
- Invoicing, billing, and accounting are **NOT** being built in-house — instead the app will **export/connect to existing tools** (e.g. QuickBooks) once a bid is won.
- **Estimating is the focused product for now.**

## AI CO-PILOT (plan interpretation assistant)

Chat panel on the takeoff page. Helps interpret dense/confusing plan sheets:

- Explains what a sheet shows
- Decodes symbols/abbreviations
- Answers questions about notes
- Flags related details on other sheets

**Core rule:** every answer must **cite exactly which sheet/note/text it came from**, grounded in the actual uploaded document — never from general knowledge alone.

**Boundary:** answers questions only. Never silently adds a count/measurement to the actual estimate.

**Cost:** AI usage has a real per-use cost that should be **tracked internally from the start**, even before a pricing model is public.

**Build timing:** after the core foundation is complete and proven.

## ADDITIONAL FOUNDATIONAL NOTES

- Ship with a **real starter library** of common electrical materials/assemblies, not an empty catalog — so first use feels functional immediately.
- Include a **simple data export** option from day one, for user trust.
- Every AI-assisted or pricing-related feature gets **real tests before shipping** — same discipline used on the security fix.

## BUILD ORDER (foundation-first rubric)

1. **Foundation** — data model, customization model, pricing math. _This must exist before anything else can be built or shown._
2. **Library screens** — immediately after Foundation, so the data becomes visible/usable right away.
   - **Open question for the Assemblies screen:** consider whether it should carry a _"show labor hours to contractors"_ visibility toggle. An `enable_labor_units` feature flag already exists and does exactly this for the **old** Assembly Builder screen, which the Library screens replace. Decide when that screen is actually being designed — whether the behavior gets rebuilt here, moved into Settings, or dropped. Not a reason to touch the existing flag now.
3. **Bid/Project structure** — status flow, cost-snapshot behavior.
4. **Quick-bid (no plans) flow** — fast quantity-based bidding on top of Foundation + Library. Useful for smaller/residential jobs.

> ### ⛔ VALIDATION GATE — after step 4, before step 5
>
> **Stop and validate before building anything further.**
>
> An **outside electrician — not the app's builder** — must be able to run a **complete real bid end-to-end** using only the Quick-bid flow, **with no assistance**.
>
> This is the first point in the build order where that's possible: Foundation + Library + Bid structure + Quick-bid together make a usable product without plans or takeoff. Everything from step 5 on is expansion on top of a foundation that has _not_ yet been proven with a real user.
>
> Enforces the [STRATEGY_NOTES.md](STRATEGY_NOTES.md) verdict: _validate with real outside users before expanding scope._
>
> **Blocker to clear first — login is not usable by anyone but the builder.** With `VITE_OAUTH_PORTAL_URL` unset, `getLoginUrl` throws `TypeError: Invalid URL` inside `AuthGuard`, which is a whole-app error boundary rather than a login screen — _no_ page renders. Local dev currently only works by hand-setting throwaway OAuth/JWT env vars. Real user accounts have to work end-to-end before an outside electrician is handed the app, so this needs fixing before the gate, not after. Not urgent for solo development today.

5. **Dashboard**
6. **Takeoff page redesign**
7. **Proposal generator**
8. **AI co-pilot and AI-assisted takeoff features** — last, built on a proven-stable foundation.
