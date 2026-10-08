# Never stuck — every number and name easy to edit (PLAN, 2026-10-07)

> **STATUS, 2026-10-07 (later).**
>
> - **Gaps 1–7 are BUILT** (§ 3). Tests: `client/src/lib/neverStuck.test.ts`
>   and `server/analyticsNotPricedNamed.test.ts`, red on the old code.
> - **Track C has merged into local-dev** (`bea4d8f`), so the ★ items below
>   no longer wait on C.
> - **Gap 11 is amended by the owner:** an "Also save to my library" tick box,
>   ON by default. See gap 11.
> - **The Example price, hours and rate tags now exist** (Track A's
>   0132–0134). They open on a tap. On a labor rate, the tag also opens the
>   rate (gap 2).

**Written as a plan; § 3 says what is built.** Track B, on `track-b`.

**The owner's rule:** a user must never feel stuck. Every number and every
name must be easy to edit.

The test used here is stricter than "can it be edited somewhere". **Every
warning has a one-click fix right where it shows**, meaning a click opens the
price, hours or rate box, or the choice, in place.

This is the same principle as CLAUDE.md § "As manual or as automated as the
user wants": a warning that names a problem and then sends the person
elsewhere is a toll gate.

## How this was checked

Every user-facing warning was found by searching `client/src` and `shared/`
(tests excluded) for:

- `not priced`, `not set`, `unconfirmed`, `Can't price`, `No drop here`,
  `Set scale`, `only one end`, `Needs price/hours/rate`, `Not on the bid`,
  `Price this`, `Example price/hours/rate`;
- the warning styling itself: `AlertTriangle`, `text-amber`, `#F5C518`.

Every hit was read. The edit paths were read in the pages and in each
library router.

Three load-bearing claims were then checked directly:

- the server has no "refresh this line from the library" procedure;
- `takeoffHeights.renameType` has no caller in the client;
- "Needs price" is a plain `<span>`, not a button.

"Clicks" are counted from the screen where the warning shows. A file marked
**★** is changed on Track C's `c-homerun-footage` (diffed 2026-10-07), so
work in it waits until C merges.

---

## 1. Every warning, and whether it fixes in place

**Legend:** ✅ = one click, in place · ↗ = fixable, but somewhere else (clicks
given) · ✗ = no fix offered.

### Bid screen (`BidsPage.tsx` ★, `LineCost.tsx`, `NotPricedTotal.tsx`)

**Hand-priced lines**

| Label        | Fix today                                                                            |
| ------------ | ------------------------------------------------------------------------------------ |
| "Not priced" | ✅ The price, hours and role fields are on the line itself (`HandPricedLineFields`). |

**Assembly lines and run lines**

| Label                                           | Fix today                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| "Not priced", in the cost or hours cell         | ✗ on the line. A hover-only `title` explains it, which a finger cannot open. |
| "+ material not priced"                         | ✗ on the line.                                                               |
| "+ N parts not priced"                          | ✗ on the line.                                                               |
| "+ hours not set"                               | ✗ on the line.                                                               |
| "Hours not set", in the hours cell              | ✗ on the line.                                                               |
| "Can't price · ref", with a red hint underneath | ✗ The hint says what to do; nothing is clickable.                            |

The line-level fix for all of these is remove and re-add:

1. Go to Library.
2. Find the assembly.
3. Type the price or hours.
4. Save.
5. Go back to the bid.
6. Remove the line.
7. Search for the assembly again.
8. Add it.

That is 8 or more clicks, because no procedure re-snapshots a line from the
library.

**Totals strips** (yellow, each with a triangle icon)

| Label                                      | Fix today                           |
| ------------------------------------------ | ----------------------------------- |
| "N lines are not priced"                   | ↗ The strip only says where to go. |
| "N lines have labor but no material price" | ↗ Same.                            |
| "N parts are not priced"                   | ↗ Same.                            |
| "N lines have hours not set"               | ↗ Same.                            |
| "labor not priced"                         | ↗ Same.                            |
| "no labor hours"                           | ↗ Same.                            |
| "hours but no labor rate"                  | ↗ Same.                            |
| "N lines use $X/hr" (older frozen rates)   | ↗ Same.                            |
| "+ N lines not priced" on the total        | ✗ A hover `title` only.             |

**The only link on any strip** is the Plans link, and it is used for "send
again".

### Proposal screen (`ProposalPage.tsx` ★)

