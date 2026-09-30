# Track C — the catalog for commercial retail work (2026-09-29)

**Status: BUILDING (owner, 2026-09-29): R1, R2, R4, R5, R6, R7 and R9's
descriptions, in that order. R3 and R8 HELD for Track A.** Built pieces are
marked BUILT in their section. Written on `track-c` after merging
`local-dev` at `5c8c7b5`.

The job it is measured against: a small electrical contractor on a
Dollar Tree–style retrofit or remodel. Lay-in ceiling, new or relocated
troffers and strips on MC whips, branch circuits in MC above the ceiling,
surface raceway down block walls, a cash wrap on isolated-ground circuits,
exit and emergency lights, occupancy sensors in the back rooms, a 208Y/120V
three-phase panel, a rooftop unit and a sign circuit.

**Order:** by how often that contractor would hit the gap, with the gaps that
produce a WRONG NUMBER (a part the app can't price, or one it counts wrong)
ahead of gaps that only cost typing. Where a gap is rarer but its dollar
exposure per job is large, that is said beside it.

**How it was measured.** The shipped catalog (`BASELINE_MATERIALS`, 1,520
rows today) was searched by name for each part the job above buys, and the
descriptions and aliases of the near-misses were read. The pricing sheet
(`pricing/rows.json`, 1,647 rows) was read for rows the catalog does not have
yet. Earlier decisions read first: `ASSEMBLIES_PLAN.md` § "Three new
categories ride along", `references/materials-track-c-plan.md`, CLAUDE.md
§ Brands, `todo.md` (MC connectors and straps, flex straps, bushings).

---

## Summary

| #   | Gap                                                   | Wrong number?                       | Rows       | Track A?                          | Recommend         |
| --- | ----------------------------------------------------- | ----------------------------------- | ---------- | --------------------------------- | ----------------- |
| R1  | MC runs count no connectors and no straps             | Yes — short on every MC run         | 4          | No                                | Build first       |
| R2  | No 12-4 or 14-4 MC; no isolated-ground MC             | Yes — a 4-wire circuit priced as 3  | 3          | No                                | Build with R1     |
| R3  | No surface raceway at all                             | Yes — can't be priced               | ~23        | **Yes** — category enum           | Ask A, then build |
| R4  | Low-voltage occupancy sensors have no power pack      | Yes — sensor bought, pack missed    | 2 + 2 desc | No                                | Build             |
| R5  | Every sized panel is single-phase; 3-phase is one row | Yes — one price for 100A–400A       | 6          | No (brands later need `parentId`) | Build parents now |
| R6  | No #12 or #14 THHN stranded                           | Small                               | 2          | No                                | Build, low effort |
| R7  | Flex runs say "No catalog strap"                      | No — the screen says so             | 4          | No                                | Build with R1     |
| R8  | Locknuts and bushings not counted                     | Yes — short on panel and rigid ends | 0          | **Yes** — A1 (roles)              | Held for A        |
| R9  | Contactor, emergency driver, sign disconnect          | No                                  | 0          | No                                | Descriptions only |

Total if everything that needs no migration is built: about 21 rows plus a
handful of description edits. R3 adds about 23 once A lands its enum.

---

## R1. MC runs count no connectors and no straps — the most frequent wrong number

> **BUILT 2026-09-29 — 6 rows, not the 4 planned.** `3/8"`, `1/2"`, `3/4"`
> and `1" MC connector` (the planned two left 6 AWG and larger MC with no
> connector to name), `MC one-hole strap, small` and `, large`. Every shipped
> MC cable maps to a connector and strap that ship (`mcFittingNames`, pinned
> in `server/mcCableFittings.test.ts` against the catalog). A cable type now
> gets `connector` and `strap` rows from `countCableFittings`, over new
> `cableLegs` (runTypeFootageCore): one per cable end, straps within 1 ft of a
> box then every 6 ft (`MC_STRAP_SPACING`, a constant: the materials screen
> edits spacing only on Conduit rows). The type's own connector/strap choice
> wins, as on conduit. NM is unchanged. The panel, the stored bid line, the
> bid screen's re-derived qty and the materials list all read the same count
> (one test through the real routers); red with the rows disabled.
> The generic `cable connector` rows lost their "mc" alias, so "mc connector"
> finds MC connectors. The standard search sweep did not move.

**How often.** Every MC run on every job. On this kind of remodel most
branch circuits are MC, so it is most of the traced footage.

**What is wrong.** A cable run type buys its cable and nothing else. Two
connectors per run (one each end) and a strap within 12 in of each box and
every 6 ft after (NEC 330.30) are missing from the bid, and nothing on
screen says so. Recorded in `todo.md` ("MC cable connectors and straps") and
in `references/track-b-next-batch-plan.md` as waiting for Track C rows.

**What the catalog has.** `3/8"`, `1/2"`, `3/4"` and `1" cable connector`
(Connectors & Terminations): generic clamp connectors sized by cable outside
diameter, aliased to both NM and MC. `MC anti-short bushing` (a redhead: AC
cable needs one, MC does not). No MC strap, only EMT, PVC, rigid and strut
straps. Supports to the ceiling grid exist already
(`Independent support wire clip`, `T-bar grid clip`, `Rod hanger clip`).

**Rows, 4:**

- `MC cable connector, snap-in, 3/8"`: fits 14-2 through 10-3. The one on
  nearly every run.
- `MC cable connector, 1/2"`: 10-4, 8-x, 6-2.
- `MC cable strap, one-hole, small`: 14-2 through 10-3.
- `MC cable strap, one-hole, large`: 10-4 and up.

The existing `cable connector` rows stay as they are. They are the NM clamp
and some shops use them on MC; a separate MC row is what the counter sells as
"MC connectors" and prices differently.

**Counting.** Code only, no migration. `takeoff_run_types` already has
`connectorMaterialId` and `strapMaterialId`, and `runMaterialRole` already has
`connector` and `strap`. Today they are only used on conduit types. The
connector is chosen from the cable's size (a table, like
`CONDUCTOR_SIZES`), and the straps come from `countFittings` with MC's
spacing. Starter assemblies carry no connector or strap, so nothing counts
twice today (the double-count note in `todo.md` still applies to a
company's own assemblies).

**Recommend:** build first. It is the largest wrong number on this kind of
job, and it is the one the takeoff already has the columns for.

---

## R2. No 12-4 or 14-4 MC, and no isolated-ground MC

**How often.** Most jobs. A 208Y/120V building runs three-phase multiwire
branch circuits (three hots, one neutral) as 12-4 MC, and a cash wrap's
isolated-ground receptacles are fed with MC that carries a separate
insulated ground.

**What is wrong.** `MC_SIZES` in `server/seed/materials/wireAndCable.ts`
lists 14-2 through 2-3 and skips 12-4 and 14-4. Its comment says the list is
"the sizes MC is actually manufactured in", but 12-4 is one of the most
common MC cables sold. An estimator picks 12-3, and the bid buys one
conductor in four too few, with a type sentence that says so confidently.
That is the conductor-count fault from 2026-09-20 in a different form.

**Rows, 3:** `12-4 MC cable`, `14-4 MC cable`,
`12-2 MC cable, isolated ground` (two conductors, an insulated green ground
and the bare bond, the one sold for IG receptacles). Per foot, unpriced,
slang: "12/4", "12-4 mc", "ig mc", "hcf" does NOT belong (that is
hospital-grade, a different cable).

**Needs checking when built, not assumed:** that the size parser and
`runRespecify` read `12-4` as four conductors plus ground, and that the IG
cable counts TWO grounds or one ground plus one insulated one, whichever the
circuit arithmetic can say. If it cannot say the IG one honestly, ship the
two plain rows and hold the IG row.

**Recommend:** build with R1. Fix the comment in the same change, so it
stops claiming the list is complete.

> **BUILT 2026-09-29 — 3 rows as planned:** `14-4 MC cable`, `12-4 MC cable`,
> `12-2 MC cable, isolated ground`. The `MC_SIZES` comment now says it was
> incomplete. **RQ5 turned out moot:** a cable's conductors and grounds feed
> no arithmetic (it is priced by the foot, and its ground is in the jacket,
> `quantitiesForRun`), so the IG row needed nothing more. All three take the
> 3/8" MC connector and small strap. Search: "12/4", "12-4 mc", "14/4",
> "ig mc" found nothing before; the IG cable is 3rd for "12-2", after NM-B
> and plain MC.

---

## R3. Surface raceway: none at all — NEEDS TRACK A

**How often.** Most remodels in a block building. New receptacles on a block
wall go in surface raceway, not in the wall. `ASSEMBLIES_PLAN.md` already
calls it "the single largest hole in the catalog, because a retail remodel is
mostly Wiremold".

**What is wrong.** Zero rows. The contractor types a price or borrows EMT
rows, and borrowed EMT is a wrong number with the right-looking name.

**Why it waits.** `materials.category` is a MySQL enum, and "Surface Raceway"
is not in it. Adding it is an `ALTER TABLE … MODIFY`: additive, safe, but a
migration, so it is Track A's. `ASSEMBLIES_PLAN.md` puts it in the same
release as `parentId`. **Recommend asking A for the enum on its own, ahead of
`parentId`**, since it is one statement and blocks the biggest retail gap.

**The pricing sheet's 20 rows are not ready to seed as they are**, and this
is the part to decide before building:

1. **The fittings are unsized.** `Raceway coupling`, `Raceway flat elbow`
   and the rest have no series, but a 500-series and a 700-series elbow are
   different parts and do not interchange. One row for both is one price for
   two parts.
2. **500 and 700 are one-piece raceway**, but the sheet lists them as a
   base row and a cover row (`Surface raceway base, 500 series` +
   `…cover, 500 series`). Base-and-cover is the 2000/2400/4000 families.
   Seeded as written, a foot of 700 would be priced as two parts.

**Rows, about 23, per series:**

- 700 series (the common one), 13: raceway (per foot), coupling, flat 90°,
  inside 90°, outside 90°, tee, blank end fitting, entrance end fitting
  (from a box), 1-gang device box shallow and deep, 2-gang device box,
  fixture box, support clip.
- 500 series, 10: the same, less the 2-gang and fixture boxes and one device
  box depth.
- 2400 two-channel: hold. It is less common on this kind of job.

Names are generic ("Surface metal raceway, 700 size") with "wiremold",
"v700" and "700 series" as aliases, per CLAUDE.md § Brands (commodity items
are generic).

**Takeoff.** Count by hand first: boxes and fittings as counts, raceway as
a typed length. A surface raceway run type (a `conduit` path with a raceway
material, couplings every 10 ft) may work with today's columns. That is
worth checking when built, not something to promise now.

**Recommend:** ask Track A for the enum value now. Build the 700 and 500
rows once it lands. Do not seed the sheet's 20 rows as written.

---

## R4. Low-voltage occupancy sensors have no power pack

**How often.** Most jobs under an energy code: back room, restroom, office,
break room.

**What is wrong.** A low-voltage ceiling sensor needs a power pack (a relay
and transformer, one per zone) and sensor cable. The catalog has the
sensors, but `Ceiling occupancy sensor, PIR` is aliased "line voltage low",
so it does not say which kind it is, and there is no power pack row. The
sensor is bought and the pack is not.

**Rows, 2:** `Occupancy sensor power pack, 120/277V`, `18/3 control wire`
(the catalog has 18/2, 18/4, 18/5, 18/8, but sensors are wired in 18/3).
**Plus description edits** on the two ceiling sensors saying which kind they
are and that the low-voltage kind needs a pack.

**Recommend:** build. A starter assembly (sensor + pack + cable) is the
natural next step, but it is its own decision (starter content ships
unpriced).

> **BUILT 2026-09-29 — 2 rows + descriptions.** Named `Sensor power pack,
120/277V`, not "Occupancy sensor power pack": with "occupancy sensor" in
> its name it ranked 2nd for "occupancy sensor", above two real sensors, so
> "occupancy" is an alias instead. `18/3 control wire`. Both ceiling sensors
> now say the low-voltage kind needs a pack and 18/3 and the line-voltage
> kind neither (aliases unchanged, since they already named both). R9's
> emergency-pack description is in the same change; the contactor and time
> clock already say they are placeholders. Standard search sweep did not
> move.

---

## R5. Every sized panel is single-phase; three-phase is one unsized row

**How often.** Less often than R1–R4: only jobs that replace or add a panel.
**But the dollar exposure per job is the largest on this list.**

**What is wrong.** The sized panel rows (`200A main-lug sub-panel,
42-space` and so on, 43 matched by name) are named and aliased as load
centers, and none of them says three-phase. The three-phase rows are
`208V 3-phase panelboard` and `480V 3-phase panelboard`, each ONE row with no
amperage or space count, so one price stands for a 100A and a 400A panel. A
3-pole breaker also cannot go in a single-phase load center, so picking a
sized row prices a panel that cannot hold the job's breakers.

**Rows, 6 (208Y/120V three-phase, 4-wire):** 125A main-lug 30-space, 225A
main-lug 42-space, 225A main-breaker 42-space, 400A main-lug 42-space, 400A
main-breaker 42-space, 100A main-lug 3-phase load center 24-space. 480V
stays one row for now, since it is rare on this kind of job.

**Brands.** Panels are one of the two brand families (CLAUDE.md § Brands),
and brand variants need `parentId`, which does not exist yet (Track A,
`ASSEMBLIES_PLAN.md`). These six are the generic PARENTS, which an assembly
points at, so they can ship now with no migration. The variants come later.

**The unsized row:** keep it, re-described as "placeholder — prefer a sized
row", rather than retiring it. Retiring hides it from pickers, and a bid that
used it keeps resolving either way. Retire it once the sized rows have been
used for a while.

**Recommend:** build the six parents.

---

## R6. No #12 or #14 THHN stranded

**How often.** Often. Commercial EMT pulls are commonly stranded.
**Wrong number: small.** Stranded and solid cost nearly the same, so the
error is cents per hundred feet. The real cost is the estimator not finding
what they buy.

**Rows, 2:** `#12 THHN stranded`, `#14 THHN stranded`, like the existing
`#10 THHN stranded`.

**Recommend:** build. Two rows, no risk.

---

## R7. Flex runs say "No catalog strap"

**How often.** Every rooftop unit and walk-in cooler connection (a short
LFMC or FMC whip).

**Not a wrong number.** The screen already says the part is missing
(`todo.md`, "FMC/LFMC straps"; `strapFamily` returns null for flex). It is a
gap the estimator has to fill by hand.

**Rows, 4:** one-hole flex straps 1/2", 3/4", 1", 1-1/4" (the sizes the
flex rows come in), plus the `strapFamily` entry that lets the counter pick
them.

**Recommend:** build with R1, since it is the same kind of work.

---

## R8. Locknuts and bushings — HELD for Track A (A1)

Unchanged: the rows exist, the counting waits for A to add `locknut` and
`bushing` to `runMaterialRole` (`references/track-c-next-batch-plan.md` § W5
and § 4). On this kind of job it matters at the panel: every EMT home run
into a panelboard.

**Added 2026-09-29, owner's answer to the open question** (also recorded in
§ W5 of the next-batch plan): on small conduit (under 1-1/4", not rigid or
IMC), a run type with NO conductor chosen counts NO bushing, and the screen
says why: **"wire size not set, bushings not counted"**.

