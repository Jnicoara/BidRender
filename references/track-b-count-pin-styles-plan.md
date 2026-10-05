# Track B — count pins you can tell apart: shape, letter, color, status

> **STEP 1 SHAPES BUILT 2026-10-01 (Track B), no migration.**
> `shared/deviceFamily.ts` puts § 2's family map in code. Each count's
> `PinStyle` now carries its shape, so two items on one assembly can differ
> in shape as well as letter and colour. The sixth shape, `rect`, was looked
> at on screen at 10–26 px beside a square and reads apart from it. Letters
> fit inside it.
>
> **Departs from § 2:** the count's OWN name decides the family first, then
> the assembly's name, then its category. It is not category-first, because
> § 11.4 makes the item what a pin follows. The "LED flat panel" case is
> handled by the order of the words instead.
>
> **Fixed:** safety switch / disconnect → DS (decision 4). The screen check
> caught "Data outlet" reading R2 on a data triangle, so the data words now
> sit above the receptacle words. A test now checks the letter table against
> the family map.
>
> **Not built:** chosen looks (§ 6), status (§ 7), ring at reading zoom (§ 4),
> faint marks, the CSV column. The seam is the "NOT BUILT" block in
> `shared/pinLetters.ts`; the follow-up is in `todo.md`.
>
> **FINAL PLAN, 2026-10-01. §§ 1–10 were not built when written; § 11 is (see its box).**
> Written on `track-b` from the owner's request the same day. **All twelve
> decisions in § 10 are DECIDED** — the owner delegated them to Claude's
> judgment, asking to be consulted only on anything that changes a bid number
> or cannot be undone. None of the twelve does: every one is how a pin LOOKS,
> and a look is computed or stored in nullable columns that can be cleared.
> **§ 12 is the exact column list for Track A** (pins, mark status and the
> connect point), checked against `drizzle/schema.ts` on `local-dev` the same
> day. **§ 11: several captured items linked to one assembly** — decisions
> 13–18 are there.
>
> **What this builds on, so nobody re-decides it (CLAUDE.md § "Where
> decisions live"):**
>
> - `references/plan-viewer-overhaul.md` § 5e (2026-09-18): marks are drawn
>   by the GROUP (the count), five shapes, six colors, nothing stored; marks
>   are **clamped to 10–26 px on screen** (measured — the overlay sits inside
>   the zoom); **"triangles are lighting"**; and **the captured legend image
>   was rejected as the pin, by name**. This plan **overrides the shape map**
>   and **keeps the legend-image rejection** — § 5e gets a line saying so.
> - `shared/takeoffMarks.ts`: `MARK_SHAPES`, `MARK_COLORS`, the reserved
>   colors (conduit yellow, cable green, reader emerald), and **run-type
>   colors (T14 + Part B, 2026-09-26/27)**: assigned in first-use order per
>   bid, a CHOSEN color stored on the type row wins everywhere, editing a
>   shipped type forks it. **Count colors copy that model** (§ 5).
> - The app's visual language, already on the drawing: **dashed = provisional**
>   (pull points "LB?", reader proposals, suggested runs), solid = accepted
>   (`TraceLayer.tsx`). § 7 and § 8 are built on it.
> - `todo.md` (Track C, 2026-10-01): **mark status is Track A's migration** —
>   nullable `takeoff_stamps.status` (`new`, `existing`, `remove`,
>   `relocate`), NULL read as `new`; the bid counts only `new` (and
>   `relocate` as labor). Track C's stand-in until then is a second count
>   named "… - EXISTING TO REMAIN".
> - Track C's `references/find-all-matching-plan.md` is **referenced in
>   `todo.md` but not written or pushed yet** (checked 2026-10-01: not on
>   `origin/track-c`, not in any local worktree). § 8 plans against the
>   todo entry ("matches start unconfirmed") and must be re-read against
>   that file when it exists.

---

## 1. What is wrong today

- **Colors can match on one sheet.** `colorFor` hashes the count's id into
  six colors (`id × 7 mod 6`), so two counts on one sheet can be drawn the
  same — the fault run types fixed with first-use order (T14) and counts did
  not.
- **Shape says category, not device.** `Devices` covers receptacles AND
  switches, so both are circles. Plain counts (level 1) have no category and
  get a shape from their id — a receptacle can be a triangle.
- **Nothing on the pin says what it is** except color and shape. On a
  black-and-white print, to a color-blind estimator, or past six counts,
  two counts can be indistinguishable.
- **The pin sits ON the symbol.** A 22%-filled shape plus a SOLID centre
  dot (`TraceLayer.tsx`), centred on the click. The dot lands exactly where a
  receptacle's or switch's own marks are.
- **No status.** An existing device to remain is counted like a new one.

---

## 2. Shape by device family

Matched to what estimators see on plans, as asked:

| Family                         | Shape                  | Why                                                 |
| ------------------------------ | ---------------------- | --------------------------------------------------- |
| Receptacles                    | **circle**             | Plan receptacles are circles                        |
| Junction / outlet boxes        | **circle**, letter J   | Plans draw a J in a circle; the letter separates it |
| Lighting                       | **square**             | Fixtures are drawn as rectangles/squares            |
| Panels, disconnects, equipment | **wide rectangle** 2:1 | Panels are drawn as long rectangles                 |
| Data / telecom / low voltage   | **triangle**           | The common plan symbol for data/voice outlets       |
| Switches & wall controls       | **diamond**, letter S… | Owner's choice; the S says "switch" on any print    |
| Fire alarm, security, other    | **hexagon**            | The spare shape; the letter does the work           |

- **Six shapes, up from five** — the wide rectangle is new. At the 10 px
  floor a 2:1 rectangle must still read as different from a square;
  **measure before adopting it** (§ 9 step 0). If it does not, panels and
  equipment fall back to square + letter.
- **This overrides § 5e's map** ("triangles are lighting", Panels square,
  Equipment diamond, Low voltage hexagon). Every assembly-backed count
  changes shape once. Said in both files.
