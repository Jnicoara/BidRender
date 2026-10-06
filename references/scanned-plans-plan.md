# Scanned plans — plan and measurements (Track C, 2026-10-01)

> **BUILT, 2026-10-01 (later), on `track-c`.** Steps 1, 2, 3 and 5 of § 6
> exist as the scan branch of Find all matching; step 4 (Tesseract) does
> not, by the owner's choice. What was built, what it measured through the
> shipped code, and where it departs from the plan below: **§ 9**. §§ 1–8
> are the plan as written, kept as the record.

**PLAN ONLY when written.** Every number in §§ 1–8 was measured with
throwaway scripts (kept in the Track C scratchpad, not the repo) on the two
scanned sheets of **Old Blueridge school**: **E1.01** (page 3, lighting) and
**E1.02** (page 4, power). The answer key is the owner's hand count on the
reader-accuracy bid, read through the "same as" name list:

| Sheet | Count (as named)                          | Same as (tag)      | Marks  |
| ----- | ----------------------------------------- | ------------------ | ------ |
| E1.01 | LIGHTING FIXTURE, LINEAR TYPE             | 2x4 troffer (A2)   | 40     |
| E1.01 | EXIT LIGHT FIXTURE                        | 2x4 troffer (A2EM) | 6      |
| E1.01 | LINEAR FIXTURE - CEILING MOUNTED          | 2x2 troffer (A3)   | 13     |
| E1.01 | LIGHTING FIXTURE, WALL-MOUNTED POINT TYPE | light fixture (C)  | 8      |
| E1.01 | SWITCH, SINGLE POLE                       |                    | 6      |
| E1.02 | GFCI receptacle                           |                    | 7      |
| E1.02 | DUPLEX RECEPTACLE OUTLET - WALL MOUNTED   | duplex outlet      | 4      |
| E1.02 | SWITCH WITH TIMER                         | timer switch       | 2      |
|       |                                           |                    | **86** |

**AI spent on this plan: $0.005** (two small calls). Estimate given before:
under $0.10, inside the $2 limit. No dev server was run; memory was low.

## 0. The short version

- **On these scans, matching one picked symbol finds every copy of it, with
  no AI.** 85 of 86 hand marks were found. The one miss is a different
  symbol (§ 2). **Nothing false was found inside the plan he counted** for
  any fixture or switch.
- **What a scan cannot do by picture alone is NAME what it found.** A2 and
  A2EM are the same rectangle, and a duplex and a GFCI are drawn the same.
  What tells them apart is the WORDS: a tag (A2 / A2EM / A3), an "E"
  (existing), or the plan's title (DEMOLITION). This is the same lesson as the
  vector check (`legend-and-notes-automation-plan.md` § 7b): code locates;
  words, then the AI on small crops, name.
- **The PDF's hidden text is not enough.** It reads the sheet number and
  title right, and almost nothing inside the drawing.
- **OCR on the cleaned image reads most tags, and never read one wrong.**
  The **AI tie-break read every tag and every "E" that OCR could not**, for
  half a cent.
- **Recommendation:** build it as the scan branch of **Find all matching**,
  same panel, with everything unconfirmed. § 6 has the build order.

## 1. Hidden text layer — what the PDF already holds (cost $0)

Each page is **one 300 dpi image** (10800 × 7200 px, 36 × 24 in) with **no
line work at all**, plus an OCR text layer someone else ran: about 180 words
and 800–990 characters a page, read in about 30 ms.