| Label                                                                     | Fix today                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| "Price this / these before sending" (blocks printing)                     | ↗ "Back to the bid" only.                     |
| Items listed with "— not priced", "N parts not priced" or "hours not set" | ↗ The list items are not links to their line. |

### Quote panel (`QuoteAppPanel.tsx`)

| Label                                                      | Fix today                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "N lines use an example price — check them before quoting" | — Built, but **never shows**: the count is always 0 until Track A's `materials.isExamplePrice` exists. |

### Library screens

| Label                                           | Where                         | Fix today                                                                                                               |
| ----------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "Needs price" / "Needs hours"                   | `MaterialsLibraryPage.tsx`    | ↗ Click the pencil, then Save: 2 clicks. The label itself is a plain span. A "needs price" filter works as a worklist. |
| "Needs rate" / "Set hours"                      | `LaborRatesPage.tsx`          | ↗ Pencil: 2 clicks. The label is a plain span.                                                                         |
| "hours not set" on the list                     | `AssembliesLibraryPage.tsx` ★ | ↗ Click the name: 1 click to the editor, but the editor does not land on the hours field.                              |
| "not priced", "hours not set" inside the editor | `AssembliesLibraryPage.tsx` ★ | ✅ The fields are right there.                                                                                          |
| "+ N with hours not set"                        | `KitsPage.tsx`                | ✗ Text only.                                                                                                            |

### Plans screen

| Label                                                            | Where                              | Fix today                                                   |
| ---------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| "Drop heights not set — drops not counted"                       | `JobHeightsChip.tsx`               | ✅ Opens the heights popover.                               |
| "not set — no drop counted", on a run end                        | `runEnds.tsx` ★                    | ✅ The end-kind and height fields sit right under it.       |
| "no run height set for this job" / "no height set for this type" | `runEnds.tsx` ★                    | ✗ Text only.                                                |
| "Set ends — N runs have only one end counted"                    | `RunsPanel.tsx` ★                  | ✅ A button. Its fallback paragraph has no action.          |
| "N runs not in these totals — no usable scale"                   | `RunsPanel.tsx` ★                  | ✗ Text only.                                                |
| "Set scale" / "Not to scale" / "· not checked"                   | `ScaleControl.tsx`                 | ✅ Popover, with the type-in field focused.                 |
| "Not on the bid yet — N"                                         | `TakeoffSummaryPanel.tsx`          | ✅ "Send N to bid…".                                        |
| "No drop here" and its "not set" / "no height" rows              | `QuantityDropsReview.tsx`          | ✅ Approve / Take back in place.                            |
| A mark's "— Existing, not priced" and "No drop here — answered"  | `TraceLayer.tsx` ★                 | ✗ SVG `<title>` only, so it cannot be read on touch at all. |
| "Drop material not set — N drops not priced"                     | C's branch (`GroupDrop.tsx`)       | ✅ The picker sits right above it.                          |
| "+ N unconfirmed"                                                | C's branch (`HomerunControls.tsx`) | ✅ A re-point action.                                       |

### Elsewhere

| Label                  | Where                                  | Fix today                           |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| "Customer: not set"    | `AccountingExportDialog.tsx`           | ✗ No way to set it from the dialog. |
| "not priced — N bids…" | Analytics, `IncompleteFiguresNote.tsx` | ✗ No link.                          |

### Not built yet

The "Example price", "Example hours" and "Example rate" tags.

- They wait on Track A's columns (`materials.isExamplePrice`,
  `isExampleHours`, `isExampleRate`).
- When they come, each must be ✅ from day one: clicking the tag opens the
  number. Editing clears the tag, which is the owner's rule.

### What this adds up to

The **Plans screen is mostly in place** already.

The **bid screen is the problem.** Its most common warnings are about
assembly lines. They can only be fixed by leaving the bid, editing the
library, then removing and re-adding the line. That is the "stuck" feeling
the owner describes.

---

## 2. Can a shop rename, reprice and re-recipe anything? (laptop and tablet)

**Yes, for every library row, starters included, in 2 clicks.**

- Saving a shipped row FORKS it into the shop's account; the original is
  never touched. This applies to materials, assemblies, kits, labor rates,
  modifiers and run types.
- Each has a "revert to shipped".