- **Family is decided by one pure function**, `deviceFamily({ name,
category, symbolLabel })` in `shared/`, with tests: the assembly category
  first where it is specific (Lighting, Panels, Low Voltage), then the
  words in the name for `Devices` and for plain counts ("gfci", "duplex",
  "recep" → receptacle; "switch", "dimmer", "3-way" → switch; "j-box",
  "junction" → box; "smoke", "pull station", "horn" → fire alarm;
  "luminaire", "troffer", "exit" → lighting). It reuses the catalog's slang
  rather than a second vocabulary (CLAUDE.md § Materials — the search table
  in `client/src/lib/smartSearch.ts` already knows "recep", "gfi", "1900").
  Unknown → hexagon, and the letter separates it.

---

## 3. Letters inside the shape

The owner especially likes this, and it carries the most weight: a letter
survives black-and-white printing, color blindness, and a seventh count.

### The rule that keeps letters from meaning two things

**In the default table, one letter means one thing — across all families.**
T is not both thermostat and telephone; D is not both data and dimmer. Shape
is a second channel, not what disambiguates, because at 10 px on a busy
sheet shapes blur first.

**On one bid, no two counts show the same shape + letter.** When a second
count would land on a letter already used on the bid (two receptacle counts
both defaulting to R), the later one becomes **R2**, then R3 — the way plans
already tag fixture types. Per BID rather than per sheet, so the same count
wears the same letter on every sheet of the job. Order = first use, as run
colors are (T14).

**A bumped code never takes a code the table gives a meaning to.** S3 is a
3-way switch on every plan, so a second and third single-pole count go S2,
S5 — never S3. The test for this is a property, not an example: for every
default code, no bump sequence produces it.

**Any letter can be changed** — up to two characters (S3, A1, DV). A changed
letter is never renumbered; only automatic ones step aside, exactly as an
automatic run color steps around a chosen one.

### The default table (proposal — owner to adjust)

| Family         | Item                               | Letter                                    |
| -------------- | ---------------------------------- | ----------------------------------------- |
| Receptacles    | Duplex                             | **R**                                     |
|                | GFCI                               | **G**                                     |
|                | Quad                               | **Q**                                     |
|                | Weatherproof / in-use              | **W**                                     |
|                | USB                                | **U**                                     |
|                | Isolated ground                    | **I**                                     |
|                | 240 V / special purpose            | **P**                                     |
|                | Floor box / floor receptacle       | **FB** ¹                                  |
| Boxes          | Junction box                       | **J**                                     |
| Switches       | Single-pole                        | **S**                                     |
|                | 3-way / 4-way                      | **S3** / **S4**                           |
|                | Dimmer                             | **SD**                                    |
|                | Occupancy / vacancy sensor         | **O**                                     |
|                | Timer                              | **SK** ²                                  |
| Lighting       | A tag in the name ("A1 luminaire") | **the tag**: A1                           |
|                | Untagged fixture                   | **L**                                     |
|                | Exit sign                          | **X**                                     |
|                | Emergency / bug-eye                | **E**                                     |
| Data / telecom | Data                               | **D**                                     |
|                | Voice / phone                      | **V** (not T)                             |
|                | Combo data + voice                 | **DV**                                    |
|                | Wireless access point              | **WA**                                    |
|                | TV / CATV                          | **TV**                                    |
| Fire alarm     | Fire alarm (pull station, generic) | **F**                                     |
|                | Smoke detector                     | **SM**                                    |
|                | Heat detector                      | **H**                                     |
|                | Horn / strobe                      | **HS**                                    |
| Equipment      | Panel                              | **PN** ¹                                  |
|                | Disconnect                         | **DS**                                    |
|                | Motor / motor connection           | **M**                                     |
|                | Mechanical equipment (RTU, AHU)    | **ME**                                    |
| Controls       | Thermostat                         | **T** (only meaning)                      |
| Security       | Camera                             | **C**                                     |
|                | Card reader                        | **K**                                     |
| Anything else  | —                                  | first letter of its name, bumped if taken |

¹ Where the natural letter is already spoken for (F is fire alarm, P is
240 V), the table uses a two-LETTER code rather than a second meaning —
never letter + digit, because a digit is what the bump rule adds ("R2" is
the second receptacle count), so "P2" would read as a second 240 V count.
**This is the part most worth the owner's eye:** P for panel vs P for 240 V
is a real choice, and the table should be HIS vocabulary.
² "SK" (switch, clock) rather than T, which is the thermostat's.

- **Lighting takes the plan's own tag.** Fixture schedules already letter
  their types (A, B, C1, X). A name like "A1 luminaire" — the very counts 8a
  makes from a legend click — wears **A1**, which is what is printed beside
  the symbol on the sheet. Parsed with the sheet-identity parser's habits:
  a leading 1–3 character tag, else nothing.
- **Letter shown only when it can be read.** Measured first (§ 9 step 0):
  below some pin size (expected ~14 px) the letter goes and shape + color
  remain. A letter too small to read is noise on the symbol.

---

## 4. Pins must not hide the plan symbol

Two of the owner's asks pull against each other: a letter INSIDE the shape,
and the symbol underneath still readable. The resolution is zoom.

- **Zoomed out (the symbol is a few pixels, unreadable anyway):** a compact
  pin, letter inside, fill as § 7. The pin is the information.
- **Zoomed in (the symbol is big enough to read):** the pin becomes a
  **ring around the symbol** — the same shape, drawn a little LARGER than
  the symbol, fill ≤ 12%, **no centre dot** — with the letter in a small
  badge on the ring's upper-right corner, outside the symbol.
- **The switch point is measured, not guessed**: when the symbol's on-screen
  size passes the pin's own size. Needs real symbol sizes (§ 9 step 0).
