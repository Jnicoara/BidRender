# Top starter assemblies, residential/commercial tags, and the picker plan — DRAFT

**Track B, 2026-10-07. A draft for the owner to edit; nothing here is built.**
The lists are a judgement of how often each starter appears on a typical
job of that kind — **no usage data exists yet** (nothing counts bid lines
per assembly; § 4 plans that). Refs are the rows in
`references/starter-assemblies-plan.md`; names are as shipped
(`server/seed/starterAssemblies.ts`, `baselineAssemblies.ts`).

167 starters are seeded; **DV34** (surface raceway) is held until surface
raceway is in the catalog, so it is listed but not in either top list.

---

## 1. Most used on small commercial / retail jobs (Dollar Tree remodels, office TI, lighting retrofits, panel changes)

| #   | Ref  | Assembly                                         |
| --- | ---- | ------------------------------------------------ |
| 1   | LT19 | 2x4 LED troffer, lay-in                          |
| 2   | DV20 | Duplex receptacle, MC                            |
| 3   | DR7  | Troffer LED retrofit kit                         |
| 4   | DR8  | 4 ft fluorescent to LED, ballast bypass (2-lamp) |
| 5   | DV26 | Single-pole switch, MC                           |
| 6   | LT28 | Emergency light / exit combo                     |
| 7   | LT27 | Exit sign                                        |
| 8   | DR3  | Demo lay-in fixture, make safe above ceiling     |
| 9   | MS2  | Junction box above lay-in ceiling                |
| 10  | DV21 | GFCI receptacle, MC                              |
| 11  | LT20 | 2x2 LED troffer, lay-in                          |
| 12  | DV29 | Wall occupancy sensor, MC                        |
| 13  | DR1  | Demo fixture, blank the box                      |
| 14  | DR2  | Demo device, blank plate                         |
| 15  | LT22 | 4 ft LED strip, surface / suspended              |
| 16  | DR5  | Relocate lay-in troffer (≤6 ft)                  |
| 17  | DV23 | Dedicated 20A receptacle, MC                     |
| 18  | DR15 | Replace exit / emergency light                   |
| 19  | LT29 | Exterior wall pack                               |
| 20  | DV30 | Ceiling occupancy sensor + power pack            |
| 21  | DV31 | 0-10V dimmer, MC                                 |
| 22  | DR4  | Demo circuit back to panel                       |
| 23  | PG7  | Breaker add, single-pole                         |
| 24  | MS6  | Data drop, Cat6 (commercial)                     |
| 25  | LT23 | 8 ft LED strip (sales floor rows)                |
| 26  | DV22 | Quad receptacle, MC                              |
| 27  | DR17 | Replace receptacle with GFCI                     |
| 28  | PG13 | Panelboard 225A 3-phase, main breaker            |
| 29  | CS1  | Sign circuit and disconnect                      |
| 30  | MH5  | Rooftop unit (RTU) hookup                        |

**Common on these jobs but NOT a starter (gaps):**

- **Surface raceway receptacle** — DV34 exists but is held: the catalog has no
  surface raceway (retail plan R3). The biggest gap for block-wall retail.
- **Emergency driver added to a troffer** (battery pack in an existing or new
  fixture) — very common on retrofits; no starter, and check the catalog for
  the part.
- **Panelboard replacement, 3-phase, existing feeders** — PG4 is a 200A
  single-phase like-for-like; a commercial panel change has no starter.
- **Site / parking lot pole light** — `20 ft light pole` and `LED area light`
  are in the catalog; no assembly puts them together (base, pole, head, hand
  hole, ground).
- **Emergency light, remote head** — priced often on retail; no starter.
- ~~Exit sign with battery, hard-lid ceiling~~ — **not a gap after all**
  (checked 2026-10-07): LT27 is already an exit sign on a 4" box with a
  fixture mud ring, which is the hard-lid mount.
- **Door hardware power (card reader / maglock 120V feed)** — common in office
  TI; low-voltage side is by others, but the 120V circuit and J-box are ours.

## 2. Most used on residential jobs (new homes, remodels, service upgrades, EV chargers, generator hookups)

