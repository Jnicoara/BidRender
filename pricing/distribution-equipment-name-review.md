# Distribution Equipment — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Distribution Equipment" shelf of `starter-catalog-pricing.xlsx` ("Starter
prices", spreadsheet rows **1647–1691**, 45 rows, in the app-order sort),
the question is whether one real product can be priced from the name alone.
The workbook was read from the **owner's live copy** (saved 19:29 today),
which differs from the worktree's copy on this shelf in two rows: the owner
has already changed `Furniture feed connector` (1666) and `Wireway
coupling` (1688) from "box of 25" to **each / 1**, the fix
`pack-label-scan.md` and `lighting-hardware-name-review.md` asked for. It is
the shelf after Equipment & Appliances; Consumables starts at row 1692.

**Source rule (owner, 2026-10-14; `new-rows-source-check.md`):** every
listing below is from Home Depot, Platt or Stoneway. A new row found there
is COMMON and takes its Example price from there; one found at none of the
three is SPECIALTY, added with the price blank and "Specialty - price from
your supplier."

The sheet's 45 names match `BASELINE_MATERIALS`' Distribution Equipment
rows one for one (read from the seed the same day), so the search words
quoted below are the catalog's own. Seven rows carry the description
"Generic placeholder — size and price it per the job's schedule." (contactor,
ATS, busway, cable tray, surge device, time clock) and one carries
"Unsized placeholder: one price for every size." (208V panelboard).

**Two kinds of "Specialty", and they are not the same thing.** 22 rows here
already carry the owner's **Specialty tag** from the 2026-10-08 catalog
review (`server/seed/materials/specialty.ts`): busway, cable tray, power
poles and whips, the 480V panelboard, CT cabinet, VFD, motor starters, the
400A/600A disconnects and the switchboards. That tag only makes a row **sort
lower** in search; it says nothing about price. The source rule's
"Specialty - price from your supplier" is different: **no Example price at
all**. A row can be tagged and still COMMON (the VFD and the power poles are
at Platt), and below that is what decides the price.

**The test.** Distribution gear is bought by amps, voltage, phase,
poles/circuits, enclosure (NEMA 1 indoor, 3R outdoor), fused or not, kVA,
HP, NEMA starter size, length, and for tray by width, depth, material and
rung spacing. A name that leaves out the one that changes the price fails.
**Big engineered gear** — busway, switchboards — is built to order and
quoted per job by the supply house; for those the honest answer is no
Example price, and this review says so rather than inventing a size.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**14 of the 45 rows are used, by 10 starters, once each** (the sheet's
"Used by" column says the same): CS2 Time clock and lighting contactor
(contactor, time clock), PG19 Standby generator hookup (ATS), PG16
Dry-type transformer 45 kVA (45 kVA transformer), CS15 Kitchen hood shunt
interface (shut-off relay, micro-switch), CS10 Modular furniture feed (feed
connector, 6 ft whip), MH10 Motor with starter (size 1 starter), PG18
Building surge protective device (surge device), DV32 Floor receptacle,
poke-through (2-service poke-through), CS9 Tele-power pole (10 ft pole,
fitting kit), MH11 Motor on VFD (VFD). **No run type uses this shelf.**

**Packs: none guessed from a word any more.** In the owner's copy every row
is each / 1 or per foot / 1; the only two word-guessed packs (1666, 1688)
are already fixed, and `server/seed/materials/starterPacks.ts` already says
each for both. One unit question is left (cable tray, § Packs).

**Already decided, and not reopened here:**

- The sized three-phase panelboards are on Panels (retail plan § R5); the
  unsized `208V 3-phase panelboard` is **kept** as the "size unknown" pick
  (R5, RQ4).
- **480V proposal, Breakers round 3 (yes):** H1/H2 480Y/277V bolt-on
  breakers and H3, the 600V heavy-duty switch; PG16 and MH11 move to them.
- `Equipment shut-off relay` and `Hood control interface relay` are **two
  parts, not a duplicate** (catalog reality check, row 349: one kills the
  cooking equipment, the other runs exhaust and make-up air).
- Disconnects and safety switches are **generic** (CLAUDE.md § Brands).

## Existing rows

