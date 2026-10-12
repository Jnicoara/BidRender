# Bid methods — markup + charge rate, or cost + overhead + profit. PLAN ONLY

Track C, 2026-10-12. **Plan only: no app code, no migration.** Facts are
cited by file and line from `track-c` at `5974626`. Where a fact was not
found, it says what was searched.

**2026-10-12: the owner APPROVED every pick in § 10**, adding one thing to
Q1: new-shop setup asks "How do you usually bid?", with Cost + O&P
preselected. The Q15 column is BM-M10 (§ 9). **Build order: after scope tags
and the baseline screen**, and after the bid-protection work (math version,
quantity lock, frozen O&P/tax) that this plan's § 7 relies on.

**The owner's request, in one line:** each bid picks ONE way of pricing.
**(A) Markup + charge rate** prices material at cost plus a markup and labor
at an hourly charge rate. **(B) Cost + O&P** prices material and labor at
cost and puts overhead and profit on top. **No stacking:** a bid uses its
method's settings and nothing else.

**Builds on, and overrides:**

- **`material-markup.md` D1 (2026-09-25) is OVERRIDDEN.** D1 said profit
  stacks on marked-up material, and that "both can be on together" with
  the combined margin shown. The owner's rule (2026-10-12) is the opposite:
  **each method uses only its own settings.** D1 now carries a line saying
  so. D1's Route A / Route B are what this plan calls methods A and B.
  Route A's "bottom profit 0" becomes "bottom profit does not exist on A".
- **`material-markup.md` Piece 4 ("Route A/B + the combined number")** is
  replaced by this plan. Piece 5 (the blended markup) becomes § 4's
  effective margin.
- **Rule order** `MARKUP_RULE_ORDER` = item → quoted → category → band →
  company (`shared/materialMarkup.ts` 31–37). The owner's list (item →
  category → bracket → company) is the same order. "Quoted" is a line
  type, not a level. It keeps its slot and only applies on A (§ 3).
- **CLAUDE.md § "Company defaults vs per-bid overrides"** stays: settings are
  inherited, a NULL on the bid follows the company. Owner Q16
  (`baseline-screen-plan.md` § 12) freezes them when a bid leaves Draft. The
  method freezes with them (§ 7).
- **`baseline-screen-plan.md` § 8 (math version)** is how this ships without
  moving an existing bid (§ 7).

---

## 0. What exists today (measured from the code)

- **One engine, `shared/pricing.ts`.** Per line, `calculateLineItem`
  (528–631) does material → assembly overhead hours → modifiers →
  productivity → hours × rate → material markup. Then `calculateBidPrice`
  (750–784) puts overhead on (direct + markup) and profit on that (768–771).
  **Today every bid stacks:** markup AND overhead AND profit, whenever all
  three are set.
- **Labor is always billed at its loaded COST** (`labor_rates.hourlyCost`,
  `drizzle/schema.ts` 948). Burden is stored as parts (`baseWage`,
  `payrollTaxPct`, `workersCompPct`, `insurancePct`, `benefitsPct`, 976–980)
  and folded into `hourlyCost` by `shared/loadedRate.ts` 31–35.
  **There is no charge, bill or sell rate**: searched `chargeRate`,
  `billRate`, `sellRate`, `billingRate`, `pricingMethod`, `pricingMode`.
- **Material markup rules exist:** `markup_rules` (schema 4468–4500; kinds
  item / category / band), company default
  `pricing_defaults.materialMarkupPct` (1456), quoted lines
  `pricing_defaults.quotedMarkupPct` (1465). **But bands and quoted are not
  wired:** `getMarkupRuleSet` hard-codes `quotedLinePct: null` and
  `bands: []` (`server/db.ts` 7494–7498), and pack price is always null
  (7511, 7525).
- **A line records where its markup came from:** `snapshotMarkupPct` and
  `snapshotMarkupSource` (level, label, parts; schema 4734, 4744).
