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

**How it is enforced, not just written down:** `buildStarterSheets.mts`
reads the file it is about to replace, plans the carry-over
(`sheetCarryOver.ts`), writes each new sheet under a temporary name, reads
THAT back and checks every carried value is in it, and only then replaces
the old file. `server/sheetCarryOver.test.ts` goes red if a typed value is
lost — including a value typed under any old spelling in the real rename map.

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