| Wanted                   | In the text layer?                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Sheet number and title   | **Yes, right on every page** (E0.01, E1.01, E1.02; "MAIN FLOOR LIGHTING PLANS").                                           |
| Plan titles (viewports)  | **Yes**: "MAIN FLOOR - LIGHTING PLAN", "… - DEMOLITION LIGHTING PLAN", with positions. Enough to tell the two plans apart. |
| Legend / symbol schedule | Partly, garbled ("DUEX RECEPTACLE QUTLET", "MOUINTED"). Not usable as legend names.                                        |
| Fixture tags in the plan | **No. 0 of the 59 tagged fixtures.** The only A2/A3 words are in the fixture schedule.                                     |
| Keynotes ("NOTE 3")      | Some: 1 of 4 on E1.01, 4 of about 10 on E1.02.                                                                             |
| Heights (+38")           | **No. 0.**                                                                                                                 |
| (E) / (X)                | Effectively no (2 stray "E"s, both grid labels).                                                                           |

**Use it for:** naming the sheet, and finding each plan's title and box,
which is how the demolition plan gets kept apart (§ 2). **Not for:** tags,
heights, existing marks or keynotes.

## 2. Image clean-up and picture matching — NO AI (cost $0)

**What was run (opencv.js, the browser build, in Node):**

1. Render the page image at 150 dpi (half resolution) as grey.
2. Black-and-white (Otsu), straightened (skew from the long lines), and
   specks removed (pieces under 5 px).
3. **One picked symbol per shape:** the box a person would drag round ONE of
   his marks. That is 42 × 22 pt for a 2x4, 22 pt for a 2x2, 20 pt for a
   circle and 14 × 22 pt for a switch.
4. Search at **3 sizes (0.9, 1, 1.1) × 4 quarter turns**, normalised
   correlation, one find per spot.
5. **Bigger shape wins:** a 2x2 find inside a 2x4 find is that 2x4. Without
   this rule, every rectangle also counted as two squares.

**Results at a score of 0.7** (0.6 is shown where it matters). "Counted
plan" is the new-work plan he marked. "Demolition" is the plan of what is
removed, drawn on the same sheet:

| Sheet | Shape (his counts)             | Found       | False in counted plan | Other finds outside it                |
| ----- | ------------------------------ | ----------- | --------------------- | ------------------------------------- |
| E1.01 | 2x4 rectangle (A2 40 + A2EM 6) | **46 / 46** | 0                     | 0 (at 0.6: 1 in plan, 11 elsewhere)   |
| E1.01 | 2x2 square (A3 13)             | **13 / 13** | 0                     | 0                                     |
| E1.01 | Circle ("point" 8)             | **7 / 8**   | 0                     | 0                                     |
| E1.01 | Switch (6)                     | **6 / 6**   | 0                     | 8 on the demolition plan, 2 elsewhere |
| E1.02 | Receptacle (duplex 4 + GFCI 7) | **11 / 11** | 17 (see below)        | 37 on the demolition plan             |
| E1.02 | Timer switch (2)               | **2 / 2**   | 0                     | 0                                     |

**The 17 receptacles on E1.02 are not false finds.** Each one was looked at
in a crop. All 17 are real receptacles with an **"E" beside them** (existing
to remain), some with "+38"". He did not count them, which is right. The 37
on the demolition plan are real receptacles too. **So the picture is right;
what decides whether a find counts is text** — the "E", and which plan it is
on.

**The one miss is a different symbol.** 7 of his 8 "wall-mounted point"
marks sit on circles with **"OS"** in them, which is usually an occupancy
sensor. The 8th sits on a **C fixture bar** (the "(A-8)" one), which looks
nothing like the circle picked. See question 1 in § 8.

**Duplex vs GFCI cannot be told apart by picture.** On E1.02 they are the
same symbol. The check must say so, as it does for UNCC's three identical
triangles, and **never send these to the AI** (no picture can decide them).

**Speed (Node, one thread, 150 dpi; a browser worker should be about the
same):**

- render the page: 2.8 s at 300 dpi (half that at 150);
- straighten: 3.5–8.6 s;
- clean-up: 3.8–4.3 s;
- search: **about 0.9 s per size-and-turn**, so 11 s per shape at 12
  variants. E1.01's four shapes took 44 s in all.
- Memory: 550 MB in Node for a whole 36 × 24 sheet at 150 dpi.

So a real build must **search only the plan the user is on** (its box from
the text layer), not the whole sheet, and should try the quarter turns the
first finds suggest rather than all four.

**How bad can the scan be?** Measured on a spoiled copy of E1.01:

| Copy                                       | Fixtures / squares / circles           | Switch (the small symbol)               |
| ------------------------------------------ | -------------------------------------- | --------------------------------------- |
| Original, 300 dpi                          | all found, 0 false                     | 6 / 6, 0 false in plan                  |
| 100 dpi, turned 1.5°, noise, 1% ink specks | all found, 0 false (skew found −1.53°) | 6 / 6, 0 false in plan                  |
| 50 dpi, turned 1.5°, noise, specks         | all found, 0 false                     | **6 / 6 but 33 false in plan — breaks** |

The switch is about **10 × 15 px at 50 dpi** and **19 × 30 px at 100 dpi**.
That is the test to use: **the picked symbol's size in scan pixels**, which
is known before anything runs. **Caveat:** the picked symbol came from the
same spoiled sheet each time, so this measures the search, not a legend
taken from another copy.

## 3. OCR on the cleaned image — Tesseract (tesseract.js, cost $0)

**Tags beside his 67 fixture marks** (a 68 pt crop round each mark; the tag
word nearest the mark is taken):

| Tag      | Read right | Read WRONG | Not read |
| -------- | ---------- | ---------- | -------- |
| A2 (40)  | 32         | 0          | 8        |
| A2EM (6) | 5          | 0          | 1        |
| A3 (13)  | 10         | 0          | 3        |
| C (8)    | 0          | 5          | 3        |

- **A2 / A2EM / A3: 47 right, 0 wrong, 12 not read** (3.7 s for all 67).
  "Not read" is safe — the find stays "which one?" — while a wrong tag would
  be a silent wrong count, and there were none.
- **C: 0 of 8**, because 7 of those marks are OS circles with no C beside
  them (§ 2). The "wrong" reads were a neighbouring fixture's A2/A2EM.
  **Taking the nearest tag within a crop can pick a neighbour's**, so a real
  build must require the tag to touch the symbol's box.

**"E" beside the 28 receptacle finds on E1.02's new plan** (11 his, 17
existing):