- **Overhead / profit / productivity** live on `pricing_defaults` (1415–1444)
  and as nullable overrides on `bids` (2113–2124). Profit has
  `profitMethod` markup / margin. Conversions exist:
  `markupToMargin` / `marginToMarkup` (`pricing.ts` 869–884).
- **Close-out is built:** `bid_closeouts` (schema 5283),
  `bid_closeout_lines` (5361), `shared/closeout.ts`, `closeoutRouter.ts`,
  and job profitability in `shared/analytics.ts` 300–392.
- **Not found:** prevailing wage, fringe, apprentice rules, wage
  determination (searched prevailing, fringe, apprentice, davis, wage
  determination, certified payroll); change orders and T&M; square-foot or
  per-point figures (searched squareFeet, sqFt, buildingArea, cost per sq).
- **`bids.mathVersion` does not exist yet.** It is planned in
  `baseline-screen-plan.md` § 8 (BS-M7).

---

## 1. The two methods — exactly what each uses

| Part of the price                 | **A — Markup + charge rate**                                | **B — Cost + O&P**                          |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Material                          | cost + material markup (§ 3)                                | cost                                        |
| Quoted gear (`isQuoteItem` lines) | cost + quoted-gear markup                                   | cost                                        |
| Labor                             | hours × **charge rate** (per role, § 2)                     | hours × **loaded cost rate** (as today)     |
| Hours (modifiers, productivity)   | same as today                                               | same as today                               |
| Overhead                          | **not used**                                                | on (material + labor)                       |
| Profit                            | **not used**                                                | on (cost + overhead), markup or margin      |
| Expenses (`bid_expenses`)         | at cost; "Marked up" adds the **material markup company %** | at cost; "Marked up" adds overhead + profit |
| Sales tax                         | as today                                                    | as today                                    |

**No stacking is enforced by the engine, not by the screen.** The engine
takes `method` and reads only that method's inputs. A Cost + O&P call is
never handed a markup to ignore: the markup inputs are not in its type.
`calculateBidPrice` splits into `priceMarkupRate()` and `priceCostOP()`, and
`pricingInputsFor(method, settings)` builds a union whose B member has no
markup field. That makes stacking a **compile error**, not a remembered rule
(CLAUDE.md: prefer a forcing function).

**The test the owner asked for** (`server/bidMethods.test.ts`): one
Cost + O&P bid priced with the company material markup at 0%, then at 50%,
and with a quoted-gear markup of 0% then 50% — **the same total, to the
cent, all four times.** It is red today: today's engine stacks, so 50%
moves the total. The mirror test: an A bid at overhead 0% and 50%, profit
0% and 50%, gives one total.

**Expenses on A (my pick, Q6):** a "Marked up" expense takes the company
material markup %, because A has no overhead or profit to give it. The
other choice is that the switch does nothing on A, which leaves a checkbox
that silently means nothing.

---

## 2. The charge rate (method A)

- **Per role:** `labor_rates.chargeRate`, nullable. "Journeyman — cost
  $62.40/h, charge $95.00/h".
- **NULL charge rate on an A bid = "Not priced", never cost.** Falling back
  to cost would quietly bill labor with no margin at all. It uses the same
  "Not priced" path as an unpriced line (`shared/lineNotPriced.ts`,
  CLAUDE.md § Editing fields rule 6). The total then reads "+ N not priced".
- **Frozen on the line** like the cost rate: `bid_line_items.snapshotChargeRate`
  (NULL on every line made before; § 7). The line also keeps its cost rate,
  because § 4's margin needs it.
- **Starter roles ship with no charge rate** (CLAUDE.md § Starter content
  ships unpriced). The first A bid asks for one, as the first-run flow asks
  for a cost rate today.
- **Under prevailing wage (§ 5)** the cost rate comes from the set and the
  charge rate stays the role's. A charge rate below the PW loaded cost shows
  a warning on the bid: "Charge rate $70.00/h is below this job's prevailing
  wage cost $78.15/h". It is not a block (Q11).

---

## 3. Material markup (method A only)

