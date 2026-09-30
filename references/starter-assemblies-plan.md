# Starter assemblies — parts lists (PLAN, 2026-09-29)

**Status: PLAN ONLY. Nothing here is built.** Written on `track-c` at the
owner's request: draft the parts list for roughly 120–150 starter assemblies
from the shipped catalog, hours left BLANK for the owner to set, and list every
part the catalog does not have.

**Every part name in backticks below is an exact `BASELINE_MATERIALS` name.**
Checked by script against the catalog as it stands at `b454eb5` (1,543 rows),
not by eye — see "How this was checked" at the end. A part the catalog does NOT
have is written in italics with ‡ and is collected in § Gaps.

## Read first — what is already decided

- `STARTER_LIBRARY.md` — the 27 CORE + 31 PHASE 2 assembly NAMES, the baseline
  assumptions (NM-B and plastic boxes for resi, allowances not home runs,
  breakers only where the assembly creates a circuit), and the rule that
  **wiring method and box material are a swap inside one assembly, not a second
  assembly.** Every CORE and PHASE 2 name appears below; this document extends
  that list, it does not replace it.
- `server/seed/baselineAssemblies.ts` — the 8 that ship today. Marked ★ below.
  **Their names do not change**: the seeder matches by name, so a rename ships a
  second copy beside the first on every existing database.
- **D18 (branch whip)** — the cable line in a device recipe IS the wire to the
  next device, declared per line. Marked `whip` below. Lines that include a home
  run (dedicated circuits, appliances, gear) are deliberately NOT whips.
- `STARTER_LIBRARY.md` § Important Notes and `shared/laborHourDefaults.ts` —
  hours. **This plan carries none.** See question Q1: the shipped starters
  carry placeholder hours today, and "blank" needs a decision before build.
- CLAUDE.md § "Starter content ships unpriced" — every part here is $0 until the
  contractor prices it, so a starter costs $0 of material out of the box.
- CLAUDE.md § "As manual or as automated as the user wants" — starters are a
  head start, never a gate. Nothing here is required to count.
- `references/track-c-retail-catalog-plan.md` — the Dollar Tree–style job the
  commercial and retrofit groups are measured against, and R3 (no surface
  raceway yet), which shows up again in § Gaps.

## Conventions used in every list

- **Resi** = `12-2 NM-B` / `14-2 NM-B`, plastic boxes. **Commercial** = MC in a
  `4" square box` with a `4" square mud ring`, `3/8" MC connector` ×2 and
  `MC anti-short bushing` ×2 per whip (one at each end), and a
  `Grounding pigtail`. The connector size follows `mcFittingNames`.
- Allowances: 25 ft for a receptacle whip, 20 ft for a switch leg, 35–40 ft
  where the assembly carries its own home run. Same as STARTER_LIBRARY.md.
- **Fixtures and appliances are listed as their own line** (marked F), so an
  owner-furnished job deletes one line rather than rebuilding the recipe. See
  Q2 — the 8 shipping starters leave the fixture OUT today.
- A lay-in fixture's `6ft MC whip` lands in a junction box that feeds several
  fixtures; the box is its own assembly (MS1), not repeated per fixture.
- Conduit runs and feeders stay traced (STARTER_LIBRARY.md § Important Notes).
  Where gear is fed by a traced run, the assembly holds the gear and its
  terminations only.
- Quantities are starting points, edited per job like every other starter.

## Categories

`assemblies.category` is a 5-value MySQL enum: Devices, Lighting, Panels,
Equipment Connections, Low Voltage/EMS. The owner's eight groups map onto it
like this — **Resi / commercial is already `projectType`, not a category**, so
only two groups have no home:

| Group in this plan     | Enum value today                    |
| ---------------------- | ----------------------------------- |
| DV Devices             | Devices                             |
| LT Lighting            | Lighting                            |
| RS Resi specials       | its natural category, `residential` |
| CS Commercial specials | its natural category, `commercial`  |
| PG Power / gear        | Panels                              |
| MH Motor / HVAC        | Equipment Connections               |
| DR Demo / retrofit     | **none** — see Q3                   |
| MS Misc                | Low Voltage/EMS, or none — Q3       |

## Counts

| Group                  | Assemblies | of which ship today (★) |
| ---------------------- | ---------- | ----------------------- |
| DV Devices             | 34         | 5                       |
| LT Lighting            | 30         | 2                       |
| RS Resi specials       | 20         | 0                       |
| CS Commercial specials | 16         | 0                       |
| PG Power / gear        | 20         | 1                       |
| MH Motor / HVAC        | 14         | 0                       |
| DR Demo / retrofit     | 20         | 0                       |
| MS Misc                | 14         | 0                       |
| **Total**              | **168**    | **8**                   |

If that is above the 150 you want, the natural cut is the commercial device
twins (DV20–DV34 are the MC versions of resi devices, Q4) — they are the only
entries that exist because of wiring method rather than because of the work.

---

## DV — Devices

Resi, NM-B, plastic box (project type Both unless noted).

