# Scope tags per bid line — BUILD PLAN, 2026-10-10 (Track B)

**Plan only. No app code, no migration applied.** This turns § 3 of
`references/status-and-scope-plan.md` (the SCOPE part) into build steps.
The SQL drafts for Track A are in `references/track-b-handoff.md`
§ "S1–S3 — SQL DRAFTS FOR TRACK A". Code was surveyed at `37c52c3`
(local-dev, merged into track-b); every path below was read, not guessed.

## 0. What this follows (decided already — do not re-open)

| Decision                                                                                   | Where                                                                   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| The four tags and what each prices                                                         | `status-and-scope-plan.md` § 3a                                         |
| Owner-furnished material stays visible, greyed, "owner furnished" (Q7)                     | same, § 8                                                               |
| "By others" and "Excluded" are separate tags (Q8)                                          | same, § 8                                                               |
| Ship the eight "Who does this?" items as editable seed content (Q9)                        | same, § 8                                                               |
| **By others / Excluded come off the materials list AND the drops (Q10)**                   | **owner, 2026-10-10, in the request for this plan** — § 8 now says so   |
| Unanswered = We install ("a little high beats low")                                        | `status-and-scope-plan.md` standing rules; `step-based-labor-plan` § 13 |
| Nothing applied silently; no AI call not asked for; every warning has a fix-it-here button | CLAUDE.md; `never-stuck-plan.md` § 1                                    |
| Labor with $0 material is never fully priced — unless the line says labor only             | CLAUDE.md § 6 (2026-10-05 / 10-06), `shared/lineNotPriced.ts`           |
| Simple by default, extras behind ONE "More options"                                        | CLAUDE.md § "Customization available, but never in the way"             |

