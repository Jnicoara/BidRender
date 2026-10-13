# Plan-reading help, no AI — PLAN ONLY, 2026-10-12 (Track B)

**Status: STEPS 1–3 BUILT on track-b (2026-10-12/13, owner's go); steps
4–6 not started.** All 11 picks in § 9 approved. No migration. Not merged to
local-dev (frozen until the live release). Step 1 notes are in § 7.

**The ask (owner, 2026-10-12):** before beta, help a person read a plan set
without any AI: an abbreviation lookup (WP, AFF, EM, GFI, HR…), a symbol
guide that says what each thing is and how it is usually bid, a "What is
this sheet?" card (lighting, power, panel schedule, one-line, fixture
schedule, notes), a tap on a keyed note that shows the note's text, detail
links ("3/E5") that jump to the detail, and tips the first time the screen
opens. **The reader is a self-taught electrician in a small shop.** Keep the
main screen to the basic path; extras go under "More options".

**The short answer:** all six pieces ship with **no migration**. Four of them
(lookup, symbol guide, sheet cards, tips) are written content plus small pure
functions and can go first. The two that read the drawing (keyed notes,
detail links) are code reading the sheet's own text, using the positioned
words the PDF worker already gives the schedule reader, and go last because
keyed notes need the closed-square test that
`legend-and-notes-automation-plan.md` § 7 step 3 already planned and never
built.

---

## 0. Decisions this cites (searched before writing)

Searched `references/`, `todo.md` and `CLAUDE.md` for: abbreviation,
keynote / keyed note, detail, sheet type / sheet kind, guide, tips, first
open, More options. What already decides something here:

| Decision                                                                                      | Where                                                       | How this plan stands                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never spend an AI call the user did not ask for. Manual mode is the product.                  | CLAUDE.md § AI features                                     | Kept, and stricter: **nothing here calls a model at all.** Works with `DISABLE_AI_FEATURES=true` and on an account with no Reader tab.                                        |
| The app suggests, the estimator confirms.                                                     | `plan-viewer-overhaul.md` § 5c                              | Kept: help never counts, prices, tags or fills anything. It explains. The one button that acts ("Count these", § 3) is an ordinary new count the person starts themselves.    |
| Keynote tags need a real closed-square test; numbered notes need a line-joining parser.       | `legend-and-notes-automation-plan.md` § 1, § 7 steps 3–4    | **This plan is the first user of both.** Built here as steps 5a/5b (§ 7), to that plan's spec and its red test (E-200: notes 1–18, any tag above 18 is a fault). Noted there. |
| Simple by default, deep when asked; the fold ships before the list needs it.                  | CLAUDE.md § "Customization available, but never in the way" | The basic path is three things (§ 1). Everything else sits behind ONE "More options".                                                                                         |
| As manual or as automated as the user wants; no nagging toward the library.                   | CLAUDE.md                                                   | Help works for somebody who has never opened the library. "Count these" makes a plain count; it never asks for an assembly first.                                             |
| The Plans panel is tabs, one at a time; the Reader tab exists only where the reader does.     | `lib/panelTabs.ts`, `track-b-phone-and-readability-plan.md` | No new tab (§ 1, Q1). Lookup lives in the Legend tab, which exists for everyone.                                                                                              |
| The sheet's demo / new tag is set from the sheet menu's "More options", suggested from title. | `status-and-scope-plan.md` § 2a, `shared/sheetWorkTag.ts`   | Sheet kind (§ 4) reads the same title the same way (`shared/sheetTitleBlock.ts`) and, like the tag, is only ever a suggestion.                                                |
| Tablet does everything, either way round; phone gets a bottom sheet.                          | `lib/plansLayout.ts`, `device-audit.md`, `SidePanel.tsx`    | Every popover below becomes the bottom sheet on a phone; tablet keeps the side panel (§ 6).                                                                                   |
| Electrical-first, not electrical-only.                                                        | CLAUDE.md § Project                                         | All content is keyed by `trade` from day one (§ 2). Plumbing is new content files, no code.                                                                                   |
| Onboarding is tracked from data, never from page views.                                       | CLAUDE.md § Onboarding                                      | Tips are NOT checklist steps and tick nothing. Seen-state is a per-person convenience (§ 5).                                                                                  |

