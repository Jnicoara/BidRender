# Find all matching — the product version (PLAN)

**Status: PLAN ONLY, 2026-10-01 (Track C).** A test build is on `track-c`
(`deb9f8c`, `74b040a`) for the reader-accuracy hand count; this file is how it
becomes the product, and what the owner has to decide first. No migration, no
merge, no deploy has been done for it.

**In one line:** box one symbol on a CAD sheet and every copy on that sheet is
ringed in about a tenth of a second, with no AI. Nothing counts until it is
confirmed, and anything it is unsure of is flagged, never decided.

---

## 0. Decisions this cites, and the one it narrows

Read before specifying (CLAUDE.md, "Where decisions live"):

| Decision                                                                                                                                              | Where                                                 | How this plan stands                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Full-page template matching across a set" is listed as **not realistic** — the same symbol at different sizes, line weights, soft thumbnails.        | `plan-viewer-overhaul.md` § 9.3                       | **Narrowed, not reversed.** That rejected matching PIXELS of stored thumbnails across a SET. This matches the PDF's own LINE WORK, on ONE sheet, from a box drawn on that sheet — so size, line weight and thumbnail quality do not arise. Measured below (§ 2): 44 of 46 hand marks on Weld 1 E-200, 0.1 s a search. Pixel matching across a set stays rejected. § 9.3 now points here. |
| The app outlines, the estimator confirms.                                                                                                             | `plan-viewer-overhaul.md` § 5c                        | Kept whole: every match starts unconfirmed and is never stored until confirmed.                                                                                                                                                                                                                                                                                                          |
| A remembered symbol may be SUGGESTED on a new set, never APPLIED.                                                                                     | `plan-viewer-overhaul.md` § 9.4                       | Kept: the legend-driven version (§ 4 step 3) only ever proposes.                                                                                                                                                                                                                                                                                                                         |
| The reader never reads on its own (D11); every AI call is a button.                                                                                   | `takeoff-spec.md` D11, CLAUDE.md AI rules             | Find all matching makes no AI call of its own. It is still a button, never on load. On a SCAN the results carry one more button, "Ask AI about N" — small crops, closed answers, never pressed for you (§ 3, as changed 2026-10-01).                                                                                                                                                     |
| Manual mode is the product.                                                                                                                           | CLAUDE.md                                             | It IS manual mode — no model, no allowance, works with `DISABLE_AI_FEATURES`. An accelerator over clicking, not a replacement: every copy can still be clicked.                                                                                                                                                                                                                          |
| Unconfirmed matches: dashed, hollow, "?", in the count's colour; status not drawn until confirmed; never counted, never snapped to; "· N to confirm". | `track-b-count-pin-styles-plan.md` § 8 (on `track-b`) | **Adopted for the product.** The test build draws by flag instead (cyan / amber "?" / gray "E?") because pin colours are not built yet. That is a test-account look, to be replaced, not kept beside B's.                                                                                                                                                                                |
| Status on a pin: new filled, existing hollow-SOLID, remove X, relocate arrow — after Track A's column.                                                | `track-b-count-pin-styles-plan.md` § 7                | Adopted. "Count as existing" sets the status once the column exists (§ 5).                                                                                                                                                                                                                                                                                                               |
| Count by fixture tag: v1 proposes matches as the armed count; v2 reads the tag beside each match.                                                     | `count-by-tag-plan.md` § 3 (on `track-b`)             | Agreed. The matcher already collects the words round each match (that is how "GF" and "(E)" are found), so v2's tag read is a small addition to it, not new reading.                                                                                                                                                                                                                     |
| A status on each mark (new / existing / remove / relocate).                                                                                           | `todo.md`, Track A (migration), 2026-10-01            | Required before "existing" can be priced right (§ 5).                                                                                                                                                                                                                                                                                                                                    |
| A locked bid takes no new marks.                                                                                                                      | `takeoffStampsRouter` `drop`, owner 2026-09-29        | Kept: the button is not offered on a locked bid, and confirming goes through `drop`, which refuses anyway.                                                                                                                                                                                                                                                                               |