**One change to § 3d, recorded in both files:** the note finder does NOT
search "EXISTING TO REMAIN" / "E.T.R.". That phrase is a MARK status (the
status view and A's twin fold own it), not a who-does-it answer; tagging a
bid line "By others" from it would be wrong. `status-and-scope-plan.md`
§ 3d says so too.

## 1. What the code does today — the facts the steps rest on

- **No scope field on `bid_line_items`** (`drizzle/schema.ts` ~4500–4828).
  Nearest: `lineRole` install/remove/relocate (0115), `snapshotLaborOnly`
  (0106), `isQuoteItem`.
- **`snapshotLaborOnly` changes no money.** `priceLine`
  (`server/bidPricing.ts:204`) prices `snapshotMaterialCost` whatever the
  flag says; the flag only silences "material not priced"
  (`lineMaterialNotPriced`, `shared/lineNotPriced.ts:198`, and the SQL copy
  at `server/db.ts` ~13135 / ~13606). **So "Owner furnishes" cannot just
  reuse the flag: material must actually leave the money.** New branch in
  `priceLine`.
- **The lock is `bids.quantitiesLockedAt`**, checked inline per procedure,
  and it only locks lines that follow the drawing (`shared/quantityLock.ts`
  `followsDrawing`, `lockedEditRefusal`). The request says locked bids
  never move, so a scope change is refused on a locked bid for EVERY line,
  typed ones included — stricter than the quantity lock, on purpose.
- **Two money paths, which must agree:** TS (`bidRollup` → `rollUpBid` →
  `priceLine`) for the bid, proposal, accounting, closeout, quote app and
  takeoff export; SQL (`lineCentsSql`, `lineNotPricedSql`, `costSums`,
  `server/db.ts` ~13015–13140) for the Dashboard (`getDashboardBids`) and
  analytics (`getBidCosts`, `getClosedJobCosts`).
  `server/dashboardNotPriced.test.ts` keeps them in step. (Noticed: the SQL
  `lineNotPricedSql` has no `lineRole` branch where the TS one does. Not
  this plan's to fix; noted in todo.md.)
- **Materials list** (`server/routers/materialsListRouter.ts` `get`, line
  loop ~182–216, `countedOnBid` ~231, stamp loop ~240–275, run footage
  ~486–498) reads lines, marks and runs. It does not read
  `snapshotLaborOnly`.
- **Drops are not on the device's line.** `loadGroupDrops`
  (`server/db.ts` ~15264) → `groupDrops` (`shared/groupDrops.ts:296`) →
  footage priced on the drop material's RUN-TYPE lines (`withPlanCounts`
  ~6638, `server/runTypeFootage.ts:51`). The only link from a drop to a
  bid line is `groupId` → `bid_line_items.takeoffGroupId` (install role),
  and `markDropEntries` loses it. **So excluding a "By others" count's
  drops means filtering its group in `loadGroupDrops`, before
  `groupDrops`.** That moves footage on the run-type lines — a real number,
  moved only because someone picked the tag.
- **Proposal** (`server/routers/proposalsRouter.ts` `document` ~301,
  `shared/proposal.ts` `buildProposal` ~663, `ProposalSheet.tsx`
  "inclusions" ~432–489) lists every priced line, no filter. Scope notes:
  `bid_scope_notes`, `shared/bidExtras.ts` `partitionScopeNotes` /
  `groupScopeNotes`.
- **Bid line rows** (`client/src/pages/BidsPage.tsx`, row loop ~1319):
  no per-line menu, no multi-select anywhere, no "More options" in the line
  area. Bid edits undo only a line removal
  (`client/src/hooks/useRemoveBidLine.ts`, toast Undo).
- **Copies of a line** are made by `generateBidUnits`,
  `pushTemplateToLinkedCopies`, `duplicateUnit` and the Undo packet
  (`server/bidLineRestore.ts`). A new column must ride all four.
- **Sheet text search exists:** `searchSheetText` (`server/db.ts` ~6245,
  LIKE, `SEARCH_PAGE_LIMIT` 300) behind `bidPdfs.searchText`;
  `shared/planTextSearch.ts` (`normaliseForSearch`, `findInText`). No
  NIC / by-others / OFCI reader exists.
- **No company-default rows for scope:** `scope_notes.userId` is NOT NULL
  and unseeded. The shipped-library pattern to copy is `modifiers`
  (nullable `userId` + `baselineId` / `baselineVersion`, seeded by
  `seedBaselineModifiers` from `server/seed/baselineModifiers.ts`, forks
  resolved by `shared/forkedRows.ts`).

## 2. The rules, in one place

**One module decides: `shared/lineScope.ts`** (new). Everything below reads
it; nothing re-derives it.

| Tag (stored)    | Screen word                 | Material money | Labor money | "Not priced" can say       | Materials list                                       | Drops                 | Proposal                                        |
| --------------- | --------------------------- | -------------- | ----------- | -------------------------- | ---------------------------------------------------- | --------------------- | ----------------------------------------------- |
| NULL (not said) | We install (no chip)        | as today       | as today    | as today                   | as today                                             | as today              | as today                                        |
| `install`       | We install                  | as today       | as today    | as today                   | as today                                             | as today              | as today                                        |
| `ofci`          | Owner furnishes, we install | **0**          | as today    | hours only, never material | **"Owner furnished — not to buy"** section, qty kept | **kept** (we wire it) | Included: "Owner-furnished, installed by us: …" |
| `by_others`     | By others                   | **0**          | **0**       | **never**                  | **off**, with a footer "left off: N by others"       | **off**               | Not included: "By others: …"                    |
| `excluded`      | Excluded                    | **0**          | **0**       | **never**                  | **off**, footer "left off: N excluded"               | **off**               | Not included: "Excluded: …"                     |

- NULL and `install` price identically. The difference is only "has
  somebody answered": a "Who does this?" prompt stops asking once a line
  says `install` explicitly. That is why no answers table is needed (§ 4).
- **A takeoff-linked line keeps its live quantity** whatever its tag; the tag
  decides only what that quantity is priced at.
- **Remove / relocate lines** (`lineRole`) carry their own tag. They are
  labor-only already, so their menu offers We install / By others /
  Excluded (no "Owner furnishes"). Tagging the install line does NOT tag
  its remove line — demo by others with new by us is a real split.
- **A line is never hidden.** By others / Excluded lines stay on the bid,
  greyed, with the tag in the cost cell, so they can be switched back.
- **`scopeTag` is REQUIRED on the line types the rules read**
  (`NotPricedLineLike`, the rollup line, the materials-list line), the same
  forcing function as `StampRecord.status`: a mapping that forgets it does
  not compile.

## 3. Build steps, in order

Each step lists its files, which numbers it can move, and its proof.
"Measure" means `scripts/bidTotals.mts` before and after on a clean copy,
`--compare`, and every moved bid explained.

### Step 1 — S1 additive (Track A): `bid_line_items.scopeTag`

SQL in the handoff. NULL = not said = today. Applied before any code that
selects the column (every line read is a bare `select()`).
**Moves no number.** Measure: all bids unchanged.

**DONE 2026-10-12 (Track A): `drizzle/0146_line_scope_tag.sql`, with S3 as
`0147_bid_scope_prompts_dismissed.sql`.** On local-dev, local DBs and
staging's DB; staging 1,196/1,196 bids unchanged (`deploying.md` §
"Staging: migrations 0146–0147"). A ALSO declared both in
`drizzle/schema.ts` — `LINE_SCOPE_TAGS` (exported, above `bidLineItems`),
`bidLineItems.scopeTag`, `bids.scopePromptsDismissedAt` — so step 2 below
does NOT redeclare them; import `LINE_SCOPE_TAGS` from the schema.

