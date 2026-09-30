# How well does "Read sheet" count? A test plan. PLAN ONLY, 2026-09-29

**Asked by the owner:** how well does the AI "Read sheet" find and identify
symbols, and does using the legend make it better? Nothing here is built. No
code, no migration, no deploy on this branch.

**This is the bake-off that is already decided, with a different question.**
`references/plan-viewer-overhaul.md` § 15 designed it on 2026-09-18 and it has
never been run: hand-count real sheets first, then compare the reader's answer
to the hand count. § 15 compared DETAIL LEVELS. This plan compares the four
ways of reading the owner asked about. Everything § 15.2 says about method
still applies and is repeated below where it matters: dense sheets, hand count
first with the readings unseen, results broken down by symbol type.

Also read: `references/legend-reading-plan.md` on branch `a-plans-reader`
(8a6e268), Track A's plan for sending the legend. Its § 3 asks for exactly this
test, with "legend pictures sent / not sent" as one of the things compared.
And `references/ai-reader-cost.md` for the per-sheet costs used below.

**§ 15.4 said "the small version, and not yet":** run it when tiling (Phase 10)
is next, because the answer goes stale if the model or prompt moves. It is
being planned now because the owner asked, and because the legend work on
Track A needs the same number. The answer key (the hand counts) does not go
stale. Only the AI runs do, and they cost cents to repeat. **When this runs,
§ 15.4 should get one line pointing here** (not added now; this branch is
read-only apart from this file).

---

## 1. What we already have

### Plan files you can test on (local only, never in git)

All in `.local-storage/bid-plans/`, on this machine only.

| File                                          | What it is                                                                                                                                                                                          | Good for this test?                                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Old Blueridge school** (5 sheets)           | A real school remodel. A 300 dpi scan with poor OCR text. **Sheet 1 is E0.01, the legend.** Sheets 2 to 5 are drawings. E1.02 has **78 device symbols** (counted 2026-09-18, § 15 of the overhaul). | **Yes, the best one.** Real legend in the same set as dense plans, which is the normal case. It is the "Bar layout check" fixture bid; leave that bid alone and use a copy. |
| **pine st** (5 sheets)                        | A real scan with **no text at all**.                                                                                                                                                                | **Probably.** The hardest case for text, a fair case for pictures. Whether it has a legend sheet needs checking (10 minutes, step 0).                                       |
| **Weld 1, Weld 2, UNCC, Colusa, Dundas**      | Public electrical bid sets downloaded 2026-09-25 for the sheet-number reader (overhaul § 17.4). Real vector PDFs with clean text.                                                                   | **One of them, if it has a device legend.** It covers the clean-drawing case the two scans do not. Not yet checked for legends or symbol density.                           |
| big500.pdf                                    | A 270 MB, 500-sheet set used to test loading speed (overhaul § 17.2).                                                                                                                               | No. Built for size, not for counting.                                                                                                                                       |
| 48 files named "Electrical Plans" (user 9921) | **Empty, zero bytes.** Left over from automated tests.                                                                                                                                              | No.                                                                                                                                                                         |

### Test plans and fixtures in the repo

- **§ 15 of `plan-viewer-overhaul.md`**: the bake-off design, costs and the
  "what each outcome means" gate. Never run.
- **§ 5m of the same file** ("a list of what it found cannot show what it
  missed"): why the missed count is the number that matters.
- **Track A's `legend-reading-plan.md` § 1**: what Read sheet sends today (one
  shrunk picture, about 11 pixels per receptacle, legend ignored, saved symbols
  known by name only).
- **`scripts/aiSmokeTest.mts`**: makes one real reader call with a blank
  made-up picture. It proves the connection works and prints the cost. It says
  nothing about accuracy.
- **`server/planCopilot.test.ts`, `server/copilotReading.test.ts`**: test the
  app's handling of the reader's answer, using made-up answers. No real model,
  no real drawing.
- **`client/src/lib/__fixtures__/titleBlocks.json`** and
  **`references/sheet-reader-prototype.mjs`**: for reading sheet NUMBERS and
  TITLES, not symbols.
- **`server/fixtures/*.csv, *.tsv`**: price sheets. Unrelated.

**What we do not have: a single hand count anywhere.** No answer key exists
for any sheet, so there is no way today to say whether the reader misses 2% or
30%. That hand count is the one thing this test cannot do without.

