# Strut & Supports — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the "Strut
& Supports" shelf of `starter-catalog-pricing.xlsx` ("Starter prices",
spreadsheet rows **1519–1567**, 49 rows, in the app-order sort), the
question is whether one real product can be priced from the name alone. The
workbook was read from a fresh copy (the worktree's copy, byte for byte the
same as `C:\dev\BidPhase\pricing`, and unchanged since the Connectors
read), because the owner has it open. It is the shelf after Connectors &
Terminations (`connectors-terminations-name-review.md`); Fasteners &
Anchors starts at row 1568.

**Source rule (owner, 2026-10-14; `new-rows-source-check.md`):** every
listing below is from Home Depot, Platt or Stoneway. A new row found there
is COMMON and takes its Example price from there; one found at none of the
three is SPECIALTY, added with the price blank and "Specialty - price from
your supplier."

The sheet's 49 names match `BASELINE_MATERIALS`' Strut & Supports rows one
for one (read from the seed the same day), so the search words quoted below
are the catalog's own. Only the five channel rows carry a description.

**The test.** Strut is bought by profile, gauge, finish (pre-galvanized,
hot-dip, stainless) and whether it is slotted; a strut strap by the conduit
it holds (EMT and rigid are different outside diameters); a channel nut by
its thread; a fitting by its shape and number of holes.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**9 of the 49 rows are used** (the sheet's "Used by" column says the same):
`T-grid independent support clip` (6 starters), `T-grid fixture clip` (5,
x4 each), `3/8" all-thread rod` (MH12, MS5), `1-5/8" x 1-5/8" strut
channel` (PG16 x0.4, MS5 x0.3), `1/2" all-thread rod` (PG16 x2), `3/8" hex
nut` and `3/8" flat washer` (MS5 x4), `T-bar box hanger` (DV30),
`Temporary pole, 6x6 post` (PG20). **No run type uses this shelf.**

**Packs: 29 of the 49 rows have a pack guessed from a word in the name**
(`pack-label-scan.md` § E: "washer", "nut", "strap", "clip",
"connector").

## Existing rows

| Row        | Current name                                                                                           | Used by                          | Verdict                                                                  | Why                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1563–1567  | `1-5/8" x 1-5/8"` / `13/16"` / `7/8"` / `3-1/4" back-to-back` / `1-1/4" x 1-1/4" strut channel, 10 ft` | 1-5/8" x 1-5/8": PG16, MS5       | **Needs words** (Q1): `…, 10 ft, 12 ga, pre-galvanized, slotted`         | Finish and slots change the price: Platt, 1-5/8" pre-galvanized slotted **about $3.26/ft**; the same profile hot-dip galvanized **about $6.71/ft**. Search words say both "slotted solid".                                         |
| 1545–1553  | `{1/2"…4"} strut conduit strap` (9 rows)                                                               | —                                | **Needs words** (Q2): `{size} EMT strut strap`; pack P1                  | EMT and rigid straps are different parts (Platt: Power-Strut P1426AS, 1/2" EMT strut strap). The search words say "pipe" too.                                                                                                      |
| 1544       | `Strut channel nut`                                                                                    | —                                | **Needs words** (Q3): `Strut channel nut, 3/8"-16, with spring`; pack P1 | Sold by thread; search words say "1/4-20 3/8-16". Platt Power-Strut P1008, 3/8"-16 long spring, **$2.41** each; Home Depot 10-packs.                                                                                               |
| 1543       | `Strut angle bracket`                                                                                  | —                                | **Needs words** (Q4): `Strut 90° angle fitting, 2-hole`                  | Fittings are sold by shape and hole count.                                                                                                                                                                                         |
| 1555       | `Strut flat plate`                                                                                     | —                                | **Needs words** (Q4): `Strut flat plate fitting, 2-hole`                 | Same.                                                                                                                                                                                                                              |
| 1557       | `Strut wing connector`                                                                                 | —                                | **Needs words** (Q4): hole count from one listing; pack P1               | Same. Box of 25 from "connector" (§ E "likely accidental").                                                                                                                                                                        |
| 1556       | `Strut post base`                                                                                      | —                                | **Needs words** (Q4): `Strut post base, single channel`                  | Single- and double-channel bases are different parts.                                                                                                                                                                              |
| 1523, 1524 | `1/2" conduit clip`, `3/4" conduit clip`                                                               | —                                | **Needs words** (Q5): `{size} EMT clip, rod/wire hanger`                 | Search words say "caddy emt spring steel rod wire stud snap on": rod, wire and stud clips are different parts. Platt: Caddy 812MB18A combination hanger, 1/2"–3/4" EMT. `Rod hanger clip` on Fasteners & Anchors may overlap (Q5). |
| 1561       | `Temporary pole, 6x6 post`                                                                             | PG20                             | **Needs words** (Q6): `Temporary pole, 6x6 x 16 ft treated post`         | Sold by length. Home Depot: 6x6x16 ground-contact posts; the 6x6x12 is **$45.18** and too short once 3–4 ft is buried under a service drop.                                                                                        |
| 1562       | `Threaded rod stiffener`                                                                               | —                                | **Owner pick** (Q7)                                                      | A seismic brace that clamps rod to strut ("seismic brace" in its search words). Not a counter item; not checked at the three stores.                                                                                               |
| 1519–1522  | `1/4"`, `3/8"`, `1/2"`, `5/8" all-thread rod, 10 ft`                                                   | 3/8": MH12, MS5; 1/2": PG16 (x2) | **OK**                                                                   | Diameter and length named; zinc is the default.                                                                                                                                                                                    |
| 1529–1532  | `{size} hex nut` (4 rows)                                                                              | 3/8": MS5 (x4)                   | **OK**; pack check (Q8)                                                  | Coarse thread is the default for rod. Box of 100 from "nut"; Home Depot sells 25-packs, supply houses boxes of 100.                                                                                                                |
| 1525–1528  | `{size} flat washer` (4 rows)                                                                          | 3/8": MS5 (x4)                   | **OK**; pack check (Q8)                                                  | Same.                                                                                                                                                                                                                              |
| 1533–1536  | `{size} lock washer` (4 rows)                                                                          | —                                | **OK**; pack check (Q8)                                                  | Same.                                                                                                                                                                                                                              |
| 1539–1542  | `{size} rod coupler` (4 rows)                                                                          | —                                | **OK**                                                                   | Sold each.                                                                                                                                                                                                                         |
| 1537, 1538 | `MC one-hole strap, large`, `small`                                                                    | —                                | **OK**; pack check (Q8)                                                  | The descriptions say which cable each fits.                                                                                                                                                                                        |
| 1554       | `Strut end cap`                                                                                        | —                                | **OK**                                                                   | Plastic cap for 1-5/8" channel.                                                                                                                                                                                                    |
| 1558       | `T-bar box hanger`                                                                                     | DV30                             | **OK**                                                                   | Sized to the 24" grid.                                                                                                                                                                                                             |
| 1559       | `T-grid fixture clip`                                                                                  | 5 starters (x4 each)             | **OK**; pack check (Q8)                                                  | Box of 100 from "clip".                                                                                                                                                                                                            |
| 1560       | `T-grid independent support clip`                                                                      | 6 starters                       | **OK**; pack check (Q8)                                                  | Box of 100 from "clip".                                                                                                                                                                                                            |

**Counts:** 26 OK, 22 need words, 1 owner pick — 49.

## Packs

**P1 — guessed packs on parts sold each.** The nine strut straps are a box
of 25 (from "strap"), `Strut channel nut` a box of 100 (from "nut") and
`Strut wing connector` a box of 25 (from "connector"). Platt sells strut
straps and spring nuts each ($2.41 for the 3/8" nut). Suggested: `each` / 1
(Q8).

**P2 — the rest of the guessed packs** (nuts, washers, MC straps, T-grid
clips, conduit clips) are plausible — those are sold in boxes — but the
count was guessed, not read. A reads each at the three stores in the pack
pass (Q8).

## Search words and descriptions (not names)

**S1 — "slotted solid" on every channel row.** Once Q1 names them
"slotted", "solid" points at a product the catalog does not have.
Suggested: drop it; a solid (no holes) channel is a new row if wanted.

**S2 — "pipe" on the strut straps.** Once Q2 names them EMT, "pipe" sends
a rigid-pipe search to an EMT strap. Suggested: drop it.

**S3 — "1/4-20" on the channel nut.** Suggested: drop it with Q3; a 1/4"
nut is a new row if wanted.

## Things that could price a bid wrong

**P1 — strut with no finish named.** Hot-dip strut costs about twice
pre-galvanized; PG16 and MS5 buy part of a stick.
**P2 — strut straps that don't fit.** An EMT strap does not close on rigid
conduit of the same trade size.
**P3 — a 12 ft temp pole post** priced where a 16 ft one is needed (PG20).

## Common items that are MISSING

Searched the whole catalog first: `Beam clamp, 3/8" rod`, `Conduit hanger
with bolt`, `Rod hanger clip` and `J-hook, 2"` exist on Fasteners &
Anchors.

| #   | Item                          | Source (owner's rule)                                                                                                                                                                      | Why it is needed                                                                                        | Search words                          |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| M1  | `3/8"-16 x 1" hex bolt, zinc` | **COMMON** — Home Depot, Everbilt 800820, 25-pack ([listing](https://www.homedepot.com/p/Everbilt-3-8-in-16-x-1-in-Zinc-Plated-Hex-Bolt-25-Pack-800820/204281551)); pack `pack of 25` / 25 | Every strut strap and fitting goes on with a channel nut AND a bolt; the shelf has the nut and no bolt. | "strut bolt", "hex cap screw", "hhcs" |

## Owner questions, with suggested answers

**Q1. Strut channel: add `12 ga, pre-galvanized, slotted` to all five?**
Suggested: **yes**, and drop "solid" from the search words (S1).
Pre-galvanized slotted is the common stick, and hot-dip costs about twice
as much.

**Q2. Strut straps: `{size} EMT strut strap`?**
Suggested: **yes**, and drop "pipe" (S2). An EMT strap does not fit
rigid conduit, and EMT is what these starters run.

**Q3. `Strut channel nut, 3/8"-16, with spring`?**
Suggested: **yes**, and drop "1/4-20" (S3). It's sold by thread, and
3/8"-16 is the one strut hardware uses.

**Q4. Strut fittings: `Strut 90° angle fitting, 2-hole`, `Strut flat plate fitting, 2-hole`, `Strut post base, single channel`, and the wing fitting's hole count from one listing A checks?**
Suggested: **yes**. Fittings are sold by shape and number of holes.

**Q5. Conduit clips: `1/2" EMT clip, rod/wire hanger` and `3/4" …`, and check `Rod hanger clip` (Fasteners & Anchors) is not the same part?**
Suggested: **yes**. Today the search words cover rod, wire and stud clips,
which are three parts. If `Rod hanger clip` is the same part, retire one
into the other in the Fasteners review.

**Q6. `Temporary pole, 6x6 x 16 ft treated post`?**
Suggested: **yes**. 16 ft leaves enough above grade once 3–4 ft is
buried; a 12 ft post is too short.

**Q7. `Threaded rod stiffener`: keep?**
Suggested: **keep, with "Seismic brace — clamps hanger rod to strut"**,
and price it by the source rule. If A does not find it at the three
stores, its price is blank with "Specialty - price from your supplier".
It's a real seismic part, but not a counter item.

**Q8. Packs: strut straps, the channel nut and the wing fitting `each`; nuts, washers, MC straps, T-grid clips and conduit clips as A reads them at the three stores?**
Suggested: **yes**, in the pack pass. Platt sells the straps and nuts
each, and the rest were guessed from words.

**Q9. Add M1, `3/8"-16 x 1" hex bolt, zinc`?**
Suggested: **yes**. It's COMMON at Home Depot (25-pack), and every strut
fitting needs a bolt with its channel nut.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row. Sizes stay first, so `shared/materialSizeOrder.ts`
  keeps sorting them.
- **Starter edits: none.** PG16, MS5 and PG20 follow their renamed rows by
  key.
- The pack changes go in the pack pass, before the owner types these
  prices.
- New-row prices follow `new-rows-source-check.md` (the source rule).
- Run `scripts/searchSpotCheck.mts` for "unistrut", "strut", "spring nut",
  "strut strap", "all thread", "caddy", "t bar clip", "temp pole" and
  "strut bolt".
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it.