### Step 2 — the rule module and the money (TS + SQL together)

**DONE 2026-10-12 (Track B, `b-scope-tags`).** As below, plus two things
the list did not say: hours leave the money with labor (the SQL `hours` is
gated, so the card's hour total drops too), and an OFCI line's "not
priced" is decided by its hours on a typed / run-type line (never a
coupling, connector or strap — `laborInRunRate`) and never as a whole on an
assembly line, whose missing hours are `lineHoursMissing`'s. Tests:
`server/lineScopePricing.test.ts` (9 red on the old code; the 6 green are
the NULL / install / switch-back / untagged controls) and the "tagged by
scope" cases in `server/lineNotPriced.test.ts` (6 red). bidTotals on
bidrender_local_b_new: 4,306/4,306 unchanged.

- `shared/lineScope.ts` (new): `LINE_SCOPES`, `scopeOf(line)` (NULL →
  install), `scopePricesMaterial`, `scopePricesLabor`, `scopeOnMaterialsList`
  (`"buy" | "ownerFurnished" | "off"`), `scopeKeepsDrops`, `scopeLabel`,
  `scopeChoicesFor(line)` (no `ofci` on remove/relocate lines).
- `drizzle/schema.ts`: ~~declare `scopeTag` (`LINE_SCOPE_TAGS`)~~ — done
  by A with 0146 (2026-10-12); nothing to add here.
- `server/bidPricing.ts` `priceLine`: material 0 unless
  `scopePricesMaterial`; labor 0 unless `scopePricesLabor`. Markup rides on
  material, so it goes to 0 with it.
- `shared/lineNotPriced.ts`: `lineNotPriced` false for by_others /
  excluded; `lineMaterialNotPriced` false for ofci (beside the
  `snapshotLaborOnly` check); `linePartsNotPriced` false for all three;
  `lineHoursMissing` still applies to ofci.
- `server/db.ts`: `lineScopeSql` used by `lineCentsSql`, `lineNotPricedSql`,
  `costSums` (`frozenParts`, `noMaterial`) — the same three answers.
- **Moves no number on its own** (every row is NULL after S1). Measure:
  all bids unchanged.
- Tests: `server/lineScopePricing.test.ts` (new) — a priced fixture line,
  $100 material + 2 h at $50: install $200, ofci $100, by_others $0,
  excluded $0, NULL $200; each red without its branch. Extend
  `server/dashboardNotPriced.test.ts` so TS and SQL agree on all four tags.
  `shared/lineNotPriced` unit cases for each tag.

### Step 3 — setting a tag, per line, with Undo, refused when locked

