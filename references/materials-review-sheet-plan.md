# Materials review sheet — rename, keep, cut, missing. PLAN, 2026-10-06

**Status: plan only, waiting on the owner's yes to the LAYOUT below.**
Nothing is generated yet. Track A, at the owner's request ("start the
materials rename + keep/cut/missing review sheet for me to mark; names
freeze after I mark it").

## What is already decided — the sheet carries these out, it does not reopen them

From `materials-naming-and-pricing-plan.md` (on `a-materials-plan`) and
`owner-questions.md` § 1:

- **Wire and cable:** size and conductors, then type, then the metal spelled
  out at the END — "12/2 NM-B Copper", "#8 XHHW Aluminum". Old forms become
  search aliases. (Owner, 2026-10-01.)
- **Commodity items:** no brand, no metal suffix. **Brands on panels and
  breakers only** (CLAUDE.md § Brands).
- **Breakers say "1-Pole"** ("20A 1-Pole breaker"), breakers only; a
  single-pole SWITCH keeps its name (owner, 2026-10-05). Reverses CLAUDE.md
  § "Single-Pole — DONE 2026-09-24"; that section, ASSEMBLIES_PLAN.md step 6
  and the test change in the rename commit.
- **A rename is never a text edit:** it goes through
  `RENAMED_BASELINE_MATERIALS` (same row id, old name still found). **A cut is
  never a delete:** it goes through `RETIRED_BASELINE_MATERIALS` (hidden from
  every picker, still resolves on bids already priced from it).

## Still open, and asked ON the sheet (they change names, so they belong in the same pass)

Naming plan § 8, questions 2–5 — queued, never asked. The sheet's
**Questions** tab asks each with a dropdown and a recommended answer, so one
marking session settles every name:

| #   | Question                                                                                                         | Recommended |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| 2   | SER: keep the full conductor set in the description + alias, and a test that no two SER rows share size + metal? | Yes         |
| 2d  | "3/4 MC cable Copper" (a #3 four-wire) reads like 3/4 inch — write it "#3/4"?                                    | Yes, "#3/4" |
| 3   | A bid line priced from an example price SAYS so on the bid and the quote until you change that material's price? | Yes         |
| 4   | Add "Copper" to low-voltage cable names (not fiber; CCA rows only if wanted)?                                    | Yes         |
| 5   | Hide the supplier-import button until its review screen (with undo) exists?                                      | Yes         |

## The workbook — five tabs

`pricing/materials-review.xlsx`, written the way the other two pricing
workbooks are (`pricing/writeWorkbook.cjs`; exceljs stays out of
`package.json`). Frozen header row, filters on, the Decision column a
dropdown, the column you mark is the ONLY yellow one.

### Tab 1 — Read me

How to mark, in six lines; what "freeze" means; what happens to a cut row
(hidden, never deleted; old bids keep it). Counts per tab.

### Tab 2 — Review: one row per material (≈1,554 shipped + 125 new)

Sorted the way the app sorts: category, then type, then size, with
`shared/materialSizeOrder.ts` — so #14 comes before #12 and 4/0 after 1/0.

| #   | Category                  | Type       | Current name                     | Proposed name                       | Why                   | Used by                  | Status                       | **Decision**  | **Your name** | Note     |
| --- | ------------------------- | ---------- | -------------------------------- | ----------------------------------- | --------------------- | ------------------------ | ---------------------------- | ------------- | ------------- | -------- |
| 1   | Wire & Cable              | THHN       | #14 THHN                         | #14 THHN Copper                     | metal at end          | 2 starters, 1 run type   | Shipped                      | Keep proposed |               |          |
| 2   | Wire & Cable              | THHN       | #12 THHN                         | #12 THHN Copper                     | metal at end          | 31 starters, 2 run types | Shipped                      | Keep proposed |               |          |
| 3   | Wire & Cable              | XHHW       | #8 XHHW AL                       | #8 XHHW Aluminum                    | metal spelled out     | —                        | Shipped                      | Keep proposed |               |          |
| 4   | Wire & Cable              | NM-B       | 12-2 NM-B                        | 12/2 NM-B Copper                    | slash + metal         | 18 starters, 1 run type  | Shipped                      | Keep proposed |               |          |
| 5   | Wire & Cable              | MC cable   | 3-4 MC cable                     | 3/4 MC cable Copper — or #3/4 (Q2d) | slash + metal         | —                        | Shipped                      | **Your call** |               | asks Q2d |
| 6   | Breakers                  | 1-Pole     | 20A Single-Pole breaker          | 20A 1-Pole breaker                  | 1-Pole (owner)        | 40 starters              | Shipped                      | Keep proposed |               |          |
| 7   | Switches                  | Switch     | Single-pole switch               | _(unchanged)_                       | switch keeps its name | 22 starters              | Shipped                      | Keep          |               |          |
| 8   | Equipment & Appliances    | MC whip    | 6ft MC whip                      | 6 ft MC whip                        | size + space          | —                        | Shipped                      | Keep proposed |               |          |
| 9   | Connectors & Terminations | Crimp lug  | 400 kcmil crimp lug, single size | _(unchanged)_                       | —                     | —                        | Shipped                      | Keep          |               |          |
| 10  | Lighting Hardware         | Light pole | 20 ft light pole                 | _(unchanged)_                       | —                     | 0                        | Shipped                      | Keep          |               |          |
| 11  | Surface Raceway           | Raceway    | —                                | Raceway coupling                    | new row               | (DV34 family)            | **New — not in catalog yet** | Add           |               |          |
| 12  | Conduit                   | EMT        | —                                | 3-1/2" EMT                          | new size              | —                        | **New — not in catalog yet** | Add           |               |          |

_(Illustrative: every name is real — rows 1–8 are current/proposed pairs
from the naming plan's audit, 9–10 are catalog rows, 11–12 are waiting in
`pricing/rows.json`. The "Used by" counts in this mockup are PLACEHOLDERS;
the generator counts them from the seed.)_

- **Proposed name** is generated by ONE function — the same one the rename
  commit will use — so what is approved is exactly what ships.
  _(unchanged)_ means the rule leaves it alone.
- **Why** names the rule that changed it, so a surprising proposal can be
  traced to the rule rather than argued row by row.
- **Used by** = shipped starter assemblies and run types that use the row
  (from the seed). A cut on a row with users is still allowed, but the
  read-back says what it does to them (below).
- **Decision** (dropdown): **Keep proposed** (pre-filled where a rule
  applies) · **Keep** (current name stays) · **Rename** (type it in "Your
  name") · **Cut** · **Add** (new rows only) · **Your call** (pre-filled
  only where an open question decides it).

### Tab 3 — Missing: what the catalog does not have

Four sources, each labelled, plus blank rows to add your own:

| Source        | What                                                                                                   | Count today               |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------- |
| Pricing sheet | rows written for pricing, not in the catalog (now placeable: 0117's three categories exist)            | 125 generic               |
| Starters      | parts a starter assembly needs that the catalog lacks                                                  | 1 (DV34: surface raceway) |
| Size gaps     | a family missing a size its neighbours have, by the size table (e.g. EMT has 3" and 4" but not 3-1/2") | generated                 |
| Your rows     | blank, Decision = Add                                                                                  | —                         |

Brand variants (519) are NOT on this sheet: they wait for parent/brand
(0119–0121) and are their own pass, after names freeze.

### Tab 4 — Questions: Q2–Q5 above, one dropdown each.

### Tab 5 — Counts, recomputed by formula as you mark

Kept / renamed / cut / added per category, and two warnings in red: **two
rows with the same final name**, and **a cut row a starter still uses**.

## Reading it back — `pricing/readMaterialsReview.mts`

Writes NOTHING to the catalog. It checks the marked sheet and produces the
frozen list the rename commit consumes, or refuses with one line per
problem and its sheet row:

- unknown Decision, Rename with no name, Add with no category;
- **two rows ending with the same name** (would merge two products);
- a final name the **size parser cannot read** (`readSize`) where its
  family has a size — so it would sort and group wrong;
- **a Cut on a row a starter or run type uses**: refused unless the Note
  names the row that replaces it in those recipes;
- any Q2–Q5 left blank.

Output: `pricing/frozen-names.json` (current id/name → final name, cut,
add) and a summary. **The names are frozen when that file is committed.**
From then, a seed name may change only through a rename-map entry, which a
test already enforces for baseline rows.

## Then the rename itself — naming plan § 2 and § 7, unchanged

Parser first (slash sizes read, both forms), then ONE commit: seed names,
`RENAMED_BASELINE_MATERIALS`, `RETIRED_BASELINE_MATERIALS` for cuts, aliases
for every old spelling, starter assemblies (they name parts by exact name),
run types, CLAUDE.md + ASSEMBLIES_PLAN.md step 6 + the pole test. Stop
`pnpm dev` first (CLAUDE.md: a restart between two seed edits made nine
duplicate rows once). The naming plan assigns the catalog edit to Track C.

## Order

1. **Owner OKs this layout** (or changes it). ← here
2. A: the generator (`pricing/buildMaterialsReview.mts`), sheet to owner.
3. Owner marks it (Review + Missing + Questions).
4. A: read-back, `frozen-names.json`, names frozen.
5. Parser change, then the rename commit (C, or A if asked).
6. Regenerate the pricing sheet with the final names, carrying typed prices
   over (naming plan § 5.1), and pricing can start.
