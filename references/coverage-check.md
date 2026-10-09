# Starter assembly coverage check — three real jobs (2026-10-08)

**List only.** Nothing was built or changed. Mark Y/N in the last column of
each MISSING table.

**What it was checked against** (counted from the seed, not from a document):
`BASELINE_ASSEMBLIES` = **183** starters, `BASELINE_MATERIALS` = **1,793**
catalog rows, on `c-sch80-500` at `4152839`. If either count reads
differently when you use this, the seed has moved since. Re-check any row
marked "parts exist" before building it.

"Parts exist" means every part is a shipped catalog row today. "NEEDS:" names
the catalog rows that do not exist.

Not counted as gaps: home runs, conduit and cable footage (those are traced
runs, not assemblies), and equipment the owner furnishes (the assembly is the
connection, per `starterAssemblies.ts`).

---

## 1. Dollar Tree remodel (commercial retail)

### Covered

- Sales floor lighting: **LT23** 8 ft strip rows, **LT19–21** troffers,
  **GC1** emergency pack in a fixture
- Back room and dock: **LT24** wraparound, **LT25** vapor tight, **LT29** wall
  pack
- Exit and emergency: **LT27**, **LT28**, **GC4** remote head
- Receptacles in MC: **DV20–23**, **DV24** isolated ground at the cash wrap,
  **DV25** controlled receptacle, **DV33** floor box, **DV34** surface raceway
  on block walls
- Switching: **DV26–29**, **DV30** ceiling sensor + power pack, **CS2** time
  clock + contactor + photocell
- Equipment: **CS1** sign, **CS5** reach-in cooler, **CS3** hand dryer, **CS4**
  EWC, **MH5** RTU, **MH6** RTU service receptacle, **MH9** exhaust fan, **MH7/MH8**
  walk-in (where the store has one)
- Fire alarm: **CS11–14**, **CS16** Knox box
- Data and cameras: **MS6**, **MS9**, **MS11**
- Panels: **PG12–18**, **GC2**, **PG7/PG8**, **MS13**
- Demo and retrofit: **DR1–DR19**

### MISSING (most common first)

| #   | Assembly                                       | Parts it needs                                                                                                                           | Parts exist?                            | Y/N |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --- |
| 1   | Emergency light (bug-eye), standalone          | 4" square box, 4" sq mud ring fixture, Emergency light, 12/2 MC 25, MC connectors 2, anti-shorts 2, wire nuts                            | Yes                                     |     |
| 2   | Fire alarm strobe only (restroom, back room)   | 4" square box, 4" sq mud ring 2-gang, Fire alarm strobe, 14/2 fire alarm cable 50                                                        | Yes                                     |     |
| 3   | Water heater connection, commercial (208V, MC) | 30A non-fused disconnect NEMA 1, 30A 2-Pole breaker, breaker lock-off, 10/2 MC 40, MC connectors, anti-shorts                            | Yes (RS3 exists but is NM/residential)  |     |
| 4   | Recessed wafer downlight, commercial (MC whip) | Wafer LED downlight (4" or 6"), 6 ft MC whip, ceiling support wire 2, support wire clip, wire nuts                                       | Yes (LT7/LT8 exist but are NM)          |     |
| 5   | Fire alarm control panel connection            | Fire alarm control panel (or connection only), Fire alarm battery 2, 20A 1-Pole breaker, breaker lock-off, 12/2 MC, 4" box + blank cover | Yes                                     |     |
| 6   | 208V cooler / freezer receptacle (NEMA 6-20)   | 4" square box, raised cover single receptacle, **6-20R receptacle**, 12/2 MC 40, 20A 2-Pole breaker, MC connectors                       | **NEEDS: 6-20R receptacle** (and 6-15R) |     |
| 7   | Receptacle in EMT (where MC is not allowed)    | 4" square box, 4" sq mud ring, 20A duplex, plate, 1/2" EMT connector 2, grounding pigtail, wire nuts                                     | Yes                                     |     |

### There, but missing a part

