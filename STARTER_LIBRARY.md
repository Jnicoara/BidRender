# Starter Library

Reference content for the shipped baseline library — the "real starter library of common electrical materials/assemblies" called for in [ASSEMBLIES_PLAN.md](ASSEMBLIES_PLAN.md) § ADDITIONAL FOUNDATIONAL NOTES, so first use feels functional instead of presenting an empty catalog.

**This is a reference document only.** Nothing here is loaded into the database yet. These rows become baseline library entries (`userId IS NULL`) when Library screens are built in step 2.

> **Prices are starting estimates, not quotes.** Every figure below is a placeholder to make the app usable on day one. Real numbers come from the user's own suppliers and market.

---

## Labor Rates

Starting estimates — adjust to local market. The user now owns a real **NECA Manual of Labor Units** and will replace these with real numbers over time.

| Role       | Hourly Cost |
| ---------- | ----------- |
| Apprentice | $45.00      |
| Journeyman | $75.00      |
| Foreman    | $95.00      |

---

## Modifiers

Labor-hour adjustments. Remember these **ADD** rather than compound — height + outdoor together is +35%, not +38%.

| Modifier                     | Labor Adjustment | Scope \* |
| ---------------------------- | ---------------- | -------- |
| Working from height          | +20%             | global   |
| Outdoor / weather            | +15%             | global   |
| Existing / retrofit          | +35%             | global   |
| Tight / congested space      | +15%             | global   |
| Isolated ground circuit      | +40%             | assembly |
| After-hours / occupied space | +30%             | global   |

\* **Scope is confirmed.** Isolated ground is intentionally **assembly-scoped** — it applies only to specific assemblies such as data and register/computer circuits, not to work generally. The other five (height, outdoor, retrofit, tight space, after-hours) are the shared **global** list, available to most assemblies. This matches ASSEMBLIES_PLAN.md § DATA MODEL, which names isolated ground as its example of an assembly-specific one-off modifier.

---

## Materials

`Unit` maps to the `materials.unitOfSale` column (`each` / `foot` / `box`), and
each heading below is a value of the `materials.category` column — the curated
list in `MATERIAL_CATEGORIES` (`drizzle/schema.ts`), in display order.

These shelve materials by what they physically are. They are a different axis
from `ASSEMBLY_CATEGORIES`, which groups assemblies by what they accomplish.
The two are intentionally separate; do not merge them.

Every material also carries `searchAliases` — the trade slang an electrician
actually types ("1900" for a 4" square box, "romex" for NM-B, "gem box" for a
single-gang). Those strings are not duplicated here; they live beside each row
in `server/seed/baselineMaterials.ts`, which is where to edit them. Adding a new
material means adding its slang too — see CLAUDE.md § Materials.

### Wire & Cable

| Material  | Cost  | Unit |
| --------- | ----- | ---- |
| #14 THHN  | $0.40 | foot |
| #12 THHN  | $0.55 | foot |
| #10 THHN  | $0.85 | foot |
| #8 THHN   | $1.35 | foot |
| 14-2 NM-B | $0.65 | foot |
| 12-2 NM-B | $0.90 | foot |

### Conduit

| Material | Cost  | Unit |
| -------- | ----- | ---- |
| 1/2" EMT | $0.90 | foot |
| 3/4" EMT | $1.20 | foot |
| 1" EMT   | $1.80 | foot |
| 1/2" PVC | $0.45 | foot |

### Conduit Fittings

| Material           | Cost  | Unit |
| ------------------ | ----- | ---- |
| EMT connector 1/2" | $0.60 | each |
| EMT connector 3/4" | $0.85 | each |
| EMT strap          | $0.35 | each |

### Boxes

| Material              | Cost  | Unit |
| --------------------- | ----- | ---- |
| Single-gang box       | $1.25 | each |
| 4" square box         | $1.75 | each |
| Fan-rated ceiling box | $6.50 | each |

### Receptacles

| Material          | Cost   | Unit |
| ----------------- | ------ | ---- |
| Duplex receptacle | $1.50  | each |
| GFCI receptacle   | $16.00 | each |

