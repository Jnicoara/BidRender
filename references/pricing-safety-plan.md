# Pricing safety — prices in the wrong unit (plan, Track C, 2026-10-12)

**PLAN ONLY.** No code, no migration, nothing merged. It covers the three
`todo.md` items under "Before beta: wrong numbers on bids — prices typed or
imported in the wrong unit" (owner, 2026-10-12):

1. In-app price entry like the pricing sheet: **pack price + pack qty**, and
   the app works out the per-unit price.
2. The supplier CSV import understands **per M (1,000) and per C (100)**,
   converts, and shows a **preview with per-unit prices** before saving, with
   **undo**.
3. A **sanity warning** when a price looks like a roll or per-M price.

**Why this is before beta.** A pack price stored as a per-unit price does
not look broken. #12 THHN at $480/ft prices a 500 ft homerun at $240,000,
in the same font as a real number. CLAUDE.md § "A layout or copy change…":
the failures worth catching here do not look like breakage.

## 0. Decisions this plan builds on (cited, not re-opened)

| Decision                                                                                                                                                                                                   | Where                                                               | What it means here                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D3** — price bands read the PACK price (the roll, the stick, the box), never the per-foot price. `materials` has no pack size; Piece 2 adds one.                                                         | `references/material-markup.md` D3                                  | **One pack column serves price entry, bands and the purchase list.** Never two.                                                                                |
| Pack sizes needed later; "the purchase list and the price bands should read the same column"; additive, NULL = "sold singly / not known"; seeded through `backfillMaterialMetadata`, a fork keeps its own. | `references/migrations-0098-batch-plan.md` § 12                     | Agreed in full. This plan is where that column gets written down.                                                                                              |
| The import writes INTO a supplier's list, previews first (`apply: false\|true`, the `importLaborSheet` shape), keeps the replaced price for undo, asks the as-of date once.                                | `references/multi-supplier-plan.md` § 4.4                           | Agreed. § 3 below builds the preview and undo **before** the supplier tables exist, on a log table those tables later reuse (§ 3.5 — this amends § 6 there).   |
| "The import does not convert: the preview flags a price more than 5x away … the user fixes the row." Typed prices are per the unit shown.                                                                  | `references/multi-supplier-plan.md` § 4.5                           | **Overridden for per M and per C** (owner, 2026-10-12): a stated per M / per C is converted. The 5x flag stays, for everything the file does not state. § 3.2. |
| Example prices: a shop's edit of a shipped price clears "Example price"; a supplier price is never an example.                                                                                             | CLAUDE.md § "Where a priced catalog lands"; `shared/exampleTags.ts` | A pack-price entry IS an edit of the price, so it clears the tag the same way.                                                                                 |
| Shipped prices come from the seed files, never typed onto a baseline row.                                                                                                                                  | CLAUDE.md § "Where a priced catalog lands"                          | A shipped pack size is a seed field too. Never typed onto a baseline row.                                                                                      |
| The pricing sheet types wire and cable **per foot, pack qty 1**, with a label naming the pack it was figured from ("per foot (from 250 ft roll)"); conduit is a 10 ft stick, pack qty 10.                  | `pricing/starterSheetLayout.ts` `packFor` (owner, 2026-10-12)       | How the SHEET is typed, not what the roll is. § 1.3 and Q2 below.                                                                                              |
| Standing rules: every new option has a safe default under ONE "More options"; every warning has a fix-it button right there; a little high beats low; unset is "Not priced", never $0; manual first.       | `references/quick-bid-plan.md` "Standing rules"; CLAUDE.md          | Applied throughout; § 5 checks each one.                                                                                                                       |

## 1. What exists today (measured 2026-10-12)

**Searched**: `drizzle/schema.ts`, `shared/priceListParse.ts`,
`server/routers/materialsRouter.ts`, `client/src/pages/Material*Page.tsx`,
`references/*.md`, `todo.md`, `pricing/*` — for `pack`, `packQty`,
`packPrice`, `per M`, `UOM`, `unitOfSale`, `costPerUnit`, `importPrices`,
`reprice`, `refresh`.