| Row                              | Path                  | Clicks | What it edits                                                                                                                                          |
| -------------------------------- | --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Material                         | pencil → Save         | 2      | Name, category, unit, price, labor hours, markup, brand note, search aliases                                                                           |
| Assembly (starter or own)        | name or pencil → Save | 2      | Name, category, trade, project type, role (rate editable inline), base and overhead hours, Labor only, modifiers, parts (add, change quantity, remove) |
| Kit                              | row → Save            | 2      | Its assemblies and quantities                                                                                                                          |
| Labor rate                       | pencil → Save         | 2      | Name, rate, type                                                                                                                                       |
| Modifier                         | pencil → Save         | 2      | Name and percentage                                                                                                                                    |
| Job heights (Settings → Heights) | in place              | 1      | Set, add, retire or reset a height                                                                                                                     |

**Tablet.** `index.css` under `(pointer: coarse)` already does two things
app-wide:

- forces 44 px tap targets;
- reveals every hover-only pencil and ✕.

So the edit paths work on a tablet. **The tablet gap is the explanations, not
the controls.** Several warnings explain themselves only in a hover `title`,
which a finger cannot open:

- `LineCost.tsx`;
- `NotPricedTotal.tsx`;
- the "Needs price / rate" labels;
- the mark titles in `TraceLayer.tsx`.

The bid screen already has `TapExplain` for exactly this.

**What a shop CANNOT edit today:**

1. **A bid line's NAME.** The server accepts it (`bids.updateLine` takes
   `name`), but no screen offers it.
2. **Its own height type's name.** The server has `takeoffHeights.renameType`
   with no caller. Shipped height labels stay fixed, by design.
3. **Run types anywhere but the Plans screen.** There is no library or
   settings screen for them.
4. **An assembly line's price or hours from the bid.** See § 1.
5. **Setting a shipped starter's hours back to "not set"** throws until
   Track A's 0123 is in the schema.

---

## 3. Gaps, easiest first

★ = touches a file Track C changes, so it waits until C merges. Every gap
gets a test that fails without the change. Pure decisions go in
`client/src/lib` or `shared/`, where vitest can reach them; the screen
itself is checked on staging at laptop and tablet sizes.

### BUILT 2026-10-07 — gaps 1–7

1. **Materials: "Needs price" / "Needs hours" are buttons.** Each opens that
   row's editor with the cursor in the price or hours box, and the reason
   shows as a visible line under it. It used to be a hover-only tooltip.
   `MaterialsLibraryPage.tsx`; the words and the focus rule are in
   `client/src/lib/needsFix.ts`.
2. **Labor rates: "Needs rate", "Set hours" and the "Example rate" tag are
   buttons**, each opening the rate or yearly-hours box with the reason
   shown. The Example tag is included because it is a number someone should
   be able to replace in one tap. `LaborRatesPage.tsx`.
