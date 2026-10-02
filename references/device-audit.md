# Device audit — phone, tablet, laptop (2026-10-01, Track B)

> **What a device is for (owner's brief, 2026-10-01):** a **phone** reviews
> bids, counts, proposals and looks at plans. A **tablet** — iPad or Android,
> upright or sideways — does **everything**: counting, tracing, capture, Find
> all matching, assemblies, materials, proposals. The **laptop** stays exactly
> as it was.
>
> **This overrides two earlier decisions — said here and in the older file**
> (CLAUDE.md § "Where decisions live", habit 2):
>
> 1. `track-b-phone-and-readability-plan.md` § 0, owner's answer 5 ("laptop
>    layout held sideways, phone layout held upright"). An upright tablet now
>    gets the **tablet** layout: the panel beside the drawing, never the
>    phone's one-panel-at-a-time screen. Rule: `client/src/lib/plansLayout.ts`.
> 2. The same plan's § 3, "the phone gets the same tabs as one FULL-SCREEN
>    panel". The phone's panel is now a **bottom sheet** over the lower half
>    of the drawing, which stays visible and movable above it.

---

## How this is measured — and what the measurement cannot see

`pnpm device:audit` (`scripts/deviceAudit.mts`) drives the **installed Google
Chrome** through `playwright-core` (no browser download) at four real
viewports, with real touch emulation (`hasTouch`, `isMobile`, so
`(pointer: coarse)` is true on the touch sizes):

| Size               | Viewport   | Touch |
| ------------------ | ---------- | ----- |
| `phone`            | 390 × 844  | yes   |
| `tablet-portrait`  | 820 × 1180 | yes   |
| `tablet-landscape` | 1180 × 820 | yes   |
| `laptop`           | 1536 × 864 | no    |

It replaces the Chrome-extension route for this kind of check. That window is
hidden and cannot be resized (`local-verification-gotchas`), so every earlier
"checked at phone width" was a same-origin iframe with no touch, no
`pointer: coarse` and no real viewport.

For each screen, and for each **opened state** (quote-app panel, the plan
panel on Totals, capture armed, the proposal as printed), it records:

- **sideways** — the page, or a box inside it, scrolls sideways. A strip that
  is MEANT to swipe says so with `data-sideways-ok` (the panel's tab row).
- **offRight** — text whose right edge is past the window.
- **overlap** — two pieces of visible text printed over each other. Added
  after the Count screen's names were drawn over their quantities and no
  other number saw it.
- **tooWide** — the element that MAKES a page too wide (wider than the window,
  with no wider child). This is what found the bid page's implicit grid
  column.
- **small** — visible controls under 44 × 44 px. Switches and checkboxes are
  measured by their hit ring (see "Touch targets" below).
- a screenshot of the first screen, and a second one a screen further down.

`--check` exits 1 on a hard fault (sideways, offRight, cut off below). The
session is minted in-process from `.env`'s `JWT_SECRET` and never printed.

**What it cannot see, and was looked at by eye instead:** a column that has
collapsed to ZERO width (the Materials and Assemblies names). Nothing overlaps
and nothing overflows, so every number is clean while the name is simply gone.
Every screen below was looked at in its screenshots, both sizes, before and
after.

**Fixtures:** "Bar layout check" (bid 1164558, user 1) for every screen —
read-only, as CLAUDE.md asks. The touch check WRITES, so it runs on the
throwaway "Send all check 04:33:21" (bid 1728369) and removes what it made.

---

## Before → after, in numbers

Measured by the SAME harness both times: "before" is `origin/local-dev` at
`659782a`, run from a separate worktree on port 3009; "after" is this branch.
States = screens plus opened states; a state counts once per fault kind.

| Size            | Sideways  | Text off the edge | Text over text | Controls under 44 px |
| --------------- | --------- | ----------------- | -------------- | -------------------- |
| phone           | 6 → **0** | 4 → **0**         | 3 → **0**      | 249 of 274 → **0**   |
| tablet upright  | 2 → **0** | 2 → **0**         | 2 → **0**      | 294 of 309 → **0**   |
| tablet sideways | 0 → 0     | 0 → 0             | 0 → **0** \*   | 415 of 436 → **0**   |
| laptop          | 0 → 0     | 0 → 0             | 0 → 0          | unchanged, by design |

\* One overlap on the sideways tablet appeared DURING the work (a long bid-line
name running under its quantity) and was fixed; it was latent before.

Two upright-tablet states could not even be opened before — the panel's tabs
were behind the phone layout's full-screen panel. They open now.

**If the numbers you get do not match these, stop and find out why** before
believing either. A mismatch means the screens changed, the fixture bid
changed, or the harness changed — and those want different responses
(CLAUDE.md § "A checklist that states a count").

**One flaw in the "before" pictures:** the old build was served from a
worktree whose `node_modules` was a junction, and pdf.js's worker would not
load through it, so the before shots of the plan viewer show "could not be
opened" where the drawing should be. The bars, panels and their sizes around
it are the real ones — that is what those shots are for.

Screenshots: `references/device-audit/before/` and `…/after/`, named
`<size>-<screen>.jpg` and `<size>-<screen>-2.jpg` (one screen further down).
`report.json` in each folder has every measurement and the offending element.

---

## Problems found, worst first (by how much they block a bid)

| #   | Where                               | Problem                                                                                                                                                                                        | Device         | Status                                                                                                                      |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plan viewer                         | **A finger that lands to pan places a mark.** Marks and trace points go down on `pointerdown`; nothing told touch apart. A pan, a pinch, the second finger of a pinch — each was a stray mark. | tablet, phone  | **Fixed.** Touch router + `@/lib/touchGesture` (below). Proven: switch the router off and the touch check fails 8 of 12.    |
| 2   | Plan viewer                         | **No pinch, no two-finger pan.** With a tool armed the only pans were right-drag, middle-drag or Space+drag.                                                                                   | tablet, phone  | **Fixed.** Two fingers pinch and pan at any time, tool armed or not, and never place.                                       |
| 3   | Plan viewer                         | **Upright tablet: drawing ~116 px wide** — both side panels docked beside it, or the phone layout's full-screen panel hiding it.                                                               | tablet upright | **Fixed.** Tablet layout: sheets become a tab in the right panel; the panel caps at 38% of the width (312 px upright).      |
| 4   | Plan viewer                         | **Phone: bars take ~45% of the screen** — header and toolbar ran from y 56 to y 444, leaving the drawing about 350 px of 844.                                                                  | phone          | **Fixed.** One-line header with ⋯; Count, Undo, Delete, Tools, Fit. Measured after: bars end at y 266, drawing 530 px tall. |
| 5   | Plan viewer                         | **Keys, Shift and right-click only:** multi-select, box-select, free leg start (Alt), remove a run point, cancel a capture.                                                                    | tablet, phone  | **Fixed.** See the touch table.                                                                                             |
| 6   | Plan viewer                         | **A tap on "Finish" within 0.7 s of the last point was eaten** (found by the touch check, in this work's own first version).                                                                   | tablet, phone  | **Fixed** before it shipped: real controls are never swallowed.                                                             |
| 7   | Bid                                 | **The bid 79 px wider than the phone** (469 in 390); costs cut off; remove ✕ hover-only; the header pinned at a third of the screen.                                                           | phone          | **Fixed.** Lines are cards; the grid column is `minmax(0,1fr)`; on a phone the header scrolls away with the page.           |
| 7a  | Bid header                          | **Upright tablet: the bid's NAME squeezed to zero width** and its status to "D" — six buttons and a date left the title nothing. Not caught by any number; seen in the screenshot.             | tablet upright | **Fixed.** Under 1280 px a title row keeps 14rem for the title and wraps its buttons below (`.page-header`, index.css).     |
| 8   | Count screen                        | **Names printed over the quantity and cost.**                                                                                                                                                  | phone          | **Fixed.** Cards.                                                                                                           |
| 9   | Materials, Supplier pricing         | **Material names collapsed to nothing**; badge over the unit; pricing list scrolled sideways.                                                                                                  | phone          | **Fixed.** Cards; the virtual list's row height follows the breakpoint.                                                     |
| 10  | Assemblies, editor, Kits, Modifiers | Names cut to 3–4 letters ("Ded…"); the edit pencil drawn over the hours; recipe material names zero-width.                                                                                     | phone          | **Fixed.** Cards.                                                                                                           |
| 11  | Proposal                            | The form covered the page; header squeezed to a word per line; page at 80% wider than its pane on an upright tablet.                                                                           | phone, tablet  | **Fixed.** Phone: page first, fitted to the width, form below. Tablet: zoom fitted to the pane.                             |
| 12  | Every screen's title row            | Explanation squeezed to one word per line (the Dashboard's ran 14 lines).                                                                                                                      | phone          | **Fixed.** `.page-header` wraps on a phone (index.css), on all 17 headers.                                                  |
| 13  | Settings                            | A caption that would not wrap pushed the page 212 px sideways.                                                                                                                                 | phone          | **Fixed.** `PercentKindInput` wraps below md.                                                                               |
| 14  | Labor rates                         | Badge drawn over the "Hourly" text.                                                                                                                                                            | phone          | **Fixed.** Cards.                                                                                                           |
| 15  | Everywhere                          | **~95% of controls under 44 px** on touch sizes; hover-only buttons (remove a line, archive, duplicate, legend unlink) did not exist for a finger.                                             | tablet, phone  | **Fixed** in one place: the coarse-pointer block in `index.css`.                                                            |

---

## Touch: every keyboard, right-click and hover-only action, and its finger version

Inventory taken across `TakeoffPage`, `components/takeoff/*`, `QuickBidPage`,
`BidsPage`, `ProposalPage`, the library pages and `QuoteAppPanel`.

| Action                                                                           | Mouse / keyboard                       | Finger                                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Place a mark, a trace point, a calibration                                       | click (on `pointerdown`)               | **tap** — placed when the finger lifts, never when it lands                                                                                |
| Pan                                                                              | drag; right/middle/Space-drag mid-tool | **one finger** drag (places nothing), or **two fingers**, tool armed or not                                                                |
| Zoom                                                                             | wheel, `+` `−` `0`                     | **pinch**; Fit on screen (phone: Fit only, pinch does the rest)                                                                            |
| Undo / Redo                                                                      | Ctrl+Z / Ctrl+Shift+Z                  | toolbar ↶ (phone: Redo in Tools); the toast names the step undone                                                                          |
| Delete selection                                                                 | Delete / Backspace                     | toolbar Delete; the selection pill's Delete                                                                                                |
| Add/remove one mark from selection                                               | **Shift-click**                        | **Select** switch in the toolbar (phone: Tools → Select several marks), then tap marks                                                     |
| Box-select marks                                                                 | **Shift-drag**                         | **Select** switch, then drag one finger                                                                                                    |
| Move to… (another count)                                                         | the pill's select                      | the same native select — works by touch once marks are selected                                                                            |
| Put the count down                                                               | Esc                                    | "Counting X ✕" (existing); pill hint says "tap to place · two fingers move the sheet"                                                      |
| Count again                                                                      | R                                      | "Again: X" button (existing)                                                                                                               |
| Finish a run                                                                     | Enter, double-click                    | Finish in the trace pill (the pill wraps to fit an upright tablet)                                                                         |
| Undo last trace point / discard                                                  | Backspace / Esc ×2                     | ↶ and ✕ in the trace pill (existing)                                                                                                       |
| New leg from a point on the run                                                  | Shift-click                            | New leg button (existing)                                                                                                                  |
| Free point, no snap, for a leg start                                             | **Alt-click**                          | **Snap / Free** switch in the trace pill                                                                                                   |
| Move a run point                                                                 | drag the handle                        | drag the handle — handles are 24 px across on touch (10 with a mouse) and take the finger directly (`data-touch-drag`)                     |
| Remove a run point                                                               | **right-click** the handle, or Delete  | tap the point → **Point picked · Remove point** pill (shown with a mouse too)                                                              |
| Capture a symbol / Find all matching box                                         | drag a box; Esc cancels                | drag one finger (the capture layer takes it); **"Box a symbol to capture ✕"** in the toolbar; on a phone the bottom sheet puts itself away |
| Copy text box                                                                    | drag; Esc                              | drag one finger; ✕ in its bar (existing)                                                                                                   |
| Calibrate                                                                        | Esc undoes a click, then cancels       | **Undo click / Cancel** button in the calibrate bar                                                                                        |
| Right-click spelling fix in name boxes                                           | right-click (browser menu)             | long-press in the box — the router leaves inputs and buttons to the browser                                                                |
| Fold a side panel                                                                | 18 px rail chevron                     | a 44 × 44 button overhanging the drawing edge; folded strip 44 px                                                                          |
| Hover-only controls (remove line, archive, duplicate, legend unlink, reader Fix) | hover                                  | always shown on a coarse pointer — one CSS rule matches `opacity-0` + `group-hover:opacity-100`                                            |
| Count screen picker                                                              | ↑↓ Enter Esc                           | tap a result; the hint says so                                                                                                             |
| Sheet rename pencil                                                              | hover                                  | already shown on coarse (unchanged)                                                                                                        |

### How the router works (`TakeoffPage`, PlanPane, and `@/lib/touchGesture`)

- Touch pointers on the drawing are caught on the **window, capture phase**,
  before React or any overlay. Mouse and pen are not touched.
- One finger is **held**: a tap is replayed to whatever is under it as
  `pointerdown`/`pointerup`/`click`, so every tool keeps its one code path; a
  drag past 10 px pans; a second finger, at any time, makes it a pinch.
- The finger left behind after a pinch cannot tap — lifting two fingers is
  never simultaneous, and the straggler used to be exactly a tap's shape.
- **Exceptions, explicit:** a real control or text box on top of the drawing
  (`button`, `input`, `[role=button]`, …) goes straight to the browser; an
  element marked `data-touch-drag` (capture box, copy-text box, run handles,
  Select mode's box) gets the finger directly, and a second finger cancels it
  with a real `pointercancel` and pinches instead.
- The browser's own click after a held tap is swallowed for 0.7 s — but never
  a click on a real control (that was finding #6).

### Touch targets (`client/src/index.css`, the coarse-pointer block)

`@media (pointer: coarse)`: every button, link, tab, menu item, input and
select is at least 44 × 44 (`min-*`, so components are outgrown, not fought);
a control's own small `min-h-5…10` is lifted too; switches and checkboxes
keep their look and get an invisible 44 px hit ring (`::after`). A laptop's
mouse does not match the query, which is how the laptop stays byte-identical.

---

## Layouts

- **Phone** (`< 768 px`, or a finger with a short side under 600 px):
  - header one line + ⋯ (Materials list, Export takeoff, Add PDF);
  - toolbar: sheet ‹ › ⋯, Count, Undo, Delete, **Tools** (Trace conduit,
    Trace cable, Copy text, Find all matching, Select, Redo), Fit;
  - the panel is a **bottom sheet** (55% of the screen, taller on demand, Done
    to close); it puts itself away when a tool that works on the drawing is
    armed;
  - the app's bottom nav hides on Plans (unchanged).
- **Tablet** (a finger, bigger than that, either way round): the laptop's
  arrangement, minus the second panel — sheets are the panel's first tab — and
  the panel capped at 38% of the width. The bid header's description is hidden.
- **Laptop**: unchanged.
- **Other screens on a phone:** every title row wraps (`.page-header`); every
  table is a card list below `md` (bid lines, counted lines, materials,
  supplier pricing, labor rates, assemblies and the recipe editor, kits,
  modifiers); the bid page scrolls as one page; the proposal shows the page
  first, fitted to the width.

---

## Tests

- `client/src/lib/touchGesture.test.ts` — the gesture machine, by touch
  sequence: a tap places at the LANDING point; a drag, a resting finger, a
  cancelled touch, any second finger and the finger left after a pinch place
  nothing; pinch math keeps the drawing under the fingers (fixture shaped
  unlike its viewport, on purpose). In `pnpm test`.
- `client/src/lib/plansLayout.test.ts` — the three-way layout rule, including
  an upright tablet and a big phone on its side.
- `pnpm device:audit --check` — no sideways scroll, no text off the edge, at
  each size, on each main screen and opened state.
- `pnpm device:touch` — real touch events (CDP `Input.dispatchTouchEvent`) at
  tablet both ways and phone: tap places one; one-finger drag, pinch and
  two-finger pan place none; on-screen Undo; Select + taps + Delete; a finger
  drag boxes a capture; two taps + Finish trace a run, Undo takes it back; the
  phone's bottom sheet opens and closes. **Shown to go red**: with the router
  switched off it fails 8 of 12 on the tablet.

The two device scripts need the dev server and Chrome, so they are not in
`pnpm test` or CI — they are run by hand, like `smoke.mjs`.

---

## Still needs a real device

Emulation is Chrome's touch pipeline on a desktop. Not checked:

- **iPad Safari and Android Chrome themselves** — Safari's own gesture
  handling (double-tap zoom, the edge-swipe back gesture over the drawing),
  and whether `touch-action: none` holds there exactly as in Chrome.
- **Palm and pencil:** an Apple Pencil is `pointerType: "pen"`, so it places
  on contact like a mouse — intended, but untested on hardware.
- **Turning a tablet mid-count** (panel width and layout follow; the armed
  tool and zoom should survive).
- **Run handles at 24 px** — big enough to see past a fingertip at most zooms;
  judge on a real sheet.
- **Printing from a tablet** — the print stylesheet was checked by emulation
  only.

## Left to do

- Trace on touch has no rubber-band preview between taps (there is no hover).
  A press-hold-drag with a magnifier would fix that and finger-cover too.
  **Not simple — a new state in the gesture machine; in `todo.md`.**
- ~~The phone's Supplier pricing screen spends ~460 px on header, tabs, search
  and filters before the first card.~~ **Done 2026-10-01:** first card at
  462 px → 296 px on a 390x844 phone (measured, `[data-index]` top); the
  description hides on a phone, "Import" sits beside the title, the age filters
  are one sideways-scrolling row. Upright tablet unchanged at 317 px.
- ~~Tooltip-only explanations on the bid screen ("in run rate", the extra
  footage note) are still hover-only.~~ **Done 2026-10-01:** both are
  `TapExplain` — hover still shows the tooltip, a tap opens the same words.
  "in run rate" tapped and read on a phone and a laptop; the extra-footage
  note uses the same component but the fixture bid has no line that shows it.
