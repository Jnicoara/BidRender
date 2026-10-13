# Conduit and conduit fittings — name review (2026-10-12, Track C)

**Read-only review. No name has been changed.** For each row on the
"Conduit" and "Conduit Fittings" shelves of `starter-catalog-pricing.xlsx`
("Starter prices", rows **118–635**, 518 rows, in the app-order sort of
`28245633`), the question is whether one real product can be priced at Platt
or Home Depot from the name alone. The workbook was read from a copy, because
the owner has it open.

**The test** uses the properties a supply house names these parts by: trade
size; family (EMT, PVC 40/80, rigid, flex, liquidtight); set-screw,
compression or raintight; material (die-cast zinc, steel or malleable iron);
insulated throat or not; and straight or 90. A name that leaves out something
that changes the price is "vague". A property that is the same on every
product of that type is not needed. For example, an EMT elbow is always
steel.

**Verdicts:**

- **OK**
- **Needs a word**, and the exact words are given
- **Not a real product**: none found on these shelves
- **Two products in one row**: none found on these shelves

**Used by** counts the shipped starter assemblies (`BASELINE_ASSEMBLIES` via
`starterPartName`) and run types that price from the row, as the sheet's own
column does. Refs (LT29, MH5 …) are the starter refs.

**Sources.** Listings were checked on 2026-10-12 at homedepot.com and
platt.com, with Elliott, Gexpro, Crescent or the maker's page where neither
listed the part. Each source is named in its row. Prices are what the listing
showed that day. They only show how big a question is; they are not proposed
prices.

**Already decided, and not reopened here:**

- **2026-10-08 catalog review:** IMC and every 3-1/2" row were withdrawn on
  purpose. The liquidtight-to-liquidtight coupling was retired because no such
  part exists.
- **2026-09-27 (C1):** every conduit body is priced WITH its cover and gasket,
  and the Notes column says so.
- **Batch 2 of the catalog reality check** (`references/catalog-reality-check.md`):
  - Sch 40 and Sch 80 share one coupling, terminal adapter and body per size.
  - The 2-1/2"–4" PVC straps are two-hole.
  - The raintight rows say "compression".
  - "Rigid conduit connector" became the threadless compression connector.
  - **"Threaded closure" keeps its name.** A name containing "plug" outranked
    Duplex receptacle in search, so "closure plug" is a search word instead
    (`shared/catalogRealityCheck20261009.ts`).

That earlier pass asked whether each item exists. This one asks whether the
name is specific enough to price.

## Read this before applying anything: most of these names are built by the takeoff

**Renaming a conduit row is not even a seed-only rename.** The takeoff builds
fitting names from the pipe's name (`shared/runFittingMaterials.ts`:
`parseRacewayName`, `fittingMaterialName`, `emtStyledFittingName`, `lbName`,
`tBodyName`, `llName`, `lrName`, `cBodyName`). `parseRacewayName` must match
the family words exactly.

- **Rename a pipe and its traced runs break silently.** For example, renaming
  `1/2" flexible metal conduit` to `1/2" flexible metal conduit, steel` stops
  every traced flex run from finding its connectors and straps, and nothing
  on screen says so.
- **Rename a built fitting row (an EMT connector, a set-screw LB, a flex
  connector) and the takeoff asks for a name that no longer exists.**

So for those rows, the name change is code and seed together, shipped as a
pair, the same way as the PVC Sch 40/80 merge.

**The cheaper way that already has a precedent:** put the missing words in
the row's description. That is how "Priced with its cover and gasket." was
done for every conduit body (owner, C1). The description shows in the sheet's
Notes column, which is what the owner reads while pricing, and it needs no
code change. **Owner question Q5 below asks which way to go.** The rows whose
names are **not** built by the takeoff can simply be renamed through
`RENAMED_BASELINE_MATERIALS`:

- 164 (3/8" FMC)
- 210 (insulated set-screw connector)
- 533–535 (liquidtight 90)
- 584–590 (metal weatherhead)
- 592–597 (PVC expansion fitting)

## Existing rows

Large size grids are checked one size run at a time. One listing confirms the
whole run, and the row range says which rows a line covers. **Every row from
118 to 635 is in exactly one line below.**

### Conduit (rows 118–164)

| Rows    | Current name (sizes)                               | Used by                                                          | Verdict / proposed words                                           | Why                                                                                                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 118–126 | `{size} EMT`, 1/2"–4"                              | 1/2", 3/4": 1 run type each. 1": CW11                            | OK                                                                 | EMT at the counter is steel, 10 ft sticks.                                                                                                                                                                                                                                                                                        |
| 127–135 | `{size} PVC Sch 40`, 1/2"–4"                       | 1 run type each. 2": GR2                                         | OK                                                                 |                                                                                                                                                                                                                                                                                                                                   |
| 136–144 | `{size} PVC Sch 80`, 1/2"–4"                       | 1 run type each                                                  | OK                                                                 |                                                                                                                                                                                                                                                                                                                                   |
| 145–153 | `{size} rigid conduit`, 1/2"–4"                    | 2": PG2                                                          | OK                                                                 | "Rigid" at the counter means galvanized steel (HD Wheatland 0543810000, "hot-dip galvanized"), and the search words already say GRC. Aluminum rigid is a separate product (Gexpro, 1/2" × 10 ft rigid aluminum), so it would be its own row if ever added.                                                                        |
| 154–157 | `{size} liquidtight flexible conduit`, 1/2"–1-1/4" | 1/2": RS15, CS1, MH8. 3/4": RS14, MH5, MH7, MH10, MH11, CW2, CW6 | OK — **but the pack is wrong on 156–157** (see "Pack sizes" below) | The metal one (steel core, HD Southwire Titan 55093003). The nonmetallic one has its own rows (158–159), so the pair is already kept apart.                                                                                                                                                                                       |
| 158–159 | `{size} nonmetallic liquidtight conduit (LFNC)`    | —                                                                | OK — pack wrong (see below)                                        |                                                                                                                                                                                                                                                                                                                                   |
| 160–163 | `{size} flexible metal conduit`, 1/2"–1-1/4"       | 1/2": MH9, MH12, CW1, CW5. 1-1/4": PG16                          | **Needs a word:** "…, steel" (and "reduced wall")                  | The same size comes in steel and in aluminum at different prices: Southwire 55081802 is 1/2" × 100 ft reduced-wall **steel** (HD, $21), and 55082103 is 1/2" × 100 ft reduced-wall **aluminum** (True Value, Elliott). Names are built by the takeoff, so this needs the description route or a code pair. Pack wrong on 161–163. |
| 164     | `3/8" FMC (reduced wall)`                          | —                                                                | **Needs a word:** `3/8" FMC, steel, reduced wall`                  | Same steel or aluminum question as 160–163. Not built by the takeoff, so it is a plain rename. Pack wrong.                                                                                                                                                                                                                        |

### EMT fittings (rows 165–296)

| Rows                                        | Current name (sizes)                                              | Used by                         | Verdict / proposed words                                                      | Why                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 165–182                                     | `{size} EMT 45-degree elbow` / `90-degree elbow`, 1/2"–4"         | —                               | OK                                                                            | A factory EMT elbow is steel, and one product per size.                                                                                                                                                                                                                                                                            |
| 183–191, 211–219, 220–228, 229–237, 284–292 | `{size} EMT C / LB / LL / LR / T conduit body`, 1/2"–4" (45 rows) | —                               | **Needs a word:** "…, set-screw" (e.g. `1/2" EMT LB conduit body, set-screw`) | An "EMT LB" is the die-cast aluminum body with set-screw hubs (HD 58705, "EMT Type LB Set-Screw Conduit Body", $7.25, cover and gasket included; HD Commercial Electric FEBBA-50-1, $5.56). Without the word, a pricer can reach for a threaded LB plus two connectors, which is a different and dearer buy.                       |
| 192–200                                     | `{size} EMT compression connector`, 1/2"–4"                       | 1/2": CK7                       | **Needs a word:** material — "die-cast zinc" or "steel" (**owner pick, Q1**)  | Both are stocked at the same size: HD Halex 22210, 1/2" compression, **die-cast zinc**, 5-pack $4.16 (83¢ each), versus steel compression connectors (Raco, Bridgeport). Steel costs more.                                                                                                                                         |
| 201–209                                     | `{size} EMT compression coupling`, 1/2"–4"                        | —                               | **Needs a word:** same as 192–200                                             | Same choice.                                                                                                                                                                                                                                                                                                                       |
| 210                                         | `1/2" EMT insulated set-screw connector`                          | —                               | **Needs a word:** the material Q1 picks                                       | Plain rename (not built by the takeoff).                                                                                                                                                                                                                                                                                           |
| 238                                         | `1/2" EMT offset connector`                                       | —                               | OK                                                                            | The offset connector is the set-screw die-cast part (Platt Appleton TN50).                                                                                                                                                                                                                                                         |
| 239–247                                     | `{size} EMT one-hole strap`, 1/2"–4"                              | —                               | OK                                                                            | Steel; one product per size.                                                                                                                                                                                                                                                                                                       |
| 248–256                                     | `{size} EMT raintight compression connector`, 1/2"–4"             | 1/2": LT29, MH6, CS1. 3/4": MH5 | **Needs a word:** "…, insulated"                                              | Raintight connectors are steel, but sold with and without an insulated throat as separate items: Raco 2902RT (steel, not insulated, Gexpro) versus Raco 2912RT (insulated, HD 50-pack). Both HD 1/2" listings found are insulated (Commercial Electric FECRIS-50-3, $4.72 per 3). Naming the insulated one matches what HD stocks. |
| 257–265                                     | `{size} EMT raintight compression coupling`, 1/2"–4"              | —                               | OK                                                                            | A coupling has no throat to insulate, and raintight couplings are steel.                                                                                                                                                                                                                                                           |
| 266–274                                     | `{size} EMT set-screw connector`, 1/2"–4"                         | 1": CW11                        | **Needs a word:** material (**Q1**), recommended "die-cast zinc"              | Platt lists set-screw connectors in die-cast zinc as the plain item: Raco 2602, Appleton TC-501, Arlington 800ST ($1.37), T&B TC221SC ($3.11), and Elliott lists Bridgeport 230-DC2 at $0.49. Steel set-screw connectors are a separate, dearer line. Even die-cast spans 49¢ to $3.11, so the name should say which one.          |
| 275–283                                     | `{size} EMT set-screw coupling`, 1/2"–4"                          | —                               | **Needs a word:** same as 266–274                                             | Platt Raco 2622 and Arlington 810 are "EMT Set Screw Coupling, 1/2", Zinc Die Cast".                                                                                                                                                                                                                                               |
| 293                                         | `1/2" EMT to FMC transition coupling`                             | —                               | OK                                                                            | One stocked part (the set-screw combination coupling).                                                                                                                                                                                                                                                                             |
| 294–296                                     | `{size} EMT two-hole strap`, 1/2"–1"                              | —                               | OK — larger sizes missing (X6)                                                |                                                                                                                                                                                                                                                                                                                                    |

