# Life Safety — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Life Safety" shelf of `starter-catalog-pricing.xlsx` ("Starter prices",
spreadsheet rows **1327–1352**, 26 rows, in the app-order sort), the
question is whether one real product can be priced at a supply house from
the name alone. The workbook was read from a fresh copy (the worktree's
copy, byte for byte the same as `C:\dev\BidPhase\pricing`), because the
owner has it open. It is the shelf after Grounding & Bonding
(`grounding-bonding-name-review.md`); Low Voltage starts at row 1353.

The sheet's 26 names match `BASELINE_MATERIALS`' Life Safety rows one for
one (read from the seed the same day), so the search words quoted below are
the catalog's own. Three rows carry a description today (1346, 1348, 1352).

**The test.** A fire-alarm panel is bought by type (conventional or
addressable) and size (zones or points); a system detector by type too,
because **an addressable device only talks to its own maker's panel** and a
conventional one does not talk to an addressable loop at all. A 120V house
alarm is a different product from a system detector, at a different price,
and both are called "smoke detector" at the counter.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.
Nothing on this shelf was decided earlier.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**14 of the 26 rows are used** (the sheet's "Used by" column says the
same). **No run type uses this shelf.** **Packs: every row is `each` / 1**,
and none is on `pack-label-scan.md` § E's word-guessed list.

**Sources.** Listings checked on 2026-10-14: Fire-Lite MS-5UD-3 5-zone panel
(Next Security, Protegis, JEM, ABSupply), Fire-Lite ES-50X 50-point panel
(Next Security, Walmart), System Sensor 2151 conventional head (AlarmGrid,
Kele, Next Security) and B210LP base (Greenwave, JEM), Fire-Lite SD365
addressable head (Walmart, eBay, Greenwave), System Sensor DNR duct
detector and DST sampling tubes (Next Security, Protegis, Building
Controls, PartsSource, Kele), Kidde SM120X relay (Dale, Gerrie, Elliott,
Sydist), KnoxBox 3261 (Lawrence KS and Fresno County fire department order
lists). Prices only show how big a question is; they are not proposed
prices. Brands stay out of the names (CLAUDE.md § Brands); model numbers
are search words at most.

## Existing rows