**DONE 2026-10-12 (Track B, `b-scope-tags`).** `bids.setLineScope` takes
`lineIds` + `scopeTag` or `changes` (Undo); `db.setBidLineScopes`;
`client/src/hooks/useSetLineScope.ts`; `client/src/components/bid/LineScopeMenu.tsx`
(the "…" and the chip). Generated unit copies carry the tag; a push on a
locked bid keeps each copy's own tag, pairing old and new lines by
(assembly, name) in order, and returns `scopeKept`, which the push toast
names (`pushDoneCopy`, @/lib/unitLinks, 2026-10-12 later). Lock proof
without touching the guard: `lineScopeSet.test.ts` runs the same change
through the layer under it (`db.setBidLineScopes`; the push told "not
locked") on a locked bid and asserts the lock check then FAILS. Found on screen and
fixed in the same step: the hours cell read "0 h · Example rate" on a By
others line (`bidHoursCell` now has `notOurs`), and the Fix walk still
offered to price an owner-furnished line's parts (`lineFixGaps` now reads
the tag), so the strip said "1 part" beside "Fix these 2". Tests:
`server/lineScopeSet.test.ts`, `client/src/lib/lineScopeWired.test.ts`,
new cases in `bidHoursCell.test.ts` and `fixLine.test.ts`. Looked at
1536x864, 820x1180, 1180x820: $127.48 → $83.32 (By others) → Undo
$127.48; → $122.48 (Owner furnishes) → Undo $127.48; no sideways scroll.

- `server/routers/bidsRouter.ts`: `setLineScope({ bidId, lineIds[],
scopeTag | null })` — company-scoped (`ctx.scope.dataUserId`),
  **refused on a locked bid** (`lockedEditRefusal("scope cannot change")`),
  refuses `ofci` on a remove/relocate line, returns `previous: { id,
scopeTag }[]` so Undo can put each back (NULL included). Many ids so the
  later bulk offers (steps 6–7) use the same call.
- `server/db.ts`: `setBidLineScope`; add `scopeTag` to the copies in
  `generateBidUnits`, `pushTemplateToLinkedCopies`, `duplicateUnit`, and
  `server/bidLineRestore.ts`.
- `client/src/hooks/useSetLineScope.ts` (new): optimistic write, toast with
  Undo → `setLineScope(previous)`; invalidates through the bid screen's ONE
  refresh helper (bid, totals, materials list, drops readout, proposal) —
  CLAUDE.md § "a screen showing yesterday's answer".
- `client/src/pages/BidsPage.tsx` row: a small "…" button beside the remove
  X opens "Who does this?" with the line's choices. **A line on We install
  shows no chip**; a tagged line shows its chip, which opens the same menu.
  Hidden menu on a locked bid; the chip shows, read-only, with "the bid is
  locked; unlock it to change who does this".
- `client/src/components/LineCost.tsx`: by_others / excluded read "By
  others" / "Excluded" in the cost cell, greyed; ofci shows labor and
  "owner furnished" for material. LineCost is shared by the bid and Count
  screens and Quick bid, so all three get it at once.
- **Moves a number only when a person picks a tag, on that bid, with Undo.**
  Measure: all bids unchanged (nobody has picked one).
- Tests: `server/lineScopeSet.test.ts` — locked refusal (typed line too),
  another company refused, `previous` round-trips, copies carry the tag;
  `client/src/lib/lineScopeWired.test.ts` — the hook invalidates the
  materials list and drops queries. Then LOOK: 1536x864, 820x1180,
  1180x820; tag a line, watch the total, the cost cell and the materials
  list move, Undo, watch them move back.

### Step 4 — materials list and drops follow the tag

**DONE 2026-10-12 (Track B, `b-scope-tags`).** Done: assembly and
count lines — off lines leave the order and are counted in `leftOff`
(footer in the dialog, CSV and PDF, `leftOffWords`); owner-furnished lines
are listed by line with quantity under "Owner furnished — not to buy"
(`ownerFurnished`); an off line still claims its count, so its marks are
not added back. Drops: `db.groupsWithoutDrops` filters By others / Excluded
counts at the top of `loadGroupDrops`. Test:
`server/lineScopeMaterials.test.ts` (red on the old code with the tag
written to the row: the part stays on the order, drops stay 2). Looked at
1536x864 and 820x1180.
**RUN-TYPE LINES — DONE 2026-10-12 (later).** Until then a wire / conduit
line tagged off was off the money but its traced footage, fittings and
extras stayed on the list (the section reads the runs, not the lines). Now
each run type with a role tagged off or owner-furnished is totalled on its
own by the same `totalQuantities` (its runs, drops and homeruns) and that
ROLE's share subtracted (`withoutNotToBuy`, shared/materialsList.ts:
raceway → conduit; conductor → insulated wire, or the cable on a cable
type; ground → bare). Fittings skip a tagged role; an extra skips its
tagged line. Off lines count in the footer; owner-furnished ones are listed
by the foot. Tests: `server/lineScopeRunLines.test.ts` (5 red on 539f5787:
100 ft of conduit and 200 ft of wire stayed on the order) and the
`withoutNotToBuy` cases in `server/materialsList.test.ts`. Looked at on
"Bar layout check" at 1536x864, 820x1180, 1180x820: Conduit 246.92 →
135.8 ft with the 1/2" EMT By others, insulated wire 222.24 ft moved to
Owner furnished, footer "1 line by others"; tags reset to NULL after.

