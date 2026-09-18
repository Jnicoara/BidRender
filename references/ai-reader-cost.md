# What the AI reader costs — measured, 2026-09-18

Companion to `references/plan-viewer-overhaul.md` §§ 9–12, which proposes the
tiled plan reader. That document argues for the design. This one prices it, on
the real sheets, and corrects three of its assumptions that did not survive
being measured.

**Every number below marked MEASURED came from rendering the actual Old
Blueridge sheets and counting. Every number marked ASSUMED is flagged as such.**
Rates are a local copy of Anthropic's published prices and go stale silently,
exactly as `shared/aiPricing.ts` says — the console has the bill.

---

## The decisions this document produced

Settled 2026-09-18, after the numbers below.

| Decision                | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| **Default reader mode** | Sonnet 5, 150 px per paper inch, 6 tiles, thinking OFF   |
| **Cost per sheet**      | ~10.1c                                                   |
| **Included allowance**  | 150 sheets per month                                     |
| **Thorough mode**       | Paid overage, priced per sheet well above its 27.8c cost |
| **Cheap mode**          | Held in reserve, not shipped as the default              |

$99/month flat holds at the default with room to spare. It does **not** hold if
thorough mode is included — see "Does $99 hold" below.

---

## 0. The test set is SCANNED, and that changes three answers

Before any costing. Both plan sets in `.local-storage` are photographs of
drawings, not vector PDFs:

| Set                  | MEASURED                                                  |
| -------------------- | --------------------------------------------------------- |
| Old Blueridge school | 5 pages, each ONE image of 10800x7200 px — a 300 dpi scan |
| pine st              | 5 pages, each one image, **no text layer at all**         |

Old Blueridge has an OCR text layer, and it is not good enough to build on.
Verbatim from the legend sheet E0.01, which is titled "SPECIFICATIONS & SYMBOL
SCHEDULE":

```
DUEX|RECEPTACLE|QUTLET
DUPLEX|RECEPTACLE|OUTLET
CONTRIOL|RIEFERENCE
RETERE|SHaDe
INCORRECT|SYMBOL|SCHEDULE|FOR|이
```

About two-thirds right, with a Korean character in the middle of it.

**This contradicts § 12's "ADD: read the legend's TEXT LAYER before spending a
token", which says "on a vector plan set — which is most of them — the legend's
labels are in that layer exactly, with positions."** On the two real sets in
hand that is not true, and "DUEX RECEPTACLE QUTLET" matched against
`symbolLinks.lookupKey` (§ 9.3 Stage 1) finds nothing and falls through to the
expensive stages regardless.

**Still build it.** It costs nothing, cannot hallucinate, and some sets will be
clean vector. But it is an accelerator with a **measured saving of $0 on both
real sets**, not a line item in a cost plan, and nothing may depend on it.

---

## 1. Sheet and symbol geometry

MEASURED on all five Old Blueridge sheets:

| Quantity                     | Value                                |
| ---------------------------- | ------------------------------------ |
| Sheet size                   | 36 x 24 in (2592 x 1728 pt), all 5   |
| Scan resolution              | 300 dpi (10800 x 7200 px)            |
| Ink coverage                 | 3.4% – 5.5% of the page              |
| **Receptacle symbol circle** | **0.17 in across** (51 px at 300dpi) |
| Device symbols, sheet E1.02  | 78                                   |
| Device symbols, sheet E1.03  | 106                                  |
| One finding as JSON          | 117 chars ≈ 40 output tokens         |

The 0.17 inch figure is the one everything else hangs off. It is the diameter of
the circle whose FILLED-versus-HOLLOW state distinguishes two different devices.

Device counts come from connected-component analysis over the drawing area
(title block excluded), filtered to symbol-sized blobs. They include some false
positives — isolated letters, grid bubbles — so read them as "roughly 80–110
devices on a real E-sheet of a small school remodel", not as exact counts. A
dense commercial floor plan would carry more; 250–400 is an ASSUMPTION, not a
measurement.

---

## 2. An image has a CEILING, and this is what § 11.5 got wrong

§ 11.5 says: _"An image costs roughly (width x height) / 750 tokens."_

That is roughly right per pixel and **misses the thing that decides the
architecture**. The real rule:

> The model cuts the image into 28x28 pixel squares and charges one token per
> square — `ceil(w/28) * ceil(h/28)`. **If that exceeds the model's budget, the
> image is silently SHRUNK until it fits.** Not rejected. Shrunk, with nothing
> reporting it.