| Row  | Current name                            | Used by    | Verdict                                                                      | Why                                                                                                                                                                                               |
| ---- | --------------------------------------- | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1330 | `Conventional fire alarm control panel` | CK5        | **Needs words** (Q2): `Conventional fire alarm control panel, 5-zone`        | Priced by zones. MS-5UD-3 (5-zone, 3A, built-in dialer): **$438–$1,444** across sellers; the 10-zone is a different price. Search words say "addressable" and "annunciator" (S1).                 |
| 1329 | `Addressable fire alarm control panel`  | —          | **Needs words** (Q2): `Addressable fire alarm control panel, 50-point`       | Priced by points. ES-50X (50-point): **$961–$979**; the 200-point panels are about twice that.                                                                                                    |
| 1352 | `System smoke detector`                 | CS13       | **Needs words** (Q3): `System smoke detector, conventional, photoelectric`   | A conventional head (System Sensor 2151) **$46–$75**; an addressable one (Fire-Lite SD365) **$45–$70** but only on its maker's panel. Search words say both "addressable conventional".           |
| 1333 | `Detector base`                         | CS13, CK16 | **Needs words** (Q3): `Detector base, conventional 2-wire`                   | The base matches the head and the loop. B210LP **$8–$15** (discontinued; B300-6 replaces it). Search words say "addressable".                                                                     |
| 1340 | `Fire alarm pull station`               | CS11       | **Needs words** (Q3): `Fire alarm pull station, conventional, double action` | An addressable pull station has the module built in and costs more; search words say "addressable" and "double action". Conventional matches CK5's panel.                                         |
| 1349 | `Heat detector`                         | CK16       | **Needs words** (Q4): `Heat detector, 135°F fixed/rate-of-rise`              | CK16 puts it on a `Detector base` with fire alarm cable, so it is the system device. Fixed-temperature-only and 194°F heads are other parts. "garage" points a house-alarm search at it (S3; M4). |
| 1341 | `Fire alarm relay module`               | —          | **Needs words** (Q5): `Addressable relay module`                             | It is the loop (SLC) relay, the twin of `Addressable monitor module`; "Fire alarm relay module" reads like 1351 (see below).                                                                      |
| 1351 | `Relay module, smoke alarm`             | CS14       | **Needs words** (Q5): `Smoke alarm relay module, 120V`                       | It is the 120V house-alarm relay (Kidde SM120X: **$10.42–$33.28**). CS14 (commercial duct detector) uses it: **P1**.                                                                              |
| 1332 | `Beam detector`                         | —          | **Needs words** (Q6): `Beam smoke detector, reflected`                       | Reflected (one unit and a reflector) is the common one; a two-ended beam is another part.                                                                                                         |
| 1350 | `Rapid-entry key box`                   | CS16       | **Needs words** (Q7): `Rapid-entry key box, surface mount`                   | Surface and recessed are different boxes. KnoxBox 3261 surface, hinged: **$487–$499** on fire-department order lists, ordered through the local fire department's account (description).          |
| 1347 | `Hardwired smoke detector, 10-year`     | —          | **Needs words** (Q8): `…, 10-year sealed battery`                            | "10-year" alone could be the sensor life; the sealed lithium battery is what is being bought.                                                                                                     |
| 1337 | `Emergency exit light combo`            | LT28, DR15 | **Needs words** (Q9): `Exit sign / emergency light combo, LED`               | "Exit sign" is the word people search, and its siblings `Exit sign` and `Emergency light` live on Lighting Hardware (Lighting review row 1175–1179). Q9 also asks which shelf.                    |
| 1346 | `Hardwired smoke detector`              | —          | **Owner pick** (Q1)                                                          | A 120V house alarm. Named "detector" like the system head beside it, so "smoke detector" finds both: P2.                                                                                          |
| 1348 | `Hardwired smoke/CO detector`           | RS9        | **Owner pick** (Q1)                                                          | Same.                                                                                                                                                                                             |
| 1345 | `Hardwired CO detector`                 | —          | **Owner pick** (Q1)                                                          | Same.                                                                                                                                                                                             |
| 1334 | `Detector mounting bracket`             | —          | **Owner pick** (Q10)                                                         | Search words say "smoke alarm adapter plate ring": the house alarm's plate. It ships with the alarm; a spare is bought to fit another brand's alarm to an old box.                                |
| 1335 | `Detector wiring harness`               | —          | **Owner pick** (Q10)                                                         | A house-alarm plug harness. It fits one alarm brand only, and ships with the alarm.                                                                                                               |
| 1336 | `Duct smoke detector`                   | CS14       | **OK**; search word S2; missing M1                                           | System Sensor DNR: **$113–$178**. The sampling tube is sold separately by duct width (M1).                                                                                                        |
| 1331 | `Addressable monitor module`            | —          | **OK**; fit description (Q11)                                                | Only works on its maker's panel.                                                                                                                                                                  |
| 1342 | `Fire alarm remote annunciator`         | —          | **OK**; fit description (Q11)                                                | Same.                                                                                                                                                                                             |
| 1338 | `End-of-line resistor`                  | —          | **OK**; description (Q11)                                                    | The value is set by the panel maker, and panels ship with them.                                                                                                                                   |
| 1339 | `Fire alarm horn/strobe`                | CS12       | **OK**                                                                       | Selectable candela, wall mount is the default part; a ceiling one is a near-same price.                                                                                                           |
| 1343 | `Fire alarm speaker/strobe`             | CK15       | **OK**                                                                       | Same.                                                                                                                                                                                             |
| 1344 | `Fire alarm strobe`                     | CK2        | **OK**                                                                       | Same.                                                                                                                                                                                             |
| 1328 | `12V 7Ah fire alarm battery`            | CK5 (x2)   | **OK**; search word S4                                                       | Sold by volts and amp-hours; the name says both.                                                                                                                                                  |
| 1327 | `12V 18Ah fire alarm battery`           | —          | **OK**                                                                       | Same.                                                                                                                                                                                             |