- `server/routers/materialsListRouter.ts`: per-line loop — `off` skips,
  `ownerFurnished` goes to a new `ownerFurnished` section (kept qty, no
  cost), and a `leftOff` tally for the footer. A by_others / excluded
  takeoff-linked line marks its group as HANDLED in `countedOnBid` so the
  stamp loop does not add its marks back. Run-type lines tagged off drop
  their footage from the run section (~486–498).
- `shared/materialsList.ts`: the section and footer in `aggregateMaterials`
  and `toCsv` ("Owner furnished — not to buy"; "Left off — by others: …").
- `server/db.ts` `loadGroupDrops`: skip groups whose install line is
  by_others / excluded (`scopeKeepsDrops`). One place, so the readout
  (`BidDropsReadout.tsx`), run-type footage and the not-priced drops tally
  all follow.
- **Moves numbers only on bids with an off tag:** materials list qty, drop
  footage, and the run-type lines priced from that footage.
- Tests: `server/lineScopeMaterials.test.ts` — a count of 4 with 10 ft
  drops: tagged by_others → off the list, drops 40 ft → 0, run-type line
  footage and money down by the same; ofci → in "owner furnished", drops
  kept; Undo → all back. Fixture shapes chosen so "off the list" and "drops
  kept" can answer differently (CLAUDE.md § fixtures).

### Step 5 — proposal and scope summary

- `shared/proposal.ts` `buildProposal`: lines grouped by `scopeOf`; ofci
  lines under Included as "Owner-furnished, installed by us: …"; by_others
  and excluded under Not included, prefixed. Hand-written scope notes stay
  exactly as they are, listed first.
- `server/routers/proposalsRouter.ts`: pass `scopeTag` through (the
  explicit screen mapping at ~419, per CLAUDE.md "explicit for screens").
- `client/src/components/proposal/ProposalSheet.tsx`: "inclusions" renders
  the grouped lines. Scope-only print unchanged except it gains the lines.
- `client/src/components/bid/ScopeSummary.tsx` (new) above the bid totals:
  "48 we install · 6 owner furnishes · 3 by others · 2 excluded". **Hidden
  on the basic path** (no tag set and no prompt matches). Tap a word to
  filter the lines to it (view only).
- **Moves no number.** Tests: `shared/proposal` grouping cases; LOOK at the
  printed proposal at letter size.

**DONE 2026-10-12 (Track B).** `scopeLinesForProposal` in `shared/proposal.ts`:
one Includes entry "Owner-furnished, installed by us: 24 Light fixture, …"
(same name across rooms summed), Excludes "By others: …" / "Excluded: …" by
name, after the typed notes. By others / Excluded leave the scope of work;
ofci stays in it (we install it). The client document's scope lines carry
name / qty / unit only — `scopeTag` stays on our side (`proposal.test.ts`
"what leaves the building" caught it). A bid with no line of ours is
`noWork` ("No work added yet"), never $0.00. **Two departures, said here:**
(1) the summary sits above the LINE LIST, not the totals — its words filter
that list, and a filter belongs beside what it filters; the filter hides
rows only, unit subtotals still sum every line. (2) "Hidden on the basic
path" holds for the counts; the card still shows a closed "More options"
row when the bid has plans, because that is where the note finder lives.
Tests: `server/lineScopeProposal.test.ts` (5 red on a40eb6f4),
`client/src/lib/scopeSummary.test.ts`. Looked at the letter-size sheet.

### Step 6 — "Who does this?" prompts