| #    | Assembly                              | Type | Parts                                                                                                                                                                                           |
| ---- | ------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV1  | Duplex receptacle standard ★          | Both | `Single-gang box` 1 · `Duplex receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                              |
| DV2  | GFCI receptacle ★                     | Both | `Single-gang box` 1 · `GFCI receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                                |
| DV3  | Dedicated 20A receptacle ★            | Both | `Single-gang box` 1 · `Duplex receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 35 · `20A Single-Pole breaker` 1 · `Wire nuts` 3                                                                     |
| DV4  | Single-pole switch ★                  | Both | `Single-gang box` 1 · `Single-pole switch` 1 · `Wall plate` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                             |
| DV5  | Dimmer switch ★                       | Both | `Single-gang box` 1 · `Dimmer` 1 · `Wall plate` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                                         |
| DV6  | Duplex receptacle retrofit            | Both | `Single-gang old-work box` 1 · `Duplex receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                     |
| DV7  | 20A duplex receptacle                 | Both | `Single-gang box` 1 · `20A duplex receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                          |
| DV8  | Outdoor GFCI receptacle, in-use cover | Resi | `Single-gang box` 1 · `Siding mounting block` 1 · `GFCI receptacle, weather-resistant` 1 · `Weatherproof in-use cover` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                  |
| DV9  | AFCI receptacle                       | Both | `Single-gang box` 1 · `AFCI receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                                |
| DV10 | USB combo receptacle                  | Resi | `Single-gang box` 1 · `USB combo receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 3                                                                                           |
| DV11 | Quad receptacle                       | Both | `Double-gang box` 1 · `Quad receptacle` 1 · `2-gang wall plate` 1 · `12-2 NM-B` 25 whip · `Wire nuts` 4                                                                                         |
| DV12 | Switch/receptacle combo               | Resi | `Single-gang box` 1 · `Switch/receptacle combo device` 1 · `Wall plate` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                 |
| DV13 | 3-way switch                          | Both | `Single-gang box` 1 · `3-way switch` 1 · `Wall plate` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 3                                                                                                   |
| DV14 | 4-way switch                          | Both | `Single-gang box` 1 · `4-way switch` 1 · `Wall plate` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 3                                                                                                   |
| DV15 | 3-way dimmer                          | Both | `Single-gang box` 1 · `3-way dimmer` 1 · `Wall plate` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 3                                                                                                   |
| DV16 | Two switches, one box                 | Both | `Double-gang box` 1 · `Single-pole switch` 2 · `2-gang wall plate` 1 · `14-2 NM-B` 40 whip · `Wire nuts` 5                                                                                      |
| DV17 | Three switches, one box               | Both | `Triple-gang box` 1 · `Single-pole switch` 3 · `3-gang wall plate` 1 · `14-2 NM-B` 60 whip · `Wire nuts` 7                                                                                      |
| DV18 | Fan/light combo control               | Resi | `Single-gang box` 1 · `Combination fan/light control` 1 · `Wall plate` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 4                                                                                  |
| DV19 | Timer / smart / vacancy switch        | Resi | `Single-gang box` 1 · `Timer switch` 1 · `Wall plate` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3 — swap the device for `Smart switch` or `Vacancy sensor switch` (one recipe, per STARTER_LIBRARY) |

Commercial twins — MC, metal box (project type Commercial). See Q4.

| #    | Assembly                                | Parts                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DV20 | Duplex receptacle, MC                   | `4" square box` 1 · `4" square mud ring` 1 · `20A duplex receptacle` 1 · `Wall plate` 1 · `12-2 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 1 · `Wire nuts` 3                                                            |
| DV21 | GFCI receptacle, MC                     | as DV20, device `20A GFCI receptacle`                                                                                                                                                                                                                                    |
| DV22 | Quad receptacle, MC                     | `4-11/16" square box` 1 · `4-11/16" square mud ring, 2-gang` 1 · `20A duplex receptacle` 2 · `2-gang wall plate` 1 · `12-2 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 2 · `Wire nuts` 4                                 |
| DV23 | Dedicated 20A receptacle, MC            | `4" square box` 1 · `4" square mud ring` 1 · `20A duplex receptacle` 1 · `Wall plate` 1 · `12-2 MC cable` 40 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 1 · `20A Single-Pole breaker` 1 · `Wire nuts` 3                                   |
| DV24 | Isolated-ground receptacle (cash wrap)  | `4" square box` 1 · `4" square mud ring` 1 · `Isolated-ground receptacle` 1 · `Wall plate` 1 · `12-2 MC cable, isolated ground` 50 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `20A Single-Pole breaker` 1 · `Wire nuts` 3                                     |
| DV25 | Controlled receptacle (plug load)       | `4" square box` 1 · `4" square mud ring` 1 · `Controlled duplex receptacle` 1 · `Wall plate` 1 · `12-3 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 1 · `Wire nuts` 4                                                     |
| DV26 | Single-pole switch, MC                  | `4" square box` 1 · `4" square mud ring` 1 · `20A single-pole switch` 1 · `Wall plate` 1 · `12-2 MC cable` 20 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 1 · `Wire nuts` 3                                                           |
| DV27 | 3-way switch, MC                        | as DV26, `20A 3-way switch`, `12-3 MC cable` 20 whip                                                                                                                                                                                                                     |
| DV28 | Key switch, MC                          | as DV26, `Key switch`                                                                                                                                                                                                                                                    |
| DV29 | Wall occupancy sensor, MC               | as DV26, `Dual-tech occupancy sensor switch`                                                                                                                                                                                                                             |
| DV30 | Ceiling occupancy sensor + power pack   | `4" square box` 1 · `4" square mud ring, fixture` 1 · `Ceiling occupancy sensor, dual-tech` 1 · `Sensor power pack, 120/277V` 1 · `18/3 control wire` 25 · `12-2 MC cable` 10 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grid box bracket` 1 · `Wire nuts` 4 |
| DV31 | 0-10V dimmer, MC                        | `4" square box` 1 · `4" square mud ring` 1 · `0-10V dimmer` 1 · `Wall plate` 1 · `12-2 MC cable` 20 whip · `18/2 control wire` 25 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Grounding pigtail` 1 · `Wire nuts` 4                                            |
| DV32 | Floor receptacle, poke-through          | `Poke-through device, 2-service` 1 · `20A duplex receptacle` 1 · `12-2 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 3                                                                                                             |
| DV33 | Floor box receptacle (slab)             | `Floor box` 1 · `Floor box cover` 1 · `20A duplex receptacle` 1 · `Wire nuts` 3 — conduit and wire traced                                                                                                                                                                |
| DV34 | Surface raceway receptacle (block wall) | `20A duplex receptacle` 1 · `Wire nuts` 3 · ‡_Surface raceway, 10 ft_ 1 · ‡_Surface raceway device box_ 1 · ‡_Surface raceway cover plate_ 1 · ‡_Surface raceway entrance fitting_ 1 — **cannot ship until R3**                                                          |

## LT — Lighting

Resi (F = the fixture line; see Q2).

| #    | Assembly                          | Type | Parts                                                                                                                                                                             |
| ---- | --------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LT1  | Surface-mount ceiling fixture ★   | Both | `4" square box` 1 · `Fixture mounting bracket` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3 — add F `Surface-mount ceiling fixture` 1 (Q2)                                             |
| LT2  | Ceiling fan standard ★            | Resi | `Fan-rated ceiling box` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 4 — add F `Ceiling fan` 1 (Q2)                                                                                      |
| LT3  | Ceiling fan, retrofit brace       | Resi | `Ceiling fan brace box` 1 · F `Ceiling fan` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 4                                                                                               |
| LT4  | Recessed can new construction, 6" | Both | F `6" recessed can, new construction IC` 1 · `5"/6" LED retrofit trim` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                    |
| LT5  | Recessed can new construction, 4" | Both | F `4" recessed can, new construction IC` 1 · `4" LED retrofit trim` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                       |
| LT6  | Recessed can retrofit, 6"         | Both | F `6" recessed can, remodel IC` 1 · `5"/6" LED retrofit trim` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                             |
| LT7  | Wafer LED downlight, 6" (canless) | Both | F `5"/6" wafer LED downlight` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 2                                                                                                             |
| LT8  | Wafer LED downlight, 4" (canless) | Both | F `4" wafer LED downlight` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 2                                                                                                                |
| LT9  | Shower light, wet-rated           | Resi | F `4" recessed can, new construction IC` 1 · `4" shower wet-rated trim` 1 · `LED PAR20 bulb` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                              |
| LT10 | Pendant light                     | Resi | `Octagon box, plastic` 1 · F `LED pendant fixture` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                        |
| LT11 | Chandelier, heavy bracing         | Resi | `Ceiling fan brace box` 1 · F `Chandelier` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                                |
| LT12 | Vanity light                      | Resi | `Octagon box, plastic` 1 · F `Vanity light, 3-light` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                      |
| LT13 | Wall sconce                       | Resi | `Octagon box, plastic` 1 · F `LED wall sconce` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                                            |
| LT14 | Under-cabinet light               | Resi | F `24" under-cabinet light bar` 1 · `14-2 NM-B` 15 whip · `3/8" cable connector` 1 · `Wire nuts` 2                                                                                |
| LT15 | Exterior porch light              | Resi | `Siding mounting block` 1 · `Octagon box, plastic` 1 · F `LED wall sconce` 1 · `14-2 NM-B` 20 whip · `Wire nuts` 3                                                                |
| LT16 | Flood / security light            | Both | `1/2" weatherproof round box` 1 · F `LED security light, motion-activated, 2-head` 1 · `14-2 NM-B` 25 whip · `Wire nuts` 3                                                        |
| LT17 | Landscape transformer and circuit | Resi | `300W landscape transformer` 1 · `1/2" weatherproof box, single-gang` 1 · `GFCI receptacle, weather-resistant` 1 · `Weatherproof in-use cover` 1 · `12-2 UF-B` 25 · `Wire nuts` 3 |
| LT18 | Landscape light, each             | Resi | F `Landscape light fixture` 1 · `Landscape lighting cable` 30 · `Landscape hub connector` 1                                                                                       |