- sparse-text mode read 0 E's. Single-block mode on a crop doubled in size
  read **9 of 17** existing, and **0 of his 11** new — no false "existing".
- **Heights:** "+38"" read on 5 of 6, plus one junk "11".

**Whole new plan in one pass** (about 5 s a sheet): it found most "NOTE n"
keynotes (4 on E1.01, 9 with their number on E1.02), against 1 and 4 in the
text layer. Isolated single letters are its weak spot.

**Size if shipped:** tesseract core about 2.8 MB of wasm, plus 5 MB of
English data. That data must be **self-hosted**: tesseract.js fetches it from
a CDN by default, and so did these scripts.

## 4. AI as a tie-breaker, on small crops only (cost $0.005)

The same rules as Check sheet's tie-break (`server/tieBreak.ts`): a closed
set of answers, small crops (52–68 pt round the spot, 150 dpi, a red box),
Sonnet, thinking off, one call per batch. **Only what code left unsure was
sent, plus spots code was already sure of, as a control:**

| Asked                                          | Right         | Wrong | Cost    |
| ---------------------------------------------- | ------------- | ----- | ------- |
| Tag of the 12 fixtures OCR could not read      | **12 / 12**   | 0     | ~$0.003 |
| …the 4 control fixtures (OCR had them right)   | 4 / 4         | 0     |         |
| "Is an E beside it?" on 8 existing receptacles | **8 / 8**     | 0     | ~$0.002 |
| …on 4 of his new receptacles (control)         | 4 / 4 said no | 0     |         |

(The scoring script failed to read the replies — its regex lost a backslash
in the shell, the exact trap CLAUDE.md describes — so these were scored from
the raw replies by hand. Both replies are kept in the scratchpad.)

**So, end to end on these two sheets: code found 85 of 86, OCR named 47 of
the 59 tagged fixtures with none wrong, and the AI named the other 12 and
every unread "E" for half a cent.**

