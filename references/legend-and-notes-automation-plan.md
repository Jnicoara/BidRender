# Legend and notes, read by code first — PLAN ONLY, 2026-10-01 (Track C)

**Status: PLAN ONLY**, plus throwaway measurements (scripts not committed).
No app code, no migration, no merge.

**The ask:** check the legend AND the plan notes automatically, with as little
AI cost as possible, the way Find all matching works without AI — and be
honest about what is realistic.

**`references/bidridge-ai-direction.md` does not exist** on any branch
(searched `local-dev`, `track-b`, `track-c` and every `a-*` branch on
2026-10-01). Its topics — addenda, spec reading, correction logging — are
taken from the request itself; when that file is written, this plan should be
checked against it and either side corrected (CLAUDE.md, "Where decisions
live").

**The short answer:** on a CAD sheet, code can read the legend, the status
words, the keynote numbers and most heights, and can find every copy of a
legend symbol. What it cannot do is understand a sentence. So: **code reads
and locates everything; AI is asked only about what code could not settle,
in the smallest possible pieces** — a sentence of text, or a small crop —
never a whole page. Scans are the exception, and are expensive either way.

---

## 0. Decisions this cites

| Decision                                                                                   | Where                                             | How this plan stands                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Never spend an AI call the user did not ask for; a call is a button.                       | CLAUDE.md, AI rules; `takeoff-spec.md` D11        | Kept. "Read this set" is a button with a cost estimate first (§ 3).                              |
| Manual mode is the product.                                                                | CLAUDE.md                                         | Kept: everything here is optional help; nothing is needed to count or price.                     |
| The app outlines, the estimator confirms; remembered symbols are suggested, never applied. | `plan-viewer-overhaul.md` § 5c, § 9.4             | Kept: everything the AI finds starts unconfirmed (§ 4).                                          |
| Legend once per plan set (`bid_pdf_legend_entries`).                                       | A's `legend-reading-plan.md` (a-plans-reader)     | The "read once per set, reuse on every sheet" rule of § 3 is that plan's (c), extended to notes. |
| AI correction log, two halves (identified / anonymised).                                   | A's `ai-correction-log-plan.md` (a-plans), "0099" | Corrections here are written INTO that log, not a second one (§ 5).                              |
| Cheapest tier that works; closed action sets.                                              | CLAUDE.md, "AI features — closed action sets"     | Every AI question here has a closed answer set: one of the legend items, or "none".              |
| Find all matching; check my marks; multiple looks; variants inside a count.                | track-c plans of 2026-10-01                       | This is the layer over all four (§ 6).                                                           |

---

## 1. What CODE alone can do on vector PDFs — and what was measured

| Job                                                 | Status                                | Measured                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Read legend names and symbols**                   | **Built** ("Whole legend", `48b7928`) | Weld 1 E-001: **48 of 48 names exact**, 58 rows in 1.1 s. UNCC: **85 of 103, none wrong**. Old Blueridge (scan): refused, no guessed rows.                                                                                                                                                       |
| **Find every copy of a legend symbol**              | **Built** (Find all matching)         | Weld 1 E-200: **44 of 46** hand marks, ~0.1 s a search, $0. Looks boxed on the LEGEND sheet match the plan across sheets: 28 of 30 marks of 5 types (check-my-marks-plan § 5).                                                                                                                   |
| **Status words** — (E), (X), (R), WP, NIC, ETR      | Reader not built; text is clean       | E-200: **27 "(E)" and 32 "(X)"**, all present as text, read in ~1.5 s for the sheet.                                                                                                                                                                                                             |
| **Mounting heights** (`54"`, `+18`, `48" AFF`)      | Not built                             | E-200's text holds `36" 54" 42"` — and `4"`, `1"`, which are box / conduit sizes. UNCC's `6" 4" 12"` are sizes too. **A height is decided by sitting next to a device and being in range (about 12–96"), never by the inch mark alone.** E-200 telecom: 3 of 10 marks have a height beside them. |
| **Numbered general / work notes**                   | Not built                             | E-200 has "WORK NOTES" 1–18. Each printed LINE is a separate text piece, so a rough count found 1 of 18 — **a line-joining parser is needed** (the legend reader already joins multi-line names; same technique). UNCC E111 has free "NOTE:" sentences instead.                                  |
| **Keynote tag → the marks that carry it**           | Not built                             | A number inside a small square on the plan. A quick rule found **69** on E-200 — too many: circuit numbers beside round devices (19–26, when the notes stop at 18) passed it. **A real closed-square test is needed.** With tags located, 15 of his 46 marks have one within 30 pt.              |
| **Symbols on the sheet that are not on the legend** | Not built, not measured               | Approach: run every legend look over the sheet (built), then list compact clusters of the electrical shade that no look explained and that are not text or a run of wire. Expect noise (arrows, tags, fixtures drawn by others); shown as "unknown symbols", never counted.                      |
| **Variants inside a count** (height, F, box)        | Planned                               | UNCC E111 data outlets: 7 of 73 marks on other looks (floor "F", in a box, in a circle); check-my-marks-plan § 10.                                                                                                                                                                               |

**So on a CAD sheet, code covers locating, legend names, status words and
keynote numbers.** What it cannot do: say what a sentence MEANS ("provide
GFCI protection for all receptacles within 6 ft of a sink"), read a scan, or
name a symbol that matches nothing.

## 2. What truly needs AI — and how small each call can be

| Job                                                          | Smallest call                                                                                                                                                                          | Rough cost (published rates in `shared/aiPricing.ts`)                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **What a note sentence means** for the takeoff               | **Text only**: one note, plus the legend names; answer from a closed list (applies to item X / height H / existing / by others / none). No picture.                                    | ~400 in / 60 out on the fast tier (Haiku: $1 / $5 per M) ≈ **$0.0007 per note**. E-200's 18 notes ≈ $0.013. |
| **Which legend item is this symbol** (look-alikes, odd ones) | **One small crop** (~160 px) + reference crops of the 2–7 items it could be. Never the page. See "Code locates, AI labels".                                                            | Measured in that section.                                                                                   |
| **A symbol that matches nothing**                            | One crop + the legend list; answer "item X / not a device / unknown".                                                                                                                  | As above, one call per unknown cluster.                                                                     |
| **Scanned sheets**                                           | No line work, so code cannot locate. Either whole-sheet reading (measured poorly, § 3) or tiles; both expensive. **Recommended: counted by hand, with the reader as a priced button.** | E-200 as a picture: $0.05 per whole-sheet call, ~$0.23 per sheet in 6 pieces.                               |

**A whole page is never sent** for a vector sheet: code has already located
everything, so the AI only ever sees what it is asked about.

## 3. Cost controls — with the accuracy test's real numbers

**What the whole-sheet reader cost (Weld 1 E-200, 2026-10-01):** 28 calls,
**$1.12**; ~10,000 input tokens per call; 6 pieces per sheet in the zoomed
method at ~$0.22–0.23 per sheet per run. Best result: 12 of 36 power marks
found, and 70 of 76 Power-plan "extras" were the right device in the wrong
place. **Locating is what the AI is worst at, and it is what code does for
free.**

The controls, in the order they save money:

1. **Code first; AI only for leftovers.** Everything in § 1's table costs $0.
   The AI gets only notes to interpret and crops code could not settle.
2. **Read once per plan set, reuse on every sheet.** The legend and the
   general notes are per set (A's legend plan (c)). A set's 30 sheets share
   one legend reading and one notes reading.
3. **Re-read only what an addendum changed.** Each sheet is fingerprinted
   (a hash of its operator list and text, computed in the worker during the
   first read). An addendum that replaces 3 sheets re-reads 3; the other 27
   are skipped with "unchanged since <date>".
4. **Cache by fingerprint.** A sheet + legend-look pair already answered is
   not asked again — across bids too, for a set uploaded twice.
5. **Cheap model to sort, strong model only for hard calls.** The fast tier
   answers "which of these items"; only an answer it marks unsure, or one the
   look-alike pairs say is risky, is asked again on the strong tier.
6. **An estimate before every run, and a stop above a limit the owner sets.**
   "This will ask about 37 spots and 18 notes: about $0.06. Your limit:
   $1.00." Over the limit → nothing runs until he raises it. The estimate
   is the count of questions × the measured cost per question, and the run
   reports the real cost after (`ai_usage_daily`, already built).

## 4. What is confirmed vs what is automatic

- **Automatic (code, no AI, no money):** reading, locating, grouping,
  flagging. It changes NOTHING on a bid — it produces suggestions.
- **Everything the AI says starts "unconfirmed"**, exactly as Find all
  matching's rings do. It never counts, never prices, never fills a height.
- **The estimator confirms each change**, one at a time or a clear group at
  once (never a flagged one). Wrong heights or a missed "existing to remain"
  put wrong numbers on bids, so:
  - a height read from a note is offered, never written (it would set
    `mountHeightSource = 'read'` only when confirmed — check-my-marks § 10.6);
  - "existing to remain" from a note is offered as a status (Track A's
    column), never applied silently;
  - **a locked bid only reports.**

## 5. Corrections, logged once, so a mistake is not paid for twice

- Every confirm, reject and correction of an AI answer is written to A's AI
  correction log (`ai-correction-log-plan.md`, planned as 0099) — the same
  table, the same two halves. Not a second log.
- **What makes it save money:** before asking the AI about a crop or a note,
  look up the log for the same sheet fingerprint and the same spot (or note
  text). If the estimator already answered, reuse his answer — no call. If
  the AI was corrected for the same LOOK on another sheet of the set, send
  the correction with the question ("on this set, a triangle in a box is the
  floor box, not the data outlet").
- **Columns for Track A (flag only, not numbered):** the log as planned has
  `findingId` and `stampId`; this needs one more optional pair so a
  correction can be found again by WHAT was asked, not only by which mark:
  `askKind enum('crop','note') NULL` and `askFingerprint varchar(64) NULL`
  (a hash of the sheet fingerprint + crop box, or of the note text). Index
  `(dataUserId, askFingerprint)`. Additive, nullable.
- Sheet fingerprints themselves: one nullable column,
  `bid_pdf_sheets.contentHash varchar(64) NULL` — written on first read;
  NULL means "never read". Flag for A.

## 6. How it fits the other plans

- **check-my-marks-plan.md:** the same per-sheet look runs; "does the drawing
  agree with your mark" is code-only, and an UNSURE result is exactly a
  leftover the AI may be asked about (one crop).
- **multiple-looks-plan.md:** every look of an item is a reference crop for
  the AI question, and a look added after a correction is what stops the
  same mistake on the next set.
- **connect-point-plan.md:** independent — connect points place the run
  end; this reads what the device is. Both need the capture box.
- **Mounting height per mark** (check-my-marks § 10.6): a height read from a
  note or beside a mark is offered for confirmation and, confirmed, feeds the
  mark's vertical drop.

## 7. Build order — smallest useful piece first

1. **Status words beside marks** ((E), (X)) → "maybe existing / maybe
   removed" on check-my-marks. Code only, measured clean (59 on E-200). Useful
   the day it ships, because a missed (E) is a wrong number.
2. **Heights beside marks**, offered (needs the § 10.6 column to store).
3. **Keynote tags** (closed-square test) → the note number on each mark.
4. **Notes parser** (line joining) → the numbered notes as text, shown
   beside the marks that carry their number. Still no AI.
5. **AI on note sentences**, text only, closed answers, priced button.
6. **Code locates AND labels** (§ 7a: 40 of 46 at $0), with **the AI only
   as a tie-breaker** on spots two looks both match (§ 7a: 4 of 4 right, one
   small call). Measured to pay — the earliest AI step worth building.
7. **Symbols not on the legend.**

**The test that proves step 1–4 on real notes:** a script like
`findMatchingCheck.mts` over Weld 1 E-200 and UNCC E111 that prints, per
sheet: status words beside marks, heights beside marks (with the
size-vs-height rejects listed), keynote tags found by the closed-square test
against the work-note numbers (E-200: 1–18, so any tag above 18 is a fault),
and the numbered notes joined. Each number goes red if a later change moves
it.

## 7a. Code locates, AI labels — MEASURED on Weld 1 E-200, 2026-10-01

**The idea tested:** code finds the candidates (Find all matching, one look
per legend item); the AI is shown only a small crop of each candidate plus
the legend's own reference pictures, and asked which item it is, or "none".
Never the page. Power Plan only (where the hand count is).

**Setup (a throwaway script, not committed):**

- **Looks:** 5 boxed on the legend sheet E-001 (switch, junction box, duplex,
  double duplex, GFCI); telecom and panelboard boxed on E-200 itself, where
  the legend rows were not boxed. **References:** the owner's own 7 captured
  legend pictures for Weld 1 (`symbol_links`), 2.9–4.5 KB each.
- **Code:** 49 candidate spots in the Power Plan, in about 2 s, $0. **45 of
  his 46 marks have a candidate** — the 46th is the switch mark on a wire
  corner with nothing under it.
- **AI:** each call = the 7 references once + 10 crops (40 pt square, 160 px,
  a red square round the centre) + "Picture N: item number, or 0". Four ways:
  Haiku and Sonnet, each without and with the PDF text printed within 20 pt
  of the crop. 5 calls each, **20 calls, $0.046 in total** — about **900–1,300
  input tokens a call**; Haiku $0.0012–0.0014 a call, Sonnet $0.0029–0.0035.
  Estimate given before running: $0.10.

**Results — of his 46 marks:**

| Who labels                                    | Right                 | Wrong | Not located | Cost for the sheet                          | Calls |
| --------------------------------------------- | --------------------- | ----- | ----------- | ------------------------------------------- | ----- |
| Whole-sheet AI (the accuracy test, best of 8) | 12 of 36 power        | —     | —           | $1.12 for the 8 readings (~$0.23 a reading) | 28    |
| **AI labels every crop** — Haiku              | 35                    | 10    | 1           | **$0.007**                                  | 5     |
| AI labels every crop — Haiku + nearby text    | 35                    | 10    | 1           | $0.007                                      | 5     |
| AI labels every crop — Sonnet                 | 35                    | 10    | 1           | $0.016                                      | 5     |
| AI labels every crop — Sonnet + nearby text   | 34                    | 11    | 1           | $0.017                                      | 5     |
| **CODE ALONE** (the look that matched)        | **40** (+4 ambiguous) | 1     | 1           | **$0**                                      | 0     |
| **CODE, + AI only on the 4 ambiguous spots**  | **44**                | 1     | 1           | **~$0.003**                                 | 1     |

- **Code labels better than the AI.** The look that matched a spot IS a
  label, and it was right 40 times; on 4 spots two looks matched and the
  right one was among them. Asked ONLY about those 4, the AI picked all 4
  right. **44 of 46 — and the remaining 2 are the two marks the drawing
  disagrees with** (check-my-marks § 5): a "double duplex" drawn as a plain
  duplex (code calls it a duplex — the drawing's answer), and the wire-corner
  switch (nothing to locate).
- **The AI alone, on every crop, gets 35** — worse than code, at any tier.

**Look-alike pairs the AI got wrong (labelling every crop):**

- **Duplex vs double duplex:** Sonnet 1 each way; Haiku mixed double duplex
  with telecom (2) and junction box (1).
- **Duplex vs GFCI:** Haiku called a duplex a GFCI once; Sonnet called the
  GFCI a junction box, then (with text) a duplex. **Code never mixed them**
  (the GFCI's half-filled circle is a different look).
- **Switch:** Haiku called 2 duplexes and 1 double duplex "switch" with text,
  and a switch "telecom".
- **Telecom:** Sonnet said "none" on **5–6 of his 10** telecom outlets. The
  reference picture was checked by eye: a clean hollow triangle, the same as
  the plan's — so this is the AI's miss, not a bad reference.
- **Did nearby text fix them? No.** Haiku 35 → 35, Sonnet 35 → 34. On these
  symbols the words beside them (circuit numbers, "(E)", "54"") did not help
  the AI name the device. (Text matters to CODE for heights and status —
  § 1 — not for naming.)

**What this costs on a real 30-sheet set:**

- **Code:** about 2 s a sheet, in the worker, **$0**.
- **AI only on ambiguous spots:** 4 on this sheet → 1 call. Assume 5–15 a
  power sheet, fewer on others: **1–2 Sonnet calls a sheet ≈ $0.003–0.007,
  ~$0.10–0.20 for 30 sheets.**
- **With the cache** (§ 3: fingerprint each sheet, skip unchanged), an
  addendum of 3 sheets costs **~$0.01–0.02**.
- **Against the whole-sheet reader:** ~$0.23 a sheet zoomed → **~$6.90 for
  30 sheets, every read**, for 12 of 36 at best.
- The daily allowance (150 reader calls a person) is not near: a 30-sheet set
  is ~30–60 calls.

**What this does NOT cover:**

- **Scans** (Old Blueridge): no line work, so code cannot locate — nothing
  here applies. Count by hand, or a priced whole-sheet read knowing its
  measured accuracy.
- **Symbols not on the legend:** code finds only what a look describes. A
  device drawn but not in the legend is never a candidate (§ 1, last row).
- **Items with no boxed look:** today's captures store a picture, not a box
  (multiple-looks-plan § 6) — so in the product, looks come only from
  captures made after the box is stored, or re-boxed ones.
- **Angled walls, other sizes** — the matcher's limits
  (check-my-marks § 10.4).
- **One sheet, one set, one engineer.** UNCC (12-piece sheets, a 103-entry
  legend) is the next measurement before any number above is promised.

**Recommendation, plainly:** **build code-only labelling first** — it is
already 40 of 46 right at $0, and it is mostly built (Find all matching +
check my marks). Then add **the AI only as a tie-breaker on the ambiguous
spots**, one small call per sheet, as a priced button. **Do not build "AI
labels every crop"** — it is cheaper than the whole-sheet reader but less
accurate than code. And **do not spend more on the whole-sheet reader for
vector sheets**: locating is the part it is worst at and code does for free.

## 7b. BUILT and MEASURED on UNCC E111 — code labels, AI breaks ties, 2026-10-01

Built on track-c as **Check sheet** (`@/lib/sheetCheck`,
`components/takeoff/SheetCheck.tsx`, `server/tieBreak.ts`). Legend: the
"Whole legend" rows of E001 (105 rows with a usable symbol). His hand count
on E111: **243 marks** in 5 counts. All UNCC numbers below were measured
against those marks.

| Who labels                                        | Agrees with his mark | Wrong item | Not found / unsure           | Cost   |
| ------------------------------------------------- | -------------------- | ---------- | ---------------------------- | ------ |
| Whole-sheet reader, one picture (a)               | 3                    | 5          | 235 missed                   | $0.065 |
| Whole-sheet reader, 12 zoomed pieces (c)          | 128                  | 33         | 82 missed, 57 extra          | $0.612 |
| **Code only (Check sheet)**                       | **149**              | **0**      | 25 nothing under, 69 unsure  | **$0** |
| …of which data outlets drawn the same as 2 others | 66 of 73             | 0          | not decidable by any picture | $0     |

- **Without the 73 data outlets** (the (c) run scored them apart): code
  agrees on **145 of 170**, 0 wrong, 22 nothing under, 3 unsure. (c) found
  128, with 21 wrong.
- **Data outlets:** UNCC draws "typical telecom outlet", "outlet in
  furniture" and "data outlet for wall-mounted TV" as the SAME triangle; only
  the notes differ. Code says so and never sends them to the AI, because no
  picture can decide them. (c) found 0 of 73.
- **The 7 odd data outlets**, looked at one by one: **2 are drawn turned 45°**
  on the angled wall, and the matcher only tries quarter turns, so it sees
  nothing under them. **2 have an "F" written under the triangle**; one of
  those reads as the fire-alarm pull station, whose legend label is also
  "F". **3 touch another symbol** (a duplex, a J box) and are flagged
  "more lines run through it" but still match. Most of them are fixable in
  code: 45° turns are the next matcher change, and the "F" pair needs the
  label rule to look at what the word is beside. None of it needs AI.
- **AI tie-break:** 12 spots tied between switch-like "S" looks (single-pole
  switch, motor starter, smoke detector and a subscript note row). **One call,
  Sonnet, 1,745 tokens in / 109 out, $0.005: 12 of 12 picked "ceiling
  mounted smoke detector"**, checked by eye (a hexagon with an S). None were
  on his marks. Weld 1, measured earlier: 4 of 4 for $0.003.
- **Time:** about 3.3 s per check on E111 (legend + plan read once, then
  cached in the worker).
- **Spent on this request:** $0.68 for the (c)+(a) baseline and $0.01 for the
  tie-break (one run was repeated after the script hung on exit). Total
  **about $0.69** of the $3 limit; the estimate given beforehand was $0.65.

## 8. Open questions for the owner

> **DECIDED 2026-10-01 by Track C where no money, bid number or undoable
> change is involved; the rest are ASKED.**
>
> 1. **Room-wide "existing to remain" from a note: not built now** (it needs
>    rooms read — a separate job). Decided.
> 2. **ASKED — money:** the default spending limit for a "read this set"
>    run. Built as a cost shown before every AI call and a stop at **$1**
>    a run until he says otherwise.
> 3. **ASKED — money:** whether scans may use the whole-sheet reader as a
>    priced button. Nothing changes for scans meanwhile (the reader button is
>    as it was; Find, check and labelling refuse scans).
> 4. **A correction offered on the next job from the same engineer: yes, as
>    a suggestion only** — once A's correction log exists. Decided.
> 5. **Heights written without `"` or `+`** — a question of fact, left open:
>    bare numbers are not read as heights until he says his engineers write
>    them that way.

1. **Is "existing to remain" from a NOTE ("all devices in room 104 are
   existing to remain") something you want flagged on every mark in that
   room?** It needs rooms read too — a bigger job.
2. **What spending limit should a "read this set" button stop at by
   default?** Recommended: $1 per set, asked each time it would pass.
3. **Scans: count by hand (recommended), or allow the whole-sheet reader as a
   priced button knowing its measured accuracy?**
4. **Should a correction you make on one job be offered on the next job
   from the same engineer?** Recommended: yes, as a suggestion only.
5. **Heights:** are heights on your sets always written with `"` or `+`, or
   do some engineers write a bare `48`?
