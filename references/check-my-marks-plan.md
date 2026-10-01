# Check MY marks — PLAN ONLY, 2026-10-01 (Track C)

**Status: PLAN ONLY.** No app code, no migration, no merge. A throwaway
measurement was run (§ 5); its script is not in the repo.

**The ask:** the app should check the estimator's OWN marks, not only find
ones he missed — a receptacle marked as a duplex that is really a
half-switched one, a duplex that is really a GFCI. Find all matching already
caught 2 of his 46 marks on Weld 1 E-200 that disagree with the drawing
(`find-all-matching-plan.md` § 2). This builds on that.

**In one line:** for every mark, look at what is DRAWN under it, compare it
with the captured looks of every legend item, and say one of three things —
matches, looks like a different item, or nothing is drawn here. No AI. Never
changes a mark; the estimator decides each one.

---

## 0. What this rests on — cited, not re-decided

| Decision / fact                                                                                     | Where                                                         | How this plan stands                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The matcher: a boxed symbol's line work and words, 8 orientations, look-alike flags; scans refused. | `client/src/lib/findMatching.ts`, `find-all-matching-plan.md` | Reused as is. Checking is the same comparison asked the other way round: "what does THIS spot match?" instead of "where does this symbol occur?". |
| The app outlines, the estimator confirms; a remembered symbol is SUGGESTED, never APPLIED.          | `plan-viewer-overhaul.md` § 5c, § 9.4                         | Kept whole: a check result is a suggestion with a button, never a change.                                                                         |
| Several looks per item; looks stored with their box.                                                | `multiple-looks-plan.md`                                      | **The check compares a mark with every look of every item.** It needs looks WITH a box (§ 7).                                                     |
| "Move to…" puts marks under another count, same place, one undo.                                    | built, `takeoffStampsRouter.moveToGroup` (track-c)            | The "change it" button IS Move to — no second way of changing what a mark counts.                                                                 |
| The review page: every AI find not in the hand count, with picture, jump link, My miss / AI wrong.  | `scripts/readerAccuracyReview.mts`                            | Gets a second list: "your marks the drawing disagrees with" (§ 4).                                                                                |
| A locked bid's marks cannot move.                                                                   | `moveToGroup` refuses on a locked bid                         | Kept: on a locked bid the check still RUNS and reports, and offers no change button (§ 2).                                                        |
| AI calls are buttons; manual mode is the product.                                                   | CLAUDE.md                                                     | No AI at all on vector sheets. Scans: refused, said plainly (§ 1).                                                                                |

---

## 1. How one mark is checked

1. **The looks.** Every look of every legend item that has a box (from
   `symbol_looks`, `multiple-looks-plan.md`): its line work and words are
   rebuilt from the sheet it was boxed on — usually the legend sheet.
2. **Run each look once over the sheet** with the matcher, exactly as Find
   all matching does. That gives, for every look, every spot on the sheet it
   matches, with its flags. Once per sheet, not once per mark.
