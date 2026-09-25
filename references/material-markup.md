# Material markup — design, decisions and pieces

Written 2026-09-25. Source design: `bidridge-labor-and-bid-structure.md`
(2026-09-20, kept outside the repo), Part 3 § A and Part 4. This file is where
the decisions for material markup live; Pieces 2–5 follow it.

**Before changing anything here, read § "Decisions — do not re-open without
saying why".** They were made by the product owner in conversation on
2026-09-25 and are the reason the code is shaped the way it is.

---

## The one mechanism

A short, ordered list of markup rules, checked **per material part** of a bid
line. The first level that has a rule wins:

| #   | Level               | What it matches                                                   | Status                               |
| --- | ------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| 1   | **Item override**   | this one material (a shipped row and its forks count as one item) | **Piece 1**, built                   |
| 2   | **Quoted line**     | a supplier-quoted gear/fixture package line                       | slot only — not built (D4)           |
| 3   | **Category**        | the material's category                                           | engine reads it; no UI until Piece 3 |
| 4   | **Price band**      | the part's PACK / purchase price (D3)                             | slot only — Piece 2                  |
| 5   | **Company default** | everything else                                                   | **Piece 1**, built                   |

Nothing matched → **0%, "no markup rule"**. That is a real answer, not an
error, and it is what every company gets until it sets something.

The order is `MARKUP_RULE_ORDER` in `shared/materialMarkup.ts`, and the
resolution is `resolvePartMarkup` there. A level whose data does not exist yet
returns "no rule" — it does not guess.

Every bid line shows where its markup came from: "from company default",
"from Wire & Cable category", "from item override", or "Mixed — …" for an
assembly whose parts matched different rules.

## Where the step sits in the price

```
material cost (per line, snapshot)
+ MATERIAL MARKUP (per line, from the rules)     ← new, 2026-09-25
+ labor cost
= subtotal (cost with markup)
+ overhead      (on the subtotal as it stands)
+ profit        (on the subtotal + overhead, as it stands — D1)
= bid price
```

**Overhead also applies to the marked-up subtotal.** D1 says bottom-of-bid
profit applies "to the subtotal as it stands, marked-up material included".
Overhead sits between the two and is read the same way: every bottom-of-bid
step applies to the running subtotal. Recorded as an interpretation of D1,
not a separate decision — if that is wrong, it is one line in
`calculateBidPrice`.

The same order is recorded in `ASSEMBLIES_PLAN.md` § PRICING FLOW.

## How it is stored — snapshot, like every other pricing input

A bid line freezes its material cost, hours, rate and modifier % when it is
added (R4). The markup joins them:

- `bid_line_items.snapshotMarkupPct` — the markup as a FRACTION of the line's
  material cost (0.35 = 35%). For an assembly whose parts matched different
  rules it is the cost-weighted blend, to six decimals.
- `bid_line_items.snapshotMarkupSource` — JSON: which level, the label shown
  on the line, and the parts it was resolved from (material id + cost weight)
  so "Re-apply rules" can re-run the rules on the SAME composition the cost
  was frozen from.

**NULL `snapshotMarkupPct` means "added before markup rules" and prices as
0%.** That is what makes the migration additive: every existing line reads as
it always did, to the cent, with no backfill. Proven two ways — a unit test
(`server/materialMarkup.test.ts`) and a before/after dump of every bid in the
local copy of the data (4,231 bids, zero differences).

**Changing a rule does not move an existing line.** The bid shows
"Re-apply markup rules (N lines change)" instead, and **only on a Draft bid
whose quantities are not locked**. An Active, Won or Lost bid, or a locked one,
never moves — the server refuses, it is not only hidden.

## The five places that used ONE price-to-cost ratio

Before this, the whole bid had one uplift: `finalPrice ÷ directCost`. Each of
these spread it evenly, which is correct only when every dollar of cost is
marked up the same way. With material markup that is false, and every one of
them would have produced a wrong number quietly:

| Place                         | Now uses                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| Marked-up expenses            | the BOTTOM-of-bid ratio only (overhead + profit), never material markup |
| Proposal price per unit       | each unit's own cost-with-markup × the bottom ratio                     |
| Sales tax on the billed price | material share = material cost + its markup                             |
| Accounting export split       | same split as tax, from one function (`apportionWorkPrice`)             |
| Dashboard / analytics totals  | the SQL sums the markup per line, the same way the engine does          |