| Tier                | Models                     | Max long edge | Max visual tokens |
| ------------------- | -------------------------- | ------------- | ----------------- |
| **High-resolution** | Sonnet 5, Opus 4.7+        | 2576 px       | 4784              |
| **Standard**        | Haiku 4.5, everything else | 1568 px       | 1568              |

Implemented, with Anthropic's own published fixtures as tests, in
`shared/visionImageLimits.ts` / `server/visionImageLimits.test.ts`.

What follows from the ceiling, CALCULATED:

| Question                                        | Sonnet 5         | Haiku 4.5    |
| ----------------------------------------------- | ---------------- | ------------ |
| Biggest **square tile** taken untouched         | 1932 x 1932 px   | 1092 x 1092  |
| ...costing                                      | 4761 tok = 0.95c | 1521 = 0.15c |
| A whole **36x24 sheet as one image** is seen at | 2352 x 1568 px   | 1344 x 896   |
| ...which is, per paper inch                     | **65 px/in**     | 37 px/in     |

**There is no third option for one image of a 36x24 sheet.** 2352x1568 is the
ceiling. Past it the server shrinks it back and the extra upload is burnt.

### What the app was doing

`SNAPSHOT_MAX_EDGE = 1600` gave 1600x1067 = 2262 tokens = 0.45c per picture —
**44 px per paper inch, so the 0.17in receptacle circle arrived 7.6 PIXELS
WIDE.** Filled versus hollow is a coin flip at that size and the label beside it
is gone.

Raising it to the model's real ceiling costs **half a cent** and buys **47% more
detail in each direction**. This was the cheapest improvement available anywhere
in this document and it is now shipped (`client/src/lib/planSnapshot.ts`).

---

## 3. Tiles a real 36x24 E-sheet needs

Tiles sized to exactly fill each model's budget, with 10% overlap so a symbol
cannot be lost to a seam. CALCULATED from the geometry in § 1–2:

| Detail level | Symbol arrives as | Sonnet 5 tiles | Haiku 4.5 tiles |
| ------------ | ----------------- | -------------- | --------------- |
| 100 px/inch  | 17 px             | **4** (2x2)    | **12** (4x3)    |
| 150 px/inch  | 26 px             | **6** (3x2)    | **24** (6x4)    |
| 200 px/inch  | 34 px             | **15** (5x3)   | **40** (8x5)    |

Two things to take from this table.

**§ 11.5's "a dense 36x24 sheet, 16 tiles" was in the right neighbourhood for
the wrong reason.** At Sonnet 5's budget the answer is 6 tiles at a comfortable
detail level, not 16 — because a 1932px tile covers 12.9 inches of paper.

**Haiku needs FOUR TIMES the tiles for the same detail**, because its image
budget is a third of Sonnet's. That is what makes "just use the cheap model" a
much weaker lever than it looks — see § 5.

On legibility: at 100 px/in a symbol is 17 px and the small text beside it
(`+38"`, `NOTE 7`) is right at the edge of readable. At 150 px/in everything is
comfortable. That judgement is from looking at rendered crops at each
resolution; it is **not** a measurement of model accuracy, which cannot be had
without spending real API calls against hand-counted sheets. Treat the accuracy
consequences of the detail level as the best available guess until that bake-off
is run.

---

## 4. The empty-tile skip saves NOTHING at shippable tile sizes

§ 11.2 proposes skipping tiles with no ink, and § 11.5 concludes **"empty-tile
skipping is worth real money on a floor plan that is half white paper."**

The first half of that is right. The second half is wrong, and this is the
measurement that shows why.

**A plan IS mostly white paper — only 3.4% of sheet E1.02 is ink.** But the
white is SCATTERED, not BLOCKED. MEASURED, counting blocks containing not one
dark pixel:

| Block size | p1  | p2  | p3  | p4  | p5  |
| ---------- | --- | --- | --- | --- | --- |
| 0.3 in     | 48% | 32% | 49% | 59% | 57% |
| 1 in       | 30% | 16% | 37% | 45% | 43% |
| 2 in       | 16% | 5%  | 25% | 33% | 29% |
| 4 in       | 6%  | 0%  | 13% | 19% | 13% |
| 6.4 in     | 0%  | 0%  | 4%  | 4%  | 4%  |

A tile at the size actually worth shipping covers **12.9 inches**. At that size:

> **Blank tiles across all five sheets, at every resolution tested, at
> Sonnet-sized tiles: ZERO. Not one.**

