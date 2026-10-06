# Several LOOKS for one legend item — PLAN ONLY, 2026-10-01 (Track C)

**Status: BUILT IN PART, 2026-10-05 (track-c), on `symbol_looks` (0102).**
Built: § 1 single capture (the three choices), § 2 storage, § 3 Find all
matching over every look (vector and scan), the per-set rule below, the
look count on the legend row (§ 5, display only). **Not built yet:** § 1's
per-row choice in whole-legend capture (it keeps "left as it is", which is
§ 9 Q3's default), § 4's look-alike warning at add time, § 5's remove /
move / find-from-this-look actions, § 3's Reader pictures, § 4's "from a
new look" marking. § 10 has what was built and measured.

**The ask, in the owner's words:** "when I capture a symbol into the legend
and its name matches an item that already exists (for example a GFCI from a
different set of plans), the app says it is already an item. But this symbol
looks a little different. I want to add it as another 'look' for that same
item, so Find all matching and the AI search for every look."

**Words used here.** An **item** is one legend entry — one `symbol_links`
row, one name, at most one assembly. A **look** is one picture of how that
item is drawn on some plan set, with where it was boxed. Today an item has
exactly one look. This plan lets it have several, and keeps it ONE item: one
name, one count, one price.

---

## A look is per plan set — the owner's design rule, 2026-10-05

> **The same-looking symbol can mean different things on different plan
> sets. A look saved from another set may SUGGEST a match, but must never
> auto-label on a new set without that set's own legend confirming it.**

Found on Old Blueridge: the half-filled duplex the owner had counted as
"GFCI receptacle" is, on that set, a **duplex above the backsplash** (its
legend: "DUPLEX RECEPTACLE OUTLET ABOVE BACKSPLASH OR COUNTER", and NOTE 7 —
verify height). On other sets a near-identical picture is a GFCI. A look
carried over from those sets would have labelled every one of them wrong,
in the confident voice of a right answer.

**What "this set's own legend confirms it" means, today:** a look of the
item captured on THIS plan set, or the symbol boxed on this sheet for the
search. Nothing else — not the item's name, not a look from another job.
(When A's per-set legend, `bid_pdf_legend_entries`, exists, a confirmed entry
for the item on this set is the third way.) This narrows
`plan-viewer-overhaul.md` § 9.4 ("suggested, never applied") from whole
SYMBOLS to each LOOK, and says what turns a suggestion into a label.

**Where it is enforced:** `shared/symbolLooks.ts` (`lookConfirmsSet`),
`client/src/lib/lookMatching.ts` (every find that ONLY another set's looks
made gets "Found only by a look saved on …" and is never clear, so Confirm
all never takes it), and the scan branch, which does not compare another
set's look at all (§ 9.3: a picture from another scan is not comparable).

---

## 0. What exists today — checked in the code, 2026-10-01

| Question                                           | Answer                                                                                                                                                                                                                                                                           | Where                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| What happens when a captured name matches an item? | The server finds the item by `lookupKey` and returns `alreadyKnown: true`. **The new picture is thrown away** — it is kept only if the old item had none. The screen says "Already in your legend." (single capture) or "Already in your legend — left as it is" (whole legend). | `takeoffStampsRouter.captureSymbol`; `TakeoffPage.tsx`; `LegendCapture.tsx` |
| Can an item have more than one look?               | **No.** One `thumbnail` column per row.                                                                                                                                                                                                                                          | `drizzle/schema.ts`, `symbolLinks`                                          |
| Is "one item per name" enforced by the database?   | **No — only in code.** `lookupKey` has a plain index, not a unique one (also noted in A's `migrations-0098-batch-plan.md` R.6). Nothing stops two rows with one name except `captureSymbol` and rename's own check.                                                              | `symbol_links_lookupKey_idx`                                                |
| Is the capture box stored?                         | **No.** Only the picture and `capturedFromSheetId`. Find all matching's legend entry point needs the box; R.11 proposes `symbol_links.captureX/Y/Width/Height`.                                                                                                                  | `find-all-matching-plan.md` § 4 step 3; A's R.11                            |
| What is the lookup key?                            | The label lower-cased with spaces collapsed (`symbolLookupKey`, `shared/takeoffCounts.ts`). After B's rename, `label` is the new name and `lookupKey` keeps the captured name's key.                                                                                             | A's R.6                                                                     |
| What points at an item?                            | Reader findings and corrections (`plan_copilot_findings.symbolLinkId`, `plan_copilot_corrections.symbolLinkId`), and A's planned `bid_pdf_legend_entries.symbolLinkId`. All point at the ITEM — which is why looks must not become separate items.                               | `drizzle/0031`; `legend-reading-plan.md` § 5 (a-plans-reader)               |
| What does the Reader get today?                    | **Names only** (`legendFor`: id, label, assembly). Pictures are sent only by the reader-accuracy test's methods (b)/(d), and by A's legend plan once built.                                                                                                                      | `planCopilotRouter.legendFor`; `scripts/readerAccuracy.mts`                 |

### Decisions this plan sits beside — read before building

| Decision                                                                                  | Where                                     | How this plan stands                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A remembered symbol may be SUGGESTED on a new set, never APPLIED.                         | `plan-viewer-overhaul.md` § 9.4           | Kept whole. A look from another set only ever proposes (§ 4 here).                                                                                                                                                           |
| Several DIFFERENT captured items on one assembly each get their OWN count.                | B's pin plan § 11 (track-b)               | **A different case, and must stay one.** Looks are several pictures of ONE item → ONE count. "No, make it a separate item" (§ 1) is B's § 11 case.                                                                           |
| Find all matching: unconfirmed until confirmed; look-alikes flagged.                      | `find-all-matching-plan.md`               | Extended to several looks (§ 3).                                                                                                                                                                                             |
| Capture box on the item: `symbol_links.captureX/Y/Width/Height`.                          | A's R.11; `find-all-matching-plan.md` § 6 | **Replaced, if the owner picks the recommended table (§ 6):** the box belongs to the LOOK. A box on the item can hold only one look's box. Both files are told (find-all-matching-plan.md says so; R.11 is A's to update).   |
| Legend once per plan set: `bid_pdf_legend_entries` (bidPdfId, symbolLinkId, box, source). | A's `legend-reading-plan.md` § 5          | Complementary. A legend entry says "this ITEM is confirmed for THIS SET"; a look is the account-wide picture that survives the job. § 6 adds an optional `lookId` to the entry so the Reader knows which look this set uses. |
| Count by tag: the tag is the text BESIDE a symbol, never part of it.                      | B's `count-by-tag-plan.md` § 3            | Kept: a look has no tag. All looks of an item share its tags.                                                                                                                                                                |

---

## 1. The capture flow

When a captured name matches an existing item, the "Already in your legend"
toast is replaced by a small question **on the naming card, before anything
is saved**:

> **"GFCI receptacle" is already in your legend.**
> [its current look(s), small] [this new one, small]
> **Add this as another look for GFCI receptacle?**
> **[Yes, another look]** [No, make it a separate item] [Cancel]

- **Yes, another look** → a look is added to that item (§ 2). The item's
  name, assembly and every count are untouched. Toast: "Added a second look
  for GFCI receptacle." The look-alike check (§ 4) runs first and can turn
  this into a warning.
- **No, make it a separate item** → the naming field comes back with the
  name selected and a short line: "Two items cannot share a name — give this
  one its own, e.g. GFCI receptacle — weather resistant." Saved as a new
  item: B's pin plan § 11 case (its own count, even on the same assembly).
- **Cancel** → nothing saved; the picture is dropped, as today.
- **Whole legend** (`LegendCapture.tsx`): the row that says "Already in your
  legend — left as it is" gets the same three choices as a small control on
  that row, defaulting to **left as it is** — a bulk save never adds looks
  the estimator did not choose.
- **The same picture twice** (same plan set, a box within a few points of an
  existing look's box) is not asked about: "This look is already saved."

## 2. What is stored per look

| Field                     | What                                                          | Why                                                                             |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `symbolLinkId`            | the item                                                      | One item, many looks. Cascade on item delete.                                   |
| `userId`                  | the company OWNER (`ctx.scope.dataUserId`)                    | Scoping, as on every table (CLAUDE.md data model).                              |
| `thumbnail`               | the sharp picture, ≤ `SYMBOL_THUMBNAIL_MAX_CHARS`             | The Legend panel, the Reader's picture, the tooltip.                            |
| `bidPdfId`, `sheetId`     | the plan set and sheet it was boxed on, `SET NULL` on delete  | "Which set does this look come from", and the matcher's source geometry.        |
| `captureX/Y/Width/Height` | the box, page points, `decimal(12,4)`                         | Find all matching rebuilds the look from the drawing's own line work (§ 3).     |
| `createdByUserId`         | the PERSON who added it (`ctx.scope.actorUserId`), `SET NULL` | "Who added it", asked for. Authorship only — never used to decide what is read. |
| `createdAt`               |                                                               | "When", asked for; newest-first ordering.                                       |

**The first look of every existing item** is its current `symbol_links.thumbnail`
and `capturedFromSheetId`, with no box. **No backfill**: the code reads an
item's looks as its look rows, plus — when it has none — the old thumbnail as
a box-less look. A box-less look is shown and sent to the Reader but cannot
seed Find all matching (no box to rebuild from), and the panel says so.

**How looks tie to the rest:**

- **Find all matching:** a look with a box can seed a search (§ 3).
- **Counts:** a look never has a count. Every look of an item counts into
  the item's count (B's § 11.2 rule 1 — the count named for the item).
- **Count by tag:** the tag is text beside the symbol, read per MATCH, not
  per look (count-by-tag § 3 v2). A look carries no tag, and two looks of
  "Linear" both produce A-7 and A-9 matches.
- **Legend per plan set** (A's legend plan): its `bid_pdf_legend_entries`
  row may name the look that set uses (`lookId`, optional) — so the Reader,
  on that set, sends that look first.

## 3. Find all matching and the Reader, with every look

**Find all matching, from an item** (the legend row's "Find on this sheet"):

1. Rebuild each boxed look from its own sheet's line work — one sheet read
   per look, in the worker, one sheet held at a time (as now).
2. Run the matcher once per look against the open sheet.
3. **Merge:** two results within half a symbol's width of each other are ONE
   spot. Keep the one with the higher coverage; keep the reasons of both;
   say "found by 2 looks".
4. **Never twice:** a spot already counted (any count) is "already counted"
   exactly as today; a spot confirmed during this search drops out of the
   others' results.
5. Order: looks from THIS plan set first (they are drawn by the same office,
   so they are the likeliest to be right), then the rest, newest first.

Cost: one sheet read (~1 s on Weld 1) per other-sheet look, then ~0.1 s per
look per search. With a cap of 5 looks per search (§ 9 Q4) that is a few
seconds at worst, once, and cached per sheet.

**The Reader** (once A's legend plan sends pictures):

- Every look of an item is sent under the item's ONE label — "Legend entry
  3: 'GFCI receptacle' (2 looks)" — so a find is reported against the item,
  never against a look. Findings keep pointing at `symbolLinkId`.
- The set's own look first (`bid_pdf_legend_entries.lookId`), then others up
  to the cap. Each extra picture is extra input tokens on every call; the
  cap and the "this set first" order keep that bounded. Measure before
  raising the cap: `scripts/readerAccuracy.mts` methods (b)/(d) with 1 look
  against 3 looks per item.
- Still a button, never on load (D11).

## 4. Look-alikes — a new look must not quietly match a different symbol

The risk: the owner adds a "GFCI" look that is really drawn like a plain
duplex on that set, and every duplex then comes back as a GFCI.

**At the moment a look is added** (vector sheets — a box is needed):

1. **Against the item's own looks:** if the new look's device words differ
   from the item's other looks ("GF" in one, none in the other), say so on
   the question card: "Your other look has 'GF' beside it; this one doesn't."
2. **Against OTHER items:** run the new look on its own sheet. If it lands on
   spots already counted as a DIFFERENT item, or another item's look on this
   set finds the same spots, warn **before saving**: "This look also matches
   8 marks counted as DUPLEX RECEPTACLE on this sheet. Add it anyway?" Default
   button: **Cancel**.
3. **Scans** (no line work): the comparison cannot be made, and the card says
   so instead of saying nothing.

> **Built 2026-10-05: point 2 against MARKS, and point 3.** The client runs
> the look on its sheet (`lookAlikeCheck`), `captureSymbol` refuses to save
> over another item's marks until "Add anyway" (`lookAlikes`), and on a scan
> the save message says it could not compare. On a scan it saves and says so
> after, rather than asking first: there is nothing to decide. NOT built:
> point 1, "another item's LOOK finds the same spots", and the "from a new
> look" tag below. A new item's FIRST look is not checked — only an added
> one. See `track-c-handoff.md`.

**Every match from every look stays UNCONFIRMED** until the estimator
confirms it — exactly as now. A look added a minute ago gets no shortcut:

- its matches are marked "from a new look" in the panel for the rest of the
  session, and "Confirm all clear" does NOT take them (they are confirmed
  one at a time until the look has been confirmed on one sheet);
- a spot two items' looks both claim is **needs a look**, naming both items,
  never given to either.

## 5. Managing looks in the right panel (Legend tab)

- The item's row shows **all its looks** as small pictures (the first full
  size, the rest as a strip), with "+2 looks".
- Opening a look shows: where it came from (plan set, sheet, "open it"),
  who added it and when, and three actions:
  - **Remove this look** — asks once. Removing the LAST look leaves the item
    with no picture (a supported state today), and says so.
  - **Move to another item…** — the same picker as "Link assembly". The look
    keeps its picture and box. Refused if the target already has the same
    look (same set, same box).
  - **Find on this sheet** — runs Find all matching from this one look.
- **Nothing here touches a count.** Removing or moving a look changes what
  future searches find, never what has already been counted (§ 7).

## 6. Migration — for Track A's list (§ R of `migrations-0098-batch-plan.md`)

**Recommended: one new table, ADDITIVE (step 1 of the three steps).**

```
symbol_looks
  id                int auto, PK
  userId            int NOT NULL -> users, cascade      company owner
  symbolLinkId      int NOT NULL -> symbol_links, cascade
  thumbnail         text NULL                            ≤ SYMBOL_THUMBNAIL_MAX_CHARS
  bidPdfId          int NULL -> bid_pdfs, set null
  sheetId           int NULL -> bid_pdf_sheets, set null
  captureX          decimal(12,4) NULL                   page points
  captureY          decimal(12,4) NULL
  captureWidth      decimal(12,4) NULL
  captureHeight     decimal(12,4) NULL
  createdByUserId   int NULL -> users, set null          the person
  createdAt         timestamp NOT NULL default now
  index (symbolLinkId), index (userId)
```

and, **only if A's legend plan is built**, one optional column there:
`bid_pdf_legend_entries.lookId int NULL -> symbol_looks, set null`.

- **New table, no `UPDATE`, nothing changes meaning** → additive; old code
  ignores it. No backfill (§ 2: the old thumbnail is read as the first look).
- **It replaces R.11** (`symbol_links.captureX/Y/Width/Height`): a box on the
  item can only ever be one look's box. If R.11's columns have already been
  written by then, they are read as the first look's box and nothing is lost.
  **A decides the number** — this plan does not number it (R.1).
- Hand-write the `.sql`; rehearse with `SHOW CREATE TABLE symbol_looks` (four
  foreign keys, two indexes). If it does not show them, stop and find out why.
- **Rejected alternative: several `symbol_links` rows with one name.** The
  database would allow it (no unique key), but every finding, correction and
  legend entry points at an ITEM by id, so "which row is the item" would have
  no answer — rename, link and the Reader would each pick one. A child table
  keeps one item.

## 7. Locked bids and saved counts — no silent changes

- **A look belongs to the account, not to a bid.** Adding, removing or moving
  one writes no mark, no count, no bid line, no snapshot — on any bid, locked
  or not. So it is allowed while bids are locked, and changes nothing on them.
- **Marks do not remember which look found them**, deliberately: a mark
  belongs to a count. Moving a look to another item therefore moves no
  counted mark; the panel says "Marks already counted stay where they are."
  Moving marks is "Move to…" (built), a separate, visible step.
- **Unconfirmed matches** from a search are dropped if a look they came from
  is removed or moved mid-search, with a line saying why — never re-pointed.
- **Locked bid:** Find all matching is not offered (as now), so new looks
  cannot place anything there.
- **Reader findings** already saved keep their `symbolLinkId`; a look change
  never rewrites a finding.

## 8. Tests that fail without the fix

Each goes red on today's code and green with the change:

1. **The second picture is kept.** `captureSymbol` twice with one name and
   `addAsLook: true` → the item has 2 looks with both pictures. Today the
   second picture is discarded (`alreadyKnown`), so the count is 1.
2. **Still one item.** After (1): one `symbol_links` row for the key, and
   `legendFor` lists ONE entry with 2 looks — not 2 entries.
3. **Separate item needs its own name.** "No, separate item" with the same
   name is refused by name; with a new name, a second row exists and arming
   it (B's § 11.2) gives a second count.
4. **No count moves.** Add, remove and move a look on a bid with marks and a
   locked bid: every count, bid line `qty` and snapshot field is identical
   before and after (read the same queries on both sides — CLAUDE.md "a
   count taken before the change is intent").
5. **Merge, never twice** (`client/src/lib`, pure): two looks that both find
   one device → one match "found by 2 looks"; a spot already counted →
   "already counted", from either look.
6. **Look-alike warning:** a new look whose matches land on marks of a
   DIFFERENT item → the add returns a warning naming that item and the
   number of marks; nothing is saved until confirmed.
7. **New-look matches are not swept in:** `clearOpen` (findMatchingSession)
   excludes matches from a look added this session.
8. **Scoping:** another company's look id is not found (`scopeDiscipline`
   pattern), and `createdByUserId` is the actor while `userId` is the owner.

## 9. Open questions for the owner

> **DECIDED 2026-10-01 by Track C, on the owner's instruction to take the
> recommended answer except where a choice changes a bid number, costs money
> or cannot be undone.** None of the seven does — every one is about what is
> shown or asked, and a look changes no count (§ 7) — so all are decided:
>
> 1. Separate item → **asks for its own name, old name pre-filled.**
> 2. Looks from other plan sets → **searched too, this set's first; all only
>    proposals.**
> 3. Whole legend with a matching name → **left as it is by default.**
> 4. Looks per search → **up to 5, this set's first.** (The AI cap in item 7
>    follows the same number; any AI call is still a priced button.)
> 5. A new look that matches another item's marks → **warn, default Cancel.**
> 6. Removing the last look → **allowed; the item keeps no picture.**
> 7. Reader pictures → **the set's own look first, others up to the cap.**
>
> **Not buildable yet:** every item here needs `symbol_looks` (§ 6), a new
> table — requested from Track A, not numbered. Nothing of this plan is
> built until it exists.

1. **"No, make it a separate item" needs a different name.** Two items with
   one name would make every list ambiguous. OK to ask for a new name there?
   (Recommended: yes, with the old name pre-filled to edit.)
2. **Should a look from another plan set be searched by default, or only
   when asked?** Recommended: this set's look first, the others too — they
   are all still only proposals.
3. **Whole-legend capture:** when a name matches, leave it as it is by
   default (recommended), or default to "add as another look"?
4. **How many looks to search at once?** Recommended: up to 5, this set's
   first. More costs time on Find and money on the Reader.
5. **When a new look also matches another item's marks,** warn and default to
   Cancel (recommended), or refuse outright?
6. **Removing the last look of an item:** allow it, leaving the item with no
   picture (recommended — that is allowed today), or refuse?
7. **Does the Reader send every look, or only the set's own?** Recommended:
   the set's own first, others up to the cap — measured with the accuracy
   test before turning the cap up.

---

## SHORT SUMMARY

- Today a capture with an existing name says "Already in your legend" and
  throws the new picture away; one look per item, enforced only in code.
- Plan: ask "Add as another look for <item>?" (Yes / No, separate item /
  Cancel). Looks stay ONE item, one count, one price.
- Stored per look: picture, plan set and sheet, box, who and when — in one
  new additive table `symbol_looks`, which replaces R.11's box on the item.
  A numbers it.
- Find all matching and the Reader use every look, this set's first, merged
  so one device is one match; a new look's matches are never swept in by
  "Confirm all", and a look that also matches another item is warned about
  before saving.
- No look change ever moves a mark, a count or a locked bid. Seven
  questions for the owner in § 9.

## 10. Built, 2026-10-05 (track-c) — and what was seen on screen

**Code:** `shared/symbolLooks.ts` (the rules: this set's first, at most five,
the same picture twice, the per-set test), `server/db.ts` (`createSymbolLook`,
`getSymbolLooks`, `countSymbolLooks`), `takeoffStampsRouter.captureSymbol`
(`box`, `addAsLook`) and `searchLooks`, `client/src/lib/lookMatching.ts` (the
merge and the per-set flag), the PDF worker (`findOnVectorPage`,
`findOnScanPage`), `scanMatching.ts` (the scan search split into prepare once,
search per look), the naming card's question (`SymbolCapture.tsx`) and the
panel lines (`FindMatching.tsx`).

**Choices made in building it, each to the plan's own decisions:**

- A NEW item captured with a box gets its first look row then, with the box,
  so it can seed a search later. An item from before keeps its old picture as
  a box-less first look; when a second look is added, that old picture is
  written as a box-less row so it is not hidden (still no backfill).
- A look from another plan set is rebuilt from THAT set's drawing (the
  worker opens it by a viewer url minted in `searchLooks`, after both are
  found under the company). On a scan, another set's look is not compared at
  all, and the panel says how many were left out and why.
- With looks, the box is optional: "Search the saved looks without a box".

**Tests that fail without it** (checked by breaking each): `server/symbolLooks.test.ts`
— the second picture kept as a look of the SAME item, one legend row, the
same box not saved twice, an old picture kept, no count moved, another set's
look marked not confirming with its url, another company not found (4 of 10
go red with the add-a-look branch switched off). `client/src/lib/lookMatching.test.ts`
— one device one find, and a find only another set's look made is never
clear (red with the per-set flag switched off).

**Seen on screen, 2026-10-05** (local, the reader-test account; the looks
made were removed afterwards):

- Capturing a UNCC duplex as "DUPLEX RECEPTACLE": the card asked, showing the
  item's look beside the new one; "Yes" → "Added look 2 for DUPLEX
  RECEPTACLE. It is still one item: one count, one price."; the legend row
  read "· 2 looks".
- On Weld 1 E-200: "Its 1 saved look will be searched too — 1 from other plan
  sets, which only suggest…". The UNCC look found **0** there: UNCC draws
  the duplex at another size, and the line matcher compares exact sizes
  (`find-all-matching-plan.md` § 2, "what it cannot do"). Said, not hidden.
- On a second upload of UNCC (bid 1728359, another plan set to the app):
  looks only → 142 found, 141 already counted, the last **needs a look:
  "Found only by a look saved on UNCC.pdf…"**, 0 clear. Box drawn there plus
  the look → 151 found, "Also searched 1 saved look", merged.
- A look of the "USB" duplex block found only itself — that block is drawn
  differently (15 segments, not 14). Measured in node too; the screen was
  right.

**Not built:** see the status line at the top.
