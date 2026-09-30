# How "Read sheet" should use the legend. PLAN ONLY, 2026-09-29

**Asked by the owner, and marked very important:** how should Read sheet use the
legend? Nothing here is built. There is no code, no migration and no deploy on
this branch.

**This builds on decisions already made. Read these first:**
`references/plan-viewer-overhaul.md` § 5l (one flow: read the legend, correct
a list, then count), § 9 (AI-assisted legend capture, Phase 9a), § 9.4 (a
remembered symbol is suggested, never applied, and confirmed **once per plan
set**), § 11.5 (costs) and § 15 (the accuracy bake-off nobody has run). This
plan agrees with all of them. It changes one thing, the order in § 5l's
2026-09-21 table, and says so in § 6 below and in that file.

---

## 0. The owner's answers (2026-09-29) — these override anything below

1. **The legend is read from a box you drag around it.** One drag, not one per
   symbol. A "whole sheet" option stays as the fallback for a legend spread
   across the page (§ 4, step 1).
2. **An addendum or second PDF always gets the OFFER "use set X's legend?",
   and it is never applied on its own.** One click to accept, and nothing
   happens without that click (§ 4, "When the legend is somewhere else").
3. **Plain name counts are IN v1.** A legend symbol can be confirmed as just
   a name ("Floor box") with no library entry, counted, and priced later.
   What that adds to the build:
   - the new table's nullable `groupId`, pointing at a plain count
     (`takeoff_groups` kind `plain`) on the bid. It is in the same migration,
     so there is no extra one;
   - `planCopilot.confirm` and `isAcceptable` (`shared/copilotDetection.ts`)
     accept a finding whose legend entry has a plain count, not only an
     assembly. Today both refuse a finding with no assembly;
   - the Legend list's picker offers "just a name" beside the assembly search
     (§ 5l step 3, level 1);
   - a test that a plain-name symbol found by Read sheet can be placed and
     lands on that plain count.

   This is `plan-viewer-overhaul.md` § 5l (b), built as part of this plan.
   Reasoning in § 7 Q3.

### Two things that must happen BEFORE this ships

**A. The AI correction log must be live first, so every legend fix is logged.**
This is piece 3 of `references/stage-4-safety-plan.md` (`ai_correction_log`,
planned there as "0099, or whatever is next when written"; after the
0098–0105 batch it becomes 0106 or later). The legend flow adds edits the
AI made and a person changed, and each one must write a row, on the same
rules as that plan (written after the edit commits, cannot block it, stores
no drawing content):