---

## 2. The test

### The four ways of reading

| Method                    | What the AI is sent                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Today**             | Exactly what Read sheet sends now: one picture of the whole sheet shrunk to the model's limit (about 65 px per paper inch), the sheet's text, and the legend symbols' NAMES as words. |
| **(b) Legend first**      | The same, plus the confirmed legend symbols' PICTURES, numbered, each with its label. The AI answers "legend entry 7" instead of copying a name.                                      |
| **(c) Zoomed in, pieces** | The sheet cut into 6 overlapping pieces at 150 px per paper inch (the planned default, `ai-reader-cost.md` § 5), each read separately. Legend names as words, as today.               |
| **(d) Both**              | The pieces from (c), each sent with the legend pictures from (b).                                                                                                                     |

(b) is what Track A's plan would ship. (c) is what Phase 10 would ship. (d) is
both. The test uses stand-ins for them (see § 3); the point is to learn how
much each one helps before building either.

**No "no legend" run.** The owner's first message asked for one; the second
replaced it with (c) and (d). If it is wanted back, it is one more row and
about 5 cents a sheet.

### Step 0 — which sets have a symbol legend. DONE 2026-09-29

Checked by rendering the first pages of each set and looking at them (text
search alone cannot answer it: Old Blueridge's text is poor OCR and pine st has
none). Page numbers are the PDF's own, 1 = first page.

| Set                      | Legend?                                                                                                                   | Countable drawings                                                                                                  | Verdict                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Old Blueridge** (scan) | **Yes.** p1, E0.01: a symbol schedule down the right side (power, devices, lighting, switching, fire alarm, low voltage). | p3 E1.01 lighting, p4 E1.02 power, p5 E1.03 fire alarm and low voltage. p2 E1.00 is panel schedules, not countable. | **Use.** Each drawing has a NEW plan on top and a DEMOLITION plan below; see the counting rule in the hand-count instructions. |
| **UNCC** (vector)        | **Yes.** p1, E001: a very large electrical symbol schedule.                                                               | p5 E111 "Level 2 floor plan, power and special systems" — the densest sheet seen. p3, p6 also plans.                | **Use** p5.                                                                                                                    |
| **Weld 1** (vector)      | **Yes.** p1, E-001: a full electrical symbols list.                                                                       | p5 E-200 power plan (with a small security plan and a demolition plan on the same sheet).                           | **Use** p5, as the moderate-density vector sheet.                                                                              |
| Weld 2 (vector)          | Yes. p1, E1.0: the same engineer's symbols list as Weld 1.                                                                | 18 pages, not looked through.                                                                                       | Spare. Same office as Weld 1, so it adds little variety.                                                                       |
| Colusa (vector)          | Yes. p1, E0.1: electrical symbol list.                                                                                    | 4 pages only, mostly schedules and notes.                                                                           | Spare.                                                                                                                         |
| Dundas (vector)          | Yes. p2: electrical symbols.                                                                                              | Australian school, schematic design stage, metric and Australian symbols.                                           | **Skip.** Not the drawings the product is for.                                                                                 |
| pine st (scan)           | A small street-lighting legend (about 7 entries) on each sheet.                                                           | 11x17 civil street-lighting plans: poles, junction boxes, conduit. Sparse.                                          | **Skip.** A legend, but not an electrician's building sheet; it would measure a job the product does not do.                   |

### The sheets: 4 fixed, plus 1 of yours

Dense drawings, not title sheets. The dense sheet is where the reader earns its
keep or does not (§ 15.2).

1. **Old Blueridge p4, E1.02 power** — 78 symbols, a scan. The known dense one.
2. **Old Blueridge p3, E1.01 lighting** — a scan, fixtures rather than devices.
3. **UNCC p5, E111 power and special systems** — vector, the densest found.
4. **Weld 1 p5, E-200 power** — vector, moderate density.
5. **Yours: one sheet from your own retail job**, with its legend. The only
   one that is the kind of work the product is actually for. Optional, but the
   most telling.

(The overhaul document calls Old Blueridge's sheet 5 "E1.3". Its title block
says E1.03, and it is the fire alarm sheet, not a power sheet.)

### You count by hand, once

Step-by-step instructions: `references/reader-accuracy-hand-count.md`.