- **A strong outline on any paper:** a 2-tone stroke — the count's color
  over a thin dark halo (`paint-order: stroke`), the trick the pull-point
  labels already use so amber reads on white. Reads on white paper and on
  black linework alike.
- **"Faint marks" while held:** one key (and a toolbar toggle for touch)
  drops every pin to ~15% so the drawing underneath can be checked, then
  restores. Cheap, and it answers "what is under that pin?" without any of
  the above.
- **The centre dot goes.** It existed so a mark points at something; the
  ring does that better without covering the symbol's middle.

**Rejected: offset pins with a leader line.** They keep the symbol clear but
on a dense sheet the leaders cross, and a pin away from its device is a pin
somebody attributes to the device next to it — a wrong count that looks
right.

---

## 5. Colors: none repeat on a sheet — until there are more than six

- **First-use order per bid, as run types (T14).** The first six counts on a
  bid never share a color. Replaces the id hash.
- **A chosen color wins and follows the item to every job**; automatic
  counts step around chosen ones — the run-type rule (2026-09-27), reused,
  not re-derived: the same functions generalised over "a thing with an
  optional chosen color".
- **Honest limit: six colors.** "No two counts on one sheet match" cannot be
  promised past six without colors nobody can tell apart on a drawing
  (§ 5e). **The guarantee that holds at any number is shape + letter (§ 3).**
  Color narrows; the letter decides.
- **One flag:** the palette's orange `#FB923C` sits close to the new
  `--warning` amber (Part A, 2026-09-30). Warnings are not drawn as pins, so
  nothing collides today — noted so a future amber pin warning does not.

---

## 6. Saved at company level, the way run colors are

| Where it is set   | Stored on                                      | Reaches                                                      |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| The assembly      | `assemblies` — shape, letter, color (nullable) | Every job; a shipped assembly FORKS on edit, like a run type |
| The legend symbol | `symbol_links` — the same three                | Every job (already company rows)                             |
| This job only     | `takeoff_groups` — the same three              | This bid                                                     |

- **Precedence:** this job → legend symbol → assembly → automatic (§§ 2–3,
  5). **Refined 2026-10-01 in § 11.4:** an ASSEMBLY-level letter or color is
  a default and bumps when two items share the assembly; item- and job-level
  choices never bump. NULL everywhere means automatic, so nothing has to be configured
  (§ 5e: a feature nobody configures must work without being configured).
- **Both directions** (CLAUDE.md § "As manual or as automated…"): a job
  override can be saved to the library ("Use this look on every job"), and
  a library look can be overridden on one job without touching the library.
- **A typed-name count with no symbol and no assembly** keeps its look on
  this job only — there is no company row to hang it on. Capturing its
  legend symbol (8a) is what makes it company-wide. Decision 6.
- **All nine columns are ADDITIVE and nullable** — step 1 of the three
  (CLAUDE.md § Deploying a migration). **Track A builds migrations**, so
  this is a handoff, batched with the status column (§ 7).
- **Edited in one place, shared:** the count card's swatch, the Legend
  tab's symbol row and the assembly editor all open ONE style editor, and
  the swatch everywhere is drawn by the same function as the pin
  (CLAUDE.md § "Copying a layout does not copy the behaviour").

---

## 7. Status on the pin — the look now, built after Track A's column

