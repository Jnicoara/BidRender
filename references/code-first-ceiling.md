# Code-first ceiling — how far plain code gets on vector plans

Track C, 2026-10-06. **Plan and measurements only: no product code, no
migrations.** The goal: find what CODE (no AI) can do on vector PDFs, so AI
is spent only on scans and tie-breaks — the standing rule in CLAUDE.md
("Manual mode is the product; AI is an accelerator").

**Where every number comes from:** `scripts/codeFirstCeiling.mts`
(`pnpm tsx scripts/codeFirstCeiling.mts <section>`; sections `layers`,
`matching`, `uncc`, `text`, `homeruns`, `schedules`, `addenda`, `scale`),
plus `scripts/findMatchingCheck.mts` and `scanMatchingCheck.mts` where
named. Re-run them before trusting a number here; if one does not match,
stop and find out why — either this file is stale or the code changed.

**Ground truth used:**

- Weld 1 E-200: the owner's 46 hand marks (7 types), sheet 234263.
- UNCC E111: the owner's 243 hand marks (sheet 234268): 108 duplex, 73 data
  outlets, 38 USB duplex, 20 junction boxes, 4 GFCI. **This count existed
  and was not used by earlier work**; it makes UNCC scorable.
- What the sheets say about themselves: their labels, their schedules.
- Old Blueridge E1.01/E1.02 (scans), 85 hand marks after the struck one.

**AI spend: $0.** No test needed a tie-break.

---

## Summary table

| Idea                          | Measured (vector)                               | Scans                     | Effort        | Track A columns                                   | Payoff                            |
| ----------------------------- | ----------------------------------------------- | ------------------------- | ------------- | ------------------------------------------------- | --------------------------------- |
| a. Symbol finding             | E-200 44/46; UNCC 227/243 (93%, best box)       | 85/85 (picture matcher)   | built         | none                                              | —                                 |
| b. Text tied to symbols       | USB **0 → 38/38**; GF **1 → 4/4**; heights 3/3  | OCR reads none: 0/73      | **small**     | `takeoff_stamps.labelWords` (or per-kind columns) | **high**                          |
| c. CAD layers                 | Weld 1: yes, tagged; UNCC: declared, not tagged | none                      | medium        | none (read at view time)                          | **high where present**            |
| d. Home runs                  | inconclusive (no truth; arrow shape unknown)    | —                         | high          | later                                             | unknown                           |
| e. Panel schedules from text  | UNCC: 3/3 panels, 42/42 circuits each           | OCR, unmeasured           | built (view)  | `bid_panels` + `bid_panel_circuits` (A's)         | **high**                          |
| f. Addenda, line by line      | identical → 0 changes; made-up → exact          | pixel diff instead        | medium        | `bid_pdfs.supersedesId`                           | high, **unproven on a real pair** |
| g. Scale from the title block | right on 4/4 vector sheets                      | wrong on the scan ("114") | built (check) | none                                              | medium                            |

---

## a. Symbol finding — today, including the line-crossing fix

**Weld 1 E-200: 44 of 46.** The 2 misses are disagreements between the
drawing and the marks (a double duplex drawn as a plain duplex; a switch
mark with nothing drawn under it) — `find-all-matching-plan.md` § 2, § 4b.
On another type's mark: 5 (1 silent). On no mark: 4. Unchanged by the
2026-10-06 line-crossing work.

**UNCC E111: 227 of 243 (93%)** — new this study, against the owner's count.
One box per type, the best of 9 tries (3 sizes round each of its first 3
marks): **an upper bound** on one person's box.

| Type                                            | Found   | Wrong                              |
| ----------------------------------------------- | ------- | ---------------------------------- |
| Duplex shape (duplex + USB duplex, drawn alike) | 138/146 | 3 on another type's mark, 0 silent |
| Junction box                                    | 20/20   | 2 on no mark                       |
| Data outlet                                     | 66/73   | 3 on no mark                       |
| GFCI                                            | 3/4     | **3 duplexes, silent**             |

- The data outlet's 7 misses are the known variants (2 "F" floor outlets, 3
  in a box, 1 in a circle, 1 at an angle — `check-my-marks-plan.md` § 10.5).
- **The 3 silent GFCI mix-ups are a TEXT failure, not a shape one:** the
  GFCI and duplex shapes match, and the "GF" that tells them apart is not
  tied to the symbol (section b). Fixing b fixes these.
