# Never stuck — every number and name easy to edit (PLAN, 2026-10-07)

**Plan only. Nothing here is built.** Track B, on `track-b`.

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

### Can be built now (no ★ file)

1. **"Needs price" / "Needs hours" become buttons** that open the material's
   editor focused on that field. Files: `MaterialsLibraryPage.tsx`.
   - Test: a source guard that the label is a `<button>` wired to
     `startEdit`. Then the screen check, including that the field is
     focused.
2. **"Needs rate" / "Set hours" the same**, on labor rates. Files:
   `LaborRatesPage.tsx`.
3. **Explanations a finger can open.** Replace the hover `title` on these
   with `TapExplain`, which already exists:
   - "Not priced" and "+ … not priced" in `LineCost.tsx`;
   - the total's "+ N not priced" in `NotPricedTotal.tsx`.

   Both files are clear of C. Test: the explanation text is reachable without
   hover (source guard), then a tablet screen check.

4. **Rename a shop's own height type.** The server half exists
   (`renameType`). Add the field in `HeightsSection.tsx` (clear of C).
   - Test: the server test for `renameType` already exists; add a client
     source guard that it is called.
5. **"Customer: not set" opens the client picker** in
   `AccountingExportDialog.tsx` (clear of C).
6. **"+ N with hours not set" on a kit** lists its assemblies, each opening
   the assembly editor. `KitsPage.tsx` (clear of C).
7. **Analytics "not priced — N bids"** links to those bids.
   `IncompleteFiguresNote.tsx` (clear of C).

### Wait for Track C to merge

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

    **Save** writes the library row (forking a starter, as today) **and
    re-snapshots THAT line.**
    - **The snapshot freeze is the reason this is not automatic** (CLAUDE.md
      § Architecture: "never mutate a snapshot field"). So the re-snapshot
      is an explicit action on one line, named on the button: "Save and
      update this line". Other lines on this bid, and other bids, keep their
      frozen numbers.
    - A second button, "Update all N lines using it on this bid", is the
      deliberate bulk version.
    - **Needs a new server procedure**, `bids.refreshLineFromLibrary`,
      modelled on `db.priceLineFromAssembly`. Files: `bidsRouter.ts` ★,
      `server/db.ts` ★, `BidsPage.tsx` ★, `LineCost.tsx`,
      `shared/lineNotPriced.ts` ★, `client/src/lib/notPricedTotal.ts` ★.
      **No migration.**
    - **Tests that must fail without it:**
      - the line's numbers move and the "not priced" count drops;
      - another bid using the same assembly does NOT move;
      - a line on this bid not chosen does NOT move;
      - a starter edit forks it and leaves the shipped row alone.
    - The totals strips then get "Fix these" buttons that walk the same
      panels line by line.

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