**Not measured:** the whole-sheet reader on these scans. The earlier
Blueridge reader runs (2026-09-30) have no usable score. A fresh run would be
about $1.35 (pieces, both sheets). It can be run on request.

## 5. A trained detector later — what it would need (not built)

**Not needed for sheets like these.** Per-sheet matching already finds the
symbols. A detector earns its keep only where per-sheet matching fails:

- a set with no clean copy to pick;
- symbols drawn at many angles or by hand;
- scans below about 100 dpi.

**What it would learn from:** BOXED examples. The two existing sources,
neither of which is enough:

- **Confirmed marks on scanned sheets** give a point and a count. With the
  look's box (`symbol_looks`, already requested from A) each becomes a box.
- **The correction log** (`plan_copilot_corrections`) maps a label to a
  symbol. It stores **no picture and no box**, so it cannot train a detector.

**So a detector needs a new log** — every decision on a scan find: sheet,
box, item, confirmed or rejected, and whether it was code or the AI. That is a
request for A (unnumbered, `todo.md`). Rejected finds matter as much as
confirmed ones, because they are the hard negatives.

**How many:** not measured here. As a **rule of thumb, not a measurement**,
a small fine-tuned detector usually wants a few hundred boxed examples per
symbol type, drawn from 10–20 different offices' sets, before it beats
matching on the same sheet. Start collecting with the scan branch, and
revisit when the log holds that much.

## 6. Recommendation and build order

**Build the scan branch of Find all matching, in this order. Each step is
useful alone, and every find stays unconfirmed:**

1. **The matcher on scans (no AI).** In the PDF worker:
   - render the plan's box at 150 dpi;
   - black-and-white, straighten, remove specks;
   - one picked symbol, 3 sizes × 4 quarter turns, bigger shape wins, one
     find per spot;
   - opencv.js (10.4 MB), loaded only when a scan is searched.

   It slots into the existing panel and rings; the scan refusal becomes this.