Every 13-inch square of a construction sheet touches something — the border, a
grid bubble, a dimension string, a keynote, wall hatching. The only configuration
where skipping saved anything was Haiku's small tiles at 200 px/in: 2–5 skipped
of 35 (6–14%), and one of those sheets is a schedule rather than a floor plan.

**Build the check anyway.** It costs a millisecond on a bitmap already in hand,
and § 11.2's rule that only genuinely ZERO ink may be skipped is exactly right —
"not much ink" is a guess and a guess here is a silent miscount. But **budget
$0 for it**, and keep § 11.2's "say how many were skipped" for the reason that
survives: a sheet where tiles ARE being skipped at this size means a rendering
fault, not white paper.

---

## 5. Cost per sheet

ASSUMPTIONS, stated plainly: 78 findings (measured) at 40 output tokens each
(measured); 1,300 prompt tokens per call for instructions + a 25-symbol legend +
the tool schema (estimated from source); prompt caching on, so the legend is not
paid at full price on every tile.

| Plan                                     | Tiles | Per sheet |
| ---------------------------------------- | ----- | --------- |
| Before these fixes — 1 call, 1600px      | 1     | **4.0c**  |
| ...plus the thinking nobody had chosen   | 1     | 4.8c      |
| Now — 1 call at the model's real ceiling | 1     | 4.5c      |
| Haiku 4.5 @ 100 px/in                    | 12    | **4.6c**  |
| Haiku 4.5 @ 150 px/in                    | 24    | 7.4c      |
| **Sonnet 5 @ 100 px/in**                 | 4     | 7.9c      |
| **Sonnet 5 @ 150 px/in — THE DEFAULT**   | 6     | **10.1c** |
| Sonnet 5 @ 200 px/in                     | 15    | 20.3c     |
| Sonnet 5 @ 200 px/in + thinking          | 15    | 27.8c     |

**Against the 3.5c the pricing model assumed:** the single-call reader was
already **4.0c**, 15% over, before any tiling existed. The default tiled reader
is **10.1c — 2.9x the assumption.** That is the real number to plan against.

It is emphatically **not** the 40x that "one call becomes forty" implies. Sonnet
5's image budget is what prevents it: 6 tiles, not 40.

### Two things that were being paid for and nobody chose

**Thinking was on by default.** `server/llm/anthropic.ts` sent no `thinking`
parameter, and on the current models OMITTING it means adaptive thinking runs.
Those tokens bill at the output rate and arrive folded invisibly into
`usage.output_tokens`. ~3c per sheet. Now `{ type: "disabled" }`, explicitly.

**The output cap was one dense sheet from breaking every read.** `maxTokens` was
4,000; a real sheet's answer is ~3,270 (78 findings x 40, plus the summary) —
82% of the cap, on a SMALL school remodel. Truncation is the worst failure shape
available: the JSON is cut mid-object, the parse fails, the user gets nothing,
and the call is paid for in full. Now 16,000, which covers ~380 findings, with
an explicit `finish_reason === "max_tokens"` check that says so in its own
sentence rather than blaming the answer.

---

## 6. Can a cheaper model do the counting once the legend is captured?

§ 9.1's reasoning is sound — matching a known shape IS easier than identifying
an unknown one. The arithmetic is less generous than it looks:

| At the same detail level (150 px/in) | Tiles | Per sheet |
| ------------------------------------ | ----- | --------- |
| Sonnet 5                             | 6     | 10.1c     |
| Haiku 4.5                            | 24    | 7.4c      |

**Half price per token, four times the tiles, so only 27% cheaper.** Haiku wins
only if the detail level drops too — Haiku @ 100 px/in is 4.6c, 55% below
Sonnet @ 150.

So the honest framing is **not** "swap the model to save money". It is "the
cheap mode trades detail AND model together". And whether Haiku counts
accurately against a captured legend is **unmeasured** — it needs a bake-off
against hand counts on 5–10 sheets before it ships to anyone.

---

## 7. The daily allowance has to change its unit

`shared/aiLimits.ts` allows **150 plan-reader CALLS per person per day**, and
its comment explains that as "a 60-sheet set read end to end is 60 calls".

Tiling breaks that mapping. At 6 calls per sheet, 150 calls is **25 sheets**, and
a single 40-sheet set fails two-thirds of the way through.

**Recommendation: stop counting calls. Count sheets, and add a money backstop.**
The limit exists as a circuit breaker on a runaway loop, not a fair-use policy —
which the file says, and is right. But once one sheet is six calls, "calls" no
longer tracks spend.