### 1.1 The live fault is worse than the todo says: the parser DROPS "per M"

`shared/priceListParse.ts:243-246` — `UNIT_SUFFIX` strips
`/ea /ft /c /m /box /pk /roll …` off a price cell **and keeps the number**.
So `$480.00/M` imports as **$480 per foot**, and `$12.50/C` on wire nuts as
**$12.50 each**. A `UOM` column ("E", "C", "M") is ignored altogether: the
header reader picks only the name and price columns (`readHeader`, line 354).

**And a test pins the bug:** `server/priceListParse.test.ts:202`
`expect(parseMoney("$3.00 per M")).toBe(3)`. Same shape as the
`pdfRangeLoading` test that "pinned the bug" (CLAUDE.md § Large plan sets).
That line changes meaning in this work, on purpose, and the commit says so.

### 1.2 The rest

- `materials.costPerUnit decimal(10,4) NOT NULL DEFAULT 0`, per
  `unitOfSale` (`each | foot | box`). **No pack size, no pack price.**
- `importPrices` (`materialsRouter.ts:579`) writes `costPerUnit`,
  `supplierName`, `priceUpdatedAt`, `isExamplePrice: false` **row by row as
  it goes**. No preview, no undo. The button is still shown on Supplier
  pricing (`MaterialDatabasePage.tsx:176`), though the owner's review-sheet
  Q5 answered "hide it until its review screen with undo exists" — Yes
  (`materials-review-sheet-plan.md:131`).
- Typed prices: Materials editor (`MaterialsLibraryPage.tsx` draft +
  Save, and the new-material form), Supplier pricing's `InlineNumberField`
  (`MaterialDatabasePage.tsx:356`), and per-line prices on a bid
  (`HandPricedLineFields`, `FixLinePanel`, `BuildFromPartsPanel`). Each
  takes a per-unit number with the unit shown beside it, nothing else.
- **No per-line "use the library's current price" action exists.** Searched
  `server/routers/*.ts` for refresh/reprice/updateLinePrice: only
  `bids.reapplyMarkupRules` (bidsRouter.ts:2146). This matters for the
  bid-screen fix-it (§ 4.4, Q9).

### 1.3 The sheet and the roll are two different facts

The owner's sheet now types wire per foot with **Pack qty 1** and a label
"per foot (from 250 ft roll)". D3's bands need the **real** pack (250 ft),
or wire at $0.40/ft lands in the under-$1 band at 75%. So the app stores the
**real pack** and lets the price be typed either way (§ 2.1). The sheet's
"Pack qty 1" means "this price is per foot", which § 2.4 maps without
changing the sheet.

## 2. Item 1 — pack price + pack qty in the app

### 2.1 What the person sees

The price box in the Materials editor and on Supplier pricing becomes a
pair, **only when the material has a pack size**:

```
Price   [ 0.4800 ] per foot     or   [ 120.00 ] per 250 ft roll
```

- Type in either box; the other one fills in. Whichever was typed last is
  what is kept (§ 2.2), so what you typed is what you see next time —
  never a re-derived $119.99.
- No pack size (NULL) → the single box it is today. Nothing changes for
  someone who never sets one.
- **Pack size lives under "More options"** in the material editor
  (`Pack: [ 250 ] feet, called [ roll ]`). Default: the shipped pack for
  shipped rows, NULL for the user's own. A shop that buys 500 ft spools
  edits it, which forks the row like any edit.
- Bid-line hand prices (`HandPricedLineFields` etc.) stay per unit — a
  line has no pack — but get the § 4 warning, whose fix-it does the
  division.

### 2.2 What is stored — one writer, two columns

- `materials.packQty decimal(10,4) NULL` — how many `unitOfSale` units are
  in the pack. NULL = sold singly / not known, read as 1.
- `materials.packLabel varchar(32) NULL` — the word on screen: roll, spool,
  stick, box. NULL = "pack".