### PVC fittings (rows 297–451)

| Rows             | Current name (sizes)                                                        | Used by          | Verdict | Why                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------- | ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 297–305, 320–328 | `{size} PVC Sch 40 45-degree elbow` / `90-degree elbow`, 1/2"–4"            | 2" 90: GR2       | OK      | Standard-radius factory elbow, one per size. HD Cantex R5233828, 2" 90° bell end, $6.68.                                                     |
| 306–319, 329–342 | `{size} PVC Sch 40 45/90-degree sweep, 24" / 36" radius`, 1"–4"             | —                | OK      | The radius is in the name, which is exactly what prices a sweep: HD Carlon UA9DJB, 2" 24" radius, $22.27, and UA9FJB, 2" 36" radius, $26.25. |
| 343–351, 361–396 | `{size} PVC Sch 40/80 C / LB / LL / LR / T conduit body`, 1/2"–4" (45 rows) | —                | OK      | One part for both schedules, decided in batch 2. Priced with its cover (C1).                                                                 |
| 352–360          | `{size} PVC Sch 40/80 coupling`, 1/2"–4"                                    | —                | OK      |                                                                                                                                              |
| 397–405          | `{size} PVC Sch 40/80 terminal adapter`, 1/2"–4"                            | 1": GR5. 2": GR2 | OK      |                                                                                                                                              |
| 406–451          | `{size} PVC Sch 80` elbows and sweeps (46 rows)                             | —                | OK      | Sch 80 elbows are their own heavy-wall product (batch 2).                                                                                    |

### Rigid fittings (rows 452–532)

| Rows             | Current name (sizes)                                                        | Used by | Verdict / proposed words                                                         | Why                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 452–469          | `{size} rigid conduit 45-degree elbow` / `90-degree elbow`, 1/2"–4"         | —       | OK                                                                               | Galvanized steel factory elbow.                                                                                                                                                                                                                                                                                                                                                  |
| 470–478, 488–523 | `{size} rigid conduit C / LB / LL / LR / T conduit body`, 1/2"–4" (45 rows) | —       | **Needs a word:** material — "malleable iron" or "aluminum" (**owner pick, Q2**) | Threaded bodies with cover and gasket come in both: Crescent sells Bridgeport LB-61CG, "Rigid and IMC Conduit Body, Type LB, **Malleable Iron**, Cover and Gasket, 1/2"", at $28.25, and Rexel sells EGS LB50DCG, 1/2" LB with cover and gasket in **die-cast aluminum**. Platt's 1/2" PVC-coated iron LB (PRHLB18) is $130.73. The material moves the price several times over. |
| 479–487          | `{size} rigid conduit coupling`, 1/2"–4"                                    | 2": PG2 | OK                                                                               | One threaded steel coupling per size. See the PG2 note under "Starters".                                                                                                                                                                                                                                                                                                         |
| 524–532          | `{size} rigid conduit threadless compression connector`, 1/2"–4"            | —       | OK                                                                               | Renamed in batch 2 to the real part.                                                                                                                                                                                                                                                                                                                                             |