**Two shapes, one rule list:**

- **Flat:** one company %. That is `pricing_defaults.materialMarkupPct`
  today.
- **Price brackets:** editable rows, "$0–$1: 75%", "$1–$10: 40%"… Add a row,
  remove a row, edit a boundary. These are the existing `markup_rules` rows
  of kind `band` (`bandMinPrice`/`bandMaxPrice`). No new table. The D2
  starter brackets stay inert until accepted.
- `pricing_defaults.materialMarkupMode` (`flat` / `brackets`, NULL = flat)
  picks which one the COMPANY level uses. Both shapes feed the same walk:
  **item → (quoted) → category → bracket → company default.** The first
  that matches wins.
- **Brackets key on unit price until pack price exists.** D3 says pack
  price, but `packPrice` is always null (`db.ts` 7511). My pick (Q8): key on
  the material's unit price now, and switch to pack price only when pack
  sizes ship, as a math version (§ 7).
- **Wiring:** `getMarkupRuleSet` stops hard-coding `bands: []` and
  `quotedLinePct: null`. That alone changes numbers on bids whose company
  has band rules. Measured on `bidrender_local_c` before the build: how many
  companies have accepted band rules. Live has 3 companies.
- **Each line shows where its markup came from.** That is already recorded
  (`snapshotMarkupSource`). It shows in small grey text under the line's
  cost: "Markup 40% — bracket $1–$10", "Markup 25% — item override",
  "Markup 30% — Panels category", "Mixed — 3 rules". On B lines it says
  nothing (no markup applies).
- **Brackets can't overlap or leave a gap.** The editor refuses an overlap.
  A gap is allowed and says "Items between $10 and $25 fall to the company
  %", so a price never lands on nothing.

---

## 4. Effective margin — on both methods

One line under the bid total, on both methods:

> **Effective margin 27.4%** (markup 37.7%) · cost $18,420.00 → price $25,380.00

- **Cost** = material at cost + labor at LOADED COST + expenses at cost.
  On A, this uses the frozen cost rate, never the charge rate.
- **Margin** = (price − cost) ÷ price. **Markup** = (price − cost) ÷ cost.
  Both are shown, with their names, because they are the two numbers people
  confuse.
- **Every percentage input names itself INSIDE the field:** a suffix
  "% markup" or "% margin", not a label above it. This uses the existing
  `PercentKindInput` (`client/src/components/PercentKindInput.tsx`, suffixes from `client/src/lib/percentKind.ts`). Profit on B already
  has a markup/margin switch. Material markup and brackets on A are always
  markup, and say so in the field.
- Price before tax. Tax is not margin.
- It changes no number. It reads the rollup.

---

## 5. Prevailing wage — in the LABOR section

**Saved wage sets**, one per wage determination:

- **A set:** name ("Pierce County public works 2026"), wage determination
  number, date set, and **re-check due = date set + 6 months**.
- **Rows in a set, one per classification:** Journeyman, Apprentice,
  Trainee (rows can be added). Each has **base wage** and **fringe**, typed
  separately, and the role it stands in for (`laborRateId`).
- **Burden still goes on top:** loaded cost = base × (1 + payroll tax + comp
  - insurance) + fringe. The burden %s come from the role. Benefits % is NOT
    applied when the set carries fringe, because fringe IS the benefit (Q13).
- **A bid picks a set** (Labor section of the bid). Lines then cost at the
  set's rates. On A, they charge at the role's charge rate (§ 2).
- **Apprentice rate only for registered apprentices.** When a set has an
  apprentice row, the bid asks once: "Will registered apprentices work this
  job?" Unanswered or No: every apprentice line costs at the **journeyman**
  rate. Yes: the apprentice rate. The answer is stored on the bid.
  Unanswered is never treated as yes, because the wrong guess underbids a
  public job.
- **Re-check reminder:** after 6 months the set shows "Re-check WD 2026-0123
  — set 7 months ago". **Before printing or sending** a bid on a set past its
  re-check date, a warning (not a block, same shape as the example-price
  warning): "This bid uses a wage determination set 7 months ago — check it
  before this goes out."
