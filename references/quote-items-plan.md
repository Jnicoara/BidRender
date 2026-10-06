# Quote items — plan (Track B, 2026-10-05)

PLAN ONLY. No code, no migration. § 8 lists exactly what Track A would add.

**What it is:** big items whose MATERIAL is priced from a supplier's quote,
not from the catalog — light poles, switchgear, fixture packages,
generators. They are counted like anything else, their LABOR goes on the
bid at once, and only their material waits for the quote.

## 0. What already exists — read before building

Searched 2026-10-05 against `track-b` @ `44f0f5f` (CLAUDE.md § "Where
decisions live"). This plan builds on all of it and re-decides none of it.

| Already decided or built                                                                                                                                     | Where                                                                                  | What this plan does with it                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **D4: "Quoted" is a LINE TYPE** with its own markup %, slot 2 in the markup order. Not built.                                                                | references/material-markup.md D4; `resolvePartMarkup` `quotedLine` (never passed true) | This IS that line type. Builds it, markup slot included.                                                              |
| **Price an unpriced line where it blocks you** — a per-bid price box, "priced on this bid", needs a NULL-able `bid_line_items` price column (Track A). Open. | todo.md "Before beta: price an unpriced line…"                                         | **One column for both** (§ 8). The Quotes screen is that price box for quote items, plus supplier, date and packages. |
| On a bid line, unpriced says **"Not priced", never $0**; one `LineCost` cell; the total says how many it leaves out.                                         | CLAUDE.md § 6 (narrowed 2026-09-26); `shared/lineNotPriced.ts`; `NotPricedTotal`       | "Waiting on quote" is a NAMED kind of not-priced, said the same way.                                                  |
| An unpriced line **blocks a priced proposal print**, no way past (owner, 2026-09-29). Scope-only never blocked.                                              | `ProposalPage.tsx` print block                                                         | Kept for open quotes. See § 7 — one owner question.                                                                   |
| **Locking is always on purpose, never automatic.**                                                                                                           | `shared/quantityLock.ts`; todo.md (owner, 2026-09-27)                                  | The bid-day guard asks; it never locks.                                                                               |
| V19: warn before Send / proposal / Won; "it warns; it does not block". Not built.                                                                            | references/takeoff-spec.md V19                                                         | The bid-day guard is the first piece of V19.                                                                          |
| Catalog prices carry **supplier and date** (`materials.supplierName`, `priceUpdatedAt`); age is fresh / aging (30 d) / stale (90 d).                         | `shared/priceStaleness.ts`; Supplier pricing tab                                       | Same thresholds and words for quote age — one clock, not two.                                                         |
| Materials list has **"Supplier to price — please quote as a package"** for counts with no parts list.                                                        | `shared/materialsList.ts` `forQuote`                                                   | The supplier request list (§ 4) grows out of it.                                                                      |
| Several counts per assembly, one per legend symbol; a fixture tag lives in the count NAME ("Linear (A-7)").                                                  | `shared/assemblyCounts.ts`; count-by-tag-plan.md; `fixtureTag()`                       | Each type is its own count, its own line, its own quote.                                                              |

**Watch the word "quote".** It already names the owner's _quote app_
(references/quote-app-panel-plan.md — an export of the customer price, a
different thing), and CLAUDE.md says "a bid line is what becomes a quote"
(the customer's). On screen this feature always says **supplier quote**:
the screen is "Supplier quotes", the warning is "Waiting on supplier
quote". "Lump sum" already means the proposal's one-number presentation,
so a supplier's single price is a **package price** here.

**The trap this plan has to close first.** `lineNotPriced` calls an
assembly line priced whenever its direct cost is not 0, so a pole assembly
with 6 hours of labor and no material reads as **priced** today, at labor
only — a pole bid with no pole in it, and nothing on screen saying so. A
quote item must be judged by its quote, not by its cost (§ 3, § 9 test 1).

## 1. Marking something as a quote item; counting it

**On the assembly (the library way):** "Material priced from a supplier
quote" on the assembly editor. A shipped assembly forks on edit, as now.
Every NEW bid line from that assembly starts as a quote item.

**On the bid line (the by-hand way):** "Price from a supplier quote" on any
counted line, including a plain count that has no assembly. CLAUDE.md § "As
manual or as automated": somebody who never opens the library must be able
to do this, and a library item can be overridden on one job. So the flag
that DECIDES is on the line; the assembly's is only the default a new line
starts with. Both directions, always.

**Counting is unchanged.** A quote item is counted like any item: its
looks, Find all matching, pins, status (only NEW marks are a quantity —
an existing pole buys no pole). **Each type is its own count**, so pole S1
and pole S2 are two counts and two lines and get two quotes:

- through two legend symbols on one assembly (`assemblyCounts`, one count
  per symbol, already built), or
- through the fixture tag in the count name, "Light pole (S1)" /
  "Light pole (S2)" (count-by-tag-plan.md).

**What can be inside a quote-item assembly.** Its labor (hours, rate role)
as any assembly, and optionally catalog parts the contractor buys
themselves (a pole base's anchor bolts, a pad's concrete). Those price
from the catalog as now. The QUOTED material is one more amount on top,
per unit: line material = catalog parts + quoted price.

## 2. Labor now; only material waits

A quote item's line prices its labor from the moment it is sent, exactly as
any line (hours × qty × modifiers × productivity × rate; `laborQty` if
set). Its catalog parts price as usual. Only the quoted amount is empty
until a quote is entered. The line's cost cell (one `LineCost`, shared by
the bid and Count screens):

- waiting: `$2,040.00 labor · waiting on supplier quote` (amber)
- quoted: the full amount, and a small "Platt · Oct 3" under it
- carried (§ 6): the full amount, amber, "Last quote · Platt · Aug 12"

## 3. Never a silent $0

- **On the bid**, under the total, in amber: **"Waiting on supplier
  quote: 2 items — labor is in the total, their material is not."**, with
  a link to the Supplier quotes screen. Beside the existing "N lines not
  priced", not merged into it: the fix is different (a call to a supplier,
  not a price you know).