- **LT23 8 ft strip rows**: hung with `ceiling-support-wire` only. Open-ceiling
  sales floor rows are usually hung on aircraft cable. `Fixture hanging kit,
aircraft cable` exists and is not on the recipe.

---

## 2. Small office tenant improvement

### Covered

- Lighting: **LT19–22** troffers and strips, **DV31** 0-10V dimmer, **DV29/DV30**
  occupancy sensors, **GC1**, **LT27/LT28**, **GC4**
- Receptacles in MC: **DV20–23**, **DV25** controlled, **DV32** poke-through,
  **DV33** floor box, **CS9** power pole, **CS10** furniture feed, **DR19**
  relocate
- Switches in MC: **DV26**, **DV27**, **DV28**
- IT room: **CS6–8** twist-locks, **MS11** patch panel, **MS6** data
- Breakroom and restroom: **DV21** GFCI, **DV23** dedicated (fridge,
  microwave, copier), **CS3**, **CS4**, **MH9**
- Door hardware / access control power: **GC5**
- Fire alarm: **CS11–13**
- General: **MS1/MS2** junction boxes, **MS4** firestop, **DR** demo rows,
  **PG** panel and transformer rows

### MISSING (most common first)

| #   | Assembly                                       | Parts it needs                                                                                                                     | Parts exist?                | Y/N |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --- |
| 1   | Two switches one box, MC                       | 4" square box, 4" sq mud ring 2-gang, 20A single-pole switch 2, 2-gang toggle plate, 12/2 MC 40, MC connectors, pigtail, wire nuts | Yes (DV16 exists but is NM) |     |
| 2   | Recessed wafer downlight, commercial (MC whip) | same as Dollar Tree #4                                                                                                             | Yes                         |     |
| 3   | Fire alarm strobe only                         | same as Dollar Tree #2                                                                                                             | Yes                         |     |
| 4   | Data drop, 2-port (Cat6 x2)                    | Low-voltage mud ring, Cat6 cable 300, Cat6 jack 2, Keystone wall plate 2-port, J-hook 3                                            | Yes (MS6 is 1-port)         |     |
| 5   | Daylight sensor (energy-code daylight zone)    | Daylight sensor, 4" square box, 4" sq mud ring fixture, 18/2 or 18/3 control wire 25, wire nuts                                    | Yes                         |     |
| 6   | Wall TV / display location (conference room)   | Recessed TV receptacle box, 20A duplex, HDMI wall plate, low-voltage mud ring, 12/2 MC 25, MC connectors                           | Yes                         |     |
| 7   | Emergency light (bug-eye), standalone          | same as Dollar Tree #1                                                                                                             | Yes                         |     |
| 8   | Water heater connection, commercial            | same as Dollar Tree #3                                                                                                             | Yes                         |     |
| 9   | Ceiling receptacle for projector               | 4" square box, 4" sq raised cover duplex, 20A duplex, 12/2 MC 25, MC connectors                                                    | Yes                         |     |
| 10  | Mini-split, commercial (MC / flex)             | Disconnect, AC condenser whip, 20A 2-Pole breaker, 12/2 MC, MC connectors, 14/4 mini-split cable                                   | Yes (MH4 exists but is NM)  |     |
| 11  | Electric wall heater (vestibule, restroom)     | **In-wall fan-forced heater**, **wall heater thermostat**, 12/2 MC, 20A 2-Pole breaker                                             | **NEEDS: both heater rows** |     |
| 12  | Fire alarm speaker/strobe (voice systems)      | 4" box, 2-gang ring, Fire alarm speaker/strobe, 14/2 or 16/2 fire alarm cable                                                      | Yes                         |     |
| 13  | Heat detector (break room, mech room)          | 4" box, fixture ring, detector base, Heat detector, 14/2 fire alarm cable                                                          | Yes                         |     |

### There, but missing a part

- None found that would make a wrong number. The gaps are in what exists, not
  in the recipes.

---

## 3. Residential remodel (kitchen, bath, a few rooms)

### Covered

