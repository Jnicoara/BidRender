# Receptacles — name review (2026-10-13, Track C)

**Read-only review. No name has been changed.** For each row on the
"Receptacles" shelf of `starter-catalog-pricing.xlsx` ("Starter prices", rows
**788–827**, 40 rows, in the app-order sort of `28245633`), the question is
whether one real product can be priced at Platt or Home Depot from the name
alone. The workbook was read from a fresh copy, because the owner has it
open. It is the shelf after Boxes (A, `boxes-name-review.md`), which follows
Underground (`underground-name-review.md`).

**The test** uses the properties a supply house names a receptacle by:
amperage and NEMA configuration; single, duplex or quad; standard (duplex
face) or decorator face; tamper-resistant (TR) or not; weather-resistant;
grade (residential, commercial, spec/industrial); flush or surface for the
big straight-blade and locking devices. For the specialty devices, what the
special part is (half controlled, USB ports, finish). A name that leaves out
something that changes the price is "vague".

**Verdicts:** **OK**; **Needs a word**, with the exact words; **Not a real
product**; **Two products in one row**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
No run type prices a receptacle. The **plate** each starter uses was read as
well (`server/seed/starterAssemblies.ts`), because it says which face the
receptacle has: a duplex plate means a standard face, a decorator plate a
decorator face.

**Sources.** Listings checked on 2026-10-13 at homedepot.com and platt.com.
Platt shows most devices as "call for price", so where it did, another supply
house is named (SupplyHouse, EMI, Elliott, Crescent, Steiner). Prices only
show how big a question is; they are not proposed prices.

**Already decided, and not reopened here:**