- **Picking a set on a Draft re-costs its labor lines.** That moves the bid,
  so it is a button with old → new shown: "Use this wage set — labor
  $12,400.00 → $15,180.00". On a non-Draft bid it is not offered (Q14).

---

## 6. Follow-ons — room left, not built here

- **Completed-job report in the method the job was bid.** The close-out
  exists (`bid_closeouts`, `shared/closeout.ts`). The report reads the
  bid's frozen method. On **A** it shows actual hours × charge rate (billed
  value) against actual hours × cost rate: the labor margin realized. On
  **B** it shows actual cost against estimated cost: overhead recovered and
  profit kept. Built with the labor feedback loop later. **Room needed now:**
  only the frozen `bids.pricingMethod` (§ 7). The report needs no column of
  its own.
- **Unit prices** (a price per device or per foot on the proposal) and
  **T&M** for change orders. T&M is method A's arithmetic applied to actual
  hours and material, which is why A's charge rate is per role. Both are
  separate plans.
- **Sanity line:** under the total, "$/sq ft" (when the bid has a building
  area) and "$/point" (price ÷ counted devices). It is a check, never an
  input, and changes no number. Needs `bids.buildingSqFt` (nullable).

---

## 7. Math versions, frozen bids, and existing bids

- **`bids.pricingMethod`:** `markup_rate` / `cost_op`, **NULL = the old
  stacked math**. Every existing bid is NULL, so **no existing bid moves.**
  Stacked is not a third method anyone can pick. It is how bids made
  before this priced, and it stays in the engine as `priceLegacyStacked()`
  for as long as any bid holds NULL (`baseline-screen-plan.md` § 8, point 2).
- **New bids** take the company's method (`pricing_defaults.pricingMethod`,
  NULL = `cost_op`, the owner's own default per D1). A new shop sets it in
  setup: "How do you usually bid?", Cost + O&P preselected (owner Q1).
- **A Draft still on the old math** shows an OFFER, never automatic (owner
  Q19/Q22 spirit): "This bid uses markup AND overhead and profit together.
  Choose one method → Markup + charge rate $24,100.00 · Cost + O&P
  $23,650.00". Choosing writes the method. Active / Won / Lost / locked bids
  get nothing offered (owner Q14).
- **The method freezes when a bid leaves Draft**, together with overhead,
  profit and the rest (owner Q16). Changing it on a Draft is a toggle that
  shows old → new before applying.
- **Line snapshots stay frozen.** `snapshotMarkupPct` and the new
  `snapshotChargeRate` are written when the line is added. **Switching a
  Draft from B to A re-reads markup and charge rate for its lines.** That
  is the one place a snapshot is rewritten. It is allowed only on a Draft,
  only on the toggle, with old → new shown. Without it, a line added under
  B has no markup and no charge rate to freeze. **This is a deliberate,
  narrow exception to "never mutate a snapshot field"**, and it needs the
  owner's yes (Q3).
- **Wiring bands and quoted (§ 3) is a math change** for bids whose company
  has band rules: math version N, Drafts only, `bid_math_changes` row.
- **Each bid shows one line saying what it used**, under the total:
  - "Priced by **Markup + charge rate**: material markup by rule
    (brackets), quoted gear 15%, Journeyman $95/h charge".
  - "Priced by **Cost + O&P**: overhead 12%, profit 10% markup".
  - On old-math bids: "Priced the old way: markup + overhead + profit".
- **Settings pages:** both methods' settings live on `/settings/pricing`,
  saved once. A bid using a method fills them in by inheritance (NULL on
  the bid = company), as overhead and profit do today. **On a bid, the
  other method's settings show greyed with the words "Not used in
  Cost + O&P"** (or "Not used in Markup + charge rate"). They are not
  hidden, because a hidden setting looks like a setting that does not
  exist.
