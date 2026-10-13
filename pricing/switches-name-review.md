# Switches — name review (2026-10-13, Track C)

**Read-only review. No name has been changed.** For each row on the
"Switches" shelf of `starter-catalog-pricing.xlsx` ("Starter prices", rows
**828–861**, 34 rows, in the app-order sort of `28245633`), the question is
whether one real product can be priced at Platt or Home Depot from the name
alone. The workbook was read from a fresh copy, because the owner has it
open. It is the shelf after Receptacles (`receptacles-name-review.md`).

**The test** uses the properties a supply house names a switch by: amperage;
single-pole, 3-way, 4-way or double-pole; toggle or decorator (rocker) face;
grade (residential, commercial, spec/industrial). For a dimmer, the load type
(LED, ELV, MLV, 0-10V), the wattage, and single-pole or 3-way. For a sensor,
wall or ceiling, PIR or dual-tech, line or low voltage. For a timer, countdown
or programmable. A name that leaves out something that changes the price is
"vague".

**Verdicts:** **OK**; **Needs a word**, with the exact words; **Not a real
product**; **Two products in one row**; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
No run type prices a switch. The **plate** each starter uses was read as
well (`server/seed/starterAssemblies.ts`, `baselineAssemblies.ts`), because it
says which face the device has: a toggle plate means a toggle, a decorator
plate a decorator device.

**Sources.** Listings checked on 2026-10-13 at homedepot.com and platt.com.
Platt showed few switch prices, so where neither did, another supply house
is named (SupplyHouse, EMI, Elliott, Crescent, Gerrie, Lighting Supply).
Prices only show how big a question is; they are not proposed prices.

**Already decided, and not reopened here:**

- **15A is the plain name and 20A says so** (moved from the pricing sheet,
  2026-09-25); the sheet names already carry "15A".
- **The ceiling sensors say on the row that a low-voltage one needs a power
  pack and 18/3** (retail catalog plan § R4, `CEILING_SENSOR_NOTE`), and the
  pack is its own row (2026-09-29).
- **"Timer switch" is deliberately not aliased "time clock"**, and
  "Photocell" not "daylight sensor": both are other materials (seed
  comments).
- **Commodity items are generic; brands exist on panels and breakers only**
  (CLAUDE.md § Brands). Nothing below proposes a brand in a name; the brands
  in "Why" are listings.

## Existing rows

