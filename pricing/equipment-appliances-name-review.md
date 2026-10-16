# Equipment & Appliances — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Equipment & Appliances" shelf of `starter-catalog-pricing.xlsx` ("Starter
prices", spreadsheet rows **1582–1646**, 65 rows, in the app-order sort),
the question is whether one real product can be priced from the name alone.
The workbook was read from a copy of the owner's live file
(`C:\dev\BidPhase\pricing\starter-catalog-pricing.xlsx`, saved 19:29 today),
which now differs from the worktree's copy. **On this shelf the owner has
already fixed two packs there:** row 1598 `Dishwasher whip` and row 1602
`4" duct clamp, worm gear` are both `each` / 1 (the two rows
`pack-label-scan.md` flagged). It is the shelf after Fasteners & Anchors
(`fasteners-anchors-name-review.md`); Distribution Equipment starts at row
1647.

**Source rule (owner, 2026-10-14; `new-rows-source-check.md`):** every
listing below is from Home Depot, Platt or Stoneway. A new row found there
is COMMON and takes its Example price from there; one found at none of the
three is SPECIALTY, added with the price blank and "Specialty - price from
your supplier." Prices quoted below are as the listing showed them that day
(some pages were old copies), so A re-reads every price at the store.

The sheet's 65 names match `BASELINE_MATERIALS`' Equipment & Appliances rows
one for one (read from the seed the same day), so the search words quoted
below are the catalog's own. No row carries a description.