- The duplex's 8 misses were not inspected; candidates are the angled-wall
  copies the matcher does not turn.

**What limits finding now:** turns other than 90°, other drawn sizes, and
the text step. Not crossing lines (§ 4b of the matching plan).

**Electrical layers only (Weld 1, section c):** identical 44/46, identical
wrong finds, **88 ms instead of 1,229 ms** for 7 searches.

---

## b. Text near symbols — can code tie each label to the right device?

Measured on the TIE step alone: devices are the hand marks (their true
positions), so this is tying, not finding.

| Label                                  | Sheet | Today's ring (~12.6 pt) | Nearest device within 24 pt          |
| -------------------------------------- | ----- | ----------------------- | ------------------------------------ |
| "USB" (41 labels, 38 devices)          | E111  | **0/38**                | **38/38**, 3 wrong                   |
| "GF" (4 labels, 4 devices)             | E111  | 1/4                     | **4/4**, 0 wrong                     |
| Heights 54" 54" 36" (truth: 3 telecom) | E-200 | —                       | **3/3**, 0 wrong                     |
| "(E)" (27 labels; truth 2 telecom)     | E-200 | —                       | 2 telecom **+ 6 duplexes + 1 J-box** |

**Why today's rule fails:** the matcher only reads a device word inside a
ring of `max(8, 0.9 × size)` around a small symbol. On E111 the USB labels
sit a **median 14.3 pt** from their device (90% within 14.5) — just outside.
So today it reads 0 of 41 USB labels and the plain and USB duplex are one
item to the matcher. On Weld 1 there is **no "GF" text at the GFCI at all**
(the only word there is "15"); a GFCI differs from a duplex only by its
filled half. `find-all-matching-plan.md` § 2's "no GFCI ('GF' beside it)"
overstated that — corrected there.