---

## 1. What exists today (track-c, test build)

- `client/src/lib/vectorGeometry.ts` — the sheet's line work from pdf.js's
  operator list: straight segments in page points, how dark, filled or not,
  and how much of the page is a picture.
- `client/src/lib/findMatching.ts` — the matcher. The symbol is the segments
  wholly inside the box (the main shade only, so a gray wall behind it is not
  part of it) and the words inside it. A copy has the same segments in one of
  eight orientations (four turns, each mirrored), at least 80% of the length,
  same filled state, same words. Flags: **needs a look** (a device word such
  as GF/WP/USB that differs, lines running through it, more line work joined
  on, drawn darker, "(X)", "(R)") and **maybe existing** (drawn lighter,
  "(E)").
- `client/src/lib/scanMatching.ts` — **the scan branch (2026-10-01)**: a
  scanned sheet is matched by PICTURE (opencv.js, fetched only then), on the
  plan the box is on only, with a too-poor refusal and the demolition plan
  kept apart. `references/scanned-plans-plan.md` § 9 has what it measured.
- In the PDF worker, one sheet's geometry kept at a time.
- On screen: "Find all matching" beside the armed count; rings; a panel with
  **Confirm all clear**, **Next**, **Count it**, **Count as existing** (the
  "- EXISTING TO REMAIN" twin count), **Not this one**. Unconfirmed is never
  stored; confirming queues ordinary marks.
- `scripts/findMatchingCheck.mts` — the measurement below, re-runnable.

## 2. Measured, 2026-10-01

**Weld 1 E-200 against the owner's hand count** (46 marks, 7 types, all in the
Power plan; the sheet also holds a Demolition plan and a Security plan he did
not count). One snug box per type, drawn round one of his marked symbols and
checked by eye:

| Type          | His marks | Found on them | Missed | On another type's mark | On nothing      | Copies in uncounted plans |
| ------------- | --------- | ------------- | ------ | ---------------------- | --------------- | ------------------------- |
| Duplex        | 9         | 9             | 0      | 5 (4 flagged)          | 0               | 9                         |
| Double duplex | 5         | 4             | 1      | 0                      | 0               | 0                         |
| GFCI          | 1         | 1             | 0      | 0                      | 0               | 0                         |
| Junction box  | 11        | 11            | 0      | 0                      | 0               | 11                        |
| Switch (S)    | 4         | 3             | 1      | 0                      | 0               | 1                         |
| Telecom       | 10        | 10            | 0      | 0                      | 4 (all flagged) | 4                         |
| Panelboard    | 6         | 6             | 0      | 0                      | 0               | 6                         |

- **The two "misses" are disagreements with the drawing, not the matcher:**
  the double duplex at (635.5, 1253) is drawn as a plain duplex (one pair of
  lines, not two), and the switch mark at (667.9, 1207.6) sits on a wire
  corner with no switch drawn. The one unflagged duplex-on-double-duplex is
  that same plain-drawn device. Both worth the owner's look.
- **Look-alikes:** every double duplex contains a perfect duplex; 4 of 5 were
  flagged "more lines run through it", and no GFCI ("GF" beside it) was ever
  offered as a duplex. Four bow-tie symbols contain telecom triangles; all
  flagged "more lines joined onto it".
  **Corrected 2026-10-06 (`code-first-ceiling.md` § b):** on E-200 there is
  NO "GF" text at the GFCI — the only word there is a circuit number. The
  GFCI was kept apart from the duplex by its filled half, not by a word. On
  UNCC E111, where GF and USB ARE written, the word ring misses them (USB
  0/38), and a GFCI box finds 3 duplexes with no flag.
- **All 31 copies in the uncounted plans checked by eye: real copies**,
  including turned and mirrored ones.
- **Speed:** 0.09–0.3 s a search; reading the sheet once 0.7–1.6 s (pdf.js),
  in the worker. Seen on screen: 23 found in 0.1 s.
