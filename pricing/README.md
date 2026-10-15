# pricing/ — the starter sheets

The spreadsheets the owner fills in to price the **shared starter** (what
every shop starts with), and the scripts that build and load them. Run by
Track A only; nothing here is wired into the app.

| File                           | What the owner types                    | Built by                 |
| ------------------------------ | --------------------------------------- | ------------------------ |
| `starter-catalog-pricing.xlsx` | Pack price (+ pack, if not the default) | `buildStarterSheets.mts` |
| `labor-units-starter.xlsx`     | MY HOURS, bend hours                    | `buildStarterSheets.mts` |
| `assembly-hours-starter.xlsx`  | MY HOURS per starter                    | `buildStarterSheets.mts` |
| `brand-variants-pricing.xlsx`  | Pack price per variant                  | `buildStarterSheets.mts` |

`loadStarterSheets.mts` reads filled sheets into `server/seed/**` (dry run
unless `--write`). Why the seed and never the app:
`references/starter-vs-company-plan.md`.

## STANDING RULE: a rebuild never loses a typed value

**Owner, 2026-10-08.** Any rebuild of `starter-catalog-pricing.xlsx`,
`labor-units-starter.xlsx` or `assembly-hours-starter.xlsx` (and
`brand-variants-pricing.xlsx`, which the same build rewrites) carries over
every typed price and hours value **by item key — not row position or
name**:

- **Renamed items keep their values.** The key for a material is its catalog
  identity: the old sheet's name followed through
  `RENAMED_BASELINE_MATERIALS`. For a starter assembly it is the Ref (DV34).
  The row number is never used.
- **New items come in blank.**
- **Removed items go in a "dropped values" report**,
  `pricing/dropped-values-<date>.tsv` — every value, with the old row and
  why. Read it before sending the sheets on.
- **The rebuild STOPS, writing nothing, if a typed value would be dropped
  for an item that still exists** — or for one it cannot place (a name that
  is neither shipped, renamed nor retired; a starter whose Ref changed; a
  unit that changed, so the number would mean something else; a starter now
  HELD; two old rows landing on one item with different values). Fix the
  cause — usually a missing rename entry — and run it again.

**What counts as typed on the prices sheet (2026-10-12):** "Pack price";
a number typed over the "Price per unit" formula on a pack of 1 (the owner's
first 54 prices were all typed there, and the reader used to see none of
them — on a bigger pack the rebuild STOPS rather than do arithmetic on it);
and a Notes cell containing **CUT** in capitals (the rest of Notes is the
catalog's description). A carried "per foot" pack of 1 takes the rebuilt
row's label ("per foot (from 250 ft roll)"); the price is untouched.

**How it is enforced, not just written down:** `buildStarterSheets.mts`
reads the file it is about to replace, plans the carry-over
(`sheetCarryOver.ts`), writes each new sheet under a temporary name, reads
THAT back and checks every carried value is in it, and only then replaces
the old file. `server/sheetCarryOver.test.ts` goes red if a typed value is
lost — including a value typed under any old spelling in the real rename map.

## Packs — written per row, never guessed (owner, 2026-10-14)

Every row's "Pack size" / "Pack qty" comes from
`server/seed/materials/starterPacks.ts`, by exact name, with where it came
from. A row with nothing written is `each` / 1 (a per-foot row keeps a
per-foot label at qty 1). A row whose pack a store check could not settle is
in `PACK_NOT_CHECKED` and says "PACK NOT CHECKED" in its Notes. The build
prints how many rows came from each. `server/starterPacks.test.ts` goes red
if a pack above one comes from anywhere but the table. Record of the pass:
`pricing/pack-pass-2026-10-14.md`.

## Building

exceljs is not a dependency of this repo; it is loaded through `NODE_PATH`
from a scratch install (`npm i exceljs` in any scratch folder):

```bash
NODE_PATH=<scratch>/node_modules npx tsx pricing/buildStarterSheets.mts
NODE_PATH=<scratch>/node_modules npx tsx pricing/buildStarterSheets.mts --only prices
NODE_PATH=<scratch>/node_modules npx tsx pricing/loadStarterSheets.mts --prices pricing/starter-catalog-pricing.xlsx
```

It prints, per sheet, how many rows it carried (and how many onto a renamed
row) and how many it dropped. **If the sheet the owner has is not the one in
the repo, put his copy at the path first** — the carry-over reads the file
being replaced, and a copy that is somewhere else is a copy it cannot see.
