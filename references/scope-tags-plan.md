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

### Step 2 — the rule module and the money (TS + SQL together)

- `shared/lineScope.ts` (new): `LINE_SCOPES`, `scopeOf(line)` (NULL →
  install), `scopePricesMaterial`, `scopePricesLabor`, `scopeOnMaterialsList`
  (`"buy" | "ownerFurnished" | "off"`), `scopeKeepsDrops`, `scopeLabel`,
  `scopeChoicesFor(line)` (no `ofci` on remove/relocate lines).
- `drizzle/schema.ts`: declare `scopeTag` (`LINE_SCOPE_TAGS`).
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

## 6. Questions for the owner

Listed in `references/track-b-handoff.md` § "Scope tags — questions" and in
the reply, one per line, each with a recommended pick and whether it moves
a bid number.