| #   | Ref  | Assembly                                 |
| --- | ---- | ---------------------------------------- |
| 1   | DV1  | Duplex receptacle standard               |
| 2   | DV4  | Single-pole switch                       |
| 3   | LT7  | Wafer LED downlight, 6" (canless)        |
| 4   | LT8  | Wafer LED downlight, 4" (canless)        |
| 5   | DV2  | GFCI receptacle                          |
| 6   | DV13 | 3-way switch                             |
| 7   | DV9  | AFCI receptacle                          |
| 8   | LT1  | Surface-mount ceiling fixture            |
| 9   | DV5  | Dimmer switch                            |
| 10  | RS9  | Combination smoke/CO detector            |
| 11  | LT2  | Ceiling fan standard                     |
| 12  | DV3  | Dedicated 20A receptacle                 |
| 13  | RS7  | Bath exhaust fan wiring                  |
| 14  | DV8  | Outdoor GFCI receptacle, in-use cover    |
| 15  | LT12 | Vanity light                             |
| 16  | LT14 | Under-cabinet light                      |
| 17  | RS4  | Dishwasher connection                    |
| 18  | RS5  | Garbage disposal, switched               |
| 19  | RS6  | Range hood / microwave circuit           |
| 20  | RS1  | Range receptacle, 50A                    |
| 21  | RS2  | Dryer receptacle, 30A                    |
| 22  | LT10 | Pendant light                            |
| 23  | MH1  | HVAC condenser disconnect + whip         |
| 24  | RS12 | EV charger circuit, 48A hardwired        |
| 25  | RS13 | EV / RV receptacle, 50A (NEMA 14-50)     |
| 26  | PG3  | Service upgrade 200A, meter-main outdoor |
| 27  | PG2  | Service upgrade 200A, overhead           |
| 28  | RS18 | Generator inlet and interlock            |
| 29  | PG19 | Standby generator hookup                 |
| 30  | PG9  | Breaker swap to AFCI/GFCI                |

**4" wafer (owner, 2026-10-07: "we use a lot of them"):** already a starter —
**LT8**, `4" wafer LED downlight` + `14-2 NM-B` 20 ft whip + 2 wire nuts,
tagged Both — so it is at #4, not on the missing list. PG5 (100A subpanel)
moved off the top 30 to make room.

**Common on these jobs but NOT a starter (gaps):**

- **Old-work (retrofit) switch** — DV6 is the old-work receptacle; remodels
  fish switches as often as receptacles.
- **Service upgrade 200A, underground** — only overhead (PG2) and meter-main
  (PG3) exist.
- **320A / 400A residential service** — larger new homes; no starter.
- **50A generator inlet and interlock** — RS18 is 30A only; 50A is common for
  whole-house portables.
- **Detached garage / shop feeder and subpanel** — PG5 assumes an attached
  sub; a detached building adds a ground rod and a disconnect.
- **Kitchen countertop 20A GFCI circuit** and **bathroom 20A circuit** —
  priceable today as DV3 + DV2, but estimators look for them by those names.

---

## 2b. Drafted recipes for the gaps — LOADED 2026-10-07