Commercial — the Dollar Tree job. Project type Commercial.

| #    | Assembly                            | Parts                                                                                                                                                               |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LT19 | 2x4 LED troffer, lay-in             | F `2x4 LED troffer` 1 · `6ft MC whip` 1 · `T-bar grid clip` 4 · `Ceiling support wire` 2 · `Independent support wire clip` 2 · `Wire nuts` 3                        |
| LT20 | 2x2 LED troffer, lay-in             | as LT19, F `2x2 LED troffer`                                                                                                                                        |
| LT21 | 1x4 LED troffer, lay-in             | as LT19, F `1x4 LED troffer`                                                                                                                                        |
| LT22 | 4 ft LED strip, surface / suspended | F `4 ft LED strip fixture` 1 · `6ft MC whip` 1 · `Ceiling support wire` 2 · `Wire nuts` 3                                                                           |
| LT23 | 8 ft LED strip (sales floor rows)   | F `8 ft LED strip fixture` 1 · `8 ft MC whip` 1 · `Ceiling support wire` 2 · `Wire nuts` 3                                                                          |
| LT24 | 4 ft LED wraparound (back room)     | F `4 ft LED wraparound` 1 · `4" square box` 1 · `4" square mud ring, fixture` 1 · `Wire nuts` 3                                                                     |
| LT25 | 4 ft vapor tight (cooler, dock)     | F `4 ft vapor tight fixture` 1 · `6ft MC whip` 1 · `Cord grip` 1 · `Wire nuts` 3                                                                                    |
| LT26 | High bay                            | F `High bay` 1 · `8 ft MC whip` 1 · `Beam clamp` 2 · `Wire nuts` 3                                                                                                  |
| LT27 | Exit sign                           | `4" square box` 1 · `4" square mud ring, fixture` 1 · F `Exit sign` 1 · `12-2 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 3 |
| LT28 | Emergency light / exit combo        | as LT27, F `Emergency exit light combo` — swap to `Emergency light` for a bug-eye                                                                                   |
| LT29 | Exterior wall pack                  | F `Wall pack, full cutoff` 1 · `1/2" weatherproof round box` 1 · `1/2" EMT raintight connector` 1 · `Silicone sealant` 1 · `Wire nuts` 3                            |
| LT30 | Track light, 8 ft with 4 heads      | `Octagon box, metal` 1 · `8 ft lighting track` 1 · `Track light end feed` 1 · F `Track light head` 4 · `Wire nuts` 3                                                |

## RS — Resi specials

| #    | Assembly                              | Parts                                                                                                                                                                                                                        |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RS1  | Range receptacle, 50A                 | `Double-gang box` 1 · `50A range receptacle` 1 · `6-3 NM-B` 40 · `50A 2-Pole breaker` 1 · `3/4" cable connector` 1 · `Range cord, 4-wire` 1                                                                                  |
| RS2  | Dryer receptacle, 30A                 | `Double-gang box` 1 · `30A dryer receptacle` 1 · `10-3 NM-B` 40 · `30A 2-Pole breaker` 1 · `1/2" cable connector` 1 · `Dryer cord, 4-wire` 1                                                                                 |
| RS3  | Electric water heater connection      | `10-2 NM-B` 40 · `30A 2-Pole breaker` 1 · `Breaker lock-off` 1 · `1/2" cable connector` 1 · `Wire nuts` 3                                                                                                                    |
| RS4  | Dishwasher connection                 | F `Dishwasher whip` 1 · `12-2 NM-B` 35 · `20A Single-Pole AFCI/GFCI combo breaker` 1 · `3/8" cable connector` 1 · `Wire nuts` 3                                                                                              |
| RS5  | Garbage disposal, switched            | `Single-gang box` 2 · `Duplex receptacle` 1 · `Single-pole switch` 1 · `Wall plate` 2 · F `Garbage disposal cord` 1 · `12-2 NM-B` 35 · `12-3 NM-B` 10 · `20A Single-Pole AFCI/GFCI combo breaker` 1 · `Wire nuts` 5          |
| RS6  | Range hood / microwave circuit        | F `Range hood fan` 1 · `14-2 NM-B` 20 whip · `3/8" cable connector` 1 · `Wire nuts` 3                                                                                                                                        |
| RS7  | Bath exhaust fan wiring               | F `Bath exhaust fan, 80 CFM` 1 · `4" insulated flex duct` 1 · `4" roof vent cap` 1 · `Duct clamp` 2 · `14-3 NM-B` 20 whip · `3/8" cable connector` 1 · `Wire nuts` 3                                                         |
| RS8  | Bath fan/light combo, humidity switch | F `Bath exhaust fan, light combo` 1 · `Humidity sensor switch` 1 · `Single-gang box` 1 · `Wall plate` 1 · `4" insulated flex duct` 1 · `4" wall vent cap` 1 · `Duct clamp` 2 · `14-3 NM-B` 20 whip · `Wire nuts` 4           |
| RS9  | Combination smoke/CO detector         | `Shallow round box` 1 · F `Hardwired smoke/CO detector` 1 · `14-3 NM-B` 20 whip · `Wire nuts` 4                                                                                                                              |
| RS10 | Doorbell, wired                       | `Doorbell transformer` 1 · `Doorbell button` 1 · `Doorbell chime, wired` 1 · `18/2 control wire` 50                                                                                                                          |
| RS11 | Video doorbell wiring                 | F `Video doorbell` 1 · `Video doorbell chime kit` 1 · `Doorbell transformer` 1 · `18/2 control wire` 30                                                                                                                      |
| RS12 | EV charger circuit, 48A hardwired     | F `48A EV charger` 1 · `6-3 NM-B` 40 · `60A 2-Pole breaker` 1 · `1" cable connector` 1                                                                                                                                       |
| RS13 | EV / RV receptacle, 50A (NEMA 14-50)  | `4-11/16" square box` 1 · `50A RV receptacle` 1 · `6-3 NM-B` 40 · `50A 2-Pole GFCI breaker` 1 · `1" cable connector` 1                                                                                                       |
| RS14 | Hot tub / spa connection              | `60A GFCI spa disconnect` 1 · `60A 2-Pole breaker` 1 · `3/4" liquidtight flexible conduit` 6 · `3/4" liquidtight flexible conduit connector` 2 · `#6 THHN` 18 · `#10 THHN` 6 · `Spa bonding lug` 1 · `#8 bare CU, solid` 20  |
| RS15 | Pool pump connection                  | `30A non-fused disconnect, NEMA 3R` 1 · `20A 2-Pole GFCI breaker` 1 · `1/2" liquidtight flexible conduit` 6 · `1/2" liquidtight flexible conduit connector` 2 · `#12 THHN` 18 · `#8 bare CU, solid` 20 · `Spa bonding lug` 1 |
| RS16 | Well pump connection                  | `Well pump control box` 1 · `Well pump pressure switch` 1 · `30A 2-Pole breaker` 1 · `10-2 NM-B` 30 · `Submersible pump splice kit` 1 · ‡_Submersible pump cable_ 150                                                        |
| RS17 | Sump pump circuit                     | `Single-gang box` 1 · `20A single receptacle` 1 · `Wall plate` 1 · `12-2 NM-B` 35 · `20A Single-Pole GFCI breaker` 1 · `Wire nuts` 3                                                                                         |
| RS18 | Generator inlet and interlock         | `Generator interlock kit` 1 · `30A power inlet box` 1 · `30A 2-Pole breaker` 1 · `10-3 NM-B` 25 · `1/2" cable connector` 1 · F `30A generator cord` 1                                                                        |
| RS19 | Baseboard heater, 240V                | F `Baseboard heater` 1 · `Baseboard heater thermostat` 1 · `Single-gang box` 1 · `12-2 NM-B` 35 · `20A 2-Pole breaker` 1 · `Wire nuts` 4                                                                                     |
| RS20 | Attic fan with thermostat             | F `Attic fan` 1 · `Attic fan thermostat` 1 · `14-2 NM-B` 25 · `3/8" cable connector` 1 · `Wire nuts` 3                                                                                                                       |