- **The total says it:** `$32,940.00 + 1 item waiting on supplier quote`
  (the `NotPricedTotal` pattern).
- **`lineNotPriced` learns quote items, first in its order**: a quote item
  is priced only when its quoted material is present (§ 5). Its SQL copy
  `lineNotPricedSql` changes in the same commit (the file's own rule;
  `server/dashboardNotPriced.test.ts`). The Dashboard's not-priced count
  and the quote-app panel's block then include waiting quote items for
  free, because they already read that function.
- **Never 0:** no field on this feature ever turns empty into 0. An empty
  price is "waiting"; a typed 0 is an answer ("supplier includes it free")
  and says so — the existing rule for hand-priced lines.

## 4. The supplier request list — one click

On the Supplier quotes screen: **"Request quotes"**, which produces one
list of every quote item still waiting (or ticked):

| Type              | Tag | Qty | Unit | Notes |
| ----------------- | --- | --- | ---- | ----- |
| Light pole, 25 ft | S1  | 4   | ea   |       |
| Light pole, 25 ft | S2  | 2   | ea   |       |

- Type = the line name (the count's name without its tag); Tag =
  `fixtureTag(name)` or the legend symbol's label; Qty = the line's live
  quantity (new marks only); Notes = a free-text field on the line.
- Header: job name, bid due date, the company's name and the estimator's
  contact. **No prices, ever** — the same rule the materials list already
  keeps ("for the supplier — quantities, no prices").
- **Three ways out, all from the same rows:** Copy (plain text, ready to
  paste into an email), CSV and PDF (the materials-list PDF code), and
  **Email** as a `mailto:` link with the text in the body. No server email:
  the app has none for this and does not need it — the estimator's own
  mail client sends it from the estimator's own address, which is what a
  supply house expects.
- The materials list's "Supplier to price" section lists quote items too
  (today it lists only counts with no assembly), from the same rows, so
  the two cannot disagree.

## 5. The Supplier quotes screen — one per bid, for bid day

`/bids/:id/quotes`, reached from the bid's amber line and its Send menu.
**Not in the nav** (CLAUDE.md: a surface that needs a bid is reached from
the bid). Listed in `shared/navigationTargets.ts` only if the helper should
link to it.

One row per quote-item line: type, tag, qty, labor (already in), **price
each** (InlineNumberField — select on focus, Enter commits, Escape reverts,
green flash; `whenUnset={{ placeholder: "waiting" }}`), extended, supplier,
quote date (defaults to today on first entry), and the state chip (§ 6).

**Two ways to enter a quote:**

1. **Price per item.** Type the each price. Supplier and date are typed
   once at the top ("Quote from: Platt, Oct 3") and apply to every price
   entered while it is set, so ten poles from one quote are ten numbers,
   not ten forms.
2. **One package price for several items** (lighting packages are quoted
   as one number). Tick the items, "Package price…", enter the amount,
   supplier and date. The rows show "in package: Graybar $9,000.00" and
   their own each-price field is replaced by their share.

**How a package price spreads across its items.** The BID uses the package
price exactly, once. The spread only decides what each line shows and what
reports by line (the materials-by-line view, the takeoff CSV with prices,
the quote-app buckets) carry. Rule, in order:

1. **By the share the person typed**, when they typed shares (optional;
   they must add up to the package price, or the screen says by how much
   they do not).
2. Otherwise **by each item's last known price × quantity**, when EVERY
   item in the package has one (its own earlier quote, § 6) — the shape of
   the package follows what the parts cost.
3. Otherwise **by quantity**.

Shares are kept to the cent and the leftover cents go to the largest
share, so **the shares always add up to the package price exactly** — a
spread that is off by a cent is a total that disagrees with itself. Pure
function `spreadPackage()` in `shared/`, where the suite reaches it.

**Markup (D4).** The quoted material takes the company's **quoted-line
markup %** (slot 2 of the markup order — beats category and band, loses
to an item override), frozen on the line in `snapshotMarkupPct` /
`snapshotMarkupSource` like every other markup. A package's price is
marked up once, then spread. Unset % = no quoted-line rule = the order
falls through to the category, as `resolvePartMarkup` already does.

**What a quote does to a line already sent.** Entering a quote writes the
line's per-bid quote columns (§ 8), never a `snapshot*` column (CLAUDE.md:
a snapshot is never mutated). Allowed on a Draft or Active bid whose
quantities are not locked; a locked or Won/Lost bid refuses, with the
standard sentence (as re-applying markup does).