> **LOADED 2026-10-07** (owner: names frozen, A's items on staging), by part
> KEY with the final names, hours not set, as GC1–GC5 and GR1–GR7 in
> `server/seed/starterAssemblies.ts`; the recipes as loaded are in
> `references/starter-assemblies-plan.md` § "GC / GR". Every part below now
> ships — the three ‡ parts were added by Track A. Two lines differ from this
> draft, on purpose: **GR3 uses `320A meter base`** (the 400A was a stand-in
> until it existed), and **GR2/GR5 leave out `Underground warning tape`**,
> which the catalog sells BY THE FOOT, so "1" would buy one foot of tape for
> a whole trench (owner question in todo.md). The text below is the draft as
> written, kept as the record.
>
> **Also loaded (owner, 2026-10-07):**
>
> - **Wafers at 2", 4", 6", 8" only.** LT31 (2") and LT32 (8") were added,
>   each on its own plain canless wafer. LT8 (4") and LT7 (6") are
>   unchanged. The 3" and 5" materials stay in the catalog with no starter.
> - **Can lights at 4" and 6", new construction and remodel.** LT33 (4"
>   remodel) was added beside LT5, LT4 and LT6. No housing or trim was
>   missing.

**Owner, 2026-10-07: draft only, load after material names freeze, using
the final names** (todo.md). Every part below is an exact shipped catalog
name **today** (checked by script against `BASELINE_MATERIALS`, 2026-10-07);
**‡ marks a part the catalog does not have**. Hours are **not set** on all
of them (D1). Conduit and wire that a traced run owns are left out, as in
every starter (STARTER_LIBRARY.md). F = the fixture or equipment line (D2).
Surface raceway (DV34) stays held and is not repeated here.

### Commercial

**GC1 — Emergency battery pack added to a troffer** · Commercial · Lighting
`Emergency battery backup pack` 1 · `Wire nuts` 4 — the unswitched hot
comes from the fixture's own whip; add `6ft MC whip` 1 if it needs a new one.

**GC2 — Panelboard replacement, 3-phase, existing feeders** · Commercial ·
Panels
`225A panelboard, 3-phase main, 42-space` 1 · `#12 THHN` 40 · `Wire nuts` 20
· `Panel knockout seal` 4 · `Panel directory label` 1 · `Arc flash label` 1 —
breakers counted with PG7/PG8/PG15, as PG4 does; swap to `Panelboard interior
only` 1 when only the guts are changed.

**GC3 — Site / parking lot pole light** · Commercial · Lighting
`20 ft light pole` 1 · F `LED area light` 1 · `Pole anchor bolt kit` 1 ·
`Pole base cover` 1 · `Pole base grout` 1 · `Pole handhole cover` 1 ·
`Ground rod, 8 ft` 1 · `Ground rod clamp` 1 · `Wire nuts` 3 ·
‡ _Concrete pole base (pier)_ 1 — conduit and wire traced.

**GC4 — Emergency light, remote head** · Commercial · Lighting
`4" square box` 1 · `4" square mud ring, fixture` 1 · F `Emergency light
remote head` 1 · `18/2 control wire` 25 · `Wire nuts` 2 — fed from an
`Emergency light` or `Emergency exit light combo` that has remote capacity.

**GC5 — 120V feed for door hardware / access control** · Commercial ·
Devices
`4" square box` 1 · `4" square blank cover` 1 · `12-2 MC cable` 40 ·
`3/8" MC connector` 2 · `MC anti-short bushing` 2 · `20A Single-Pole
breaker` 1 · `Wire nuts` 3 — the power supply and low-voltage side are by
others.

### Residential

**GR1 — Single-pole switch, old work** · Residential · Devices
`Single-gang old-work box` 1 · `Single-pole switch` 1 · `Wall plate` 1 ·
`14-2 NM-B` 20 whip · `Wire nuts` 3

**GR2 — Service upgrade 200A, underground** · Residential · Panels
`200A meter base` 1 · `200A main panel, 40-space` 1 · `2" PVC Sch 40` 10 ·
`2" PVC Sch 40 90-degree elbow` 1 · `2" PVC Sch 40 connector` 2 ·
`4/0-4/0-4/0-2/0 SER AL` 10 · `Ground rod, 8 ft` 2 · `Ground rod clamp` 2 ·
`#4 bare CU, stranded` 30 · `Water pipe bonding clamp` 1 · `Intersystem
bonding bridge` 1 · `Panel directory label` 1 · ‡ _Underground warning
tape_ 1 — the lateral to the transformer is usually the utility's.

**GR3 — Service 320A / 400A residential (two 200A panels)** · Residential ·
Panels
`400A meter base` 1 · `200A main panel, 40-space` 2 ·
`4/0-4/0-4/0-2/0 SER AL` 20 · `Ground rod, 8 ft` 2 · `Ground rod clamp` 2 ·
`#4 bare CU, stranded` 30 · `Water pipe bonding clamp` 1 · `Intersystem
bonding bridge` 1 · `Panel directory label` 2 · ‡ _320A class meter base
with two 200A breakers_ — the common residential part; `400A meter base`
stands in until it is in the catalog.

**GR4 — Generator inlet and interlock, 50A** · Residential · Panels
`Generator interlock kit` 1 · `50A power inlet box` 1 · `50A 2-Pole
breaker` 1 · `6-3 NM-B` 25 · `1" cable connector` 1 · F `50A generator
cord` 1

**GR5 — Detached garage / shop feeder and panel** · Residential · Panels
`100A main panel, 24-space` 1 · `60A 2-Pole breaker` 1 · `Ground rod, 8 ft`
2 · `Ground rod clamp` 2 · `#6 bare CU, stranded` 20 · `1" PVC Sch 40
connector` 2 · `Panel directory label` 1 · ‡ _Underground warning tape_ 1 —
a main-breaker panel so the building has its disconnect; feeder conduit and
wire traced.

**GR6 — Kitchen countertop 20A circuit** · Residential · Devices
`Single-gang box` 1 · `20A GFCI receptacle` 1 · `Wall plate` 1 · `12-2
NM-B` 35 · `20A Single-Pole AFCI breaker` 1 · `Wire nuts` 3 — includes its
home run (not a whip), like DV3.

**GR7 — Bathroom 20A circuit** · Residential · Devices
`Single-gang box` 1 · `20A GFCI receptacle` 1 · `Wall plate` 1 · `12-2
NM-B` 35 · `20A Single-Pole breaker` 1 · `Wire nuts` 3 — includes its home
run (not a whip), like DV3.

**Missing from the catalog, all recipes:** ‡ concrete pole base (GC3),
‡ underground warning tape (GR2, GR5), ‡ 320A class meter base (GR3).
_(All three ship since 2026-10-07 — see the note at the top of § 2b.)_

### The one flagged gap left — DV34, surface raceway — DRAFT, NOT LOADED

The last gap the top-30 lists flagged. DV34 is in the seed but **held** for
missing parts, and Track A's new items now carry a surface raceway family
(500/700 two-piece base + cover, 1500, 2400, boxes and fittings). Drafted
against those names, **for owner review — not loaded**:

**DV34 — Surface raceway receptacle (block wall)** · Commercial · Devices
`Raceway device box, 1-gang` 1 · `20A duplex receptacle` 1 · `Wall plate` 1 ·
`Surface raceway base, 700 series` 10 · `Surface raceway cover, 700 series`
10 · `Raceway entrance end fitting` 1 · `Wire nuts` 3

**Questions before it loads** (each changes a line, none is guessed):

1. **Which series?** 700 is drafted as the common power size; 500 is the
   small one. The catalog's 500/700 are two-piece (base and cover as
   separate per-foot rows), so a one-piece choice changes the lines.