| Row | Current name                              | Used by                                          | Verdict / proposed words                                                     | Why                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 828 | `0-10V dimmer`                            | 0-10V dimmer, MC (DV31)                          | OK                                                                           | One kind of device: a 0-10V low-voltage dimmer with a line-voltage switch, 120/277V. Lutron Diva DVSTV, 8A, single-pole/3-way, **$82.69–$93.39** (Lumen, Elliott, PartsSource). DV31 uses a decorator plate, which matches.                                                                                          |
| 829 | `3-way dimmer`                            | 3-way dimmer (DV15)                              | **Needs words / same product as 837** (Q3)                                   | **The common LED dimmer is single-pole AND 3-way in one device**: HD Lutron Diva LED+ DVCL-153PR, 150W, "single-pole or 3-way", **$33.17**. Two rows for one part can be priced differently for the same thing.                                                                                                      |
| 830 | `15A 3-way switch`                        | 3-way switch (DV13)                              | **Needs a word** (Q2): `15A 3-way switch, toggle`                            | HD Leviton 1453, 15A 3-way toggle, **$2.30**, or **$9.98 per 6**. Decorator 3-ways exist and cost more. DV13 uses a toggle plate.                                                                                                                                                                                    |
| 831 | `20A 3-way switch`                        | 3-way switch, MC (DV27)                          | **Needs words** (Q2, Q4): `20A 3-way switch, toggle, commercial grade`       | Leviton CSB3-20 class. The 20A single-pole of the same line is $198.50 per 50 (Standard Electric), $3.97 each. The aliases say "commercial spec grade", which are two grades.                                                                                                                                        |
| 832 | `15A 4-way switch`                        | 4-way switch (DV14)                              | **Needs a word** (Q2): `15A 4-way switch, toggle`                            | As 830. DV14 uses a toggle plate.                                                                                                                                                                                                                                                                                    |
| 833 | `20A 4-way switch`                        | —                                                | **Needs words** (Q2, Q4): `20A 4-way switch, toggle, commercial grade`       | As 831 (Leviton CSB4-20).                                                                                                                                                                                                                                                                                            |
| 834 | `Ceiling occupancy sensor, dual-tech`     | Ceiling occupancy sensor + power pack (DV30)     | **Needs words** (Q5): `Ceiling occupancy sensor, dual-tech, low voltage`     | **Line and low voltage are different products and prices**: Sensor Switch CM PDT 9 (low voltage, needs a PP20 pack) **$183.90**; CMR PDT 9 (line voltage, no pack) **$118.17** (Gerrie). DV30 adds the power pack and 18/3, so it means the low-voltage one. Today's description names both kinds.                   |
| 835 | `Ceiling occupancy sensor, PIR`           | —                                                | **Needs words** (Q5): `Ceiling occupancy sensor, PIR, low voltage`           | As 834, PIR only (Sensor Switch CM 9 class).                                                                                                                                                                                                                                                                         |
| 836 | `Combination fan/light control`           | Fan/light combo control (DV18)                   | **Needs words:** `Fan/light control, fan speed + LED dimmer, single-gang`    | HD Lutron Maestro fan control + light dimmer, 1.5A fan, 75W LED, **$58.94–$78.47**. Fan-speed-plus-light-switch versions exist and cost less. "Single-gang" is what separates it from a 2-gang stack of two devices. DV18 uses a decorator plate, which matches.                                                     |
| 837 | `Dimmer`                                  | Dimmer switch (DV5)                              | **Needs words** (Q3): `Dimmer, LED, single-pole/3-way, decorator`            | "Dimmer" covers a $17 rotary (Walmart Leviton RDL06, $17.60) to a $33 LED slide-and-paddle (HD Diva LED+ DVCL-153PR, **$33.17**). The aliases name rotary, slide and rocker. DV5 uses a decorator plate, so a rotary is the wrong part as well as the wrong price.                                                   |
| 838 | `Door jamb switch`                        | —                                                | OK                                                                           | One product: plunger switch with its jamb box, 3A, normally on. Leviton 1865, **$15.67–$27.04** (Electrozad, Lumen).                                                                                                                                                                                                 |
| 839 | `Double switch`                           | —                                                | **Needs words** (Q2): `Double switch, decorator, two single-pole`            | Two stacked switches on one strap: Leviton 5634 double rocker, **$10.95–$11.49** (Walmart, SupplyHouse). Toggle-style duplex switches exist too. Two single-pole switches in a 2-gang box are a different install (DV16).                                                                                            |
| 840 | `30A double-pole switch`                  | —                                                | OK                                                                           | Leviton 3032-2, 30A double-pole toggle, **$17.71–$46.26** (Walmart, EMI, SupplyHouse). One product.                                                                                                                                                                                                                  |
| 841 | `Dual-tech occupancy sensor switch`       | 2 starters (DV29, DR18)                          | **Needs words:** `Dual-tech occupancy sensor switch, wall, 120/277V`         | Leviton OSSMD, wall, dual-tech, **$124.39–$172.03** (Lighting Supply). "Wall" separates it from 834; 120/277V is the commercial device both starters mean.                                                                                                                                                           |
| 842 | `ELV dimmer`                              | —                                                | **Needs a word:** `ELV dimmer, 300W`                                         | Lutron Diva DVELV-300P, **$84.47–$122.34** (Electric Bargain, Elliott). 600W versions cost more.                                                                                                                                                                                                                     |
| 843 | `Fan speed control`                       | —                                                | **Needs words:** `Fan speed control, 1.5A, decorator`                        | Leviton DSF01, 1.5A, single-pole/3-way, **$42.77–$44.67**; Lutron Diva DVFSQ, **$30.12**. Rotary fan controls also exist.                                                                                                                                                                                            |
| 844 | `Illuminated switch`                      | —                                                | **Needs words** (Q2): `15A single-pole switch, toggle, illuminated`          | HD Leviton 1461-LC, 15A lighted toggle, **$4.68** (Crescent $4.62). Decorator lighted rockers exist. The name does not say single-pole.                                                                                                                                                                              |
| 845 | `Key switch`                              | Key switch, MC (DV28)                            | **Needs words:** `Key switch, 20A single-pole`                               | HD Leviton 1221-2KL, 20A industrial key-locking single-pole, **$72.57** (Gerrie $114.55). It fits DV28's toggle plate. 3-way key switches exist.                                                                                                                                                                     |
| 846 | `Low-voltage momentary switch`            | —                                                | **Owner pick** (Q10)                                                         | A switch for a low-voltage relay system, which only works with that system's relays. No listing was found on 2026-10-13. No starter or run type uses it, and the catalog has no relay system for it to drive.                                                                                                        |
| 847 | `Manual motor starter switch, 2-pole 30A` | 2 starters (MH2, MH9)                            | OK                                                                           | HD Leviton MS302-DSS, 30A double-pole manual motor controller, **$24.49** (EMI MS302-DS $39.06). Both starters put it in a handy box with a toggle cover, which it fits.                                                                                                                                             |
| 848 | `MLV dimmer`                              | —                                                | **Needs a word:** `MLV dimmer, 600VA`                                        | Lutron Diva DVLV-600P, **$47.55–$47.95** (Electric Bargain, Alcon). 1000VA versions cost more.                                                                                                                                                                                                                       |
| 849 | `Momentary contact switch`                | —                                                | **Needs words:** `Momentary contact switch, 15A, toggle, center-off`         | A line-voltage momentary toggle (Leviton 1257 class), used for a door or a motor control. Not priced on 2026-10-13; decorator momentaries exist too.                                                                                                                                                                 |
| 850 | `Occupancy sensor switch`                 | —                                                | **Needs words:** `Occupancy sensor switch, wall, PIR, 120/277V`              | HD Leviton ODS15, wall PIR 120/277V, **$49.88** ($78.57–$99.69 elsewhere). 120V-only residential ones are cheaper.                                                                                                                                                                                                   |
| 851 | `Photocell`                               | Time clock and lighting contactor (CS2)          | **Needs words** (Q8): `Photocell, stem mount, 120–277V`                      | Sold as button, stem/swivel and twist-lock, and by voltage. Intermatic K4121, stem 120V, **$15.21** (Elliott); K4221C, stem and swivel 120V, $16.57–$18.86. A twist-lock one needs a receptacle that is not in CS2. CS2 is a commercial contactor, whose control may be 277V.                                        |
| 852 | `Pilot-light switch`                      | —                                                | **Needs words:** `Pilot-light switch, 20A single-pole, toggle`               | Leviton 1221-PLR, 20A, lights when ON, **$17.13** (EMI). Decorator pilot switches exist.                                                                                                                                                                                                                             |
| 853 | `Sensor power pack, 120/277V`             | Ceiling occupancy sensor + power pack (DV30)     | OK                                                                           | One product: relay and transformer per zone (Sensor Switch PP20 class). No standalone price was found; listings bundle it with a sensor.                                                                                                                                                                             |
| 854 | `15A single-pole switch`                  | **5 starters** (DV4, DV16 ×2, DV17 ×3, RS5, GR1) | **Needs a word** (Q2): `15A single-pole switch, toggle`                      | Ace Leviton 1451 toggle, **$14.99 per 10**; HD ELEGRP toggle, $15.99 per 10; Leviton Decora rocker, **$20.98 per 10** (GoSource). Every starter uses a toggle plate. **Its search words say "rocker decora"**, the other face.                                                                                       |
| 855 | `20A single-pole switch`                  | 3 starters (DV26, CK8 ×2, CK21)                  | **Needs words** (Q2, Q4): `20A single-pole switch, toggle, commercial grade` | Leviton CSB1-20, 20A commercial toggle, **$3.97** each in a 50-pack (Standard Electric); $20.56–$21.07 retail single. All three starters use toggle plates.                                                                                                                                                          |
| 856 | `Smart dimmer`                            | —                                                | **Needs words** (Q7): `Smart dimmer, Wi-Fi, no hub, single-pole/3-way`       | HD Lutron Caséta PD-6WCL, **$59.95**, needs a bridge; Wi-Fi models need none. The name does not say which system or whether a neutral is needed.                                                                                                                                                                     |
| 857 | `Smart switch`                            | —                                                | **Needs words** (Q7): `Smart switch, Wi-Fi, no hub, single-pole`             | As 856.                                                                                                                                                                                                                                                                                                              |
| 858 | `Timer switch`                            | Timer / smart / vacancy switch (DV19)            | **Needs words** (Q6): `Timer switch, digital countdown, decorator`           | **Three products, three prices**: spring-wound (Intermatic FD60M, **$38.97–$45.49**), 7-day programmable (Intermatic ST01, **$73.91–$109.51**), and digital countdown (the bath-fan timer; not priced on 2026-10-13). The aliases name all three. DV19 uses a decorator plate, which rules out the spring-wound one. |
| 859 | `Triple switch`                           | —                                                | **Needs words** (Q2): `Triple switch, decorator, three single-pole`          | Three rockers on one strap, decorator only. Not priced on 2026-10-13.                                                                                                                                                                                                                                                |
| 860 | `Vacancy sensor switch`                   | —                                                | **Needs words:** `Vacancy sensor switch, wall, PIR, 120V`                    | Lutron Maestro MS-VPS2, wall PIR vacancy, 120V, **$19.11–$24.21** (Electric Bargain, Walmart). Residential is where vacancy is asked for (title 24, per its search words).                                                                                                                                           |
| 861 | `Weatherproof toggle switch`              | —                                                | **Not a real product** (Q9)                                                  | Nothing is sold as a weatherproof switch device. Outdoors a standard toggle goes under a **weatherproof toggle switch cover** with a lever: HD TayMac TC111SB, **$5.48**; Bell PTC100WH, **$9.19**. The catalog has no such cover (Boxes and Wall Plates & Misc have blank, flip and in-use covers only).            |

