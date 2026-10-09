# Cover plates audit — catalog and starter assemblies

Track C, 2026-10-07. REPORT ONLY: nothing here has been changed in the seed.
Read against `local-dev` `be81a51` — the catalog in `server/seed/materials/`
and all 183 recipes in `BASELINE_ASSEMBLIES`. If a recipe below no longer
matches what `server/seed/starterAssemblies.ts` says, the file moved after
this was written: re-read the recipe before acting on the line here.

> **Since then (2026-10-08): § 1's "missing" catalog rows were ADDED by
> Track A in `3eefc35`** (103 cover rows: typed plates, single-receptacle,
> 30/50A plates and raised covers, heavy-duty in-use, floor box covers,
> Wiremold 700). That commit changed NO starter recipe, so § 2's "wrong
> cover" and "no cover" assemblies still stand; § 3's assembly list is the
> remaining work.

The owner's question: do we have device cover plates, and do the starter
assemblies include them? They add up on real bids.

## Summary

- Covers are mostly present (1–6 gang plates, blanks, 4" and 4-11/16" mud
  rings, raised industrial covers, handy box covers, in-use 1- and 2-gang,
  flip, WP blanks, floor box cover, data/coax plates) — but **ONE generic
  "Wall plate" stands for duplex, toggle and decora**, so a bid cannot tell
  them apart.
- **Missing from the catalog:** typed duplex / toggle / decora plates, a
  single-receptacle plate, a 4" raised single-receptacle cover, a 30/50A
  power-receptacle plate, a 4-11/16" raised 30/50A cover.
- **Starters are mostly right.** Every resi and commercial device recipe
  carries a plate (commercial: mud ring + plate), exteriors carry in-use
  covers, junction and demo boxes carry blanks.
- **Wrong cover:** twist-locks CS6/7/8 carry a DUPLEX raised cover (need a
  single-receptacle one); RS17 sump and CS5 cooler put a 20A SINGLE
  receptacle behind the generic wall plate.
- **No cover:** RS1 range, RS2 dryer, RS13 14-50 (plus in-use if outdoor),
  DV34 surface raceway (its raceway device box takes a standard plate), MS12
  (minor). Fixtures, fire-alarm devices, sensors, thermostats and the
  poke-through need none.

## 1. Covers in the catalog

