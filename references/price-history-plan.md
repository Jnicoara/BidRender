# Price history — plan (Track C, 2026-10-14)

**PLAN ONLY.** No code, no migration, nothing merged. The SQL in § 6 is a
draft for Track A, queued **after PS-M1..M6** (`pricing-safety-plan.md` § 6).

## 1. What the owner asked for

Verbatim, 2026-10-14:

> "PRICE HISTORY. Tap a material -> "Price history" under More options shows
> every past price with date, supplier, pack size/qty, who changed it, and how
> (typed, import, accepted starter update). View-only, never changes a bid
> (bids freeze prices). History can't be backfilled, so recording should start
> as early as possible. Fit it with references/multi-supplier-plan.md and
> references/pricing-safety-plan.md."

The six points:

1. One material → **More options → Price history**.
2. Every past price: **date, supplier, pack size/qty, who, how**.
3. "How" = **typed**, **import**, **accepted starter update** (plus the two
   this plan adds: an import **undone**, and the **first** price).
4. **View-only.** No "use this price again" button.
5. **Never changes a bid.** A line's snapshot is frozen (CLAUDE.md
   § "Never mutate a snapshot field"); the history is never read by pricing.
6. **No backfill exists**, so **recording ships first**, the screen after.

## 2. What exists today (searched 2026-10-14)

**Searched** `server/**/*.ts` (tests excluded) for `costPerUnit` in a write,
`priceUpdatedAt`, `updateMaterial`, `createMaterial`, `forkMaterial`;
`references/*.md`, `todo.md`, `pricing/*` for `price history`,
`priceHistory`, `price_history`. No price history exists or is planned
anywhere; this is the first.

| What exists                                                                                                                                                     | Where                                                               | This plan                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `materials.costPerUnit` — the one price; `supplierName` free text; `priceUpdatedAt` stamped only by a cost write. **Each write overwrites.**                    | `drizzle/schema.ts` (materials); `materialsRouter.update`           | **Unchanged.** History is written BESIDE it, in the same transaction.                                                           |
| `materials.update` — the typed door (Materials editor, Supplier pricing inline field). Forks a shipped row first.                                               | `server/routers/materialsRouter.ts` `update`                        | Records `typed`.                                                                                                                |
| `materials.create` with a price.                                                                                                                                | `materialsRouter.ts` `create` → `db.createMaterial`                 | Records `typed` (previous = none) when the price is above 0.                                                                    |
| Fix a line → "save to library": calls `materials.update` through a caller, so it is the same door.                                                              | `server/lineFix.ts` (`materialsCaller(...).update`)                 | Recorded by the door as `typed`. Nothing extra.                                                                                 |
| "Save line as assembly" creates a material with the line's cost.                                                                                                | `server/db.ts` `saveLineAsAssembly` → `createMaterial`              | Records `typed` (previous = none).                                                                                              |
| `importPrices` writes `costPerUnit`, `supplierName`, `priceUpdatedAt` row by row, through `db.updateMaterial`.                                                  | `materialsRouter.ts` `importPrices`                                 | Records `imported`, with the import id (PS-M5) and its as-of date.                                                              |
| Import undo — **planned**, restores only rows nobody edited since.                                                                                              | `pricing-safety-plan.md` § 3.4                                      | Records `import_undone`. An undo is a price change and is never hidden.                                                         |
| `applyStarterChange` — changes a SHARED row, pins every company first, logs to `starter_changes` (append-only, old and new value). Accept/Offers **not built**. | `server/starterChanges.ts`; `starter_changes` (`drizzle/schema.ts`) | Shared-row changes are **already history**: read from `starter_changes`, not copied (§ 3.4). Accept records `starter_accepted`. |
| Boot re-stamp: `backfillMaterialMetadata` writes the seed's price onto shared rows with **no log**.                                                             | `server/db.ts` (`patch.costPerUnit = intended.costPerUnit`)         | Untouched. Routed through `applyStarterChange` by A's boot change (`c6d80249`), which is when it gains a log.                   |
| `forkMaterial` copies the shipped price to the company's row.                                                                                                   | `server/db.ts` `forkMaterial`                                       | **No row** — a copy is not a change. History is keyed so it continues across the fork (§ 3.2).                                  |
| Planned: pack price / qty / label (PS-M1..M3), import log (PS-M5/M6), suppliers + `supplier_prices` (multi-supplier § 6).                                       | `pricing-safety-plan.md` § 6; `multi-supplier-plan.md` § 6          | Frozen into each history row (pack), linked (import), added later (supplier id, PH-M2).                                         |
| `bid_line_items.bidUnitCost` and the snapshot fields — a price on ONE bid.                                                                                      | `drizzle/schema.ts` (bid_line_items)                                | **Not recorded** (Q3). A bid's prices live on the bid.                                                                          |