**The rule that works here:** a label goes to its NEAREST device if within
~24 pt. "Mutual nearest" (the device's nearest label is this one too) gave
nothing extra on these sheets. The 3 USB labels that went to a non-USB mark
are to look at — either 3 hand-count slips or 3 labels between two devices.

**What fails:**

- A label between two devices: unresolvable by distance. Report it on both,
  as the checker plan already decided (`check-my-marks-plan.md` § 10.4).
- Leader lines (a label away from its device, joined by a line): not
  followed; not seen on these sheets.
- **Circuit numbers are a different problem.** On E111, 162 of 243 devices
  have a "2B-nn" within 24 pt, but which number belongs to which device
  needs the wiring; on E-200 circuit tags sit on home runs (1 of 46 devices
  has one nearby).
- **Scans:** the OCR layer reads plan titles, not text inside the drawing —
  0 of 73 marks on Blueridge E1.01 have any tag or device word within 30 pt.
  On a scan this stays an AI job (the existing tie-break button).

**The "(E)" result is the useful surprise:** 6 duplexes and 1 J-box carry
"(E)" — and the same devices are on CAD layer **E-POWR-E** (section c), and
the matcher already flags **7 duplexes "drawn lighter"**. Three independent
code signals agree that most of E-200's duplexes are existing; the owner's
count has them as plain duplexes. **To check by eye before anything uses it.**

**Effort: small.** Widen the word ring to nearest-within-24 and keep the
word on the find; carry it to the mark. **Track A:** a place for the words
on a mark — `takeoff_stamps.labelWords` (text, nullable), or dedicated
`mountingHeight` / variant columns if the owner wants them priced. Status
"existing" already has its column (mark status).

---

## c. PDF layers (optional content groups)

| Set           | Layers declared | Content tagged with them             |
| ------------- | --------------- | ------------------------------------ |
| Weld 1        | 42              | **yes** — 1,130 tagged runs on E-200 |
| UNCC          | 158             | **no** — 0 tagged runs on any page   |
| Old Blueridge | 0               | (scan)                               |

**On Weld 1 E-200 they sort the sheet for free:**

- **92% of the line work is the architect's background** — A-BLOCK alone is
  66,530 of 96,540 segments. The electrical layers together: ~3,100.
- **E-POWR-D is the demolition plan:** 1,071 of its 1,110 segments are in
  plan B. Today the demolition plan is found by its title on scans and not
  at all on vector sheets.
- **E-POWR-E is "existing":** the 7 lighter duplexes are on it (section b).
- **E-TLCM is telecom**, almost all in the security plan.
- Matching on the electrical layers alone: same 44/46, **14× faster**.

**What fails:** UNCC declares layers and does not use them, so this is a
per-file bonus, never a dependency. Layer names are the engineer's
(E-POWR, E-PWR-EXST, E-POWER-DEMO…): mapping them is a short name table
plus "ask once" — never a guess.

**Effort: medium.** Tag each segment with its layer in
`extractVectorGeometry` (one stack walk, measured here), a layer filter in
the viewer, and "demolition / existing" proposals from layer names.
**Track A: none** — read at view time.

---

## d. Home runs — arrows, tick marks, circuit tags

**Inconclusive, and said so.** 83 (E-200) and 149 (E111) filled-triangle
arrowheads are detected, but **no** circuit tag sits within 15 pt of one —
either these sheets draw home-run arrows open (stroked) or the arrowheads
found are something else. Tick strokes come mostly single (hatching
noise). There is no ground truth for home runs on any sheet.

**Next step if wanted:** the owner marks 10 home runs on E111 (tag, wire
count); then measure. Until then no build estimate is honest. **Effort:
high.**

---

## e. Panel and fixture schedules, read as tables from the PDF text

**UNCC E003: 3 of 3 panel schedules read, 42 of 42 circuits each, none
missing**, with breaker (`20/1`) and description on every row that has one
(blank on spares and spaces, correctly). The table is found by its own
header row — two `CKT.` columns with BRKR / WIRE / COND beside them — and
every row read off those columns.

**What fails:**

- **The panel's NAME is not in the text layer** next to its table. Without
  it, the plan's circuit tags (174 "2B-nn" on E111) cannot be checked
  against the schedule. One click from the person, or an AI tie-break.
- **Weld 1 E-003 has no table of this shape** (0 found) — schedule layouts
  differ by engineer, so this is a reader per layout family, not one reader.
- Fixture schedules (UNCC E004): not attempted; same method.

**Payoff:** circuit count, breaker sizes and descriptions are bid lines
today typed by hand. **Effort: medium.** ~~Track A: `panel_schedules`
(bid_pdf, sheet, name) and `panel_circuits` (number, breaker, poles,
description, load).~~

> **Built 2026-10-06, read-only** (`@/lib/panelSchedules`, a "Schedules"
> view on the sheet; `codeFirstCeiling.mts schedreader` re-measures), and
> two things above were WRONG:
>
> - **The name IS in the text — below the table, not above it** ("EXISTING
>   PANEL 2B", under the summary block). The study looked above. Read now:
>   **2A, 2B, 2HA**, each 42/42, with supply, mains, fed-from and the
>   connected / demand totals. With the name, E111's circuit tags check
>   against the schedule: **173 of 174 land on a described circuit of the
>   panel they name** (was 0 — no name to match). "FED FROM PANEL 2HA" is
>   the panel upstream, and is not taken as the name.
> - Fixture schedules were attempted: **UNCC E004, 6 of 6 types** (A1, A2,
>   A3, C1, EXC, UC), wrapped descriptions joined, watts read.
>
> Also measured: descriptions read **37 / 41 / 40 of 42** (the rest are
> spaces with nothing printed); an even side lost its first word until the
> view was looked at ("- CORR, 213" for "REC - CORR, 213"). **weld2's three
> PANELBOARD SCHEDULES sheets carry no text at all** (about 44 words each —
> the title block), so code cannot read them; that would be OCR or AI.
> Weld 1 E-003 and the Blueridge scans: none found, as before.
>
> **Track A: one table, not two** — A's clash 5 picked `bid_panels` + a child
> `bid_panel_circuits`; the columns the reader fills are in `todo.md`
> § "Track A next migration batch" (Panel schedules). `panel_schedules` /
> `panel_circuits` are withdrawn.

---

## f. Addenda — what changed, line by line

Every segment quantised to 0.25 pt and the two sheets' sets compared:

- **The same sheet twice: 0 changes** (no noise).
- **E-200 with 3 duplexes deleted and 1 moved 20 pt (made on purpose):**
  removed at the right places, added at 1 place.
- **No real old/new pair exists in the test set.** UNCC ED111 vs E111 share
  only 15% of their line work — already aligned (best shift 0, 0), they are
  simply different drawings, not versions.

**Payoff:** high — clouds miss changes, and a missed change is a wrong bid.
**Unproven on a real pair:** a re-export can shift everything by a fraction
of a point, which this method would call "everything changed". **Needs: one
real addendum pair from the owner** before building. **Track A:**
`bid_pdfs.supersedesId` (which upload replaces which).

---

## g. Scale — from the title block, checked against a dimension

`detectScaleFromText` (already shipped) reads the right scale on **4 of 4
vector sheets** (E-100 1/4", E-200 1/8", E111 1/4", E121 1/4") at "medium"
confidence. **On the Blueridge scan the OCR reads "SCALE 114"** and nothing
is detected.

**Checking against a dimension mostly cannot be done on electrical
sheets:** they carry almost no dimension strings (1–3 per sheet, and those
are `1'-0"`). ~~The scale bar is the check to build instead.~~

> **Corrected 2026-10-06, when it was built.** Those `1'-0"` strings are the
> scale NOTES ("1/8" = 1'-0""), not a scale bar's labels: measured, **no test
> sheet has a drawn scale bar or a dimension line** (Weld 1, UNCC). A bar
> check would have had nothing to run against. What every floor plan does
> carry is door swings — quarter circles 30–44" in radius — so the check
> built is `@/lib/scaleCheck` against those, with the sheet's stated scale
> as tie-breaker. Measured (`codeFirstCeiling.mts scalecheck`): set 2x off
> either way on Weld E-200 / E-100 and UNCC E111 / E121 / ED111, **12 of 12
> caught with the right suggestion**; at the true scales it agrees, except
> **Weld 1 E-100, whose "1/4"" note disagrees with its own doors** (71 swings
> read 18"; same 27 pt radius as E-200 at 1/8") — a real catch, for the
> owner to confirm. Scans (Blueridge): no line work, so it says plainly it
> cannot check. Shown amber beside the scale, one click to apply, "Keep" to
> leave it; never applied by itself.

**Track A: none.**

---

## h. Other places code beats AI on vector plans

- **Counting by text where the symbol is a word** (a "J", an "S"): the
  matcher already does this; exact.
- **Room names and numbers** from the text layer for location tagging
  (UNCC declares A-ANNO-ROOM-NAME / -NUMB; untagged, but the words are
  there). Not measured.
- **Sheet numbers and titles** — already read at upload (§ 17.4).
- **Traced lengths** with a known scale — already built; exact by
  construction.
- **Consistency checks AI would only guess at:** every circuit tag on a
  plan exists in its panel; every legend symbol is used; every device on
  E-POWR-D sits in a demolition plan. Cheap once b, c and e exist.

---

## Ranked by payoff (accuracy gained on real bids ÷ effort)

1. **Tie labels to devices (b).** Small effort. On E111 it turns 0/38 USB
   and 1/4 GF into 38/38 and 4/4, removes the 3 silent GFCI→duplex
   mix-ups in (a), and reads heights (3/3) and "(E)". USB duplex and GFCI
   are different prices, so this is a wrong-price fix, not a nicety. Needs
   one Track A column for the words on a mark.
2. **Use CAD layers when the file has them (c).** Medium effort, no
   columns. Demolition, existing and telecom sorted with no reading, and a
   14× faster search — on files that keep layers (Weld 1 yes, UNCC no).
3. **Read panel schedules from the text (e).** Medium effort. 42/42
   circuits per panel on UNCC, breakers and descriptions included — bid
   lines typed by hand today. The panel name is one click. Needs two Track
   A tables.
4. **Scale bar check (g).** Small, mostly built; catches a wrong scale,
   which multiplies every length.
5. **Addenda line diff (f).** High payoff, but get one real pair first.
6. **Home runs (d).** Measure with a marked sheet before deciding.

**Where AI stays:** scans (no line work, OCR misses the drawing's text), a
label between two devices, which panel a schedule is, and a layer name
nobody has mapped — each a button, never automatic.

## What this does NOT claim

- UNCC's 93% is a best box, not a typical one.
- The "(E)" / E-POWR-E reading of E-200's duplexes is unverified by eye.
- Nothing here was built; every effort estimate is a plan.