3. **For each mark, collect the looks that matched within half a symbol of
   it** (6 points on Weld 1 — a symbol's half width).
4. **What makes two items different is already what the matcher compares:**
   - **half-filled / filled** — a segment's filled state is part of the match
     (a GFCI on Weld 1 is the duplex with its bottom half filled; a
     half-switched one, its right half). Measured: neither filled look ever
     matched a plain duplex (§ 5).
   - **extra lines** — a second pair across a double duplex: "more lines run
     through it" (built).
   - **words beside it** — GF, GFI, WP, WR, IG, USB, TR… compared with the
     look's own (built). Status words — (E), (X), (R) — are reported, never
     used to pick an item.
   - **words that ARE the symbol** — "S" for a switch, "D" for a dimmer on
     Weld 1's legend: a different required word is a different item.
5. **Vector sheets only.** A scan (picture over 40% of the page, under 500
   segments — the rule Find all matching uses, which refused 128 of 128
   Blueridge boxes) is refused for the whole sheet: "This sheet is a scanned
   picture, so its marks can't be checked against the drawing." No guesses.

**What a person must box carefully, learned the hard way (§ 5):** a legend
symbol's box must hold the SYMBOL only — Weld 1 writes a switching-leg letter
("a") beside every switch and dimmer. Boxed in, the "a" becomes part of the
symbol and no switch on the plan (legs "a", "b"…) matches. The capture card
should show the words it took as part of the symbol, so a stray "a" is seen.

## 2. The result for each mark — and what the estimator can do

| Result                          | When                                                                                                                                                         | Shown                                                                                                     | Buttons                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Matches**                     | A look of the mark's own item matches here, and no OTHER item's look matches cleanly. A note ("lines joined on", "(E) beside it") may ride along, as a note. | Nothing, or a quiet tick on the count's card ("28 of 30 checked: match").                                 | —                                                                            |
| **Looks like a different item** | Another item's look matches here cleanly, and the mark's own does not.                                                                                       | "Drawn like DUPLEX RECEPTACLE" — the drawing's picture and the better-fitting item's look side by side.   | **Move to DUPLEX RECEPTACLE** (= Move to…, one undo) · **Keep as is** · Jump |
| **Unsure**                      | Its own look AND another item's look both match cleanly, or only flagged matches exist.                                                                      | Both looks, and the reasons.                                                                              | **Move to …** (each candidate) · **Keep as is** · Jump                       |
| **Nothing under the mark**      | No look of any item matches within reach — a mark on a wire corner, or an item that has no look yet.                                                         | The picture of the spot. If the item has no boxed look: "GFCI has no look to compare with — capture one." | **Delete mark** (asks) · **Keep as is** · Jump                               |

- **Never changes a mark by itself.** Every change is a button press, one
  mark at a time, and goes through Move to… or delete, which already refuse a
  locked bid and are undoable.
- **"Keep as is"** dismisses it for this check. Whether that is REMEMBERED
  across checks is a decision (§ 7, § 8 Q3).
- **Every result has the picture of the spot and "Jump to it"** — the
  deep link already built (`planSpotHash`), so the review page and the plans
  screen land on the same point.
- **On a locked bid** the check runs and lists, and offers only Jump: the
  marks cannot move, but the estimator may still want to know before he
  unlocks.

## 3. Where it runs

1. **On a count** — "Check these marks" on a count's card: that count's marks
   on this sheet. All looks are still run (a mark can only be "a different
   item" if the other item's look is in the comparison), but only that count's
   marks are reported. ~1 s.
2. **On a sheet** — "Check this sheet's marks" in the Counts tab: every mark
   on the sheet, grouped by result, "Looks different" first.
3. **In the accuracy test** — `readerAccuracyReview.mts` runs the check over
   the answer-key sheets before scoring and lists disagreements for the owner
   (§ 4). The answer key is corrected by him, in the app, through the same
   buttons — the script never moves a mark.

Always a button. Never on load, never on every mark placed (that would re-read
the sheet constantly and flag half-placed work).

## 4. Fit with the review page and with multiple looks

- **Review page:** a second section, **"Your marks the drawing disagrees
  with"**, above the AI finds: one card per mark, picture, the suggested item,
  "Open this spot in BidRidge". Verdicts, kept in `answer-key.json` like the
  others: **"Drawing is right — I'll fix my mark"** (he moves or deletes it in
  the app, then Score again) or **"My mark is right"** (kept; the check is
  wrong). A mark fixed in the app simply stops appearing.
  This matters for the score: a wrong mark in the key counts a right AI
  answer as WRONG SYMBOL. The two Weld 1 disagreements would each have done
  exactly that.
- **Multiple looks:** every look of an item is a way that item may be drawn,
  so "own item matches" means ANY of its looks matches. A new look is a new
  way to match — so the look-alike warning at capture (`multiple-looks-plan.md`
  § 4) protects this check too: a look that also matches another item's marks
  would turn those marks "unsure".
- **Find all matching:** the same per-sheet look runs serve both — "copies
  not yet marked" (find) and "marks that do not fit" (check) are two views of
  one result. Building the check on the same pass costs nothing extra once
  Find from the legend exists.

## 5. Measured, 2026-10-01 — Weld 1, looks boxed on the legend sheet

A throwaway script boxed each legend symbol on **E-001** (page 1) by hand,
checked by eye on a render, and ran the shipped matcher across to **E-200**
(page 5); then classified every one of his marks of those types. Telecom
and panelboard (16 marks) were not included: their legend entries are in a
separate list on E-001 and were not boxed.

| His item      | Marks | Matches | Looks different              | Nothing under it                   |
| ------------- | ----- | ------- | ---------------------------- | ---------------------------------- |
| Duplex        | 9     | 9       | 0                            | 0                                  |
| Double duplex | 5     | 4       | **1 → DUPLEX** (635.5, 1253) | 0                                  |
| GFCI          | 1     | 1       | 0                            | 0                                  |
| Junction box  | 11    | 11      | 0                            | 0                                  |
| Switch        | 4     | 3       | 0                            | **1** (667.9, 1207.6, wire corner) |

- **The 2 flagged are exactly the 2 Find all matching found**, from the other
  direction and from different looks (legend vs. the plan itself): a mark
  labelled double duplex on a symbol drawn as a plain duplex, and a switch
  mark with no switch under it. **0 false alarms** on the other 28.
- **The look-alike pairs, on real marks:**
  - **Duplex vs GFCI:** the GFCI look (bottom half filled) matched only his
    one GFCI; it never claimed a plain duplex.
  - **Duplex vs half-switched:** the half-switched look (right half filled)
    matched 0 spots on E-200 — none is drawn there — and never claimed one
    of his 9 duplexes.
  - **Duplex vs double duplex:** the double-duplex look matched 4 of his 5;
    the duplex look on a double duplex is flagged "more lines run through
    it" and is not counted as a clean match.
  - **Switch vs dimmer:** **not testable on Weld 1 — no dimmer is drawn on
    any of its sheets** (E-200: 0; E-100 lighting plan: 20 switches, 0
    dimmers). They differ by the required word ("S" vs "D"). **Test it on
    UNCC, whose legend has a dimmer, before calling the pair covered.**
- **Two faults found in the measuring, not the matcher, and worth keeping:**
  a switch box that took in the superscript "a" matched nothing (§ 1); a
  half-switched box drawn too narrow became "two lines" and matched every
  duplex. **A bad look makes the check confidently wrong** — which is why the
  capture card must show what was taken (§ 1) and why a new look's matches
  stay unconfirmed (`multiple-looks-plan.md` § 4).
- **Speed:** reading both sheets 0.53–0.62 s; ~0.08–0.14 s per look per
  sheet. Eight looks over a sheet: about 1.5 s, once. No AI call.

## 6. Speed, cost, and the tests that fail without it

- **Speed:** one sheet read (~0.5–1 s) plus ~0.1 s per look; a legend of 30
  boxed looks is ~3–4 s per sheet, in the worker, with a progress line. The
  looks' own sheets are read once each and cached one at a time (memory).
- **Cost:** **$0.** No AI call anywhere in the check. (The Reader may later
  offer a second opinion on SCANS, as a priced button — not part of this
  plan.)
- **Tests that fail today** (no check exists; each is red until built):
  1. `client/src/lib` pure classifier: a mark with only its own look →
     "matches"; with only another item's clean look → "looks different" with
     that item; with both → "unsure"; with none → "nothing under it".
  2. **Flags are not matches:** a duplex look flagged "more lines run
     through it" on a double-duplex mark does NOT make that mark "unsure"
     (the 4 Weld 1 double duplexes would all turn unsure otherwise).
  3. **Filled state decides:** a hand-built plain duplex is never "looks like
     GFCI/half-switched" when those looks are half-filled; flip one segment's
     filled state and the test goes red (the matcher's own test pattern).
  4. **The check never writes:** run it over a bid with marks; every mark's
     group, x, y and every count are identical before and after (read both
     sides — CLAUDE.md "intent vs outcome").
  5. **Locked bid:** the result offers no Move/Delete; the server refuses
     both anyway (already tested for Move to).
  6. **Scan refused whole:** a sheet that is all picture returns the
     sentence and no per-mark result, even with an OCR layer.
  7. **Real-sheet regression** (script, like `findMatchingCheck.mts`): Weld 1
     E-200 against the hand count gives the table in § 5 — 28 match, 1 looks
     different, 1 nothing under it — and fails, naming the mark, if it moves.

## 7. Stored columns — for Track A's list (not numbered here)

- **Needed first, not new:** looks WITH a box — `symbol_looks`
  (`multiple-looks-plan.md` § 6), or R.11's box on the item if that is what is
  built. **Without a box there is nothing to compare a mark with**: today's
  captures store a picture only, and a picture cannot be matched against line
  work. Every item captured before then shows "no look to compare with —
  capture again" until re-boxed.
- **Optional, only if "Keep as is" must be remembered** (§ 8 Q3): one
  nullable column per mark, e.g. `takeoff_stamps.checkAcceptedAt timestamp
NULL` (NULL = never accepted), cleared when the mark is moved. Additive.
  Without it, a dismissed result comes back on the next check. **Flagged for
  A; not numbered.** For the accuracy test no column is needed — the verdict
  lives in `answer-key.json`.
- **Nothing for the results themselves:** a check is recomputed in about a
  second, so storing it would only create a copy that can go stale.

## 8. Open questions for the owner

> **DECIDED 2026-10-01 by Track C** (recommended answers; the owner asked to
> be asked only about bid numbers, money, or what cannot be undone):
>
> 1. **A button for the sheet and one for a count; nothing automatic.**
> 2. **"Nothing under it" shows a Delete button that asks first.** Deleting
>    changes a bid number, but only when the estimator presses it and
>    confirms, and it is undoable — so the CHOICE to offer the button is not
>    one of the owner's three kinds.
> 3. **"Keep as is" is remembered once a column exists; until then it is
>    remembered for the session only** (§ 7's `checkAcceptedAt`, requested
>    from A). Built that way, behind a switch that is off.
> 4. **Status words are NOTED, not raised as a disagreement**, until marks
>    have a status column.
> 5. **The two Weld 1 marks are the owner's to fix** — they are his answer
>    key, so nothing here moves them. The check raises them; he decides.

1. **Should "check my marks" run on the whole sheet by default, or only the
   count you are working on?** Recommended: a button for each; nothing
   automatic.
2. **When the drawing and your mark disagree, should the app ever suggest
   DELETING a mark** (nothing under it), or only show it? Recommended: show
   it with a Delete button that asks first — the wire-corner switch on
   E-200 is a mark with nothing under it.
3. **Should "Keep as is" be remembered,** so the same mark is not raised
   again next time? That needs one small database column (§ 7). Recommended:
   yes, once the column exists; until then it comes back each time.
4. **Status words** — should "(E)" beside a mark you counted as new be
   raised as a disagreement, or only noted? Recommended: noted, until marks
   have a status (Track A); then "counted as new, drawn as existing" becomes
   its own result.
5. **The two Weld 1 marks:** the double duplex at the top of the room near
   (635, 1253) is drawn as a plain duplex, and one switch mark near
   (668, 1208) has no switch under it. Do you want to fix them in the answer
   key now, or wait for the check to raise them on the review page?

---

## SHORT SUMMARY

- Plan to check YOUR marks: for each mark, compare what is drawn under it
  with every captured look of every item, and say "matches", "looks like
  <other item>" or "nothing under it". No AI, $0, about 1–4 s a sheet.
  Scans are refused, said plainly.
- It never changes a mark: each result has a picture, a jump-to-spot link,
  and buttons you press — Move to <better item>, Keep as is, or Delete
  (asks). Locked bids: report only.
- Measured on Weld 1 E-200 with looks boxed on its own legend sheet: 28 of
  30 marks match; the 2 flagged are the same 2 Find all matching found (a
  "double duplex" drawn as a plain duplex, and a switch mark on a wire
  corner). GFCI and half-switched looks never claimed a plain duplex.
  Switch vs dimmer can't be tested on Weld 1 (no dimmers drawn) — next on
  UNCC.
- Runs on a count, on a sheet, and in the accuracy test, where your marks
  that disagree with the drawing get their own section on the review page —
  so the answer key gets cleaned before the AI is scored against it.
- Needs looks saved WITH their box first (the looks plan); one optional
  column if "Keep as is" should be remembered. Five questions for you in § 8.

---

## 10. Variants inside a count — PLAN ONLY, added 2026-10-01 (later)

**The ask:** some hand counts may hold odd symbols brushed over, or marks
with a note beside them (a mounting height like +18 or 48", WP, a tag) that
were counted as the plain item. Find them without recounting.

**In one line:** for each count, read the words beside every mark and the
look under it, group the marks by both, and show the small groups — with a
picture, how many, and a jump to each. The estimator decides every group.
Nothing moves by itself.

### 10.1 How the marks are grouped

1. **Words beside each mark**, within about a symbol's reach (16 points on
   the test sheets), sorted into kinds — never a free-for-all of every word:
   - **mounting height**: a number WITH an inch mark or plus sign (`54"`,
     `+18`, `48" AFF`). A bare number is NOT a height (see 10.4);
   - **device words**: WP, WR, GF/GFI/GFCI, USB, IG, TR, EM, NL, F (floor) …
     — the matcher's own list (`findMatching.ts`), plus the legend's own
     words when the legend uses others;
   - **status**: (E), (X), (R) — counted, and handed to the mark-status plan
     (todo.md, Track A), never used to pick an item;
   - **tags**: a fixture tag like `(A-7)` — handed to count-by-tag (B's
     `count-by-tag-plan.md`), same reader.
2. **The look under each mark**, with the shipped matcher: take one mark's
   symbol as the template, see which marks of the count share it, repeat on
   what is left (§ 10.5 measured this). One look for the whole count is the
   normal answer.
3. **A group** is a (look, words) pair. The largest group is the count's
   "main" group; every smaller one is shown highlighted.

### 10.2 What the estimator sees, and decides

Per count, in the Counts tab ("Check this count" — a button, never on load):

> **DATA OUTLET FOR WALL MOUNTED TELEVISION — 73 marks, 5 groups**
> **66** plain ▽ · **2 with "F"** (floor) ▲ · **3** ▽ in a box · **1** ▽ in a
> circle · **1** turned at an angle — _can't tell it from the plain one_

Each group: a picture of one example, the number of marks, and jump links
(the deep link already built) to every mark in it. Per group, three choices:

- **Keep in this count** — nothing changes. Remembered only if § 7's
  optional column exists; otherwise the group is raised again next time.
- **Move to another count…** — the built "Move to…" (one request, whole
  group or nothing, one undo).
- **Split into its own count** — a new count named for the variant, prefilled
  as "<count> - <variant>" (e.g. "DATA OUTLET … - FLOOR"), then the same Move
  to. The estimator edits the name before it is made.

**Never changes anything by itself.** On a **locked bid** the groups are
shown and the three buttons are not (Move to refuses there anyway). A group
whose words are a STATUS ((E), (X)) offers "Count as existing" only once
marks have a status (Track A); until then, the twin count
(`shared/existingToRemain.ts`) through Move to.

### 10.3 Vector sheets only

The same scan rule as Find all matching (picture over 40% of the page, under
500 segments): "This sheet is a scanned picture, so its marks can't be
grouped by what is drawn beside them." On a scan, an OCR text layer is NOT
used — its words are about two-thirds right on Old Blueridge
(`plan-viewer-overhaul.md` § 9.2), which would invent variants.

### 10.4 What it cannot tell apart — said on screen, not hidden

- **A copy on an angled wall.** The matcher tries quarter turns only. On
  UNCC E111 one data outlet and 5 of 38 USB outlets sit on angled walls and
  came out as their own "look" — false variants. Shown as "turned at an
  angle — can't tell it from the main look", never offered as a split by
  default. Fix later: try the angle of the nearest wall line
  (`connect-point-plan.md` § 4 measures wall lines for its own reasons).
- **A bare number.** `21`, `2B - 9` beside a device are circuit numbers;
  `48` with no inch mark could be a height. Never read as a height without
  the mark or a legend/note saying heights are in inches.
- **Whose word is it.** "USB" beside a data outlet on E111 belongs to the
  USB device next to it (§ 10.5). A word between two devices is reported
  with both, never assigned silently.
- **Size-only differences** (a 4" vs 6" floor box drawn at different
  scales) — the matcher does not match other sizes yet.

### 10.5 Measured on the real counts, 2026-10-01 (throwaway scripts)

**Weld 1 E-200, TELECOM CABINET, FLUSH MOUNT (10 marks):** one look for all 10. By the words beside them: **5 plain, 2 with `54"`, 1 with `36"`, 2 with
"(E)"**. So 3 marks carry a mounting height and 2 are drawn as existing —
variants by note, not by symbol.

**UNCC E111, DATA OUTLET FOR WALL MOUNTED TELEVISION (73):** main look 66.
The other 7, each looked at on a render:

- **2 with "F" under the triangle** — floor-mounted data outlets. A real
  variant.
- **3 with the triangle drawn inside a box** — a combined floor box or
  poke-through. A real variant.
- **1 triangle inside a circle** — a different symbol. A real variant,
  possibly a different item.
- **1 turned at an angle** — the plain symbol on an angled wall. NOT a
  variant (§ 10.4).
- **8 with "USB" beside them** share the main look, and the USB symbol's
  look lands on none of them — they are data outlets next to a USB device,
  not miscounted USB outlets.

**UNCC E111, USB DUPLEX CONVENIENCE OUTLET (38):** every mark has "USB"
beside it. Two looks, 33 and 5 — the 5 are the same symbol on angled walls
(§ 10.4). No real variant found.

**Speed:** reading the sheet's words and line work ~1.5–2 s, then ~0.1 s per
look. No AI.

### 10.6 Mounting height as a value on each mark — for Track A

**FLAG FOR TRACK A. Not numbered here.** Additive, nullable, step 1 of the
three:

| Column                             | Type                        | NULL means                                       | Why                                                                                                                                              |
| ---------------------------------- | --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `takeoff_stamps.mountHeightInches` | `decimal(7,2) NULL`         | **follow the item's / count's height** (today's) | An override for THIS mark (54" on two telecom outlets). Unset is NOT zero — a floor box really is 0", so NULL and 0 must differ (CLAUDE.md § 6). |
| `takeoff_stamps.mountHeightSource` | `enum('typed','read') NULL` | no override                                      | "read" = taken from the drawing's text and confirmed; "typed" = entered. So a later re-read never overwrites a typed value.                      |

- **Batch it** with the mark-status column and B's per-mark
  `rotation`/`mirrored` (`connect-point-plan.md` § 5.2) — same table, same
  additive shape, one handoff.
- **Where it is used:** vertical drops (`shared/groupDrops.ts`, the count's
  drop, and `connect-point-plan.md` § 8). A mark's own height, when set,
  replaces its count's for that mark's vertical only. **Nothing prices from
  it until the drop code reads it**, and that change is its own build with
  its own test (a 54" outlet on an 18" count adds 36" of vertical, not 0).
- **Never set by a reading alone.** A height read from the drawing is
  offered; confirming it writes `read`.

**How it fits:**

- **Count-by-tag:** a tag and a height are both words beside a mark, read
  by the same pass. A tag decides WHICH COUNT; a height decides the drop of
  ONE mark — so a tag splits a count and a height never does.
- **Multiple looks:** a height is never part of a look; two looks of an item
  share heights.
- **Connect points:** the connect point fixes where the run meets the device
  in PLAN; the mounting height fixes how far it drops. They stack, as
  `connect-point-plan.md` § 8 already says.

### 10.7 Open questions for the owner

> **DECIDED 2026-10-01 by Track C, except Q1, which is the owner's:**
>
> 1. **ASKED, not decided:** splitting the E111 floor ("F") and boxed data
>    outlets into their own counts changes the numbers on his bid, so the
>    screen offers Split and he presses it — or not.
> 2. **Heights are recorded on the mark, same item** — once the
>    `mountHeightInches` column exists (requested from A). Until then the
>    height is shown as a suggestion that cannot be saved, behind a switch
>    that is off.
> 3. **A word between two devices is shown on both.**
> 4. **"Keep in this count" remembered for the session only** until the
>    column exists (same as § 8 Q3).
> 5. **Angled copies are shown as "can't tell"** until the matcher learns
>    wall angles.

1. **The 2 floor data outlets ("F") and 3 in a box on E111 — a separate count
   each, or keep them in the data count?** Recommended: split, so the floor
   boxes are priced as floor boxes.
2. **The 2 telecom outlets at `54"` and 1 at `36"` on E-200 — record the
   height on those marks** (once the column exists), **or are they a
   different item?** Recommended: record the height; same item.
3. **When a word sits between two devices, show it on both** (recommended)
   or on neither?
4. **Should "Keep in this count" be remembered?** It needs the same small
   column as § 8 Q3.
5. **Angled copies:** fine to show them as "can't tell" for now, until the
   matcher learns wall angles?