**Totals, by row: 34.** OK: 5 (828, 838, 840, 847, 853). Needs words: 27
(829–837, 839, 841–845, 848–852, 854–860). Owner pick: 1 (846). Not a real
product: 1 (861). Two products in one row: 0. 5 + 27 + 1 + 1 = 34.

## Things that could price a bid wrong

**P1 — the plain "Dimmer" and "3-way dimmer" are one product for an LED
job,** and a rotary is a third. DV5 and DV15 each use a decorator plate. If
the two rows are priced from different listings, the same device costs two
amounts on one bid; if "Dimmer" is priced from a rotary, DV5 is about $16
low and the part does not fit its plate. Q3.

**P2 — the timer switch is $39, $74–$110, or a countdown, by kind.** DV19
prices one with a decorator plate. A programmable price on a bath-fan timer
is about twice the part. Q6.

**P3 — the ceiling sensor row describes both kinds while DV30 prices the
low-voltage one.** Priced from a line-voltage listing ($118), DV30 is about
$66 low and also carries a power pack the line-voltage sensor does not need.
Q5.

**P4 — toggle vs decorator on the most-used rows** (854, 855, 830–833:
eight starters, all on toggle plates). The step is small (about $1.50 vs
$2.10 each for 15A), but the search words "rocker decora" invite the
decorator price and the decorator part.