## CS — Commercial specials

| #    | Assembly                             | Parts                                                                                                                                                                                                            |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS1  | Sign circuit and disconnect          | `20A Single-Pole breaker` 1 · `30A non-fused disconnect, NEMA 3R` 1 · `1/2" liquidtight flexible conduit` 6 · `1/2" liquidtight flexible conduit connector` 2 · `#12 THHN` 18 · `1/2" EMT raintight connector` 1 |
| CS2  | Time clock and lighting contactor    | `Time clock` 1 · `Lighting contactor` 1 · `Photocell` 1 · `#14 THHN` 30 · `Wire nuts` 6                                                                                                                          |
| CS3  | Hand dryer                           | `4" square box` 1 · `4" square blank cover` 1 · `12-2 MC cable` 40 · `20A Single-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 3 — dryer owner-furnished, see § Gaps         |
| CS4  | Drinking fountain / EWC              | `4" square box` 1 · `4" square mud ring` 1 · `20A GFCI receptacle` 1 · `Wall plate` 1 · `12-2 MC cable` 40 · `20A Single-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 3     |
| CS5  | Reach-in cooler / freezer receptacle | `4" square box` 1 · `4" square mud ring` 1 · `20A single receptacle` 1 · `Wall plate` 1 · `12-2 MC cable` 40 · `20A Single-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 3   |
| CS6  | Twist-lock receptacle, L5-20         | `4" square box` 1 · `4" square raised cover, duplex` 1 · `L5-20 receptacle` 1 · `12-2 MC cable` 40 · `20A Single-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2                             |
| CS7  | Twist-lock receptacle, L6-30         | `4" square box` 1 · `4" square raised cover, duplex` 1 · `L6-30 receptacle` 1 · `10-2 MC cable` 40 · `30A 2-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2                                  |
| CS8  | Twist-lock receptacle, L14-30        | `4" square box` 1 · `4" square raised cover, duplex` 1 · `L14-30 receptacle` 1 · `10-3 MC cable` 40 · `30A 2-Pole breaker` 1 · `3/8" MC connector` 2 · `MC anti-short bushing` 2                                 |
| CS9  | Tele-power pole                      | `Tele-power pole, 10 ft` 1 · `Power pole fitting kit` 1 · `12-3 MC cable` 25 whip · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `Wire nuts` 4                                                            |
| CS10 | Modular furniture feed               | `Furniture feed connector` 1 · `Modular furniture whip, 6 ft` 1 · `4" square box` 1 · `4" square blank cover` 1 · `Wire nuts` 4                                                                                  |
| CS11 | Fire alarm pull station              | `4" square box` 1 · `4" square mud ring` 1 · `Fire alarm pull station` 1 · `14-2 fire alarm cable` 50                                                                                                            |
| CS12 | Fire alarm horn/strobe               | `4" square box` 1 · `4" square mud ring, 2-gang` 1 · `Fire alarm horn/strobe` 1 · `14-2 fire alarm cable` 50                                                                                                     |
| CS13 | Fire alarm smoke detector (system)   | `4" square box` 1 · `4" square mud ring, fixture` 1 · `Detector base` 1 · `14-2 fire alarm cable` 50 · ‡_System smoke detector head_ 1                                                                           |
| CS14 | Duct smoke detector                  | `Duct smoke detector` 1 · `Detector relay module` 1 · `14-2 fire alarm cable` 50 · `18/4 control wire` 25                                                                                                        |
| CS15 | Kitchen hood shunt interface         | `Hood suppression micro-switch` 1 · `Equipment shut-off relay` 1 · `Shunt-trip breaker, 2-Pole` 1 · `18/4 control wire` 50 · `Wire nuts` 4                                                                       |
| CS16 | Knox box                             | `Rapid-entry key box` 1 · `Concrete wedge anchor` 4                                                                                                                                                              |