- **Proof per release:** `bidTotals.mts` before and after. Every existing
  bid is identical (they are all NULL = old math), and only fixture bids
  set to a method move.

---

## 8. Build order (C: engine + tests; B: screens; A: migrations)

1. **Engine split + no-stacking tests** (`shared/pricing.ts`): three
   pricers behind one `priceBid(method, …)`. The four-way 0%/50% test.
   Legacy NULL path pinned identical with `bidTotals.mts`.
2. **Charge rate** on roles + `snapshotChargeRate` + "Not priced" on A.
3. **Per-bid toggle + the "what it used" line + greyed settings + effective
   margin** (B's screens).
4. **Brackets wired** (`getMarkupRuleSet`), the bracket editor, "where the
   markup came from" under each line. Math version.
5. **Prevailing wage sets**, the bid's pick, the apprentice question, the
   reminders.
6. Sanity line. Then, as separate plans: completed-job report, unit prices,
   T&M.

---

## 9. Migrations — add-only drafts for Track A, unnumbered

All additive, step 1, nullable with no default. NULL means the old meaning.
**Step 3 is empty.** Hand-written; do not `drizzle-kit generate`.

```sql
-- BM-M1  a bid's method; NULL = priced before methods existed (stacked)
ALTER TABLE `bids` ADD `pricingMethod` enum('markup_rate','cost_op') NULL;

-- BM-M2  the company's method for NEW bids; NULL = cost_op
ALTER TABLE `pricing_defaults` ADD `pricingMethod` enum('markup_rate','cost_op') NULL;

-- BM-M3  flat % or brackets at the company level; NULL = flat
ALTER TABLE `pricing_defaults` ADD `materialMarkupMode` enum('flat','brackets') NULL;

-- BM-M4  the hourly charge rate per role (method A); NULL = not set
ALTER TABLE `labor_rates` ADD `chargeRate` decimal(10,4) NULL;

-- BM-M5  the charge rate frozen on the line; NULL = none (every line before)
ALTER TABLE `bid_line_items` ADD `snapshotChargeRate` decimal(10,4) NULL;

-- BM-M6  prevailing wage sets
CREATE TABLE `wage_rate_sets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `wageDeterminationNumber` varchar(128) NULL,
  `dateSet` date NOT NULL,
  `archivedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `wage_rate_sets_id` PRIMARY KEY(`id`),
  CONSTRAINT `wage_rate_sets_userId_fk` FOREIGN KEY (`userId`)
    REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- BM-M7  one row per classification in a set
CREATE TABLE `wage_rate_set_rates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `setId` int NOT NULL,
  `classification` enum('journeyman','apprentice','trainee','other') NOT NULL,
  `label` varchar(255) NOT NULL,
  `laborRateId` int NULL,
  `baseWage` decimal(10,4) NOT NULL,
  `fringe` decimal(10,4) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  CONSTRAINT `wage_rate_set_rates_id` PRIMARY KEY(`id`),
  CONSTRAINT `wage_rate_set_rates_setId_fk` FOREIGN KEY (`setId`)
    REFERENCES `wage_rate_sets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `wage_rate_set_rates_laborRateId_fk` FOREIGN KEY (`laborRateId`)
    REFERENCES `labor_rates`(`id`) ON DELETE SET NULL
);

-- BM-M8  the bid's wage set and the apprentice answer;
--        NULL set = no prevailing wage; NULL answer = not asked = journeyman rate
ALTER TABLE `bids` ADD `wageRateSetId` int NULL;
ALTER TABLE `bids` ADD `registeredApprentices` boolean NULL;
ALTER TABLE `bids` ADD CONSTRAINT `bids_wageRateSetId_fk`
  FOREIGN KEY (`wageRateSetId`) REFERENCES `wage_rate_sets`(`id`) ON DELETE SET NULL;

-- BM-M9  building area for the $/sq ft sanity line; NULL = not given
ALTER TABLE `bids` ADD `buildingSqFt` decimal(12,2) NULL;

-- BM-M10 (owner Q15, 2026-10-12) fringe paid as cash wages, so payroll tax
--        applies to it too; NULL = not ticked = fringe is not taxed
ALTER TABLE `wage_rate_sets` ADD `fringePaidAsCash` boolean NULL;
```

**Note for A:** `bids.wageRateSetId` uses `ON DELETE SET NULL`, but a set is
archived, never deleted (CLAUDE.md § Retire, never delete). The constraint
is a backstop only. BM-M10 needs BM-M6's table, so it runs after it (or fold
the column into BM-M6's CREATE TABLE if both ship together). BS-M7
(`bids.mathVersion`) is a prerequisite of § 7's band wiring, not of
BM-M1–M10.

---

## 10. Owner answers (2026-10-12) — ALL PICKS APPROVED, one addition to Q1

Each line: the question · the answer · whether it moves a bid number.

- **Q1** Default method for a brand-new company? · **Answer: Cost + O&P, AND new-shop setup asks "How do you usually bid?" (Cost + O&P / Markup + hourly rate) with Cost + O&P preselected.** The answer is written to `pricing_defaults.pricingMethod` (BM-M2), so it needs no extra column. Per CLAUDE.md § Onboarding, the setup step counts as done from that row being set, never from the screen being opened. An existing company (NULL) reads as Cost + O&P and is not shown the setup question · Moves a number: no, new bids only.
- **Q2** Existing bids stay on the old stacked math and get an OFFER on Drafts to pick a method? · Answer (approved pick): **yes** · Moves: only when a Draft's offer is accepted.
- **Q3** Switching a Draft's method re-reads markup and charge rate onto its lines (the one snapshot rewrite)? · Answer (approved pick): **yes, Draft only, old → new shown** · Moves: yes, when the toggle is used.
- **Q4** Charge rate per ROLE, or one company charge rate? · Answer (approved pick): **per role** (T&M needs it) · Moves: no.
- **Q5** A bid on Markup + charge rate whose role has no charge rate: "Not priced", or fall back to cost? · Answer (approved pick): **Not priced, never cost** · Moves: no (nothing is priced A yet).
- **Q6** On Markup + charge rate, a "Marked up" expense takes the company material markup %? · Answer (approved pick): **yes** · Moves: yes, on A bids with marked-up expenses.
- **Q7** Quoted gear on Markup + charge rate uses its own % (`quotedMarkupPct`), never the material rules? · Answer (approved pick): **yes** · Moves: yes, on A bids with quoted lines.
- **Q8** Brackets key on the item's unit price until pack prices exist? · Answer (approved pick): **yes, switch later as a math version** · Moves: yes, on A Drafts whose company sets brackets.
- **Q9** Brackets: allow gaps, falling to the company %; refuse overlaps? · Answer (approved pick): **yes** · Moves: no.
- **Q10** Effective margin counts expenses as cost and leaves tax out? · Answer (approved pick): **yes** · Moves: no (display only).
- **Q11** A charge rate below the prevailing-wage cost: warning or block? · Answer (approved pick): **warning** · Moves: no.
- **Q12** Re-check reminder at 6 months and before print: warning, not a block? · Answer (approved pick): **warning** · Moves: no.
- **Q13** With a wage set, skip the role's benefits % because fringe replaces it, but keep payroll tax, comp and insurance on base? · Answer (approved pick): **yes** · Moves: yes, on bids that pick a set.
- **Q14** Picking or changing a wage set is offered on Drafts only, with old → new? · Answer (approved pick): **yes** · Moves: yes, when pressed.
- **Q15** Payroll tax on a fringe paid in CASH (it is taxable when paid as wages)? · Answer (approved pick): **ask per set: "fringe paid as cash" checkbox, off by default** (column `wage_rate_sets.fringePaidAsCash`, BM-M10) · Moves: yes, on sets that tick it.
- **Q16** The "$/sq ft · $/point" sanity line on the bid screen only, never the quote? · Answer (approved pick): **yes** · Moves: no.