**Before any AI run is seen.** A count made after seeing the AI's answer is not
an independent count (§ 15.2).

- **Where:** on a copy of each plan set in a **separate local test account**
  on this machine (not your own account, not staging, not live). A separate
  account keeps its legend list to only this set's symbols, so (a) is a fair
  test and your real saved symbols are not mixed in.
- **How:** the Mark tool you already use. One count per symbol type, named as
  the legend names it ("Duplex", "Quad", "2x4 troffer"...). Click each symbol.
  The marks record WHERE each one is, which is what lets the test tell
  "found" from "wrong symbol" from "extra".
- **The legend:** on the legend sheet, box each symbol once with + Capture and
  give it the legend's label. These saved pictures ARE the "confirmed legend"
  for (b) and (d). You check them once.
- **Anything you are unsure of,** mark it anyway and add a note. Better an
  honest "not sure" in the key than a guess.

**Time:** 20 to 40 minutes per dense sheet (§ 15.3), plus about 15 minutes per
set to box the legend. **About 2 to 3 hours for 4 sheets**, 3 to 3½ for 5. Done
once; every later run reuses it.

### The numbers to record

For every sheet and method, each AI suggestion is matched to your nearest mark
within a small distance (about a third of a paper inch, a symbol and a bit),
one suggestion per mark:

| Number           | Meaning                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **By hand**      | Your count. The answer.                                                                                                                                                                            |
| **Found**        | Right place, right symbol.                                                                                                                                                                         |
| **Wrong symbol** | Right place, wrong symbol (called a duplex when it is a GFCI).                                                                                                                                     |
| **Missed**       | Your mark with no suggestion near it.                                                                                                                                                              |
| **Extra**        | A suggestion with no mark of yours near it. Includes the same symbol reported twice where two pieces overlap.                                                                                      |
| **Flagged**      | The AI said "can't make this out" at one of your marks. Still counted as missed, since nothing was found, but shown on its own: pointing at a spot it is unsure of is allowed and useful (§ 10.3). |

Found + Wrong symbol + Missed = By hand, always. That is the check the numbers
add up.

**Each method is run twice.** It costs cents, and without it a difference of
three between two methods cannot be told apart from the same method scoring
three differently on a second try (§ 15.2). The table shows both runs, e.g.
`61 / 64`.

### The one small table

The headline, all sheets added together:

| Method              | By hand | Found     | Wrong symbol | Missed | Extra | Flagged | Cost per sheet |
| ------------------- | ------- | --------- | ------------ | ------ | ----- | ------- | -------------- |
| (a) Today           | 310     | 180 / 176 | 40 / 44      | …      | …     | …       | ~4.5c          |
| (b) Legend first    | 310     | …         | …            | …      | …     | …       | ~5c            |
| (c) Zoomed in       | 310     | …         | …            | …      | …     | …       | ~10c           |
| (d) Legend + zoomed | 310     | …         | …            | …      | …     | …       | ~11c           |

(The numbers in the first row are made up, to show the shape. None of this has
been measured.)

The script also prints the same table per sheet and per symbol type, because a
reader that finds every receptacle and no junction box is a different problem
from one that misses 8% evenly, and only the first has a fix (§ 15.2).

### What the answers would mean

- **(b) beats (a) mostly on "wrong symbol"**: the legend fixes naming, as
  Track A expects. Build legend-first.
- **(c) beats (a) mostly on "missed"**: the reader cannot SEE small symbols at
  today's size. Tiling is worth building (the § 15.5 gate is passed).
- **(d) is clearly best**: both, and the order to build them in is a cost and
  effort choice, not an accuracy one.
- **Even (d) misses a lot**: the most useful result of all. The reader is a
  first pass that speeds up a hand count, and should be described that way in
  the product (§ 15.5).

---

## 3. What is needed to run it

### Code: yes, a small test script, and nothing in the app

The app today can only do (a), and only by writing a reading into a real bid's
tables. So one script is needed, **`scripts/readerAccuracy.mts`**, in the style
of `scripts/aiSmokeTest.mts`. It:

1. **Reads the answer key and the legend** from the local test account,
   read-only: your marks (where and what), and the legend pictures you boxed.
