# SER / SEU rename — 2026-10-12 (owner-approved change to the frozen names)

**Rule (owner):** name each cable the way supply houses list it.

- **Copper SER: the short form** — "6/3 SER Copper".
- **Aluminum SER: the full set** — "2-2-2-4 SER Aluminum".
- **SEU: the full set** — "4-4-6 SEU Aluminum".
- **Description:** SER = "3 wire + ground (full set)."; SEU = "2 wire + bare
  neutral (full set)." It comes first; an existing note (the 200A feeder, the
  aluminum pricing note) follows it.
- **Search words:** every row keeps BOTH styles plus its old name.

**This overrides** the full-set-only rule for SER (owner 2026-09-25,
re-confirmed 2026-10-07; `server/seed/materials/wireAndCable.ts` keeps both
paragraphs as history), **for copper only**. It also partly overrides the
2026-10-09 reality check, which took "8/3"-style words off the copper SER rows
so that "8/3" finds NM-B and MC first. The short form is now those rows' NAME.
Measured after the change: "6/3" and "8/3" still list NM-B and MC first and
SER third (`scripts/searchSpotCheck.mts`).

## Old → new

Only the five copper rows change name. Each is renamed IN PLACE (same id)
through `shared/serRename20261012.ts`, which `latestCatalogName` follows last,
so every older spelling points straight at the new name with no chain.

| Old name (also every older spelling)                     | New name           |
| -------------------------------------------------------- | ------------------ |
| 8-8-8-8 SER Copper (8-8-8-8 SER CU, 8-3 SER CU / copper) | **8/3 SER Copper** |
| 6-6-6-6 SER Copper (6-6-6-6 SER CU, 6-3 SER CU / copper) | **6/3 SER Copper** |
| 4-4-4-6 SER Copper (4-4-4-6 SER CU, 4-3 SER CU / copper) | **4/3 SER Copper** |
| 2-2-2-4 SER Copper (2-2-2-4 SER CU, 2-3 SER CU / copper) | **2/3 SER Copper** |
| 1-1-1-3 SER Copper (1-1-1-3 SER CU, 1-3 SER CU / copper) | **1/3 SER Copper** |

Unchanged names (description and search words only):

| Row                          | Description starts    | Short form added |
| ---------------------------- | --------------------- | ---------------- |
| 4-4-4-6 SER Aluminum         | 3 wire + ground       | 4-3              |
| 2-2-2-4 SER Aluminum         | 3 wire + ground       | 2-3              |
| 1/0-1/0-1/0-2 SER Aluminum   | 3 wire + ground       | (had 1/0-3)      |
| 2/0-2/0-2/0-1 SER Aluminum   | 3 wire + ground       | (had 2/0-3)      |
| 3/0-3/0-3/0-1/0 SER Aluminum | 3 wire + ground       | (had 3/0-3)      |
| 4/0-4/0-4/0-2/0 SER Aluminum | 3 wire + ground       | (had 4/0-3)      |
| 250-250-250-3/0 SER Aluminum | 3 wire + ground       | 250-3            |
| 4/0-4/0-2/0 SEU Aluminum     | 2 wire + bare neutral | 4/0-2            |
| 4-4-6 SEU Aluminum           | 2 wire + bare neutral | 4-2              |
| 2-2-4 SEU Aluminum           | 2 wire + bare neutral | 2-2              |

**Short forms on the aluminum and SEU rows are the DASH style only** ("4-3",
not "4/3"): the slash form is the name of a copper SER, NM-B and MC row, and
adding it would undo what the reality check measured.

## What was checked for name matches (none break)

- **Starter assemblies** name parts by key (`server/seed/starterParts.ts`):
  only `4/0-4/0-4/0-2/0 SER Aluminum`, unchanged. No starter names a copper SER.
- **Run types** (`server/seed/baselineRunTypes.ts`): none name an SER/SEU row.
- **Tests that named a copper SER:** `server/materialsCatalog.test.ts` (rewritten
  to pin the new rule: copper short form, aluminum/SEU full set, the
  descriptions, both styles findable) and `server/sizeReadingNewNames.test.ts`
  (adds the short-form type and order). The frozen-name record
  (`pricing/frozen-names.json`, `shared/frozenMaterialNames.ts`) is history and
  is followed through `latestCatalogName`, not edited.
- **Pricing tools:** `pricing/buildLaborSheet.mts` updated. The supplier
  fixtures (`server/fixtures/supplyHouse*.csv`) still say "8-8-8-8 SER CU" on
  purpose: that is what a supplier sends, and the import follows the map
  (`server/supplierPricing.test.ts` green).
- Green: materialsCatalog, frozenMaterialNames, sizeReadingNewNames,
  seedNameCase, materialNaming, coverageCheckRows/Starters, materialSearchRank,
  materialSearchSizes, materialSizeOrder, mcCableFittings, starterCoverRepair,
  supplierPricing, tradeSizeQuery.

## On a database

The next server start renames the five shared rows in place and rewrites the
SER/SEU descriptions and search words (shared rows only; a company's own copy
is never touched). No migration. Bid lines keep the name they froze.