- `materials.packPrice decimal(12,4) NULL` — the pack price **as typed**.
  NULL = the price was typed per unit. **Only ever written together with
  `costPerUnit`.**

`costPerUnit` stays the number every total reads. **Nothing that prices a
bid changes.** When a pack price is typed:
`costPerUnit = roundUp4(packPrice / packQty)` — rounded UP at the fourth
decimal, so a $99.99 roll of 250 stores $0.4000/ft, never $0.3999 (a little
high beats low; worst case under 1¢ per 100 ft).

**Forcing function, not a reminder** (CLAUDE.md § "Prefer a forcing
function"): one function in `shared/packPricing.ts`,
`priceWrite({ typed: "unit" | "pack", amount, packQty })` →
`{ costPerUnit, packPrice }`, and `db.updateMaterial`'s patch type takes
`costPerUnit` **only as that pair** (a union, like `InlineNumberField`), so a
caller that writes a per-unit price without saying what happens to
`packPrice` does not compile. A per-unit write sets `packPrice` NULL; that
is how a stale pack price can never sit beside a new per-unit one. Tested
in `client/src/lib`-reachable code (`shared/`), red if the rounding goes
down or a unit write leaves `packPrice` set.

Changing `packQty` later, with a `packPrice` stored, keeps the pack price
and re-divides (the pack price is what the person typed). Shown as a
one-line notice with "Keep $0.48/ft instead" as its fix-it.

### 2.3 Who else reads it

- **Price bands (D3, Piece 2):** band key = `packPrice ??
costPerUnit × (packQty ?? 1)`. `resolvePartMarkup` already takes a
  `packPrice` that is always null today (`bid-methods-plan.md` Q8: brackets
  key on unit price until pack prices exist, switched later **as a math
  version**). This plan does not flip that switch; it gives Piece 2 the
  column.
- **Purchase list** (`shared/materialsList.ts` `orderQty`): whole packs
  from the same `packQty` (`migrations-0098-batch-plan.md` § 12). Later,
  separate work.
- **Multi-supplier** (§ 4.2 there): per-supplier packs are not planned.
  A supplier price is stored per unit; the pack only converts on the way in.

### 2.4 Seed and sheet

- Shipped `packQty`/`packLabel` are seed fields (`server/seed/materials/*`),
  re-stamped by `backfillMaterialMetadata` on baseline rows only. A fork
  keeps its own (`isNull(materials.userId)` — the same one `WHERE` that
  protects prices, `seedPreservesUserPrices.test.ts` extended to cover it).
- **Shipped `packPrice` stays NULL.** The sheet's price is loaded per unit
  (`loadStarterSheets.mts` already divides Pack price by Pack qty). Showing
  the roll price on a shipped row is the derived `costPerUnit × packQty`,
  labelled, not a stored second number.
- The real pack for wire comes from `packFor`'s label ("from 250 ft roll" →
  250), not from the sheet's "Pack qty 1". See Q2.

## 3. Item 2 — the import: per M, per C, preview, undo

### 3.1 Reading the unit (fixes § 1.1)

`parseMoney` stops discarding the unit. A new `parsePrice(text)` returns
`{ amount, per: 1 | 100 | 1000 | "pack" | null }`, where `null` = the cell
said nothing. Sources, in order:

1. **A UOM / price-unit column**, if the header has one (`UOM`, `U/M`,
   `Per`, `Price unit`, `Unit`): `E`/`EA` = 1, `C` = 100, `M` = 1,000,
   `FT`/`LF` = 1, `RL`/`ROLL`/`BX`/`BOX`/`PK`/`SPL` = "pack". This is the
   distributor convention (E / C / M) on Platt-, Graybar- and Rexel-style
   exports. **Needs one real export to confirm** — Q4 (approved: the owner
   is getting one from his Platt rep).