- **Scans:** Old Blueridge E1.01 and E1.02 (one picture, 0 segments, an OCR
  text layer) — 128 boxes, 128 refused by the LINE matcher, rightly. Before a
  fix that day, 2 boxes landing on OCR'd words were "matched" as words-only
  symbols. **Since the scan branch they go to the picture matcher instead: 85
  of his 86 marks found** (`scanned-plans-plan.md` § 9).
- **UNCC E111** is vector (87,186 segments); no hand count yet to score it.

**What it cannot do, said plainly:** a symbol drawn at a different size on
the same sheet; turns other than 90°; a symbol made only of a text font
glyph where the drawing also uses that letter for something else; a device
whose drawing differs (the plain-drawn "double duplex" above is found as a
duplex, correctly, which is still a disagreement someone has to resolve).

---

## 3. How it fits the Plans screen

1. **Entry point: beside the armed count, as built.** What it finds is
   offered AS the armed count, so with nothing armed it has nothing to offer
   them as. The legend panel gets a second entry in step 3 below.
2. **Vector sheet → the line matcher. Scan → the PICTURE matcher.**
   **Superseded 2026-10-01: scans are matched, not refused.** What follows
   was the decision until then, kept as the record. Today a scan is searched
   by `@/lib/scanMatching` (`scanned-plans-plan.md` § 9): only the plan the
   box is on, every find unconfirmed and flagged until the words beside it
   are read, finds on a demolition plan "not counted", and a symbol too
   coarse on the scan (under 16 px) refused with its size — the one refusal
   left. The AI is a button on the results ("Ask AI about N"), never the
   route in.

   _As decided before:_ **Vector sheet → the matcher. Scan → the reader, by name.** The sheet
   decides (picture over 40% of the page and under 500 segments is a scan).
   On a scan the panel says it cannot see the symbols and, **only when the
   AI reader is on**, offers "Read this sheet instead" with its cost — a
   button, per the AI rules. With AI off it says "count these by hand", and
   nothing else. A set can mix both; the decision is per sheet.

   > **Built 2026-10-01:** the replacement proposed here is on `track-c`;
   > see the paragraph above and `scanned-plans-plan.md` § 9.

3. **Never the reader's results as an answer key.** The matcher reads no AI
   finding, and nothing it does pre-fills the reader-accuracy key.
4. **Locked bid:** not offered (as built).
5. **Leaving:** another sheet, or closing, drops what is unconfirmed — by
   design, so nothing half-decided can sit on a bid. "Confirm all clear"
   first if that is wanted.

## 4. Build steps, in order

1. **Adopt B's look (pin plan § 8)** — dashed, hollow, "?" in the count's
   colour; the reasons stay in the panel, not on the ring; "· N to confirm"
   on the pinned line and the amber mark on the count card while any are
   open. Depends on the pin-styles build; until then the test look stays on
   track-c only.
2. **Ship the matcher as built**, plus: a cap on candidates so a pathological
   box cannot freeze the worker (none seen, but a box round a hatch could),
   and the reasons text reviewed by the owner.
3. **Find from the legend.** "Find on this sheet" on a legend row: use the
   box the symbol was captured with, on its own sheet, to build the symbol,
   then search the open sheet. **Needs a migration** (Track A, additive):
   nullable `symbol_links.captureX/Y/Width/Height` in page points.
   Pre-existing captures have no box and simply do not offer it. Same set
   only in v1 — another set's legend may draw the "same" symbol differently,
   and § 9.4 says suggest-only anyway.
4. **Every sheet of the set** ("Find on all sheets"): the same symbol, one
   sheet at a time in the worker (~1 s each to read), results grouped by
   sheet, confirmed per sheet. Memory: one sheet's geometry at a time, as
   now.
5. **Tags** (count-by-tag § 3 v2): read the tag beside each match and offer
   it as that tag's count. The matcher already holds the words round each
   match.
6. **Status** (§ 5).

## 4a. Every look of the item, and the per-set rule (2026-10-05)