**The test.** Equipment is bought by its size and rating: watts or kW,
voltage, amps, CFM, HP, length, and the plug (NEMA 14-30, 14-50, 10-30,
L14-30, CS6364) and whether it is 3- or 4-wire. A name with none of those
cannot be priced: a 500W 2 ft baseboard heater and a 2500W 10 ft one are
both "Baseboard heater". A second test on this shelf: **does the product
come with something the starter also counts?** A transfer-switch kit with
its own inlet and cord, or a floor-heat kit with its own thermostat, prices
the same part twice.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**39 of the 65 rows are used** (the sheet's "Used by" column says the same).
The busiest: `4" duct clamp, worm gear` (RS7, RS8, CK21, x2 each), `AC whip,
3/4" x 6 ft liquidtight, #8` (MH1, MH4, CK13), `4" insulated flex duct, 25
ft` (RS7, RS8, CK21); the generator rows (RS18, GR4, CW10, PG19); the well
pump rows (RS16). Most others are one starter's appliance line, marked
`fixture` — by decision D2 (`references/starter-assemblies-plan.md`) the
appliance is its own line so an owner-furnished job deletes one line. **No
run type uses this shelf.**

**Packs:** every row is `each` / 1 in the owner's copy (see § Packs).

## Existing rows

| Row  | Name                                        | Used by          | Verdict         | Exact words / note                                                                                                                                                 |
| ---- | ------------------------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1582 | `30A 6-circuit manual transfer switch`      | CW10             | **Needs words** | `30A 6-circuit manual transfer switch, switch only` (Q2). The common kit carries its own inlet and cord, which CW10 already counts (P1).                            |
| 1583 | `AC whip, 3/4" x 6 ft liquidtight, #8`      | MH1, MH4, CK13   | **OK**          | Size, length and wire named. A 1/2" #10 whip is missing (M2).                                                                                                      |
| 1584 | `Attic fan`                                 | RS20             | **Needs words** | `Attic fan, gable mount, 1300 CFM` (Q3). Gable and roof fans differ; 1300 CFM is the common gable size at Home Depot.                                              |
| 1585 | `Attic fan thermostat`                      | RS20             | **OK**          | A separate adjustable control. See P5.                                                                                                                             |
| 1586 | `4" backdraft damper`                       | —                | **OK**          |                                                                                                                                                                    |
| 1587 | `6" backdraft damper`                       | —                | **OK**          |                                                                                                                                                                    |
| 1588 | `Baseboard heater`                          | RS19             | **Needs words** | `Baseboard heater, 1500W 240V, 6 ft` (Q4) — Cadet 6F1500W at Home Depot and Platt.                                                                                 |
| 1589 | `Baseboard heater thermostat`               | RS19             | **Needs words** | `Baseboard heater thermostat, line voltage, double-pole, wall mount` (Q4). A heater-mounted one fits one heater brand only.                                         |
| 1590 | `Bath exhaust fan, 50 CFM`                  | —                | **OK**          | Search words: S6.                                                                                                                                                  |
| 1591 | `Bath exhaust fan, 80 CFM`                  | RS7              | **OK**          | Search words: S6.                                                                                                                                                  |
| 1592 | `Bath exhaust fan, 110 CFM`                 | —                | **OK**          | Search words: S6.                                                                                                                                                  |
| 1593 | `Bath exhaust fan, 150 CFM`                 | —                | **OK**          | Search words: S6.                                                                                                                                                  |
| 1594 | `Bath exhaust fan, heater combo`            | CK21             | **Needs words** | `Bath exhaust fan, heater/light combo, 80 CFM, 1300W` (Q5) — Home Depot Broan 765H80L.                                                                             |
| 1595 | `Bath exhaust fan, light combo`             | RS8              | **Needs words** | `Bath exhaust fan, LED light combo, 80 CFM` (Q5) — Home Depot Broan AN80L.                                                                                         |
| 1596 | `Ceiling fan remote kit`                    | —                | **OK**          | A universal receiver-and-handset kit.                                                                                                                              |
| 1597 | `Cord reel`                                 | —                | **Needs words** | `Cord reel, 12/3, 50 ft, ceiling mount` (Q6).                                                                                                                      |
| 1598 | `Dishwasher whip`                           | RS4              | **Owner pick**  | What it is (Q7). Pack already `each` in the owner's copy.                                                                                                          |
| 1599 | `Doorbell transformer`                      | RS10, RS11       | **Needs words** | `Doorbell transformer, 16V 30VA` (Q8). A 10VA one will not run RS11's video doorbell (P3).                                                                        |
| 1600 | `Dryer cord, 3-wire`                        | —                | **Needs words** | `Dryer cord, 3-wire, 30A, 6 ft` (Q9), matching the range cord row's pattern.                                                                                       |
| 1601 | `Dryer cord, 4-wire`                        | RS2              | **Needs words** | `Dryer cord, 4-wire, 30A, 6 ft` (Q9) — Home Depot HDX HD#601-004.                                                                                                  |
| 1602 | `4" duct clamp, worm gear`                  | RS7, RS8, CK21   | **OK**          | Pack already `each` in the owner's copy.                                                                                                                           |
| 1603 | `Electric unit heater, 5 kW 240V`           | MH12             | **OK**          |                                                                                                                                                                    |
| 1604 | `32A EV charger`                            | —                | **Needs words** | `32A EV charger, plug-in, NEMA 14-50` (Q10).                                                                                                                       |
| 1605 | `40A EV charger`                            | —                | **Needs words** | `40A EV charger, plug-in, NEMA 14-50` (Q10).                                                                                                                       |
| 1606 | `48A EV charger`                            | RS12             | **Needs words** | `48A EV charger, hardwired` (Q10). 48A cannot be plug-in; RS12 is named "hardwired".                                                                               |
| 1607 | `EVSE pedestal`                             | CW2              | **Owner pick**  | A mount, or a charger on a pedestal (Q11, P7).                                                                                                                     |
| 1608 | `Fan balancing kit`                         | —                | **OK**          |                                                                                                                                                                    |
| 1609 | `12" fan downrod`                           | —                | **OK**          | Universal 3/4" downrod is the default.                                                                                                                             |
| 1610 | `24" fan downrod`                           | —                | **OK**          | Same.                                                                                                                                                              |
| 1611 | `36" fan downrod`                           | —                | **OK**          | Same.                                                                                                                                                              |
| 1612 | `Fan-forced wall heater, 2000W 240V`        | CK14             | **OK**          |                                                                                                                                                                    |
| 1613 | `Floor heating mat`                         | CK22             | **Needs words** | `Floor heating mat, 120V, 30 sq ft, mat only` (Q12). Kits carry a thermostat CK22 already counts (P4).                                                             |
| 1614 | `Floor heating thermostat, GFCI`            | CK22             | **OK**          |                                                                                                                                                                    |
| 1615 | `Foil duct tape`                            | —                | **Needs words** | `Foil duct tape, 1.89" x 50 yd` (Q13) — Home Depot Nashua 322.                                                                                                     |
| 1616 | `Garbage disposal cord`                     | RS5              | **Needs words** | `Garbage disposal cord kit, 3 ft` (Q14).                                                                                                                           |
| 1617 | `Generator battery charger`                 | PG19             | **Owner pick**  | The standby unit has a charger built in and the battery is sold separately (Q1, P2). **STARTER EDIT.**                                                             |
| 1618 | `30A generator cord`                        | RS18, CW10       | **Needs words** | `30A generator cord, L14-30, 25 ft` (Q15).                                                                                                                         |
| 1619 | `50A generator cord`                        | GR4              | **Owner pick**  | Which ends (Q15). Suggested `50A generator cord, 14-50P to CS6364, 25 ft`.                                                                                         |
| 1620 | `Generator cord cap, CS6365`                | —                | **OK**          | CS6365 is the 50A plug.                                                                                                                                            |
| 1621 | `Generator cord cap, L14-30`                | —                | **OK**          |                                                                                                                                                                    |
| 1622 | `Generator interlock kit`                   | RS18, GR4        | **Owner pick**  | Fits one panel family and main size (Q16, P6).                                                                                                                     |
| 1623 | `Generator pad`                             | PG19             | **Needs words** | `Generator pad, 54" x 31" x 3", 9–26 kW air-cooled` (Q17) — Platt Generac 10000007852.                                                                             |
| 1624 | `Humidity sensor switch`                    | RS8              | **OK**          |                                                                                                                                                                    |
| 1625 | `6" inline duct fan`                        | —                | **Needs words** | `6" inline duct fan, 240 CFM` (Q13). 6" fans run 240–412 CFM at Home Depot.                                                                                        |
| 1626 | `4" insulated flex duct, 25 ft`             | RS7, RS8, CK21   | **OK**          |                                                                                                                                                                    |
| 1627 | `6" insulated flex duct, 25 ft`             | —                | **OK**          |                                                                                                                                                                    |
| 1628 | `30A power inlet box`                       | RS18, CW10       | **Needs words** | `30A power inlet box, L14-30` (Q15) — Reliance PB30.                                                                                                               |
| 1629 | `50A power inlet box`                       | GR4              | **Needs words** | `50A power inlet box, CS6375` (Q15) — Reliance PB50.                                                                                                               |
| 1630 | `Pump control relay`                        | —                | **Owner pick**  | No one product (Q18).                                                                                                                                              |
| 1631 | `Range cord, 3-wire`                        | —                | **Needs words** | `Range cord, 3-wire, 50A, 6 ft` (Q9) — Home Depot HDX HD#626-634.                                                                                                  |
| 1632 | `Range cord, 4-wire, 50A, 6 ft`             | RS1              | **OK**          |                                                                                                                                                                    |
| 1633 | `Range hood fan`                            | RS6              | **Needs words** | `Range hood, 30" under-cabinet, ducted` (Q19) — Home Depot Broan 403004.                                                                                           |
| 1634 | `Replacement fan grille`                    | —                | **Owner pick**  | A grille fits one fan model (Q20).                                                                                                                                 |
| 1635 | `4" roof vent cap`                          | RS7, CK21        | **OK**          |                                                                                                                                                                    |
| 1636 | `Sloped ceiling fan adapter`                | —                | **OK**          |                                                                                                                                                                    |
| 1637 | `Snow melt controller`                      | —                | **Needs words** | `Snow melt controller, automatic, 120V` (Q21). There is no heat cable for it to control (M4).                                                                     |
| 1638 | `Spa bonding lug`                           | RS14, RS15       | **Needs words** | `Spa bonding lug, direct burial, #8 solid` (Q22). Not the pool-water bonding kit, which is a different part. Size last: a leading `#` reads as a wire gauge.       |
| 1639 | `Submersible pump splice kit`               | RS16             | **Needs words** | `Submersible pump splice kit, heat shrink, #14-#10` (Q23) — Home Depot Everbilt EBSK400. Size last, same reason.                                                   |
| 1640 | `Sump pump alarm`                           | —                | **OK**          |                                                                                                                                                                    |
| 1641 | `Wall heater thermostat`                    | CK14             | **OK**          | The in-wall heater's own thermostat kit.                                                                                                                           |
| 1642 | `4" wall vent cap`                          | RS8              | **OK**          |                                                                                                                                                                    |
| 1643 | `Well pump control box, 1/2 HP 230V 3-wire` | RS16             | **OK**          |                                                                                                                                                                    |
| 1644 | `Well pump pitless adapter, 1" x 6"`        | —                | **OK**          | Really a well driller's part; no starter uses it. Left as is.                                                                                                      |
| 1645 | `Well pump pressure switch`                 | RS16             | **Needs words** | `Well pump pressure switch, 40/60 psi` (Q23) — Home Depot Square D FSG2J24CP. Its own search words say "30/50 40/60".                                              |
| 1646 | `Whole-house surge protector`               | PG10             | **Needs words** | `Whole-house surge protector, hardwired, 120/240V` (Q24), so it reads apart from `Breaker-style surge protective device` on the Breakers shelf.                     |

**Counts: 30 OK, 28 need words, 7 owner picks.**

**Duct, dampers, vent caps and foil tape.** These are sheet-metal items, but
an electrician who installs a bath fan does buy the duct and the cap for it,
and three bath-fan starters count them (RS7, RS8, CK21). They stay. The
unused ones (both dampers, the 6" flex duct, the tape, the inline fan) cost
nothing to keep and are what a bath-fan job reaches for next.

## Packs

All 65 rows are `each` / 1 in the owner's copy. `pack-label-scan.md` § E
flagged only two rows on this shelf, both from a word inside the name, and
the owner has already fixed both: 1598 `Dishwasher whip` ("washer", was box
of 100) and 1602 `4" duct clamp, worm gear` ("clamp", was box of 25).

Nothing else here is sold in multiples at the three stores, with two to
note so nobody "fixes" them later: the splice kit (Everbilt EBSK400) is one
kit of 4 connectors, enough for one 3-wire pump splice, and is right as
`each`; the foil tape is one roll, `each`.

## Search words (not names)

- **S1.** `Attic fan` carries "whole house" — a whole-house fan is a
  different product (it pulls air out of the living space), and the words
  also lead `Whole-house surge protector` — and "thermostat", the name word
  of `Attic fan thermostat`. Drop both.
- **S2.** The three EV chargers carry "tesla". A Tesla Wall Connector is a
  different charger with Tesla's own plug, and the same rows say "j1772".
  Drop "tesla".
- **S3.** `30A 6-circuit manual transfer switch` carries "10" (left from the
  old "6 circuit 10 circuit" words, so a "10 circuit" search lands on a
  6-circuit switch) and "inlet", the name word of both power inlet boxes.
  Drop both.
- **S4.** The four sized bath fans carry "humidity", which they are not —
  and it is the name word of `Humidity sensor switch`. Drop it.
- **S5.** `Range hood fan` carries "downdraft"; a downdraft vent is a
  different appliance. Drop it.

## Things that could price a bid wrong

- **P1 — the transfer switch priced from the kit (CW10).** The common
  Reliance kit (Home Depot 3006HDK) comes with a 30A inlet box and a 10 ft
  cord. CW10 already has its own `30A power inlet box` and `30A generator
  cord` lines, so a kit price counts both twice. The switch alone is Reliance
  306A (Platt).
- **P2 — PG19 prices a charger that comes in the box and leaves out the
  battery that does not.** Generac's home standby spec sheet (hosted by Home
  Depot) lists a 2.5 A trickle battery charger as standard equipment; Platt
  lists Generac's 26R battery (0H3421S, about $169) separately, sold without
  the generator. The spec sheet found is for older 7–15 kW models, so A
  confirms on a current one before applying Q1.
- **P3 — a doorbell transformer with no VA (RS10, RS11).** A plain 10VA
  chime transformer will not run a video doorbell; RS11 is the video
  doorbell starter. 16V 30VA runs both (Home Depot Newhouse 30TR, about
  $17.70; Platt has a Nutone 16V 30VA at $44.95).
- **P4 — unsized appliances in eight starters.** Attic fan, baseboard heater,
  floor heating mat, range hood, both bath-fan combos, the EV charger and the
  pedestal can each be priced from anything on the shelf. The floor mat is
  the sharpest: a 30 sq ft mat alone is $95.51 (ThermoSoft WX3010-120) and a
  30 sq ft kit is $471.20 (WarmlyYours TempZone) — and the kit's thermostat
  is also CK22's `Floor heating thermostat, GFCI` line.
- **P5 — the attic fan may already have its thermostat (RS20).** The common
  Home Depot gable fan (Maxx Air CX1500UPS, $84.99) comes with an adjustable
  thermostat pre-wired, and RS20 also counts `Attic fan thermostat`. If the
  shop buys that fan, delete the thermostat line on the job. No starter
  change is suggested.
- **P6 — an interlock kit that fits the wrong panel (RS18, GR4).** Like a
  breaker, it fits one panel family and one main size: Square D sells
  separate Homeline and QO kits for 100A and 150–225A mains (Home Depot
  HOMCGK2C, QOCGK2C, HOMCRBGK1C…). A wrong one is scrap.
- **P7 — CW2 may have no charger in it.** `EVSE pedestal`'s search words
  ("mount post stand") describe a mount, and it is the only equipment line in
  "Commercial Level 2 EV charger, 208V". A Leviton single pedestal alone is
  about $730.65 at Home Depot (EPED1); the charger would be extra.

## Common items that are MISSING

Searched the whole catalog first (`server/seed/materials/*.ts`):
`Timer switch` (an in-wall countdown switch) and `Time clock` (an astronomic
lighting control) exist and are not the 240V pump timer; `6 ft MC whip` is a
lighting whip; disconnects, spa disconnects and the 14-50 receptacle are on
other shelves. None of the four below is in `new-rows-source-check.md`.

| #   | Item                                                | Source (owner's rule)                                                                                                                                                                                                                                                                                                                                  | Why it is needed                                                                                                       | Search words                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M1  | `Generator battery, 12V Group 26R`                  | **COMMON** — Platt, Generac 0H3421S, about $169 ([listing](https://www.platt.com/p/1995722/generac/26r-wet-cell-battery-not-ups-shippable-/gps0h3421s))                                                                                                                                                                                                | Q1: a standby generator does not start without one, and it is sold separately.                                         | "generac", "standby", "26r", "starting battery"    |
| M2  | `AC whip, 1/2" x 6 ft liquidtight, #10`             | **COMMON** — Home Depot, Southwire 55189407 (10/3 Ultra-Whip), about $31 ([listing](https://www.homedepot.com/p/reviews/Southwire-1-2-in-x-6-ft-10-3-Ultra-Whip-Liquidtight-Flexible-Non-Metallic-PVC-Conduit-Cable-Whip-55189407/202210500/3))                                                                                                     | The usual whip for a 20–30A condenser or mini-split; the shelf has only the 3/4" #8.                                   | "a/c", "hvac", "condenser", "mini split", "sealtite" |
| M3  | `Mechanical time switch, 24-hour, 240V 40A, indoor` | **COMMON** — Platt, Intermatic T104, about $95 ([listing](https://www.platt.com/platt-electric-supply/Mechanical-Time-Switches-24-Hour/Intermatic/T104/product.aspx?zpid=29598&cr=400471)); Home Depot T104D89 ([listing](https://homedepot.com/p/Intermatic-T100-Series-40-Amp-208-277-Volt-DPST-24-Hour-Mechanical-Time-Switch-with-Indoor-Enclosure-T104D89/100142466)) | The timer on a pool pump or water heater. Nothing on the catalog does that job.                                       | "intermatic", "t104", "pool timer", "water heater" |
| M4  | `Roof de-icing cable, 120V, 60 ft`                  | **COMMON** — Platt, Easyheat ADKS-300, 300 W, with 6 ft cord and clips ([listing](https://www.platt.com/p/0165928/easyheat/roof-deicing-cable-60/013627109711/easadks300)); Home Depot Frost King RC60 ([listing](https://www.homedepot.com/p/Frost-King-60-ft-Roof-De-Icing-Cable-Kit-Accessory-RC60/100187093))                                   | Q21: `Snow melt controller` has no cable to control; the roof-and-gutter cable is the everyday residential version.    | "heat tape", "heat trace", "gutter", "ice dam"     |

M3's name avoids `Timer switch` and `Time clock` by starting with
"Mechanical", and its search words avoid both names.

## Owner questions, with suggested answers

**Q1. STARTER EDIT — changes a starter and a bid number. PG19 "Standby
generator hookup": swap its `Generator battery charger` line for M1
`Generator battery, 12V Group 26R` (and add M1)?**
Suggested: **yes**. The generator comes with a charger built in, so PG19
prices a part that is already in the box and leaves out the battery, which
is sold separately and which the installer usually supplies (P2). The
charger row stays in the catalog for the units that do need one. A confirms
on a current Generac spec sheet first.

**Q2. `30A 6-circuit manual transfer switch, switch only`, and drop "10" and
"inlet" from its search words (S3)?**
Suggested: **yes**. CW10 already counts the inlet box and the cord, so the
price must be the switch alone (Reliance 306A at Platt), not the kit (P1).

**Q3. `Attic fan, gable mount, 1300 CFM`, and drop "whole house" and
"thermostat" (S1)?**
Suggested: **yes**. It's the common gable fan at Home Depot (Maxx Air
CX1500UPS); a roof-mount fan is a different product and price.

**Q4. `Baseboard heater, 1500W 240V, 6 ft` and `Baseboard heater thermostat,
line voltage, double-pole, wall mount`?**
Suggested: **yes**. Cadet 6F1500W is at Home Depot ($86.98) and Platt
($102.69); Cadet T522-W is the wall thermostat at Home Depot ($35.98). The
heater-mounted thermostat fits one heater brand only.

**Q5. `Bath exhaust fan, heater/light combo, 80 CFM, 1300W` and `Bath exhaust
fan, LED light combo, 80 CFM`, and drop "humidity" from the four sized fans
(S4)?**
Suggested: **yes**. 80 CFM matches the plain fan RS7 uses; both are Broan
at Home Depot (765H80L, AN80L).

**Q6. `Cord reel, 12/3, 50 ft, ceiling mount`?**
Suggested: **yes**. It's the common shop reel; Home Depot's Goodyear GUR074
is a ceiling-or-wall 50 ft 12/3 reel (its listing says 13A in one place and
15A in another — A reads it). No starter uses it.

**Q7. Dishwasher whip: rename it `Dishwasher power cord kit, 5 ft`?**
Suggested: **yes**. It's the one product with this job at the three stores
(Home Depot Everbilt 98250, 16/3, 5 ft 4 in, $12.98). If the shop hardwires
dishwashers with NM, they delete RS4's line on the job. The other choice is
to keep a "whip" meaning a short flex whip, which no store sells under that
name for a dishwasher.

**Q8. `Doorbell transformer, 16V 30VA`?**
Suggested: **yes**. It runs a plain chime and a video doorbell, so RS10 and
RS11 can share it (P3).

**Q9. `Dryer cord, 3-wire, 30A, 6 ft`, `Dryer cord, 4-wire, 30A, 6 ft` and
`Range cord, 3-wire, 50A, 6 ft`?**
Suggested: **yes**. All three are at Home Depot (HDX HD#627-833,
HD#601-004, HD#626-634), and they match the existing `Range cord, 4-wire,
50A, 6 ft`.

**Q10. `32A EV charger, plug-in, NEMA 14-50`, `40A EV charger, plug-in, NEMA
14-50`, `48A EV charger, hardwired`, and drop "tesla" (S2)?**
Suggested: **yes**. 48A has to be hardwired (Home Depot DEWALT
DXPAEV048CP-SAE, $499), which is what RS12 says; the smaller ones are mostly
sold to plug into a 14-50 (Home Depot IYILO, 40A 14-50P). A reads a 32A
plug-in listing at the three stores.

**Q11. `EVSE pedestal`: make it the charger on its pedestal, `Level 2 EV
charger, pedestal mount, commercial`?**
Suggested: **yes**. CW2 is "Commercial Level 2 EV charger" and this is its
only equipment line, so as a bare mount CW2 has no charger in it (P7).
Platt has a ChargePoint single-port pedestal unit (CPF50-L18-PEDMNT). This
changes what CW2's line counts, not its lines. The other choice is to keep
it a mount (`EV charger pedestal, single mount`, Leviton EPED1) and add a
charger line to CW2 — a STARTER EDIT.

**Q12. `Floor heating mat, 120V, 30 sq ft, mat only`?**
Suggested: **yes**. CK22 counts its own thermostat, so the price must be
the mat without one (ThermoSoft WX3010-120 at Home Depot, $95.51–$103.71);
30 sq ft is a typical bathroom (P4).

**Q13. `Foil duct tape, 1.89" x 50 yd` and `6" inline duct fan, 240 CFM`?**
Suggested: **yes**. Both are the common item at Home Depot (Nashua 322;
VIVOSUN 240 CFM). Neither is used by a starter.

**Q14. `Garbage disposal cord kit, 3 ft`?**
Suggested: **yes**. It's the kit at Home Depot (Moen 1024, InSinkErator
CRD-00), and 3 ft is the length code allows.

**Q15. Generator cords and inlets: `30A generator cord, L14-30, 25 ft`;
`50A generator cord, 14-50P to CS6364, 25 ft`; `30A power inlet box,
L14-30`; `50A power inlet box, CS6375`?**
Suggested: **yes**. Each cord now plugs into its inlet. The 30A pair is
Champion 100395 and Reliance PB30 (Home Depot). For 50A, a 14-50P to CS6364
25 ft cord is at Home Depot (DuroMax XP5025GC) and Platt; the CS6365-to-CS6364
cord was found only at 50 ft. The inlet is Reliance PB50 (Home Depot,
Platt) — Platt's two PB50 pages say CS6375 and CS6365, so A confirms it.

**Q16. `Generator interlock kit`: keep one generic row named `Generator
interlock kit, 150–225A main`, with the description "Fits one panel family -
match the panel's brand and series"?**
Suggested: **yes, for now**. The kits cost about the same across brands,
so one row prices a bid; the description stops someone buying the wrong one
(P6). Giving it brand variants like the breakers would widen the "brands on
panels and breakers only" rule, which is the owner's call, later.

**Q17. `Generator pad, 54" x 31" x 3", 9–26 kW air-cooled`?**
Suggested: **yes**. It's Generac's standard pad for the common home
standby sizes, at Platt (10000007852).

**Q18. `Pump control relay`: retire it?**
Suggested: **yes, retire** (through `RETIRED_BASELINE_MATERIALS`). It
names no one product, no starter uses it, and the well pump's real parts
(control box, pressure switch) are already rows.

**Q19. `Range hood, 30" under-cabinet, ducted`, and drop "downdraft" (S5)?**
Suggested: **yes**. It's the common hood (Broan 403004 at Home Depot). RS6
keeps the line; by D2, a job where the owner supplies the hood deletes it.

**Q20. `Replacement fan grille`: keep it, with the description "Generic
placeholder: a grille fits one fan model - price the one you buy"?**
Suggested: **yes**. It's useful to count on a service call, but no single
price fits every fan, and the description says so the way row 1647's note
does.

**Q21. `Snow melt controller, automatic, 120V`, and add M4 `Roof de-icing
cable, 120V, 60 ft`?**
Suggested: **yes**. Platt stocks both (Easyheat controllers and the
ADKS-300 cable); a controller with no cable on the catalog is half a job.

**Q22. `Spa bonding lug, direct burial, #8 solid`?**
Suggested: **yes**. RS14 and RS15 bond the pump motor with #8 solid, so the
lug is the direct-burial kind sized for it. It is not the pool-water bonding
kit (ILSCO PWBC-4-KIT at Home Depot), which is a different part. A reads
one at the three stores.

**Q23. `Well pump pressure switch, 40/60 psi` and `Submersible pump splice
kit, heat shrink, #14-#10`?**
Suggested: **yes**. 40/60 is the common setting (Square D FSG2J24CP at Home
Depot); the Everbilt EBSK400 kit covers RS16's #12 pump cable.

**Q24. `Whole-house surge protector, hardwired, 120/240V`?**
Suggested: **yes**. It's the panel-side unit that fits any panel (Square D
HEPD80 at Home Depot, about $134–$142), and the new words keep it apart
from the plug-on `Breaker-style surge protective device`.

**Q25. Add M2 `AC whip, 1/2" x 6 ft liquidtight, #10`, with no starter
change?**
Suggested: **yes**. It's COMMON at Home Depot. MH4 and CK13 (20A
mini-splits) could use it instead of the 3/4" #8 whip, but the bigger whip
works, so swapping is left to the shop per job.

**Q26. Add M3 `Mechanical time switch, 24-hour, 240V 40A, indoor`?**
Suggested: **yes**. It's COMMON at Platt and Home Depot (Intermatic T104),
and it is what a pool pump or water heater timer job needs.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; the retire (Q18) through `RETIRED_BASELINE_MATERIALS`.
  Search-word changes S1–S5 go in with their questions.
- **Starter edits: one, Q1 (PG19).** It changes a starter and a bid number,
  so it goes to the top of the owner's list. Q11 changes what CW2's line
  counts but not CW2's lines. Every other starter follows its renamed row by
  key.
- Descriptions: Q16 (interlock) and Q20 (grille); M1–M4 take their
  descriptions from `new-rows-source-check.md`.
- No pack pass is needed here: the owner's copy already has every row
  `each`.
- New-row prices follow `new-rows-source-check.md` (the source rule); M1–M4
  are to be added there as waiting for the answers.
- Run `scripts/searchSpotCheck.mts` for "attic fan", "whole house",
  "baseboard", "bath fan", "humidity", "ev charger", "tesla", "transfer
  switch", "inlet", "generator cord", "interlock", "dryer cord", "range
  cord", "doorbell transformer", "pressure switch", "heat tape" and
  "intermatic".
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.