- **6a, no migration:** `shared/scopePrompts.ts` — the eight shipped
  prompts (light fixtures, appliances, low-voltage / data, fire alarm
  devices, HVAC control wiring, EV charger units, permits,
  trenching / patching / painting), each with match words and categories,
  and `matchScopePrompts(lines, prompts)`: a line matches when its
  category or name matches AND its `scopeTag` is NULL. Shown in the scope
  summary as "Who does this? — 3 items"; each item opens the four chips
  inline (step 3's call, many lines at once). "Don't ask on this bid"
  hides it (S3's `bids.scopePromptsDismissedAt`). Never blocks print or
  send. Locked bid: no prompt.
- **6b, needs S2:** the list becomes editable — `scope_prompts`, the
  `modifiers` pattern (shipped rows `userId` NULL with `baselineId`,
  re-stamped from the seed; a shop's edit forks; a shop's own rows always
  shown above the fold). `server/seed/baselineScopePrompts.ts`, seeder in
  `server/db.ts`, called from `server/seedShippedLibrary.ts`; editor under
  Settings → Pricing "More options". 6a's constant becomes the seed file.
- **Moves no number** (an answer is step 3's call, with Undo).
- Tests: matcher cases (a fixture line named for a fixture matches; an
  answered line does not); seed re-stamp leaves a fork alone (the
  `seedPreservesUserPrices` shape).

**6a DONE 2026-10-12 (Track B); 6b still waits for S2.**
`shared/scopePrompts.ts` (`SHIPPED_SCOPE_PROMPTS`, `matchScopePrompts`,
`showScopePrompts`): whole-word matching on the line's name (plural "s"
ignored), the assembly's category matching on its own, and `notWords`
taking a line back out. The category reaches the screen as
`assemblyCategory` on each `bids.get` line (`db.getAssemblyCategories`,
forks followed — it shares `resolveStoredAssemblies` with
`getAssemblyMountKinds`). `ScopePrompts.tsx` in the "Who does what" card:
closed, "Who does this? — N items"; each item lists its lines ticked, and a
chip tags the ticked ones through `useSetLineScope` (same Undo, refusals,
refresh). "Don't ask on this bid" → `bids.setScopePromptsDismissed` (S3),
with Undo and a quiet "Ask again" line. **Two decisions made at build, said
here:** (1) Appliances and EV charger units leave out lines named for OUR
wiring (circuit, receptacle, connection, whip, disconnect, conduit, stub,
outlet) — the plan names the UNIT, and "owner furnishes?" on "EV charger
circuit, 48A" invites a tag that takes our own wire off the price.
(2) Light fixtures uses the Lighting category but leaves out controls and
fans filed there (contactor, time clock, photocell, sensor, switch, dimmer,
transformer, fan). Tests: `server/scopePrompts.test.ts` (rules, plus every
shipped starter run through it), `server/scopePromptsDismiss.test.ts`.

### Step 7 — note finder (plain text, under "More options")

- `shared/scopePhrases.ts` (new): BY OTHERS · FURNISHED BY OTHERS · BY
  OWNER · OWNER FURNISHED · OFCI · OFOI · CFCI · N.I.C. / NIC / NOT IN
  CONTRACT · BY G.C. · BY DIVISION 23 / 27 / 28. NIC matched as a whole
  word only (it sits inside other words). `sentenceAround(text, hit)` and
  `linesSharingAWord(sentence, lines)`.
- `server/routers/bidPdfsRouter.ts`: `scopePhrases({ bidId })` — one pass
  over `bid_pdf_sheet_text` for the bid's plans (reuse `searchSheetText` /
  `findInText`), returns sheet, sentence, phrase.
- `client/src/components/bid/ScopeNoteFinder.tsx` (new): under the scope
  summary's "More options". A list: sheet, sentence, "Go to" (the Plans
  screen at that sheet), "Tag matching lines" → a tick list of suggested
  lines, nothing ticked by default, the tag chosen, step 3's call.
- **No AI, no number moves.** The optional "Read this note" AI button
  (≈ $0.0007 a note, `legend-and-notes-automation-plan.md` § 2) is NOT in
  this plan; it is a later button.
- Tests: phrase cases including "NIC" inside "MECHANICAL" (no hit), a
  sentence split over two text pieces; the procedure refuses another
  company's bid.