Nothing found that this contradicts.

---

## 1. What the person sees — the basic path, and the fold

**The main screen gains three things and only three:**

1. **A sheet-kind line under the sheet name** — "Lighting plan · what to count
   here". Shown only when the title says what the sheet is (§ 4). Tap → the
   card. Unrecognised sheet: nothing shown, not "Unknown sheet".
2. **Tapping something printed on the drawing explains it** — a keyed-note tag
   shows the note's text; a detail bubble offers "Go to detail 3 on E5". Only
   with NO tool picked up (§ 6), so counting and tracing never change.
3. **"Look up a word or symbol"** — one search box at the top of the Legend
   tab. Type `WP`, `AFF`, `HR`, `gfi`, `homerun`, `duplex`: the answer comes
   from this set's own legend first, then the built-in guide.

**Under "More options"** (one fold at the bottom of the Legend tab — the
same control the bid screen's "Who does what" card uses):

- Browse everything: all abbreviations, all symbols, all sheet kinds.
- Show tips again · Turn tips off.
- Outline note tags and detail links on the drawing (off by default — a
  dense sheet does not need forty more rings; § 9 Q8).

**Also, at no screen cost:** the existing "Copy text" tool's result box
(`TextSelect.tsx`) lists any abbreviation found in the boxed words with its
meaning. It already reads the words; this is one more line under them.

### Where each piece lives on the Plans screen

| Piece                        | Laptop                                                                  | Tablet (either way round)                 | Phone                                                |
| ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Sheet-kind line + card       | Under the sheet name in the header (beside `SheetChip`); card = popover | Same; card = popover sized for touch      | In the bottom sheet's title row; card = bottom sheet |
| Look up                      | Legend tab, top                                                         | Legend tab, top                           | Legend tab (bottom sheet)                            |
| Symbol guide                 | Inside Look up's answers, and under More options → All symbols          | Same                                      | Same                                                 |
| Keyed note / detail tap      | Popover at the tag                                                      | Popover at the tag                        | Bottom sheet                                         |
| Tips                         | Anchored to the control they describe, one at a time                    | Same, and never over the drawing's centre | Bottom of the screen, above the panel                |
| "Back to E2.01" after a jump | A pill at the top of the drawing                                        | Same, 44 px tall                          | Same                                                 |

---

## 2. Abbreviation lookup

**Content, not code.** `shared/planHelp/abbreviations.ts`, one entry per
abbreviation:

```ts
{ trade: "electrical", abbr: "WP", spellings: ["W/P", "WP"],
  means: ["Weatherproof"],
  plain: "Rated for outdoors or wet spots.",
  forTheBid: "Use a weatherproof (in-use) cover and a WR / GFCI device." }
```

- **More than one meaning is listed, all of them, with the clue that tells
  them apart** — `EM` is emergency (beside a fixture tag) and sometimes
  "electrical metallic"; `HR` is home run on a plan and hour in a schedule;
  `TYP` means the note applies to every one like it, which changes a count.
  A guide that picks one meaning for an ambiguous abbreviation states a wrong
  thing in a confident voice — the fault CLAUDE.md is built against.
- **"forTheBid" is words, never numbers.** No hours, no prices (§ 9 Q6): a
  number in a help card is a number nobody chose, and it would be bid.
- **The set's own legend wins.** If this set's legend (`bid_pdf_legend_entries`
  read by "Whole legend", or the sheet text) defines the abbreviation, Look up
  shows that first, labelled "This set's legend", and the guide second,
  labelled "Usually means". Drawings disagree with each other; the drawing in
  front of the person is the one that is right for this job.
- **Search** reuses `smartSearch` normalising (case, dots, slashes: `W.P.`,
  `w/p`, `wp` are one query). Abbreviation matches rank above words.
- **First list:** about 120 electrical terms, drafted by B, reviewed by the
  owner before it ships (§ 9 Q5). Must include at least: AFF, AFG, AHU, ATS,
  BKR, C (conduit), CB, CKT, CU, DISC, DP, EC, EM, ETR, EWC, EX / (E), F
  (floor), FA, FACP, GFCI / GFI, GND, HOA, HR, IG, J-box / JB, KO, LV, MCB,
  MCC, MDP, MLO, NIC, NL, NTS, OC, OFCI / OFOI / CFCI, PNL, RECPT, (R), SPD,
  SWBD, TC, TTB, TYP, UON, UNO, VFD, WP, WR, (X), XFMR, XP.

**Test:** `shared/planHelp/abbreviations.test.ts` — no two entries share a
spelling (case- and dot-insensitive, so `W.P.` and `WP` collide), every entry
has a meaning and plain words, no `forTheBid` contains a digit followed by
`h`, `hr`, `$` or `%` (the "no numbers" rule with a red to go to).

## 3. Symbol guide — "what it is / how it's usually bid"

`shared/planHelp/symbols.ts`, one entry per common symbol:

- **name** and the names it goes by ("duplex receptacle" — "plug", "outlet");
- **picture**: a small drawn SVG of the COMMON way it is drawn, with the line
  "Drawn differently on every set — this set's legend wins". Drawn and then
  **looked at at the size it ships (about 32 px), not at 72 px** (CLAUDE.md:
  two icons read as a plug and a bowtie at 14 px);
- **what it is**, one or two sentences;
- **how it's usually bid**: counted each / measured by the foot, and the
  usual pieces in words (box, device, plate, a whip or wire to the next
  device). No hours, no prices (§ 9 Q6);
- **look out for**: the subscripts that change it — `WP`, `GFI`, `+48"`,
  `(E)`, a `F` for floor, a number for the circuit.

**One action: "Count these".** It starts an ordinary new count named for the
symbol, exactly as typing the name would (level 1 — no library entry, no
assembly needed). It does not search, place or guess marks; Find all matching
is still the person's own button. On a locked bid the button is not there.

**Linking to the library, optional both ways:** if the company's library (or
the starter) has an assembly whose name matches, the entry says "Your library
has: Duplex receptacle" with nothing else to click. Nothing prompts anyone to
build one.