## PG — Power / gear

| #    | Assembly                                 | Type | Parts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PG1  | 200A main panel furnish and install ★    | Both | `200A main panel` 1 · `20A Single-Pole breaker` 10 · `20A 2-Pole breaker` 2 · `#8 THHN` 40 · `Wire nuts` 6                                                                                                                                                                                                                                                                                                                                                                                     |
| PG2  | Service upgrade 200A, overhead           | Resi | `200A meter base` 1 · `200A main panel, 40-space` 1 · `2" metal weatherhead` 1 · `2" rigid conduit` 10 · `2" rigid conduit coupling` 1 · `2" conduit locknut` 2 · `2" conduit bushing` 1 · `#4/0 XHHW AL` 20 · `#2/0 XHHW AL` 10 · `Ground rod, 8 ft` 2 · `Ground rod clamp` 2 · `#4 bare CU, stranded` 30 · `Water pipe bonding clamp` 1 · `Intersystem bonding bridge` 1 · `Panel directory label` 1 · ‡_2" meter hub_ 1 · ‡_Service mast roof flashing_ 1 · ‡_Service mast support clamp_ 2 |
| PG3  | Service upgrade 200A, meter-main outdoor | Resi | `Combination meter-main` 1 · `4/0-4/0-4/0-2/0 SER AL` 10 · `Ground rod, 8 ft` 2 · `Ground rod clamp` 2 · `#4 bare CU, stranded` 30 · `Water pipe bonding clamp` 1 · `Intersystem bonding bridge` 1 · `Panel directory label` 1 · ‡_SE cable connector, 2"_ 2                                                                                                                                                                                                                                   |
| PG4  | Panel replacement like-for-like, 200A    | Both | `200A main panel, 40-space` 1 · `#12 THHN` 30 · `Wire nuts` 12 · `Panel knockout seal` 4 · `Panel directory label` 1 — breakers counted with PG7/PG8                                                                                                                                                                                                                                                                                                                                           |
| PG5  | Subpanel, 100A (resi, 60A feed)          | Resi | `100A main-lug sub-panel, 24-space` 1 · `60A 2-Pole breaker` 1 · `6-3 NM-B` 30 · `Ground bar kit` 1 · `1" cable connector` 1 · `Panel directory label` 1                                                                                                                                                                                                                                                                                                                                       |
| PG6  | Load center relocate                     | Both | `#12 THHN` 40 · `Wire nuts` 20 · `6x6 pull box` 1 · `Panel knockout seal` 4 — the old can becomes a junction box                                                                                                                                                                                                                                                                                                                                                                               |
| PG7  | Breaker add, single-pole                 | Both | `20A Single-Pole breaker` 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PG8  | Breaker add, 2-pole                      | Both | `30A 2-Pole breaker` 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PG9  | Breaker swap to AFCI/GFCI                | Resi | `20A Single-Pole AFCI/GFCI combo breaker` 1                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PG10 | Whole-house surge protector              | Resi | `Whole-house surge protector` 1 · `20A 2-Pole breaker` 1 · `1/2" conduit locknut` 1                                                                                                                                                                                                                                                                                                                                                                                                            |
| PG11 | Grounding electrode system               | Both | `Ground rod, 8 ft` 2 · `Ground rod clamp` 2 · `#6 bare CU, stranded` 30 · `Water pipe bonding clamp` 1 · `Intersystem bonding bridge` 1                                                                                                                                                                                                                                                                                                                                                        |
| PG12 | Panelboard 225A 3-phase, main-lug        | Comm | `225A panelboard, 3-phase main-lug, 42-space` 1 · `Concrete wedge anchor` 4 · `Panel directory label` 1 · `Arc flash label` 1                                                                                                                                                                                                                                                                                                                                                                  |
| PG13 | Panelboard 225A 3-phase, main breaker    | Comm | `225A panelboard, 3-phase main, 42-space` 1 · `Concrete wedge anchor` 4 · `Panel directory label` 1 · `Arc flash label` 1                                                                                                                                                                                                                                                                                                                                                                      |
| PG14 | Panelboard 400A 3-phase, main breaker    | Comm | `400A panelboard, 3-phase main, 42-space` 1 · `Concrete wedge anchor` 6 · `Panel directory label` 1 · `Arc flash label` 1                                                                                                                                                                                                                                                                                                                                                                      |
| PG15 | Feeder breaker, 3-pole                   | Comm | `100A 3-Pole breaker` 1 · `2/0-4/0 AWG crimp lug` 4                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PG16 | Dry-type transformer, 45 kVA             | Comm | `45 kVA dry-type transformer, 480V-208Y/120V 3-phase` 1 · `70A 3-Pole breaker` 1 · `1-1/4" flexible metal conduit` 6 · `1-1/4" flexible metal conduit connector` 4 · `Ground lug, compression` 2 · `#4 bare CU, stranded` 20 · `Trapeze hanger kit` 1 · `1/2" all-thread rod, 10 ft` 2                                                                                                                                                                                                         |
| PG17 | Safety switch, 100A fused                | Both | `100A fused disconnect, NEMA 1` 1 · `100A cartridge fuse` 3 · `Concrete wedge anchor` 4                                                                                                                                                                                                                                                                                                                                                                                                        |
| PG18 | Building surge protective device         | Comm | `Surge protective device` 1 · `30A 3-Pole breaker` 1 · `#10 THHN` 12 · `3/4" conduit locknut` 1                                                                                                                                                                                                                                                                                                                                                                                                |
| PG19 | Standby generator hookup                 | Resi | `Automatic transfer switch` 1 · `Generator pad` 1 · `Generator battery charger` 1 · `18/4 control wire` 30 · `Ground rod, 8 ft` 1 · `Ground rod clamp` 1                                                                                                                                                                                                                                                                                                                                       |
| PG20 | Temporary power pole                     | Both | `100A meter base` 1 · `60A main panel, 8-space` 1 · `GFCI receptacle, weather-resistant` 2 · `Weatherproof in-use cover, 2-gang` 1 · `1/2" weatherproof box, double-gang` 1 · `Ground rod, 8 ft` 1 · `Ground rod clamp` 1 · `#6 bare CU, stranded` 10 · ‡_Temporary pole (6x6 post)_ 1                                                                                                                                                                                                         |