2. **Raceway length in the assembly, or traced?** 10 ft per device is the
   old placeholder. If raceway runs are traced like conduit, both per-foot
   lines come out (as conduit does in every starter).
3. **Cover plate:** the old missing-parts note asked for a "Surface raceway
   cover plate". The catalog has no such row. A 1-gang raceway device box
   normally takes a standard plate, so `Wall plate` is drafted — confirm, or
   a raceway-specific plate is a new catalog item (Track A).
4. **Wire:** DV34 has no conductors, like the other MC/raceway devices that
   leave wire to the traced run. Confirm that holds for surface raceway.

## 3. Residential / Commercial / Both — every starter

**The tag already exists.** `assemblies.projectType` (`residential` /
`commercial` / `both`, nullable — CLAUDE.md: "only a filter on the assembly
library", a different axis from `trade`) is in the schema, and every starter
is seeded with one. Today: **51 residential, 81 commercial, 36 both**. So the
filter needs **no new assembly column** — see § 5 for the two columns it
DOES need (on the bid, and the shop default).

Below is every starter with its tag as shipped. **Recommend** marks the
four I would change — a seed edit (`projectType` in the starter file), no
migration, but note the seeder only sets it on a NEW database; existing
shared rows keep the old tag unless a narrow re-stamp pass is added (the
same question LT1/LT2's fixture line raised).

| Ref  | Assembly                                                                         | Tag now     | Recommend |
| ---- | -------------------------------------------------------------------------------- | ----------- | --------- |
| DV1  | Duplex receptacle standard                                                       | Both        | —         |
| DV2  | GFCI receptacle                                                                  | Both        | —         |
| DV3  | Dedicated 20A receptacle                                                         | Both        | —         |
| DV4  | Single-pole switch                                                               | Both        | —         |
| DV5  | Dimmer switch                                                                    | Both        | —         |
| LT1  | Surface-mount ceiling fixture                                                    | Both        | —         |
| LT2  | Ceiling fan standard                                                             | Residential | —         |
| PG1  | 200A main panel furnish and install                                              | Both        | —         |
| DV6  | Duplex receptacle retrofit                                                       | Both        | —         |
| DV7  | 20A duplex receptacle                                                            | Both        | —         |
| DV8  | Outdoor GFCI receptacle, in-use cover                                            | Residential | —         |
| DV9  | AFCI receptacle                                                                  | Both        | —         |
| DV10 | USB combo receptacle                                                             | Residential | —         |
| DV11 | Quad receptacle                                                                  | Both        | —         |
| DV12 | Switch/receptacle combo                                                          | Residential | —         |
| DV13 | 3-way switch                                                                     | Both        | —         |
| DV14 | 4-way switch                                                                     | Both        | —         |
| DV15 | 3-way dimmer                                                                     | Both        | —         |
| DV16 | Two switches, one box                                                            | Both        | —         |
| DV17 | Three switches, one box                                                          | Both        | —         |
| DV18 | Fan/light combo control                                                          | Residential | —         |
| DV19 | Timer / smart / vacancy switch                                                   | Residential | —         |
| DV20 | Duplex receptacle, MC                                                            | Commercial  | —         |
| DV21 | GFCI receptacle, MC                                                              | Commercial  | —         |
| DV22 | Quad receptacle, MC                                                              | Commercial  | —         |
| DV23 | Dedicated 20A receptacle, MC                                                     | Commercial  | —         |
| DV24 | Isolated-ground receptacle (cash wrap)                                           | Commercial  | —         |
| DV25 | Controlled receptacle (plug load)                                                | Commercial  | —         |
| DV26 | Single-pole switch, MC                                                           | Commercial  | —         |
| DV27 | 3-way switch, MC                                                                 | Commercial  | —         |
| DV28 | Key switch, MC                                                                   | Commercial  | —         |
| DV29 | Wall occupancy sensor, MC                                                        | Commercial  | —         |
| DV30 | Ceiling occupancy sensor + power pack                                            | Commercial  | —         |
| DV31 | 0-10V dimmer, MC                                                                 | Commercial  | —         |
| DV32 | Floor receptacle, poke-through                                                   | Commercial  | —         |
| DV33 | Floor box receptacle (slab)                                                      | Commercial  | —         |
| DV34 | Surface raceway receptacle (block wall) _(held: surface raceway not in catalog)_ | Commercial  | —         |
| LT3  | Ceiling fan, retrofit brace                                                      | Residential | —         |
| LT4  | Recessed can new construction, 6"                                                | Both        | —         |
| LT5  | Recessed can new construction, 4"                                                | Both        | —         |
| LT6  | Recessed can retrofit, 6"                                                        | Both        | —         |
| LT7  | Wafer LED downlight, 6" (canless)                                                | Both        | —         |
| LT8  | Wafer LED downlight, 4" (canless)                                                | Both        | —         |
| LT9  | Shower light, wet-rated                                                          | Residential | —         |
| LT10 | Pendant light                                                                    | Residential | —         |
| LT11 | Chandelier, heavy bracing                                                        | Residential | —         |
| LT12 | Vanity light                                                                     | Residential | —         |
| LT13 | Wall sconce                                                                      | Residential | —         |
| LT14 | Under-cabinet light                                                              | Residential | —         |
| LT15 | Exterior porch light                                                             | Residential | —         |
| LT16 | Flood / security light                                                           | Both        | —         |
| LT17 | Landscape transformer and circuit                                                | Residential | —         |
| LT18 | Landscape light, each                                                            | Residential | —         |
| LT19 | 2x4 LED troffer, lay-in                                                          | Commercial  | —         |
| LT20 | 2x2 LED troffer, lay-in                                                          | Commercial  | —         |
| LT21 | 1x4 LED troffer, lay-in                                                          | Commercial  | —         |
| LT22 | 4 ft LED strip, surface / suspended                                              | Commercial  | —         |
| LT23 | 8 ft LED strip (sales floor rows)                                                | Commercial  | —         |
| LT24 | 4 ft LED wraparound (back room)                                                  | Commercial  | —         |
| LT25 | 4 ft vapor tight (cooler, dock)                                                  | Commercial  | —         |
| LT26 | High bay                                                                         | Commercial  | —         |
| LT27 | Exit sign                                                                        | Commercial  | —         |
| LT28 | Emergency light / exit combo                                                     | Commercial  | —         |
| LT29 | Exterior wall pack                                                               | Commercial  | —         |
| LT30 | Track light, 8 ft with 4 heads                                                   | Commercial  | —         |
| RS1  | Range receptacle, 50A                                                            | Residential | —         |
| RS2  | Dryer receptacle, 30A                                                            | Residential | —         |
| RS3  | Electric water heater connection                                                 | Residential | —         |
| RS4  | Dishwasher connection                                                            | Residential | —         |
| RS5  | Garbage disposal, switched                                                       | Residential | —         |
| RS6  | Range hood / microwave circuit                                                   | Residential | —         |
| RS7  | Bath exhaust fan wiring                                                          | Residential | —         |
| RS8  | Bath fan/light combo, humidity switch                                            | Residential | —         |
| RS9  | Combination smoke/CO detector                                                    | Residential | —         |
| RS10 | Doorbell, wired                                                                  | Residential | —         |
| RS11 | Video doorbell wiring                                                            | Residential | —         |
| RS12 | EV charger circuit, 48A hardwired                                                | Residential | —         |
| RS13 | EV / RV receptacle, 50A (NEMA 14-50)                                             | Residential | —         |
| RS14 | Hot tub / spa connection                                                         | Residential | —         |
| RS15 | Pool pump connection                                                             | Residential | —         |
| RS16 | Well pump connection                                                             | Residential | —         |
| RS17 | Sump pump circuit                                                                | Residential | —         |
| RS18 | Generator inlet and interlock                                                    | Residential | —         |
| RS19 | Baseboard heater, 240V                                                           | Residential | —         |
| RS20 | Attic fan with thermostat                                                        | Residential | —         |
| CS1  | Sign circuit and disconnect                                                      | Commercial  | —         |
| CS2  | Time clock and lighting contactor                                                | Commercial  | —         |
| CS3  | Hand dryer                                                                       | Commercial  | —         |
| CS4  | Drinking fountain / EWC                                                          | Commercial  | —         |
| CS5  | Reach-in cooler / freezer receptacle                                             | Commercial  | —         |
| CS6  | Twist-lock receptacle, L5-20                                                     | Commercial  | —         |
| CS7  | Twist-lock receptacle, L6-30                                                     | Commercial  | —         |
| CS8  | Twist-lock receptacle, L14-30                                                    | Commercial  | —         |
| CS9  | Tele-power pole                                                                  | Commercial  | —         |
| CS10 | Modular furniture feed                                                           | Commercial  | —         |
| CS11 | Fire alarm pull station                                                          | Commercial  | —         |
| CS12 | Fire alarm horn/strobe                                                           | Commercial  | —         |
| CS13 | Fire alarm smoke detector (system)                                               | Commercial  | —         |
| CS14 | Duct smoke detector                                                              | Commercial  | —         |
| CS15 | Kitchen hood shunt interface                                                     | Commercial  | —         |
| CS16 | Knox box                                                                         | Commercial  | —         |
| PG2  | Service upgrade 200A, overhead                                                   | Residential | —         |
| PG3  | Service upgrade 200A, meter-main outdoor                                         | Residential | —         |
| PG4  | Panel replacement like-for-like, 200A                                            | Both        | —         |
| PG5  | Subpanel, 100A (resi, 60A feed)                                                  | Residential | —         |
| PG6  | Load center relocate                                                             | Both        | —         |
| PG7  | Breaker add, single-pole                                                         | Both        | —         |
| PG8  | Breaker add, 2-pole                                                              | Both        | —         |
| PG9  | Breaker swap to AFCI/GFCI                                                        | Residential | —         |
| PG10 | Whole-house surge protector                                                      | Residential | —         |
| PG11 | Grounding electrode system                                                       | Both        | —         |
| PG12 | Panelboard 225A 3-phase, main-lug                                                | Commercial  | —         |
| PG13 | Panelboard 225A 3-phase, main breaker                                            | Commercial  | —         |
| PG14 | Panelboard 400A 3-phase, main breaker                                            | Commercial  | —         |
| PG15 | Feeder breaker, 3-pole                                                           | Commercial  | —         |
| PG16 | Dry-type transformer, 45 kVA                                                     | Commercial  | —         |
| PG17 | Safety switch, 100A fused                                                        | Both        | —         |
| PG18 | Building surge protective device                                                 | Commercial  | —         |
| PG19 | Standby generator hookup                                                         | Residential | —         |
| PG20 | Temporary power pole                                                             | Both        | —         |
| MH1  | HVAC condenser disconnect + whip                                                 | Both        | —         |
| MH2  | Furnace / air handler, 120V                                                      | Residential | —         |
| MH3  | Air handler with electric heat, 60A                                              | Residential | —         |
| MH4  | Mini-split connection                                                            | Residential | —         |
| MH5  | Rooftop unit (RTU) hookup                                                        | Commercial  | —         |
| MH6  | RTU service receptacle                                                           | Commercial  | —         |
| MH7  | Walk-in cooler, condensing unit                                                  | Commercial  | —         |
| MH8  | Walk-in cooler, evaporator                                                       | Commercial  | —         |
| MH9  | Exhaust fan, commercial                                                          | Commercial  | —         |
| MH10 | Motor with starter, 3-phase                                                      | Commercial  | —         |
| MH11 | Motor on VFD                                                                     | Commercial  | —         |
| MH12 | Unit heater                                                                      | Commercial  | —         |
| MH13 | Tankless electric water heater                                                   | Residential | —         |
| MH14 | Thermostat low-voltage wiring                                                    | Both        | —         |
| DR1  | Demo fixture, blank the box                                                      | Commercial  | **Both**  |
| DR2  | Demo device, blank plate                                                         | Commercial  | **Both**  |
| DR3  | Demo lay-in fixture, make safe above ceiling                                     | Commercial  | —         |
| DR4  | Demo circuit back to panel                                                       | Commercial  | —         |
| DR5  | Relocate lay-in troffer (≤6 ft)                                                  | Commercial  | —         |
| DR6  | Replace troffer like-for-like                                                    | Commercial  | —         |
| DR7  | Troffer LED retrofit kit                                                         | Commercial  | —         |
| DR8  | 4 ft fluorescent to LED, ballast bypass (2-lamp)                                 | Commercial  | —         |
| DR9  | 4 ft fluorescent to LED, plug-and-play (2-lamp)                                  | Commercial  | —         |
| DR10 | 8 ft fluorescent to LED, single-pin (2-lamp)                                     | Commercial  | —         |
| DR11 | 8 ft HO fluorescent to LED (2-lamp)                                              | Commercial  | —         |
| DR12 | HID to LED corn lamp                                                             | Commercial  | —         |
| DR13 | Replace HID high bay with LED high bay                                           | Commercial  | —         |
| DR14 | Replace wall pack                                                                | Commercial  | —         |
| DR15 | Replace exit / emergency light                                                   | Commercial  | —         |
| DR16 | Replace receptacle like-for-like                                                 | Commercial  | **Both**  |
| DR17 | Replace receptacle with GFCI                                                     | Commercial  | **Both**  |
| DR18 | Replace switch with occupancy sensor                                             | Commercial  | —         |
| DR19 | Relocate receptacle (wall move), MC                                              | Commercial  | —         |
| DR20 | Recessed can LED retrofit (resi)                                                 | Residential | —         |
| MS1  | Junction box, 4" square                                                          | Both        | —         |
| MS2  | Junction box above lay-in ceiling                                                | Commercial  | —         |
| MS3  | Pull box, 12x12                                                                  | Commercial  | —         |
| MS4  | Firestop penetration                                                             | Both        | —         |
| MS5  | Conduit trapeze (strut rack), per hanger                                         | Commercial  | —         |
| MS6  | Data drop, Cat6 (commercial)                                                     | Commercial  | —         |
| MS7  | Data drop, Cat6 (resi)                                                           | Residential | —         |
| MS8  | Cable TV drop                                                                    | Residential | —         |
| MS9  | Security camera drop                                                             | Both        | —         |
| MS10 | In-ceiling speaker                                                               | Residential | —         |
| MS11 | Network patch panel, 24-port                                                     | Commercial  | —         |
| MS12 | Structured media enclosure (resi)                                                | Residential | —         |
| MS13 | Panel labelling (existing panel)                                                 | Both        | —         |
| MS14 | Temporary lighting string, per 100 ft                                            | Both        | —         |

**The four recommended changes, and why:** DR1, DR2, DR16, DR17 →
**Both**. Demoing a device, blanking a box and replacing a receptacle
(plain or GFCI) are everyday residential remodel and service work, not only
retail; tagged Commercial, a residential bid would hide them.

---

## 4. "Most used" at the top of the assembly picker — PLAN

**What:** the first thing in the assembly picker (the bid's "Add an
assembly" search, Quick bid's picker) is a short "Most used" row: this
company's 8 most-used assemblies, as chips/buttons, one click to add. Typing
filters as today; the row hides once the person types.

**Where the number comes from — the company's own bids, no new column:**

- Count `bid_line_items` by `assemblyId` over the company's bids
  (`bids.userId = scope.dataUserId`), archived lines and archived bids
  excluded, **last 12 months** (a shop's mix changes; a 3-year-old favourite
  should fade).
- **Resolve forks**: a line points at whatever assembly id it was added
  from; a starter the company later edited is a fork with a new id. Count
  both under the assembly the library now SHOWS (`resolveAssembly`, the same
  rule kits use), or a forked favourite would split its count in two and
  fall off the list.
- **Weight**: number of bids an assembly appeared on, not line quantity —
  40 receptacles on one bid is one use; a breaker added on 30 bids is
  thirty. Ties broken by most recent use.
- **Threshold**: show the row only once the company has **3+ bids**; until
  then there is no "most used", and an empty or one-item row is noise. A
  brand-new company sees the filtered library exactly as today.
- **Within the filter (§ 5)**: on a residential bid, "Most used" is the most
  used among residential + both. A shop that does both sees the right ones.
- Computed by one router query (`assemblies.mostUsed({ bidId })`), not
  stored. **No schema change:** `bid_line_items.assemblyId` is a foreign key,
  which MySQL indexes itself (checked 2026-10-07). Measure the query on the
  3,000-bid local account before shipping (the dashboard's ~300 ms bar).

**Staleness (CLAUDE.md § "yesterday's answer"):** the query must be
invalidated by the same helper the add-assembly mutation already refreshes
through, or the row keeps yesterday's order after somebody adds a line.
Check on screen: add an assembly three times on three bids and watch it
move into the row.

**Manual-first:** it is a shortcut over the same list, never a gate — no
setup, no "pin your favourites" step; a company that never looks at it
loses nothing. No AI: it is a count.

## 5. Residential / Commercial filter in the picker and on the Assemblies screen — PLAN

**The rule:** a bid set to **Residential** shows assemblies tagged
residential + both (+ untagged); **Commercial** shows commercial + both
(+ untagged); **not set** shows everything. A **"Show all"** switch beside
the search turns the filter off for this picker session. The **shop sets
its default** (Settings → the company's work: Residential / Commercial /
Both); a new bid starts from it and the bid can be changed.

**Rules that keep it safe:**

- **Untagged always shows.** `projectType` is nullable; a company's own
  assembly they never tagged must never vanish behind a filter (CLAUDE.md
  § "Hide OURS, never THEIRS").
- **The filter hides, never removes.** Typing a name that is filtered out
  shows a one-line "2 more in Commercial — show all" under the results, so
  "it's not there" is never the answer when it is.
- **Not a pricing input.** The tag decides what is SHOWN, never what a line
  costs; no bid number moves when it changes.
- **Assemblies screen:** chips All / Residential / Commercial above the list
  (the shelf grouping stays), starting from the shop default; a company's own
  assemblies show a small tag picker in the editor (it exists already:
  `projectType` select).
- **Kits** follow their assemblies (a kit shows if any of its assemblies
  would).

**Columns it needs (requested from Track A, `migrations-next-batch.md`):**

1. `bids.projectType ENUM('residential','commercial','both') NULL` — the
   bid's setting. NULL = follow the company default. ADDITIVE, no default,
   no backfill.
2. The company's default — `pricing_defaults.defaultProjectType` (or the
   company settings table A prefers) `ENUM(...) NULL`. NULL = show all,
   which is today's behaviour, so nothing changes until a shop sets it.

No assemblies column: `assemblies.projectType` exists (§ 3).

**Tests to write when built:** the filter is a pure function
(`client/src/lib` or `shared/`) — residential bid shows residential + both +
untagged and hides commercial; "show all" shows everything; a company's
own untagged assembly always shows; the "N more in …" count is exact.
On screen at laptop and tablet: a residential bid's picker, the switch, the
Assemblies chips.
