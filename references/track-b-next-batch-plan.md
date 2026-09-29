# Track B: the next batch (after the beta plan)

**BUILT 2026-09-28 on `track-b`, one commit per piece, in the owner's order
3 → 1 → 2 → 4 → 5 → 6. Not merged. Screen pass done the same day** (table
below). The plan below is kept as written; what changed while building is
here.

**The screen pass (2026-09-28, `pnpm dev` on 3002 against
`bidrender_local_b`, user 1, a scratch bid deleted afterwards).** Nothing
needed fixing. How each check was done, and what it could NOT show:

| Check                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3. 11×17 sheet                     | **Pass.** A hand-written 1224×792 pt PDF rendered 1836×1188 at 1.5×. No scale: quiet, and the popover says "Page 11×17 in". Picking 1/4": chip `1/4" = 1'-0" · ⚠ 11×17 page` + "Check it". A check that agreed ("Agrees — the scale checks out") cleared it at once, and it stayed quiet after a reload. Setting 1/8" brought it back.                                                                                                                      |
| 1c. Job height → Send preview      | **Pass.** 10 ft set through the heights chip: 111.11 → 119.61 ft in the totals and every preview row, verticals 8.50 ft, "Send 4 lines" → "Send 5 lines", couplings "over 119.61 ft" — no reload, equal to the server.                                                                                                                                                                                                                                       |
| 1b. Plan set removed, another open | **Pass on what can be seen locally.** After "Remove plan", the page re-fetched totals, drops, colours, the bridge, the count list and measurability (browser request log) — all keyed by bid, so only the fix re-reads them. The NUMBER could not move: `bidrender_local_b` has **0 foreign keys**, so the set's sheets and run were not cascaded and the server itself still said 119.61. Production has the keys; the server half is covered by the suite. |
| 1a. End mark removed               | **Not checkable: there is no control that removes one mark.** `RunsPanel` takes `onRemoveStamp` and has never called it (added in `ba6702c`, 2026-08-12); nothing else in the client calls `takeoffStamps.remove`. That is C6 in `takeoff-spec.md`, still open. The refresh rule for it is in place and tested for when the control lands. See `todo.md`.                                                                                                    |
| 2. Dashboard, columns, analytics   | **Pass.** Headline `$831 + 3 lines not priced`, Draft column the same, from the one card carrying 3 ("Bar layout check"); analytics shows the amber "not priced — 1 bid in this range…" note. No closed jobs locally, so the profitability half rests on the suite.                                                                                                                                                                                          |
| 5. Old labor rate                  | **Pass.** A scratch role at $68, two assembly lines, role changed to $43: "2 lines use $68.00/hr — the role on their assembly is $43.00/hr now (…)", with labor still 3 h × $68 = $204.                                                                                                                                                                                                                                                                      |
| Layout at the shipped width        | **NOT checked.** The driven Chrome window was hidden and stuck at 766 CSS px (dpr 2); `resize_window` did nothing, so the app drew its phone layout, and screenshots were taken with CSS zoom 0.5. Content and wording were read from the DOM; desktop placement of the chip, the headline tail and the strip was not seen at 1536 px. The phone-width look at Recent plans is likewise still open.                                                          |

**Owner's answers (2026-09-27):** all four as recommended — build first and
look once at the end; "Check it" clears the sheet-size warning; old labor
rate is flag only; the headline leaves the sample bid out.