### Switches

A dimmer is a switch device, so it shelves here rather than under Lighting
Hardware, which is fixture-mounting hardware only.

| Material           | Cost   | Unit |
| ------------------ | ------ | ---- |
| Single-pole switch | $1.75  | each |
| 3-way switch       | $4.50  | each |
| Dimmer             | $22.00 | each |

### Wall Plates & Misc

The catch-all shelf: trim and consumables belonging to no single system.

| Material   | Cost  | Unit |
| ---------- | ----- | ---- |
| Wall plate | $1.25 | each |
| Wire nuts  | $0.08 | each |

### Panels & Breakers

| Material        | Cost    | Unit |
| --------------- | ------- | ---- |
| 20A breaker     | $9.00   | each |
| 20/2 breaker    | $28.00  | each |
| 200A main panel | $285.00 | each |

### Lighting Hardware

| Material                 | Cost   | Unit |
| ------------------------ | ------ | ---- |
| 6ft MC whip              | $12.00 | each |
| Fixture mounting bracket | $4.00  | each |

---

## Assemblies

Two tiers: **CORE** gets built first, **PHASE 2** is deferred. Groupings match the five values of the `assemblies.category` enum exactly.

Each entry carries a **Project Type** tag: Residential / Commercial / Both.

> **Note on Project Type:** this is the same optional tag defined in ASSEMBLIES_PLAN.md § DATA MODEL. It is a **filter**, not a structural split — Materials, Labor Rates, and Modifiers stay fully shared across both. It is also **not** the schema's `trade` field, which distinguishes electrical from plumbing/HVAC for multi-trade unlocking. Two independent axes — don't wire them together.