2. **A suffix on the price cell**: `/M`, `per M`, `/1000`, `/MFT` = 1,000;
   `/C`, `per C`, `/100`, `/CFT` = 100; `/ea`, `/ft` = 1; `/roll`, `/box`,
   `/pk`, `/spool` = "pack".
3. Nothing stated = per unit, **as today**, and the § 4 check runs on it.

`parseMoney` keeps its signature for its other callers but is reimplemented
on `parsePrice` and **refuses** (null) a cell whose unit is M, C or pack, so
no path can keep the old drop-the-unit behaviour by accident. The pinned
test at `priceListParse.test.ts:202` is rewritten to assert the conversion.

**Conversion:** per M → ÷1,000, per C → ÷100, "pack" → ÷ the material's
`packQty` (no pack size → the row cannot be converted; it is listed under
"Needs a unit" with fix-its, § 3.3). Result rounded UP at the fourth decimal
(§ 2.2).

### 3.2 This overrides multi-supplier § 4.5 for stated units only

§ 4.5 said "the import does not convert". The owner's 2026-10-12 item says
it converts per M and per C. **Overridden for units the file STATES**; for
anything unstated the 5x flag stays exactly as § 4.5 wrote it. The note
saying so is added to § 4.5 in the same commit as this plan.

### 3.3 The preview — nothing saved until Apply

`importPrices({ …, apply: false })` returns the plan; `apply: true` plans
again from the same text and writes exactly that plan. **One function
plans both** (`shared/priceImportPlan.ts`), so the preview cannot promise
one thing and Apply do another — the `importLaborSheet` shape. Apply also
sends a fingerprint of the previewed plan; if the library moved in between,
Apply refuses with "Prices changed since the preview — Preview again"
(that button is the fix-it).

The preview is a list, worst first:

| Group                  | Shows per row                                                                            | Fix-it buttons on the row                                                                         | Applied by default?                     |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Looks off** (§ 4)    | file text ("$480.00"), read as, per-unit result, your current price, "×1,000 your price" | "It's per M → $0.48/ft" · "It's per roll of 250 → $1.92/ft" · "Keep $480.00/ft" · "Skip this row" | Q6 (recommend: **skipped** until a tap) |
| **Needs a unit**       | "$118.00 /roll" on a material with no pack size                                          | "Roll = [250] ft" (sets the pack too, under the row) · "It's per foot" · "Skip"                   | No — cannot be computed                 |
| **Will change**        | `$480.00 per M → $0.4800/ft` (was $0.4400, +9%)                                          | "Skip this row"                                                                                   | Yes                                     |
| **Renamed** (old name) | as above, plus "matched 20A breaker → 20A 1-Pole breaker"                                | "Skip"                                                                                            | Yes                                     |
| **Unchanged**          | collapsed count                                                                          | —                                                                                                 | nothing to write                        |
| **Not matched**        | name only                                                                                | (none today; `never creates` stays)                                                               | —                                       |

The Apply button names the outcome: **"Apply 1,204 prices — 3 skipped"**.
The as-of date and the supplier name are asked once at the top (multi-
supplier § 4.4).

### 3.4 Undo

"Undo this import" on the result screen and on Supplier pricing's last
import line (Q7: last import only, or any import in 30 days — recommend the
last one per supplier).

- Each written row keeps what it replaced: cost, pack price, supplier name,
  `priceUpdatedAt`, `isExamplePrice`, and whether the import made the fork.