| Piece            | Commit    | What differs from the plan below                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3. Sheet size    | `8ebcec0` | **The warning clears on the existing `scaleCheckedAt`, not for the visit only.** The column was already there and a check already writes it, so "nothing new stored" held and a checked sheet stays quiet on the next visit. `scaleCheckedAt` records that somebody checked, not that the check agreed: an estimator who keeps a disputed scale also clears it, which is the existing rule for that stamp. 18×24 and 17×22 warn. |
| 1. Stale figures | `3dad0fb` | As planned. Placing marks does NOT refresh the run figures; only removing one does. That commit broke a source test (`sheetScaleCache.test.ts`), fixed in piece 6's commit.                                                                                                                                                                                                                                                      |
| 2. Totals        | `58c7988` | Also found: the column totals included the sample bid, which the headline left out. Both go through `sumBidTotals` now. Analytics counts frozen unpriced parts only; a line from before 0087 is not read live there (noted on `BidCostRow`).                                                                                                                                                                                     |
| 4. Forks (R3)    | `a396a1a` | `takeoff_groups.materialId` and `.laborRateId` became `exempt`, not resolvers. Nothing reads either today, and each has a test that fails the day that changes.                                                                                                                                                                                                                                                                  |
| 5. Old rate      | `c3b12e1` | Assembly lines only: a hand-priced or run-type line stores no role to compare against.                                                                                                                                                                                                                                                                                                                                           |
| 6. Polish        | this one  | **`lastUsedAt` measured and left alone.** It is right. The Dashboard's newest-plan date is the one that is 7 h out locally (see `todo.md`). The Layers note is true (the totals are whole-bid; only the run list filters), so it is unchanged. Fitting lines now count as used. The phone-width look joins the screen pass.                                                                                                      |

**PLANNED 2026-09-27 on `track-b`.** Every file:line
reference below was read on `track-b` at `965f584`, which is local-dev
fast-forwarded in. The dev server was not run for this plan (the laptop is low
on memory), so every claim below comes from reading the code. **Nothing here
was measured on a live screen.** Each piece that changes a screen says what to
look at, and that look is part of the piece, not optional.

**Scope, as asked:** Stage 5 pieces and beta-blocking polish, with **no
migration** and **nothing touching the `takeoff_runs` or `bid_line_items`
schema**. Anything that can put a wrong number on a bid comes first. It stays
out of login, signup and email (Track A) and out of the catalog seed (Track C).

**Both earlier plans are built and merged.** `stage-5-track-b-plan.md` (CSV,
Delete all, Select text, analytics) and `track-b-beta-plan.md` (plan files,
run totals, plans Phase 1) are done. This batch is taken from what is still
open in `todo.md`, `takeoff-spec.md`, `plan-viewer-overhaul.md`,
`audit-2026-09-21.md` and `material-markup.md`, plus a read of the code for
screens that can show a stale number.

**Schema verdict: none of the six pieces needs a migration.**

Suggested order: **1 → 2 → 3 → 4 → 5 → 6.** Pieces 1–4 can each leave a
wrong number on a bid or on the screen that feeds one. Piece 5 is a smaller
money-accuracy flag. Piece 6 is polish.

---

## 1. Numbers on the Plans screen that do not move when they should