**First list:** about 40 symbols — receptacles (duplex, quad, GFCI, WP,
240 V, floor), switches (single-pole, 3-way, 4-way, dimmer, occupancy),
fixtures (2x4, 2x2, downlight, strip, wall pack, exit, emergency, pole),
boxes (j-box, floor box), equipment (panel, disconnect, motor, transformer,
contactor, time clock), systems (data, phone, TV, fire alarm devices,
smoke), home run arrow and its hash marks, conduit up / down. B drafts;
owner reviews (§ 9 Q5).

**Test:** each entry's `trade` is set; each "Count these" name is not a
renamed catalog spelling (`RENAMED_BASELINE_MATERIALS`); no digits-with-units
in "how it's usually bid".

## 4. "What is this sheet?" cards

**Recognising the kind:** `shared/planHelp/sheetKind.ts`,
`sheetKind(title, sheetNumber)` → one of the kinds below or `null`. **Title
words decide; the sheet number only breaks a tie**, because numbering
schemes differ from firm to firm (`E1` is lighting on one set and power on
the next). Uses the title `shared/sheetTitleBlock.ts` already reads and
`bid_pdf_sheet_identity` already stores — no new reading.

| Kind             | Title words (any)                             | Card: what to do here                                                                                                   |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Notes and legend | GENERAL NOTES, LEGEND, SYMBOLS, ABBREVIATIONS | Read first. Set the legend from here (Legend tab). Nothing to count; notes here can change counts on every other sheet. |
| Lighting plan    | LIGHTING                                      | Count fixtures by type tag (A, B, EM…) and switches. Home runs and switch legs are runs.                                |
| Power plan       | POWER, RECEPTACLE, DEVICE                     | Count receptacles and equipment connections; trace or measure home runs.                                                |
| Panel schedule   | PANEL SCHEDULE, PANELBOARD                    | Breakers, panel sizes, feeders. Nothing on the floor plan; open "Schedules" to read it laid out.                        |
| One-line / riser | ONE-LINE, ONE LINE, SINGLE LINE, RISER        | Feeders and gear: what feeds what, wire and conduit sizes. Lengths come from the floor plans, not here.                 |
| Fixture schedule | FIXTURE SCHEDULE, LUMINAIRE SCHEDULE          | What each fixture tag is. Use it to name your fixture counts; open "Schedules" when the reader found one.               |