**P5 — "commercial spec grade" on the 20A rows names two grades.** A spec or
industrial 20A toggle runs several times the $3.97 commercial one (the
industrial key switch on the same line is $72.57). Q4.

**Packs.** 15A and 20A single-pole, 3-way and 4-way say `box of 10` / 10; the
rest `each` / 1. That matches the listings (10-packs at Ace and HD; specialty
devices sold singly). No row is added to `pack-label-scan.md`.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-13.

| #   | Item                                                                  | Listing                                                             | Why it is needed                                                                                                                                                               | Search words                            |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| W1  | `15A single-pole switch, decorator` and `15A 3-way switch, decorator` | Leviton Decora 15A single-pole rocker, **$20.98 per 10** (GoSource) | Once Q2 names the shipped switches "toggle", there is no decorator switch to price, and many houses are wired all-decorator. The receptacle twin is R1. Pack `box of 10` / 10. | "decora", "rocker", "paddle"            |
| W2  | `Weatherproof toggle switch cover, single-gang`                       | HD TayMac TC111SB, **$5.48**; Bell PTC100WH, **$9.19**              | What row 861 is reaching for (Q9). Wall Plates & Misc shelf.                                                                                                                   | "wp switch cover", "lever cover"        |
| W3  | `20A double-pole switch, toggle, commercial grade`                    | Leviton CSB2-20W, 20A 120/277V double-pole (EMI; price not shown)   | A 240V load under 30A (a 20A water-heater or baseboard circuit) has only the 30A double-pole today.                                                                            | "dp", "2 pole", "240v switch", "20 amp" |

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for receptacles. No switch name is built by the
takeoff, so these are plain renames through `RENAMED_BASELINE_MATERIALS`,
each old name kept as a search word.