2. **Draws the sheet pictures itself** from the PDFs in `.local-storage`, using
   the PDF library and drawing package already installed (`pdfjs-dist` and
   `@napi-rs/canvas`, which pdfjs brings with it). For (a) and (b) it draws the
   picture at the same size and quality Read sheet uses
   (`client/src/lib/planSnapshot.ts`, `shared/visionImageLimits.ts`); it takes
   those numbers from those files rather than copying them.
3. **Calls the AI four ways**, through the app's one AI door (`server/llm`), so
   the cost line and the daily limit apply exactly as in the app.
4. **Scores** each run against the key and prints the table.
5. **Writes its results to a git-ignored folder.** It writes nothing to any
   bid, sheet, mark or reading table.

**One app-side change, very small:** the reader's instructions and answer
format live inside `server/routers/planCopilotRouter.ts` and are not exported.
Exporting them (two words) lets (a) use the app's real instructions instead of
a copy. A copy would test a different reader.

**Honest limits of the stand-ins:**

- **(b)'s legend wording is the script's, not Track A's.** When Track A's v1
  ships, re-run (b) and (d) with the real thing. The hand counts are reused;
  the re-run costs about a dollar.
- **(c)'s pieces are a simple grid with overlap.** Phase 10 will decide the real
  cutting and the handling of symbols on a seam (§ 10.4). The test answers
  "does zooming in help, and by how much", not "is this the right tiling".

Writing and checking the script: roughly half a day to a day.

### Keeping it off staging and live

- **The local database only.** The script uses the guard every writing script
  already uses (`scripts/databaseGuard.ts`) and refuses any database not on
  this machine. Its only database write is the AI usage counter, the same row
  any local AI call writes.
- **Only the AI key is borrowed** from `.env.production.local`, by name, as
  `aiSmokeTest.mts` does. Nothing else in that file is read, the live database
  address above all.
- **Local plan files only**, from `.local-storage`. No R2, no staging bucket.
- **A separate local test account and a copy of each plan set.** Not your real
  account, not the "Bar layout check" fixture bid.

### Cost per run

Indicative, from `ai-reader-cost.md` § 5 (Sonnet 5, thinking off). The script
prints the real figure for each call.

| Method              | Calls per sheet | Per sheet |
| ------------------- | --------------- | --------- |
| (a) Today           | 1               | ~4.5c     |
| (b) Legend first    | 1               | ~5c       |
| (c) Zoomed in       | 6               | ~10c      |
| (d) Legend + zoomed | 6               | ~11c      |
| **All four**        | 14              | **~31c**  |

- **One full run, 4 sheets, all four methods: about $1.25.** 5 sheets: about
  $1.55.
- **Twice, as planned: about $2.50 to $3.10.**
- **With re-runs after fixing the script: under $6.**
- 56 to 70 AI calls per full run, inside the daily allowance of 150 reader
  calls per person (`shared/aiLimits.ts`), so two runs may span two days or use
  a second test account.

**The real price is your time, not the API bill:** about 2 to 3 hours of
counting, once. Every later run (a new model, Track A's v1, Phase 10) costs a
dollar or two and no counting.

---

## 4. Questions for the owner

1. **4 sheets or 5?** 5 adds a second clean vector sheet and about an hour.
2. **Run the (c)/(d) stand-ins now, or wait for Phase 10's real tiling?** This
   plan says now: the answer is what decides whether Phase 10 is worth
   building.
3. **Add a "no legend" row back?** About 5 cents a sheet.

---

## SHORT SUMMARY

- **We have real sets but no answer key.** Old Blueridge (legend on E0.01,
  78 symbols on E1.02) is the best test set; pine st and one public vector set
  round it out. No hand count exists for any sheet, and § 15's bake-off has
  never been run.
- **The test:** you hand-count 4 sheets once, in a separate local test account
  (2 to 3 hours), then the AI reads each sheet four ways: (a) today, (b) legend
  pictures sent, (c) zoomed-in pieces, (d) both. Each is run twice.
- **One small table:** by hand, found, wrong symbol, missed, extra, flagged,
  cost per sheet, one row per method, with per-sheet and per-symbol detail
  printed underneath.
- **Cost:** about 31c per sheet for all four methods, about $1.25 per full run
  of 4 sheets, about $3 for two runs. Later re-runs need no new counting.
- **Code:** one test script (half a day to a day) plus exporting the reader's
  instructions. Nothing in the app changes, no bid is touched, local database
  and local files only, nothing on staging or live.