| Kind                          | Present                                                                                                                                                             | Missing                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wall plates, flush            | `Wall plate` (1-gang, generic), `2-gang` … `6-gang wall plate`, `Duplex/toggle combo plate`, `Jumbo`, `Screwless`, `Stainless steel wall plate`                     | **No separate duplex, toggle or decora plate** — "decora" and "toggle" are only search words on the one generic plate. (The old `master_*` catalog, v5.58, had 1–4 gang × blank/duplex/toggle/decora/GFCI.) **No single-receptacle plate** (round hole, 20A single). **No 30/50A power-receptacle plate** (range, dryer, RV). |
| Blank                         | `1-gang` … `4-gang blank plate`; `4"` and `4-11/16" square blank cover`; `4" round blank cover`; `Handy box cover, blank`; `Weatherproof blank cover` 1- and 2-gang | —                                                                                                                                                                                                                                                                                                                             |
| Decora / GFCI                 | the generic `Wall plate`; `4" square raised cover, decorator`; `4-11/16" square raised cover, 2-gang decorator`; `Handy box cover, decorator`                       | a decora plate distinct from the duplex one (above)                                                                                                                                                                                                                                                                           |
| Raised / industrial (surface) | 4" square raised: duplex, single toggle, two toggle, decorator. 4-11/16": 2-gang decorator, two duplex. Handy box: blank, duplex, toggle, decorator                 | **Raised cover, single receptacle** (round hole — twist-locks, 20A single), 4" square. **Raised cover for a 30/50A** (4-11/16"). Duplex + toggle combo raised cover.                                                                                                                                                          |
| Weatherproof                  | `Weatherproof in-use cover`, `…, 2-gang`, `Weatherproof flip cover`, `Stainless steel weatherproof cover`, `Weatherproof lampholder cover`, WP blanks               | Heavy-duty (metal) in-use cover for commercial — only one in-use grade. A WP cover for a 30/50A RV/pedestal receptacle.                                                                                                                                                                                                       |
| Floor box                     | `Floor box cover` (one, generic)                                                                                                                                    | Covers by type (duplex flip-lid vs combo/data), carpet flange vs tile/wood flush. Poke-through has no separate cover row — fine if the device carries its own.                                                                                                                                                                |
| Surface raceway               | `Raceway device box, 1-gang` / `2-gang` (since 2026-10-07)                                                                                                          | Nothing new — the raceway device box takes a standard wall plate.                                                                                                                                                                                                                                                             |
| Mud / plaster rings           | 4" square mud ring 1-gang, 2-gang, fixture; 4-11/16" 1-gang, 2-gang; `Low-voltage mud ring`; extension rings; `Drywall repair ring`                                 | Ring depths (1/2", 5/8", 3/4") — one depth per row today. Minor.                                                                                                                                                                                                                                                              |
| Low voltage                   | Keystone 1/2/4/6-port, coax, HDMI, speaker, thermostat plates, cable entry plate                                                                                    | —                                                                                                                                                                                                                                                                                                                             |

## 2. Starter assemblies with a device

**Right cover:**

- Resi, generic plate: DV1, DV2, DV4, DV5, DV6, DV7, DV9, DV10, DV12,
  DV13–15, DV18, DV19, GR1, GR6, GR7, RS5 (two plates), RS8, DR16, DR17, DR18.
- Multi-gang: DV11, DV16 (2-gang), DV17 (3-gang).
- Commercial MC — box + mud ring + plate: DV20, DV21, DV23–DV29, DV31, CS4,
  DR19. DV22: 4-11/16" box + 2-gang ring + 2-gang plate.
- Exterior: DV8, LT17, MH6 (in-use cover); PG20 (2-gang in-use).
- Surface: MH2, MH9 (handy box + toggle cover).
- DV33 (floor box cover).
- Blanks: MS1, MS2, CS3, CS10, GC5, DR1, DR3 (4" square blank cover); DR2
  (1-gang blank plate).
- Data/TV: MS6, MS7, MS8 (keystone / coax plate).

**Caveat on all of the above:** they use the single generic `Wall plate`,
correct by the catalog's design, but a pick list cannot tell decora from
duplex — GFCI, AFCI, USB, dimmer, sensor, timer and fan-control recipes want
decora; duplex receptacles want duplex; toggles want toggle.

**Wrong cover:**

- **CS6, CS7, CS8** (twist-lock L5-20, L6-30, L14-30): `4" square raised
cover, duplex`. A twist-lock needs a SINGLE-receptacle raised cover — not
  in the catalog.
- **RS17** (sump) and **CS5** (reach-in cooler): a `20A single receptacle`
  behind the generic `Wall plate`. Needs a single-receptacle plate — not in
  the catalog.

**No cover, and one is needed:**

- **RS1** (50A range), **RS2** (30A dryer): double-gang box, no plate. Needs
  a power-receptacle plate — not in the catalog.
- **RS13** (14-50 RV/EV): 4-11/16" box, no cover. Needs a raised 50A single
  cover — not in the catalog — and an in-use cover if outdoors.
- **DV34** (surface raceway): has `Raceway device box, 1-gang` since
  2026-10-07 but no plate. A standard duplex plate fits that box.
- **MS12** (structured media): duplex in a single-gang box, no plate. Minor —
  fine only if the receptacle mounts in the enclosure itself.

**No cover needed (by design):** fixtures cover their box (all LT rows with a
box, LT15, LT16, LT29, GC4, RS9 smoke/CO); fire-alarm devices cover their
ring (CS11, CS12, CS13); DV30 sensor on a fixture ring; MH14 thermostat on an
LV ring; RS19 line-voltage thermostat; DV32 poke-through (carries its own);
disconnects, inlets, panels.

**Seen in passing, not covers:** DV3 "Dedicated 20A receptacle" uses the
plain `duplex-receptacle`, not `20a-duplex-receptacle`.

## 3. Recommended

**Add to the catalog** (Res = residential, Comm = commercial):

1. Typed 1-gang plates — **Duplex plate, Toggle plate, Decora plate** — and a
   **2-gang decora**. Res + Comm. Biggest dollar and picking difference.
   Needs a decision on the generic `Wall plate` (keep, or retire through
   `RETIRED_BASELINE_MATERIALS` — never delete; renaming goes through
   `RENAMED_BASELINE_MATERIALS`).
2. **Single-receptacle wall plate** (round hole: 20A single, twist-lock).
   Comm (also resi sump).
3. **4" square raised cover, single receptacle.** Comm.
4. **Power-receptacle plate, 30/50A** (range, dryer, RV). Res.
5. **4-11/16" square raised cover, 30/50A single receptacle.** Res/Comm.
6. Heavy-duty metal in-use cover. Comm (optional).
7. Floor box covers by type, plus carpet flange. Comm (optional).

Every new row ships $0 / example price per the pricing rules, with trade
slang in `searchAliases` and never aliased to the device it covers
(`server/seed/materials/devices.ts` header).

**Assemblies that need a cover line, or a different one:**

- CS6, CS7, CS8 → swap the duplex raised cover for #3 (Comm).
- RS17, CS5 → swap `Wall plate` for #2 (Res / Comm).
- RS1, RS2 → add #4 (Res). **Superseded 2026-10-08 (owner):** a 1-gang
  plate on their double-gang box does not fit, and RS1's 6/3 overfills any
  single-gang box, so both moved to a 4-11/16" box with #5, like RS13.
- RS13 → add #5, plus an in-use cover if outdoor (Res). **Owner,
  2026-10-08: it is outdoor** — `Weatherproof in-use cover, 30A/50A power
receptacle` added. Both in `server/seed/starterCoverSwaps.ts`.
- DV34 → add a wall plate (Comm).
- MS12 → add a plate (Res, minor).
- Once #1 exists: GFCI / AFCI / USB / dimmer / sensor / timer / fan-control
  recipes → Decora plate; duplex recipes → Duplex plate; switch recipes →
  Toggle plate (both).

Starter recipes name parts by KEY (`server/seed/starterParts.ts`), so each
new plate needs a key there as well as its catalog row.