- **15A is the plain name and 20A says so** ("Moved from the pricing sheet,
  2026-09-25", `server/seed/materials/devices.ts`). The sheet names already
  carry "15A" (renamed since).
- **Spec grade is its own row** (owner's catalog review, 2026-10-08).
- **Range and dryer carry NEMA in the name; the dryer split by wiring**
  (10-30R 3-wire, 14-30R 4-wire) (catalog review, 2026-10-08).
- **`50a-rv-receptacle` resolves to the 14-50R row**
  (`server/seed/starterParts.ts`), and the separate `50A RV receptacle` row
  is not on the sheet.
- **L15-30, L21-30, the pop-up countertop receptacle** came from the coverage
  check (owner-approved, 2026-10-09).
- **"Dead-front GFCI device" ends in "device" on purpose**, so it does not
  lead a "gfci" search (seed comment).

## Existing rows

| Row | Current name                                 | Used by                                                    | Verdict / proposed words                                                                            | Why                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 788 | `15A 250V receptacle, NEMA 6-15R`            | —                                                          | **Needs a word:** `15A 250V single receptacle, NEMA 6-15R`                                          | 6-15R and 6-20R are sold as single AND duplex, at 2–3× apart (below). Single is the common window-AC and equipment one.                                                                                                                                                                                      |
| 789 | `20A 250V receptacle, NEMA 6-20R`            | 208V cooler / freezer (CK6)                                | **Needs a word:** `20A 250V single receptacle, NEMA 6-20R`                                          | Leviton 5821 single, $4.15–$4.91 (Lighting Supply, EMI); 5822 duplex, $12.40 (EMI). CK6 uses the single-receptacle raised cover, so the starter means single.                                                                                                                                                |
| 790 | `30A 250V receptacle, NEMA 6-30R`            | 208V kitchen equipment, 30A                                | OK                                                                                                  | Single only. **But see P5**: its starter's cover may not fit it.                                                                                                                                                                                                                                             |
| 791 | `50A 250V receptacle, NEMA 6-50R`            | Welder / shop, 50A                                         | **Needs a word** (Q7): `…, NEMA 6-50R, flush`                                                       | Sold flush and surface. The starter uses the 4-11/16" 30A/50A raised cover, which takes the flush one.                                                                                                                                                                                                       |
| 792 | `AFCI receptacle`                            | AFCI receptacle (DV9)                                      | **Needs words:** `15A AFCI receptacle, tamper-resistant`                                            | HD Leviton AFTR1-W, 15A TR, **$22.50**; a 20A version (AFTR2) also exists. Decorator face only, which DV9's decorator plate matches.                                                                                                                                                                         |
| 793 | `Controlled duplex receptacle`               | Controlled receptacle, plug load (DV25)                    | **Needs words** (Q10): `20A duplex receptacle, half controlled, tamper-resistant`                   | Plug-load receptacles come half or fully controlled, and TR or not: P&S TR5362CHW, 20A half controlled TR, **$13.19** (Elliott); 5362CHW, not TR, $7.39 (SupplyHouse). Half controlled is the usual energy-code layout.                                                                                      |
| 794 | `Dead-front GFCI device`                     | —                                                          | **Needs a word:** `20A dead-front GFCI device`                                                      | Sold in 15A and 20A. No listing priced was found on 2026-10-13 (searched for the Leviton GFNF2); the 20A is the one that protects a 20A circuit.                                                                                                                                                             |
| 795 | `30A dryer receptacle, NEMA 10-30R (3-wire)` | —                                                          | **Needs a word** (Q7): `…, flush`                                                                   | Same as 796.                                                                                                                                                                                                                                                                                                 |
| 796 | `30A dryer receptacle, NEMA 14-30R (4-wire)` | Dryer receptacle, 30A (RS2)                                | **Needs a word** (Q7): `…, flush`                                                                   | Flush (Leviton 278-S00, SupplyHouse **$8.67**) and surface (HD ELEGRP 2205, **$16.51**) are both stocked. RS2 uses the 4-11/16" raised cover, which takes the flush one; a surface one needs no box or cover at all.                                                                                         |
| 797 | `15A duplex receptacle`                      | **6 starters** (DV1, DV3, DV6, RS5, MS12, CK23)            | **Needs words** (Q2, Q3): `15A duplex receptacle, standard, tamper-resistant`                       | **Face and TR change the price.** HD Leviton T5320-WMP, 15A TR standard, **$10.48 per 10**; T5325-WMP, the decorator, **$19.88 per 10** (2×). Every starter here uses a duplex plate, so the standard face is what they mean.                                                                                |
| 798 | `20A duplex receptacle`                      | **12 starters**, residential and commercial                | **Needs words** (Q2, Q3, Q4): `20A duplex receptacle, standard, tamper-resistant, commercial grade` | The most-used row on the shelf. Leviton T5820-W, 20A TR residential, **$3.59** each in a box of 10 (SupplyHouse); HD Leviton CBR20-W, commercial grade (not TR), **$3.18**; Hubbell 5362W spec grade, **$9.57** (MRO). Nine of the twelve are commercial starters; all use a duplex plate or a duplex cover. |
| 799 | `20A duplex receptacle, spec grade`          | —                                                          | **Needs a word:** `20A duplex receptacle, standard, spec grade`                                     | Hubbell 5362 class ($9.57–$12.18, MRO, Master Electronics). Decorator spec grade exists too. TR follows Q2.                                                                                                                                                                                                  |
| 800 | `15A duplex receptacle, weather-resistant`   | —                                                          | **Needs a word:** `15A duplex receptacle, standard, weather-resistant`                              | WR devices are also TR (seed comment), so TR need not be said. The face still varies.                                                                                                                                                                                                                        |
| 801 | `20A duplex receptacle, weather-resistant`   | —                                                          | **Needs a word:** `20A duplex receptacle, standard, weather-resistant`                              | As 800.                                                                                                                                                                                                                                                                                                      |
| 802 | `Floor receptacle assembly`                  | —                                                          | **Two products in one row**, or a kit (Q8)                                                          | "Assembly" is box + cover + device. A Hubbell RF515BR brass kit is about **$140**; a plastic pop-up for a wood floor about $52 (HD Newhouse 7400BK). DV33 already builds a floor receptacle from the floor box, cover and duplex rows.                                                                       |
| 803 | `15A GFCI receptacle`                        | GFCI receptacle (DV5)                                      | **Needs a word** (Q2): `15A GFCI receptacle, tamper-resistant`                                      | HD Leviton GFTR1-KW, 15A TR self-test, **$17.98**; GFNT1, not TR, about $16. Every GFCI sold now self-tests, so that word is not needed. Decorator face only.                                                                                                                                                |
| 804 | `20A GFCI receptacle`                        | **6 starters** (kitchen, bath, EWC, replace, old work, MC) | **Needs a word** (Q2): `20A GFCI receptacle, tamper-resistant`                                      | As 803, 20A (Leviton GFTR2 class). Not priced on 2026-10-13.                                                                                                                                                                                                                                                 |
| 805 | `15A GFCI receptacle, weather-resistant`     | 3 starters (outdoor, landscape, temp pole ×2)              | OK                                                                                                  | WR GFCIs are TR and self-test: HD Leviton EGFW1, 15A TR WR. One product.                                                                                                                                                                                                                                     |
| 806 | `20A GFCI receptacle, weather-resistant`     | RTU service receptacle                                     | OK                                                                                                  | As 805, 20A.                                                                                                                                                                                                                                                                                                 |
| 807 | `Hospital-grade receptacle`                  | Hospital-grade receptacle (exam / operatory)               | **Needs words:** `20A hospital-grade duplex receptacle, tamper-resistant`                           | HD Leviton 8300-SGI, 20A HG TR, **$14.46**; Hubbell 8300, $22.86 (MRO). 20A duplex is the usual one; TR is required in pediatric areas and costs little more.                                                                                                                                                |
| 808 | `Isolated-ground receptacle`                 | Isolated-ground receptacle (cash wrap)                     | **Needs words:** `20A isolated-ground duplex receptacle`                                            | Leviton 5362-IG, orange, 20A, **$9.07–$10.49** (EMI, Nassau). 15A and single versions exist. TR follows Q2.                                                                                                                                                                                                  |
| 809 | `L14-30 receptacle`                          | Twist-lock receptacle, L14-30 (CS8)                        | OK. **See P5**                                                                                      | A locking receptacle is a flush single; the NEMA number is the product. Leviton 2710, $19.15–$86.51 depending on the house (Standard Electric, Crescent).                                                                                                                                                    |
| 810 | `L15-30 receptacle`                          | —                                                          | OK                                                                                                  | As 809.                                                                                                                                                                                                                                                                                                      |
| 811 | `L21-30 receptacle`                          | —                                                          | OK                                                                                                  | As 809.                                                                                                                                                                                                                                                                                                      |
| 812 | `L5-20 receptacle`                           | Twist-lock receptacle, L5-20 (CS6)                         | OK                                                                                                  | Leviton 2310, $24.50–$39.40 (Walmart, Crescent).                                                                                                                                                                                                                                                             |
| 813 | `L6-30 receptacle`                           | Twist-lock receptacle, L6-30 (CS7)                         | OK. **See P5**                                                                                      | Leviton 2620, $14.48–$60.52 (EMI, Cesco).                                                                                                                                                                                                                                                                    |
| 814 | `Pop-up countertop receptacle`               | Island / peninsula pop-up (CK24)                           | **Needs words** (Q9): `Pop-up countertop receptacle, 20A TR duplex, stainless`                      | Price runs from a basic 15A tower to a USB model at **$290** (Sonic Electric, Lew Electric 20A TR duplex + 2 USB); Mockett's PCS39 is 15A + USB-C. Ampacity, USB and finish are each a price step. A kitchen counter circuit is 20A.                                                                         |
| 815 | `Pop-up floor receptacle`                    | —                                                          | **Needs words** (Q9): `Pop-up floor receptacle, 15A TR duplex, wood floor`                          | HD Newhouse 7400BK, 15A TR duplex, for wood subfloor, **$52.40**; kits run to $208–$251 (Newegg, Cable Organizer). **Its search words say "countertop island"**, which name row 814 (CLAUDE.md: never alias one material to another).                                                                        |
| 816 | `15A quad receptacle`                        | Quad receptacle (DV11)                                     | **Owner pick** (Q5)                                                                                 | **One device or two?** A one-piece 4-plex (Bryant 1254W, 15A commercial, **$31.71**; Hubbell HBL415, $32.35) or two 15A duplexes (about **$2** for the pair). DV11 prices ONE of this row with a duplex/duplex plate; DV22, its MC twin, prices two 20A duplexes. See P1.                                    |
| 817 | `20A quad receptacle`                        | —                                                          | **Owner pick** (Q5)                                                                                 | As 816.                                                                                                                                                                                                                                                                                                      |
| 818 | `50A range receptacle, NEMA 14-50R`          | Range (RS1); **EV / RV, 50A (RS13)**                       | **Needs a word** (Q7): `…, flush`. **And Q6**                                                       | Leviton 279-S00 flush, **$9.63** (SupplyHouse); surface ones about $12 (Walmart). The heavy-duty, EV-rated Leviton 1450R is **$70.73–$126.11** (Lumen, Crescent). See P2.                                                                                                                                    |
| 819 | `Recessed clock receptacle`                  | Recessed clock receptacle                                  | OK                                                                                                  | Always a 15A single in a recessed cup with a hanger hook: Leviton 688, $14.58–$32.81 (Lighting Supply, Crescent).                                                                                                                                                                                            |
| 820 | `Recessed TV receptacle box`                 | Wall TV location, residential and commercial               | **Needs words:** `Recessed TV box, 2-gang, power + low voltage`                                     | It is a box, not a receptacle: Arlington TVBU505, 2-gang, power one side and low voltage the other, **$15.99–$23.99** (GME, Parts Express). Both starters add the duplex and an HDMI plate separately, so the box alone (not the TVBU505K kit, $38.99) is right. "receptacle box" stays a search word.       |
| 821 | `20A red emergency receptacle`               | —                                                          | **Needs words:** `20A duplex receptacle, red, commercial grade`                                     | P&S CR20RED, 20A commercial, red, **$4.01** (Crescent); Leviton 16352-R spec grade red, $12.54 (SupplyHouse). The name does not say duplex. "emergency" stays a search word with the critical-branch words it already has.                                                                                   |
| 822 | `30A RV receptacle, NEMA TT-30R`             | —                                                          | OK                                                                                                  | HD ELEGRP 2107S, TT-30R flush, **$12.99**. One common product.                                                                                                                                                                                                                                               |
| 823 | `15A single receptacle`                      | —                                                          | **Needs a word** (Q2): `15A single receptacle, tamper-resistant`                                    | Single receptacles are one face. TR is the only open property.                                                                                                                                                                                                                                               |
| 824 | `20A single receptacle`                      | 3 starters (sump, reach-in cooler, microwave)              | **Needs words** (Q2, Q4): `20A single receptacle, tamper-resistant, commercial grade`               | Residential and commercial starters share it, as 798.                                                                                                                                                                                                                                                        |
| 825 | `Surge-protective receptacle`                | —                                                          | **Needs words:** `15A surge-protective duplex receptacle, tamper-resistant`                         | Leviton T5280, 15A TR decorator, **$61.74** (Leviton); T5380, the 20A, $137.81 (Lumen). Decorator face only.                                                                                                                                                                                                 |
| 826 | `Switch/receptacle combo device`             | Switch/receptacle combo (DV12)                             | **Needs words:** `Switch/receptacle combo device, 15A, single-pole, tamper-resistant`               | Leviton 5225, duplex style (one standard duplex plate, which DV12 uses), $9.38–$28.95; T5225, the TR one, $31.64 (Steiner, Lumen). Decorator combos exist too, so "duplex style" could be added if Q3 wants it said.                                                                                         |
| 827 | `USB combo receptacle`                       | USB combo receptacle (DV10)                                | **Needs words:** `USB combo receptacle, 15A, Type A + C, tamper-resistant`                          | HD Leviton T5633, 15A TR decorator, Type A + C, **$28.89–$30.99**; the 20A T5833 (hospital grade) **$51.02**. Type A/A models are cheaper. DV10 uses a decorator plate, which matches.                                                                                                                       |

**Totals, by row: 40.** OK: 10 (790, 805, 806, 809–813, 819, 822). Needs
words: 27 (788, 789, 791–801, 803, 804, 807, 808, 814, 815, 818, 820, 821,
823–827). Owner pick: 2 (816, 817). Two products in one row: 1 (802). Not a
real product: 0. 10 + 27 + 2 + 1 = 40.

## Things that could price a bid wrong

**P1 — the quad receptacle may be priced at 15× what the starter means.**
DV11 takes ONE `15A quad receptacle` and a duplex/duplex plate. If the owner
prices the one-piece 4-plex (about $32), DV11 is right only if that is what
the shop fits; if the shop fits two duplexes, as DV22 does, DV11 is about $30
high on every quad. If the owner prices "a quad" as two $1 duplexes, the row
means something no counter sells. Q5.

**P2 — the EV starter prices a $10 receptacle where an EV-rated one is
$70–$126.** RS13 `EV / RV receptacle, 50A (NEMA 14-50)` resolves to the range
row. EVSE makers call for an industrial-grade 14-50R on a charger, because a
continuous 40A load burns out a light-duty one. Q6.

**P3 — standard vs decorator is a 2× step on the two most-used rows** (797
and 798, 18 starters between them). All 18 use a duplex plate, so a price
taken from a decorator 10-pack is both too high and the wrong part for the
plate.

**P4 — the pop-up countertop receptacle runs $50–$300** with no word in the
name to say which. CK24 prices one. Q9.

**P5 — the 30A locking starters may price a cover their receptacle does not
fit.** CS7 (L6-30) and CS8 (L14-30) take `4" square raised cover, single
receptacle` (row 765). That cover's opening is for a 15A/20A single. A 30A
locking device needs the 1.719" locking opening (Raco 811C, Ferguson,
Crescent). **Check L5-20 (CS6) and 6-30R (row 790's starter) against the
cover too**; this review confirmed only the 30A locking size. The row is on
the Boxes shelf, whose review did not raise it. Q11.

**P6 — "Dedicated 20A receptacle" (DV3) prices the 15A duplex.** It has a 20A breaker and 12/2, and its name says 20A. A 15A duplex on a 20A circuit is allowed, because a duplex is two receptacles, but an estimator reading "20A" on the bid expects the 20A device, and DV7 (`20A duplex receptacle`) already exists beside it. The price step is small (T5320 $1.05 vs T5820 $3.59 each); the wrong part is the point. Q13.

**Packs.** 15A/20A duplex, single, quad, spec grade, WR and the 6-15R/6-20R
rows say `box of 10` / 10; the rest `each` / 1. That matches how they are
sold (HD T5320-WMP and T5325-WMP are 10-packs; specialty devices are sold
singly). No pack row is added to `pack-label-scan.md`.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-13.

| #   | Item                                                                                                          | Listing                                                                               | Why it is needed                                                                                                                                                        | Search words                                    |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R1  | `15A duplex receptacle, decorator, tamper-resistant` and `20A duplex receptacle, decorator, tamper-resistant` | HD Leviton T5325-WMP, 15A TR decorator, **$19.88 per 10**; the 20A is the T5825 class | Only needed once Q3 names the shipped duplexes "standard". Many houses are wired all-decorator, and today there is no decorator duplex to price. Pack `box of 10` / 10. | "decora", "decorator", "rocker style", "square" |
| R2  | `50A receptacle, NEMA 14-50R, industrial grade (EV)`                                                          | Leviton 1450R, **$70.73–$126.11** (Lumen, Crescent); Hubbell and Bryant equivalents   | For RS13 and any EV outlet (P2, Q6).                                                                                                                                    | "ev", "tesla", "car charger", "heavy duty"      |
| R3  | `4" square raised cover, 30A locking receptacle` (Boxes shelf)                                                | Raco 811C, 1/2" raised, 1.719" opening (Ferguson, Crescent, Walmart)                  | For CS7 and CS8 (P5, Q11).                                                                                                                                              | "twist lock cover", "locking cover", "811c"     |

`Generator cord cap, L14-30` and the 30A and 50A power inlet boxes are on the
Equipment & Appliances shelf, and the in-use covers on Wall Plates & Misc, so
they are not listed.

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for surface raceway and underground. No receptacle
name is built by the takeoff, so these are plain renames through
`RENAMED_BASELINE_MATERIALS`, each old name kept as a search word.

**Q2. Tamper-resistant on every 15A and 20A, 125V row?**
Suggested: **yes.** It is required in every dwelling and in many commercial
occupancies, it costs cents (T5320 $1.05 each in a 10-pack), and one row
then serves both kinds of job.

**Q3. Duplex, single and quad rows say "standard"; GFCI, AFCI, USB and surge
are decorator only, so they need no word.**
Suggested: **yes**, because every starter using a duplex plate means the
standard face. Add R1 for decorator jobs.

**Q4. Grade for the 20A duplex and 20A single (15 starters, both kinds of
job)?**
Suggested: **commercial grade.** It is within about a dollar of residential
(HD CBR20 $3.18 vs T5820 $3.59), so the residential starters lose little,
and the nine commercial starters get the device a commercial job expects.
Spec grade stays its own row.

**Q5. Quad: one 4-plex device, or two duplexes?**
Suggested: **two duplexes.** Change DV11 to two `15A duplex receptacle` (as
DV22 does with 20A), and retire both quad rows (hidden, not deleted), with
"quad", "fourplex" and "4-plex" as search words on the duplex rows. A shop
that fits one-piece 4-plex devices can add its own row.

**Q6. EV on 14-50R: add an industrial-grade row and point RS13 at it?**
Suggested: **yes** (R2). RS1 (range) keeps the flush row.

**Q7. "flush" on the 14-50R, 14-30R, 10-30R and 6-50R?**
Suggested: **yes.** Every starter that uses them takes the 4-11/16" raised
cover, which only fits a flush device. Surface ones are new rows if wanted.

**Q8. Floor receptacle assembly (802): retire it?**
Suggested: **yes, retire (hide), with its name as a search word on the
floor box row.** DV33 already builds the same thing from the floor box,
cover and duplex, and those rows carry the brass-or-plastic choice (A's
Boxes review).

**Q9. Pop-ups: which ones ship?**
Suggested: **countertop: 20A TR duplex, stainless, no USB; floor: 15A TR
duplex, for a wood floor.** Remove "countertop" and "island" from the floor
one's search words. USB and other finishes are new rows if wanted.

**Q10. Controlled receptacle: half controlled, 20A, TR?**
Suggested: **yes** (P&S TR5362CH class). Fully controlled is a new row if
wanted.

**Q11. 30A locking cover (P5): add R3 and point CS7 and CS8 at it?**
Suggested: **yes**, after A checks whether the L5-20 and the 6-30R fit the
single-receptacle cover they use now.

**Q12. Add R1, R2 and R3?**
Suggested: **yes to all three**, R1 only if Q3 is yes.

**Q13. DV3 "Dedicated 20A receptacle": price the 20A duplex?**
Suggested: **yes**, change its part from `duplex-receptacle` to
`20a-duplex-receptacle`. Its name, breaker and wire are already 20A.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS` and retirements through
  `RETIRED_BASELINE_MATERIALS`, each old name kept as a search word on the
  ONE row that replaces it. **Starter recipes name KEYS**
  (`server/seed/starterParts.ts`), so a rename needs no starter edit.
- Q5, Q6 and Q13 are starter edits: DV3's part (Q13), DV11's part and quantity, RS13's part (the
  `50a-rv-receptacle` key moves to R2). Q11 is CS7 and CS8 (and CS6 or the
  6-30R starter if the check finds they do not fit).
- Fix row 815's search words in the same commit as its rename.
- Run `scripts/searchSpotCheck.mts` for "outlet", "plug", "recep", "20a
  outlet", "gfi", "gfci", "tr", "decora", "quad", "14-50", "ev", "dryer",
  "twist lock", "usb", "pop up" and "tv box". Each should surface its own row
  first, and a plain "outlet" or "recep" must still surface the 15A and 20A
  duplex rows first.
- If a recount finds a starter using a receptacle row this review did not
  list, or a run type using any of rows 788–827, stop and find out why first.