| Row  | Name                                                  | Used by    | Verdict         | Exact words / note                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------- | ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1647 | `208V 3-phase panelboard`                             | —          | **OK**          | Decided (R5): the unsized pick, kept. Price question in Q1.                                                                                                                                                                                                                                                   |
| 1648 | `480V 3-phase panelboard`                             | —          | **Needs words** | `225A panelboard, 480Y/277V 3-phase main-lug, 42-space` (Q2). Platt sells the interior alone: Eaton PRL2A3225L42AS is the main-lug one (found by search); its main-provision sibling is PRL2A3225X42AS ([listing](https://www.platt.com/p/0917706/eaton/panel-board-interior-prl2a-225a-480y-277v-42-circuits/782116063987/cutprl2a3225x42as)) — see P3. |
| 1649 | `30A 8-pole lighting contactor`                       | CS2        | **Needs words** | `30A 8-pole lighting contactor, electrically held, 120V coil, NEMA 1` (Q3). Platt Eaton ECC03C1A8A ([listing](https://www.platt.com/p/0590935/eaton/contactor-lighting-30a-8p-nema-1-enclosed-electrically-held/782116154920/cutecc03c1a8a)). Open and mechanically held ones are different prices.        |
| 1650 | `200A automatic transfer switch`                      | PG19       | **Needs words** | `200A automatic transfer switch, service-rated, NEMA 3R, 120/240V` (Q5). Platt Generac 9952 ([listing](https://www.platt.com/p/2240891/generac/200a-automatic-transfer-switch-service-rated-1ph-nema-3r/696471105001/gps9952)). PG19 is a house; the 3-phase ones are a different part (P7).               |
| 1651 | `Busway`                                              | —          | **Owner pick**  | Built to order, 225A to 5000A. No straight section listed at the three stores. Quoted (Q1).                                                                                                                                                                                                                   |
| 1652 | `Busway elbow`                                        | —          | **Owner pick**  | Same (Q1).                                                                                                                                                                                                                                                                                                    |
| 1653 | `Cable tray elbow, 12" ladder`                        | —          | **Needs words** | `Cable tray 90-degree horizontal bend, 12" ladder, aluminum, 4" deep, 12" radius` (Q6). Platt Eaton B-Line 4A-12-90HB12 ([listing](https://www.platt.com/platt-electric-supply/Bends-90-Horizontal-Bend/Eaton-B-Line/4A-12-90HB12/product.aspx?zpid=10094505)).                                              |
| 1654 | `Cable tray support bracket`                          | —          | **Needs words** | `Cable tray wall bracket, 12"` (Q6). A reads it at the three stores. Search word S2.                                                                                                                                                                                                                         |
| 1655 | `Cable tray tee, 12" ladder`                          | —          | **Needs words** | `Cable tray horizontal tee, 12" ladder, aluminum, 4" deep` (Q6). A reads it at Platt (B-Line).                                                                                                                                                                                                                |
| 1656 | `Cable tray, 12" ladder`                              | —          | **Needs words** | `Cable tray, 12" ladder, aluminum, 4" deep, 9" rungs` (Q6). Platt Eaton B-Line 24A09-12-144, a 12 ft section ([listing](https://www.platt.com/platt-electric-supply/Straight-Sections-Ladder-Type/Eaton-B-Line/24A09-12-144/product.aspx?zpid=79194)). Steel and wire basket are other products. Unit: § Packs. |
| 1657 | `Combination motor starter, size 1`                   | —          | **Needs words** | `Combination motor starter, size 1, fusible, NEMA 1, 120V coil` (Q8). A reads it at the three stores.                                                                                                                                                                                                        |
| 1658 | `Current transformer cabinet`                         | —          | **Needs words** | `CT cabinet, 48" x 36" x 11", NEMA 3R` (Q9). Platt Milbank CT364811-HC ([listing](https://www.platt.com/p/0071128/milbank/current-transformer-cabinets-nema-3r-48h-x-36w-x-11d-steel/784572112322/mlbct364811hc)). The utility sets the size.                                                              |
| 1659 | `Desk grommet outlet`                                 | —          | **Owner pick**  | Home Depot's grommets are consumer gadgets of every outlet/USB count; no one product (Q16).                                                                                                                                                                                                                  |
| 1660 | `15 kVA dry-type transformer, 480V-208Y/120V 3-phase` | —          | **OK**          | kVA, both voltages and phase named. Platt lists the family (below).                                                                                                                                                                                                                                         |
| 1661 | `30 kVA dry-type transformer, 480V-208Y/120V 3-phase` | —          | **OK**          | Same.                                                                                                                                                                                                                                                                                                         |
| 1662 | `45 kVA dry-type transformer, 480V-208Y/120V 3-phase` | PG16       | **OK**          | Platt Eaton V48M28T4516 ([listing](https://www.platt.com/p/0194679/eaton/transformer-dry-type-tp-1-480-x-120-208y/786680147531/cutv48m28t4516)); Hammond SG3A0045KB, aluminum, 150C ([listing](https://www.platt.com/p/0227201/hammond-power-solutions/transformer-dry-type-nema-3r-480-delta-208y-120-3ph-45-kva/803423123536/hmdsg3a0045kb)). A prices the aluminum-wound one; copper is dearer. |
| 1663 | `75 kVA dry-type transformer, 480V-208Y/120V 3-phase` | —          | **OK**          | Same family.                                                                                                                                                                                                                                                                                                  |
| 1664 | `Equipment shut-off relay`                            | CS15       | **Needs words** | `Equipment shut-off relay, enclosed, 20A SPDT, dry-contact input` (Q11). Platt Functional Devices RIB01BDC, 120V coil ([listing](https://www.platt.com/p/0644288/functional-devices/relay-dry-contact-input-20a-120vac-coil-enclosed-spdt/fderib01bdc)) — the input the hood micro-switch closes. S3.  |
| 1665 | `Floor monument, 2-gang`                              | —          | **Owner pick**  | No surface monument at the three stores; Platt lists floor boxes and flanges only (Q16).                                                                                                                                                                                                                     |
| 1666 | `Furniture feed connector`                            | CS10       | **Owner pick**  | Fits one furniture maker's system. Not stocked at the three stores (`starterPacks.ts` records the same). Pack already each (Q13).                                                                                                                                                                             |
| 1667 | `400A fused disconnect`                               | —          | **Needs words** | `400A fused disconnect, NEMA 1, 240V` (Q7), the Panels pattern. Platt Eaton DH325NGK ([listing](https://www.platt.com/p/0010627/eaton/safety-switch-400a-3p-240vac-250vdc-type-dh-fusible-nema-1/782113207063/cutdh325ngk)).                                                                                 |
| 1668 | `600A fused disconnect`                               | —          | **Needs words** | `600A fused disconnect, NEMA 1, 240V` (Q7). Home Depot Siemens HF326NA ([listing](https://www.homedepot.com/p/Siemens-Heavy-Duty-600-Amp-240-Volt-3-Pole-Indoor-Fusible-Safety-Switch-HF326NA/207186027)); Platt Eaton DH326NGK ([listing](https://www.platt.com/p/0064331/eaton/safety-switch-600a-3p-240vac-250vdc-type-dh-fusible-nema-1/782113207414/cutdh326ngk)). |
| 1669 | `Hood control interface relay`                        | —          | **Needs words** | `Hood control interface relay, enclosed, 20A DPDT, 120V coil` (Q11). Platt Functional Devices RIB01P (found in the same Platt search; A reads its page).                                                                                                                                                       |
| 1670 | `Hood suppression micro-switch`                       | CS15       | **Owner pick**  | Comes with the hood's suppression system (Ansul and others); not at the three stores (Q12).                                                                                                                                                                                                                  |
| 1671 | `Modular furniture whip, 6 ft`                        | CS10       | **Owner pick**  | Fits one furniture maker's system. Home Depot's "6 ft whips" are MC and liquidtight whips, a different part (Q13, P6).                                                                                                                                                                                        |
| 1672 | `Modular furniture whip, 10 ft`                       | —          | **Owner pick**  | Same (Q13).                                                                                                                                                                                                                                                                                                   |
| 1673 | `Motor starter, size 0`                               | —          | **Needs words** | `Motor starter, size 0, NEMA 1, 120V coil` (Q8).                                                                                                                                                                                                                                                              |
| 1674 | `Motor starter, size 1`                               | MH10       | **Needs words** | `Motor starter, size 1, NEMA 1, 120V coil` (Q8). Stoneway Square D 8536SCG3V02S (NEMA 1, 120V coil, found by search); the open one is 8536SCO3V02S ([Stoneway](https://www.stoneway.com/SQUARE-D-SCHNEIDER-ELECTRIC-8536SCO3V02S-Schneider-Electric-Square-D-8536SCO3V02S-Magnetic-Full-Voltage-Starter-27-Amp/p2322592)). P4. |
| 1675 | `Motor starter, size 2`                               | —          | **Needs words** | `Motor starter, size 2, NEMA 1, 120V coil` (Q8).                                                                                                                                                                                                                                                              |
| 1676 | `Panel-mount surge protective device, Type 2`         | PG18       | **Needs words** | `Panel-mount surge protective device, Type 2, 208Y/120V 3-phase, 50 kA` (Q10). Platt Eaton CVX050-208Y, Type 1 & 2 ([listing](https://www.platt.com/p/0836468/eaton/surge-protection-device-3ph-wye-120-208vac-50ka-nema-4x/786685216201/cutcvx050208y)). PG18 feeds it from a 3-pole breaker.         |
| 1677 | `Poke-through device, 2-service`                      | DV32       | **Needs words** | `4" poke-through, dual service, prewired duplex` (Q15). Platt Wiremold 4ATCP2RAA ([listing](https://www.platt.com/p/1768713/wiremold/prewired-poke-thru-device-4-diameter-dual-service-brushed-aluminum/786564090694/wmd4atcp2raa)) — one prewired duplex and one data gang. P1.                           |
| 1678 | `Poke-through device, 4-service`                      | —          | **Needs words** | `4" poke-through, 2 prewired duplex` (Q15). Platt Wiremold 4ATCP4RBK ([listing](https://platt.com/platt-electric-supply/Poke-Through-Systems-Assemblies/Wiremold/4ATCP4RBK/product.aspx?zpid=1149808)).                                                                                                      |
| 1679 | `Power pole fitting kit`                              | CS9        | **Needs words** | `Power pole accessory pack, trim plates and hanger clamp` (Q14). Platt Wiremold 25AM-AP: 2 ceiling trim plates, hanger clamp, feed end fitting ([listing](https://platt.com/platt-electric-supply/Tele-Power-Pole-Mounting-Kits-Kits/Wiremold/25AM-AP/product.aspx?zpid=284312)). S4.                   |
| 1680 | `Raised floor box`                                    | —          | **Owner pick**  | Nothing for access floors at the three stores (Q16).                                                                                                                                                                                                                                                         |
| 1681 | `400A switchboard`                                    | —          | **Owner pick**  | Built to order; not at the three stores. Quoted (Q1).                                                                                                                                                                                                                                                         |
| 1682 | `600A switchboard`                                    | —          | **Owner pick**  | Same (Q1).                                                                                                                                                                                                                                                                                                    |
| 1683 | `800A switchboard`                                    | —          | **Owner pick**  | Same (Q1).                                                                                                                                                                                                                                                                                                    |
| 1684 | `Tele-power pole, 10 ft`                              | CS9        | **Needs words** | `Tele-power pole, 10 ft, 2 duplex receptacles` (Q14). Platt Wiremold 25DTP-4, 10'5" ([listing](https://www.platt.com/p/0227108/wiremold/tele-power-series-steel-power-data-pole-2-outlets-20a-10-1-2/786776046403/wmd25dtp4)).                                                                            |
| 1685 | `Tele-power pole, 15 ft`                              | —          | **Needs words** | `Tele-power pole, 15 ft, 2 duplex receptacles` (Q14). Platt Wiremold 25DTP-415, 15'5" ([listing](https://www.platt.com/p/0227473/wiremold/tele-power-series-steel-power-data-pole-2-outlets-20-amp-15-1-2/786776046427/wmd25dtp415)).                                                                    |
| 1686 | `Time clock`                                          | CS2        | **Needs words** | `Time clock, astronomic, 7-day, 1-circuit, 120–277V` (Q4). Home Depot and Platt, Intermatic ET8015C ([HD](https://www.homedepot.com/p/Intermatic-30-Amp-7-Day-SPST-1-Circuit-Astronomic-Time-Switch-ET8015C/203954908), [Platt](https://www.platt.com/p/0626914/intermatic/time-switch-7-day-astronomic-spst-nema-1-30a-120-277vac/078275089754/imtet8015c)). |
| 1687 | `Variable frequency drive, 5 HP, 480V 3-phase`        | MH11       | **OK**          | Platt ABB ACS580-01-07A6-4, NEMA 1, 5 HP normal duty ([listing](https://www.platt.com/p/0970351/abb/variable-frequency-drive-3ph-n1-480v-3-5hp/abbacs5800107a64)).                                                                                                                                          |
| 1688 | `Wireway coupling`                                    | —          | **Needs words** | `4x4 wireway coupling` (Q17). Platt Hoffman F44GUC ([listing](https://www.platt.com/p/0027691/nvent-hoffman/wireway-connector-type-1-lay-in-4-x-4-steel-gray/783510522605/hoff44guc)) — the part `starterPacks.ts` already cites. Pack already each.                                                        |
| 1689 | `Wireway elbow`                                       | —          | **Needs words** | `4x4 wireway elbow, 90-degree` (Q17). Platt Hoffman F44G90E ([listing](https://www.platt.com/p/0027704/nvent-hoffman/wireway-90-elbow-type-1-lay-in-4-x-4-steel-gray/783510525200/hoff44g90e)).                                                                                                             |
| 1690 | `4x4 wireway, 5 ft`                                   | —          | **Needs words** | `4x4 wireway, 5 ft, NEMA 1, hinged cover` (Q17). Platt Hoffman F44G60 ([listing](https://www.platt.com/p/0064609/nvent-hoffman/wireway-type-1-hinged-cover-4-x-4-x-60-steel-gray-no-kos/783510522100/hoff44g60)). The NEMA 12 F44L60 is $469.72 — a different part.                                       |
| 1691 | `6x6 wireway, 5 ft`                                   | —          | **Needs words** | `6x6 wireway, 5 ft, NEMA 1, hinged cover` (Q17). Platt and Stoneway Hoffman F66G60 (found by search; A reads the price).                                                                                                                                                                                     |

**Counts: 6 OK, 27 need words, 12 owner picks.**

## Packs

| Row  | Name (after Q answers)                               | Unit today           | What the three stores sell                                                                                                          |
| ---- | ---------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1656 | Cable tray, 12" ladder, aluminum, 4" deep, 9" rungs  | per foot / 1         | Platt sells **12 ft sections**, priced each (B-Line 24A09-12-144). The owner types the section price ÷ 12, or the pack becomes "12 ft section" / 12 (Q6). |
| 1666 | Furniture feed connector                             | each / 1 (owner)     | Already fixed by the owner today (was box of 25).                                                                                   |
| 1688 | 4x4 wireway coupling                                 | each / 1 (owner)     | Already fixed by the owner today (was box of 25). Platt sells F44GUC each.                                                         |
| 1690 | 4x4 wireway, 5 ft                                    | each / 1             | Right: the 5 ft section is one item.                                                                                                |

## Search words (not names)

- **S1.** The four cable tray rows carry "basket", and the tray also carries
  "wire mesh". Wire basket tray is a different product at a different
  price — drop both words.
- **S2.** `Cable tray support bracket` carries "trapeze", the name of
  `Trapeze hanger kit` (Strut & Supports) — drop it.
- **S3.** `Equipment shut-off relay` carries "suppression", which with
  "hood" is the name of `Hood suppression micro-switch` — drop
  "suppression"; "hood" stays, as all three hood parts carry it.
- **S4.** `Power pole fitting kit` carries "telepower tele-power", the name
  of the pole it fits — drop both, so a search for the pole finds the pole
  first (the rename in Q14 keeps "power pole" in the name).
- **S5.** `Desk grommet outlet` carries "pop up", the name words of
  `Pop-up floor receptacle` (Receptacles) — drop it.
- **S6 (another shelf, for A to check).** `Floor box` (Boxes) carries
  "monument", "poke through" and "tombstone" — the name words of
  `Floor monument, 2-gang` and both poke-throughs. If the Boxes answers did
  not already drop them, drop them then.

## Things that could price a bid wrong

- **P1 — DV32 may price the receptacle twice.** The poke-through Platt
  calls "dual service" (Wiremold 4ATCP2RAA/RBK) comes with its duplex
  receptacle prewired, and DV32 also prices a separate `20A duplex
  receptacle`. One receptacle too many on every poke-through (Q15).
- **P2 — one Example price on gear that has no single size.** Busway runs
  225A to 5000A and a switchboard is built to the job; the unsized 208V
  panelboard stands for 100A to 400A. Any one number typed there is right
  for one job and wrong for the next, and looks like a checked price (Q1).
- **P3 — a 480V panelboard priced from its interior.** Platt lists the
  480Y/277V panelboard as an interior (Eaton PRL2A3225L42AS); the box and
  trim are separate items. Priced from that listing alone, the row leaves
  out two parts — the same trap the Panels answers covered with "Complete:
  box, interior and cover" (Q2).
- **P4 — motor starter overloads.** A starter with an old-style overload
  relay needs three heater elements bought separately; a solid-state one
  (Square D Type S "Motor Logic", per Stoneway's catalog) does not. A
  checks which one the price is read from, so MH10 is not short three
  heaters (Q8).
- **P5 — 400A/600A disconnects with no voltage.** 240V and 600V
  heavy-duty switches are different parts, and the catalog's 400A/600A
  fuses are 250V Class RK5, which fit only the 240V switch. The listings
  also spread wide: 600A 240V NEMA 1 is $1,420.64 at Home Depot (Siemens
  HF326NA) and about $6,653 at Platt (Eaton DH326NGK) (Q7).
- **P6 — furniture parts priced from look-alikes.** A furniture whip or
  feed fits one maker's system; Home Depot's "6 ft whip" is an MC whip.
  Priced from it, CS10 prices a part that does not fit the furniture (Q13).
- **P7 — the wrong transfer switch.** Home Depot's 200A ATS listings
  include 3-phase 277/480V units at $2,429 (Generac RTSW200K3). PG19 is a
  house: single-phase 120/240V, service-rated, outdoor (Q5).

## Common items that are MISSING

Searched the whole catalog first (`server/seed/materials/*.ts`): the sized
3-phase panelboards, 30–200A disconnects and the fuses (Panels), the
480Y/277V breakers and 600V switch (Breakers H1–H3, accepted), `Photocell`
(Switches), `Trapeze hanger kit` and strut (Strut & Supports), `Floor box`
and its covers (Boxes), `Pop-up floor receptacle` (Receptacles), `Pump
control relay` (Equipment & Appliances) already exist. `Raceway end cap` is
surface raceway and `Strut end cap` is strut; **no wireway part ends a
run**. Nothing below is in `pack-label-scan.md` or
`new-rows-source-check.md`.

| #   | Item                                                         | Source (owner's rule)                                                                                                                                                                                                                                                 | Why it is needed                                                                                     | Search words                                      |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| M1  | `4x4 wireway closure plate`                                  | **COMMON** — Platt, Hoffman F44GCPNK ([listing](https://www.platt.com/p/0027689/nvent-hoffman/wireway-closure-plate-4-x-4-type-1-gray-no-kos/783510528201/hoff44gcpnk))                                                                                              | Every wireway run has two open ends.                                                                 | "end cap", "end plate", "trough", "gutter"        |
| M2  | `6x6 wireway coupling`                                       | **COMMON** — Platt, Hoffman F66GUC ([listing](https://www.platt.com/p/0027747/nvent-hoffman/wireway-connector-type-1-lay-in-6-x-6-steel-gray/783510524302/hoff66guc))                                                                                                | Q17 makes the coupling 4x4; 6x6 sections need their own at each joint.                                | "connector", "joiner", "trough", "gutter"         |
| M3  | `6x6 wireway elbow, 90-degree`                               | **COMMON** — Platt, Hoffman F66G90E ([listing](https://www.platt.com/p/0027758/nvent-hoffman/wireway-90-elbow-type-1-lay-in-6-x-6-steel-gray/783510525309/hoff66g90e))                                                                                               | Same, for the elbow.                                                                                 | "ell", "turn", "trough", "gutter"                 |
| M4  | `6x6 wireway closure plate`                                  | **COMMON** — Platt, Hoffman F66GCPNK ([listing](https://www.platt.com/p/0027745/nvent-hoffman/wireway-closure-plate-6-x-6-type-1-gray-no-kos/783510528300/hoff66gcpnk))                                                                                              | Same as M1, for 6x6.                                                                                 | "end cap", "end plate", "trough", "gutter"        |
| M5  | `Cable tray splice plates, 12" ladder, aluminum, 4" deep, pair` | **COMMON if A confirms the part** — Platt sells B-Line splice-plate pairs ([category](https://www.platt.com/s/cable-tray-splicer-plates?cat=4virf354)); the one found (9A-1006) is for 6" tray and discontinued. If A finds no 4"-tray pair at the three, **SPECIALTY**. | Every 12 ft section joins the next with a pair; without it a tray run is priced with no joints.      | "splice", "splicer", "connector", "joint"         |

## Owner questions, with suggested answers

**Q1. No Example price on gear that is built to the job: `Busway`,
`Busway elbow`, the 400A/600A/800A switchboards, and the unsized `208V
3-phase panelboard`?**
Suggested: **yes**. Price blank; the busway and switchboards get the
description "Specialty - price from your supplier."; the 208V row keeps its
own "Unsized placeholder" note. No rename: each is quoted per job, and a
bid line says "Not priced" until the supplier's number is typed (P2).

**Q2. `480V 3-phase panelboard` → `225A panelboard, 480Y/277V 3-phase
main-lug, 42-space`, described "Complete: box, interior and cover"?**
Suggested: **yes**. 225A 42-circuit is what Platt stocks at 480Y/277V, it
takes the H1/H2 breakers already accepted, and the description stops it
being priced from the interior alone (P3).

**Q3. `30A 8-pole lighting contactor, electrically held, 120V coil, NEMA 1`,
and drop the "Generic placeholder" note? (CS2)**
Suggested: **yes**. It's the common enclosed one at Platt (Eaton
ECC03C1A8A); once named, the row is no longer a placeholder.

**Q4. `Time clock, astronomic, 7-day, 1-circuit, 120–277V`, and drop the
note? (CS2)**
Suggested: **yes**. Intermatic ET8015C, at Home Depot and Platt. "Time
clock" stays first so a search for it still lands here.

**Q5. `200A automatic transfer switch, service-rated, NEMA 3R, 120/240V`,
and drop the note? (PG19)**
Suggested: **yes**. PG19 is a house generator; this is the single-phase
outdoor switch at Platt (Generac 9952), not the 3-phase ones (P7).

**Q6. Cable tray: rename the four rows (tray `…, aluminum, 4" deep, 9"
rungs`; `Cable tray 90-degree horizontal bend, 12" ladder, aluminum, 4"
deep, 12" radius`; `Cable tray horizontal tee, 12" ladder, aluminum, 4"
deep`; `Cable tray wall bracket, 12"`), drop the tray's note, drop
"basket", "wire mesh" and "trapeze" (S1, S2), and price the tray per foot
from the 12 ft section?**
Suggested: **yes**. All at Platt (B-Line); aluminum ladder is the common
tray, and the per-foot price is the section price ÷ 12.

**Q7. `400A fused disconnect, NEMA 1, 240V` and `600A fused disconnect,
NEMA 1, 240V`, moved to the Panels shelf beside the other disconnects?**
Suggested: **yes**. Same pattern as the 30–200A switches, and 240V is what
the 250V fuses fit (P5). The 600V heavy-duty switch is a separate row, as
H3 already is. The move changes only the shelf; the rows keep their ids.

**Q8. Motor starters: `Motor starter, size {0,1,2}, NEMA 1, 120V coil`, and
`Combination motor starter, size 1, fusible, NEMA 1, 120V coil`? (MH10)**
Suggested: **yes**. Enclosure and coil set the price as much as the size.
A prices a starter that comes with its overload relay, so no heaters are
left out (P4).

**Q9. `Current transformer cabinet` → `CT cabinet, 48" x 36" x 11", NEMA
3R`?**
Suggested: **yes**. It's the common Milbank size at Platt; the utility
sets the size on each job, and a different one is a row the estimator adds.
"current transformer" stays a search word.

**Q10. `Panel-mount surge protective device, Type 2, 208Y/120V 3-phase,
50 kA`, and drop the note? (PG18)**
Suggested: **yes**. PG18 feeds it from a 3-pole breaker, so it is a
3-phase device; Platt's Eaton CVX050-208Y is the common one (rated Type 1
and 2, which covers a Type 2 install).

**Q11. The hood relays: `Equipment shut-off relay, enclosed, 20A SPDT,
dry-contact input` (CS15) and `Hood control interface relay, enclosed, 20A
DPDT, 120V coil`; drop "suppression" from the first (S3)?**
Suggested: **yes**. Both are enclosed control relays at Platt (Functional
Devices RIB01BDC, RIB01P). They stay two rows, as the reality check
decided.

**Q12. `Hood suppression micro-switch`: no Example price, description
"Specialty - price from your supplier."? (CS15)**
Suggested: **yes**. It comes from the hood suppression contractor and is
at none of the three stores. CS15's line will say "Not priced" until a
price is typed — true, and better than a made-up one.

**Q13. `Furniture feed connector` and both `Modular furniture whip` rows:
no Example price, "Specialty - price from your supplier."? (CS10)**
Suggested: **yes**. Each fits one furniture maker's system, and none is at
the three stores; a Home Depot MC whip is not the same part (P6).

**Q14. `Tele-power pole, 10 ft, 2 duplex receptacles` (CS9), `Tele-power
pole, 15 ft, 2 duplex receptacles`, and `Power pole fitting kit` → `Power
pole accessory pack, trim plates and hanger clamp`, dropping "telepower
tele-power" from it (S4)?**
Suggested: **yes**. All three are at Platt (Wiremold 25DTP-4, 25DTP-415,
25AM-AP), so they get Example prices from there even though they sort
lower. If A finds the 25DTP-4 already ships with its trim plates and
clamp, **stop and ask** before pricing CS9: the pack would then be
counted twice, and taking it out of CS9 is a starter change.

**Q15. STARTER EDIT — changes a starter. Poke-throughs: `4" poke-through,
dual service, prewired duplex` (DV32) and `4" poke-through, 2 prewired
duplex`; and take the `20A duplex receptacle` line out of DV32?**
Suggested: **yes**. "Dual service" is how Platt sells it (Wiremold
4ATCP2RAA), and it comes with its receptacle, so DV32 today prices one
receptacle too many (P1). DV32 keeps its MC cable, connectors, bushings and
wire nuts. If the owner would rather buy an empty poke-through and its own
receptacle, answer no and A names the fitting-only part instead.

**Q16. `Desk grommet outlet`, `Floor monument, 2-gang` and `Raised floor
box`: keep them, no Example price, "Specialty - price from your
supplier.", and drop "pop up" from the grommet (S5)?**
Suggested: **yes**. None is used by a starter, and none is one product at
the three stores; keeping them lets someone still count one on the job
that has it.

**Q17. Wireway: `4x4 wireway coupling`, `4x4 wireway elbow, 90-degree`,
`4x4 wireway, 5 ft, NEMA 1, hinged cover`, `6x6 wireway, 5 ft, NEMA 1,
hinged cover`, and add M1–M4 (closure plates for both sizes, the 6x6
coupling and elbow)?**
Suggested: **yes**. A coupling or elbow only fits one size, and a run
needs its end plates. All are Hoffman parts at Platt.

**Q18. Add M5, `Cable tray splice plates, 12" ladder, aluminum, 4" deep,
pair`?**
Suggested: **yes**. Every tray joint takes a pair. COMMON if A finds the
4"-tray pair at Platt; otherwise it goes in as SPECIALTY, price blank.

**Q19. Shelf moves: the four floor rows (both poke-throughs, floor
monument, raised floor box) to **Boxes** beside `Floor box`; the seven
furniture rows (both poles, the accessory pack, feed connector, both
whips, desk grommet) to **Surface Raceway**; the three hood parts to
**Equipment & Appliances** beside `Pump control relay`?**
Suggested: **yes**. None of them is distribution gear, and someone
looking for a poke-through looks beside the floor boxes. A move changes
only the shelf: ids, starters and the Specialty tag stay as they are.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row. **22 rows carry the Specialty tag by NAME**
  (`specialty.ts`, through `REALITY_RENAMES`); a renamed row must keep it,
  and `catalogReview20261008.test.ts` fails if the tagged name is no longer
  shipped.
- **Starter edits: Q15 only** (DV32 loses its `20A duplex receptacle`
  line). Every other starter follows its renamed row by key. Q14's
  "stop and ask" is not a starter edit until the owner says so.
- **Bid numbers that change:** Q12 and Q13 make CS15's micro-switch and
  CS10's feed connector and whip "Not priced" until a price is typed; Q15
  takes one receptacle off DV32; Q6 makes the tray price per foot.
- The 400A/600A switch move (Q7) and the shelf moves (Q19) are category
  changes, no new rows. The 400A/600A fuses already match them.
- New-row prices follow `new-rows-source-check.md` (the source rule); add
  M1–M5 there when accepted, M5 as COMMON or SPECIALTY by what A finds.
- Run `scripts/searchSpotCheck.mts` for "wireway", "gutter", "cable tray",
  "busway", "contactor", "time clock", "ats", "transfer switch", "spd",
  "poke through", "power pole", "telepower", "vfd", "motor starter", "ct
  cabinet" and "hood".
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it or removing its price.
