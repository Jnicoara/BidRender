# Multi-supplier pricing — plan (Track A, 2026-10-06)

PLAN ONLY. No code, no migration, no database read. § 6 lists the columns a
future batch would add; numbers are given by Track A when the files are
written.

## 1. What the owner asked for

Verbatim, 2026-10-06:

> "MULTI-SUPPLIER PRICING - plan only, no code: check what supplier tracking
> already exists, then write references/multi-supplier-plan.md for: a price per
> supplier per item with its date; a company default supplier, switchable per
> bid; a 'compare' column showing the other supplier's price and savings; NO
> auto-pick of the lowest; price frozen onto the bid. List any columns needed."

The five points:

1. A price **per supplier per item**, with its date.
2. A **company default supplier**, switchable **per bid**.
3. A **compare** column: the other supplier's price and the savings.
4. **No auto-pick** of the lowest.
5. The price **frozen onto the bid**.

## 2. What exists today

**What was searched** (CLAUDE.md § "A grep is a measurement"), in
`drizzle/schema.ts`, `drizzle/*.sql`, `server/routers/*`, `server/db.ts`,
`shared/*`, `client/src/pages/*`, `client/src/lib/appRoutes.ts`,
`references/*.md`, `todo.md`, `ASSEMBLIES_PLAN.md`, `CHANGELOG.md`:
`supplier`, `vendor`, `supply house`, `supplyHouse`, `importPrices`,
`Supplier pricing`, `matdb`, `user_materials_db`, `brandNote`, `brand`,
`parentId`, `costPerUnit`, `priceUpdatedAt`, `forkMaterial`, `baselineId`,
`snapshotMaterialCost`, `bidUnitCost`, `bid_quotes`, `quotedMarkupPct`,
`pricing_defaults`, `markup`, `example price`, `examplePrice`, `brandLine`,
`bid_panels`, `preferredSupplier`, `defaultSupplier`, `reprice`/`re-price`.
`.claude/worktrees/` was excluded (stale copies).

**The short answer: one supplier per material, as free text, on the
material row. No supplier table, no second price, no default supplier, no
compare, nothing supplier-shaped on a bid line.**