- Receptacles: **DV6** old-work duplex, **DV2** GFCI, **DV9** AFCI, **DV10**
  USB, **GR6** kitchen countertop, **GR7** bath, **DV3** dedicated (fridge),
  **DV8** outdoor GFCI
- Switches: **GR1** old-work switch, **DV4/DV5**, **DV13–19**
- Lighting: **LT6/LT33** recessed retrofit, **LT7/LT8/LT31/LT32** wafers,
  **LT9** shower light, **LT10** pendant, **LT11** chandelier, **LT12**
  vanity, **LT13** sconce, **LT14** under-cabinet, **LT3** fan retrofit,
  **DR20** can retrofit
- Kitchen equipment: **RS1** range, **RS4** dishwasher, **RS5** disposal
- Bath: **RS7** exhaust fan, **RS8** fan/light with humidity switch
- Safety: **RS9** smoke/CO
- Panel: **PG4**, **PG7–9**, **PG10**
- Low voltage: **MS7**, **MS8**, **MS10**, **RS10/RS11**

### MISSING (most common first)

| #   | Assembly                                   | Parts it needs                                                                                                            | Parts exist?                                                        | Y/N |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --- |
| 1   | Ceiling light, old work (finished ceiling) | Old-work ceiling box, surface ceiling fixture (or pendant), 14/2 NM-B 20, wire nuts                                       | Yes (LT1/LT10/LT12 all use new-work boxes)                          |     |
| 2   | Over-range microwave circuit, 20A          | Single-gang box (in cabinet), 20A single receptacle, plate, 12/2 NM-B 35, 20A 1-Pole breaker, wire nuts                   | Yes (see RS6 below)                                                 |     |
| 3   | GFCI receptacle, old work                  | Single-gang old-work box, 20A GFCI, decorator plate, 12/2 NM-B 25, wire nuts                                              | Yes (GR6/GR7/DV2 use new-work boxes)                                |     |
| 4   | Wall oven or cooktop, hardwired 40A        | 4-11/16" box, blank cover, 8/3 NM-B 40, 40A 2-Pole breaker, 3/4" cable connector, wire nuts                               | Yes                                                                 |     |
| 5   | Bath fan / heater combo, 20A               | Bath exhaust fan heater combo, 4" flex duct, vent cap, duct clamps 2, 12/3 NM-B 25, 20A 1-Pole breaker, switch, wire nuts | Yes                                                                 |     |
| 6   | Heated bathroom floor                      | **Floor heat mat**, **floor heat thermostat (GFCI)**, single-gang box, 12/2 NM-B 35, 20A 1-Pole breaker                   | **NEEDS: floor heat mat, floor heat thermostat**                    |     |
| 7   | Wall TV location (power + HDMI)            | Recessed TV receptacle box, HDMI wall plate, low-voltage mud ring, 12/2 NM-B 25                                           | Yes                                                                 |     |
| 8   | Island / peninsula receptacle, pop-up      | **Pop-up countertop receptacle**, 12/2 NM-B 35, 20A breaker (AFCI/GFCI)                                                   | **NEEDS: pop-up countertop receptacle** (only the floor one exists) |     |
| 9   | Pendant or sconce, old work                | Old-work ceiling box, LED pendant / sconce, 14/2 NM-B 20, wire nuts                                                       | Yes (could be one row with #1 instead)                              |     |
| 10  | Electric wall heater (bath)                | same as office #11                                                                                                        | **NEEDS: both heater rows**                                         |     |
| 11  | Tandem breaker add                         | 20/20 tandem breaker                                                                                                      | Yes                                                                 |     |

### There, but missing a part

- **RS6 "Range hood / microwave circuit"**: it is a range hood recipe (the
  hood itself, 14/2, no receptacle). It cannot price an over-range microwave,
  which needs a 20A dedicated receptacle in the cabinet on 12/2. Either split
  it (missing #2 above) or rename RS6 to "Range hood".
- **RS3 electric water heater**: fine for a house. Used on a commercial job it
  prices NM where MC or conduit is required (Dollar Tree / office #3).

---

## Missing catalog items (all three jobs)

| Item                         | Needed by                               | Y/N |
| ---------------------------- | --------------------------------------- | --- |
| 6-20R receptacle (and 6-15R) | 208V cooler / freezer, office equipment |     |
| In-wall fan-forced heater    | electric wall heater (office, bath)     |     |
| Wall heater thermostat       | same                                    |     |
| Floor heat mat               | heated bathroom floor                   |     |
| Floor heat thermostat (GFCI) | same                                    |     |
| Pop-up countertop receptacle | kitchen island                          |     |

Searched for and **found** (not missing): old-work ceiling box, daylight
sensor, fire alarm strobe, speaker/strobe, heat detector, fire alarm control
panel and battery, recessed TV receptacle box, HDMI wall plate, keystone
2-port plate, aircraft-cable hanging kit, 8/3 NM-B, 40A 2-Pole breaker, bath
fan heater combo, emergency light, EMT compression connectors, tandem
breakers. Search was by name in the seed dump; a row named some other way
would have been missed.

---

# Wider coverage check — ten more jobs (2026-10-08, later)

**List only, same rules as above.** Checked against `origin/local-dev` at
`94471cc` (A's Sch 80/500 seed included): **183** starters, **1,801**
catalog rows, counted from the seed. If either count reads differently when
you use this, the seed has moved; re-check a row before building it. Nothing
already on the first list is repeated here. Type: **R** residential, **C**
commercial, **B** both.

## Top 15 new missing assemblies (all ten jobs together)

| #   | Assembly                                               | Type | Parts exist?                          | Y/N |
| --- | ------------------------------------------------------ | ---- | ------------------------------------- | --- |
| 1   | Equipment connection, hardwired (flex whip), 208/240V  | C    | Yes                                   |     |
| 2   | Commercial Level 2 EV charger, 208V (pedestal or wall) | C    | Yes                                   |     |
| 3   | Outdoor emergency service disconnect (NEC 230.85)      | R    | Yes                                   |     |
| 4   | Apartment unit panel, 125A main-lug                    | R    | Yes                                   |     |
| 5   | Overhead door operator connection                      | C    | Yes                                   |     |
| 6   | Air compressor connection, 240V                        | B    | Yes                                   |     |
| 7   | Welder / shop receptacle, 50A (NEMA 6-50)              | B    | **No: 6-50R**                         |     |
| 8   | Wireless access point drop (ceiling)                   | C    | Yes                                   |     |
| 9   | Bollard light                                          | C    | Yes                                   |     |
| 10  | Manual transfer switch, 6–10 circuit                   | R    | Yes                                   |     |
| 11  | EV-ready conduit stub (EV-capable space)               | B    | Yes                                   |     |
| 12  | Multi-unit meter center                                | B    | **No: meter center rows**             |     |
| 13  | Hospital-grade receptacle (exam / operatory)           | C    | **Partly: no healthcare (HCF) cable** |     |
| 14  | 208V kitchen equipment receptacle, 30A (NEMA 6-30)     | C    | **No: 6-30R**                         |     |
| 15  | Recessed clock receptacle (classroom)                  | C    | Yes                                   |     |

The per-job tables below hold the full list, with each assembly's parts.

## 4. Restaurant / coffee shop TI

**Covered:** DV20–23 in MC, CS5 cooler, MH7/MH8 walk-in, CS15 hood shunt,
MH9/MH10 exhaust and make-up air, MH5 RTU, CS3, CS4, CS7 L6-30, DV24 POS, CS1
sign, LT19–25, LT27/LT28, CS11–14, MS6.

| #   | Missing                                                 | Type | Parts it needs                                                                                           | Parts exist?                | Y/N |
| --- | ------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- | --------------------------- | --- |
| 1   | Equipment connection, hardwired (flex whip), 208/240V   | C    | 4" square box + blank cover, 1/2" FMC or liquidtight 6, connectors 2, #10 or #12 THHN 18, 2-Pole breaker | Yes                         |     |
| 2   | 208V kitchen equipment receptacle, 30A (espresso, oven) | C    | 4" square box, raised cover single, **6-30R**, 10/2 MC 40, 30A 2-Pole breaker, MC connectors             | **No: 6-30R**               |     |
| 3   | 50A equipment receptacle (NEMA 6-50)                    | C    | 4-11/16" box, raised cover, **6-50R**, 6/2 MC, 50A 2-Pole breaker                                        | **No: 6-50R**               |     |
| 4   | Kitchen GFCI receptacle, stainless plate                | C    | 4" box, mud ring, 20A GFCI, stainless decorator plate, 12/2 MC 25                                        | Yes (DV21 uses nylon plate) |     |

## 5. Warehouse / shop building

**Covered:** LT26 high bay, LT22/LT23 strips, LT29 wall pack, MH11 (HVLS fan
on VFD), MH12 unit heater, MH9, MS5 trapeze, CS6–8 twist-locks, PG12–17.

| #   | Missing                                         | Type | Parts it needs                                                                         | Parts exist?                                  | Y/N |
| --- | ----------------------------------------------- | ---- | -------------------------------------------------------------------------------------- | --------------------------------------------- | --- |
| 1   | Overhead door operator connection               | C    | 30A non-fused disconnect NEMA 1, 1/2" FMC 6, connectors 2, #12 THHN 18, 4" box + cover | Yes (push-button station comes with the door) |     |
| 2   | Air compressor connection, 240V                 | B    | 30A or 60A disconnect, 3/4" liquidtight 6, connectors 2, #10 THHN 18, 2-Pole breaker   | Yes                                           |     |
| 3   | Welder receptacle, 50A (NEMA 6-50)              | B    | 4-11/16" box, raised cover, **6-50R**, 6/2 MC or #6 THHN, 50A 2-Pole breaker           | **No: 6-50R**                                 |     |
| 4   | High bay with occupancy sensor                  | C    | LT26's parts + Occupancy sensor, high bay                                              | Yes                                           |     |
| 5   | Dock light (swing arm)                          | C    | **Dock light**, 4" box, raised cover, 12/2 MC                                          | **No: dock light**                            |     |
| 6   | 3-phase twist-lock receptacle (L15-30 / L21-30) | C    | 4" box, raised cover, **L15-30 or L21-30**, 10/4 MC, 30A 3-Pole breaker                | **No: L15-30, L21-30**                        |     |
| 7   | Cord reel / cord drop                           | C    | **Cord reel**, 12/3 SOOW, cord grip, 4" box                                            | **No: cord reel** (SOOW exists)               |     |

## 6. Medical / dental office

**Covered:** DV20–25, DV24 isolated ground, DV33 floor box, MS6, CS11–13,
GC5, LT19–21, LT27/LT28.

| #   | Missing                                      | Type | Parts it needs                                                                                     | Parts exist?                      | Y/N |
| --- | -------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- | --------------------------------- | --- |
| 1   | Hospital-grade receptacle (exam / operatory) | C    | 4" box, mud ring, Hospital-grade receptacle, plate, **12/2 healthcare (HCF) cable** 25, connectors | **Partly: no HCF cable**          |     |
| 2   | Dental chair connection (floor box + j-box)  | C    | Floor box, blank floor box cover, 4" box, 12/2 MC, Cat6, connectors                                | Yes                               |     |
| 3   | Dental compressor / vacuum pump              | C    | same as Warehouse #2                                                                               | Yes                               |     |
| 4   | Emergency-branch receptacle (red)            | C    | 4" box, mud ring, **red 20A receptacle**, plate, HCF cable                                         | **No: red receptacle, HCF cable** |     |
| 5   | Imaging / X-ray dedicated circuit, 208V      | C    | same as Restaurant #1                                                                              | Yes                               |     |

## 7. School classroom remodel

**Covered:** LT19–21, DV29–31, DV20–23, CS11–13, LT27/LT28, MS6, DR rows.

| #   | Missing                              | Type | Parts it needs                                                                       | Parts exist?                     | Y/N |
| --- | ------------------------------------ | ---- | ------------------------------------------------------------------------------------ | -------------------------------- | --- |
| 1   | Wireless access point drop (ceiling) | C    | 4" box or low-voltage mud ring, Cat6 150, Cat6 jack, keystone plate 1-port, J-hook 3 | Yes                              |     |
| 2   | Recessed clock receptacle            | C    | 4" box, mud ring, Recessed clock receptacle, 12/2 MC 25, connectors                  | Yes                              |     |
| 3   | PA / paging ceiling speaker          | C    | In-ceiling speaker, 16/2 speaker wire 50, J-hook 2                                   | Yes (MS10 is tagged residential) |     |

## 8. Apartment unit (new construction)

**Covered:** the residential device, lighting, kitchen, bath and low-voltage
rows on the first list, plus RS9 and RS19.

| #   | Missing                             | Type | Parts it needs                                                                      | Parts exist?              | Y/N |
| --- | ----------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------------------------- | --- |
| 1   | Apartment unit panel, 125A main-lug | R    | 125A main-lug sub-panel 24-space, ground bar kit, cable connectors, directory label | Yes                       |     |
| 2   | Multi-unit meter center             | B    | **Meter center (4–6 position)**, ground rods 2, clamps, #4 bare                     | **No: meter center rows** |     |
| 3   | PTAC / through-wall unit receptacle | R    | single-gang box, **6-20R or 6-30R**, 12/2 or 10/2 NM-B, 2-Pole breaker              | **No: 6-20R / 6-30R**     |     |

## 9. 200A residential service upgrade

**Covered:** PG2, PG3, GR2, GR3, PG4, PG9, PG10 surge, PG11.

| #   | Missing                                       | Type | Parts it needs                                                                 | Parts exist? | Y/N |
| --- | --------------------------------------------- | ---- | ------------------------------------------------------------------------------ | ------------ | --- |
| 1   | Outdoor emergency service disconnect (230.85) | R    | 200A fused or non-fused disconnect NEMA 3R, 4-0 SER 10, SE connectors 2, label | Yes          |     |
| 2   | Service mast / riser replacement only         | R    | 2" rigid 10, metal weatherhead, mast flashing, 2" meter hub, riser straps 2    | Yes          |     |

## 10. EV charger install (home and commercial)

**Covered:** RS12 48A hardwired (home), RS13 14-50 receptacle (home).

| #   | Missing                                                | Type | Parts it needs                                                                                                          | Parts exist? | Y/N |
| --- | ------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| 1   | Commercial Level 2 EV charger, 208V (pedestal or wall) | C    | EVSE pedestal (or wall charger), 40A 2-Pole breaker, pole anchor bolt kit, concrete base, 3/4" liquidtight + connectors | Yes          |     |
| 2   | EV-ready conduit stub (EV-capable space)               | B    | 4-11/16" box + blank cover, 1" EMT or PVC stub, connectors, label                                                       | Yes          |     |
| 3   | Home charger, 40A / 32A hardwired                      | R    | 40A or 32A EV charger, 6/3 NM-B (40A) or 8/3 NM-B (32A), 50A or 40A 2-Pole breaker                                      | Yes          |     |

**There, but check a part — RS12 (48A hardwired):** it uses 6/3 NM-B on a 60A
breaker. NM is held to its 60°C rating, which is 55A for #6 copper, and a 48A
charger needs 60A of wire (125% of 48A). If that holds, RS12 needs 4/3 NM-B,
which **the catalog does not carry**, or #6 THHN in conduit. Owner to
confirm.

## 11. Standby generator hookup

**Covered:** PG19 (ATS, pad, charger, control wire, ground rod), RS18/GR4
inlets.

| #   | Missing                                    | Type | Parts it needs                                                             | Parts exist? | Y/N |
| --- | ------------------------------------------ | ---- | -------------------------------------------------------------------------- | ------------ | --- |
| 1   | Manual transfer switch, 6–10 circuit       | R    | Manual transfer switch, inlet box, generator cord, 10/3 NM-B, connectors   | Yes          |     |
| 2   | Essential-loads subpanel (moving circuits) | R    | 100A main-lug sub-panel, breakers, #12 THHN 40, wire nuts, directory label | Yes          |     |

## 12. Parking lot / site lighting

**Covered:** GC3 pole light, CS2 photocell + contactor, LT16 flood, LT29 wall
pack.

| #   | Missing                            | Type | Parts it needs                                        | Parts exist?              | Y/N |
| --- | ---------------------------------- | ---- | ----------------------------------------------------- | ------------------------- | --- |
| 1   | Bollard light                      | C    | Bollard light, anchor bolts, concrete base, wire nuts | Yes                       |     |
| 2   | In-grade handhole / pull box       | C    | **Polymer-concrete handhole with lid**                | **No: handhole rows**     |     |
| 3   | Replace head on existing pole      | C    | LED area light, wire nuts                             | Yes                       |     |
| 4   | Second head added to existing pole | C    | LED area light, pole arm / bracket, wire nuts         | **Not checked: pole arm** |     |

## 13. Small retail strip (new build)

**Covered:** PG12–14 tenant and house panels, PG16 transformer, CS1 signs,
MH5/MH6 RTUs, LT29, GC3, PG11, CS11–14, CS16.

| #   | Missing                                      | Type | Parts it needs                                                          | Parts exist?                                             | Y/N |
| --- | -------------------------------------------- | ---- | ----------------------------------------------------------------------- | -------------------------------------------------------- | --- |
| 1   | Multi-tenant meter center                    | C    | same as Apartment #2                                                    | **No: meter center rows**                                |     |
| 2   | Main switchboard / main disconnect, 400–800A | C    | **Switchboard** (or 600A fused disconnect + fuses), anchors, labels     | **Partly: 600A fused disconnect exists; no switchboard** |     |
| 3   | CT cabinet and meter                         | C    | **CT cabinet**, meter base, conduit nipple                              | **No: CT cabinet**                                       |     |
| 4   | Telecom backboard with ground bar            | C    | **Plywood backboard**, **telecom ground busbar**, #6 green, ground lugs | **No: backboard, telecom busbar**                        |     |
| 5   | Storefront / canopy downlight, wet-rated     | C    | Wet-rated wafer downlight, 4" box, 12/2 MC, connectors                  | Yes                                                      |     |

## New missing catalog items (not on the first list)

| Item                                      | Needed by                                 | Y/N |
| ----------------------------------------- | ----------------------------------------- | --- |
| 6-30R receptacle                          | restaurant equipment, PTAC                |     |
| 6-50R receptacle                          | welder, commercial oven                   |     |
| L15-30 and L21-30 receptacles             | 3-phase shop equipment                    |     |
| Healthcare (HCF) armored cable, 12/2      | medical / dental receptacles              |     |
| Red (emergency branch) 20A receptacle     | medical                                   |     |
| Meter center, 4–6 position                | apartments, retail strip                  |     |
| CT cabinet                                | retail strip                              |     |
| Switchboard, 400–800A                     | retail strip                              |     |
| Polymer-concrete handhole with lid        | site lighting                             |     |
| Dock light (swing arm)                    | warehouse                                 |     |
| Cord reel                                 | warehouse                                 |     |
| Plywood telecom backboard; telecom busbar | retail strip, office                      |     |
| 4/3 NM-B                                  | only if RS12 is corrected (EV note above) |     |

Searched for and **found**: hospital-grade receptacle, recessed clock
receptacle, bollard light, LED area light, EVSE pedestal, 32A/40A/48A
chargers, manual and automatic transfer switches, 200A disconnects (fused and
non-fused, NEMA 1 and 3R), 125A main-lug sub-panels, 400A meter base, high-bay
occupancy sensor, wet-rated wafers, stainless plates, 12/3 and 10/3 SOOW,
600A fused disconnect. Search was by name; a row named some other way would
have been missed.