3. **Explanations a finger can open**, via `TapExplain`:
   - "Can't price", "Not priced" and "+ … not priced" (`LineCost.tsx`);
   - the totals' "+ N not priced" (`NotPricedTotal.tsx`);
   - the Example price/hours/rate tags on bid lines (`ExampleTags.tsx`).

   `TapExplain` now stops the tap from bubbling. Several totals sit inside a
   row that opens a bid (the Dashboard's cards, the profitability table),
   and a tap must not both explain and navigate.

4. **A shop renames its own height type**: tap the name, type, then Enter or
   click away; Escape cancels. Shipped names stay fixed, which the server
   enforces. `HeightsSection.tsx`.
5. **"Customer: not set" in the accounting export** is the bid's client
   picker, in the dialog (`ClientLinkField`, the same one the bid screen
   uses). Attaching a client re-reads the export.
   `AccountingExportDialog.tsx`.
6. **A kit's "+ N with hours not set"** now names those assemblies, each
   with an hours box in the panel. Saving writes the assembly (a starter
   forks), and the kit's figures move, because kit pricing resolves forks.
   **This went further than the plan**, which only said "open the editor".
   `KitsPage.tsx`.
7. **Analytics "not priced — N bids"** names up to 10 of those bids, each
   opening the bid. The names come from the same rule as the count
   (`notPricedNamed` in `server/analytics.ts`), drops included.
   `IncompleteFiguresNote.tsx`, both panels, `AnalyticsPage.tsx`.

### Next — Track C has merged, so these no longer wait (★ kept as history)

8. **"hours not set" on the assembly list opens the editor ON the hours
   field.** `AssembliesLibraryPage.tsx` ★.
9. **Rename a bid line.** The server already takes `name`; add it to the
   line's menu. `BidsPage.tsx` ★.
10. **The print block's items jump to their line** on the bid, with that
    line's fix open. `ProposalPage.tsx` ★ and `BidsPage.tsx` ★.
11. **THE BIG ONE: fix an assembly or run line from the bid, in place.**
    "Not priced", "+ material not priced", "+ hours not set", "Hours not
    set", "no labor rate" and "Can't price" each become a button. It opens a
    small panel on the line with the missing number:
    - the material's price, for a part not priced;
    - the assembly's hours, for hours not set;
    - the role's rate, for no labor rate.

    > **Amended by the owner, 2026-10-07:** the panel saves the number onto
    > THIS line, and offers a tick box **"Also save to my library", ON by
    > default**, so the next bid is not stuck on the same missing number.
    > **Sent and frozen bids never change.** This replaces the two-button
    > design that stood here ("Save and update this line" / "Update all N
    > lines").

    **How it works:**
    1. **Save always writes THIS line.** The typed price, hours or rate goes
       into this line's own snapshot fields, as a hand edit, and the line
       re-prices. That is the person deliberately changing their own line,
       which the snapshot rule allows. What it forbids is a line moving
       because something ELSE changed.
    2. **"Also save to my library" (ticked by default)** also writes the
       source: the material's price, the assembly's hours, or the role's
       rate. A starter forks, as every library edit does. That is the
       default because the owner's aim is that the next bid is not stuck
       too.
    3. **Nothing else moves.** Other lines on this bid using the same
       assembly, and every other bid, keep their frozen numbers. That is the
       snapshot freeze (CLAUDE.md § Architecture). A small note under the
       tick box says so: "Other bids keep their prices. New lines use this."
       Bringing other lines on THIS bid up to date stays its own deliberate
       action, offered afterwards only if there are some: "Update N other
       lines on this bid to the new figure?"
    4. **Sent and frozen bids never change.** The panel does not open on a
       bid whose quantities are locked, or that has gone to the customer
       (Sent, Won, Lost). It still EXPLAINS, so the person is not stuck
       wondering: "This bid was sent, so its prices are fixed. Fix it in
       your library for next time." The library half is still offered.
       That needs the same rule the bid screen already applies to editing a
       line; reuse it rather than writing a second one.

    **Needs:**
    - **One server procedure**, `bids.fixLine({ lineId, price?, hours?,
laborRateId?, saveToLibrary })`, that writes the line and, if asked,
      the library row, in one transaction. It refuses on a locked or sent
      bid, and that refusal is tested.
    - **Files:** `bidsRouter.ts`, `server/db.ts`, `BidsPage.tsx`,
      `LineCost.tsx`, `shared/lineNotPriced.ts`,
      `client/src/lib/notPricedTotal.ts`.
    - **No migration.**

    **Tests that must fail without it:**
    - the line's numbers move and the "not priced" count drops;
    - with the box ticked, the library row changes (a starter forks, the
      shipped row untouched);
    - with it unticked, the library does NOT change;
    - another bid using the same assembly does NOT move, ticked or not;
    - another line on this bid does NOT move until the person says so;
    - a sent bid and a locked bid refuse the line change, and allow the
      library change.

    The totals strips then get "Fix these" buttons that walk the same panel
    line by line.

12. **The run-end text warnings** ("no run height set for this job") open the
    heights popover. `runEnds.tsx` ★.
13. **A mark's "Existing, not priced" readable and fixable on touch**: a
    tap shows it with its status choice. `TraceLayer.tsx` ★.
14. **Run types editable outside the Plans screen**: a Settings or Library
    section reusing the Plans screen's editor. New section plus
    `TakeoffPage.tsx` ★.

### Waits on Track A's columns

15. **Example price / hours / rate tags**, ✅ from day one: clicking the tag
    opens the number, and editing clears the tag. The quote panel's warning
    is already wired to the count.
16. **Setting a starter's hours back to "not set"**, once 0123 is in the
    schema everywhere.

---

## Recommendation

- **Build 1–7 now.** They are small, they touch no Track C file, and
  together they remove every hover-only explanation and every dead-end label
  outside the bid screen.
- **Then build 11 first after C merges.** It is the one that actually ends
  the "stuck" feeling: the bid screen's common warnings are all about
  assembly lines, and today their only fix is leaving the bid. It needs no
  migration, but it is the one that must respect the snapshot freeze. So it
  is a deliberate per-line action, never an automatic re-price.
- Do 8–10 and 12–14 alongside it, since they share its files.
