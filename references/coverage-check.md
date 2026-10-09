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
