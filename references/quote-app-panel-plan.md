# Priced takeoff CSV and the "For your quote app" panel: plan

**PLAN ONLY, 2026-09-29, on `track-b` at `977b789` (local-dev merged in). Not
built.** Every file:line below was read at that commit. **The owner answered
all seven questions the same day** (§ 1a), and made two changes that this file
now carries: the panel shows the price TO THE CUSTOMER, with a worked example
(§ 5, "What the panel shows"), and unpriced lines no longer refuse the panel
(§ 5, "When lines are not priced").

## As built (2026-09-29, `track-b`) — what differs from the plan below

The plan is kept as written; this is what changed while building, so it is
not read as a description of the code.

| Piece           | Commit(s)                | Differs from the plan                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quote-app panel | `8f74785` + screen fixes | Feature id is `quoteapp.panel`, lowercase — `scopeDiscipline.test.ts` accepts only `[a-z.]` ids. Blocks on a line whose hours carry a **$0 labor rate** too ("labor rate not set"), found on screen: 20 h at a starter $0 rate showed Labor as "None". Copy races a 1.5 s timer and falls back to selecting the plain `1452.00`. Example-price slot (§ 6) is the panel line only, fed `0`; no stub function.                               |
| Priced CSV      | `9295841`                | One shared **dialog**, not a popover (§ 7), because the bid's Send menu cannot host a popover. A traced part with no labor unit keeps its material cost with status "Priced, no labor hours on N parts" — the bid's Cost column shows it, so blanking it would disagree. The footer names Not-priced lines at what the bid counts so far, so it still ties to Direct cost. `Example price` status is not emitted (nothing can be one yet). |

Source: the owner's Stage 5 notes, pasted into the session on 2026-09-29.
Nothing about them was in the repo. The parts this plan depends on are quoted
in § 1 so the next reader does not have to find that conversation.

**Schema verdict: neither piece needs a migration.** Two things need one to
reach their best version. They are written up for Track A in § 10, and each has
a working v1 without it.

---

## 1. What was asked (owner, 2026-09-29)

- **CSV:** "add prices to the existing export". Prices stay **off by default**,
  behind an explicit checkbox. This agrees with the Stage 5 decision
  (`references/stage-5-track-b-plan.md` Q1, and the header of
  `shared/takeoffExport.ts`): "prices come later as an explicit choice, off by
  default".
- **The quote app** is the owner's company's own app for quotes and invoices,
  not a public product. It has no estimating and maybe no import. It is keyed
  **field by field on a phone**, so a pasted table does not help.
