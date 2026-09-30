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
described as better matching, not as accurate counting.** Run § 15.4's small
bake-off (5 sheets, about $3 and two hours of hand counting) once v1 is in, with
"legend pictures sent / not sent" as one of the things compared. It will tell us
how much of the gap v1 closed.

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
- **Number:** the next free number after the 0098–0105 batch planned on
  `a-migrations-plan`, so **0106 if that batch lands as planned. Check
  `drizzle/` at write time**; if the batch has moved, so does this.
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
- **A legend row pointing at a plain name or a material** rather than an
  assembly. That is § 5l (b) and § 16's "mark first, name it after". v1 keeps
  today's rule: a symbol links to an assembly or stays unlinked.
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
the scan of the set does. So the legend half moves ahead of the gate, and the
set scan stays behind it. That agrees with § 9.6 ("legend capture FIRST").

A line saying this goes into § 5l, pointing here, **in the same commit as this
file**, so a reader who opens either one finds the other (CLAUDE.md § "Where
decisions live").

## 7. Questions for the owner

1. **One drag around the legend, or read the whole legend sheet?**
   Recommended: the drag, with whole-sheet as the fallback. It is sharper,
   cheaper, and skips title blocks and notes.
2. **Should an addendum with no legend offer the main set's legend?**
   Recommended: yes, as a one-click offer, never automatic.
3. **Does v1 wait for § 5l (b)** (a symbol that counts as a plain name, with no
   assembly), or ship with assembly-or-unlinked as today? Recommended: ship
   without it. (b) is its own small piece and does not block this one.