> **Labor hours are deliberately absent _from this document_.** See [Important Notes](#important-notes) — they must not be invented here.
>
> **What the app ships instead.** The Assembly Builder needs a non-zero number to price against, because a zero prices the work at nothing — a far more dangerous default than a visible guess. So `shared/laborHourDefaults.ts` holds placeholder hours keyed by task type, and the seeded starter assemblies carry them. They are placeholders in exactly the sense this document means: a starting figure the user replaces, labelled as a guess everywhere it appears, and never presented as a labor unit. This document stays the hours-free reference; that file is the app's editable default.
>
> **Being replaced (owner, 2026-09-29).** Starters will ship with hours NOT SET, shown as "Hours not set", and the placeholders on the shipped starters are cleared — `references/starter-assemblies-plan.md` D1. The paragraph above describes the app until that lands, which needs a Track A migration (`references/track-a-handoff-starter-assemblies.md` H2).

### CORE — build first

**Devices**

| Assembly                   | Project Type |
| -------------------------- | ------------ |
| Duplex receptacle standard | Both         |
| Duplex receptacle retrofit | Both         |
| GFCI receptacle            | Both         |
| Dedicated 20A receptacle   | Both         |
| Single-pole switch         | Both         |
| 3-way switch               | Both         |
| Dimmer switch              | Both         |
| Range receptacle           | Residential  |
| Dryer receptacle           | Residential  |
| EV charger circuit         | Both         |

**Lighting**

| Assembly                      | Project Type |
| ----------------------------- | ------------ |
| Recessed can new construction | Both         |
| Recessed can retrofit         | Both         |
| Surface-mount ceiling fixture | Both         |
| Ceiling fan standard          | Residential  |
| Exit sign                     | Commercial   |
| Emergency battery unit        | Commercial   |

**Panels**

| Assembly                        | Project Type |
| ------------------------------- | ------------ |
| Service upgrade 200A            | Residential  |
| Panel replacement like-for-like | Both         |
| Breaker add/replace             | Both         |
| Subpanel install                | Both         |
| Whole-house surge protector     | Residential  |

**Equipment Connections**

| Assembly                         | Project Type |
| -------------------------------- | ------------ |
| HVAC condenser disconnect + whip | Both         |
| Electric water heater connection | Both         |
| Dishwasher connection            | Residential  |
| Bath exhaust fan wiring          | Residential  |

**Low Voltage/EMS**

| Assembly                      | Project Type |
| ----------------------------- | ------------ |
| Data/network drop             | Both         |
| Combination smoke/CO detector | Residential  |

### PHASE 2 — deferred

**Devices**

| Assembly                       | Project Type |
| ------------------------------ | ------------ |
| AFCI receptacle                | Both         |
| Quad receptacle                | Commercial   |
| Floor receptacle               | Commercial   |
| USB combo receptacle           | Residential  |
| 4-way switch                   | Both         |
| Smart switch                   | Residential  |
| Occupancy/motion sensor switch | Commercial   |
| Timer switch                   | Residential  |
| Fan/light combo switch         | Residential  |
| Garbage disposal switch        | Residential  |
| Doorbell button                | Residential  |

**Lighting**

| Assembly                   | Project Type |
| -------------------------- | ------------ |
| Pendant light              | Residential  |
| Chandelier heavy bracing   | Residential  |
| Track lighting             | Commercial   |
| Under-cabinet lighting     | Residential  |
| Exterior wall pack         | Commercial   |
| Flood/security light       | Both         |
| Landscape lighting circuit | Residential  |
| Vanity light bar           | Residential  |
| Closet light               | Residential  |

**Panels**

| Assembly                  | Project Type |
| ------------------------- | ------------ |
| Generator transfer switch | Residential  |
| Load center relocate      | Both         |

**Equipment Connections**

| Assembly                       | Project Type |
| ------------------------------ | ------------ |
| Furnace/air handler connection | Residential  |
| Pool pump connection           | Residential  |
| Hot tub/spa connection         | Residential  |
| Well pump connection           | Residential  |
| Sump pump circuit              | Residential  |

**Low Voltage/EMS**

| Assembly                      | Project Type |
| ----------------------------- | ------------ |
| Cable TV drop                 | Residential  |
| Video doorbell wiring         | Residential  |
| Security system device wiring | Both         |
| Thermostat low-voltage wiring | Both         |

### Counts

| Category              | CORE   | PHASE 2 | Total  |
| --------------------- | ------ | ------- | ------ |
| Devices               | 10     | 11      | 21     |
| Lighting              | 6      | 9       | 15     |
| Panels                | 5      | 2       | 7      |
| Equipment Connections | 4      | 5       | 9      |
| Low Voltage/EMS       | 2      | 4       | 6      |
| **Total**             | **27** | **31**  | **58** |

---

## CORE Assembly Bills of Material

A typical bill of materials for each of the 27 CORE assemblies, drawn from the [Materials](#materials) list above. PHASE 2 assemblies are deliberately not covered here — they're deferred.

> **Labor hours are absent by design.** Every assembly below is materials-only. Labor units come from the NECA Manual of Labor Units and field experience — see [Important Notes](#important-notes). Do not backfill them from this document.

**Baseline assumptions** — state these so the quantities are interpretable, and change them freely:

- **Residential Romex baseline.** Cable-fed (NM-B) unless the assembly is inherently commercial or outdoor. Per [Important Notes](#important-notes), Romex-vs-conduit is a _material swap inside one assembly_, not a separate assembly — so a commercial user swaps NM-B for THHN + EMT on the same recipe.
- **Plastic device boxes** assumed, same swap logic for metal.
- **Circuit sizing:** receptacles on 20A / 12-2, lighting and switching on 15A / 14-2.
- **Run lengths are per-device allowances**, not home runs: ~25 ft for a receptacle, ~20 ft for a switch leg, ~30–40 ft where the assembly includes its own home run to the panel. These are the single biggest guess here and the first thing worth tuning against real jobs.
- **Breakers are included only where the assembly creates a new circuit**, not where it extends an existing one.
- **Fixtures and appliances are owner/GC-supplied** unless noted — the assembly covers the wiring, box, and connection. _Overridden 2026-09-29 (owner): the fixture or appliance is its own line in every starter, so an owner-furnished job deletes one line — `references/starter-assemblies-plan.md` D2._

**† marks a material not yet in the Materials list above.** These are collected in [Materials Still Needed](#materials-still-needed) at the end of this section.

### Devices

**Duplex receptacle standard** _(Both)_

- Single-gang box × 1
- Duplex receptacle × 1
- Wall plate × 1
- 12-2 NM-B × 25 ft
- Wire nuts × 3

**Duplex receptacle retrofit** _(Both)_

- Old-work / remodel single-gang box † × 1
- Duplex receptacle × 1
- Wall plate × 1
- 12-2 NM-B × 25 ft
- Wire nuts × 3
- Carries the **Existing/retrofit +35%** modifier. Materially near-identical to the standard version — the old-work box and the labor adder are the whole difference.

**GFCI receptacle** _(Both)_

- Single-gang box × 1
- GFCI receptacle × 1
- Wall plate × 1
- 12-2 NM-B × 25 ft
- Wire nuts × 3

**Dedicated 20A receptacle** _(Both)_

- Single-gang box × 1
- Duplex receptacle × 1
- Wall plate × 1
- 12-2 NM-B × 35 ft _(includes home run)_
- 20A breaker × 1
- Wire nuts × 3

**Single-pole switch** _(Both)_

- Single-gang box × 1
- Single-pole switch × 1
- Wall plate × 1
- 14-2 NM-B × 20 ft
- Wire nuts × 3

**3-way switch** _(Both)_ — the assembly is the **pair**, not one device

- Single-gang box × 2
- 3-way switch × 2
- Wall plate × 2
- 14-2 NM-B × 20 ft
- 14-3 NM-B † × 20 ft _(traveler run between the two boxes)_
- Wire nuts × 6

**Dimmer switch** _(Both)_

- Single-gang box × 1
- Dimmer × 1
- Wall plate × 1
- 14-2 NM-B × 20 ft
- Wire nuts × 3

**Range receptacle** _(Residential)_ — 50A

- 4" square box × 1
- 50A range receptacle † × 1
- 6-3 NM-B † × 30 ft
- 50A 2-pole breaker † × 1
- Wire nuts × 3
- **Conductor size needs your confirmation.** #8 THHN is on the Materials list and is commonly used for 40A ranges; 50A typically wants #6. Sized here at #6 (6-3) for a 50A device — verify against how you actually run these before it's treated as settled.

**Dryer receptacle** _(Residential)_ — 30A

- 4" square box × 1
- 30A dryer receptacle † × 1
- 10-3 NM-B † × 30 ft
- 30A 2-pole breaker † × 1
- Wire nuts × 3

**EV charger circuit** _(Both)_ — 50A, EVSE owner-supplied

- 4" square box × 1
- 50A 2-pole breaker † × 1
- #8 THHN × 3 conductors × 40 ft _(2 hot + ground)_
- 3/4" EMT × 40 ft
- EMT connector 3/4" × 2
- EMT strap × 8
- EVSE disconnect † × 1 _(where required by location/AHJ)_
- Wire nuts × 3

### Lighting

**Recessed can new construction** _(Both)_

- Recessed housing, new-construction † × 1 _(integral bar hangers — no separate bracket)_
- Trim/baffle † × 1
- 14-2 NM-B × 20 ft
- Wire nuts × 3

**Recessed can retrofit** _(Both)_

- Retrofit can or LED retrofit disc † × 1
- 14-2 NM-B × 20 ft
- Wire nuts × 3
- Carries the **Existing/retrofit +35%** modifier.

**Surface-mount ceiling fixture** _(Both)_

- 4" square box × 1
- Fixture mounting bracket × 1
- 14-2 NM-B × 20 ft
- Wire nuts × 3
- Fixture owner-supplied.

**Ceiling fan standard** _(Residential)_

- Fan-rated ceiling box × 1
- 14-3 NM-B † × 20 ft _(separate switching for fan and light)_
- Single-gang box × 1
- Wall plate × 1
- Wire nuts × 5
- Fan unit owner-supplied. Uses 14-3 on the assumption of independent fan/light control; drop to 14-2 for single-switch control.

**Exit sign** _(Commercial)_

- 4" square box × 1
- Exit sign fixture † × 1
- 6ft MC whip × 1
- #12 THHN × 3 conductors × 15 ft
- Wire nuts × 3

**Emergency battery unit** _(Commercial)_

- 4" square box × 1
- Emergency battery/bug-eye unit † × 1
- 6ft MC whip × 1
- #12 THHN × 3 conductors × 15 ft
- Wire nuts × 3

### Panels

**Service upgrade 200A** _(Residential)_

- 200A main panel × 1
- Meter socket † × 1
- Service entrance conductors † × 25 ft
- Weatherhead † × 1
- 2" service mast/conduit † × 10 ft
- Ground rods † × 2
- #6 bare grounding electrode conductor † × 25 ft
- Intersystem bonding bridge † × 1
- 20A breaker × 12, 20/2 breaker × 3 _(typical repopulation — varies per panel schedule)_
- Wire nuts × 20
- **The most incomplete BOM here.** Most of what a service upgrade consumes isn't in the Materials list yet, and the breaker counts are a stand-in for an actual panel schedule.

**Panel replacement like-for-like** _(Both)_

- 200A main panel × 1
- 20A breaker × 12
- 20/2 breaker × 3
- Wire nuts × 20
- Breaker mix is illustrative — real quantity comes from the existing panel being replaced.

**Breaker add/replace** _(Both)_

- 20A breaker × 1 _(or 20/2 for a 2-pole replacement)_

**Subpanel install** _(Both)_ — 60A feeder

- Subpanel / load center † × 1
- 60A 2-pole feeder breaker † × 1
- Ground bar kit † × 1
- #6 THHN † × 4 conductors × 40 ft
- 1" EMT × 40 ft
- 1" EMT connector † × 2
- EMT strap × 8
- Wire nuts × 6
- Sized for a 60A feeder. #8 THHN _is_ on the Materials list and suits a 40–50A feeder if that's the more common case for you.

**Whole-house surge protector** _(Residential)_

- Type 2 SPD † × 1
- 20/2 breaker × 1
- Wire nuts × 3
- Most SPDs ship with integral leads, so no separate conductor line.

### Equipment Connections

**HVAC condenser disconnect + whip** _(Both)_

- AC disconnect switch † × 1
- 6ft MC whip × 1
- #10 THHN × 3 conductors × 30 ft
- 1/2" PVC × 20 ft
- 1/2" PVC fittings † × 4
- 30A 2-pole breaker † × 1
- Wire nuts × 3
- Carries the **Outdoor/weather +15%** modifier.

**Electric water heater connection** _(Both)_

- 4" square box × 1
- 30A 2-pole breaker † × 1
- #10 THHN × 3 conductors × 30 ft
- 1/2" EMT × 20 ft
- EMT connector 1/2" × 2
- EMT strap × 4
- Water heater disconnect † × 1 _(where not within sight of the panel)_
- Wire nuts × 3

**Dishwasher connection** _(Residential)_

- Single-gang box × 1
- 20A breaker × 1
- 12-2 NM-B × 25 ft
- Dishwasher connection kit / whip † × 1
- Wire nuts × 3

**Bath exhaust fan wiring** _(Residential)_

- Single-gang box × 1
- Single-pole switch × 1
- Wall plate × 1
- 14-2 NM-B × 25 ft
- Wire nuts × 4
- Fan unit owner-supplied. Add a second switch leg for a fan/light combo — that's the PHASE 2 _Fan/light combo switch_ assembly.

### Low Voltage/EMS

**Data/network drop** _(Both)_

- Cat6 cable † × 60 ft
- RJ45 keystone jack † × 1
- Low-voltage mud ring † × 1
- Wall plate × 1
- Patch panel port termination † × 1
- No breaker, no line voltage. This is the assembly the **Isolated ground +40%** modifier is scoped to, where the drop serves a circuit requiring one.

**Combination smoke/CO detector** _(Residential)_

- 4" square box × 1
- Combination smoke/CO detector † × 1
- 14-3 NM-B † × 25 ft _(interconnect between detectors)_
- Wire nuts × 4
- 14-3 carries the interconnect conductor; a standalone non-interconnected unit uses 14-2.

### Materials Still Needed

Every † above, consolidated. These are referenced by CORE assemblies but absent from the [Materials](#materials) list — the list needs them (with your pricing) before these assemblies can be fully costed.

| Material                              | Suggested Unit | Needed by                                      |
| ------------------------------------- | -------------- | ---------------------------------------------- |
| Old-work / remodel single-gang box    | each           | Duplex receptacle retrofit                     |
| 14-3 NM-B                             | foot           | 3-way switch, Ceiling fan, Smoke/CO detector   |
| 10-3 NM-B                             | foot           | Dryer receptacle                               |
| 6-3 NM-B                              | foot           | Range receptacle                               |
| #6 THHN                               | foot           | Subpanel install                               |
| #6 bare grounding electrode conductor | foot           | Service upgrade 200A                           |
| 30A 2-pole breaker                    | each           | Dryer receptacle, HVAC condenser, Water heater |
| 50A 2-pole breaker                    | each           | Range receptacle, EV charger circuit           |
| 60A 2-pole feeder breaker             | each           | Subpanel install                               |
| 30A dryer receptacle                  | each           | Dryer receptacle                               |
| 50A range receptacle                  | each           | Range receptacle                               |
| Subpanel / load center                | each           | Subpanel install                               |
| Ground bar kit                        | each           | Subpanel install                               |
| Type 2 surge protective device        | each           | Whole-house surge protector                    |
| Meter socket                          | each           | Service upgrade 200A                           |
| Service entrance conductors           | foot           | Service upgrade 200A                           |
| Weatherhead                           | each           | Service upgrade 200A                           |
| 2" service mast / conduit             | foot           | Service upgrade 200A                           |
| Ground rod                            | each           | Service upgrade 200A                           |
| Intersystem bonding bridge            | each           | Service upgrade 200A                           |
| AC disconnect switch                  | each           | HVAC condenser disconnect + whip               |
| Water heater disconnect               | each           | Electric water heater connection               |
| EVSE disconnect                       | each           | EV charger circuit                             |
| Dishwasher connection kit / whip      | each           | Dishwasher connection                          |
| 1" EMT connector                      | each           | Subpanel install                               |
| 1/2" PVC fittings                     | each           | HVAC condenser disconnect + whip               |
| Recessed housing, new-construction    | each           | Recessed can new construction                  |
| Recessed can trim / baffle            | each           | Recessed can new construction                  |
| Retrofit can / LED retrofit disc      | each           | Recessed can retrofit                          |
| Exit sign fixture                     | each           | Exit sign                                      |
| Emergency battery / bug-eye unit      | each           | Emergency battery unit                         |
| Combination smoke/CO detector         | each           | Combination smoke/CO detector                  |
| Cat6 cable                            | foot           | Data/network drop                              |
| RJ45 keystone jack                    | each           | Data/network drop                              |
| Low-voltage mud ring                  | each           | Data/network drop                              |
| Patch panel port                      | each           | Data/network drop                              |

**No prices are proposed for these.** The existing Materials list came from you; inventing 36 more placeholder costs would bury real numbers under guesses. Add them with your own supplier pricing.

---

## Important Notes

- **Labor units are not AI-generated.** Any labor unit appearing here or in future entries is a placeholder/reference estimate only. Real labor units must come from the user's own field experience and/or the **NECA Manual of Labor Units** — a real, purchasable industry reference, which the user now owns. Never treat an AI-produced labor unit as fact.
- **Box material and wiring method are NOT separate assemblies.** Metal vs plastic boxes, Romex vs conduit — these are handled by swapping materials within a single assembly, or by a user forking their own variant. Splitting them would multiply the library without adding value. _One deliberate exception, 2026-09-29 (owner): the commercial MC versions of the common devices ship as their own starters, because a retail contractor rebuilding every device before a first bid is setup-before-value — `references/starter-assemblies-plan.md` D4._
- **Conduit and wire runs are intentionally excluded** from the assembly list. They're handled by traced, dynamically-calculated footage on the takeoff page (see ASSEMBLIES_PLAN.md § CONDUIT & WIRE CALCULATION), not as fixed assemblies.