## MH — Motor / HVAC hookups

| #    | Assembly                            | Type | Parts                                                                                                                                                                                                                                               |
| ---- | ----------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MH1  | HVAC condenser disconnect + whip    | Both | `60A non-fused pullout disconnect` 1 · `AC condenser whip` 1 · `30A 2-Pole breaker` 1 · `10-2 NM-B` 35 · `1/2" cable connector` 1 · `Duct seal` 1                                                                                                   |
| MH2  | Furnace / air handler, 120V         | Resi | `Handy box` 1 · `Handy box cover, single toggle` 1 · `Motor-rated toggle switch` 1 · `14-2 NM-B` 35 · `15A Single-Pole breaker` 1 · `3/8" cable connector` 2 · `Wire nuts` 3                                                                        |
| MH3  | Air handler with electric heat, 60A | Resi | `60A non-fused disconnect, NEMA 1` 1 · `60A 2-Pole breaker` 1 · `6-3 NM-B` 35 · `1" cable connector` 2                                                                                                                                              |
| MH4  | Mini-split connection               | Resi | `60A non-fused pullout disconnect` 1 · `AC condenser whip` 1 · `20A 2-Pole breaker` 1 · `12-2 NM-B` 35 · `1/2" cable connector` 1 · ‡_Mini-split interconnect cable, 14/4_ 25                                                                       |
| MH5  | Rooftop unit (RTU) hookup           | Comm | `60A non-fused disconnect, NEMA 3R` 1 · `3/4" liquidtight flexible conduit` 6 · `3/4" liquidtight flexible conduit connector` 2 · `#6 THHN` 18 · `#10 THHN` 6 · `3/4" EMT raintight connector` 1 · ‡_Roof penetration (pitch pocket / roof jack)_ 1 |
| MH6  | RTU service receptacle              | Comm | `1/2" weatherproof box, single-gang` 1 · `20A GFCI receptacle, weather-resistant` 1 · `Weatherproof in-use cover` 1 · `1/2" EMT raintight connector` 1 · `Wire nuts` 3                                                                              |
| MH7  | Walk-in cooler, condensing unit     | Comm | `30A non-fused disconnect, NEMA 3R` 1 · `30A 3-Pole breaker` 1 · `3/4" liquidtight flexible conduit` 6 · `3/4" liquidtight flexible conduit connector` 2 · `#10 THHN` 24                                                                            |
| MH8  | Walk-in cooler, evaporator          | Comm | `30A non-fused disconnect, NEMA 1` 1 · `20A 2-Pole breaker` 1 · `1/2" liquidtight flexible conduit` 6 · `1/2" liquidtight flexible conduit connector` 2 · `#12 THHN` 18 · `Cord grip` 1                                                             |
| MH9  | Exhaust fan, commercial             | Comm | `Handy box` 1 · `Handy box cover, single toggle` 1 · `Motor-rated toggle switch` 1 · `1/2" flexible metal conduit` 6 · `1/2" flexible metal conduit connector` 2 · `#12 THHN` 18 · `Wire nuts` 3                                                    |
| MH10 | Motor with starter, 3-phase         | Comm | `Motor starter, size 1` 1 · `30A non-fused disconnect, NEMA 1` 1 · `30A 3-Pole breaker` 1 · `3/4" liquidtight flexible conduit` 6 · `3/4" liquidtight flexible conduit connector` 2 · `#10 THHN` 24                                                 |
| MH11 | Motor on VFD                        | Comm | `Variable frequency drive` 1 · `30A non-fused disconnect, NEMA 1` 1 · `30A 3-Pole breaker` 1 · `3/4" liquidtight flexible conduit` 6 · `3/4" liquidtight flexible conduit connector` 2 · `#10 THHN` 24                                              |
| MH12 | Unit heater                         | Comm | F `Unit heater` 1 · `30A non-fused disconnect, NEMA 1` 1 · `30A 2-Pole breaker` 1 · `1/2" flexible metal conduit` 6 · `1/2" flexible metal conduit connector` 2 · `#10 THHN` 18 · `Beam clamp` 2 · `3/8" all-thread rod, 10 ft` 1                   |
| MH13 | Tankless electric water heater      | Resi | `40A 2-Pole breaker` 2 · `8-2 NM-B` 80 · `3/4" cable connector` 2                                                                                                                                                                                   |
| MH14 | Thermostat low-voltage wiring       | Both | `18/5 control wire` 50 · `Low-voltage mud ring` 1                                                                                                                                                                                                   |