Built on `symbol_looks` (`multiple-looks-plan.md` § 10): with a count armed
that is a legend item, the search uses the box drawn now AND up to five of
the item's saved looks (this plan set's first), merged so one device is one
find ("found by 2 looks"). It can also run on the saved looks alone, with no
box. **The owner's rule:** a find that only a look from ANOTHER plan set
made is a suggestion — "Found only by a look saved on <set>" — never clear,
never taken by Confirm all. On a scan, another set's look is not compared
at all. Before looks, both branches already followed the rule by
construction: the only symbol searched was the one boxed on this sheet.

## 4b. Lines crossing symbols — measured, then built (2026-10-06)

**Asked:** do walls, home runs, grid and dimension lines running through or
touching a symbol make Find all matching miss it, and were the 2 misses on
Weld 1 E-200 this? Measured with `scripts/lineCrossingCheck.mts` (the same
sheet, marks and boxes as `findMatchingCheck.mts`), and the scan side with
`scanMatchingCheck.mts --scores`.

**Vector, Weld 1 E-200:**

- **The 2 misses are NOT crossing lines.** The double duplex at
  (635.5, 1253) has 68% of a double duplex present, whole or in pieces, 0
  lines split: it is drawn as a plain duplex. The switch at (667.9, 1207.6)
  has 0%: nothing is drawn there. As § 2 already said.
- **No device on the sheet was dropped because a crossing line cut it.**
  Every place where a type's line work is present as whole segments or
  collinear pieces (>= 80%) but not returned was checked: two, both correctly
  not that type (a duplex shape on a GFCI, a double-duplex shape on a plain
  duplex), and neither had a line actually split.
- **Lines touching devices are everywhere and already ignored:** 23 of 23
  duplexes and 24 of 24 junction boxes have a line crossing or touching
  them. A copy is scored on the symbol's own segments, so extra lines do
  not lower it.
- **"Close enough point by point" is not a usable fix:** it marks 283
  duplex "copies" in plan A, nearly all on nothing. Dense line work puts
  some line near every point of a circle.
- **No template holds a crossing line either.** A first reading said the
  GFCI's box held 10 pieces of a wire chopped up inside it (27.8 of 273.9 pt
  of its line). **That was wrong, and the measurement was what was wrong:**
  it counted any template line collinear with a line leaving the box, and
  printed one by one they are the GFCI's own three receptacle lines (each
  drawn twice) running out of the box where the home run continues them,
  plus curve slivers. They are the symbol. The check now says what it
  counts; read the pieces before calling them a wall.
- **So on E-200 crossing lines cost nothing**: no miss, no false find, no
  dirty template. What is built below handles the faults the matcher COULD
  have on another export — made to happen on purpose in fixtures — and
  changes nothing on E-200.

**Built (code only, `client/src/lib/findMatching.ts`):**

1. `throughLinePieces` — a line made of collinear pieces end to end that
   runs in one side of an outline and out the other is not the symbol. Taken
   out of the template; and at a copy, not counted as "more lines run
   through it" when it runs on at least half a symbol past both sides.
   **That margin is measured, not chosen:** a double duplex's second pair
   pokes 1 and 4 pt out of a duplex's outline, and the first version, with
   no margin, turned 4 flagged double duplexes into SILENT duplexes on
   E-200. Caught by re-running the check; pinned by a fixture.
2. `cutAcross` — a copy whose own line is cut where another line crosses
   it is OFFERED with "maybe — a line crosses it and cuts part of it",
   never clear, never taken by Confirm all. Strict: collinear pieces within
   the line's own ends, short gaps, and a line actually crossing in each
   gap — a merely missing line still fails (a fixture says so).
3. A second anchor of another length, so a copy whose rarest line is the
   one cut is still tried.

After all three, E-200 reads exactly as before (44 of 46, same flags,
nothing new offered) at 128–164 ms a search against 110–146.