### Flex and liquidtight fittings (rows 533–555)

| Rows    | Current name (sizes)                                                          | Used by                                                              | Verdict / proposed words                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 533–535 | `{size} liquidtight 90-degree connector`, 1/2"–1"                             | —                                                                    | **Needs a word:** "…, insulated"                                            | Same reason as 536–539. Plain rename.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 536–539 | `{size} liquidtight flexible conduit connector`, 1/2"–1-1/4"                  | **1/2": RS15, CS1, MH8. 3/4": RS14, MH5, MH7, MH10, MH11, CW2, CW6** | **Needs a word:** "…, straight, insulated, steel"                           | The straight and 90 come apart only because the 90 has its own row. The bare name could still be any of these, all at Platt, all 3/4" straight insulated: Raco 34LTICN steel **$6.26**; American Fittings STR75B steel $6.82; zinc die-cast LT75A $9.24; Appleton STB75 $14.57; T&B 5333 **$15.21**; grounding-lug versions $32.99–$39.53. HD: Halex 86207, $5.82; Commercial Electric FLCSIS-75-1 (steel, insulated), $6.34. Ten starters price from this row, so it carries the most weight on these shelves. |
| 540–543 | `{size} nonmetallic liquidtight 90-degree connector` / `connector`, 1/2"–3/4" | —                                                                    | OK                                                                          | The nylon fitting; one product per size and shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 544–547 | `{size} flexible conduit one-hole strap`, 1/2"–1-1/4"                         | —                                                                    | OK                                                                          | The Notes say it fits flex and liquidtight of that size.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 548–551 | `{size} flexible metal conduit connector`, 1/2"–1-1/4"                        | **1/2": MH9, MH12, CW1, CW5. 1-1/4": PG16**                          | **Needs a word:** connector type — "squeeze, straight" (**owner pick, Q3**) | Three different products are all "1/2 flex connector". **Screw-in** (zinc): HD Halex, 5-pack $5.69, about $1.14 each. **Squeeze, die-cast zinc**: Platt 12FDCSQZCN, $2.93; Arlington L421, $2.39. **Squeeze, malleable iron**: Platt Appleton 7481V, $4.29; Crouse-Hinds 708, $4.86. That is a fourfold spread on a row four starters price from. At 1-1/4" the stocked one is the squeeze type (Halex 04212, HD), so "squeeze" is right across the run.                                                        |
| 552–555 | `{size} flexible metal conduit coupling`, 1/2"–1-1/4"                         | —                                                                    | **Needs a word:** "…, screw-in"                                             | The flex-to-flex coupling is the screw-in one (HD Halex 90451, "FMC Screw-In Coupling").                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Locknuts, bushings and service parts (rows 556–635)