Also recognised (§ 9 Q9, recommended yes): **Demolition** (same words as
`suggestedWorkTag`, and the card points at the sheet's demo tag in More
options), **Details**, **Site**, **Systems** (fire alarm, data, low voltage).

- **A sheet with several kinds** (a "POWER AND SIGNAL PLAN", a schedules
  sheet with both panel and fixture schedules) shows the first and lists the
  rest on the card. Never guesses one and hides the other.
- **Nothing is stored** in v1 (§ 9 Q4). The kind is recomputed from the
  title, which is already stored. A wrongly-read title that the person
  corrects already flows through.
- **Fixture and panel schedule cards point at the existing `SchedulesView`**
  when the reader found a schedule on the sheet; they do not repeat it.

**Test:** `sheetKind.test.ts` over the real titles of the sets on hand — Old
Blueridge (E0.01 is notes/legend, no scale), Weld 1 (E-001, E-200), UNCC
(E111) — plus a "POWER AND SIGNAL" and a "LIGHTING DEMOLITION" title, and a
title that should return `null`. Take the titles from the database, do not
type them from memory (CLAUDE.md § a number that can be measured).

## 5. Tips the first time the Plans screen opens

**Four tips, one at a time, each pointing at the control it is about,**
shown the first time a person opens a bid's Plans screen:

1. "Start with the notes sheet" — on the sheet list, pointing at the sheet
   `sheetKind` called Notes and legend (skipped if none was found).
2. "This line says what the sheet is. Tap it for what to count." — the
   sheet-kind line.
3. "Tap a note number or detail bubble on the drawing to read it." — only
   on a sheet where at least one was found.
4. "Don't know a word? Look it up here." — the Legend tab's search.

Each has **Next** and **No more tips**. Closing one is not a "no".

- **Never over the drawing's centre and never while a tool is picked up.** A
  tip that covers what the person is about to tap has cost them a tap.
- **Seen-state: per person, in this browser** (`localStorage`, key
  `bidrender.plans.tipsSeen`, try/catch, renders fine without storage) — a
  convenience per CLAUDE.md § browser storage. Cost: a person on a laptop and
  a tablet sees them twice. An account column fixes that (SQL H1, § 8) and is
  NOT needed to ship (§ 9 Q3).
- **Existing users see them once too** (§ 9 Q10): the pieces are new to them.
- **Tips tick nothing** on the getting-started checklist.

**Test:** the tip sequence is a pure function in `client/src/lib/planTips.ts`
(`nextTip(seen, sheetState)`) — skipping tip 1 when there is no notes sheet,
skipping tip 3 when nothing tappable was found, nothing at all after "No more
tips".

## 6. Taps on the drawing — keyed notes and detail links

### How a tap is told apart from everything else

- **Only with no tool picked up.** With a count, trace, capture or copy-text
  tool armed, a tap does what it does today. That is the whole guarantee
  that counting never changes.
- **A tap, not a drag:** the existing `dragThreshold.ts` test
  (`DRAG_THRESHOLD_PX`). Do not write a second one.
- **The target is at least 32 screen px** around the tag at any zoom, so a
  finger hits a 3 px tag at 19% zoom. (The overlay sits inside the zoom
  transform — `shared/takeoffMarks.ts`'s table — so the target is sized in
  screen pixels, measured, not assumed.)
- **The popover stops propagation** on pointer down, by construction
  (CLAUDE.md: write the guard, not the comment saying it is not needed).