**Class:** the staleness fault CLAUDE.md records from 2026-09-19 ("a test that
calls the server cannot see a screen showing yesterday's answer"). The server
is right each time. The screen keeps showing the answer it fetched earlier.

### What exists

- **`refreshRuns`** (`TakeoffPage.tsx:2555`) invalidates `takeoffRuns.listForSheet`,
  `totals`, `drops`, `typeColors` and `takeoffRunTypes.bridgeForBid`.
- **`refreshStamps`** (`TakeoffPage.tsx:2599`) invalidates
  `takeoffStamps.listForSheet`, `takeoffStamps.countedItems` and
  `takeoffGroups.list`.

### The three gaps, read from the code

1. **Removing a mark leaves the run figures stale.**
   - `removeStamp` (`TakeoffPage.tsx:2848`) settles with `refreshStamps` only.
     The copilot confirm path (~:2979) does the same.
   - A run's `startStampId` / `endStampId` and a tee's mark `stampId` are
     `onDelete: set null`. Removing a mark at a run's end changes that run's
     ends, so its drops, its connector count and its Send preview all change.
   - None of `listForSheet`, `totals`, `drops` or `bridgeForBid` is told.
2. **Removing a plan set leaves the whole-bid figures stale.**
   - `bidPdfs.remove` (`TakeoffPage.tsx:2282`) invalidates `bidPdfs.list` and
     nothing else.
   - The cascade deletes that set's sheets, marks and runs. The bid-wide
     queries (`totals`, `drops`, `typeColors`, `bridgeForBid`,
     `takeoffGroups.list`) keep the same key, so while another set stays open
     they show the deleted set's quantities.
3. **Changing job heights leaves the Send preview stale.**
   - `JobHeightsChip.tsx:45-47` invalidates `takeoffHeights.forBid` and all of
     `takeoffRuns.*`, but not `takeoffRunTypes.bridgeForBid`.
   - Heights change vertical footage, and vertical footage is part of what
     Send puts on the bid.

**Also wrong, in the same place:**

- The comment at `TakeoffPage.tsx:2784-2789` says `takeoffGroups.list` "is
  already invalidated … on every run change (`refreshRuns`)". It is not.
  `refreshRuns` never touches it. Per CLAUDE.md § "a comment claiming that
  something else handles it": write the guard, then rewrite the comment to
  say what is now true, keeping the old claim in the text.
- `refreshStamps` still invalidates `takeoffStamps.countedItems`, which no
  component queries any more. That is dead, and it looks like coverage.

### How I'd build it

- **Removing a mark calls `refreshRuns` as well as `refreshStamps`.** Do it in
  the helper, not in the one mutation. Any mark change can move a run end, so
  `refreshStamps` calls `refreshRuns` itself. That covers the copilot path and
  any mark mutation added later.
- **`bidPdfs.remove` calls `refreshSheets`** (which already calls `refreshRuns`)
  **plus `refreshStamps`'s bid-wide half** (`takeoffGroups.list`).
- **`JobHeightsChip` gains `bridgeForBid`.** Better: it calls the page's
  `refreshRuns` through a prop, so the chip stops keeping its own list.
- **`refreshRuns` also invalidates `takeoffGroups.list`,** which makes the
  comment at :2784 true by construction rather than by rewording it.
- **Drop the dead `countedItems` invalidation.**

**Forcing function.** There is no test harness for React components here
(`vitest.config.ts` covers `server/**`, `client/src/lib/**` and `scripts/**`).
So the helpers' query lists move into `client/src/lib/takeoffRefresh.ts` as
plain data: which queries each kind of change must move. A test there asserts,
for example, that "mark removed" includes `takeoffRuns.totals` and
`bridgeForBid`, and that "plan removed" includes every bid-wide query. The page
then invalidates by iterating that list. This does not prove the page calls
it. It does make the list reviewable and red-able in one place.

### Schema

**None.**

### Verify on screen (when the dev server can run)

On the "Bar layout check" fixture, working on a scratch run (not the fixture's
own data):

1. Trace a run ending at a mark. Note the totals, the drops readout and the
   Send preview. Remove the mark. **All three must move without a reload.**
2. Change a job height. The Send preview's vertical feet must move.
3. On a scratch bid with two plan sets, remove one. The whole-bid totals must
   drop to the other set's figures without a reload.

---

## 2. Dashboard and analytics totals that leave out unpriced lines without saying so

**Class:** the 2026-09-26 owner rule. On a bid, unpriced reads "Not priced",
never $0, and **the total says how many lines it leaves out.** Each Dashboard
card follows that rule. The totals built from the cards do not.

### What exists

- **Each card is honest.** `bids.dashboard` (`bidsRouter.ts:347-436`) returns
  `notPriced` and `incomplete`. The card shows `NotPricedTotal` and
  `IncompletePriceTag` (`DashboardPage.tsx:626-634`).
- **The headline is not.** "Out for bid · total due" (`DashboardPage.tsx:347-361`)
  sums `totalDue` and shows the red "incomplete" tag only when some bid has
  `incomplete`, which is `brokenLines > 0 || !priced` (`bidsRouter.ts:427`).
  A bid whose only gap is `notPriced` lines adds $0 for them to the headline,
  and the headline says nothing.
- **The per-column totals** (`DashboardPage.tsx:297-307`, shown at ~:567-577)
  do the same thing.
- **Analytics does the same thing.** `incompleteBids` / `incompleteJobs`
  (`server/analytics.ts:337, 447, 524`) count only `brokenLines`. Won, lost
  and pending values that include unpriced lines are not flagged.

### How I'd build it

- **One summing helper in `shared/`**, taking the rows, that returns the total
  **and** what it leaves out: `{ total, brokenBids, notPricedLines,
notPricedParts, sampleExcluded }`. The headline, each column and analytics
  all use it. It takes the rows whole (CLAUDE.md § "structural in the maths"),
  so a later gap is not dropped by one copy.
- **The headline and each column** show the same short tail the cards use,
  e.g. "total due · 4 lines not priced". The red "incomplete" tag stays as it
  is for lines the engine cannot price. The two mean different things, and
  the cards already keep them apart.
- **Analytics** carries `notPriced` through `BidCostRow` next to
  `brokenLines`, and the Outcomes and Profitability panels say "includes N
  lines not priced" beside a figure that has them.
- **Tests:**
  - the helper, on fixtures with only-broken, only-not-priced, both, the
    sample bid, and a bid with nothing missing;
  - **forcing:** the headline's `notPricedLines` equals the sum of the cards'
    `notPriced.lines` for the same rows. It cannot pass while the headline
    counts something the cards do not.

### Schema

**None.** `notPriced` is already on every dashboard row.

### Verify on screen

A bid with one unpriced line and one priced line, in Active. Then the headline,
its column and its card must all name the unpriced line. Price it on the bid,
go back, and **all three must move together.**

---

## 3. Sheet-size check (S8, decided as D5 (a))

**The biggest silent wrong number still open in the takeoff.** A 24×36 set
saved at 11×17 still says `1/4" = 1'-0"`, so every traced length comes out at
about half, "with nothing on screen looking wrong" (`takeoff-spec.md:175-181`).

### What is already decided

**D5 (`takeoff-spec.md:656-663`):** "(a) Show the PDF's page size beside the
scale ('page is 11×17'), and warn when it is not a normal full-size sheet …
Offer (b) [a known-dimension check] as the one-tap fix the warning points to."
Nothing later overrides it. This piece builds D5 (a) as written and cites it.

### What exists

- **The detected scale is written automatically.** `bidPdfs.detectSheetScale`
  (`bidPdfsRouter.ts` ~:970) writes `scaleRatio`. Nothing looks at page size.
- **The only guard is "Check it".** `checkHeadline` (`shared/planCalibration.ts:490`)
  can already say "Reads half — printed at half size?", but only after
  somebody chooses to measure.
- **The viewer knows each page's size in points.** pdf.js gives it at scale 1.
  `planSnapshot.ts:95` already derives `pageWidthPoints`. Nothing stores it,
  and nothing needs to: it is read from the open page.
- **`scaleSource`** on `bid_pdf_sheets` is `detected | manual | none`
  (`drizzle/schema.ts:2176`).

### How I'd build it

- **Pure logic in `shared/sheetSize.ts`:**
  - `paperSize(widthPts, heightPts)` returns the nearest named size (ARCH C/D/E/E1,
    ANSI B/C/D/E, 12×18, letter, legal), either way round, within a tolerance.
    If nothing matches it returns the measured inches, e.g. "page is 17.0×11.0".
  - `sizeWarning(size, scaleSource)` returns `null` for a full-size sheet
    (22×34, 24×36, 30×42, 36×48 and their ANSI siblings), and a warning for a
    known reduced size (11×17, 12×18, letter). A plan set that is truly drawn
    on 11×17 is rare, but it exists, so the wording is a question, not a
    verdict.
  - **Test fixtures in both orientations,** and with sheets whose proportions
    differ from each other (CLAUDE.md § "a test fixture shaped like its
    container"): 11×17 landscape must not match 12×18, and 22×34 must not be
    read as a half-size 44×68.
- **On screen, beside the scale in `ScaleControl`:**
  - always a quiet "page 24×36";
  - on a reduced size, amber: "Page is 11×17. If this set was drawn larger,
    every length reads short. Check it against a known dimension." with the
    existing **Check it** as the button;
  - a check that agrees clears the amber for that sheet in this session.
    Nothing is stored (no migration). See Q2.
- **Totals:** the run totals block already lists "runs on sheets with no
  scale". It gains nothing here. The warning belongs where the scale is set,
  which is where D5 put it.
- **No AI call.** Page size is arithmetic.

### Schema

**None.**

### Verify on screen

Sheet 1 of "Bar layout check" (no scale) and a drawn sheet. Then the same
drawing saved at 11×17: the amber must appear, and "Check it" must open from
it. Look at it at the width it ships, because the scale control is in a
crowded toolbar (CLAUDE.md § visual weight).

---

## 4. The double-count warning misses forks (R3), and two unreviewed fork references

**Class:** a warning that fails to fire lets the same work onto a bid twice.

### What exists

- **`doubleCountedAssemblies`** compares raw `bid_line_items.assemblyId`. A
  line added by hand on the company's fork of an assembly and a plan line on
  the shipped assembly are the same work under two ids, and are not flagged
  (`audit-2026-09-21.md:197`).
- **The registry says so.** `server/forkableReferences.test.ts` lists that
  entry as `unreviewed` (~:202), together with `takeoff_groups.materialId`
  (~:187) and `takeoff_groups.laborRateId` (~:192).
- **`takeoff_groups.materialId`** is not biting yet, because `sendability`
  refuses `kind: "material"` (`shared/takeoffBridge.ts:126`). The day material
  counts price, they would snapshot the shipped row's $0 unless the price goes
  through `resolveMaterial` (`plan-viewer-overhaul.md` § 16.3).

### How I'd build it

- **Compare on the resolved identity**, the same resolver the bid already uses
  for forks, so a fork and its shipped row count as one assembly.
- **Test:** a baseline assembly on a plan line plus its fork added by hand is
  flagged. Two genuinely different assemblies are not.
- **Review the two `takeoff_groups` entries** and move each out of
  `unreviewed` with a verdict. For `materialId`, the verdict is a test that
  fails the day `sendability` accepts `material` without resolving the fork.
  That is a red for a future change, which is cheaper now than a $0 line
  later.

### Schema

**None.**

---

## 5. A bid line frozen at an old, non-zero labor rate is not flagged

**`takeoff-spec.md` § 16 (~:1619-1655):** "Your 7 existing bid lines are priced
at $68.00/hr, not $43 … The bid screen does not point out that disagreement."
`shared/laborRatePricing.ts` flags only a $0 rate.

**The freeze is by design and stays.** CLAUDE.md: never mutate a snapshot. So
this piece only **says** it:

- A strip on the bid, in the style of the $0-rate strip (`BidsPage.tsx:1355`):
  "3 lines use $68/hr; Journeyman is $43/hr now." It is shown only on a
  Draft or Active bid, since a Won bid's rate is history, not a mistake.
- The action is the existing re-apply path, if one reaches labor rates. If it
  does not, the strip says what to do, and building a re-apply is its own
  piece. See Q3.
- Pure comparison in `shared/laborRatePricing.ts`, with a test. A salaried
  role reads its rate from the field that drives it (the `needsRate` rule), or
  it will flag every salaried line forever.

**Schema: none.** The snapshot and the live rate are both already read on the
bid.

---

## 6. Polish, all small

- **The $0-rate strip's advice is wrong when the role exists** (`BidsPage.tsx:1363-1369`).
  It says "give the assembly a role … then re-add the line". That is right when
  the line has no role, and wrong when the role exists and its rate is $0
  (`takeoff-spec.md` ~:1657). Split the two cases.
- **The Layers filter note says "Totals below cover the whole bid regardless"**
  (`LayersPanel.tsx:266`). Check that it is true today: `takeoff-spec.md:511`
  said stamp counts were not totalled bid-wide on 2026-09-14. If it is false,
  reword it. If it is true, leave it.
- **`lastUsedAt` reads 7 h out** (`server/db.ts:6810`, open at `todo.md`
  "Found, not chased"). Now answered from the driver: `db.execute` returns
  TIMESTAMPs as zone-less strings, so `new Date()` reads them as local time.
  Use the `DATE_FORMAT(... 'Z')` fix already used for the Dashboard's
  newest-plan date. It only moves search ranking (a ±5-point "recent" boost),
  never a number. `materialUsage.test.ts:232` should fail first, the way
  `dashboardPlans.test.ts` did; if it does not, find out why before fixing.
- **Fitting lines never count as "used"** in the same query
  (`db.ts:6788-6792`: the `CASE` covers conductor, ground and raceway only).
  Credit them through `li.runMaterialId`. Ranking only.
- **Recent plans row and card chip at phone width** (`todo.md`, checked at
  1536 px only). A look, not code, unless the look finds something.

---

## Looked at and left out

| Item                                                                                    | Why not in this batch                                                                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| § 5j extra, R7 makeup, § 4c typed-length runs, Phase 8 verticals on stamps              | Each needs columns, and three of them touch `takeoff_runs` or `bid_line_items`. They are the biggest short numbers left. |
| T bodies at a tee, locknuts and bushings                                                | New `bid_line_items.runMaterialRole` values (the role is in a unique key, so no role can be reused).                     |
| MC connectors and straps, flex straps, `5/6"` wafer                                     | Need catalog rows first: Track C.                                                                                        |
| Per-line markup override, route A/B, price bands                                        | Schema.                                                                                                                  |
| C14 schedule cross-check, V19 sheets not started                                        | Schema.                                                                                                                  |
| Undo, move and remove-all for marks (C6/C7/C13, D6); drag a point, extend a run (T8/T9) | No schema, but each is its own piece on the most fragile screen. Good candidates for the batch after this.               |
| C10 location tags (no UI sets them)                                                     | No schema, but not beta-blocking.                                                                                        |
| Plans Phase 2 (sidebar entry)                                                           | Deferred by the owner: "Phase 1 first, left-menu tab later".                                                             |
| Orphan-plan sweep against production                                                    | Built; running it is an owner step, dry run first.                                                                       |

---

## Questions for the owner, each with a recommendation

1. **May I run the dev server while building?** _Recommended: build without
   it, then do one screen pass at the end,_ when the laptop has memory, looking
   at pieces 1, 2, 3 and 5 together. CLAUDE.md does not let a screen change be
   called done unless somebody has looked at it, so nothing merges before that
   pass.
2. **Sheet-size warning: how does it go away?** _Recommended: a "Check it"
   that agrees clears it for the session, with nothing stored._ Storing "this
   sheet was checked" would need a column, which is out of scope here. The
   cost is that the amber comes back on the next visit to a genuinely 11×17
   set. It is honest, and a later batch can store it.
3. **Stale labor rate: flag only, or flag and re-apply?** _Recommended: flag
   only in this batch._ Re-pricing lines is a money-moving action and wants
   its own piece and its own look. The flag alone ends the silence.
4. **Should the Dashboard headline name unpriced lines even when the only one
   is on the sample bid?** _Recommended: no._ The headline already leaves the
   sample out entirely (`realBidValue`), so its gaps go with it.