| What exists                                                                                                                                                                                                                                                                                                | Where                                                                                                                                                                | This plan                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `materials.costPerUnit` decimal(10,4) NOT NULL DEFAULT 0 — the one price a material has.                                                                                                                                                                                                                   | `drizzle/schema.ts:760`                                                                                                                                              | **Kept** as "your price". Supplier prices sit BESIDE it (§ 3.1).                                                                            |
| `materials.supplierName` varchar(128), free text, "rather than a suppliers table **on purpose**" — "whose price is this, and how old", not "manage my vendor list".                                                                                                                                        | `drizzle/schema.ts:830-842`                                                                                                                                          | **Left alone**, still labels `costPerUnit`. The no-table decision is **overridden** for the new lists (§ 3.2) — record it there when built. |
| `materials.priceUpdatedAt` — set only by a cost write, never by `updatedAt`.                                                                                                                                                                                                                               | `drizzle/schema.ts:844-858`; stamped in `materialsRouter.update` (`materialsRouter.ts:371-372`)                                                                      | Same rule for each supplier price: its own as-of date.                                                                                      |
| Age bands: fresh / aging at 30 days / stale at 90, clock passed in.                                                                                                                                                                                                                                        | `shared/priceStaleness.ts:18-19`                                                                                                                                     | **Reused** for every supplier price. One clock.                                                                                             |
| The fork: editing a shipped row (`userId` NULL) creates the company's copy with `baselineId` pointing back.                                                                                                                                                                                                | `drizzle/schema.ts:680-687`; `materialsRouter.update` → `db.forkMaterial` (`materialsRouter.ts:364-367`, `db.ts:1849`)                                               | Supplier prices do **not** fork a material. They key on the shipped id (§ 3.1).                                                             |
| `materialItemKey(m) = baselineId ?? id` — "a shipped row and its forks share one" key. Item markup overrides use it.                                                                                                                                                                                       | `shared/materialMarkup.ts:89-103`; `markup_rules.itemKey` (`schema.ts:4167`)                                                                                         | **Reused** as the key for a supplier price.                                                                                                 |
| `importPrices`: name match, never creates, forks baselines, writes `costPerUnit` + `supplierName` + `priceUpdatedAt` **as it goes**. No dry run, no undo.                                                                                                                                                  | `server/routers/materialsRouter.ts:532-623`; tests `server/supplierPricing.test.ts:163-300`                                                                          | **Changed** to write INTO a supplier's list, with a preview first (§ 4.4).                                                                  |
| "Supplier pricing" is a `?view=pricing` tab of Materials (old `/matdb` redirects there). One price column, one Supplier column, "Import price list" button.                                                                                                                                                | `client/src/lib/appRoutes.ts:53,105`; `client/src/components/library/LibraryTabs.tsx:56-60`; `client/src/pages/MaterialDatabasePage.tsx:166-180,277,338-348,441,593` | Becomes the place a list is kept and compared (§ 7).                                                                                        |
| The import is still shown. The owner's sheet asks "Hide the supplier-import button until its review screen (with undo) exists?", recommended Yes.                                                                                                                                                          | `references/materials-review-sheet-plan.md:57`; `references/before-beta-checklist.md:122-125`; `references/audit-2026-09-21.md:221-235`                              | § 4.4 is that review screen.                                                                                                                |
| `user_materials_db` (`unitMaterialCost`, `userPrice`, `externalSku`, `source`).                                                                                                                                                                                                                            | `drizzle/schema.ts:179-206`                                                                                                                                          | **Leave alone.** Legacy second catalog; `supplierPricing.test.ts:37-70` guards that it cannot come back.                                    |
| Line snapshot: `snapshotMaterialCost` is material for ONE of the line (an assembly's parts summed), frozen at add time. Also `snapshotMarkupPct`/`Source`, `snapshotUnpricedParts`, `snapshotLaborOnly`.                                                                                                   | `drizzle/schema.ts:4344-4423`; summed in `snapshotForAssembly` (`server/db.ts:6079-6124`)                                                                            | **Unchanged in meaning.** Two columns added beside it (§ 3.5).                                                                              |
| `snapshotMarkupSource.parts` holds `{ materialId, cost }` per part — **no quantity**.                                                                                                                                                                                                                      | `shared/materialMarkup.ts:210-214`                                                                                                                                   | Not enough to re-price or compare a part. Hence `snapshotPriceParts` (§ 3.5).                                                               |
| Four paths freeze a material cost from `costPerUnit`: assembly add (`db.ts:6118-6124`), run-type send (`runLinePricing`, `db.ts:13119-13132`), run-type re-send (`resnapshotRunTypeLine`, `db.ts:13205`, write at `:13237`), link a line to a material (`bidsRouter.linkLine`, `bidsRouter.ts:1165,1225`). | as listed                                                                                                                                                            | All four must go through ONE price resolver (§ 3.5).                                                                                        |
| `bid_line_items.bidUnitCost` — material priced ON THIS BID; quote items (`isQuoteItem`, `quoteId` → `bid_quotes`).                                                                                                                                                                                         | `drizzle/schema.ts:4434-4447`; `drizzle/0115_bid_line_columns.sql`                                                                                                   | **Wins over any list.** A supplier switch never touches it (§ 4.1).                                                                         |
| `bid_quotes.supplierName` varchar(128), free text, "no supplier table".                                                                                                                                                                                                                                    | `drizzle/schema.ts:5383-5407`; `drizzle/0114_bid_quotes.sql`; `references/quote-items-plan.md:265-266`                                                               | Left as text for now (§ 4.1).                                                                                                               |
| Company vs bid: `pricing_defaults` per trade (`all` row); a bid column NULL = follow the company (`productivityPct`).                                                                                                                                                                                      | `drizzle/schema.ts:1237-1293, 1944-1966`; `server/companyDefaults.test.ts`                                                                                           | **Copied** for the default supplier (§ 3.3).                                                                                                |
| Brand: `materials.parentId` (0119/0120), `materials.brand` (0121). Brand line on company/bid/panel and `snapshotBrandLine` are **planned, not built**; the owner chose flag + one re-price button for a brand change.                                                                                      | `drizzle/schema.ts:799-808`; `references/migrations-0098-batch-plan.md` § 10d (`:1128-1208`)                                                                         | The supplier switch copies that decision (§ 3.6).                                                                                           |
| Example prices: `examplePriceSource`/`AsOf` + `snapshotPriceWasExample` planned, **not built**; B3 said the tag reads "BidRidge example" plus the date.                                                                                                                                                    | `references/migrations-0098-batch-plan.md` § 10b, § 10 B3 (`:1013-1016, 1074-1116`)                                                                                  | See § 4.3 — the owner's 2026-10-07 wording drops the date.                                                                                  |
| Units: `unitOfSale` is `each` / `foot` / `box`. No pack size yet (markup D3).                                                                                                                                                                                                                              | `drizzle/schema.ts:532, 757-759`; `references/material-markup.md` D3                                                                                                 | Supplier prices are stored per that unit (§ 4.5).                                                                                           |

Nothing found for: `vendor`, `preferredSupplier`, `defaultSupplier`, a
`suppliers` table, any per-supplier price, any compare.

## 3. Design

### 3.1 A price per supplier per item, with its date

One row per (supplier, item): **`supplier_prices`**. It sits **beside**
`materials.costPerUnit`. It does not replace it and does not write to it.

- **Keyed by `materialItemKey`** (`baselineId ?? id`): the shipped id for a
  shipped item, the company's own id for a custom one. A fork never changes
  the key, so pricing a list never forks 700 rows, and a later hand edit
  that forks the row cannot orphan the list (the bug shape
  `server/forkableReferences.test.ts` exists for).
- **A brand variant is its own item** (CLAUDE.md § Brands: "a QO 20A and a
  Homeline 20A are different prices"). The list prices the variant; the
  parent resolves to a variant first, then to its price.
- **Each price carries its own date** (`priceAsOf`, a DATE — the day on the
  supplier's sheet or the day it was typed) and **where it came from**
  (`typed` or `imported`). Age uses `shared/priceStaleness.ts` unchanged.
- **No row means no price from that supplier.** There is no $0 row: a
  supplier that does not stock it simply has nothing.

**Why beside, not instead.** Making `costPerUnit` the default supplier's
price would turn one column into a mirror of another, and two copies of one
number drift. Moving existing prices into lists is a backfill that changes
what `costPerUnit` means — a meaning change for no gain. So `costPerUnit`
stays what it is today: **your price**, with its free-text `supplierName`.
A shop with no lists never sees a difference.

**How one part is priced on a bid** — one shared resolver, in `shared/`:

1. A price typed on this bid line (`bidUnitCost`, or a quote item) — wins.
2. **The bid's supplier's list price** for this item.
3. The material's own price (`costPerUnit` on the company's row) — "your price".
4. The shipped price on the baseline row — tagged "Example price" (§ 4.3).
5. Nothing → "Not priced", as today (`shared/lineNotPriced.ts`).

Step 2 falling through to 3 was **open question Q1** — **answered yes,
2026-10-07** (owner): fall through to your own price, **and the line SAYS
so, visibly, on the bid.** A part priced from the company's own price on a
bid that has a supplier is marked on its line — "your price, not from
Graybar" — and the bid totals say how many ("2 parts not from Graybar"),
the same shape as the "not priced" count. It reads the line's frozen parts
(`snapshotPriceParts` records which step priced each part), so the mark
cannot change after the fact and cannot be inferred wrong from today's
lists. Never on the customer quote (internal, § 7).

### 3.2 Who a supplier is: a small table, not free text

The lists, the company default and the per-bid switch all need to name the
same supplier. Free text cannot: "Platt", "platt " and "Platt Electric"
would be three suppliers, and a bid set to one would silently price from
none. So **`suppliers`** — name only, one per company, unique by name.

This **overrides** the reasoning at `drizzle/schema.ts:833-836` ("a table
would need CRUD, a picker and a merge story") for the new lists only. That
was right while a supplier was a label. A default and a switch ARE a picker.
When this is built, that comment gets a line saying so (CLAUDE.md § "When a
new decision overrides an old one, say so in BOTH files").

Kept small on purpose: a supplier is created by typing its name (in the
import or the "add supplier" box), renamed in place, and **retired, never
deleted** (`archivedAt`, CLAUDE.md § "Retire, never delete"). No address
book, no contacts. `materials.supplierName` and `bid_quotes.supplierName`
stay free text.

### 3.3 Company default supplier, switchable per bid

The productivity-factor pattern, exactly:

- `pricing_defaults.defaultSupplierId` — the company's. **NULL = no default
  supplier**: lines price from your own price, which is today. On the `all`
  row; a trade row may carry its own, read through `resolveForTrade`
  (a plumbing supply house is ordinary for a multi-trade contractor).
- `bids.supplierId` — **NULL = follow the company**, inherited, not copied.
  A later change to the company default reaches every bid still following
  it — **for lines added after the change**. Lines already on the bid are
  frozen (§ 3.5) and are flagged instead (§ 3.6).
- The company control carries `CompanyDefaultNotice`; the bid control does
  not (CLAUDE.md § "Company defaults vs per-bid overrides").

### 3.4 The compare column

On the bid, beside each line's material cost, when the company has **two
or more** suppliers with a list:

- **Per line:** "Graybar $41.20 · save $3.80" (or "· $2.10 more"). The
  other supplier's cost for the **same parts and quantities** the line was
  frozen from (`snapshotPriceParts`), at that supplier's **current** list
  price. Savings = the line's frozen material cost − that figure, × qty.
- **Cost, not sell price.** Markup can differ per part; a cost difference is
  the fact the estimator acts on.
- **Partly listed:** "Graybar: 3 of 5 parts listed" and **no savings
  figure**. A sum over the parts that happen to be listed would show a
  saving that is really a missing price.
- **Not listed at all:** "—". Never $0, which would read as a free part.
- **Older price:** the date shows in the stale colour when the other
  supplier's price is aging or stale, using the same bands. Never hidden:
  a saving from a 6-month-old price is the one most worth doubting.
- **Lines that are not from a list** (a price typed on the bid, a quote
  item, a free count): blank — there is nothing to compare.
- **Per bid:** under the total, "Graybar would be $1,240.00 less on 38 of
  42 lines; 4 lines have parts Graybar does not list." Counts stated, so the
  total is never read as complete when it is not.
- **Which "other":** with exactly two suppliers it is the other one. With
  three or more, a picker on the column, remembered per viewer
  (`localStorage`) — it changes no stored number, so it needs no column.

**Old lines** (`snapshotPriceParts` NULL, every line before the column):
compare shows **"parts not recorded — no comparison"** and offers nothing.
_Changed by Track A, 2026-10-07:_ the draft read the assembly's recipe as it
is today. That is the exact pattern `todo.md` records as a WRONG-NUMBER risk
("older bid lines read their assembly's recipe LIVE") — a saving computed
against parts the line was never priced from would be a confident wrong
number. Saying nothing is better than that.

### 3.5 No auto-pick — and the price frozen onto the line

**Nothing ever chooses the cheapest.** Not on add, not on a switch, not as
a default for a new company. The bid prices from the supplier a person set
(company or bid), and the compare column only shows. Two reasons:

- **Trust.** A total that moved because a cheaper list arrived overnight is
  a total nobody chose. It is the same failure as a silent re-price.
- **The cheapest is often not the answer.** Account terms, delivery, who
  has it in stock, a rebate on the whole order. Only the estimator knows
  those, so the estimator picks.

**At add time** the resolver (§ 3.1) prices every part and the line
freezes, beside the existing snapshot fields:

| Frozen                 | What it records                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshotMaterialCost` | **Unchanged meaning:** material for one of the line, the parts summed.                                                                          |
| `snapshotSupplierId`   | The supplier the bid was set to when the line was priced. NULL = no supplier in effect, or a line from before the column.                       |
| `snapshotPriceParts`   | Per part: item key, qty in one line, unit cost used, which step of § 3.1 it came from, supplier id, as-of date. What compare and re-price read. |

"2 parts not from Platt" on a line is read from `snapshotPriceParts`, so it
needs no column of its own.

**One resolver, four callers.** Today four paths read `costPerUnit` into a
snapshot (§ 2). Each gets the bid's supplier and calls the same shared
function; the snapshot type is built only by it, so a fifth path cannot
forget the list (CLAUDE.md § "Prefer a forcing function to a reminder").

### 3.6 Switching the bid's supplier after lines exist

Mirrors the owner's brand decision (`migrations-0098-batch-plan.md` § 10d,
item 1, 2026-09-29): **flag, plus one explicit button. Never silent.**

- Every line whose `snapshotSupplierId` differs from the bid's resolved
  supplier is flagged: "Priced from Platt — bid is now Graybar."
- One button on the bid: **"Re-price 12 lines from Graybar"**. Pressing it
  re-prices the **material half only**: `snapshotMaterialCost`,
  `snapshotSupplierId`, `snapshotPriceParts`, `snapshotUnpricedParts`, and
  the markup re-resolved on the new parts (as "Re-apply rules" does). Hours,
  rate, modifiers and labor-only are not touched.
- **Not offered:** lines priced on the bid (`bidUnitCost`), quote items, free
  counts, and lines from before the column (`snapshotSupplierId` NULL). The
  last are named in one sentence ("8 older lines keep their price") and left.
- A quantity lock (`bids.quantitiesLockedAt`) does not block it: the lock
  freezes how many, and this is what it costs.
- No column for the flag: it is a comparison at read time, like the brand
  flag.
- **Markup is applied EXACTLY ONCE — owner, 2026-10-07 (Q4).** Re-pricing
  starts from the supplier's RAW price and resolves markup on it, the same
  path as adding the line fresh; it never reads the line's already-marked
  cost back in. The trap is real: if the re-price fed the old marked-up
  `snapshotMaterialCost` (or a marked-up part) into the markup step, a 25%
  rule would land as 56.25%, and a second press would compound it again.
  So the re-price function takes only raw inputs (supplier price, quantity,
  rules) and has no parameter that could carry a marked-up number in.
  **Test, required with the build:** price a fixture part $10.00 with a 25%
  rule → $12.50; re-price from a second supplier at $10.00 → still $12.50,
  not $15.63; press re-price twice → still $12.50; switch to a supplier at
  $8.00 → $10.00. Each assertion goes red on a version that re-marks the
  frozen cost.

## 4. How it fits what is already there or planned

### 4.1 Quote items and `bid_quotes` (0114/0115)

A quote item is priced from a supplier's quote for this job, not from a
list. It sits at step 1 of § 3.1 and is never re-priced by a switch and
never compared. `bid_quotes.supplierName` stays free text; linking it to
`suppliers` later is one nullable column and is not needed now.

### 4.2 Material markup

Unchanged order (`references/material-markup.md` "Where the step sits"):
the supplier price IS the material cost, and markup resolves per part on
top of it. Item overrides key on `materialItemKey`, so they follow the item
whichever supplier priced it. **One thing to watch:** price bands (D3, not
built) read the PACK price, which can differ by supplier. When Piece 2
adds a pack size it is per material; per-supplier packs are not planned.

### 4.3 Example prices on shipped materials

The owner, 2026-10-07: every shipped preset price shows a plain **"Example
price"** tag, **no store and no date**, cleared when a shop edits it.
**Recorded** in CLAUDE.md § "Where a priced catalog lands" and as the
override of B3 in `migrations-0098-batch-plan.md` (Track A, same day): the
source and as-of columns are dropped; one column, `materials.isExamplePrice`,
plus the line's `snapshotPriceWasExample` (Batch 5).

A supplier price is a shop's own price, so it is **never** an example: no
tag, ever. The example tag appears only when a part falls through to step 4
of § 3.1 — and the line then says so (the planned
`snapshotPriceWasExample`, or a step-4 entry in `snapshotPriceParts`, which
could replace it; Track A decides when writing both).

### 4.4 The supplier import

`importPrices` (`materialsRouter.ts:556-623`) changes target and gains a
review step:

- **Writes INTO the chosen supplier's list**, never `costPerUnit`. The name
  match, the rename fallback and "never create" all stay.
- **Preview first, nothing written:** matched / renamed / unmatched / and
  "changed by more than 5x from your current price" (likely a unit
  mismatch, § 4.5). Apply then writes exactly that preview, the
  `importLaborSheet` shape (`apply: false|true`, `materialsRouter.ts:625-650`).
- **Undo the last import:** each changed row keeps the price it replaced;
  undo restores those and deletes rows the import created.
- **If the company has no default supplier,** the dialog offers "Make Platt
  your default supplier" ticked — otherwise a first import would price
  nothing on a bid (open question Q3).
- The as-of date is asked once per import (defaults to today).

This is the review screen the owner's Q5 asks for; the button can come
back when it ships.

### 4.5 Unit of sale

A supplier price is stored **per the material's `unitOfSale`** (each,
foot, box). Electrical sheets often price wire per thousand feet and
devices per box. The import does not convert: the preview flags a price
more than 5x away from your price or the other list (the multiplier is a
starting point, not measured), and the user fixes the row. Typed prices
are per the unit shown beside the box.

### 4.6 Brand variants

A list prices variants, not parents. Resolution: parent → preferred brand
line (planned, § 10d) → variant → **that variant's** list price. A switch of
brand and a switch of supplier are two separate flags with two separate
buttons; neither re-prices the other's lines.

## 5. Manual-first check

CLAUDE.md § "As manual or as automated as the user wants":

- **No supplier at all:** no `suppliers` rows, `defaultSupplierId` NULL.
  Materials and the bid look as they do today; typing your own price is
  unchanged. The import already asks for a supplier name
  (`materialsRouter.ts:559`); that name now creates the supplier, so the
  import adds a preview but no extra question.
- **One supplier:** a list and a default. The bid says "Priced from Platt"
  as text; no picker, no compare column (nothing to compare).
- **Two or more:** the bid's supplier becomes a picker and the compare
  column appears.
- **Both directions:** a price typed on a bid line still wins over every
  list; your own price still works with no list at all.

## 6. Columns and tables

All **ADDITIVE** — new tables and nullable columns, no `UPDATE` to an
existing column — so every file is **step 1** of the three-step deploy.
Numbered by Track A when written; one statement per file, hand-written.
House conventions from `drizzle/0114_bid_quotes.sql`: `userId` = company
owner, NOT NULL, FK users ON DELETE CASCADE; `createdAt`/`updatedAt`;
`COLLATE=utf8mb4_unicode_ci`; unit costs `decimal(12,4)`.

**New table `suppliers`**

| Column                    | Type                  | NULL meaning | Default       | FK / ON DELETE |
| ------------------------- | --------------------- | ------------ | ------------- | -------------- |
| `id`                      | int AI PK             | —            | —             | —              |
| `userId`                  | int NOT NULL          | —            | none          | users, CASCADE |
| `name`                    | varchar(128) NOT NULL | —            | none          | —              |
| `archivedAt`              | timestamp             | live         | none          | —              |
| `createdAt` / `updatedAt` | timestamp             | —            | now() (house) | —              |

Unique (`userId`, `name`) — the collation makes it case-insensitive, which
is the point.

**New table `supplier_prices`**

| Column                    | Type                              | NULL meaning                | Default       | FK / ON DELETE                               |
| ------------------------- | --------------------------------- | --------------------------- | ------------- | -------------------------------------------- |
| `id`                      | int AI PK                         | —                           | —             | —                                            |
| `userId`                  | int NOT NULL                      | —                           | none          | users, CASCADE                               |
| `supplierId`              | int NOT NULL                      | —                           | none          | suppliers, CASCADE                           |
| `materialKey`             | int NOT NULL                      | —                           | none          | materials, CASCADE — **forkable, see below** |
| `unitCost`                | decimal(12,4) NOT NULL            | — (no price = no row)       | none          | —                                            |
| `priceAsOf`               | date NOT NULL                     | — (the date is the point)   | none          | —                                            |
| `source`                  | enum('typed','imported') NOT NULL | —                           | none          | —                                            |
| `importId`                | int                               | not from an import          | none          | supplier_price_imports, SET NULL             |
| `replacedUnitCost`        | decimal(12,4)                     | the import created this row | none          | —                                            |
| `replacedAsOf`            | date                              | as above                    | none          | —                                            |
| `createdAt` / `updatedAt` | timestamp                         | —                           | now() (house) | —                                            |

Unique (`supplierId`, `materialKey`); index (`userId`). NOT NULL on
`unitCost`, `priceAsOf` and `source` is justified: this is a new table and
a row exists only to hold a price; there is no "not yet" state to keep.

**New table `supplier_price_imports`** (needed only for undo; can follow
the first build if it ships preview-only)

| Column                    | Type          | NULL meaning | Default | FK / ON DELETE     |
| ------------------------- | ------------- | ------------ | ------- | ------------------ |
| `id`                      | int AI PK     | —            | —       | —                  |
| `userId`                  | int NOT NULL  | —            | none    | users, CASCADE     |
| `supplierId`              | int NOT NULL  | —            | none    | suppliers, CASCADE |
| `fileName`                | varchar(255)  | pasted text  | none    | —                  |
| `priceAsOf`               | date NOT NULL | —            | none    | —                  |
| `rowsChanged`             | int NOT NULL  | —            | none    | —                  |
| `undoneAt`                | timestamp     | not undone   | none    | —                  |
| `createdAt` / `updatedAt` | timestamp     | —            | now()   | —                  |

**New columns on existing tables** — nullable, no default:

| Table.column                         | Type | NULL meaning                                                                                                                                                        | FK / ON DELETE      |
| ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `pricing_defaults.defaultSupplierId` | int  | no default supplier — price from your own price                                                                                                                     | suppliers, SET NULL |
| `bids.supplierId`                    | int  | follow the company                                                                                                                                                  | suppliers, SET NULL |
| `bid_line_items.snapshotSupplierId`  | int  | no supplier in effect, or a line from before                                                                                                                        | suppliers, SET NULL |
| `bid_line_items.snapshotPriceParts`  | json | a line from before: compare says "parts not recorded" — it never reads today's recipe (Track A, 2026-10-07: that is the live-recipe wrong-number risk in `todo.md`) | —                   |

SET NULL, not RESTRICT: suppliers are retired, not deleted, in the app;
the FK only matters when a whole account is deleted, where RESTRICT would
fight the cascade.

**Forkable-reference registry.** `supplier_prices.materialKey` is a new FK
into `materials`, a forkable table, so `server/forkableReferences.test.ts`
will go red until it is declared. It stores `materialItemKey` (the shipped
id, never a fork's), so its entry is a resolver named `materialItemKey`,
read by the new shared price resolver. If Track A prefers no FK (as
`markup_rules.itemKey`, `schema.ts:4167`), the registry does not see it and
the key rule must be tested directly instead.

**Not needed:** a compare-supplier column (viewer setting), a flag column for
the switch (read-time comparison), a per-line "parts off supplier" count
(read from `snapshotPriceParts`).

## 7. Screens affected

- **Materials → Supplier pricing** (`MaterialDatabasePage.tsx`): a column
  per supplier with price and age; "your price" stays its own column; add
  / rename / retire a supplier; the new import with preview and undo.
- **Materials → Catalog:** unchanged, except the price shown is your price
  or, when a default supplier is set, that supplier's (labelled which).
- **Settings → Pricing:** "Default supplier" with `CompanyDefaultNotice`.
- **Bid screen:** the supplier picker (2+ suppliers), the per-line
  "priced from" and flag, the "Re-price N lines" button, the compare
  column and the per-bid savings sentence.
- **Proposal / quote app / customer CSV:** nothing. Supplier and compare
  are internal and never print.
- **Materials list for a supplier:** unchanged (quantities, no prices).

## 8. Questions for the owner — ALL ANSWERED 2026-10-07: yes to Q1–Q4

The owner took every recommendation below. Two additions came with the
answers: Q1's own-price parts are **visibly marked on the bid** (§ 3.1),
and Q4's re-price applies markup **exactly once, never twice, with a test**
(§ 3.6). Plan only — nothing built.

| #   | Question                                                                                                               | Recommended                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Q1  | The bid's supplier has no price for a part. Use your own price for it (and say so on the line), or call it not priced? | **Use your own price, and say "1 part not from Graybar".** Not priced would blank lines a partial list does not cover. |
| Q2  | A supplier is a short list of names (a table), not free text?                                                          | **Yes.** Free text lets "Platt" and "Platt Electric" split one supplier. Hard to undo later.                           |
| Q3  | A first import with no default supplier set: offer "make this my default", ticked?                                     | **Yes, ticked, visible.** Otherwise the import prices nothing on a bid.                                                |
| Q4  | "Re-price from Graybar" re-applies markup on the new prices too?                                                       | **Yes**, the same as adding the line fresh. Labor stays frozen.                                                        |

## 9. Summary

- Today a material has **one** price and a free-text supplier name on the
  row (`schema.ts:760, 842`); nothing else supplier-shaped exists.
- New: `suppliers` and `supplier_prices` (price + as-of date + typed or
  imported, keyed by the shipped item id), **beside** your own price, never
  replacing it.
- Company default supplier with a per-bid override, NULL = inherit, the
  `productivityPct` pattern; nothing ever picks the cheapest.
- The line freezes its cost, the supplier it came from and its parts; a
  supplier switch flags lines and offers one re-price button, never silent.
- Compare shows the other supplier's cost and savings per line and per bid,
  says "3 of 5 parts listed" rather than a false saving, and shows stale
  dates in colour.