> **BUILT 2026-10-05 (Track B), on migration 0098, together with § 6's
> chosen looks (0099–0101).** Status is set from the selection pill ("Mark
> as…", also accepted by `takeoffStamps.drop`), drawn as tabled below, and
> said in words on the card. **Pricing, decided on the hard rule "an existing
> mark must never price as new":** only a NEW mark (NULL or `new`) is a
> quantity — rule 1 in shared/markStatus.ts (`markCountsAsQuantity`, Track
> A's; `isPricedMark` is the same rule for a row) and `markIsQuantity`
> (server/db.ts) — built by A and B the same day and merged into one, at the
> four places a mark becomes a number: a bid line's
> live quantity and "Send N", the count list, the per-mark drops, and
> `groupStamps` (supplier list, export). **Remove and relocate are kept off
> every quantity too** and the card says "labour not on the bid": they buy no
> new device, and what their labour costs is still the owner's call.
> Measured on screen: hollow had to be truly hollow (a white fill hid the
> symbol, § 4), and the relocate arrow had to be a filled arrowhead (a
> stroked one read as "+").

| Status             | Look                                                     |
| ------------------ | -------------------------------------------------------- |
| New (and NULL)     | **Filled** — the count's color at ~45%, letter on it     |
| Existing to remain | **Hollow, SOLID outline** — no fill, letter in the color |
| Remove             | Hollow + an **X** through the shape                      |
| Relocate           | Filled + a small **arrow** badge on the corner           |

- **Hollow must be SOLID, because dashed already means provisional** —
  that is § 8's channel. "Existing" and "unconfirmed" must never be told
  apart by fill alone.
- **Depends on `takeoff_stamps.status` (Track A, on A's list from Track C).**
  Until it exists every pin draws as New; the look ships with the column,
  not before, so the drawing never shows a status the bid does not apply.
- **The count's card says the split in words** ("12 new · 4 existing ·
  1 remove"), because a pin's fill is invisible on a printout and a status
  that only lives in a fill is a wrong price waiting to happen.
- When it lands, Track C's "… - EXISTING TO REMAIN" twin counts convert into
  the status (todo.md, Track C) — not this plan's job, noted so the two
  looks do not both exist.

---

## 8. Unconfirmed matches (Track C's Find all matching)

- **Dashed outline, no fill, a small "?" badge**, in the count's own color —
  so it is plainly a suggestion OF that count, in the language every other
  proposal on the drawing already speaks.
- **Status is not drawn until confirmed.** An unconfirmed match is just
  unconfirmed; confirming gives it the status look of § 7.
- **Never counted, never in "This sheet".** The pinned line gains
  "· 7 to confirm" when there are any, and the Counts tab carries the amber
  mark (Part A rule 5) — an unconfirmed match is work not finished.
- **Never snapped to** by tracing until confirmed — the open todo item about
  `legSnap.ts` copying an AI mark's position into a run is the same risk.
- To re-check against `references/find-all-matching-plan.md` when Track C
  pushes it.

---

## 9. How it gets built and checked

**Step 0 — measure, before any pixel is chosen** (CLAUDE.md § "A number that
can be measured should not be asserted"). On the "Bar layout check" fixture
(E0.01 legend sheet + four drawings) and the 18-page "Sheet numbers check"
set:

- the on-screen size of real receptacle, switch, data and fixture symbols
  at Fit, 50%, 100%, 200% — decides the ring/compact switch point (§ 4);
- the smallest pin at which a letter, and a two-character letter, is still
  readable — decides when letters hide (§ 3);
- whether a 2:1 rectangle reads differently from a square at the 10 px
  floor — decides shape six (§ 2);
- the densest 200 × 200 px area on any sheet, at Fit, with every count
  placed — decides whether crowding needs anything beyond "faint marks".

**Step 1 — no migration** (all computed, like § 5e): `deviceFamily`, the
six-shape map, default and bumped letters, first-use colors, the halo
outline, ring vs compact, no centre dot, faint marks. Pure rules in
`shared/takeoffMarks.ts` with tests; ONE pin component drawn by the overlay,
the count card and the legend row. **Every existing count's color and shape
may change once** — said in the CHANGELOG.

**Step 2 — after Track A's style columns:** the style editor, precedence,
"use on every job", fork-on-edit for shipped assemblies.

**Step 3 — after Track A's status column:** § 7.

**Step 4 — with Track C's Find all matching:** § 8.

**Checks each step:** laptop 1536, panel 280 px, phone 390 × 844 and
360 × 740 (same-origin frame — the driven window cannot be resized; a real
phone when touch lands); dark and light; the measurements of step 0 taken
again after, side by side.

**Crowded areas:** never merge pins into a cluster number — a count is
checked by looking at each mark. Selected pin draws on top; letters hide
under the measured size; faint marks for the rest.

**Phone:** same clamp and pins. A finger needs a larger hit area than the
pin it touches — an invisible 44 px target, which arrives with touch and
guard 3 (`track-b-phone-and-readability-plan.md` § 3), not before.

**Printing and exports:** today the only export is CSV; nothing draws pins
off-screen. So: (a) add a **"Pin" column** to the takeoff CSV (letter +
shape name, e.g. "S3 ◇ diamond") so the file's rows can be matched to a
marked-up screen — cheap, decision 10; (b) any future marked-up-sheet PDF
must draw pins with the same shared function, and letters are what make it
work in black and white. A browser print of the Plans screen is not a
supported export.

---

## 10. Decisions — DECIDED 2026-10-01

> **The owner delegated these twelve on 2026-10-01** ("decide the 12 open
> pin decisions yourself… only ask me about anything that changes a bid
> number or can't be undone"). Checked against that bar: **none of the
> twelve changes a bid number** — pins are drawn from counts, and what a
> count contributes to a bid is decided by the bridge (`takeoffBridge.ts`),
> which reads no pin column. **None is irreversible** — step 1 is computed and
> stores nothing, and step 2's columns are nullable, so clearing one restores
> the automatic look. **So no question went to the owner.**
>
> **The one adjacent question that DOES change a number is not here and
> stays the owner's:** what `existing`, `remove` and `relocate` do to a price
> (todo.md, the mark-status entry — "`remove` wants its own demo labour line,
> owner to decide"). Decision 8 below decides only how each status LOOKS; the
> status looks ship with the column and not before, so a look can never
> claim a status the bid is not applying.
>
> **Decided — each is the recommendation, with the reason it holds:**
>
> | #   | Decided                                                                                                                                                                                                                                                                                                                                | Why it holds                                                                                                                                                                                                                        |
> | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | **Ring around the symbol zoomed in, compact pin zoomed out.** Switch point = the symbol's on-screen size passing the pin's, **measured in step 0**, not chosen.                                                                                                                                                                        | The only option that keeps BOTH asks (letter in the shape, symbol readable). The leader line is rejected for a wrong-count reason (§ 4).                                                                                            |
> | 2   | **Six shapes, the wide 2:1 rectangle for panels/equipment — IF step 0 shows it reads apart from a square at the 10 px floor.** If it does not: five shapes, panels/equipment are squares and the letter (PN, DS, M, ME) separates them. Either way § 5e's "triangles are lighting" is replaced by § 2's family map (§ 5e now says so). | A measurement decides the one uncertain part; the fallback costs nothing because letters already guarantee uniqueness.                                                                                                              |
> | 3   | **One meaning per code in the defaults; digit bump per BID (R, R2), never onto a table code.**                                                                                                                                                                                                                                         | Already built and tested (`shared/pinLetters.ts`, § 11 box). Per-sheet letters would let one count wear two letters across a job.                                                                                                   |
> | 4   | **Adopt the § 3 table as BUILT in `shared/pinLetters.ts`:** P = 240 V, PN = panel, V = phone (T is only thermostat), two-letter codes rather than letter+digit. Owner can change any letter per item once step 2 lands.                                                                                                                | A letter is the most reversible thing in this plan — a chosen letter overrides it. **Fix at build time:** "safety switch" hits `/\bswitch/` before the `DS` rule and reads S; move the disconnect rule above switches, with a test. |
> | 5   | **Lighting takes the fixture tag from the name ("A1", "(A-7)" → A7), else L.**                                                                                                                                                                                                                                                         | Already built. It is what is printed beside the symbol on the sheet.                                                                                                                                                                |
> | 6   | **Looks saved on the assembly and the legend symbol (company-wide) and on the count (this job); a typed-name count keeps its look on this job only.** No company table keyed by name.                                                                                                                                                  | Names are a weak key; capturing the symbol (8a) is the existing way to make anything company-wide.                                                                                                                                  |
> | 7   | **Six colors, first use per bid, a chosen color wins — the run-type rule.** No extra colors.                                                                                                                                                                                                                                           | First-use order is built (§ 11 box); more colors are harder to tell apart on a drawing and the letter already decides.                                                                                                              |
> | 8   | **Status looks as tabled in § 7** — filled / hollow with a SOLID outline / X / arrow badge — **plus the split in words on the count card.** Shipped with the status column, never before.                                                                                                                                              | Hollow is solid because dashed already means provisional (§ 8). The words cover printouts and color blindness.                                                                                                                      |
> | 9   | **Unconfirmed matches: dashed, hollow, "?", not counted, not snapped to.**                                                                                                                                                                                                                                                             | The drawing's existing "provisional" language. "Not snapped to" is also the connect-point plan's § 5.3 answer — one rule, one function.                                                                                             |
> | 10  | **No legend image as the pin.** § 5e's ruling stands.                                                                                                                                                                                                                                                                                  | Mush at 10–26 px; the ring leaves the REAL symbol visible at reading zoom.                                                                                                                                                          |
> | 11  | **Add a "Pin" column to the takeoff CSV** (code + shape name, e.g. "S3 diamond"), as the LAST column.                                                                                                                                                                                                                                  | Last, so a spreadsheet somebody built on the current column order keeps working. No ◇ glyph in the file — plain words survive every CSV reader.                                                                                     |
> | 12  | **Faint marks: a held key plus a toolbar toggle (touch).** The key is chosen from the shortcut list when built (§ 11.6 found F, G, T and R taken — do not assert one here).                                                                                                                                                            | Reversible by letting go. Layers hides whole counts, which answers a different question.                                                                                                                                            |
>
> **Order of work (unchanged from § 9):** step 0 measurements → step 1
> (computed, no migration) → step 2 after § 12's style columns → step 3 after
> the status column → step 4 with Track C's Find all matching.

The original options, kept for the record:

1. **Pin vs. symbol:** **ring around the symbol when zoomed in, compact pin
   when zoomed out (recommended)** / see-through pin always on top /
   offset pin with a leader line (rejected above: leaders cross, pins get
   attributed to the wrong device).
2. **Shapes:** **six, adding a wide rectangle for panels/equipment, if step
   0 shows it reads at 10 px (recommended)** / keep five and let letters
   separate panels from lights. Either way § 5e's "triangles are lighting"
   is replaced by your family map.
3. **Letter uniqueness:** **one meaning per letter in the defaults, and a
   digit suffix (R, R2) when two counts on a bid would match
   (recommended)** / unique per sheet only (the same count could carry
   different letters on different sheets).
4. **The default letter table (§ 3):** **adopt it, then mark it up —
   especially P (240 V) vs PN (panel), V for phone instead of T, and the
   two-letter codes (recommended)**. It should be your vocabulary.
5. **Lighting letters:** **use the fixture tag from the count's name ("A1")
   (recommended)** / always L.
6. **Where a look is saved:** **assembly + legend symbol company-wide, and
   per job on the count; typed-name counts per job only (recommended)** /
   also a company table keyed by name, so a typed "Exit sign" looks the
   same everywhere (one more table, and names are a weak key).
7. **Colors:** **keep six, first-use per bid, chosen wins — the run-type
   rule (recommended)** / add two more colors (each one harder to tell
   apart on a drawing; the letter already guarantees uniqueness).
8. **Status looks (§ 7):** **as tabled — filled / hollow-solid / X / arrow,
   plus the split in words on the card (recommended)**.
9. **Unconfirmed matches (§ 8):** **dashed, hollow, "?", not counted, not
   snapped to (recommended)**.
10. **Legend image as the pin:** **no — keep § 5e's ruling (recommended).**
    A raster crop is mush at 10–26 px, exists only for captured symbols,
    and at reading zoom the ring already leaves the REAL symbol visible
    underneath, which is the same picture at full resolution. Keep the
    image where it reads: the Legend tab, the count card, the tooltip.
11. **CSV export:** **add a "Pin" column (recommended)** / no change.
12. **Faint marks:** **a held key plus a toolbar toggle (recommended)** /
    rely on hiding counts in Layers.

**Handoffs:** Track A — the exact list is § 12. Track C — § 8 against
`find-all-matching-plan.md` once pushed.

---

## 11. Several captured items on ONE assembly (added 2026-10-01)

> **BUILT 2026-10-01 (Track B), v1 with no migration** — was "plan only".
> What shipped, and where it differs from the text below:
>
> - **§ 11.2** — `chooseAssemblyCount` (`shared/assemblyCounts.ts`), applied
>   by `server/assemblyGroup.ts`; `forAssembly` takes `symbolId` and
>   `ifSeveral`. **Two rules added beyond the plan:** (a) a symbol that is the
>   ONLY one linked to its assembly keeps using the one count the bid already
>   has of it, so a bid counted before the fix is not split into two cards for
>   one item; (b) a plain count already named for the symbol (counted before it
>   was linked) is linked to the assembly on the next click, every mark kept,
>   rather than a second card under the same name — unless it is already on the
>   bid, when the clicks go to it as it is. The plan reader's Place passes the
>   symbol; a finding WITHOUT one takes the first count (`ifSeveral: "first"`),
>   as recovered click queues do, rather than failing the Place.
> - **§ 11.2.5** — `setSource` narrowed via `mayShareAssembly`; the router's
>   doc comment says so too.
> - **§ 11.4 / §§ 3, 5 (step 1 subset)** — `shared/pinLetters.ts`: letters per
>   BID (tag → the item's name → the assembly's name → first letter), bumped
>   in first-use order, never onto a table code; colours in first-use order.
>   Shapes are unchanged (§ 2's family map is still decision 2). Chosen
>   letters/colours wait for Track A's style columns. Letters draw at a pin
>   size of 14 px and up (`LETTER_MIN_PX` — a judgement, step 0 still owes the
>   measurement); in a triangle (lighting) the letter is small.
> - **Tag letters amended as `count-by-tag-plan.md` § 3 proposed**: a trailing
>   `(…)` tag first, then a leading one with a digit, up to 4 characters, the
>   hyphen dropped (`A-7` → `A7`). A repeated tag bumps with a dot (`A7.2`).
> - **§ 11.5** — no change needed: lines are already per count; tested that
>   22 + 3 totals the same as 25 and that R3 does not fire.
> - **§ 11.6** — `@/lib/countAgain`; the key is **R** (F, G, T and Ctrl+Z/Y
>   were taken).
> - **§ 11.3's link-time warning** was not built: the fix shipped first.
> - **§ 11.7 v2** (`takeoff_groups.symbolLookupKey`) is still Track A's.
>
> From the owner's request the same day: three different
> lights linked to the same assembly come out with identical pins. Builds on
> §§ 3, 5, 6 above and on `references/count-by-tag-plan.md` (which hits the
> same fault from the tag side — its § 5 now points here).

### 11.1 What is actually wrong — it is not the look

**The pins are identical because the marks are in ONE count.** A pin is
drawn by its count (§ 5e, `markAppearance` in `shared/takeoffMarks.ts`), and
clicking a linked legend symbol arms its assembly through
`groupForAssembly` (`server/assemblyGroup.ts:30`):
`existing.find(group => group.assemblyId === assembly.id)` — **the first
count on the bid with that assembly wins.** Three lights linked to one
assembly are therefore three doors into the SAME count:

- the marks merge — "Linear 8ft: 22, Linear 4ft: 3" is stored as one count
  of 25, and nothing kept which symbol each mark came from;
- the count wears whichever name got there first (often the assembly's);
- **giving the pins different looks cannot fix this** — there is only one
  count to style. Restyling first would be a cosmetic fix over a lost
  number.

And it cannot be routed round today: `takeoffGroups.setSource` REFUSES a
second count of an assembly the bid already counts
(`takeoffGroupsRouter.ts`, "This bid already counts X as Y"), on the reasoning
that two counts of one assembly split one number in half. That reasoning was
right when a count was "an assembly"; it is wrong once a count is "a
captured item", which is what this section changes.

**Is it a wrong PRICE today? No** — every merged mark is the same assembly,
priced the same, so the bid total is right. It is a wrong QUANTITY PER ITEM
(C14 cross-checks, the fixture schedule, per-type ordering) and a lost
distinction. That is why the fix is ordered as below rather than as an
emergency.

### 11.2 The fix: a count per captured item

**Rule: a linked symbol arms ITS OWN count — the assembly's, under the
symbol's name.** `groupForAssembly` gains the symbol as an optional key:

1. A count on this bid with this assembly whose name matches the symbol's
   names (current or captured — the two-name rule shipped today,
   `symbolCountsOn` in `shared/takeoffCounts.ts`) → that one.
2. Otherwise → a NEW count, label = the symbol's name, `assemblyId` = the
   assembly. Never another symbol's count.
3. **Without a symbol** (the toolbar's assembly picker, `forAssembly`;
   recovered queues) and the bid has **more than one** count of that
   assembly → **do not guess**: the picker opens a short chooser of those
   counts. Exactly one → it, as today. None → create, as today.
4. **The plan reader's Place** already knows the symbol (`finding.symbolLinkId`,
   `planCopilotRouter.ts`), so it passes it and lands in the item's count —
   no chooser needed. Today it calls `groupForAssembly` without it
   (`planCopilotRouter.ts` ~936) and would merge.
5. `setSource`'s refusal narrows: a second count of one assembly is allowed
   when the two counts are different captured items; it still refuses two
   PLAIN-named counts of one assembly (the split-in-half case it was written
   for). Both files say so (CLAUDE.md § "Where decisions live").

**Existing merged counts are left alone.** Marks already counted cannot be
reattributed (no mark records its symbol). The old count keeps its name and
marks and stays reachable through the chooser; new clicks on each symbol go
to that symbol's own count. Track C's "move marks to another count"
(`895cd7c`, on `track-c`) is the way to split an old one by hand — say so on
the old count's card once both have landed.

**Test that must fail before the fix:** two symbols linked to one assembly,
click each, place marks — `forAssembly` with symbol A and with symbol B must
return DIFFERENT counts, and without a symbol must refuse to pick (count-by-
tag § 5's test, generalised).

### 11.3 Should the fix come BEFORE people link several items to one assembly?

**Yes — before, and before any pin-look work.** Three reasons:

- every mark placed under the first-wins rule is a mark that later cannot be
  split without re-marking (or Track C's move tool) — the cost grows with
  use, so the cheapest day to fix it is the day before anyone relies on it;
- the per-item looks (§ 11.4) have nothing to attach to until each item is its
  own count;
- the fix is small and needs no migration in v1 (§ 11.7).

So the order is: **§ 11.2 → the step 1 pin rules (§ 9) → § 11.4 overrides
after Track A's columns.** Until § 11.2 ships, linking a second symbol to an
assembly another symbol already uses should say, at link time: "Clicks on
both will count together as one count — they will be separated in an update."
One sentence, honest, removed with the fix.

### 11.4 Where a pin's look comes from — the item, with the assembly as default

**Precedence, refined from § 6** (this job → legend symbol → assembly →
automatic, unchanged in ORDER; what changes is how a SHARED default behaves):

| Set on             | Meaning                                               | When two counts on a bid would collide                          |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------------- |
| This job (count)   | A choice for this count only                          | Never renumbered. A clash is flagged, not fixed silently        |
| The captured item  | "This symbol always looks like this" (`symbol_links`) | Never renumbered. A clash is flagged, not fixed silently        |
| The fixture TAG    | `(A-7)` in the name → letter A7 (count-by-tag § 3)    | Tags differ by definition                                       |
| The assembly       | **A default** for every count of it                   | **Bumps**: the 2nd count of it steps aside (L → L2, next color) |
| Automatic (§§ 2–5) | Family shape, table letter, first-use color           | Bumps, as § 3                                                   |

- **The shape stays the FAMILY's, always.** Three lights are three
  squares; shape says "lighting", and § 2's map is not overridden per item
  (a light drawn as a hexagon would teach the wrong family). Letter and color
  carry the difference.

  > **OVERRIDDEN 2026-10-05 by the owner's request** ("the user picks a
  > shape/letter/color per count"). A CHOSEN shape now wins at every level
  > (count → symbol → assembly); the family's shape is the AUTOMATIC one, so
  > nobody who chooses nothing sees any change. The risk named above is real
  > and is the chooser's to take. Built in `shared/pinLetters.ts`, which says
  > the same.

- **An assembly-level letter or color is a DEFAULT, so it bumps.** This is
  the one new rule. § 3 says a CHOSEN letter is never renumbered; that stays
  true for a letter chosen on the item or the count. But a letter chosen on
  the assembly is chosen for "counts of this assembly", and when two items
  share it, honouring it twice would make two counts wear one code — the
  thing § 3 exists to stop. So the second count of that assembly on the bid
  becomes L2 (and takes the next free first-use color), exactly as an
  automatic letter would.
- **"Each letter means one thing" still holds.** L2 means "the second lighting
  count on this bid" — the same meaning the bump already has in § 3. A bump
  never lands on a code the default table reserves (S3 stays the 3-way).
- **Two item-level choices that collide** (the owner set both A-7 and A-9's
  symbols to "L") are SHOWN, not silently renumbered: both pins read L, and
  the Legend tab and both count cards say "Linear 8ft and Linear 4ft both
  show L on this bid — change one". Silently renaming somebody's choice is
  worse than showing it.
- **Colors past six** (§ 5): three lights on one assembly take three of the
  six; the letter is what guarantees the difference, as everywhere.

### 11.5 What the BID shows — recommendation: one line per captured item

**Recommended: one bid line per count, i.e. per captured item**, each named
for the item, all priced from the same assembly:

- it is what exists already — `bid_line_items` has ONE line per count
  (`bid_line_items_bid_group_uq`, `takeoffBridge.ts`), and Send works per
  count. A combined line would need a line pointing at several counts, which
  is a schema change and breaks "a from-plans line follows ONE count";
- **prices and hours: identical per unit, same total.** Each line snapshots
  the assembly's cost, hours, modifiers and rate when IT is sent (R4). Sent
  together → identical figures, and 22 + 3 lines total exactly what one line
  of 25 would. **The one difference:** sent on different days after the
  assembly or rate changed, the two lines carry different snapshots. That is
  the existing snapshot rule doing its job, not a new risk — but the bid
  should show it: lines of one assembly with different unit figures get the
  existing stale-rate style mark;
- **the R3 standing warning must NOT fire** for several from-plans lines of
  one assembly that come from different counts — it is for plans + by-hand
  duplicates. Check `takeoffBridge`'s R3 against this before shipping, or the
  bid will warn on every correct multi-item job (a false alarm teaches people
  to read past the real one);
- **the customer proposal may combine** lines of one assembly into one row
  — a display choice in the proposal, never a change to the lines. Offered as
  a proposal setting later, not in this change;
- **the materials list is unaffected**: it already totals by material.

**Alternative, not recommended:** one combined line per assembly. Simpler bid
for the customer, but it loses the per-item quantity the whole request is
about, needs a migration, and gives a line two counts to follow.

### 11.6 "Count again" — one click back to the last symbol

Since 2026-10-01 a sheet change puts the count down (`client/src/lib/
toolOnSheet.ts`). Right for safety, and it costs a re-pick on every sheet.

- **Remember the last ARMED count per bid** — its count id and name, plus the
  symbol it came from, if any. In memory on the page, and in `sessionStorage`
  under a `bidridge:last-count:<bidId>` key so a reload keeps it (wrapped in
  try/catch; nothing depends on it).
- **A toolbar chip appears when nothing is armed and a last count exists**:
  "↻ Count again: Linear 8ft". One click re-arms it through the ordinary
  `armGroup` — so a locked bid refuses there, as it does for every pick-up.
  On phone, the same chip in the bottom toolbar.
- **A key** for it, chosen from the existing shortcut list when built (do not
  assert a free letter here — read the list).
- **It re-arms the COUNT, not the symbol**: if the count was deleted since,
  the chip disappears (it reads the bid's count list, so it cannot offer a
  count that no longer exists — refreshed by the same `takeoffGroups.list`
  every count change already moves). With § 11.2 a symbol's count is stable,
  so "the last symbol" and "the last count" are the same thing.
- **Not automatic.** The tool does not come back by itself on the new sheet —
  that is the fault the 2026-10-01 change fixed. One click, by the person,
  on the sheet they now mean.
- No migration, no server change.

### 11.7 Database — flag for Track A, and what is safe without it

**v1 needs no migration.** The count's link to its item is its NAME (the
symbol's current or captured name — exactly how plain symbol counts are
matched since the rename work today). That survives a symbol rename (both
names are matched) but not a hand rename of the COUNT to something unrelated —
then the next click on the symbol makes a new count. Visible (a second card),
never a wrong price.

**v2, FLAG FOR TRACK A: `takeoff_groups.symbolLookupKey varchar(255) NULL`** —
the same column `count-by-tag-plan.md` § 2 already requests. NULL = not from
a symbol (every existing row), so additive with no backfill. With it, a count
belongs to its item by key, not by name. **Ship it in the same batch as the
nine pin-style columns** and the optional `symbol_links.originalLabel`
(todo.md, 2026-10-01). One handoff.

### 11.8 What else this could break

- **`setSource`'s refusal** (11.2.5) is a stated rule with a test; changing it
  changes `server/` tests that assert it. Update the rule's comment, the test,
  and the decision line together.
- **R3 false alarms** on multi-item bids (11.5) — check before shipping.
- **The toolbar picker gains a chooser** when an assembly has several counts —
  a new step on a path that was one click. Only when there IS more than one;
  never on a fresh bid.
- **Recovered click queues** (`TakeoffPage` queue recovery, older shape keyed
  by assembly) hit rule 3 with no person present: they take the FIRST count
  as today and say so in the recovery toast, rather than opening a chooser
  nobody is there to answer.
- **Exports / CSV**: one row per count already, so per-item rows arrive for
  free; the "Pin" column (§ 9) reads per count.
- **Count-by-tag** is the same mechanism with a tag in the name; the two must
  share `symbolCountsOn` and the v2 column, not grow two matchers.
- **Existing merged counts** keep their marks; nothing is moved or renamed by
  the fix (11.2).

### 11.9 Decisions for the owner — recommendation first

13. **Fix first-wins before any per-item look, and before people link several
    items to one assembly — with a one-line warning at link time until
    then (recommended)** / style first.
14. **A linked symbol arms its own count, named for the symbol; the toolbar
    picker asks when an assembly has several counts (recommended)** / keep
    one count per assembly and only change the look (impossible — one
    count has one look).
15. **Shape from the family; letter and color from item → tag → assembly
    default → automatic; an assembly-level choice bumps, an item-level choice
    never does and a clash is flagged (recommended).**
16. **Bid: one line per captured item, same unit prices; proposal may
    combine for the customer later (recommended)** / one combined line per
    assembly (migration, loses per-item quantity).
17. **"Count again" chip + key, re-arming the last count per bid, never by
    itself (recommended).**
18. **v1 by name, no migration; `takeoff_groups.symbolLookupKey` for Track A
    in the pin-style batch (recommended).**

---

## 12. Exactly what Track A adds — pins, mark status, connect point

**Checked 2026-10-01 against `origin/local-dev:drizzle/schema.ts`: none of
these exist yet.** Every one is **ADDITIVE and nullable with no default** —
step 1 of the three (CLAUDE.md § Deploying a migration), no `UPDATE`, no
backfill, so all of it can go BEFORE the code. NULL always means "not set /
automatic / old behaviour", and nothing may read NULL as 0. A numbers them;
this plan does not.

If what A finds in the schema does not match this list (a column already
there, a table renamed), **stop and find out why before writing the .sql** —
either this list is stale or a branch landed something nobody said.

**Pins (§ 6) — nine columns, the same three on three tables:**

| Table            | Column                                 | Type        | NULL means                                                                      |
| ---------------- | -------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `assemblies`     | `markShape`                            | varchar(16) | the family's shape (§ 2); value is a `MARK_SHAPES` name                         |
| `assemblies`     | `markLetter`                           | varchar(4)  | automatic letter (§ 3); 4 = the longest tag drawn                               |
| `assemblies`     | `markColor`                            | varchar(7)  | first-use color; stored as the `#rrggbb` VALUE, as `takeoff_run_types.color` is |
| `symbol_links`   | `markShape`, `markLetter`, `markColor` | as above    | as above                                                                        |
| `takeoff_groups` | `markShape`, `markLetter`, `markColor` | as above    | as above                                                                        |

A stored shape or color the code no longer knows reads as automatic, as run
colors already do — so no enum, and a palette change never needs a migration.

**Mark status (§ 7) — one column:**

| Table            | Column   | Type                                            | NULL means |
| ---------------- | -------- | ----------------------------------------------- | ---------- |
| `takeoff_stamps` | `status` | enum(`new`,`existing`,`remove`,`relocate`) NULL | `new`      |

What each status does to a PRICE is the owner's decision (todo.md, the
mark-status entry), not this plan's. The column can land first; the pricing
change is a meaning change and ships as code.

**Several items on one assembly (§ 11.7 v2) — one column:**

| Table            | Column            | Type         | NULL means        |
| ---------------- | ----------------- | ------------ | ----------------- |
| `takeoff_groups` | `symbolLookupKey` | varchar(255) | not from a symbol |

The same column `count-by-tag-plan.md` § 2 asks for — one column, not two.

**Connect point (`references/connect-point-plan.md` § 5) — four columns:**

| Table                      | Column                   | Type                    | NULL means                                                 |
| -------------------------- | ------------------------ | ----------------------- | ---------------------------------------------------------- |
| `symbol_looks` (see below) | `connectDx`, `connectDy` | decimal(10,4)           | **never answered** — `0, 0` is "the middle", a real answer |
| `takeoff_stamps`           | `rotation`               | smallint (0/90/180/270) | turning not known                                          |
| `takeoff_stamps`           | `mirrored`               | boolean NULL            | turning not known                                          |

**Where `connectDx/Dy` go — decided here, because connect-point § 5.3 left
it to "whichever lands first":** on **`symbol_looks`**, the table Track C
already queued (todo.md, "Requests to Track A from Check sheet";
`multiple-looks-plan.md` § 6). The offset is measured from a capture box's
centre, and the box lives on the look row; two architects' GFCIs stand off
the wall differently. **Not also on `symbol_links`** — connect-point § 5.3
says do not add both. **If A does not build `symbol_looks` in this batch,**
the two columns go on `symbol_links` beside R.11's `captureX/Y/Width/Height`
instead, and the look table reads them as the first look's, as
`multiple-looks-plan.md` § 6 already does for the box.

**Total: 15 columns** (9 pin, 1 status, 1 symbol key, 4 connect point), on
five tables, plus `symbol_looks` itself if it is not already in A's batch.
Batch them with C's `takeoff_stamps.mountHeightInches` /
`checkAcceptedAt` (same table, same shape) and the optional
`symbol_links.originalLabel`.

**Rehearse with `SHOW CREATE TABLE`** on each of the five after applying,
and run `scripts/schemaDrift.mts` before and after — a before/after of the
same check, not a count of statements sent.