| Control                     | Value | Why                                                                |
| --------------------------- | ----- | ------------------------------------------------------------------ |
| Sheets per person per day   | 40    | A 40-sheet set read end to end in one day. Above that it's a loop. |
| Dollars per person per day  | $6.00 | Hard stop. Catches a runaway the sheet count cannot see.           |
| Assistant calls (unchanged) | 500   | Still a fortieth of a sheet read each.                             |

**NOT YET IMPLEMENTED.** `DAILY_LIMITS` is untouched, deliberately: at one call
per sheet today, 150 calls already means 150 sheets, so the current value is
correct for the current behaviour. This changes in the same commit as tiling,
never before it — a limit that does not match how the app spends is worse than
one set slightly wrong.

---

## 8. The three options

|                        | **Cheap** | **Default — SHIPPING** | **Thorough** |
| ---------------------- | --------- | ---------------------- | ------------ |
| Model                  | Haiku 4.5 | **Sonnet 5**           | Sonnet 5     |
| Detail                 | 100 px/in | **150 px/in**          | 200 px/in    |
| Tiles per sheet        | 12        | **6**                  | 15           |
| Symbol arrives as      | 17 px     | **26 px**              | 34 px        |
| Thinking               | off       | **off**                | on           |
| **Per sheet**          | **4.6c**  | **10.1c**              | **27.8c**    |
| 8-sheet job            | $0.36     | $0.81                  | $2.22        |
| 40-sheet set           | $1.82     | $4.05                  | $11.11       |
| Sheets per $20 of cost | 438       | **197**                | 72           |

**What cheap mode gives up.** Small text beside a symbol (`+38"`, `GFI`, circuit
tags) sits at the edge of readable, so the qualifiers go before the devices do.
And Haiku against a captured legend is unproven — expect more `low` findings and
more flags, which under § 10.3 is the CORRECT failure, just a slower one for the
estimator.

**What thorough mode buys.** Every label legible, symbols at 34 px, and
reasoning about ambiguous marks before answering. Honestly: 150 → 200 px/in is
**2.7x the cost for a modest gain**, since the symbol is already comfortable at
26 px. Most of that jump is the thinking, and thinking's value on "count the
circles against this legend" is the least certain quantity in this document.

**Why the default is Sonnet 5 at 150 px/in, thinking off.** Six calls, not forty.
Every label readable. The same model already in use, so no new accuracy
unknowns. And a number a flat $99 absorbs.

---

## 9. Does $99/month flat hold?

**At the default: yes, comfortably.**

At 10.1c a sheet, a $20/month AI budget per user — 20% of revenue, leaving real
margin — buys **197 sheets a month**. An estimator doing 8 bids a month with 5
E-sheets each that actually get read uses 40. A heavy user running ten 40-sheet
sets a month lands at $40, and that user is visible in the admin screen.

**Included allowance: 150 sheets/month.** ~$15 of cost, covers everyone normal
with room, and is a number that means something to an electrician.

**Thorough mode does NOT fit and is the paid overage.** At 27.8c a sheet, 150
sheets is $42 — 42% of revenue before hosting, storage or wages. One heavy user
on thorough mode wipes out three normal users. Priced per sheet, well above cost.

**Cheap mode is the safety valve, not the product.** At 4.6c you could include
400 sheets. Hold it for the month the bill surprises you.

**Legend capture is ~3c per plan set** (one call on the legend region), not the
~1c § 9.6 estimates. Still trivial — a third of one sheet read, paid once for the
whole job — so § 9.6's ordering argument survives by an order of magnitude
exactly as it claims.

---

## 10. What was changed on 2026-09-18, before any tiling

Four fixes, all of them cheap, none of them dependent on the tiling work:

1. **Auto-read now defaults OFF** (`TakeoffPage.tsx`). It defaulted ON, so
   opening a sheet spent money nobody asked for. Under tiling, clicking through
   a 40-sheet set to find the electrical drawings would have spent 240 calls and
   about $4, unasked. Now a rule in CLAUDE.md: **a call is a button.**
2. **Thinking explicitly disabled** on plan reads, and `params.thinking` is now
   forwarded by the Anthropic adapter at all, which it previously ignored.
3. **Output cap raised 4,000 → 16,000**, with a `max_tokens` check that fails
   loudly and specifically instead of letting a truncated reply become "the
   answer could not be understood".
4. **Image sized to the model's real ceiling** rather than a flat 1600px, via
   the new `shared/visionImageLimits.ts`, with the server naming the model it
   will call so the client cannot size for the wrong tier.

Not changed, deliberately: `DAILY_LIMITS` (§ 7), and anything in §§ 9–11 of the
plan itself.