- A quote there holds one or more **scopes** (for example "Scope #1 - Panel
  change out"). Each scope has **five buckets, in this order: Tasks, Material,
  Equipment, Labor, Misc.** Material and labor go in as lump sums (Material
  1,050 LS, Labor 1,800 LS). A permit goes in as a task ($85).
- **The quote app taxes labor as well as material**, so the panel always sends
  **pre-tax** numbers and says so on screen. It never adds tax or works it out.
  If tax is shown later, it comes from the tax the bid already calculates.
- **BidRidge is not reshaped to match.** The panel is an **adapter**: it totals
  BidRidge's structure into the quote app's shape.
- **Best version:** every number has its own copy button.
- **Example prices** (decided 2026-09-21, not built): starter items will ship
  with a price, shown as an "EXAMPLE PRICE" labelled with its source and date.
  A bid that uses any says so in one line, and editing the price makes it the
  shop's own. This needs the parent/variant work first. **Rule now:** an
  unpriced line is never shown as $0, and the CSV and the panel mark unpriced
  and example-priced lines plainly.

## 1a. The owner's answers and changes (2026-09-29, second round)

| #   | Question                      | Answer                                                                                     |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Q1  | One scope per bid for v1      | **Yes**                                                                                    |
| Q2  | Every charge in Misc until H1 | **Yes**                                                                                    |
| Q3  | Copy exact cents              | **Yes**                                                                                    |
| Q4  | Internal tier first           | **Yes**                                                                                    |
| Q5  | Subs and Attached items       | Defined below. **Subs go in Misc for now, Attached items stay out**, and the panel says so |
| Q6  | CSV carries cost, not sell    | **Yes**. "It is a takeoff"                                                                 |
| Q7  | Prices on whole-bid rows only | **Yes**                                                                                    |

**The owner's definitions:**

- **Subs**: subcontractor lines (fire alarm, trenching, controls). Each has its
  own markup, usually lower than on self-performed work.
- **Attached items**: alternates, unit prices, allowances, exclusions and
  acknowledged addenda. **They are not in the money column.**

**Two changes:**

1. **The panel shows the bid's price TO THE CUSTOMER.** Material and labor are
   shown with markup, overhead and profit included, before tax, never as raw
   cost, and the panel says so in plain words. **Confirmed: that is what § 5
   already specified** (the charge split, as the QuickBooks export does). This
   round adds the on-screen wording and a worked example that adds up to the
   cent.
2. **Unpriced lines no longer refuse the panel.** It opens, lists each unpriced
   line as "Not priced", and shows **no totals and no copy buttons** until they
   are fixed. **This replaces the first draft's rule** that the panel refuses to
   open when a line cannot be priced (the `refuseIfIncomplete` behaviour copied
   from QuickBooks) and its "shown, not blocked" rule for unpriced lines. Both
   are struck through in § 5 below rather than deleted.

**And one check (owner):** the five buckets, every charge in Misc included,
must add up **exactly** to the bid's pre-tax total, meaning Total due minus
tax. That is T1 in § 8, and the worked example in § 5 shows it to the cent.

---

## 2. What exists

- **The money, computed once.** `bidRollup` (`server/bidPricing.ts:494`) is
  what `bids.get`, the proposal and the QuickBooks export all price through. It
  returns `materialCost`, `materialMarkup`, `laborCost`, `workPrice`,
  `expenseLines` (each with `charged`, `taxable` and `markedUp`),
  `expensesTotal`, `subtotal`, `salesTaxAmount`, `totalDue`, `notPriced`
  (`{ lines, parts }`), `incomplete`, and `unitTotals` per `unitLabel`.
- **The adapter pattern already exists: the QuickBooks export.**
  `server/routers/accountingRouter.ts` runs the same `bidRollup` and hands the
  totals to the pure builder `shared/accountingExport.ts`. That builder
  computes nothing of its own. It splits the **charge, not the cost**, through
  `apportionWorkPrice` (`shared/pricing.ts:841`), which is the same split sales
  tax uses. Overhead and profit are spread into material and labor rather than
  shown. `refuseIfIncomplete` stops it when the engine cannot price a line.
  The quote-app panel is the same shape with a different target.
- **Where each piece sits in the price** (`shared/bidExtras.ts` ~110):
  ```
  materials + labor + marked-up charges  → direct cost
  + material markup, overhead, profit    → bid price   ("bottom of the bid")
  + flat charges                         → subtotal    ← the panel stops here
  + sales tax                            → total due
  ```
- **What the owner's bid sections are in code:**

  | Owner's section  | In code                                                                                                                              |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
  | Material         | `snapshotMaterialCost` plus `snapshotMarkupPct` on `bid_line_items`                                                                  |
  | Labor            | hours × rate × modifiers × productivity, per line                                                                                    |
  | Direct job costs | **Additional expenses**: `bid_expenses`, from the `expense_items` library. Each has `taxable` and `markedUp`, and **no kind column** |
  | Bottom of bid    | overhead + profit (`calculateBidPrice`, `bottomOfBidRatio`)                                                                          |
  | Subs             | **Not built** on any branch (track-b, track-c, a-email-reset, main, staging). Subcontractor lines with their own markup (§ 1a)       |
  | Attached items   | **Not built** on any branch. Alternates, unit prices, allowances, exclusions, addenda: not money (§ 1a)                              |

  The quoted line type (`references/material-markup.md` D4, "supplier-quoted
  gear") is also not built. It is the nearest existing decision to Subs, since
  both are lines with their own markup.

- **Unpriced lines.** `lineNotPriced` / `lineHoursUnset`
  (`shared/lineNotPriced.ts`) are the rule, and `LineCost` is the one cell that
  renders it. `countNotPriced` feeds `notPriced`.
- **The takeoff CSV.** Its builder is `shared/takeoffExport.ts` and its router
  is `server/routers/takeoffExportRouter.ts` (`scoped("bids.view",
"bids.edit")`). `client/src/hooks/useTakeoffExport.ts` downloads it **in one
  click**, from TakeoffPage (:4805) and from the bid's Send menu
  (`BidsPage.tsx:709`). It has no dialog, so there is nowhere to put a checkbox
  yet.
- **Permission.** `"pricing.view"` exists (`shared/permissions.ts`) and means
  "see what things cost and what the company charges".

---

## 3. The one rule both pieces follow

**Neither piece computes money.** Both read `bidRollup` for the bid and the
bid's own priced lines, then reshape. A second implementation of the money is
how an export comes to disagree with the bid it was made from, and in the
quote app nobody re-checks a figure against BidRidge. That is the accounting
export's argument, and it is stronger here.

### Where tax slots in: after markup, before export

Each piece is three explicit stages:

```
1. PRICE    bidRollup                      material, labor, markup, O&P, charges
2. TAX      the bid's own salesTax result  v1: NOT READ. The builder's input type
                                           carries  tax: { shown: false }
3. SHAPE    pure builder in shared/        buckets / CSV rows, no arithmetic
            beyond sums of what stage 1 returned
```

When tax is shown later, stage 2 becomes `tax: { shown: true, amount:
totals.salesTaxAmount }`. The builder then adds one "Sales tax (from the bid)"
line after the pre-tax figures. No bucket changes. The builder never imports
`calculateSalesTax`, and a test checks that (§ 8, T6).

**The test to add when tax is built:** `server/quoteAppPanel.test.ts`, "sales
tax changes the tax line and nothing else". Price the same bid three ways: tax
off, tax on material only, and tax on material and labor. Assert that:

- every bucket in every scope is identical to the cent across all three;
- the tax line equals `bidRollup(...).totals.salesTaxAmount`;
- pre-tax total + tax line = `totalDue`.

A panel that worked tax out itself, or let it leak into a bucket, fails at
least one of the three.

---

## 4. Piece 1: prices in the takeoff CSV

### The choice

- The one-click download becomes a **small popover**. It has an "Include
  prices" checkbox, **unchecked every time and never remembered**, and a
  Download button. A remembered "on" is how a priced file gets forwarded to a
  supply house by accident.
- The checkbox **only appears for someone with `pricing.view`**. The server
  refuses `includePrices: true` without it rather than trusting the client.
- The filename says which file it is: `<bid> takeoff <date>.csv` or `<bid>
takeoff with prices <date>.csv`.

### What gets priced

- **Whole-bid rows only.** Per-sheet rows stay quantities. A price belongs to a
  BID LINE, and a line is whole-bid: one counted group across five sheets is
  one line. A per-sheet price would be a split the bid never made. It would
  also stop being true under a quantity lock or with `laborQty`.
- New columns, present **only** when prices are on:
  `Price status | Unit cost | Line cost`.
  - **Line cost** is the line's direct cost, the same figure the bid's Cost
    column shows (`LineCost`). It is a cost document, like the bid screen, not
    a sell price. The sell view is the panel's job. See Q6.
  - A **run type** is up to several bid lines (pipe, conductor, ground,
    fittings, field bends; `runMaterialRole`). Its row carries the **sum** of
    those lines. Unit cost is blank, because there is no single unit.
- **Price status**, one word per row, and **never $0 for a gap:**

  | Status                     | When                                                        | Cost cells                 |
  | -------------------------- | ----------------------------------------------------------- | -------------------------- |
  | `Priced`                   | every line behind the row is priced                         | filled                     |
  | `Not priced`               | `lineNotPriced` or `lineHoursUnset` on every line behind it | **blank**                  |
  | `Part not priced (1 of 3)` | some of a run type's lines                                  | the sum of the priced part |
  | `Example price`            | slot only, see § 6                                          | filled                     |
  | `Not on bid`               | counted or traced but never sent                            | blank                      |
  | `Can't price`              | the engine could not price it (`priceLineGuarded` problem)  | blank                      |

- **Quantity lock.** With `bids.quantitiesLockedAt` set, a row's Quantity (the
  live marks) can differ from the quantity the line is priced on. The priced
  file adds a `Qty on bid` column when any row differs, and a note naming the
  lock date. Otherwise a reader multiplies the wrong two numbers.

### The footer, so the file ties to the bid

After the whole-bid block, only when prices are on:

```
Lines from the plans (priced rows above)     $X
Other lines on the bid (not from the plans)  $Y   (N lines)
Direct cost                                  $Z   = the bid's Direct cost
Not priced                                   N lines, M parts: not in these figures
```

It stops at **direct cost**, and that is deliberate. It is a cost document.
Overhead, profit, markup and tax are not in it, so tax never touches it.

---

## 5. Piece 2: the "For your quote app" panel

### Scopes: how a bid becomes scopes. Recommendation first

**Decided (owner, Q1): one scope, the whole bid,** named after the bid (with a
copy button, since the quote app asks for the name too). Option D below is
**not planned** for now. Its schema handoff was dropped from § 10 at the
owner's request.

Options considered:

| Option                                 | For                                                                                         | Against                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. One scope = the bid** (rec.)      | Exact by construction. No split to explain. Matches the owner's example: one job, one scope | A multi-part job is one lump                                                                                                                                                                                         |
| B. One scope per `unitLabel`           | The field exists, and `unitTotals` already rolls up by it                                   | Units are repeats ("Room 101"), not scopes. Charges belong to no unit, so a "Rest of the job" scope appears. Each unit needs its own material/labor split, and cents need a largest-remainder pass to sum to the bid |
| C. One scope per kit (`sourceKitName`) | "Panel change out" reads like a kit name                                                    | Provenance only (schema comment: "never a live link"). Lines are edited after they arrive, so the grouping would be a guess wearing a label                                                                          |
| D. A real scope field on lines         | Right, if multi-scope quotes are common                                                     | A migration plus a way to assign lines on the bid screen. Its own piece. Not planned now (owner, 2026-09-29)                                                                                                         |

### Buckets: how BidRidge maps into the five

Shown in the quote app's order. Tasks and Equipment fill only once H1 exists.
Until then every charge is in Misc (owner, Q2):

| Bucket        | Source                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tasks**     | Additional expenses the estimator marks as a **task** (permit $85, inspection)                                                                                                                     |
| **Material**  | The **material share of the work price**: `apportionWorkPrice(...).materialCents`. Material cost + material markup + its share of overhead and profit. The same split sales tax and QuickBooks use |
| **Equipment** | Additional expenses marked **equipment** (lift rental)                                                                                                                                             |
| **Labor**     | The remainder of the work price, so Material + Labor = work price **exactly**                                                                                                                      |
| **Misc**      | Every other additional expense                                                                                                                                                                     |

- **Each charge enters at `charged`, not `amount`.** A flat charge is billed at
  cost and a marked-up one carries its overhead and profit, as on the bid. The
  buckets therefore sum to the bid's **pre-tax subtotal** (`workPrice +
expensesTotal`). A test holds that (T1).
- **"Bottom of the bid" gets no bucket.** Overhead and profit are spread into
  Material and Labor, as the accounting export does. The quote app has nowhere
  else to put them, and putting them in Misc would hand the customer the
  margin as a line.
- **Tasks and Equipment cannot be filled correctly in v1**, because an expense
  has no kind. Guessing from the name (a "permit" regex) is the silent
  wrong-bucket failure the owner asked not to have. So:
  - **v1:** every charge goes in **Misc**, **listed by name with its own amount
    and copy button**, so it can be keyed into Tasks or Equipment by hand. The
    panel says in one line: "Charges are all under Misc until each one says
    which bucket it goes in."
  - **With handoff H1** (a nullable `quoteBucket` on `expense_items` and
    `bid_expenses`): the library row says "Permit → Tasks" once, and every bid
    after that sorts itself. NULL still means Misc. This is the "build it once,
    one click every job" end of the manual-to-automated rule (CLAUDE.md), and
    v1 is the manual end. Both work.
- **Subs (owner, Q5): Misc for now.** When subcontractor lines are built, each
  one enters Misc as its own named row, at its price **to the customer** (its
  own markup, then overhead and profit, as the bid prices it), never at what
  the sub charges. It is one entry in the builder's mapping table, not a new
  builder.
- **Attached items (owner, Q5): left out.** Alternates, unit prices,
  allowances, exclusions and addenda are not in the money column, so they are
  not in any bucket.
- **The panel says both on screen**, in one line under the buckets: "Subcontract
  lines are under Misc. Alternates, allowances, unit prices, exclusions and
  addenda are not in these figures; they are on the proposal." (The last
  clause holds only once attached items exist. Until then the line reads
  "Subcontract lines, when you add them, go under Misc.")

### What the panel shows: the customer's price, before tax

**Every figure is what the customer pays**, never what the work costs the
shop. Material and Labor each carry their markup and their share of overhead
and profit, and each charge carries what the bid bills for it. That is the
QuickBooks export's split (`apportionWorkPrice`), for the same reason: the
quote app has no line for overhead or profit, so they have to be inside the
two numbers. Leaving them out would under-quote the job by exactly the margin.

**On screen, in plain words**, directly under the heading:

> **What you charge the customer, before tax.** Material and labor include
> your markup, overhead and profit. These are not your costs.

#### Worked example, to the cent

This is the engine's own arithmetic (`calculateLineItem`, `calculateBidPrice`,
`billTheBid`), not a new formula. **Measured, not worked by hand:** on
2026-09-29 these inputs were run through those functions at `977b789`
(`calculateLineItem` → `calculateBidPrice` → `bottomOfBidRatio` →
`priceExpenses` → `apportionWorkPrice`). They returned every figure below:
finalPrice 2601.5, ratio 1.21, charged [242, 85], workPrice 2359.5, material
90750¢, labor 145200¢, subtotal 2686.5. T1a keeps it that way.

| Input         | Value                                              |
| ------------- | -------------------------------------------------- |
| Material cost | $600.00, material markup 25%                       |
| Labor         | 20 h × $60.00 = $1,200.00                          |
| Lift rental   | $200.00, **marked up** (takes overhead and profit) |
| Permit        | $85.00, **flat** (billed at cost)                  |
| Overhead      | 10% (percentage)                                   |
| Profit        | 10%, **markup** method                             |

| Step                                               | Figure       |
| -------------------------------------------------- | ------------ |
| Direct cost = 600 + 1,200 + 200 (marked-up charge) | 2,000.00     |
| + material markup 25% × 600                        | 150.00       |
| = cost with markup                                 | 2,150.00     |
| + overhead 10% × 2,150                             | 215.00       |
| = cost with overhead                               | 2,365.00     |
| + profit 10% × 2,365                               | 236.50       |
| = **bid price** (`finalPrice`)                     | **2,601.50** |
| Bottom-of-bid ratio = 2,601.50 ÷ 2,150.00          | 1.21         |
| Lift rental charged = 200.00 × 1.21                | 242.00       |
| **Work price** = 2,601.50 − 242.00                 | **2,359.50** |
| Material share = 2,359.50 × 750 ÷ (750 + 1,200)    | 907.50       |
| Labor = remainder, 2,359.50 − 907.50               | 1,452.00     |
| Permit charged (flat)                              | 85.00        |
| **Subtotal (pre-tax)** = 2,359.50 + 242.00 + 85.00 | **2,686.50** |

What the panel shows (v1, with every charge under Misc):

| Bucket               | Shown                                                 | Copies                      |
| -------------------- | ----------------------------------------------------- | --------------------------- |
| Tasks                | None                                                  | nothing                     |
| Material             | $907.50                                               | `907.50`                    |
| Equipment            | None                                                  | nothing                     |
| Labor                | $1,452.00                                             | `1452.00`                   |
| Misc                 | Lift rental $242.00, Permit $85.00 (Misc $327.00)     | `242.00`, `85.00`, `327.00` |
| **Total before tax** | **$2,686.50**, shown to check against, no copy button | —                           |

**It adds up:** 907.50 + 1,452.00 + 327.00 = **2,686.50** = the bid's subtotal.

**And it equals Total due minus tax.** Suppose the bid taxes material at 8% on
the price: tax = 907.50 × 8% = 72.60, and Total due = 2,686.50 + 72.60 =
2,759.10. Then 2,759.10 − 72.60 = 2,686.50. The tax figure is only an
illustration, since it depends on the company's tax settings. The identity
does not depend on it: `billTheBid` defines `totalDue = subtotal + tax`
(`server/bidPricing.ts` ~777), so buckets = subtotal = Total due − tax for any
tax setting. T1 asserts both halves against real rollups.

**The raw costs appear nowhere in the panel:** $600, $1,200, $2,000 and the
$200 lift. T3b in § 8 checks that.

### When lines are not priced: list them, no totals, no copy buttons

**Owner, 2026-09-29. This REPLACES the first draft's two rules**, which are
kept here so the change is visible:

> ~~`incomplete`: the panel refuses, exactly as `refuseIfIncomplete` does for
> QuickBooks.~~ ~~Not priced: shown, not blocked, with a strip saying how many
> lines are not in the figures.~~

**The rule now:**

- **The panel always opens.** If any line is not priced (`lineNotPriced` or
  `lineHoursUnset`), or any line cannot be priced (`incomplete`, a
  `priceLineGuarded` problem), it shows **only**:
  - a heading: "This bid has lines without a price. Price them on the bid, then
    come back for the figures.";
  - **each such line by name**, with **"Not priced"** (or **"Can't price"**
    for an engine problem) in the place a figure would go, and a link to the
    line on the bid;
  - **no bucket figures, no total, no copy buttons**, not even for buckets the
    unpriced lines do not touch. A partial set of figures keyed into a quote
    reads as a whole one.
- **Never $0 for a line with no price.** Not in the list, and not as a bucket.
- Once the last line is priced, the figures appear. The staleness rule below
  is what makes that happen without reopening the panel.
- The router therefore does **not** call `refuseIfIncomplete`. It returns a
  doc in one of two states, `{ state: "blocked", lines }` or
  `{ state: "ready", scopes }`. That is a union, so the client cannot render a
  figure from a blocked doc: the ready fields do not exist on it.
- **Example-priced lines do not block.** They are priced. The panel shows the
  figures with the § 6 line above them.

### Other states

- **An empty bucket** (no charges in Tasks) shows **"None"** with no copy
  button. The quote app field stays blank, which is not the same as typing 0.
- **The sample bid** gets the QuickBooks export's treatment: a warning that it
  is the example job.

### The screen, and copying on a phone

- Opened from the bid's **Send** menu: "For your quote app". It is a dialog on
  desktop and a full-height sheet at phone width (`h-dvh`, one scroll region,
  CLAUDE.md § Responsiveness 4).
- The layout is one card per scope, then the five buckets in the quote app's
  order. Each row reads `Material   $1,050.00   [Copy]`, with the charges
  under Misc as indented named rows, each with its own Copy.
- **What Copy puts on the clipboard: `1050.00`.** No `$`, no comma, because
  that pastes into a numeric field on a phone. The screen shows `$1,050.00`. A
  brief "Copied" flashes on the row (the green-flash idiom from § Editing
  fields rule 4) with an `aria-live` announcement.
- **Pre-tax, said twice:** the heading reads "What you charge the customer,
  before tax" (above), and the footer reads
  "Before tax. Your quote app adds its own tax, on labor as well as material."
  When the bid has tax on, it adds: "so its total will not match this bid's
  Total due ($X)." Silence there would look like an error when the two totals
  differ.
- The **pre-tax total** is shown for checking and has no copy button. The quote
  app adds its buckets up itself, and a copyable total invites typing it
  somewhere as a sixth figure.
- **Staleness** (CLAUDE.md, the 2026-09-19 class): the panel's query is keyed
  by bid and **added to the bid screen's existing refresh helper**, not only
  refetched on open. Check: open the panel, edit a line price in the bid
  behind it, and watch the number move.

---

## 6. Example prices: the slot, built now and fed later

Nothing can be example-priced until A's work lands (H2). So v1 builds the
**rendering path** and leaves the **data path** at zero, in a way that cannot
quietly stay wrong:

- `shared/examplePrice.ts` exports `lineUsesExamplePrice(line)`. Its input type
  has **no field it could read yet**, so it returns `false` with a header
  saying why and naming H2. When H2 adds the snapshot column, the parameter
  type gains the field, and **every caller fails to compile until it passes
  it** (the `circuitWire(row)` pattern: take the row, not a picked field).
- Both builders already carry an `examplePriced: { lines, parts }` tally and
  render it: CSV status `Example price`, and the panel line "2 lines use an
  example price (source, date). Check them before quoting." **Tested with
  fixture tallies now** (T4), so the day real data arrives, the screen is
  already proven.
- **Why the flag must be snapshotted on the line, not read live from the
  material:** the line freezes its cost when it is added. If "example" were
  read from the library, editing the library price later would flip an old
  bid's flag while its frozen cost stayed an example. That is a wrong label on
  a number, which is why H2 includes a snapshot column.

---

## 7. File layout

**New**

| File                                             | What                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/quoteAppExport.ts`                       | Pure builder. `QuoteAppSource` in (rollup totals, priced expense lines, per-bucket not-priced and example tallies, `tax: { shown: false }`), and `QuoteAppDoc` out (scopes → five buckets, named Misc rows, notes). `BUCKET_ORDER` constant. `clipboardAmount(n)` → `"1050.00"`            |
| `server/routers/quoteAppRouter.ts`               | `quoteApp.get({ bidId })`. Same loads as `accountingRouter`, same `bidRollup`. **No `refuseIfIncomplete`**: returns `blocked` with the unpriced lines, or `ready` (§ 5). Scoped by `ctx.scope.dataUserId`. Gated by `internalProcedure("quoteApp.panel", "bids.view")` plus `pricing.view` |
| `server/quoteAppPanel.test.ts`                   | T1–T6 (§ 8). Beside the rollup, as `accountingExport.test.ts` is, so the builder is tested against real `bidRollup` output                                                                                                                                                                 |
| `shared/examplePrice.ts`                         | § 6                                                                                                                                                                                                                                                                                        |
| `client/src/components/QuoteAppPanel.tsx`        | The dialog/sheet. Copy rows use one small `CopyAmountRow` inside the file, so the scope rows and Misc rows are one component                                                                                                                                                               |
| `client/src/components/TakeoffExportPopover.tsx` | Checkbox + Download. Used by **both** TakeoffPage and the bid's Send menu: one component, not two copies (CLAUDE.md § Copying a layout)                                                                                                                                                    |

**Changed**

| File                                    | Change                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/takeoffExport.ts`               | Optional `prices` on whole-bid rows and the footer. Columns appear only when the doc says prices were asked for. The header's "no field below a price could go in" is updated to say what replaced it |
| `server/routers/takeoffExportRouter.ts` | `includePrices` input, refused without `pricing.view`. Loads rollup lines and joins them by `takeoffGroupId` / `takeoffRunTypeId`                                                                     |
| `server/takeoffExport.test.ts`          | T7–T9                                                                                                                                                                                                 |
| `client/src/hooks/useTakeoffExport.ts`  | `exportCsv({ includePrices })`                                                                                                                                                                        |
| `client/src/pages/BidsPage.tsx`         | Send menu: popover for Takeoff, a new "For your quote app" entry, and the panel query added to the refresh helper                                                                                     |
| `client/src/pages/TakeoffPage.tsx`      | The "Export takeoff" button opens the popover                                                                                                                                                         |
| `shared/permissions.ts`                 | `"quoteApp.panel": { availability: "internal" }`                                                                                                                                                      |
| `server/routers.ts`                     | Mount `quoteApp`                                                                                                                                                                                      |
| `CHANGELOG.md`, `todo.md`               | Per commit                                                                                                                                                                                            |

## Screens that change

1. **Bid screen → Send menu**: a new "For your quote app" entry (internal tier),
   and "Takeoff" now opens the popover.
2. **Takeoff screen header**: "Export takeoff" opens the same popover.
3. **New panel**: "For your quote app", on desktop and at phone width.

Nothing else. No change to the bid, proposal, totals or Settings.

---

## 8. Tests: the forcing functions

| #   | File                    | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `quoteAppPanel.test.ts` | **The owner's check. "the five buckets add up to Total due minus tax".** Every bucket, every charge in Misc included, summed in cents, equals `totals.totalDue − totals.salesTaxAmount` **and** `totals.subtotal`, to the cent. Run on a bid with material markup, overhead, profit, one flat and one marked-up charge and a unit label, **with sales tax ON** (so "minus tax" subtracts something), and again with it off. Also checks Material + Labor = `workPrice` exactly. Asserted against the real `bidRollup`, not a figure computed in the test |
| T1a | same                    | **The worked example in § 5, literally**: those inputs give Material 907.50, Labor 1,452.00, Misc rows 242.00 and 85.00, and a total of 2,686.50. A reader can check the plan against the code, and a change to the engine that moves any of them goes red with the numbers in front of it                                                                                                                                                                                                                                                               |
| T2  | same                    | Material equals `apportionWorkPrice`'s material share, the same split the tax base and QuickBooks use                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T3  | same                    | **Blocked state**: a NULL-cost hand line, a NULL-hours line and an engine problem give `state: "blocked"` listing all three by name ("Not priced", "Not priced", "Can't price"). The doc has **no bucket, total or copy value at all**, and no 0 appears anywhere in it. Pricing the lines flips it to `ready`                                                                                                                                                                                                                                           |
| T3b | same                    | **Customer price, not cost**: on the worked example, none of the raw costs (600.00, 1200.00, 2000.00, 200.00) appears in the ready doc, and `INTERNAL_FIELDS` from the accounting export finds nothing                                                                                                                                                                                                                                                                                                                                                   |
| T4  | same                    | Example tally > 0 renders the example note (fixture tally, § 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T5  | same                    | The sample bid carries its warning. An empty bucket is "None", not 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T6  | same                    | Source scan: `shared/quoteAppExport.ts` does not import `calculateSalesTax` or `salesTax`. The builder cannot work out tax                                                                                                                                                                                                                                                                                                                                                                                                                               |
| T7  | `takeoffExport.test.ts` | With prices: **the footer's Direct cost = the bid's direct cost**, and the per-row line costs + "other lines" = it                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T8  | same                    | Without prices: the file is **byte-identical** to today's. A scan of the file finds no `$`, and no cost or price header                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T9  | same                    | `includePrices` without `pricing.view` is refused. Not-on-bid, not-priced and part-priced rows have blank cost cells                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| —   | **when tax is shown**   | `quoteAppPanel.test.ts` "sales tax changes the tax line and nothing else" (§ 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Plus the look-at-it check (CLAUDE.md): open the panel at 390px wide on "Bar
layout check", copy each number, paste it into a numeric field, then edit a
price and watch it move.

---

## 9. Risks

1. **The quote app's total will differ from BidRidge's Total due whenever tax
   is on**, because it taxes labor and BidRidge may not. This is by design, and
   it is the one that will be reported as a bug. Mitigation: the footer sentence
   in § 5, which names the bid's Total due.
2. **Charges keyed into the wrong bucket in v1**, since everything is Misc until
   H1. Low money risk (the total is right) and a real labelling risk on the
   customer's quote. Mitigation: each charge is named on its own row.
3. **The margin through the back door.** The panel shows sell figures only and
   no overhead, profit or cost. Reuse `INTERNAL_FIELDS` from the accounting
   export as a scan over the panel's doc, as that suite does. The priced CSV
   **does** carry cost, which is why it needs `pricing.view` and is off every
   time.
4. **Staleness**: a panel showing yesterday's number with a copy button beside
   it. Mitigation in § 5, verified by acting and looking.
5. **Cent drift.** Sums are done in integer cents from the rollup, and labor is
   the remainder, never apportioned independently. If multi-scope (B or D) ever
   ships, it needs a largest-remainder pass and a T1 per scope.
6. **Clipboard on phones.** `navigator.clipboard` needs a secure context and a
   user gesture. Both hold on the live site and in the click handler. Fallback:
   select the number's text so a long-press copies it.
7. **Quantity lock** makes the CSV's live quantity and the priced quantity
   differ. Mitigation: the `Qty on bid` column (§ 4).
8. **Example-price slot drifting from the real flag.** Mitigation: the compile
   error in § 6, not a comment.

---

## 10. Handoff for Track A (schema)

**Two items, and neither blocks v1.** Track B builds everything in this plan
without them. Each one, when it lands, is an additive migration that B then
reads. Per-line scopes (the first draft's H3) were **dropped** by the owner on
2026-09-29 and are not handed off.

### H1. A quote bucket on each expense

- **Columns:** `expense_items.quoteBucket` and `bid_expenses.quoteBucket`, a
  nullable enum `task` / `equipment` / `misc`, **no default**.
- **Meaning of NULL:** Misc, which is exactly what v1 does with every charge.
  So there is no window in either order: old code ignores the column, and new
  code reads NULL as today's meaning. It is **additive**, applied at step 1 of
  the three-step deploy (CLAUDE.md § "Deploying a migration").
- **Copied, not linked:** when a library charge is added to a bid, the bucket is
  copied onto `bid_expenses` the same way `taxable` and `markedUp` are, so
  changing the library later does not re-sort an old bid's quote.
- **Who sets it:** the expense library screen and the bid's Additional expenses
  row, each with a three-way choice. That is UI, so it is Track B's after A
  lands the columns. Say which track owns the screens when handing over.
- **B's side once it lands:** the builder reads the bucket instead of forcing
  Misc, T1 gains a charge in each bucket, and the "Charges are all under Misc"
  line comes off the panel.

### H2. The example-price flag, with a saved copy on each bid line

- **On `materials`:** a marker that the price is an example, plus its **source**
  and **date** (the 2026-09-21 decision: an "EXAMPLE PRICE" labelled with
  source and date). Editing the price clears the marker, which is what "makes
  it the shop's own".
- **On `bid_line_items`:** a **snapshot** that this line's frozen cost was an
  example when it was added, nullable (NULL = not recorded, which is every line
  before the migration), with its source and date if the label needs them
  later. It is frozen with the other `snapshot*` fields and **never recomputed**
  from the library, for the reason in § 6: a live read would relabel an old
  bid's frozen number when someone edits the library.
- **Depends on** the parent/variant (`parentId`) work already on A's list, as
  the owner said. Sequence it inside that work, not before it.
- **The meaning change to watch:** once shipped rows carry prices,
  `costPerUnit === 0` stops meaning "nobody priced this"
  (`shared/materialPricing.ts`, and CLAUDE.md § "Where a priced catalog
  lands", which already flags this). The marker is what replaces that
  reading. If any `UPDATE` in H2 writes an existing column, it is a **meaning
  migration**: code first, backfill after.
- **B's side once it lands:** `lineUsesExamplePrice` takes the new field, and
  the compile errors (§ 6) show every place that must pass it. The CSV status
  and the panel line are already built and tested.

---

## 11. Questions for the owner: ANSWERED 2026-09-29, all as recommended

See § 1a for the answers and the owner's definitions. The questions are kept
as asked.

1. **Scopes: one per bid for v1?** _Recommended: yes (option A)._ Multi-scope is
   option D later, if quotes often have more than one.
2. **Charges: all under Misc, each named, until H1 lands?** _Recommended: yes,
   and hand H1 to A._ No guessing buckets from names.
3. **Rounding: copy exact cents (`1050.00`)?** _Recommended: yes._ Rounding to
   whole dollars per bucket makes the quote app's total miss the bid by up to
   $2.50 with nothing saying so. If the quote app only takes whole dollars, say
   so and the panel will round Labor as the remainder, so the total still ties.
4. **Internal tier only at first, like QuickBooks?** _Recommended: yes._ It is
   shaped to one company's app. Opening it to everyone is one word in
   `shared/permissions.ts`.
5. **"Subs" and "Attached items": what are they?** Neither exists in code on
   any branch. _Recommended:_ Subs → Misc as a named line when built. Attached
   items: please describe them. If they are documents, they carry no money and
   the panel ignores them.
6. **CSV prices: cost (as the bid's Cost column) and not sell?** _Recommended:
   cost, stopping at direct cost._ The panel is where sell figures live. A
   priced takeoff with sell prices is a second proposal that goes stale.
7. **Priced rows: whole-bid only, not per sheet?** _Recommended: whole-bid
   only_ (§ 4, why).

---

## 12. Suggested order

1. Priced CSV (§ 4), because it is smaller and proves the line join and the
   status words.
2. Example-price slot (§ 6), shared by both.
3. Quote-app panel (§ 5).

One commit each, on `track-b`, with CHANGELOG entries.