- On a laptop the cursor changes over a tag. On a tablet nothing is drawn
  unless "Outline note tags and detail links" is on (§ 1).

### Keyed notes

**What is found:** a number (or letter) inside a small closed square,
hexagon or circle on the sheet, and the numbered note list on the same sheet
("KEYED NOTES", "WORK NOTES", "SHEET NOTES") with each note's text joined
across its printed lines.

- Needs the two pieces `legend-and-notes-automation-plan.md` § 7 planned:
  **the closed-square test** (a quick rule found 69 tags on E-200 where the
  notes stop at 18) and **the line-joining notes parser** (each printed line is
  a separate text piece; a rough pass found 1 of 18). Both pure, in
  `client/src/lib`, run in the PDF worker on the words it already reads for
  `panelSchedules` (`ScheduleWord`: text, centre, height).
- **A tag is only offered if its number is in the note list.** A "7" with no
  note 7 is a circuit number, a room number or a grid bubble, and is ignored.
  This is the same check the legend plan uses as its red test.
- **The popover:** "Note 7" and the note's text as printed, plus "On this
  sheet" and a button to scroll the drawing to the note list. Nothing else.
- **Note not on this sheet:** "Note 7 — not found on this sheet. Notes are
  often on the notes sheet (E0.01)" with a button to it, when `sheetKind`
  found one.
- **Run when a sheet opens, in the worker, $0, nothing saved.** Measured
  first, not assumed: the legend plan read E-200's text in about 1.5 s; the
  new parsers must be timed on the largest sheet on hand before they are
  allowed to run on open rather than on first tap.
- **Scanned sheets** (`bid_pdf_sheet_text.hasTextLayer = false`): no taps,
  and tip 3 is skipped. Look up still works by typing.

### Detail links ("3/E5")

**What is found:** a detail or section reference — a split bubble with a
number over a sheet number, or the text `3/E5`, `3/E5.01`, `DETAIL 3, SHEET
E5`.

- **A reference is a link only if the sheet number EXISTS in this set**
  (`bid_pdf_sheet_identity.sheetNumber`, compared ignoring dots, dashes and
  case). This is what keeps `3/4` (a conduit size) and `1/2"` from becoming
  links — unless a sheet called "4" exists, which the test must cover.
- **Tap → popover, not a jump** (§ 9 Q2): "Detail 3 on E5.01 — Go". A jump on
  touch would fire on every accidental tap while panning.
- **Go** opens that sheet and, if a detail title "3" is found on it (a
  number in a circle beside an underlined title, the biggest text near it),
  zooms to it; otherwise opens the whole sheet with "Detail 3 is on this
  sheet — not located". Never zooms to a guess.
- **Back:** a "Back to E2.01" pill at the top of the drawing, returning to
  the same sheet, zoom and position. One level of history only; a second jump
  replaces it.
- The jump reuses the sheet-change path the sheet list already uses, so
  whatever is queued (marks being sent) is flushed exactly as a sheet change
  flushes it today — read that path before trusting this sentence
  (CLAUDE.md, "a comment claiming that something else handles it").

**Tests:** `keyedNotes.test.ts` (E-200's words: tags found are 1–18 only;
notes joined into 18 texts), `detailRefs.test.ts` (a reference to a missing
sheet is not a link; `3/4` with no sheet "4" is not a link and WITH one is;
`3/E5.01` matches a sheet stored as `E-5.01`). Words for these fixtures come
from the real sheets via a script, not hand-typed.

---

## 7. Build order — smallest useful piece first