2. **"Too poor to match", said plainly.** Before searching, check the picked
   symbol's size in scan pixels.
   - **Under 16 px on its short side:** refuse, with the number ("this
     symbol is 10 pixels across on this scan — too coarse to match; count it
     by hand"). Measured: it broke at about 10 px and held at 19.
   - **16–24 px:** match, but mark every find "needs a look".
3. **Which plan.** Read the plan titles from the text layer (reliable, § 1).
   Finds on a plan titled DEMOLITION show as "on the demolition plan — not
   counted", with a way to count them anyway.
4. **Words beside a find.** Tesseract (self-hosted data) reads tags, "E",
   heights and keynotes, but only words that touch the symbol's box. An
   unread or conflicting word leaves the find as "which one?". This step is
   optional: step 5 alone covers it for pennies.
5. **The AI tie-break, as a button**: the same `breakTies` procedure and rules,
   on the crops code left unsure — an unread tag, an unread "E". Never on
   symbols drawn the same (duplex / GFCI).
6. **Later, not now:** the decision log (§ 5) and, when it is big enough, a
   detector.

## 7. Conflicts with earlier decisions — said in both files

- **`plan-viewer-overhaul.md` § 9.3 rejects pixel correlation**, for matching
  a new symbol against STORED thumbnails from other jobs — different sizes,
  line weights and capture resolutions. **Scans are different:** here the
  picked symbol is cut from the SAME sheet at the SAME resolution, so none of
  those differences exist; that is exactly when correlation works, and it
  measured 85 of 86. § 9.3 still stands for comparing across jobs. This plan
  overrides nothing in it; a line there now says so.
- **`find-all-matching-plan.md` § 3 item 2 and § 8 Q5 decided "Scan → refuse
  and offer the reader".** This plan **replaces** that for sheets of usable
  quality: a scan gets the picture matcher, and the refusal stays for scans
  too poor to match (step 2). A line there now points here.

## 8. Open questions, in plain words

1. **Your 8 "wall-mounted point" marks on E1.01:** 7 are on circles marked
   "OS" (occupancy sensors?), and 1 is on the C fixture "(A-8)". Which did
   you mean to count? This only changes the answer key, not a bid.
2. **Duplex vs GFCI on E1.02 look identical.** How did you tell them apart —
   a note, the location (by a sink), the panel schedule? Code can only say
   "one of these two" until it knows.
3. **Ship opencv.js (10.4 MB, loaded only for scans)?** **Recommended: yes.**
   The search is the whole feature, and there is nothing smaller that does it.
4. **Ship Tesseract (about 8 MB with self-hosted data), or use only the AI
   tie-break for words?** **Recommended: AI tie-break first** (pennies a
   sheet, 12/12 and 8/8 here); add Tesseract only if the AI spend on words
   turns out to matter. This choice costs money either way — yours to make.
5. **Demolition plan finds: hidden or shown?** **Recommended: shown as "on the
   demolition plan, not counted"**, so nothing disappears silently.

   > **Decided 2026-10-01 by the owner:** Q3 yes (opencv.js ships, loaded
   > only when a scan is searched); Q4 AI tie-break only, no Tesseract for
   > now; Q5 shown, not counted. See § 9.

## 9. Built — the scan branch of Find all matching (2026-10-01)

**Code:** `client/src/lib/scanMatching.ts` (everything but the opencv calls
is pure and tested in `scanMatching.test.ts`), the worker's scan branch in
`client/src/workers/pdfRenderer.worker.ts`, `openCvModule.ts` beside it, the
panel in `components/takeoff/FindMatching.tsx`, and
`planCopilot.checkScanFinds` with `scanFindsRequest` in `server/tieBreak.ts`.
**Measured through the shipped code** with `scripts/scanMatchingCheck.mts`
(re-runnable; `--ai` for the AI half).

### What it does

1. **Too poor to match** (`scanQuality`): the box's short side in the scan's
   own pixels (`VectorGeometry.imagePixelsPerPoint`, read off the image
   painted on the page). Under 16 px: refused, with the number — "This
   symbol is 10 pixels across on this scan — too coarse to match. Count it
   by hand." — before anything is rendered or opencv.js is fetched. 16–24 px:
   matched, every find flagged.
2. **Which plan**: titles from the OCR text layer (a short line, drawn 1.15x
   the page's median text, holding PLAN). Each owns the drawing above it, cut
   sideways at the first inch of white. **Only the plan the box is on is
   searched.** Boxed on a demolition plan, every find says "on the demolition
   plan — not counted unless you count it", is never clear, and Count it
   still works. Boxed on no titled plan, the whole sheet is searched and a
   find off every plan is flagged.
3. **The matcher**: the plan at 150 dpi, Otsu black-and-white, straightened,
   specks under 5 px removed; the boxed picture at 0.9 / 1 / 1.1 x four
   quarter turns, normalised correlation at 0.7, one find per spot.
4. **The AI, a button only** ("Ask AI about N (under 1¢)"): the picked crop
   and up to 12 find crops, 52–68 pt round each, one call per press, never
   pressed by anything else. Closed answers — same tag / a different tag /
   an E (existing) / not this symbol — each of which becomes a REASON on a
   find that stays unconfirmed.

### Measured on E1.01 and E1.02 (his 86 marks)

| Shape (his marks)  | Found       | On nothing in the plan         | Plan searched              |
| ------------------ | ----------- | ------------------------------ | -------------------------- |
| 2x4 rectangle (46) | **46 / 46** | 0                              | MAIN FLOOR - LIGHTING PLAN |
| 2x2 square (13)    | **13 / 13** | 0 (81 on 2x4s, all flagged)    | MAIN FLOOR - LIGHTING PLAN |
| Circle (8)         | **7 / 8**   | 0                              | MAIN FLOOR - LIGHTING PLAN |
| Switch (6)         | **6 / 6**   | 0                              | MAIN FLOOR - LIGHTING PLAN |
| Receptacle (11)    | **11 / 11** | 18 — the "E" ones, all flagged | MAIN FLOOR - POWER PLAN    |
| Timer switch (2)   | **2 / 2**   | 0                              | MAIN FLOOR - POWER PLAN    |
|                    | **85 / 86** |                                |                            |

The miss is the "(A-8)" C fixture (§ 2). **Corrected 2026-10-05 by the
owner:** the "wall-mounted point" marks were the **7 OS occupancy/daylight
sensors** (ceiling mounted), and the 8th, on that C fixture, is not one —
struck in `reader-accuracy/answer-key.json` (`dropMarks`), which the check
script now reads. So the circle is **7 / 7** and the total **85 / 85**. On
E1.02 the owner's "GFCI receptacle" count is the **half-filled duplex, a
duplex above the backsplash** (NOTE 7, verify height) — not a GFCI on this
set; the answer key now maps it per sheet (§ Q2 of § 8 is answered by it).
**Demolition:** a switch boxed on
E1.01's demolition plan found 8, a receptacle on E1.02's found 37; every one
labelled, none on his new-plan marks. **Too poor:** the switch box refuses at
50 and 72 dpi (10, 14 px), is flagged at 100 (19 px), plain at 150 and 300.
**Speed:** 5–7 s a search in node; **4.9–5.8 s on screen** (Chrome, a real
worker, opencv.js fetched on the first search). Every number here is from
2026-10-01; if a re-run differs, stop and find out why first.

**The AI button, every find sent ($0.025 in all, Sonnet, thinking off):**

- E1.01, picked an A2EM: of 46 rectangles, 39 of his A2s said "a different
  tag", 4 A2EMs "same"; 3 wrong (2 "not this", 1 "different tag" on an
  A2EM). Each wrong one is a flag, not a count.
- E1.02, picked a duplex: 17 of the 18 "E" receptacles said "E" (one run;
  an earlier run had 5 unparsed answers, which read as "could not tell").
  **10 of his 11 said "not this symbol" — and they are not:** his are drawn
  FILLED, the one picked is drawn hollow (crops looked at). The matcher had
  already rated them a weaker likeness (0.81–0.83). Flagged twice, dropped
  never.

### Where the build departs from §§ 2–6, and why

- **Every scan find starts "needs a look"**, not clear: "On a scan the tag or
  an E beside it is not read — check it by eye." Without it, Confirm all on
  E1.02 would have counted the 18 existing receptacles as new. Only the AI's
  answer takes it off. **Cost:** with AI off, a scan is confirmed one find at
  a time (Next walks them). Owner question 6 below.
- **"Bigger shape wins" became a score flag.** It needs two shapes searched
  together; the product searches one. Measured instead: the 2x2's own 13
  scored 0.87–1.00, the 81 halves of 2x4s 0.71–0.80, so under 0.85 is "a
  weaker likeness". (A ring-of-ink test was tried first and did not
  separate them: 6 of his flagged, 2 of the 81.)
- **A new procedure, not `breakTies`**: `breakTies` picks between LEGEND
  items; this has no legend, only the picked symbol, so its question and
  closed set differ (`checkScanFinds`, same rules: button, small crops,
  closed answers, writes nothing).
- **Two traps found building it, both silent:**
  - opencv.js's module is a THENABLE. `import()` of it never settles, and an
    async function returning it never returns. It is loaded through
    `openCvModule.ts`, and its `then` is deleted once it is ready.
  - Normalised correlation is 0/0 on blank paper, and opencv answers 1:
    every white pixel was a "find". A window must hold 0.5–2x the picked
    symbol's ink.

6. **DECIDED 2026-10-05 by the owner: keep scans as built** — no "Confirm
   all — checked by eye" button. _The question as asked:_ **Confirm all on a scan.** Today nothing on a scan is
   "clear" until the AI has read the words beside it. **Recommended: keep
   it** — the alternative counted 18 existing receptacles as new on E1.02 —
   / or add "Confirm all N — I've checked the words by eye" as a second,
   explicit button.