## 6. The last quote carried forward

A quote item on a new bid starts with the **last quote this company had for
the same item**, so bid day starts from a real number, not a blank:

- **Shown in amber, with supplier and date:** "Last quote $4,200 · Platt ·
  Aug 12 — update before bid day".
- **Louder with age**, on `shared/priceStaleness.ts`'s clock (one clock for
  catalog prices and quotes): under 30 days amber; **30–90 days** amber,
  bold, "54 days old"; **over 90 days** the warning colour, "121 days old —
  ask again".
- **Same item only.** The item is identified by a key frozen on the line
  when it is created: the assembly (its root, so a fork is the same item)
  plus the count's model/tag — the name's tag (`fixtureTag`) or the legend
  symbol's key. **A different model or tag starts blank.** A plain count
  with no assembly is identified by its normalised name. Nothing is ever
  matched by "looks similar".
- **Package prices never carry forward.** A package is one number for one
  job's mix; carried to another mix it is wrong by construction. The items
  in a package do not carry a share forward either.
- **A carried price counts in the total** — it is the contractor's own
  last number, with its date, not a starter — and the total says so:
  `… · includes 1 carried quote`. **It still counts as "not
  updated" at bid time** (§ 7), until a quote is entered on THIS bid.
- **Never on the customer's proposal.** "Last quote", "carried", supplier,
  date and age are estimator words. The proposal, its PDF and the quote-app
  export show the price only. A test asserts it (§ 9).
- **Owner question 1:** should a carried price go into the total by itself
  (as above), or sit beside the line until clicked "Use $4,200"? The
  recommendation is in the total: an amber number that is roughly right
  beats a blank that prices the pole at nothing; the guard (§ 7) stops it
  being sent unnoticed. CLAUDE.md's "inert until accepted" rule is for
  SHIPPED example numbers; this is the contractor's own.

## 7. The bid-day guard

When a bid has **open** quotes (waiting) or **old** ones (carried, or
entered on this bid more than 30 days ago), these need ONE confirm:

- **Locking quantities.** "2 supplier quotes are open and 1 is carried
  from an earlier job. Lock anyway?" — the confirm lists them, with a link
  to the Supplier quotes screen. Never locks by itself.