- **Undo restores only rows still holding what the import wrote.** A row
  edited since is left alone and listed ("3 prices changed since the import
  — left as they are"). Never overwrites a later hand edit.
- A fork the import created is NOT deleted (lines may already point at it);
  its price fields are restored to what the shipped row had, `isExamplePrice`
  included. Same number on every bid, no orphan.
- Bid lines keep their frozen snapshots either way — undo, like the import,
  never touches a line (CLAUDE.md § "Never mutate a snapshot field").

### 3.5 One import log, reused by multi-supplier

Undo needs a log now, and multi-supplier § 6 plans `supplier_price_imports`
for the same job. **Two undo logs would be two ways to disagree**, so this
plan writes the log once, named for what it is, and multi-supplier adds a
nullable `supplierId` and points `supplier_prices.importId` at it instead of
creating its own (§ 6 there gets a line saying so). Until then the import
still writes `costPerUnit` as today, behind the preview.

## 4. Item 3 — the sanity warning

### 4.1 The rule (one function, `shared/priceSanity.ts`)

`priceLooksOff({ unitCost, unitOfSale, packQty, reference })` →
`null | { kind, ratio, suggestions[] }`.

`reference` is, first found: the item's **previous price** (the shop's own,
non-zero); else the **shipped example price** for the same item
(`materialItemKey`); else nothing — and with nothing to compare against,
**no warning** (said in the code, not implied).

It fires when the new price is more than **T×** the reference in either
direction (T = 5 to start, per § 4.5 — **not measured**, see 4.3). Low is
checked too: a per-foot price typed into a per-roll box is the one that
loses the job money. When the ratio lands near a known divisor it names it:

- ≈1,000 → "looks like a price per 1,000 ft (per M)" → fix-it **÷1,000**
- ≈100 → "looks like a price per 100 (per C)" → fix-it **÷100**
- ≈`packQty` → "looks like the price of a 250 ft roll" → fix-it **÷250**
- ≈1/`packQty` → "looks like a per-foot price for a roll" → fix-it **×250**
- otherwise → "is 12× your last price" → fix-its "Put back $0.44" and
  "It's right"

"Near" = within 30% of the divisor (also unmeasured). **Every** warning
carries "It's right — keep it", which dismisses it for that price on that
material (stored on the row as the price it was accepted at, so a later
different price is checked again).

### 4.2 Where it shows — warns, never blocks, never changes the price itself

| Place                                              | When                                                | Fix-it does                                                 |
| -------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Materials editor, under the price                  | on Save (already saved)                             | rewrites the price through `priceWrite`; normal green flash |
| Supplier pricing inline field                      | after the commit                                    | same                                                        |
| Import preview                                     | § 3.3 "Looks off"                                   | per row                                                     |
| Hand-priced bid line / Fix line / Build from parts | after the commit                                    | rewrites THAT line's typed price                            |
| Materials screen filter "Prices that look off"     | under its existing filters' "More options"          | opens the editor on the row                                 |
| A Draft bid's attention strip                      | a line priced from a material whose price looks off | Q9                                                          |

Escape still reverts; a warning does not keep a bad draft on screen
(CLAUDE.md § Editing fields 3).

### 4.3 Measure T before shipping it

CLAUDE.md § "A number that can be measured should not be asserted". Before
the threshold is fixed, run `priceLooksOff` over (a) the owner's priced
starter sheet against the previous example prices, and (b) one real
supplier export against the sheet, and report: false alarms at T = 3, 5, 10,
and whether every planted ×1,000 / ×100 / ×pack row fires. Pick the T with
zero false alarms on (a) that catches every planted row, and write the
measurement beside the constant (the `shared/takeoffMarks.ts` pattern). If
no T does both, say so and ask, rather than shipping a guess.

## 5. Standing rules — checked

- **Safe defaults under "More options":** pack size is under the editor's
  "More options"; NULL = today's single box. The import's new groups only
  appear when they have rows. A shop that never sets a pack sees one new
  thing: the warning, when a price is 5× off.
- **Every warning has a fix-it:** every row in § 4.1 / § 3.3 names its
  buttons; "It's right" is always one of them.
- **A little high beats low:** conversions round up at the fourth decimal;
  the warning checks low as hard as high; an unconvertible import row is
  never saved as the raw number.
- **Unset is "Not priced", never $0:** an import row with no readable price
  is skipped, never written as 0. A NULL `packQty` is "not known", read as
  1, never 0.
- **Manual first:** pack entry, the warning and its fix-its all work with no
  import, no supplier and no library beyond the row being priced.