| Rows    | Current name (sizes)                                                | Used by                         | Verdict / proposed words                                                   | Why                                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 556–564 | `{size} conduit locknut`, 1/2"–4"                                   | 1/2": PG10. 3/4": PG18. 2": PG2 | OK                                                                         | Steel; one product per size.                                                                                                                                                                                                                                                                                                           |
| 565–573 | `{size} grounding bushing`, 1/2"–4"                                 | —                               | OK                                                                         | The Notes say "insulated throat with a bonding lug". Approved in batch 2.                                                                                                                                                                                                                                                              |
| 574–582 | `{size} insulating bushing`, 1/2"–4"                                | 2": PG2                         | OK                                                                         | The plastic snap-on bushing; the search words say plastic.                                                                                                                                                                                                                                                                             |
| 583     | `2" mast roof flashing`                                             | PG2                             | OK                                                                         | HD Halex 60820 (batch 1).                                                                                                                                                                                                                                                                                                              |
| 584–590 | `{size} metal weatherhead`, 1"–4"                                   | 2": PG2                         | **Needs a word:** "…, clamp-on" (**owner pick, Q4**)                       | Two products. A **clamp-on** head fits threaded or unthreaded rigid, IMC or EMT (Sigma ProConnex 2", die-cast aluminum, True Value; Bridgeport 1260 clamp-on to 4", Elliott). A **threaded** head fits threaded rigid only (Elliott FB-765). The search words already say "clamp", and PG2's 2" rigid mast takes either. Plain rename. |
| 591     | `Pipe roof flashing boot, adjustable split`                         | MH5                             | OK                                                                         | Renamed in batch 1.                                                                                                                                                                                                                                                                                                                    |
| 592–597 | `{size} PVC expansion fitting`, 1/2"–2"                             | —                               | **Needs a word:** the travel, e.g. "…, 6" travel" (**owner question, Q6**) | An expansion coupling is sold by how far it slides, and the maker pages differ (ABB's Carlon E945 page cites an 8" travel). Batch 2 already noted "no travel length named". The owner knows which one he buys. Plain rename.                                                                                                           |
| 598–603 | `{size} PVC female adapter`, 1/2"–2"                                | —                               | OK                                                                         |                                                                                                                                                                                                                                                                                                                                        |
| 604–612 | `{size} PVC one-hole strap` 1/2"–2"; `PVC two-hole strap` 2-1/2"–4" | —                               | OK                                                                         | Decided in batch 2.                                                                                                                                                                                                                                                                                                                    |
| 613–619 | `{size} PVC weatherhead`, 1"–4"                                     | —                               | OK                                                                         | Cantex and Carlon SE caps; one product per size.                                                                                                                                                                                                                                                                                       |
| 620–622 | `Reducing washer, 1" to 1/2"` / `1" to 3/4"` / `3/4" to 1/2"`       | —                               | OK                                                                         | Decided in batch 2. A hole takes one washer on each side, so a starter that uses them needs ×2.                                                                                                                                                                                                                                        |
| 623–631 | `{size} rigid one-hole strap`, 1/2"–4"                              | —                               | OK                                                                         | A rigid one-hole strap is the malleable-iron part (Bridgeport 901, Raco 1302), so the name already means one product.                                                                                                                                                                                                                  |
| 632–633 | `2"` / `3" riser strap`                                             | 2": PG2                         | OK                                                                         |                                                                                                                                                                                                                                                                                                                                        |
| 634–635 | `1/2"` / `3/4" threaded closure`                                    | —                               | OK                                                                         | The name is decided; "closure plug" is a search word.                                                                                                                                                                                                                                                                                  |

**Tally**, counted from the tables above: **518 rows. 349 are OK and 169
need a word or two.** No row is a non-product, and no row is two products in
one.

The 169 rows that need words come in eight patterns:

| Pattern                                                       | Rows |
| ------------------------------------------------------------- | ---: |
| "set-screw" on the EMT bodies                                 |   45 |
| a material on the rigid bodies                                |   45 |
| a material on EMT set-screw and compression fittings          |   37 |
| "insulated" on the raintight connectors                       |    9 |
| straight/insulated/steel or squeeze/screw-in on flex fittings |   15 |
| "steel" on flex                                               |    5 |
| "clamp-on" on weatherheads                                    |    7 |
| the travel on PVC expansion fittings                          |    6 |

**The four that matter most** price several starters each and are vague
today:

- **536–539** (liquidtight connector, 10 starters)
- **548–551** (flex connector, 5 starters)
- **160–163** (flex conduit, 5 starters)
- **248–249** (raintight EMT connector, 4 starters)

## Pack sizes that will mislead the pricing (for Track A)

This is not a name problem, but it is wrong on the sheet the owner is typing
into. **Flex is sold in coils, never sticks**, yet the sheet's pack labels are
inconsistent:

| Rows    | Item                   | Sheet says  | Real pack                                                                                           |
| ------- | ---------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| 154–155 | 1/2", 3/4" liquidtight | 100 ft coil | OK                                                                                                  |
| 156–157 | 1", 1-1/4" liquidtight | 10 ft stick | Coil. HD Southwire 55093003, 1" × 100 ft, $232.05; 1-1/4" comes in 50 ft coils (SupplyHouse 6104UL) |
| 158–159 | LFNC 1/2", 3/4"        | 10 ft stick | Coil. HD Southwire Ultratite 55094201, 1/2" × 100 ft                                                |
| 160     | 1/2" flex metal        | 100 ft coil | OK                                                                                                  |
| 161–163 | 3/4"–1-1/4" flex metal | 10 ft stick | Coil                                                                                                |
| 164     | 3/8" FMC               | 10 ft stick | Coil                                                                                                |

(HD also sells a 1/2" × 10 ft liquidtight cut, Southwire 55082623, but that is
a short length, not how the item is bought.)