1. **Abbreviations + Look up** in the Legend tab, plus the Copy text line.
   Content and one search; nothing reads the drawing.
   **DONE 2026-10-12 (track-b).** `shared/planHelp/abbreviations.ts` (136
   entries, `ABBREVIATIONS_REVIEW.status = "draft"` until the owner has
   read it — Q5), `shared/planHelp/lookUp.ts` (search, this set's legend
   first, abbreviations in Copy text's words), `PlanLookUp.tsx` (box at the
   top of the Legend tab; the tab's ONE "More options" fold at the bottom,
   holding "All abbreviations" today). Differences from the text above,
   on purpose: the test is `server/planHelpLookUp.test.ts`, because vitest
   does not run `shared/**` tests; the normalising is `planWordKey` in
   `lookUp.ts`, not smartSearch's (shared code cannot import the client
   lib); "for the bid" forbids ANY digit, `$` or `%`, stricter than the
   unit list; legend answers are shown, not clickable — help never counts
   (the legend row below still does). In Copy text, an abbreviation is
   only taken when printed in capitals, and a one-letter one only in
   brackets (`(E)`, never a bare `C` or `F`).
2. **Symbol guide** inside Look up, with "Count these".
   **DONE 2026-10-13 (track-b).** `shared/planHelp/symbols.ts` (38
   symbols, `SYMBOLS_REVIEW.status = "draft"` until the owner has read it —
   Q5): picture as a few shapes on a 32 x 32 grid (looked at as a contact
   sheet at real size; Downlight redrawn as two rings because it matched
   "conduit turning up"), what it is, how it's usually bid (no digits), look
   out for. Look up shows "What it looks like" beside "Usually means";
   whichever the query names exactly leads (`answerOrder`: WP → the
   abbreviation, plug → the symbol, both → the picture). "Your library has:
   …" names assemblies whose name holds the symbol's, nothing to click.
   **"Count these" names the count in the PLURAL** ("Duplex receptacles",
   `countName`) — on purpose: the singular names ("Duplex receptacle",
   "GFCI receptacle", "Single-pole switch", "Floor box"…) are retired
   catalog spellings in `RENAMED_BASELINE_MATERIALS`, which this section's
   test rule forbids, and a count of many is plural anyway. Runs (home run,
   conduit run, conduit up/down) have no button: traced, not counted. Not on
   a locked bid. More options gained "All symbols" (tap a row for its card).
   Test: `server/planHelpSymbols.test.ts`.
3. **Sheet-kind line + cards.**
   **DONE 2026-10-13 (track-b).** `shared/planHelp/sheetKind.ts`
   (`sheetKinds(title)`, ten cards, `SHEET_KINDS_REVIEW.status = "draft"` —
   the card words are B's draft too, so they go to the owner with the
   lists, Q5); `SheetKindLine.tsx` (the line + card; popover on laptop and
   tablet, a sheet along the bottom on a phone); the Legend tab's More
   options gained "All sheet kinds" and a switch "Say what each sheet is,
   beside its name" (ON by default, this browser, `@/lib/planHelpPrefs`).
   Differences from § 4, on purpose:
   - **The sheet number is not used**, not even as a tie-break: the rules
     never tie, and a number deciding anything would be a guess.
   - **Lead order:** demolition first; on a "... PLAN" the drawing kinds
     (lighting, power, systems, site) in title order; then the rest in title
     order. **A drawing word in a title that is not a plan, beside another
     kind, is dropped** — "LIGHTING CONTROL DETAILS" is details, "EXISTING
     POWER RISER DIAGRAM" is a one-line (neither has things to count).
     "SPECIFICATION(S)" counts as notes; "SIGNAL" as systems.
   - **The title is `sheetDisplay(...).title`**, the one the chip shows, not
     `bid_pdf_sheet_identity` alone — a typed title wins, as everywhere.
   - **Where it sits:** after the sheet's "…" menu. On a tablet it goes
     just before the bar's last group (scale, zoom), because beside the chip
     it pushed a control onto a new row (iPad portrait 209 → 259 px; now
     209 → 209). **Still costs a row on iPad landscape (107 → 157) and phone
     425 (107 → 157)** — both bars were already full; no free spot exists.
     The switch is the way out; owner may prefer it hidden on phones.
   - The phone sheet is the ordinary dialog moved to the bottom, not the
     side panel's title row — the panel is closed while the drawing is.
   - Old Blueridge stores no titles, so the fixture bid shows no line; looked
     at on "Sheet numbers check" (weld1, uncc, colusa, weld2).
     Tests: `server/planHelpSheetKind.test.ts` (43, titles read from the
     database; guards shown red: a digit in a card, the not-a-plan rule),
     `client/src/lib/planHelpPrefs.test.ts`.