- **Sending:** the Send menu's customer-facing items (Proposal, "For your
  quote app") and setting the status to **Won** — V19's three places.
- **"Send anyway" is one click**, and remembered for that bid until a
  quote changes, so it is asked once per change, not every time.

**Enforced on the server, not only in the dialog:** `lockQuantities` (and
the quote-app panel and status → Won) take `acknowledgeQuotes: true` and
refuse without it while open/old quotes exist, naming how many. A dialog
alone is a rule nobody can test (CLAUDE.md: a rule with no red to go to is
an instruction).

**Owner question 2 — the priced proposal print.** Today an unpriced line
BLOCKS a priced print with no way past (owner, 2026-09-29). A waiting
quote is an unpriced material. Recommendation: **keep the block for OPEN
quotes** (a proposal cannot show a pole with no price in it), and use the
"send anyway" confirm for OLD/carried ones (they have a price). The
alternative — open quotes printed as "Price pending" (the document already
has that phrase) after one confirm — contradicts the 2026-09-29 decision,
so it needs the owner to say so.

## 8. Columns for Track A, and the price-box item

All ADDITIVE, nullable, **no DEFAULT** (NULL must stay distinguishable
from any answer), no backfill — step 1 of the three-step deploy.

**`bid_line_items`** — six columns. The first is the price-box column the
todo item already asks for; quote items and the price box share it.