**Q2. The shipped single-pole, 3-way, 4-way, illuminated switches say
"toggle"; double and triple say "decorator"?**
Suggested: **yes.** Every starter on these rows uses a toggle plate, and a
stacked double or triple is a decorator device. Add W1 for decorator jobs,
and move "rocker" and "decora" off the toggle rows onto W1.

**Q3. Merge "Dimmer" and "3-way dimmer" into one row: `Dimmer, LED,
single-pole/3-way, decorator`?**
Suggested: **yes.** Retire 829 (hidden) into 837, with "3-way dimmer" as a
search word on it, and point DV15 at 837. A rotary or an incandescent-only
dimmer is a new row if wanted.

**Q4. Grade for the 20A switches?**
Suggested: **commercial grade**, as for the 20A receptacles. Spec or
industrial is a new row if wanted.

**Q5. Ceiling sensors are the low-voltage kind?**
Suggested: **yes**, because DV30 prices the power pack and the 18/3. The
description then says only "needs a power pack per zone and 18/3 control
wire". Line-voltage ceiling sensors are new rows if wanted.

**Q6. Timer switch: digital countdown, decorator?**
Suggested: **yes** (the bath-fan timer DV19 means). A 7-day programmable
timer is a new row if wanted; drop "spring wound" and "programmable" from
this row's search words.

**Q7. Smart switch and dimmer: Wi-Fi, no hub, with no brand?**
Suggested: **yes.** A hub system needs a bridge the catalog does not carry,
and a brand in the name breaks the brands rule. Each says in its
description: "Needs a neutral in the box."

**Q8. Photocell: stem mount, 120–277V?**
Suggested: **yes.** It suits CS2's commercial contactor at either control
voltage. A button photocell is a new row if wanted.

**Q9. Row 861: rename it to `Weatherproof toggle switch cover,
single-gang` (W2) and move it to Wall Plates & Misc?**
Suggested: **yes**, with "weatherproof toggle switch" kept as a search word.
It is used by nothing, so the rename changes no starter.

**Q10. Low-voltage momentary switch (846): retire it?**
Suggested: **yes, retire (hidden, never deleted).** It only works with a
relay system the catalog does not have, and nothing uses it. "low voltage
switch" stays a search word on the momentary contact switch (849).

**Q11. Add W1 and W3?**
Suggested: **yes to both**; W2 comes with Q9.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS` and retirements through
  `RETIRED_BASELINE_MATERIALS`, each old name kept as a search word on the
  ONE row that replaces it. **Starter recipes name KEYS**
  (`server/seed/starterParts.ts`), so a rename needs no starter edit.
- Q3 is the one starter edit: DV15's part moves from the 3-way dimmer to the
  dimmer. Q9 moves a row's category (Switches to Wall Plates & Misc).
- Search words: `SWITCH_SLANG` (`server/seed/materials/devices.ts`) puts
  "rocker decora" on every toggle row. Once the toggles are named, those two
  words belong on W1 only (CLAUDE.md: a search word must not surface the
  wrong material).
- Run `scripts/searchSpotCheck.mts` for "switch", "light switch", "sp",
  "3 way", "4 way", "decora", "rocker", "dimmer", "3 way dimmer", "fan
  control", "motion", "vacancy", "occupancy", "timer", "photocell", "smart
  switch", "key switch" and "wp switch cover". Each should surface its own
  row first, and a plain "switch" must still surface the 15A single-pole
  first.
- If a recount finds a starter using a switch row this review did not list,
  or a run type using any of rows 828–861, stop and find out why first.