**DONE 2026-10-12 (Track B).** `shared/scopePhrases.ts` (phrases longest
first, so FURNISHED BY OWNER is one note; whole-word matching; the dots of
G.C. / N.I.C. do not end a sentence unless the next note's number follows);
`db.sheetTextMatchingAny` (LIKE narrowing, a test checks every example
passes one) → `bidPdfs.scopePhrases` (a note printed on several sheets is
one note listing them; says how many sheets it could not read);
`ScopeNoteFinder.tsx` under the summary's "More options". Suggestions are
unticked; tagging is `useSetLineScope`, same Undo / refusals; none on a
locked bid. Phrase → suggested tag: by others / OFOI / by G.C. / by Div
23-27-28 / by owner → By others; furnished by owner / owner furnished /
OFCI → Owner furnishes; N.I.C. / not in contract → Excluded; CFCI → We
install. Seen on screen: "SITE LIGHTING N.I.C. 5." took the next note's
number — fixed, with a test. Tests: `server/scopePhrases.test.ts`.

## 4. Migrations (drafts in the handoff; Track A numbers and runs them)

| Draft | For     | What                                          | Kind             |
| ----- | ------- | --------------------------------------------- | ---------------- |
| S1    | step 1  | `bid_line_items.scopeTag` enum NULL           | additive, step 1 |
| S2    | step 6b | `scope_prompts` (shipped + company rows)      | additive, step 1 |
| S3    | step 6a | `bids.scopePromptsDismissedAt` timestamp NULL | additive, step 1 |

No meaning migration: every existing line stays NULL = We install. This
replaces the plan's M5/M6: M6's `bid_scope_answers` is not needed, because
the answer IS the line's tag (NULL vs `install`), and the per-bid "don't
ask" is one column (S3).

## 5. Which steps move a bid number

| Step                    | Moves a number?                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1 S1, 2 rule + money    | No (every row NULL). Measured: all bids unchanged.                                                                      |
| 3 set a tag             | Only when a person picks one, on that bid, with Undo; refused on a locked bid.                                          |
| 4 materials list, drops | Only on bids with a By others / Excluded line: list qty, drop footage, and the run-type lines priced from that footage. |
| 5 proposal, summary     | No.                                                                                                                     |
| 6 prompts               | No (an answer is step 3).                                                                                               |
| 7 note finder           | No (a tag is step 3).                                                                                                   |

## 6. Owner answers — 2026-10-10 (all twelve decided)

The questions are in `references/track-b-handoff.md` § "Scope tags —
questions". The owner's answers, which the steps above follow:

| Q   | Answer                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Yes:** a tag change is refused on a locked bid for EVERY line, typed lines too (step 3).                                                                                                |
| 2   | **Yes:** a "…" on each line; a chip only on tagged lines; We install shows nothing (step 3).                                                                                              |
| 3   | **Keep drops on owner-furnished lines** — we still wire them (§ 2 table, step 4).                                                                                                         |
| 4   | **Separate:** remove / relocate lines carry their own tag; tagging the install line does not tag them (§ 2).                                                                              |
| 5   | **Yes:** many lines at once only from the prompts and the note finder; no general line multi-select for now (steps 6–7).                                                                  |
| 6   | **No for now:** an assembly carries no default tag; every new line starts not said (= We install).                                                                                        |
| 7   | **Yes:** By others / Excluded lines leave the materials list with a footer, "left off: 3 by others" (step 4).                                                                             |
| 8   | **Yes:** the proposal lists owner-furnished lines with quantity ("12 light fixtures"), by-others / excluded by name only (step 5).                                                        |
| 9   | **Leave out:** the note finder does not search "EXISTING TO REMAIN" / E.T.R. (§ 0, step 7).                                                                                               |
| 10  | **Per bid:** "Don't ask" hides the prompts on that bid only (S3); the shop edits the list itself in Settings (step 6b).                                                                   |
| 11  | **Yes, but never onto locked bids:** pushing a unit template to its linked copies carries its tags, and a push that would change a tag on a locked bid does not change it there (step 3). |
| 12  | **Yes:** wire / conduit (run-type) lines take all four tags (steps 2–4).                                                                                                                  |

**What Q11 means for step 3:** `pushTemplateToLinkedCopies` copies
`scopeTag` like every other field, behind the same lock check as
`setLineScope` — on a locked bid the tag on a copy stays as it is, and the
push says so. Tested in `server/lineScopeSet.test.ts` (a push to a locked
bid's copy leaves its tag; to an unlocked one moves it).