## DR — Demo / retrofit (Dollar Tree–type work)

Demo is almost all labor; the parts are what the leftover box, circuit or
opening needs to be made safe.

| #    | Assembly                                         | Parts                                                                                                                                                                                                        |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DR1  | Demo fixture, blank the box                      | `4" square blank cover` 1 · `Wire nuts` 3                                                                                                                                                                    |
| DR2  | Demo device, blank plate                         | `1-gang blank plate` 1 · `Wire nuts` 3                                                                                                                                                                       |
| DR3  | Demo lay-in fixture, make safe above ceiling     | `4" square blank cover` 1 · `Wire nuts` 3                                                                                                                                                                    |
| DR4  | Demo circuit back to panel                       | `Panel filler plate` 1 · `Panel directory label` 1                                                                                                                                                           |
| DR5  | Relocate lay-in troffer (≤6 ft)                  | `6ft MC whip` 1 · `T-bar grid clip` 4 · `Independent support wire clip` 2 · `Wire nuts` 3                                                                                                                    |
| DR6  | Replace troffer like-for-like                    | F `2x4 LED troffer` 1 · `T-bar grid clip` 4 · `Wire nuts` 3                                                                                                                                                  |
| DR7  | Troffer LED retrofit kit                         | `LED troffer retrofit kit` 1 · `Wire nuts` 4                                                                                                                                                                 |
| DR8  | 4 ft fluorescent to LED, ballast bypass (2-lamp) | `4 ft LED T8 tube, ballast bypass` 2 · `Non-shunted lampholder` 4 · `Wire nuts` 4                                                                                                                            |
| DR9  | 4 ft fluorescent to LED, plug-and-play (2-lamp)  | `4 ft LED T8 tube, ballast compatible` 2                                                                                                                                                                     |
| DR10 | 8 ft fluorescent to LED, single-pin (2-lamp)     | `8 ft LED T8 tube, ballast bypass, single-pin` 2 · `Wire nuts` 4                                                                                                                                             |
| DR11 | 8 ft HO fluorescent to LED (2-lamp)              | `8 ft LED T8 tube, ballast bypass, HO` 2 · `Wire nuts` 4                                                                                                                                                     |
| DR12 | HID to LED corn lamp                             | `LED corn bulb, E39` 1 · `Wire nuts` 2                                                                                                                                                                       |
| DR13 | Replace HID high bay with LED high bay           | F `High bay` 1 · `Wire nuts` 3                                                                                                                                                                               |
| DR14 | Replace wall pack                                | F `Wall pack, full cutoff` 1 · `Silicone sealant` 1 · `Wire nuts` 3                                                                                                                                          |
| DR15 | Replace exit / emergency light                   | F `Emergency exit light combo` 1 · `Wire nuts` 3                                                                                                                                                             |
| DR16 | Replace receptacle like-for-like                 | `20A duplex receptacle` 1 · `Wall plate` 1                                                                                                                                                                   |
| DR17 | Replace receptacle with GFCI                     | `20A GFCI receptacle` 1 · `Wall plate` 1                                                                                                                                                                     |
| DR18 | Replace switch with occupancy sensor             | `Dual-tech occupancy sensor switch` 1 · `Wall plate` 1 · `Wire nuts` 2                                                                                                                                       |
| DR19 | Relocate receptacle (wall move), MC              | `4" square box` 1 · `4" square mud ring` 1 · `20A duplex receptacle` 1 · `Wall plate` 1 · `12-2 MC cable` 15 · `3/8" MC connector` 2 · `MC anti-short bushing` 2 · `4" square blank cover` 1 · `Wire nuts` 6 |
| DR20 | Recessed can LED retrofit (resi)                 | `5"/6" LED retrofit trim` 1                                                                                                                                                                                  |

## MS — Misc (and low voltage)

| #    | Assembly                                 | Type | Parts                                                                                                                                                |
| ---- | ---------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| MS1  | Junction box, 4" square                  | Both | `4" square box` 1 · `4" square blank cover` 1 · `Grounding pigtail` 1 · `Wire nuts` 4                                                                |
| MS2  | Junction box above lay-in ceiling        | Comm | `4" square box` 1 · `4" square blank cover` 1 · `Independent support wire clip` 1 · `Ceiling support wire` 1 · `Grounding pigtail` 1 · `Wire nuts` 4 |
| MS3  | Pull box, 12x12                          | Comm | `12x12 pull box` 1 · `Concrete wedge anchor` 4                                                                                                       |
| MS4  | Firestop penetration                     | Both | `Firestop caulk` 0.25 — a tube does about four; see Q5                                                                                               |
| MS5  | Conduit trapeze (strut rack), per hanger | Comm | `Trapeze hanger kit` 1 · `3/8" all-thread rod, 10 ft` 1 · `Beam clamp` 2 · `3/8" hex nut` 4 · `3/8" flat washer` 4                                   |
| MS6  | Data drop, Cat6 (commercial)             | Comm | `Low-voltage mud ring` 1 · `Cat6 cable` 150 · `Cat6 jack` 1 · `Keystone wall plate, 1-port` 1 · `J-hook` 3                                           |
| MS7  | Data drop, Cat6 (resi)                   | Resi | `Low-voltage mud ring` 1 · `Cat6 cable` 75 · `Cat6 jack` 1 · `Keystone wall plate, 1-port` 1                                                         |
| MS8  | Cable TV drop                            | Resi | `Low-voltage mud ring` 1 · `RG6 coax cable` 75 · `Coax F connector` 2 · `Coax wall plate` 1                                                          |
| MS9  | Security camera drop                     | Both | F `Security camera, dome` 1 · `Cat6 cable` 100 · `Cat6 jack` 1 · ‡_RJ45 plug_ 1                                                                      |
| MS10 | In-ceiling speaker                       | Resi | F `In-ceiling speaker` 1 · `16/2 speaker wire` 50                                                                                                    |
| MS11 | Network patch panel, 24-port             | Comm | `Cat6 patch panel` 1 · `Network rack, wall mount` 1 · `Horizontal cable manager` 1 · `Cat6 patch cord, 3 ft` 24                                      |
| MS12 | Structured media enclosure (resi)        | Resi | `Structured media enclosure` 1 · `Duplex receptacle` 1 · `Single-gang box` 1 · `12-2 NM-B` 25                                                        |
| MS13 | Panel labelling (existing panel)         | Both | `Panel directory label` 1 · `Arc flash label` 1                                                                                                      |
| MS14 | Temporary lighting string, per 100 ft    | Both | ‡_Temporary light string, 100 ft_ 1                                                                                                                  |