**Counts:** 9 OK, 12 need words, 5 owner picks, 0 decided — 26.

## Packs

None to change: every row is `each` / 1, which is how all 26 are sold.

## Search words and descriptions (not names)

**S1 — "addressable" and "annunciator" on the conventional panel.** Both
name another row on this shelf (`Addressable fire alarm control panel`,
`Fire alarm remote annunciator`), which is aliasing one material to
another's name (CLAUDE.md § Materials). Suggested: drop both.

**S2 — "sampling tube" on `Duct smoke detector`.** Once M1 exists, a search
for the tube should find the tube. Suggested: drop it with M1.

**S3 — "garage" on `Heat detector`.** A garage heat alarm is a 120V house
part (M4). Suggested: drop it with Q4.

**S4 — "18ah" on `12V 7Ah fire alarm battery`.** It names the 18Ah row.
Suggested: drop it.

**S5 — "addressable" on the conventional devices** (system smoke detector,
detector base, pull station) and **"conventional" on nothing addressable**:
dropped with Q3, so a search for "addressable" finds only addressable rows.

## Things that could price a bid wrong

**P1 — CS14 (commercial duct detector) buys a 120V house-alarm relay.**
`Relay module, smoke alarm` is the Kidde SM120X kind, wired off an
interconnected house alarm. A duct detector has its own alarm contacts for
fan shutdown, and what it does need — a **sampling tube**, sized to the
duct — is not in the recipe or the catalog. The relay is a $10–$33 line, so
the money is small; the recipe is simply the wrong parts. Q12.

**P2 — "smoke detector" finds a $25 house alarm and a $60 system head.**
On a commercial job the house alarm is the wrong part; on a house the
system head is. Q1 puts "120V" on the house parts.

**P3 — panels priced with no size.** A 5-zone conventional panel and a
50-point addressable one are each a $500–$1,500 line, and the next size up
is about double. Q2.

## Common items that are MISSING

Searched the whole catalog first: `Exit sign`, `Exit sign, double face`,
`Emergency light` and `Emergency light remote head` (Lighting Hardware) and
fire alarm cable (Wire & Cable, FPLR/FPLP, used by these starters) already
exist.

| #   | Item                                       | Listing                               | Why it is needed                                                                                                        | Search words                                |
| --- | ------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | `Duct detector sampling tube, 2-4 ft duct` | System Sensor DST3: **$15.93–$21.81** | Every duct detector needs one, sold separately by duct width (DST2 to 2 ft, DST5 4–8 ft $21.92–$33.30, DST10 $45.74).   | "dst3", "sampling tube", "duct tube"        |
| M2  | `Duct detector remote test station`        | Not priced on 2026-10-14              | Required where the detector cannot be reached to test it — above a ceiling or on a rooftop unit, which is most of them. | "rts", "remote test", "key test switch"     |
| M3  | `Magnetic door holder, 24V`                | Not priced on 2026-10-14              | Holds fire doors open and releases on alarm; a common fire-alarm line on schools and offices.                           | "door holder", "mag holder", "door release" |
| M4  | `Hardwired heat alarm, 120V`               | Not priced on 2026-10-14              | The garage and attic alarm on houses, interconnected with the smoke alarms. Today "garage" finds the system head.       | "garage heat", "heat alarm", "interconnect" |

Addressable versions of the system smoke detector and pull station are
**not** proposed as rows here. If the owner wants them (Q3), they are new
rows with the fit description of Q11.

## Owner questions, with suggested answers

**Q1. House alarms: put "120V" in the names?**
Suggested: **yes**: `Hardwired smoke detector, 120V`, `Hardwired smoke/CO
detector, 120V`, `Hardwired CO detector, 120V` (and 1347 under Q8). The
system head next to them is a different product at a different price, and
today both answer "smoke detector".

**Q2. Fire alarm panels: name the size?**
Suggested: **yes**: `Conventional fire alarm control panel, 5-zone` (CK5)
and `Addressable fire alarm control panel, 50-point`, and drop
"addressable" and "annunciator" from the conventional panel (S1). The next
size up is about double the price.