4. **Tips** (needs 1–3 to point at).
5. **Taps on the drawing:** 5a closed-square tags + 5b notes parser
   (the legend plan's steps 3–4), then 5c keyed-note popover, then 5d detail
   links and Back.
6. **More options:** browse all, outlines toggle, tips again / off.

Each step: tests in `shared/` or `client/src/lib`, then **looked at** on a
laptop and both iPad sizes on the "Bar layout check" fixture bid (Old
Blueridge E0.01 is exactly the notes-and-legend sheet), with the reader off
AND on, since the Reader tab changes the panel's height.

## 8. Migrations — none needed to ship

**Everything in §§ 1–7 ships with no migration.** Content is code; sheet kind
is recomputed from the stored title; note and detail findings are recomputed
per sheet open; tips are browser storage.

> **Owner, 2026-10-12: Q3 and Q4 went to the no-migration picks, so H1 and
> H2 below are NOT wanted now.** Nothing for Track A to apply. The drafts are
> kept only so that a later change of mind starts from them.

**Two add-only drafts for Track A, ONLY if the owner picks the account-side
answer in § 9 Q3 / Q4.** Both step 1 (additive, nullable, no default, old
code ignores them):

```sql
-- H1: tips follow the person across devices (only if Q3 = account)
ALTER TABLE `users` ADD COLUMN `planTipsDoneAt` timestamp NULL;

-- H2: the person can set a sheet's kind when the title does not say it
--     (only if Q4 = let them pick). NULL = not set, read from the title.
ALTER TABLE `bid_pdf_sheets`
  ADD COLUMN `sheetKind` enum('notes','lighting','power','panelSchedule',
    'oneLine','fixtureSchedule','demolition','details','site','systems') NULL,
  ADD COLUMN `sheetKindSource` enum('user') NULL;
```

Not numbered — A numbers them. H2's enum must match `sheetKind.ts`'s list
when written; a test should compare the two (as `scheduledBackup.test.ts`
compares the cron strings).

**Not drafted, deliberately:** a table for a shop's OWN abbreviations (§ 9
Q7). Later, if asked.

## 9. Questions for the owner — my pick first

> **ANSWERED, owner, 2026-10-12: all 11 picks approved as written.** So:
> Look up in the Legend tab; detail link is a popover with "Go"; tips
> remembered in this browser only; sheet kind shown from the title, nothing
> saved; **Q5 — B drafts the abbreviation and symbol lists and the owner
> reviews both before beta** (they do not ship unreviewed); no numbers in
> "how it's usually bid"; a shop's own abbreviations later; outlines off by
> default under More options; Demolition, Details, Site and Systems added;
> existing users see the tips once; "Count these" starts a plain count.
> No migration is needed for any of it (§ 8).

1. Where does Look up live? **Pick: the Legend tab's top (no new tab)**; or a new Help tab.
2. Detail link on tap: **Pick: a popover with "Go"**; or jump straight away.
3. Tips seen-state: **Pick: this browser only, no migration**; or the account (SQL H1).
4. Sheet kind: **Pick: shown only when the title says it, nothing saved**; or let the person pick and save it (SQL H2).
5. Content: **Pick: B drafts the abbreviation and symbol lists, you review before beta**; or you supply the lists.
6. Numbers in "how it's usually bid": **Pick: none — words and parts only**; or typical hours, tagged as examples.
7. A shop's own abbreviations: **Pick: later, not before beta**; or now (needs a table).
8. Outlines on note tags and detail links: **Pick: off by default, under More options**; or always on.
9. Sheet kinds beyond your six: **Pick: add Demolition, Details, Site, Systems**; or only the six.
10. Tips for existing users: **Pick: everyone sees them once**; or new accounts only.
11. "Count these" on a symbol: **Pick: yes, starts a plain count named for it**; or explain only, no button.