A pack of "10 ft stick" on a coil makes a 100 ft coil's price, typed as the
pack price, divide by 10 instead of 100. That is a price per foot ten times
too high. `packFor` gives every Conduit row the stick. Flex should get
`100 ft coil` (50 ft at 1-1/4" liquidtight). **For A:** check the rule against
these rows when the sheet is next rebuilt.

## Starters that would price wrong because of a vague name

**25 starters price from these two shelves.** Searched over every
`BASELINE_ASSEMBLIES` line through `starterPartName`. If a recount at the
end-of-pricing job gives a different number, stop and find out why before
changing anything: either a starter changed since 2026-10-12 or this list is
wrong, and those want different fixes.

| Starter(s)                                                               | Row                           | What could go wrong                                                                            |
| ------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| RS14, MH5, MH7, MH10, MH11, CW2, CW6 (×2 each); RS15, CS1, MH8 (×2 each) | 536–537 liquidtight connector | Priced anywhere from $5.82 to $15.21 a fitting, or $39 if someone picks the grounding-lug one. |
| MH9, MH12, CW1, CW5 (×2 each, 1/2"); PG16 (×4, 1-1/4")                   | 548, 551 flex connector       | About $1.14 if priced as screw-in, $2.39–$4.86 as squeeze.                                     |
| MH9, MH12, CW1, CW5 (6 ft of 1/2"); PG16 (6 ft of 1-1/4")                | 160, 163 flex conduit         | Steel or aluminum; the coils differ in price.                                                  |
| LT29, MH6, CS1 (1/2"); MH5 (3/4")                                        | 248–249 raintight connector   | Insulated or not.                                                                              |
| CK7 (×2, 1/2" compression); CW11 (×2, 1" set-screw)                      | 192, 268                      | Die-cast or steel.                                                                             |
| PG2 (2" overhead service)                                                | 584–590 weatherhead           | Clamp-on or threaded. The prices are close, so this is low risk.                               |

**Two notes on PG2 that are not about names.** Both are for the owner and
A; nothing is changed here.

- **PG2 prices `2" rigid conduit` × 10 ft _and_ `2" rigid conduit coupling`
  × 1.** A rigid stick is sold with one coupling already threaded on (the
  seed says so: `stickJoint: "coupling_on_stick"`), and 10 ft is one stick.
  So the coupling may be counted twice. Leave it if the owner means a mast
  spliced from two pieces.
- **`Service mast, 2", 10 ft` (row 962, Service Entrance) is the same
  product as 10 ft of row 150.** PG2 uses row 150. If both are priced, they
  should agree, or one should retire into the other.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-12.

| #   | Item                                                  | Listing                                                                                                                        | Why it is needed                                                                                                                                                                                                                |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | Rigid conduit nipple, close, steel — 1/2"–2"          | Platt 12CRNP "Threaded Conduit Nipple, 1/2" x Close, Steel" and 2CRNP (2"); HD Halex 64325, 1/2", $1.70                        | Panel to gutter, disconnect to panel, any two threaded enclosures side by side. There is no nipple in the catalog at all.                                                                                                       |
| X2  | Chase nipple, die-cast zinc — 1/2"–2"                 | HD Halex 20701, 1/2", 2-pack $2.81; Platt Arlington 502 (3/4") and 506 (2"), zinc die cast                                     | Box to box back-to-back, or conduit into a box through a coupling. Missing.                                                                                                                                                     |
| X3  | Watertight hub (Myers hub), insulated, zinc — 1/2"–2" | HD Halex 16310, 1" rigid watertight hub, $10.98; HD Commercial Electric FRHIZ-100-1, $10.98; Elliott Eaton ST3 "1" Myers Hub"  | Every conduit entering the top or side of an outdoor enclosure (disconnect, 3R panel, meter). Only "2" meter hub" (Panels) exists today, and batch 2 took "myers" off the grounding bushing, so a "myers" search finds nothing. |
| X4  | PVC end bell — 1"–4"                                  | ABB Carlon E949J5, 2" fabricated end bell, Sch 40/80. HD lists only belled elbows                                              | Every underground stub into a handhole, vault or pad. A distributor item.                                                                                                                                                       |
| X5  | 3/8" FMC connector, screw-in                          | HD Halex 90440, $1.18 (fits a 1/2" knockout, zinc die-cast); HD Halex 04403B, 50-pack $27.46; squeeze version Halex 20420      | Row 164 sells 3/8" flex for fixture whips, but nothing connects it. Every whip has two of these.                                                                                                                                |
| X6  | EMT two-hole strap — 1-1/4", 1-1/2", 2"               | HD Halex 26164, 1-1/4" 4-pack $2.89; HD Bridgeport 1923, 1-1/4" 50-pack. 1-1/2" and 2" are the same lines; confirm at add time | Today the two-hole strap stops at 1", and the one-hole runs to 4".                                                                                                                                                              |

**Checked and NOT missing:**

- IMC and 3-1/2" (withdrawn on purpose, 2026-10-08)
- Strut conduit straps (Strut & Supports, 1545–1553)
- Conduit hanger with bolt (Fasteners & Anchors)
- PVC cement and duct seal (Consumables)
- Conduit spacers, mule tape and pull rope (Underground)
- Pull boxes (Boxes)
- 2" meter hub (Panels)
- Separate conduit-body covers (none on purpose; the bodies are priced with them, C1)
- Liquidtight-to-liquidtight coupling (no such part; retired)
- 1/2" and 3/4" PVC sweeps (the factory elbow is the bend; owner S1–S5)

**Thought of but not checked against a listing, so NOT proposed:** a 90°
squeeze flex connector, 3/4" and 1" insulated set-screw connectors, a rigid
threadless compression coupling, and PVC caps for stub-ups. Each would need
its own listing before it is added.

## Questions for the owner

| #   | Question                                                                                                                                                                       | Suggested answer, and why                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | EMT set-screw and plain compression connectors and couplings (rows 192–209, 210, 266–283): **die-cast zinc or steel**?                                                         | **Die-cast zinc.** It is what Platt and HD list as the plain item (Platt Raco 2602, Appleton TC-501, Arlington 800ST; HD Halex 22210). A shop that buys steel would change it. Raintight stays steel.                                                                                                                                                     |
| Q2  | Rigid conduit bodies (rows 470–478, 488–523): **malleable iron or aluminum**?                                                                                                  | **Malleable iron** (the Form 7/8 body, Bridgeport LB-61CG with cover and gasket). It is the classic rigid body; aluminum is lighter and sold alongside it.                                                                                                                                                                                                |
| Q3  | Flex connector (rows 548–551, 5 starters): **squeeze or screw-in**?                                                                                                            | **Squeeze, straight, die-cast zinc.** It also takes AC and MC, it is the only type stocked at 1-1/4", and Platt lists it at $2.39–$2.93. Screw-in is cheaper ($1.14) but a retail part.                                                                                                                                                                   |
| Q4  | Metal weatherhead (rows 584–590): **clamp-on or threaded**?                                                                                                                    | **Clamp-on.** It fits rigid, IMC or EMT; threaded fits threaded rigid only.                                                                                                                                                                                                                                                                               |
| Q5  | **How should the missing words go in** on rows the takeoff builds by name? (a) In the description / Notes column now, with no code; or (b) in the name, as a code + seed pair. | **(a), the description.** The precedent is "Priced with its cover and gasket." (C1). It gets the price right, which is the point, with no risk to traced runs. Rename (b) later only if the words are wanted in search results and on bid lines. The rows that are not built by the takeoff (164, 210, 533–535, 584–590, 592–597) are renamed either way. |
| Q6  | PVC expansion fitting (rows 592–597): **what travel** do you buy?                                                                                                              | No suggestion; it depends on the job. The travel goes in the name.                                                                                                                                                                                                                                                                                        |

**Nothing here is applied.** Names, descriptions, new rows and pack fixes all
go in A's **end-of-pricing job**, with the owner's yes on the final list.

- Every rename goes through `RENAMED_BASELINE_MATERIALS`, and every new row
  ships with its trade slang (CLAUDE.md § Materials).
- Any rename of a name the takeoff builds is a code and seed pair, never one
  without the other.

## Owner's answers — 2026-10-12

**Nothing below is applied yet.** It is all for A's **end-of-pricing job**.
Track C changes no catalog row, seed or starter.

### The rule from Q5: descriptions, never names

**The missing words go in each row's DESCRIPTION (the sheet's Notes column),
NOT in its name.** That applies to every row in this review, the 164, 210,
533–535, 584–590 and 592–597 rows included, even though those could have
been renamed. So:

- these answers put nothing into `RENAMED_BASELINE_MATERIALS`;
- they make no change to `shared/runFittingMaterials.ts`;
- traced runs keep finding their fittings by the names they use today.

The counter names the owner gave become **search words** on the rows they
describe, so a search finds the row by what the counter calls it.

### The answers, and what the job does

| What                                                       | Answer                                                                       | Description (Notes) the job writes                                          | Search words the job adds                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Q1 — EMT set-screw and compression (rows 192–210, 266–283) | **Zinc die-cast**                                                            | "Zinc die-cast." Row 210 already says "insulated" in its name               | "set screw connector" on the set-screw connector rows |
| Q2 — Rigid conduit bodies (rows 470–478, 488–523)          | **Malleable iron, Form 7**                                                   | "Malleable iron, Form 7. Priced with its cover and gasket."                 | "Form 7"                                              |
| Q3 — Flex connectors (rows 548–551)                        | **Squeeze**                                                                  | "Squeeze type, straight."                                                   | "squeeze connector"                                   |
| Q4 — Metal weatherheads (rows 584–590)                     | **Clamp-on**                                                                 | "Clamp-on; fits rigid, IMC or EMT."                                         | "entrance cap", "service head"                        |
| Q6 — PVC expansion fittings (rows 592–597)                 | **Standard 8" travel only** (the Carlon E945 style). No 2" or 6" travel rows | "Standard expansion coupling, 8" travel."                                   | —                                                     |
| Flex metal conduit (rows 160–164)                          | **Steel**                                                                    | "Steel, reduced wall."                                                      | —                                                     |
| Raintight EMT connector (rows 248–256)                     | **Insulated**                                                                | "Steel, insulated throat."                                                  | —                                                     |
| Liquidtight connector (rows 536–539)                       | **Straight, insulated, steel**                                               | "Straight, insulated throat, steel."                                        | —                                                     |
| EMT conduit bodies (rows 183–191, 211–237, 284–292)        | Set-screw (the review's words, under the Q5 rule)                            | "Set-screw hubs. Priced with its cover and gasket." (keeps the C1 sentence) | —                                                     |
| Liquidtight 90 (rows 533–535)                              | Insulated, to match the straight one (under the Q5 rule)                     | "Insulated throat, steel."                                                  | —                                                     |
| Flex coupling (rows 552–555)                               | Screw-in (under the Q5 rule)                                                 | "Screw-in."                                                                 | —                                                     |

**Check before shipping.** A search word must surface its own row and never
outrank the product a query names (CLAUDE.md § Materials). "Entrance cap"
sits next to row 960, `Service entrance cap` (the SE-cable cap), so check
that each still answers its own search. Run `scripts/searchSpotCheck.mts`
with "entrance cap", "service head", "squeeze connector", "set screw
connector" and "form 7".

### PG2 (Service upgrade 200A, overhead)

- **Drop the separate `2" rigid conduit coupling` × 1 line.** The 10 ft
  stick ships with one coupling on it.
- **`Service mast, 2", 10 ft` (row 962) folds into the 2" rigid stick**
  (owner's yes). Retire it into `2" rigid conduit` through
  `RETIRED_BASELINE_MATERIALS`, with `Service mast, 2", 10 ft` kept as a
  search word on the 2" rigid row. No shipped starter uses row 962. A bid
  line priced from it keeps its frozen snapshot.
  - **Watch the unit.** The mast was sold "each" (one 10 ft stick), while
    2" rigid is "foot". A company's own assembly that used the mast at
    quantity 1 still points at the retired row and keeps working, but it
    does not convert to 10 ft on its own.
  - **The 2-1/2" and 3" masts go the same way (owner's yes, 2026-10-13).**
    `Service mast, 2-1/2", 10 ft` (row 963) retires into
    `2-1/2" rigid conduit` (row 151), and `Service mast, 3", 10 ft` (row 964) into `3" rigid conduit` (row 152). Each old name is kept as a
    search word on its rigid row, exactly as for the 2". The same "each" versus "foot" note
    applies to both. No shipped starter uses row 963 or 964 (the sheet's
    "Used by" is empty on both, read 2026-10-13); if the job finds one that
    does, stop and find out why first.
- If the recount at the job finds the coupling line already gone, or a
  second starter using row 962, stop and find out why before changing
  anything.

### The 6 missing items: add all of them

Use the names and sizes in "Common items that are MISSING" (X1–X6). Each
ships with its trade slang:

| #   | Search words to include                                    |
| --- | ---------------------------------------------------------- |
| X1  | "close nipple", "nipple", "threaded", "rigid"              |
| X2  | "chase nipple", "chase"                                    |
| X3  | "myers", "myers hub", "watertight hub", "hub", "insulated" |
| X4  | "end bell", "bell end", "underground", "stub"              |
| X5  | "3/8 flex connector", "screw in", "greenfield", "whip"     |
| X6  | "two hole strap", "2 hole", "minerallac"                   |

X3's "myers" is the word batch 2 took off the grounding bushing. Here it
names the right part.

### Flex packs: A relabels them as coils

Rows 156–159 and 161–164 get a coil pack size and pack qty in the
end-of-pricing job: 100 ft coil and 100, or 50 ft and 50 at 1-1/4"
liquidtight. Confirm each one against the listing. **The owner leaves those
rows blank until then.**