**Q3. System detector, base and pull station: conventional?**
Suggested: **yes**: `System smoke detector, conventional, photoelectric`,
`Detector base, conventional 2-wire`, `Fire alarm pull station,
conventional, double action`, and drop "addressable" from their search
words (S5). They go with CK5's conventional panel; an addressable device
only works on its maker's panel, so addressable ones are new rows if
wanted.

**Q4. Heat detector: name it?**
Suggested: **yes**: `Heat detector, 135°F fixed/rate-of-rise`, drop
"garage" (S3), and add M4 for the house garage alarm. CK16 puts it on a
system base, so it is the system part.

**Q5. The two relay modules: names that tell them apart?**
Suggested: **yes**: 1341 `Addressable relay module` and 1351 `Smoke alarm
relay module, 120V`. Today "Fire alarm relay module" and "Relay module,
smoke alarm" read as the same thing.

**Q6. Beam detector: `Beam smoke detector, reflected`?**
Suggested: **yes**. The reflected kind is the common one; a two-ended beam
is a different part.

**Q7. Knox box: `Rapid-entry key box, surface mount`, plus a description?**
Suggested: **yes**, with the description "Ordered through the local fire
department's account." Surface and recessed are different boxes, and it
is not a counter item.

**Q8. 10-year alarm: `Hardwired smoke detector, 120V, 10-year sealed battery`?**
Suggested: **yes**. The sealed battery is what the extra money buys.

**Q9. Exit combo: `Exit sign / emergency light combo, LED`, and move it to
Lighting Hardware?**
Suggested: **yes to the name, and move it**, so it sits beside `Exit sign`
and `Emergency light`. A shelf change is a category edit, not a rename; LT28
and DR15 follow by key.

**Q10. Detector mounting bracket and wiring harness: keep?**
Suggested: **keep both, with names `Smoke alarm mounting plate, 120V` and
`Smoke alarm wiring harness, 120V` and the description "Fits the alarm's
own brand — order with the alarm".** Both are replacement parts for house
alarms; the description stops someone pricing a harness that will not
plug in.

**Q11. Fit descriptions on the panel-side parts?**
Suggested: **yes**: "Works only with the panel's own maker" on
`Addressable monitor module`, `Addressable relay module` and `Fire alarm
remote annunciator`; "Value set by the panel maker; panels ship with
them" on `End-of-line resistor`. Same idea as the panel parts (Panels Q8).

**Q12. CS14 (duct smoke detector): swap the 120V relay for a sampling tube?**
Suggested: **yes, a proposal that waits for your yes**: CS14's `Relay
module, smoke alarm` line becomes M1 `Duct detector sampling tube, 2-4 ft
duct`, x1; M1 and M2 are added as rows. The detector's own contacts shut
the fan down; the tube is the part every duct detector needs. M2 stays out
of the starter, because it is only needed where the detector cannot be
reached.

**Q13. Add M3 (magnetic door holder)?**
Suggested: **yes**, unpriced like every row, priced from one listing A
checks. It is the most common fire-alarm line the shelf does not have.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; M1–M4 are new seed rows with their search words.
- Q9's shelf move is a category edit on `Emergency exit light combo` (and
  its rename); `scripts/categoryAudit.mts` before and after — Life Safety
  26 → 25 (+ M rows), Lighting Hardware +1. If either count is off, stop
  and find out why.
- **Starter edits: only CS14 (Q12), and only on a yes.** It is a part swap
  in `server/seed/starterAssemblies.ts` plus a key in
  `server/seed/starterParts.ts`. Every other starter follows its renamed
  row by key.
- Run `scripts/searchSpotCheck.mts` for "smoke detector", "smoke alarm",
  "facp", "fire alarm panel", "pull station", "horn strobe", "duct
  detector", "sampling tube", "heat detector", "knox", "exit sign",
  "relay module" and "door holder". "smoke detector" should show both the
  120V alarm and the system head, each named so the difference is plain.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it.