| Column         | Type                 | Meaning                                                                                                          |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bidUnitCost`  | `DECIMAL(12,4) NULL` | Material per unit priced ON THIS BID. NULL = none. **Shared with the price-box item** (todo.md), which names it. |
| `isQuoteItem`  | `BOOLEAN NULL`       | This line's material comes from a supplier quote. NULL = no. Starts from the assembly's flag; editable per line. |
| `quoteId`      | `INT NULL`           | The quote it was priced from (`bid_quotes.id`), FK ON DELETE SET NULL.                                           |
| `quoteShare`   | `DECIMAL(12,2) NULL` | A typed share of a package price (§ 5 rule 1). NULL = computed.                                                  |
| `quoteItemKey` | `VARCHAR(255) NULL`  | The frozen "same item" key for carry-forward (§ 6). NULL on non-quote lines.                                     |
| `quoteNote`    | `VARCHAR(500) NULL`  | Notes for the supplier request list (§ 4).                                                                       |

`quoteNote` can wait if the request list ships without notes; the other
five are needed for the first build.

**`assemblies`** — `materialByQuote BOOLEAN NULL` — new lines from this
assembly start as quote items. NULL = no.

**New table `bid_quotes`** — one row per quote received on a bid:
`id`, `bidId` (FK, cascade), `userId`, `supplierName VARCHAR(128) NULL`
(free text, as `materials.supplierName` — no supplier table),
`quotedOn DATE NULL`, `packagePrice DECIMAL(12,2) NULL` (NULL = per-item
quote; set = a package), `carriedFromBidId INT NULL` (provenance only, NO
FK — the old bid may be deleted; set = this row is a carried quote, which
is what "not updated" reads), `note VARCHAR(500) NULL`, `createdAt`,
`updatedAt`. Index (`userId`, `bidId`).

**Company setting:** the quoted-line markup % (D4), a nullable decimal
beside the company markup default; Track A picks the table. NULL = no
quoted-line rule.

**How it fits the price-box item (todo.md).** The price box writes
`bidUnitCost` on any unpriced line — "priced on this bid". The Supplier
quotes screen writes the SAME column on a quote item, plus `quoteId` for
the supplier and date. One column, one reader (`lineNotPriced` and its SQL
copy), two screens. A quote item is not offered the price box's "Also save
to my catalog" — a quote is per job; the carry-forward is its memory. **So
the two should ship together, or the price box first** — building one
column twice is the drift CLAUDE.md warns about. The price box's two open
edges (an unpriced PART inside a priced assembly; a line whose LABOR is
unpriced) are not changed by this plan.

## 9. Test plan

Pure first, in `shared/` / `client/src/lib`, so the suite reaches them;
then the wiring through the routers; then the screens.

1. **The trap, red first:** an assembly line with 6 h labor, no catalog
   material, marked a quote item and with no quote is **waiting**, not
   priced — red with today's `lineNotPriced`. Its SQL copy agrees
   (`dashboardNotPriced.test.ts` pattern).
2. `spreadPackage()`: shares add up to the package price exactly for
   awkward splits (9,000 over 30 + 12; 100 over 3); typed shares win; last
   prices beat quantity only when EVERY item has one.
3. Quote state per line: waiting / quoted / carried, and age fresh / 30+ /
   90+ on a clock passed in (never `Date.now()` inside).
4. Carry-forward: same key carries; a different tag or model is blank; a
   package never carries; a carried price is in the total AND "not
   updated".
5. Guard: `lockQuantities` refuses with open or old quotes unless
   `acknowledgeQuotes: true`, and the refusal names the count; with none
   it needs nothing.
6. Proposal: the document and the quote-app export contain no "Last
   quote", supplier, date or age text.
7. Request list: rows, quantities (new marks only), tags; never a price
   column.
8. **On screen** (CLAUDE.md: not verified until looked at): the Supplier
   quotes screen at laptop and tablet widths; enter a quote and watch the
   bid's amber line and total MOVE without a reload (the staleness class);
   the guard dialog on lock.

**Known-answer bid.** Fixture prices and rates, never shipped ones. Labor
$85/h, no modifiers, productivity 0, markup 0 (a second variant adds the
quoted-line markup).

| Line                         | Qty | Labor                      | Material                         | In the total          |
| ---------------------------- | --- | -------------------------- | -------------------------------- | --------------------- |
| Light pole (S1), quoted each | 4   | 4 × 6 h × 85 = 2,040.00    | 4 × 4,200.00 = 16,800.00 (Platt) | 18,840.00             |
| Light pole (S2), waiting     | 2   | 2 × 6 h × 85 = 1,020.00    | — waiting                        | 1,020.00 (labor only) |
| Fixture type A, in package   | 30  | 30 × 1 h × 85 = 2,550.00   | share 6,428.57                   | 8,978.57              |
| Fixture type B, in package   | 12  | 12 × 1.5 h × 85 = 1,530.00 | share 2,571.43                   | 4,101.43              |
| **Total**                    |     | **7,140.00**               | **25,800.00** (16,800 + 9,000)   | **32,940.00**         |

- Package: Graybar, **$9,000.00** for A + B, spread by quantity (no last
  prices): A 30/42 × 9,000 = 6,428.571 → 6,428.57; B 12/42 × 9,000 =
  2,571.428 → 2,571.43; 6,428.57 + 2,571.43 = **9,000.00 exactly**.
- The bid says **"$32,940.00 + 1 item waiting on supplier quote"** and
  "Waiting on supplier quote: 1 item — Light pole (S2) × 2".
- Lock without acknowledging → refused, "1 supplier quote is open".
- **If the code prints something else, stop and find out why before going
  on** — either this table used a rule the code does not, or the code
  changed. Those want opposite fixes.

Variant: a second bid with Light pole (S1) carries $4,200 · Platt; at 31
days it reads "31 days old"; Light pole (S1A) starts blank; type A starts
blank (its last price was a package share).

## 10. Owner questions

1. A carried last quote: **in the total automatically** (recommended,
   amber, and still "not updated"), or shown beside the line until clicked?
2. The priced proposal with an **open** quote: keep today's block
   (recommended), or allow "Price pending" after one confirm — which
   reverses the 2026-09-29 decision?
3. The quoted-line markup % (D4): one company-wide number to start, or
   per supplier later? (Recommended: one number now.)
4. Should "Request quotes" group the list by supplier when a line already
   has a supplier from a carried quote? (Recommended: one list now;
   grouping later if asked.)

## 11. Build order (after Track A's columns)

1. `lineNotPriced` + SQL copy learn quote items (test 1 red first).
2. The line flag on the bid + the assembly flag; `LineCost` states.
3. Supplier quotes screen: per-item prices, supplier/date header.
4. Packages + `spreadPackage()`.
5. Request list (copy, CSV/PDF, mailto); materials list's section.
6. Carry-forward + age.
7. Bid-day guard (server `acknowledgeQuotes` + one dialog).
8. Quoted-line markup % (D4) — wire `quotedLine: true`.