- **No bid moves:** `costPerUnit` keeps its meaning; snapshots untouched;
  bands keep keying on unit price until Piece 2 switches them as a math
  version (bid-methods Q8).

## 6. SQL drafts for Track A — all ADDITIVE, step 1, step 3 empty

> **Built by Track A 2026-10-14 as 0157–0162** (PS-M1..M6 in order), with
> PH-M1 (`price-history-plan.md` § 6) as **0163**. Local + local test DB
> only; not on staging or live. Starter kinds: `packQty`/`packLabel` OFFER,
> `packPrice`/`priceCheckAcceptedAt` not-editable (A's call — C to confirm
> before step 6). `price_import_rows.materialId` registered EXEMPT ("the row
> itself"). See `track-a-handoff.md` session 41.

Nullable, no default, no `UPDATE`; nothing reads them until C's code ships,
so each can go first. Numbered by A at write time; one table or column per file;
house collation and `decimal(12,4)` money (multi-supplier § 6).

```sql
-- PS-M1: the real pack, in unitOfSale units. NULL = sold singly / not known (read as 1).
-- One column for price entry, price bands (material-markup D3) and the purchase list (0098 § 12).
ALTER TABLE `materials` ADD `packQty` decimal(10,4) NULL;
```

```sql
-- PS-M2: what the pack is called on screen (roll, spool, stick, box). NULL = "pack".
ALTER TABLE `materials` ADD `packLabel` varchar(32) NULL;
```

```sql
-- PS-M3: the pack price AS TYPED. NULL = the price was typed per unit.
-- Only ever written with costPerUnit, by shared/packPricing.ts priceWrite.
ALTER TABLE `materials` ADD `packPrice` decimal(12,4) NULL;
```

```sql
-- PS-M4: "It's right — keep it" on the sanity warning: the price it was accepted at.
-- NULL = never dismissed. A different price is checked again.
ALTER TABLE `materials` ADD `priceCheckAcceptedAt` decimal(10,4) NULL;
```

```sql
-- PS-M5: one row per price import, for undo. Multi-supplier later ADDS a nullable
-- supplierId here instead of creating supplier_price_imports (multi-supplier § 6).
CREATE TABLE `price_imports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `supplierName` varchar(128) NULL,
  `fileName` varchar(255) NULL,
  `priceAsOf` date NOT NULL,
  `rowsChanged` int NOT NULL,
  `undoneAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `price_imports_id` PRIMARY KEY(`id`),
  CONSTRAINT `price_imports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `price_imports_userId_idx` ON `price_imports` (`userId`);
```

```sql
-- PS-M6: what each imported row replaced. madeFork = the import created the company's copy.
-- written* = what the import wrote, so undo only restores rows nobody has edited since.
CREATE TABLE `price_import_rows` (
  `id` int AUTO_INCREMENT NOT NULL,
  `importId` int NOT NULL,
  `materialId` int NOT NULL,
  `replacedCostPerUnit` decimal(10,4) NOT NULL,
  `replacedPackPrice` decimal(12,4) NULL,
  `replacedSupplierName` varchar(128) NULL,
  `replacedPriceUpdatedAt` timestamp NULL,
  `replacedIsExamplePrice` boolean NULL,
  `writtenCostPerUnit` decimal(10,4) NOT NULL,
  `madeFork` boolean NOT NULL,
  CONSTRAINT `price_import_rows_id` PRIMARY KEY(`id`),
  CONSTRAINT `price_import_rows_importId_price_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `price_imports`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `price_import_rows_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `price_import_rows_importId_idx` ON `price_import_rows` (`importId`);
```

**For A to check:** `price_import_rows.materialId` is an FK into
`materials`, a forkable table, so `server/forkableReferences.test.ts` will
want it declared. It always names the company's own row (the fork the
import wrote), so its resolver is "the row itself", not `materialItemKey`.
NOT NULL on the new tables' required columns: a row exists only to hold
these values; there is no "not yet" state (multi-supplier § 6's argument).

> **Queued after PS-M6 (Track C, 2026-10-14): PH-M1, `material_price_history`**
> (`references/price-history-plan.md` § 6). It points at `price_imports` and
> records the pack columns, so it comes after these. `priceWrite` and the
> history's `priceWhy` travel in one argument to `db.updateMaterial`.

## 7. Build order for C (once A's columns exist)

> **Step 1 BUILT 2026-10-14 (overnight, Track C, on track-c):**
> `shared/packPricing.ts` (`priceWrite`, round-up, `packPriceShown`) and the
> door in `server/db.ts` — `updateMaterial` / `createMaterial` take a price
> only as a `PricedWrite` (`costPerUnit?: never`, so a conditional spread is
> caught too). Built together with price-history recording (that plan § 8
> step 1), as § 6's note said they would travel. `server/packPricing.test.ts`
> shown red on nearest-rounding.

1. `shared/packPricing.ts` (`priceWrite`, round-up) + the `updateMaterial`
   union; tests red on round-down and on a stale `packPrice`.
2. `parsePrice` + UOM column + the rewritten pinned test; `parseMoney`
   refuses M/C/pack.
3. `shared/priceSanity.ts` + the § 4.3 measurement, committed with T.
4. `shared/priceImportPlan.ts`; `importPrices` gains `apply`; preview
   screen; undo. **The import button stays hidden (review-sheet Q5; Q10 —
   Track A hiding it on local-dev, 2026-10-12) until this step ships**, and
   comes back with it.
5. Pack pair in the Materials editor and Supplier pricing; warning on
   every typed-price surface in § 4.2.
6. Seed `packQty`/`packLabel` from `packFor`; `backfillMaterialMetadata`
   taught them; fork-protection test extended.

Each step: bidTotals unchanged on the fixture set (nothing here moves a
stored number), and seen at laptop + iPad before it is called done.

## 8. Questions for the owner — ALL ANSWERED 2026-10-12: every recommended pick approved

- **Q1** Pack size under the editor's "More options", single price box until one is set? · **Answer: yes.**
- **Q2** Store wire's REAL pack (250 ft roll, 500 ft spool) even though the sheet types wire per foot with Pack qty 1? · **Answer: yes — the sheet stays as is; the app reads the pack from its label.**
- **Q3** Round a pack-to-unit conversion UP at the fourth decimal (worst case under 1¢ per 100 ft)? · **Answer: yes.**
- **Q4** Can you send one real supplier price export so the UOM codes E / C / M are confirmed, not assumed? · **Answer: yes, before step 2 ships. The owner is asking his Platt rep for a real price export and will send it when he has it.** Until it arrives, step 2's UOM-column reading is NOT built on the assumed codes; the export is also one of the two data sets Q8's measurement needs.
- **Q5** A price cell saying "/roll" or "/box" on a material with no pack size: hold the row for a tap, never guess? · **Answer: hold it.**
- **Q6** Import rows that "look off": skipped until you tap a fix (vs applied as read and listed first)? · **Answer: skipped until tapped.**
- **Q7** Undo: the last import per supplier only (vs any import in the last 30 days)? · **Answer: last per supplier.**
- **Q8** Warning threshold: pick it by measuring on your sheet and one real export (start at 5×), and warn on LOW as well as high? · **Answer: yes to both.**
- **Q9** On a Draft bid, a line priced from a price that looks off: show it on the attention strip with "Fix the price" (fixes the material) AND "Use the fixed price on this line" (a new one-line re-price, Draft only)? · **Answer: yes; never on a bid past Draft.**
- **Q10** Keep the supplier-import button hidden until the preview and undo ship (review-sheet Q5 again)? · **Answer: yes. Track A is hiding it on local-dev now** (2026-10-12); step 4 brings it back with the preview and undo.

**Still waiting on before building:** A's columns (§ 6), and the Platt export (Q4) for step 2's UOM reading and step 3's measurement. Steps 1, 5 and 6 need only the columns.