- a legend label the model read and the user **fixed**;
- a legend entry the user **rejected** ("not a symbol");
- a **remembered** suggestion the user turned down for this set;
- a box the user **moved or resized**;
- a Read sheet finding re-pointed to a different legend entry (today's
  `planCopilot.correct`, already on that plan's list).

The stage-4 plan names four writers today. **Add these five to its list when
it is built**, or the log will silently miss the edits this feature makes. If
the log has shipped before this is built, add them in this feature's own
commit. The test is that each of the five produces a row.

**B. Run the reader accuracy test BEFORE choosing what to build first.** It
compares three ways of reading on the same real sheets, against hand counts
made first and unseen (§ 15.2's method):

| Method                          | What is sent                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| 1. Today's method               | Whole sheet as one picture, symbol names as words               |
| 2. Legend first                 | Whole sheet as one picture, plus the confirmed legend pictures  |
| 3. Zoomed-in pieces             | The sheet cut into about 6 tiles at 150 px/in, names as words   |
| 4. Both (optional, recommended) | Tiles plus legend pictures, which is what would ship eventually |

- **Sheets:** 5, weighted to dense ones: the four drawing sheets of the Old
  Blueridge fixture set plus one pine st drawing sheet. Legend entries for
  each set are captured by hand first, so method 2 is not also testing v1's
  legend reader. Whether pine st has a legend sheet at all is not checked
  yet. If it has none, capture its symbols off the floor plan and say so in
  the results.
- **Per method it reports:** how many real devices it found, how many it
  invented, and a breakdown by symbol type (§ 15.2).
- **And WHERE it put them: position error per mark, in inches of paper.**
  Added 2026-09-29 after staging's E-100: the reader named symbols it was
  sure of, then placed them up to about 2.4 in off, mostly downward and
  growing toward the bottom of the sheet (branch a-reader-fixes,
  `client/src/lib/readerPicks.ts`). A method that finds every fixture but
  puts it by the wrong door is not usable, and "found" alone cannot see
  that. Worth adding as a fifth method if cheap: ask for positions in the
  image's own PIXELS rather than 0–1 fractions, since the error looked like
  a stretch, not a shift. Unmeasured; it is a candidate, not a fix.
- **Cost, indicative, from § 11.5:** about 5c a sheet for methods 1 and 2 and
  about 10c for 3 and 4. 5 sheets across four methods, run twice, is **about
  $3**. **The real cost is the hand counts: about two hours of the owner's
  time**, done before any reading is seen.
- **It needs a small script** (under `scripts/`, AI calls made on purpose,
  never from the app), because method 3 needs tiles and the app cannot make
  them yet. `shared/visionImageLimits.ts` already has `largestSquareTile`.
  Run it against the local fixture files with a real key.
- **What each result means:** if legend-first closes most of the gap, build
  this plan first. If only tiles do, tiling (Phase 10) goes first and this
  follows. If method 4 is far ahead of both, build both, legend first,
  because it is cheaper and tiling needs it anyway (§ 9.6). If none is
  accurate enough, the reader is a first pass that speeds up a hand count,
  and the product says so (§ 15.5).

This overrides § 15.4's "not yet" in `plan-viewer-overhaul.md`, and a line
there says so.

---

## 1. What Read sheet does today, in plain words

Checked against the code on `local-dev` at `90a286c`, 2026-09-29.

**You press Read sheet.** Nothing reads on its own; opening a sheet costs
nothing (`TakeoffPage.tsx:3056-3071`). The button waits until the sheet has
finished drawing.

**What it sends to the AI:**

- **One picture of the whole sheet.** There is no crop, no zoom and no separate
  legend picture. The app reuses the image already on screen, shrinks it to the
  most the model will look at, and sends it as a JPEG (`client/src/lib/planSnapshot.ts`).
  On a 36x24 sheet that is 2352x1568 pixels, about **65 pixels per paper inch**,
  so a receptacle symbol arrives about **11 pixels across**
  (`shared/visionImageLimits.ts`, § 11.5).
- **The sheet's text**, where the PDF has any (up to 12,000 characters). On both
  real sets this is worthless: one is a scan with no text, the other is poor OCR.
- **A list of the names of your saved symbols, as words only.** For example
  `"Duplex" — linked to: Duplex receptacle standard`. These come from the
  symbols you captured with + Capture, **from every job you have ever done**,
  not from this plan set. **The model never sees the pictures of them.** The
  small picture saved with each symbol is used only in your legend panel.

**Does it use the sheet's legend? No.** The instructions tell the model to
**ignore** legends on the sheet, along with title blocks and schedules
(`planCopilotRouter.ts:231`). It is told a name like "Duplex" and has to guess
what this engineer's duplex symbol looks like from the word alone.

**What it suggests back:** one row per symbol it thinks it saw, each with a spot
on the sheet, a name, and how sure it is.

- **A name that exactly matches one of your saved symbols** (ignoring case and
  spacing) takes that symbol's assembly. A near miss ("Duplex recept.") matches
  nothing.
- **Sure, and linked to an assembly:** shown as a dashed circle on the drawing,
  ticked in the list.
- **Not sure, or not linked:** unticked, or shown with a "Link" button.
- **Could not make it out:** listed as "needs your eyes", with no checkbox. It
  can never be placed.
- A fix you make ("that's not X, it's Y") is remembered for that architect's
  drawings.

**What Place does:** puts a real mark on each ticked spot, exactly like a mark
you clicked yourself. It joins that assembly's count on this bid, and the bid
line follows the count. It does not ask which assembly; that came from the
symbol. **Dismiss** throws the ticked suggestions away. Nothing reaches the bid
until you press Place.

**A sheet with no legend on it** makes no difference today, because the legend
is never read on any sheet. It uses your account-wide list of symbol names
either way. **With no symbols saved at all,** every suggestion is unlinked, so
none can be "sure" (`shared/copilotConfidence.ts` forbids it). You get a list of
things to link and nothing you can place in one go.

**The two limits that matter most:**

1. **Resolution.** At 11 pixels a symbol, a filled triangle and a hollow one
   are hard to tell apart. No legend fixes that. Only zoomed-in tiles fix it
   (§ 10.1), and tiling is gated on § 15's bake-off.
2. **Matching by word.** The model has to copy your symbol's name exactly and
   has never seen what it looks like. **The legend fixes this one**, and cheaply.

---

## 2. The three options, weighed

|                            | (a) Read the legend on every sheet                                 | (b) Skip the legend, let it guess                                                                                          | **(c) Legend confirmed once per plan set, reused on every sheet**                          |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Accuracy                   | Good matching, but a mistake is made and fixed again on each sheet | **Worst.** A guess from a generic idea of a symbol. Engineers differ (§ 9.4), and an unlinked guess can never reach "sure" | **Best available without tiling.** The model compares against this engineer's own pictures |
| Your time                  | A confirmation on every sheet                                      | None up front, a lot of fixing after                                                                                       | **About one minute per plan set**                                                          |
| Cost                       | Legend read on every sheet: roughly 3c extra each                  | Nothing extra                                                                                                              | **About 3c once per set** (§ 11.5), then under 1c extra per sheet read                     |
| Legend on another sheet    | **Breaks.** Most floor plans have no legend on them                | Irrelevant, and that is the problem                                                                                        | **Works.** The legend belongs to the set, wherever it is printed                           |
| Matches existing decisions | No. § 9.4 says once per set                                        | No. § 5c, and the reader's own header ("symbol meaning is the user's")                                                     | **Yes.** It is § 5l and § 9                                                                |

## 3. RECOMMENDATION: (c), legend once per plan set

**Read the legend once for each plan set. You confirm or fix the list, and
every Read sheet in that set is then matched against the pictures you confirmed.**

Why:

- **It is the only option that works when the legend is on E0.01 and the
  counting is on E1.02**, which is how most sets are drawn, including the
  fixture set.
- **It turns recognition into comparison.** The model is shown "these are the
  18 symbols on this set, here is what each looks like". That is easier than
  "find a Duplex", and it is what lets a finding honestly be "sure".
- **You check it once, where checking is easy.** A legend is the easiest thing
  in a set to read: symbols spaced out, drawn large, each with its label beside
  it (§ 9.1). A mistake caught there is caught before it spreads across forty
  sheets.
- **It is cheap.** About 3c per set to read the legend. On every sheet read
  after that, the confirmed pictures add about 16 to 36 tokens each: under
  1,000 tokens for 25 symbols, about **0.2c a sheet** on Sonnet 5 at $2 per
  million input tokens. Indicative, from `shared/aiPricing.ts`; the console
  has the bill.

**What it does NOT fix, said plainly.** Read sheet still sends one shrunk
picture of the whole sheet, so a symbol is still about 11 pixels across. The
legend makes it much better at saying **which** symbol a mark is. It does not
make it better at **seeing** small marks on a dense sheet. That needs tiles, and
nobody has yet measured how well the reader counts (§ 15). **So v1 should be
described as better matching, not as accurate counting.** Whether that
matters more than tiling is what the accuracy test in § 0 decides, and the
owner has ruled that it runs BEFORE anything is built.

---

## 4. How it would work, step by step

**Step 1: Read legend (a button, on the sheet you choose).**

- It sits in the Legend panel, next to + Capture. Like every AI feature, **it
  only runs when pressed.**
- The app may **suggest** which sheet holds the legend, for free, from sheet
  titles already stored (`bid_pdf_sheet_identity.sheetTitle` containing
  LEGEND, SYMBOL or ABBREVIATION). A suggestion only. You open the sheet.
- **You drag one box around the legend area.** One drag, not one per symbol.
  The app renders just that area at a scale where the symbols are clear (the
  worker's region render, § 4b) and sends that picture, which is sharper and
  cheaper than the whole sheet. A "whole sheet" option covers a legend spread
  across the page.

**Step 2: A list to check.** Each row shows the symbol's picture, the label the
model read, and a box on the drawing. For each one:

- **Keep**, **fix the label**, or **not a symbol** (reject).
- **Link it to an assembly** (the existing picker), or leave it unlinked for now.
- **Remembered symbols come in as suggestions.** If a symbol looks like one you
  confirmed on an earlier job, the row says so, shows both pictures side by
  side, and names the set it came from. **It arrives unticked.** A remembered
  match is never applied on its own (§ 9.4, § 5l).
- **Anything the reader missed** gets added with the existing + Capture drag.
  It lands in the same list.

**Step 3: Confirm the list.** It is saved **against this plan set** (the PDF),
not the bid, not the sheet, and not your whole account. Rejections are saved
too, so it does not ask again.

**Step 4: Read sheet, on any sheet of that set,** now sends:

- the sheet picture, as today;
- **the set's confirmed legend: each symbol's picture and label, numbered.**

The model answers "legend entry 7", not a name it had to copy. That removes
today's exact-spelling match, which is the fragile part. Anything it sees that
is **on the plans but not in the legend** still comes back unlinked and "not
sure", and the Legend list shows it as a row: "found on the plans, not in the
legend" (§ 5l).

**The panel says which legend it used,** e.g. "Matched against the 18 symbols
confirmed for this set". With no confirmed legend it says "No legend confirmed
for this set; reading against your saved symbols by name", and works exactly as
today.

### When the legend is somewhere else, or nowhere

| Case                                                                              | What happens                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legend on E0.01, counting on E1.02                                                | The normal case. Read the legend on E0.01 once; every sheet in the set uses it                                                                                                                                                                                     |
| **Legend in a different PDF** (the bid has a separate drawing set or an addendum) | Each PDF is its own set and has its own legend (§ 9.4). An addendum with no legend gets the offer "use the legend confirmed for set X?", one click to accept, and shown, never assumed                                                                             |
| **No legend in the set at all**                                                   | Read sheet works as today, against your saved symbols by name. Findings mostly come back "not sure". You can still build a legend for the set from your saved symbols by ticking the ones that apply, with no AI call, or with + Capture straight off a floor plan |
| Legend split over two sheets                                                      | Read legend on each; both add to the same set's list                                                                                                                                                                                                               |

### Manual mode stays whole

Every step can be done by hand, with AI switched off:

- building a set's legend: + Capture, plus ticking saved symbols;
- linking symbols: the existing picker;
- counting: the Mark tool.

Read legend is an accelerator on top of that path, not a second one
(CLAUDE.md § AI features, § "As manual or as automated as the user wants").

---

## 5. What a first version needs

### Migration: YES, one table, ADDITIVE

Today nothing records "this symbol is confirmed for this plan set". `symbol_links`
is per account, deliberately (see its schema comment), and must stay that way.
The per-set answer needs a table of its own:

```
bid_pdf_legend_entries
  id, userId (company owner, as everywhere)
  bidPdfId       -> bid_pdfs, cascade          the plan set
  symbolLinkId   -> symbol_links, set null     the account symbol it confirmed as
  groupId        -> takeoff_groups, set null, NULLABLE
                                               a plain name count on this bid, when
                                               the symbol has no assembly (§ 7 Q3)
  status         enum: confirmed | rejected
  source         enum: ai | manual | remembered
  sheetId        -> bid_pdf_sheets, set null   where on the set it was read
  x, y, w, h     decimal, page points, NULLABLE   the box on the legend
  readLabel      varchar(255) NULL              what the model read, before any fix
  createdAt, updatedAt
  unique (bidPdfId, symbolLinkId)
```

- **Additive, step 1 of the three steps** (CLAUDE.md § "Deploying a migration").
  It is a new table, no `UPDATE`, and nothing existing changes meaning. Old code
  ignores it.
- **Number:** after the 0098–0105 batch planned on `a-migrations-plan` AND
  after the AI correction log (§ 0, which must land first and was planned as
  "0099, or whatever is next"). So probably **0107**, not 0106. **Check
  `drizzle/` at write time**; if either has moved, so does this.
- **Hand-write the `.sql`** and read every statement (CLAUDE.md § "Never run
  generated migration output without reading what it adds").
- No change to `symbol_links`. `capturedFromSheetId` already exists and
  `captureSymbol` already fills it.
- **Rehearsal:** after applying, `SHOW CREATE TABLE bid_pdf_legend_entries`
  should show the three foreign keys and the unique key. If it does not, stop
  and find out why.

### Files it touches

**Server (A or C):**

- `drizzle/schema.ts` and `drizzle/0106_bid_pdf_legend_entries.sql`, the table.
- `server/db.ts`: read and write the set's legend, scoped on `dataUserId`.
- `server/routers/planCopilotRouter.ts`:
  - a new `readLegend` procedure (one region picture in, proposed legend rows
    out; **writes nothing** until confirmed, like `read`);
  - a `confirmLegend` procedure;
  - `read` loads the set's confirmed legend and sends each symbol's picture,
    numbered;
  - the prompt stops saying "ignore legends" only for the legend read.
- `shared/copilotActions.ts`: the new actions as rows (propose legend entry is
  model-invocable; confirm is not).
- `shared/copilotDetection.ts`: resolve a finding by **legend entry number**,
  falling back to today's name match when no set legend exists.
- `server/routers/takeoffStampsRouter.ts`: reuse `captureSymbol` so a confirmed
  AI row and a hand-captured one become the same `symbol_links` row.
- **Tests:** `server/planCopilot.test.ts`, `server/copilotReading.test.ts`, a
  new `server/legendReading.test.ts`.
  - Nothing is written before confirm.
  - A remembered match arrives unticked.
  - A second PDF asks again.
  - A rejection is not asked twice.
  - With no set legend, `read` behaves exactly as today.
  - `scopeDiscipline.test.ts` covers the new router code without being asked.

**Client, Plans screen (B):**

- `client/src/components/takeoff/LegendPanel.tsx`: the Read legend button, the
  list to check, "found on the plans, not in the legend" rows.
- `client/src/components/takeoff/CoPilotPanel.tsx`: the "matched against N
  symbols confirmed for this set" line, and the no-legend wording.
- `client/src/components/takeoff/SymbolCapture.tsx`: reuse `cropToThumbnail` for
  AI-found boxes, so both paths store the same kind of picture.
- `client/src/components/takeoff/TraceLayer.tsx`: draw proposed legend boxes on
  the drawing.
- `client/src/lib/planSnapshot.ts`: a snapshot of a REGION at a legible scale,
  not only the whole canvas. It uses the worker's region render (§ 4b); the
  worker itself should not need changes.
- `client/src/pages/TakeoffPage.tsx`: wiring. When a legend is confirmed, the
  set's legend query goes into the same refresh helper the reader already
  invalidates through (CLAUDE.md § "A test that calls the server cannot see a
  screen showing yesterday's answer").

**Look at it before calling it done:** read the legend on the fixture bid's
E0.01, then Read sheet on E1.02, and check that the rows name legend entries
and that the "matched against" count is right after a confirm.

### What v1 leaves out, on purpose

- **Tiling.** It is still Phase 10, still gated on § 15.
- **A legend row pointing at a material** rather than an assembly or a plain
  name. Plain names ARE in v1 (owner, 2026-09-29, § 0); materials wait
  for § 16's "mark first, name it after".
- **The cheap shape ranking** of § 9.3 stage 2. The model compares the pictures
  in the call it is already making. Add the ranking only if remembered
  suggestions turn out noisy.
- **Legend memory per architect.** The per-set table is a strict subset of it,
  so nothing has to be undone later.

---

## 6. What this changes in the older record

`plan-viewer-overhaul.md` § 5l's 2026-09-21 table puts **"bulk scan the legend,
then the set"** together in row (c), blocked on § 15's bake-off. **This plan
splits that row.** Reading the legend is one call on one region, needs no
tiling, and does not depend on how well the reader counts a dense sheet. Only
the scan of the set does. That agrees with § 9.6 ("legend capture FIRST").

**Amended the same day by the owner (§ 0):** nothing is built until the
accuracy test has compared all three ways of reading. So the split still
stands, since the legend read does not need tiling, but the build ORDER is
now set by the test, not by this argument. § 15.4's "not yet" is overridden
too; a line in § 15.4 points here.

A line saying this goes into § 5l, pointing here, **in the same commit as this
file**, so a reader who opens either one finds the other (CLAUDE.md § "Where
decisions live").

## 7. Questions for the owner

1. **ANSWERED 2026-09-29: drag a box around the legend.** See § 0.
2. **ANSWERED 2026-09-29: always offer "use set X's legend?", never apply it
   on its own.** See § 0.
3. **ANSWERED 2026-09-29: YES, plain name counts are in v1.** See § 0. In
   plain words: today a symbol can only be counted if you link it to an
   assembly from your library. A plain name count lets you confirm it as just
   "Floor box", count it, and price it later, with no library entry needed.

   **Why, as recommended: build plain names into v1, do not ship without
   them.** The first draft of this file said to ship
   without it. That fails CLAUDE.md's test for a new feature ("could somebody
   who has never opened the library screen use this?"): a new user could
   confirm a whole legend and still not place a single mark. It is small and
   needs no extra migration. The new table carries a nullable `groupId`
   pointing at a plain count on the bid (see § 5), and plain counts already
   exist (`takeoff_groups` kind `plain`, § 5e). This is § 5l (b).

---

## 8. AI counts with no assembly, labor-only counts, supplier packages, whole-set reading — PLAN ONLY, 2026-09-29

**Asked by the owner on 2026-09-29, after the staging E-100 findings.** Four
additions. Nothing here is built. Checked against `local-dev` at `0af50a6`
before writing, so each part says what already exists.

### 8a. AI-made counts with no assembly, attachable later, on the CSV and materials list

**What the owner wants:** the reader can make a count that is just a name
("A1 luminaire: 38"), with no assembly behind it. An assembly can be attached
later. The count shows on the takeoff CSV and the materials list, so a
supplier can price lighting and gear packages from it.

**What exists (measured, not assumed):**

- **The count itself.** `takeoff_groups` kind `plain` is a name and a count,
  per bid (`drizzle/schema.ts`). It is live today for hand-made counts.
- **The takeoff CSV already lists it.** `shared/takeoffExport.ts` writes every
  count by name, with or without an assembly.
- **The materials list does NOT.** `server/routers/materialsListRouter.ts`
  only names such counts in a note ("Counted on this job but not itemised").
  A supplier gets no line to price.
- **Nothing attaches an assembly to an existing count.** The groups router has
  `rename`, `setDrop`, `sendToBid` and `remove`, and no way to change what a
  count IS. This is the one-way-door rule in CLAUDE.md, and § 16 of
  `plan-viewer-overhaul.md` ("mark first, name it after") has planned it.

**What it needs:**

1. **Place lands on a plain count** when the legend entry has no assembly
   (already in v1, § 0 item 3). `confirm` and `isAcceptable` accept a plain
   count, not only an assembly.
2. **A `takeoffGroups.setSource` procedure:** turn a plain count into a
   typed, material or assembly count, and back, with every mark kept. The
   columns already exist.
3. **The materials list gets a section, "Supplier to price".** Each count
   with no assembly is a row: name, quantity, "each", and no price. It sits
   apart from the itemised parts, so nobody reads it as a price the app
   worked out.

**Migration: none.** **Track:** B for the screens and the materials list,
server work included. **Order:** first of the four. It has no AI in it, so
it is useful even if the accuracy test says the reader cannot count.

### 8b. "Labor only" counts, and a lump-sum "supplier package" line

**What the owner wants:** a count that carries the install labor per item
(hang 38 troffers), while the fixtures themselves come in one supplier
package priced as a single lump sum on the bid. **Never $0, never missing
labor.**

**What exists:**

- **A typed count** (`takeoff_groups` kind `typed`) carries `unitCost`,
  `unitHours` and `laborRateId`. So "hours per item" is there. What is
  missing is a way to say "the material is in a package", which is not the
  same as "nobody priced it".
- **The supplier package line has a slot but no code.**
  `references/material-markup.md` D4 (2026-09-25): "Quoted" is a LINE TYPE,
  with its own markup, placed in the markup order between item override and
  category.
- **The never-$0 rule for bid lines** is `shared/lineNotPriced.ts`. Since
  today, a proposal is also blocked while anything is not priced (branch
  a-proposal-zero, merged to local-dev).

**What it needs:**

1. **The package line (D4).** A bid line with a supplier name, an optional
   quote reference, a lump-sum amount, and D4's markup.
   - The amount is **NULL until typed**, and then the line is "Not priced",
     never $0. It blocks the proposal like any other unpriced line.
   - A typed 0 is refused. A package that costs nothing is not a package.
2. **Labor-only counts point at their package.** A count marked labor-only
   names the package line that supplies its material. Its material cell then
   reads "In package: _name_", never $0.
   - **Its hours are required.** With no hours it is "Hours not set" and
     counts as not priced, the same rule as a field bend.
   - A labor-only count with no package named is not priced either. The
     material has to come from somewhere the bid can show.
3. **The proposal** keeps one total, and the package is folded into it like
   any other line. The proposal never itemises cost.

**Migration: YES, additive, one file, written by Track A in the batch style:**

```
bid_line_items   + quotedSupplier  varchar(255) NULL
                 + quotedRef       varchar(128) NULL
                 + quotedAmount    decimal(12,2) NULL   -- NULL = not priced
                 + a way to mark the line as 'quoted' (a kind value or a
                   nullable flag; decide at write time against how lines
                   are told apart today)
takeoff_groups   + packageLineId   int NULL -> bid_line_items, set null
```

- **Additive, step 1:** new nullable columns only, no `UPDATE`, and nothing
  existing changes meaning.
- **Number:** after 0098–0105, the correction log and the legend table.
  **Check `drizzle/` at write time.**
- **`set null` on `packageLineId`:** deleting the package line leaves the
  count labor-only with no package, which is "not priced". That is the safe
  direction.

**Track:** A writes the migration, B builds the bid screen and the count.
**Order:** second. It has no AI in it either, so it does not wait for the
test.

### 8c. Read the whole plan set, then review one symbol type at a time

**What the owner wants:** one button reads every sheet in a set. Then you
review ONE symbol type at a time across all sheets ("A1 luminaire, 38 on
5 sheets"). It shows the cost per sheet, stops at a per-bid spending cap,
and shows progress.

**What exists:**

- **One sheet at a time,** on a button (`planCopilot.read`). A stored reading
  is reused, never bought twice.
- **A per-person daily limit** (`shared/aiLimits.ts`) and a per-person, per-day
  cost record (`ai_usage_daily`). **Nothing records spend per BID**, so a
  per-bid cap has nothing to read today.
- **Cost per sheet** can be worked out before sending, from
  `shared/visionImageLimits.ts` and `shared/aiPricing.ts` (indicative).

**What it needs:**

1. **"Read all sheets" is a button, never automatic** (CLAUDE.md § AI
   features).
   - It first shows: N sheets, about X cents each, about $Y in all, and your
     cap. It starts only when you press it.
   - Sheets already read are skipped and cost nothing.
2. **Progress as it goes:** "12 of 40 read, $0.61 so far". Results appear as
   each sheet answers (§ 11.3 of the overhaul plan). Stop is always there.
3. **The per-bid cap:**
   - It stops BEFORE a sheet that would pass the cap, and says so in its own
     sentence: which sheets were not read, and why.
   - Never a partial reading that looks complete. That is the same rule as
     the token ceiling in `planCopilotRouter.ts`.
   - The cap is a company default with a per-bid override, inherited not
     copied (CLAUDE.md § "Company defaults vs per-bid overrides").
4. **Review by symbol type:** one list per legend entry, across all sheets.
   - Step through the marks one at a time. Each step moves the drawing to the
     spot, since positions cannot be trusted unseen (§ 0 B,
     `client/src/lib/readerPicks.ts`).
   - Tick, fix or dismiss. Nothing is pre-ticked.
   - "Place the ticked ones" works across sheets.

**Migration: YES, additive:**

```
plan_copilot_runs  + costMicros       bigint NULL   -- what this reading cost
bids               + aiSpendCapMicros bigint NULL   -- NULL = follow company
company default    + the default cap, wherever company pricing defaults
                     live (decide at write time)
```

- **A run's cost goes in its own row**, so a bid's spend is a SUM. That is
  the number the cap reads: measured, not estimated.
- **NULL cost on an old run means "not recorded".** The cap counts it as
  unknown and says so, never as $0.

**Track:** C for the server (it owns `server/planReading.ts` since the move),
B for the review screen, A for the migration.

**Order: after the accuracy test (§ 0 B), and only if the test says the
reader is worth running across a whole set.** Reading forty sheets multiplies
whatever the test finds, good or bad.

### 8d. AI-routed runs — OUT OF SCOPE until the accuracy test proves counting

Routing wire between devices (`plan-viewer-overhaul.md` § 5m.2) depends on
the reader first finding the devices and putting them in the right place.
Neither is measured, and the staging E-100 positions were up to about 2.4 in
off. So nothing in this plan builds it, and it is not reopened until the
accuracy test shows that counting AND position are good enough. Tracing a
run by hand stays the way to do it.

### The order, in one place

| #   | What                                        | Migration                    | Track          | Waits on              |
| --- | ------------------------------------------- | ---------------------------- | -------------- | --------------------- |
| 0   | AI correction log (§ 0 A)                   | yes (stage-4 plan)           | A              | nothing               |
| 1   | 8a: counts with no assembly, materials list | none                         | B              | nothing               |
| 2   | 8b: supplier package and labor-only counts  | yes, additive                | A, then B      | nothing               |
| 3   | Accuracy test (§ 0 B), with position error  | none (a script)              | A, owner's 2 h | nothing               |
| 4   | Legend reading v1 (§§ 3–5), plain names in  | yes, additive (legend table) | A, C, B        | 0 and 3               |
| 5   | 8c: whole-set read, cap, review by type     | yes, additive                | A, C, B        | 3 says it is worth it |
| —   | 8d: AI-routed runs                          | —                            | —              | out of scope          |

**Why this order.** 1 and 2 are manual-mode features: they make a
supplier-priced lighting package workable today, AI or not ("manual mode is
the product"). 3 decides whether 4 and 5 are worth their cost. 0 must be
live before any legend fix can be made, so the fix is logged.

**If anything here does not match the code when it is built** (a migration
number, the correction log's list of writers, the router's procedures),
**stop and find out why before going on.** Either this section is stale or
the code moved, and those want opposite responses.