## 3. Design

### 3.1 One append-only table, one door

**`material_price_history`** — one row per change of a company's material
price. **Insert only**: no code path updates or deletes a row (account
deletion cascades, as every table does). That is why it has `createdAt` and no
`updatedAt` — a departure from the house pair, on purpose.

**One door.** Every price write on a company row goes through
`db.updateMaterial` / `db.createMaterial` today (§ 2). Those two gain the
recording, inside one transaction with the write, so a price and its history
cannot disagree:

- `db.updateMaterial`'s patch takes `costPerUnit` **only together with a
  `priceWhy`** — `{ source, actorUserId, importId?, starterChangeId?,
priceAsOf? }`. A union type, the same shape as PS's `priceWrite` and
  `InlineNumberField`: a caller that writes a price without saying why **does
  not compile**. PS's `priceWrite` pair and `priceWhy` travel in one argument,
  so the pack fields recorded are exactly the ones written.
- The door reads the row **before** writing (the `SELECT … FOR UPDATE` in the
  same transaction) and records only if the number **changed**, compared
  numerically ("0.4000" vs 0.4 — the seed re-stamp's comparison). Writing the
  same price back is not a change: no row, as no green flash (CLAUDE.md
  § Editing fields 4).
- `createMaterial` records only when the new price is above 0. A new row at 0
  has no price to remember; when it is first priced, the row says "was not
  priced".

**A forcing test, not a reminder:** `server/priceHistoryDoor.test.ts` scans
`server/**/*.ts` for any write that sets `costPerUnit` on `materials` outside
the door, with a named allowlist: the seed re-stamp (shared rows, until A's
boot change) and `starterChanges.ts` (shared rows, logged in
`starter_changes`). A new writer elsewhere goes red. Search by the column
name, which cannot be written another way — not by a call shape (CLAUDE.md
§ "A grep is a measurement").

### 3.2 Keyed so a fork does not break it

Each row carries both:

- `materialKey` = `materialItemKey(row)` (`baselineId ?? id`) — the shipped
  id for a shipped item, the company's own id for a custom one. **The
  history query reads by this**, the same key `supplier_prices` and item
  markup use (`multi-supplier-plan.md` § 3.1), so a later fork, a pinned copy
  or a re-fork never splits one item's history in two.
- `materialId` = the row actually written (the fork). Kept for audit; NULL if
  that row is ever deleted forever, while the history stays under the key.

### 3.3 What a row records

| Owner's word    | Column(s)                                    | Notes                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date            | `createdAt`; `priceAsOf`                     | `createdAt` is when it changed in BidRidge. `priceAsOf` is the date ON the supplier's sheet for an import (asked once, PS § 3.3); NULL for a typed price (same day).                                                   |
| price           | `unitCost`, `previousUnitCost`, `unitOfSale` | Per unit, as every total reads it. `previousUnitCost` makes the FIRST recorded change complete ("$0.44 → $0.48, +9%") though nothing before it was kept. Unit frozen: a unit change later must not re-read old prices. |
| pack size / qty | `packQty`, `packLabel`, `packPrice`          | Frozen from PS-M1..M3 as written. `packPrice` NULL = typed per unit. Shown "$120.00 per 250 ft roll → $0.4800/ft".                                                                                                     |
| supplier        | `supplierName`                               | The free text on the row at the time. PH-M2 adds `supplierId` when `suppliers` exists (§ 4.2).                                                                                                                         |
| who             | `changedByUserId`                            | `ctx.scope.actorUserId` — the PERSON — never `dataUserId`. `userId` holds the company owner, for scope (CLAUDE.md § Data model).                                                                                       |
| how             | `source`, `importId`, `starterChangeId`      | `typed` · `imported` · `import_undone` · `starter_accepted`. The ids let the screen say which file, and which starter update.                                                                                          |
| Example tag     | `isExamplePrice`                             | The row's tag AFTER the write. A shop's typed price clears it (shared/exampleTags.ts); an accepted starter price may carry it.                                                                                         |

### 3.4 Shipped (starter) prices: read the log that already exists

A change to a **shared** row is already recorded, append-only, in
`starter_changes` (field `costPerUnit`, old and new value, version, undo
link). Copying it into `material_price_history` would be two records of one
fact, and two copies drift (`multi-supplier-plan.md` § 3.1's argument). So:

- The history screen reads `starter_changes` for the item's shipped id and
  shows those entries **labelled "BidRidge example price"**, only for the
  span when the company was using the shipped row (Q2).
- When a company **accepts** a starter update (Offers/Accept, § 10a.3 — not
  built), that writes the company's copy through the door: a
  `starter_accepted` row with `starterChangeId`. That IS the company's price
  changing, so it is recorded here.
- A **pin** writes no row: it forks the row as it is, so the company's price
  does not move.
- **Until A's boot change**, the seed re-stamp changes shared prices with no
  log, so shipped-price history before that day does not exist. Said in the
  screen's footnote, not hidden.

### 3.5 The screen

Materials editor → **More options → "Price history"** (one control, CLAUDE.md
§ "Customization available, but never in the way"). Also from Supplier pricing's
row menu. A side panel, newest first, a window of 50 with "Show older"
(cursor on `createdAt, id` — Responsiveness rule 2):

```
Price history — #12 THHN Copper                        per foot
─────────────────────────────────────────────────────────────────
Oct 14, 2026  $0.4800  +9%   Typed by Jane R.      Platt
              from $120.00 per 250 ft roll
Oct 02, 2026  $0.4400  −4%   Imported by Jim N.    Platt   platt-oct.csv (sheet dated Oct 1)
Sep 20, 2026  $0.4600        Import undone by Jim N.
Sep 18, 2026  $0.4100        BidRidge example price
─────────────────────────────────────────────────────────────────
Price history starts Oct 15, 2026. Changes before then were not recorded.
```

- **View-only.** No restore, no edit. Changing the price stays where it is.
- **Not on a bid, not on a quote.** Internal, like supplier and compare
  (`multi-supplier-plan.md` § 7).
- **Empty / before-history**: if the row's `priceUpdatedAt` predates the
  first history row, one plain line: "$0.4100 — last changed Sep 3, 2026,
  before history was kept." Read live from the row; **not a backfill**, and
  it says so (Q7).
- A person who has left the company: "a former team member". A row with no
  actor (none today) says "BidRidge".
- **Staleness** (CLAUDE.md § "A test that calls the server cannot see a
  screen showing yesterday's answer"): the history query is added to the
  helper the material mutations already invalidate through, keyed by
  `materialKey`, so an edit with the panel open shows the new row at once.

### 3.6 Never changes a bid

The history is **written** only by the door and **read** only by the panel's
query. No pricing path, resolver, snapshot or total reads it — the test in
§ 7 #6 pins that. A bid line keeps its frozen snapshot whatever the history
says, and the panel never offers to re-price one.

## 4. How it fits the other two plans

### 4.1 Pricing safety (`pricing-safety-plan.md`)

- **Pack (PS-M1..M3):** `priceWrite` already returns `{ costPerUnit,
packPrice }` as one pair; the door records that pair plus `packQty` /
  `packLabel` read in the same transaction. No second rounding: the history
  holds the rounded-up number that was stored.
- **Import (PS-M5/M6):** `importId` → `price_imports`. Each imported row also
  has a `price_import_rows` entry; the history row is the read side, the
  import row is the undo side. They are written in the same transaction.
- **Undo (PS § 3.4):** restores through the door with `import_undone` and the
  same `importId`. Rows undo leaves alone (edited since) record nothing.
- **Sanity warning (PS § 4):** its `reference` (the "previous price") could
  read the history later. **Not proposed** — PS § 4.1 reads the row, and two
  sources of "previous" is a disagreement waiting to happen.
- **"It's right — keep it"** (PS-M4) is not a price change: no row.

### 4.2 Multi-supplier (`multi-supplier-plan.md`)

- **PH-M2, queued with that plan's tables:** `supplierId int NULL`, FK
  `suppliers` SET NULL. NULL = "your price" (`costPerUnit`), or a row from
  before suppliers existed.
- `supplier_prices` writes (typed or imported into a list) go through the
  same door idea and record with `supplierId` set; the panel gains a supplier
  filter when a company has two or more (Q8). One history, not one per list.
- That plan's `replacedUnitCost` / `replacedAsOf` on `supplier_prices` stay —
  they are the undo side; this is the read side (same split as § 4.1).

### 4.3 The QUEUED Example-tag item

`applyStarterChange` writing the Example tag together with a price waits on
A's boot change (`c6d80249`; `track-c-handoff.md` QUEUED). Recording
`starter_accepted` rows is part of Accept, which is built on that same
function, so it waits on the same merge. Nothing here changes
`starterChanges.ts` before then.

## 5. Manual-first check

CLAUDE.md § "As manual or as automated as the user wants":

- **No library, no import, no supplier:** a material typed once and edited
  by hand gets a history of typed prices. Nothing to set up.
- **Full automation:** imports and accepted starter updates are recorded the
  same way, in the same list.
- **Nothing to switch on.** Recording is always on and costs the user
  nothing; the panel is one control under More options.

## 6. SQL draft for Track A — ADDITIVE, step 1, step 3 empty

**PH-M1** is queued **after PS-M1..M6** because it points at `price_imports`
(PS-M5) and records the pack columns (PS-M1..M3). New table only; nothing
reads it until C's code ships, so it can go first. Numbered by A at write
time; house collation; money `decimal(12,4)`.

```sql
-- PH-M1: material price history. INSERT-ONLY: one row per change of a company's
-- material price (references/price-history-plan.md). No updatedAt on purpose.
-- Shared (shipped) rows are NOT here: their history is starter_changes (§ 3.4).
CREATE TABLE `material_price_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,                     -- company owner (scope), never the actor
  `materialKey` int NOT NULL,                -- materialItemKey: baselineId ?? id. The history reads by this.
  `materialId` int NULL,                     -- the row written. NULL = that row was deleted forever
  `unitCost` decimal(12,4) NOT NULL,         -- per unitOfSale, as stored after the write
  `previousUnitCost` decimal(12,4) NULL,     -- NULL = the row had no price before (new row)
  `unitOfSale` enum('each','foot','box') NOT NULL,
  `packQty` decimal(10,4) NULL,              -- PS-M1 at the time. NULL = no pack size
  `packLabel` varchar(32) NULL,              -- PS-M2 at the time. NULL = "pack"
  `packPrice` decimal(12,4) NULL,            -- PS-M3 as typed. NULL = typed per unit
  `supplierName` varchar(128) NULL,          -- free text on the row at the time. NULL = none given
  `priceAsOf` date NULL,                     -- date on the supplier's sheet. NULL = typed (same day)
  `source` enum('typed','imported','import_undone','starter_accepted') NOT NULL,
  `isExamplePrice` boolean NOT NULL,         -- the row's tag after the write
  `changedByUserId` int NULL,                -- the person. NULL = user removed (shown "a former team member")
  `importId` int NULL,                       -- imported / import_undone only
  `starterChangeId` int NULL,                -- starter_accepted only
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `material_price_history_id` PRIMARY KEY(`id`),
  CONSTRAINT `material_price_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `material_price_history_materialKey_materials_id_fk` FOREIGN KEY (`materialKey`) REFERENCES `materials`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `material_price_history_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
  CONSTRAINT `material_price_history_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
  CONSTRAINT `material_price_history_importId_price_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `price_imports`(`id`) ON DELETE set null ON UPDATE no action,
  CONSTRAINT `material_price_history_starterChangeId_starter_changes_id_fk` FOREIGN KEY (`starterChangeId`) REFERENCES `starter_changes`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `material_price_history_key_idx` ON `material_price_history` (`userId`, `materialKey`, `createdAt`, `id`);
```

```sql
-- PH-M2 (QUEUED with multi-supplier's suppliers table, not before it):
-- which supplier's list the price was in. NULL = "your price", or before suppliers existed.
ALTER TABLE `material_price_history` ADD `supplierId` int NULL;
--> statement-breakpoint
ALTER TABLE `material_price_history` ADD CONSTRAINT `material_price_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;
```

**For A to check:**

- **Forkable-reference registry** (`server/forkableReferences.test.ts`): two
  new FKs into `materials`. `materialKey` resolves through `materialItemKey`
  (never a fork's id); `materialId` is "the row itself". Same pair as
  `supplier_prices.materialKey` and `price_import_rows.materialId`.
- **`unitOfSale` as an enum** copies `MATERIAL_UNITS_OF_SALE`
  (`drizzle/schema.ts`). If a unit is ever added there, this enum moves in
  the same batch — or A prefers `varchar(16)` here to avoid that coupling.
  Either is fine; say which in the file.
- **NOT NULL** on `unitCost`, `unitOfSale`, `source`, `isExamplePrice`: a row
  exists only to hold a change; there is no "not yet" state (multi-supplier
  § 6's argument).
- **Size:** one row per changed price. A 1,500-row import that changes every
  price is 1,500 rows, ~300 bytes each. Not measured on a real import yet —
  measure on the first one and write it here.

## 7. Test plan

Every count below is a **before-and-after of the same query** (CLAUDE.md
§ "A count taken before the change is intent, not outcome").

1. **Each writer records exactly one row, with the right `how`:** typed edit;
   create with a price; fix-a-line "save to library"; save line as assembly;
   import (`importId`, `priceAsOf`, `supplierName`); import undo; accepted
   starter update (when Accept is built).
2. **No row when nothing changed:** the same price written back ("0.4000"
   against 0.4); a name, alias or hours-only edit; a fork; a pin; "It's
   right — keep it"; create at $0.
3. **One transaction:** force the history insert to fail → the price is
   unchanged too (and the reverse). A price never changes unrecorded.
4. **Fork continuity:** price a shipped row's fork twice, re-read by
   `materialKey` → both rows, in order; delete the fork forever → rows stay,
   `materialId` NULL.
5. **Scope:** an employee's edit records `userId` = owner and
   `changedByUserId` = the employee; company B reads none of A's rows
   (`scopeDiscipline.test.ts` covers the new query).
6. **Never changes a bid:** a fixture bid's totals are identical before and
   after a run of price changes and history reads; and a source-scan asserts
   no pricing module (`shared/bidTotals*`, the line resolver, `bidPricing.ts`,
   `db.snapshotForAssembly`) imports the history table.
7. **The door test** (`priceHistoryDoor.test.ts`, § 3.1): goes red on a
   planted `costPerUnit` write outside the door. Check that it CAN fail by
   planting one, before trusting it is green.
8. **Pack:** a typed pack price records `packPrice`/`packQty`/`packLabel`; a
   per-unit write records `packPrice` NULL (PS § 2.2's rule, read back).
9. **Paging:** 120 rows, several with one `createdAt`, pages of 50 → no
   duplicate, no gap (tie-break on `id`).
10. **Shipped entries (Q2):** a `starter_changes` price change shows for a
    company using the shipped row, and not after it has its own copy.
11. **On screen, not just in the suite:** open the panel at laptop and iPad
    size; edit the price with the panel open and see the new row arrive
    without a reload; check the empty state and the "before history" line
    say what is true.
12. **Migration:** apply PH-M1 twice on the local DB (second run must fail
    cleanly on "table exists", nothing half-made); `schemaDrift.mts` clean.

## 8. Build order for C (once PH-M1 exists)

> **Step 1 (RECORDING) BUILT 2026-10-14 (overnight, Track C, on track-c).**
> The door is `db.updateMaterial` / `createMaterial` (`PricedWrite` =
> `priceWrite` pair + `PriceWhy`), one transaction, a row only when the
> number changed. Writers: materials.update and .create (typed),
> importPrices (imported; importId NULL until PS step 4), "save line as
> assembly" (typed), revert to shipped (recorded as **typed** — the enum has
> no "reverted"; morning question Q-PH1). Tests:
> `priceHistoryRecording.test.ts` (8: tests 1, 2, 4, 8) and
> `priceHistoryDoor.test.ts` (4; shown red with a planted write). Not yet:
> tests 3 and 5 (the file says why), 6, and 9–12 (they belong to the read
> query and the panel, steps 2–3).

1. **Recording first** — the door (`priceWhy` union on `updateMaterial` /
   `createMaterial`), every caller in § 2 passing its `how`, tests 1–7. Ships
   alone: from that release on, history accumulates.
2. The read query (`materials.priceHistory`, cursor) + tests 5, 9, 10.
3. The panel under More options + test 11.
4. With Accept (after `c6d80249` merges): `starter_accepted`.
5. With multi-supplier: PH-M2 and the supplier filter.

## 9. Questions for the owner — ALL ANSWERED 2026-10-14: yes to Q1–Q8, as suggested

The owner took every suggestion below. What that fixes:

- **Q1:** the RECORDING (build order § 8 steps 1–2) ships in the **same
  release as PS-M1..M6**, with PH-M1 right behind them; the panel follows
  in a later release.
- **Q2:** BidRidge example-price changes show, labelled, **only while the
  shop uses the shipped price** (§ 3.4).
- **Q3:** a price on one bid line is **not** recorded; "save to library"
  from a bid is.
- **Q4:** kept **forever**; deleted only with the account.
- **Q5:** labor rates and hours **later, in their own table**, same shape.
- **Q6:** **anyone who can see Materials** can see it.
- **Q7:** "last changed … before history was kept" is shown, read live
  from the row (§ 3.5).
- **Q8:** **one history per item**, with a supplier filter once suppliers
  exist (PH-M2, § 4.2).

Plan only — nothing built.

| #   | Question                                                                                                              | Suggested                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Ship the RECORDING in the same release as PS-M1..M6, before the screen exists?                                        | **Yes.** History can't be backfilled; every week without recording is a week nobody can ever see. The screen can follow.       |
| Q2  | Show BidRidge's own example-price changes in a company's history?                                                     | **Yes, labelled "BidRidge example price", and only while the company used the shipped price** — not after it had its own copy. |
| Q3  | Record a price typed on ONE bid line (not saved to the library)?                                                      | **No.** That price lives on the bid. "Save to library" from a bid IS recorded, as typed.                                       |
| Q4  | Keep history forever?                                                                                                 | **Yes.** Rows are small; deleted only with the account.                                                                        |
| Q5  | Labor rates and labor hours too?                                                                                      | **Later, its own table, same shape.** Not in PH-M1.                                                                            |
| Q6  | Who can see it?                                                                                                       | **Anyone in the company who can see Materials.** Prices are already visible to them.                                           |
| Q7  | Show the current price's date when it was set before history started ("last changed Sep 3, before history was kept")? | **Yes.** It's true and read live from the row; it is not a made-up entry.                                                      |
| Q8  | When suppliers arrive, one history for all of an item's prices (with a supplier filter), not one per supplier?        | **Yes, one history.**                                                                                                          |