**Scans, Old Blueridge:** 85 of 85 hand marks found. The picture matcher
has no line work to take apart: a line through a symbol is more black
pixels, which lowers the likeness. His marks scored 0.80–1.00 against the
0.70 threshold, and the lowest nine (0.80–0.83, switches and receptacles)
are already flagged "weaker likeness". **Not checked by eye** whether those
nine are crossing lines or scan noise. Nothing to build there today.

## 5. Existing devices and the mark status

- **Until Track A's `takeoff_stamps.status`:** "Count as existing" puts the
  mark in the "- EXISTING TO REMAIN" twin count (`shared/existingToRemain.ts`).
  That twin STILL PRICES if sent to a bid — it is a test-account tool, which
  is why it stays on track-c.
- **After it:** "Count as existing" places the mark in the SAME count with
  status `existing`; the bid bridge never prices `existing`; the card says
  "12 new · 4 existing" (pin plan § 7). The twin counts are converted by
  the same migration and folded into their base count.
- **"Maybe existing" never sets a status.** It is a reason in the panel. The
  estimator picks Count it or Count as existing.
- **Remove / relocate** ("(X)", "(R)" beside a copy) are needs-a-look today;
  with the status column they become one-click choices alongside existing.

## 6. Migrations

| What                                                   | Kind                                                           | When                                  | Who     |
| ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------- | ------- |
| `takeoff_stamps.status` (new/existing/remove/relocate) | Additive (NULL = new) + a step-3 conversion of the twin counts | Before "existing" can be priced right | Track A |
| `symbol_links.captureX/Y/Width/Height`                 | Additive                                                       | Before step 3                         | Track A |

Nothing else. Unconfirmed matches are never stored, so they need no table.

> **Superseded in part, 2026-10-01 (later):** the capture box above belongs
> to a LOOK, not to the item, once an item can have several looks — a box on
> `symbol_links` can hold only one. `references/multiple-looks-plan.md` § 6
> proposes one additive table, `symbol_looks`, carrying the box per look;
> if the owner picks it, the `symbol_links` columns above are not needed.
> (A's R.11 states the item-level columns; it is A's to update.)

---

## 7. Decisions for the owner — recommendation first

1. **Ship it in the product?** **Yes, as a manual-mode accelerator on vector
   sheets (recommended)** / keep it a test tool / fold it into the AI reader.
2. **"Confirm all":** **clear ones only, flagged one at a time
   (recommended)** / everything at once. A sweep would make every flag
   decorative.
3. **Unconfirmed when leaving the sheet:** **dropped (recommended)** / kept
   as proposals for later (a table, and a half-decided state on the bid).
4. **The look:** **B's pin plan § 8 (recommended)** / keep the test colours.
5. **Scans:** ~~say it cannot, and offer the reader by name when AI is on~~ —
   **decided 2026-10-01: match them by picture** (`scanned-plans-plan.md`
   § 9), refusing only a symbol too coarse to match. The open question there
   is Confirm all on a scan (its Q6).
6. **Find from the legend (step 3):** **yes, same set only (recommended)** /
   across sets too (§ 9.4 risk: offices draw symbols differently).
7. **Every sheet of the set (step 4):** **yes, after step 3 (recommended)** /
   one sheet only.
8. **Flag wording:** **review the reasons as written in the test build
   (recommended)** — they are the only explanation a flag gets.

---

## SHORT SUMMARY

- Box one symbol on a CAD sheet; every copy on that sheet is ringed in ~0.1 s,
  turned and mirrored too, no AI. Nothing counts until confirmed.
- Weld 1 E-200: 44 of 46 hand marks found; both misses are spots where the
  drawing and the mark disagree. Look-alikes (duplex inside double duplex,
  triangle inside a bow-tie) are flagged, not counted silently. Scans are
  now matched by picture (85 of 86 on Old Blueridge), not refused.
- Narrows overhaul § 9.3 (pixel matching across a set stays rejected); keeps
  § 5c, § 9.4, D11; adopts B's unconfirmed and status looks.
- Two Track A migrations: mark status (needed for existing to price right)
  and the capture box on legend symbols (for "find from the legend").
- Owner: 8 decisions above, recommendation first in each.