---

## R9. Present but generic — descriptions only, no rows

- **Lighting contactor, time clock:** one placeholder row each, described
  as such. Rare enough on this job to leave as they are.
- **Emergency LED driver for a troffer:** `Emergency battery backup pack`
  already carries "driver", "ballast", "bodine" as aliases. A one-line
  description saying it serves LED troffers is enough.
- **Sign circuit (NEC 600.5/600.6):** built from rows that exist (a 30A
  NEMA 3R disconnect or a weatherproof switch). An assembly, not rows.

**Recommend:** description edits only, in the same change as R4.

---

## What this does NOT change

- No price. Every new row is unpriced ($0), like every shipped item
  (CLAUDE.md § Materials).
- No brand anywhere except as a future panel variant (R5).
- No row is renamed. Where one needs to change, it goes through
  `RENAMED_BASELINE_MATERIALS`, never a text edit.

## Questions for the owner (recommended answer first)

- **RQ1.** Build order R1 + R2 + R7 (one change), then R4 + R9, then R5,
  then R6? _Recommend yes._
- **RQ2.** Ask Track A for the "Surface Raceway" category on its own, ahead
  of `parentId`? _Recommend yes._
- **RQ3.** Surface raceway rows per series (700 and 500 now, 2400 held),
  not the sheet's 20 unsized rows? _Recommend yes._
- **RQ4.** Keep the unsized 3-phase panelboard row as a described
  placeholder beside the six sized parents? _Recommend yes._
- **RQ5.** Ship the isolated-ground MC row only if the circuit arithmetic
  can count its extra ground honestly? _Recommend yes._