---

## Gaps — parts the catalog does not have

Each is used above and marked ‡. Ordered by how many assemblies it blocks and
how often the Dollar Tree job hits it.

| Missing part                                                         | Used by | Note                                                                                      |
| -------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Surface raceway, 10 ft (+ device box, cover plate, entrance fitting) | DV34    | Retail plan **R3**, held for Track A's category enum. The largest gap for the retail job. |
| System smoke detector head (photo, 2-wire/addressable)               | CS13    | Catalog has `Detector base` but only residential hardwired detectors to put on it.        |
| Submersible pump cable (drop cable)                                  | RS16    | `Submersible pump splice kit` ships; the cable it splices does not.                       |
| Mini-split interconnect cable, 14/4                                  | MH4     | Often SOOW or listed mini-split cable; `14-4 MC cable` is the wrong part outdoors.        |
| 2" meter hub                                                         | PG2     | Every overhead mast lands on one.                                                         |
| Service mast roof flashing (roof boot)                               | PG2     |                                                                                           |
| Service mast support clamp                                           | PG2     |                                                                                           |
| SE cable connector, 2"                                               | PG3     | `4/0-4/0-4/0-2/0 SER AL` ships with no connector to terminate it.                         |
| Roof penetration (pitch pocket / roof jack)                          | MH5     | Often by the roofer; worth a row so it is a decision rather than an omission.             |
| RJ45 plug                                                            | MS9     | Needed for any camera or AP drop that terminates on a plug.                               |
| Temporary pole (6x6 post)                                            | PG20    | Or treat as a rental line — Q6.                                                           |
| Temporary light string, 100 ft                                       | MS14    |                                                                                           |

**Not gaps, by decision — owner-furnished and deliberately unlisted:** the hand
dryer (CS3), the sign itself (CS1), the RTU (MH5), the walk-in (MH7/MH8), the
motor (MH10/MH11). The assembly is the connection; the equipment is the owner's.

**Near misses worth a look, not blocking anything:** a 6-2 NM-B (a 48A charger
does not need the neutral that `6-3 NM-B` carries), a 90-degree liquidtight
connector (every RTU and condenser whip turns one), and a line-voltage
thermostat named as such (RS19 and MH12 borrow `Baseboard heater thermostat`).

---

## Questions for the owner (recommendation first)

**Q1. What does "hours blank" look like in the app?** The 8 shipping starters
carry placeholder hours from `shared/laborHourDefaults.ts`, labelled as guesses.
**Recommend: ship the new ones with hours NOT SET — a real null that the bid
shows as "Hours not set", the same way an unpriced line says "Not priced" —
never 0.** A zero prices the labor at nothing and looks finished; the § 6 rule
(unset is not zero) already says so. That needs `baseLaborHours` to accept
null and a label on the builder and bid line, so it is a small build before the
seed, not a data entry. Alternative: keep the placeholder defaults until you
set real ones — faster, but they are numbers you did not choose.

**Q2. Fixtures and appliances: in the recipe, or out?** The 8 shipping
starters leave the fixture out (owner-supplied). **Recommend: in, as its own
line**, and add it to LT1/LT2 too. A resi contractor furnishes most fixtures;
on an owner-furnished retail job you delete one line, and at $0 until priced it
cannot inflate anything by surprise.

**Q3. Where do Demo/retrofit and Misc live?** The category enum has no slot for
them. **Recommend: add "Demo & Retrofit" and "General" to
`ASSEMBLY_CATEGORIES`, riding with Track A's enum migration** (the same one R3
waits on) so it is one additive `ALTER`, not two. Until then they cannot seed.

**Q4. Commercial device twins (DV20–DV33): ship them, or not?**
STARTER_LIBRARY.md says wiring method is a swap, not a second assembly.
**Recommend: ship them anyway, as commercial-only.** A retail contractor would
otherwise swap NM-B → MC, plastic → 4" square, and add connectors on every
device they use, which is the setup-before-value the manual-first rule
forbids. Record it as a deliberate exception in STARTER_LIBRARY.md. If you
disagree, this is the 15-row cut that brings the total to ~150.

**Q5. Fractional consumables (MS4 firestop at 0.25 tube).** **Recommend: allow
it** — `assembly_materials.qty` is decimal(10,4) and a whole tube per
penetration overstates the material four times.

**Q6. Rentals and temp power (PG20, MS14).** **Recommend: add the two missing
rows as ordinary materials** rather than inventing a rental line type now;
revisit if rentals start showing up on real bids.

**Q7. Kits.** Three kits ship (`baselineKits.ts`). **Recommend: add retail
kits later, once these starters exist** — e.g. "Sales floor bay" (8 ft strips

- exit + J-box) — not in the same change.

---

## How this was checked

Every backticked name above was extracted by script and compared with
`BASELINE_MATERIALS` by exact name (the seeder matches exactly, and ignores the
rename map — CLAUDE.md § single-pole). What the check searched for: text inside
backticks in this file. What it cannot see: a real part chosen wrongly (the
right name for the wrong job) — that is the owner's review. Re-run it before
build, because the catalog moves:

Save as `_chk.mts` in the repo root, run `npx tsx _chk.mts`, delete it. At
`b454eb5` it printed `checked 302 distinct names, 0 unmatched`.

```ts
import { readFileSync } from "node:fs";
import { BASELINE_MATERIALS } from "./server/seed/baselineMaterials";
const names = new Set(BASELINE_MATERIALS.map(m => m.name));
const doc = readFileSync("references/starter-assemblies-plan.md", "utf8");
const body = doc.split("## Gaps")[0].split("## DV — Devices")[1];
const found = new Set([...body.matchAll(/`([^`]+)`/g)].map(m => m[1]));
const bad = [...found].filter(n => !names.has(n));
console.log(`checked ${found.size} distinct names, ${bad.length} unmatched`);
for (const b of bad) console.log("  MISSING:", JSON.stringify(b));
```

If the count of unmatched names is not zero, **stop and find out why** — either
a part was renamed or retired since this was written, or this file has a typo,
and those want different fixes.