`server/materialMarkupAgreement.test.ts` builds a mixed bid (some lines marked
up, some not, a marked-up expense) and asserts all five agree with each other
and with the bid total.

## Markup vs margin — every % field says which

Part 4 of the design doc. **Any field that takes a percentage of profit or
markup carries the word inside the field** ("20 % markup", "20 % margin") and
shows the other number live beside it ("= 16.7% margin"). The conversions are
`markupToMargin` / `marginToMarkup` in `shared/pricing.ts`, tested both ways.
`InlineNumberField` takes `percentKind` to do this, so a new field cannot get
the words without the conversion.

---

## Decisions — do not re-open without saying why

**D1. Profit STACKS on marked-up material.** (2026-09-25) Bottom-of-bid profit
applies to the subtotal as it stands, marked-up material included. The ROUTE
setting (Piece 4) is what prevents accidental doubling:

- **Route A** defaults to material rules ON and bottom profit 0.
- **Route B** defaults to material markup 0 (or a small flat handling %) and
  profit at the bottom.
- Both can be on together; when they are, the bid shows the combined effective
  margin **in numbers**, not a warning (Piece 4).
- The owner's own company default will be Route B.

**D2. Starter price bands are Route A only, as round midpoints.** (2026-09-25)

| Pack / purchase price | Starter markup |
| --------------------- | -------------- |
| under $1              | 75%            |
| $1 – $10              | 40%            |
| $10 – $100            | 30%            |
| $100 – $1,000         | 20%            |
| over $1,000           | 12%            |

Labelled **"Starter — verify against your own work"** with a date. **Nothing
applies until the user clicks accept**, so "starter content ships at $0" stays
true (CLAUDE.md § Starter content, amended the same day). Route B's starter is
0%, or a flat handling % the user sets.

**D3. Price bands use the PACK / PURCHASE price, not the per-unit price.**
(2026-09-25) The roll, the 10 ft stick, the box of 25. Bands exist to cover
handling cost, and wire at $0.40/ft must not land in the under-$1 band at 75%.
For items sold singly the two are the same. `materials` has no pack size
today, so Piece 2 adds one; until then the band level returns "no rule".

**D4. "Quoted" is a LINE TYPE, not a category and not a band.** (2026-09-25)
Supplier-quoted gear and fixture packages, with their own markup %. Not built
yet, but it has its slot in the order: item override → **quoted line** →
category → price band → company default.

**D5. User-added categories are allowed.** (2026-09-25) This OVERRIDES
`ASSEMBLIES_PLAN.md` § Customization model, "Category is NOT
user-extendable", which was written to keep the takeoff layers free of clutter.
The markup design needs a company to add a category with its own %. Piece 3
has to answer the clutter concern rather than ignore it — a company's own
category must not appear as a layer on every sheet unless somebody chose that.

**D6. Starters are the first of their kind.** The "starter — verify, dated,
one-click accept" pattern is also planned for labor units, and does not exist
in code yet. Piece 2 builds it as a shared piece so labor units reuse it
rather than copying it (CLAUDE.md § "Copying a layout does not copy the
behaviour with it").

---

## The pieces

1. **Rule engine + per-line storage + source label + the five ratio fixes.**
   Built 2026-09-25. Item override and company default are wired end to end.
   The category level reads a category rule if one exists, but nothing can
   create one until Piece 3.
2. **Price bands** — a pack size / pack price on materials (D3), the band
   rules, the D2 starter set with date and one-click accept, the shared
   starter component (D6).
3. **Categories** — a categories table (shipped + a company's own), a
   nullable `materials.categoryId` read before the enum, category rules with
   their own %, the answer to D5's clutter concern.
4. **Route A/B + the combined number** — company route, per-bid override,
   the defaults D1 describes, and the combined effective markup = margin line.
5. **Blended markup** — one number per bid: total material markup ÷ material
   cost, plus the overall effective markup and margin. May fold into 4.

**Not in any piece yet:** a per-LINE markup override on one bid (the "one-way
door" principle says anything from the library can be overridden on one job).
Today the item override is company-wide.
