# Track B — the Plans screen on a phone, and a readable right-hand panel

> **PLAN ONLY. Nothing here is built.** Written 2026-09-30 on `track-b` from
> the two "before beta" items in `todo.md` (owner, 2026-09-29). Both reshape
> the same right-hand panel, which is why they are one plan.
>
> **Owner's answers came in the same day, and they changed the plan's shape:**
> the right-hand panel becomes TABS (§ 1), and the phone gets the same tabs as
> one full-screen panel rather than the bottom drawers the first draft
> proposed. The answers are in § 0; the first draft's drawer layout is
> replaced in § 3, not deleted silently.
>
> **What this builds on, so nobody re-decides it:**
>
> - `references/track-b-panning-plan.md` § 3 and "Owner's answers" 3: touch
>   and phone were moved OUT of the panning work and INTO this piece, and
>   **guard 3 (on touch, place on a TAP, never on the finger landing) ships
>   with it.** It is not optional.
> - `references/takeoff-spec.md` ground rule 2: fingers on a tablet, about
>   44 px targets, **nothing reachable only by hover**, a double-click, a
>   right-click or a key.
> - `references/plan-viewer-overhaul.md` Phase 11 ("Tablet and touch") and
>   § 4a.1: "the rails are 18px, which is a mouse target". This plan is the
>   phone half of Phase 11. **When it is built, Phase 11's row gets a line
>   saying so** (CLAUDE.md § "Where decisions live", habit 2).
> - CLAUDE.md § Responsiveness rule 4: `h-dvh`, **exactly one child gives**
>   in a flex column, **prefer ONE scroll region over two stacked ones**, and
>   never animate the position of a full-height container that clips.
> - CLAUDE.md § "Customization … never in the way": the common few visible,
>   the rest behind ONE control.
> - CLAUDE.md § "AI features": opening the Reader tab is not a button press.
>   Nothing that opening a tab does may start a read.

---

## 0. Owner's answers, 2026-09-30

| #   | Question                                   | Answer                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | Which first?                               | **Laptop readability first, then phone.**                                                         |
| 2   | A separate amber for warnings?             | **Yes.** Yellow keeps meaning "selected / active".                                                |
| 3   | Fold "Not on the bid yet" by reason?       | **Yes, with a count per reason.**                                                                 |
| 4   | What is a phone for?                       | **Quick counts and checking a bid. Not whole takeoffs.**                                          |
| 5   | Tablets?                                   | **Laptop layout held sideways, phone layout held upright.**                                       |
| 6   | What does the "Counted items" number mean? | **Say it plainly**, e.g. "42 marks · 6 items".                                                    |
| —   | Main direction (new)                       | **The right panel becomes tabs**, one box at a time, ONE scroll area, never a scroll in a scroll. |

---

## 1. MAIN DIRECTION — the right-hand panel becomes tabs

> **BUILT on the laptop, 2026-09-30 (track-b).** The owner approved both
> calls below: selecting on the drawing opens its tab (rule 4), and a tab
> with a warning shows a mark (rule 5). What landed, and where it differs:
>
> - Rules live in `client/src/lib/panelTabs.ts` with tests beside them.
> - **Undo / Delete stay in the toolbar**, not in the pinned strip: they
>   already never scroll and never hide behind a tab, which is all rule 3
>   asks. The pinned strip holds the "This sheet" line and the lock notice.
> - **Traced footage (the per-type Send) sits on Runs**, above the runs.
> - Rule 4 also SCROLLS to the selection — measured on the fixture, a run's
>   editor was 2,073 px down the Runs tab, so "opens its tab" alone was not
>   "opens its editor". A selection opens a tab but is not remembered.
> - Rule 5 marks: Totals while anything is not on the bid or the totals
>   leave footage out (no scale, no type); Counts for a count whose assembly
>   is gone. The mark uses the new `--warning` amber; the rest of § 2.3's
>   sweep is still Part A.
> - Measured after: one scroll area per tab (rule 1 walk), four nested
>   scrollers removed, five tabs fit the 280 px minimum with px-1.5, and
>   opening Reader made no API call.
> - **Found on screen:** `transition-colors` on the tabs left the PREVIOUS
>   tab underlined in a background tab (transitions do not advance there).
>   Removed.
> - Part A items 2–6 were built the same day — see § 2.

### Why

Today the panel is one long column of everything: the counted list, the
selected run's editor, drop review, the Plan reader, layers, the legend, and
the bid totals pinned underneath. Measured on the fixture (§ 2): a 337 px
window onto 3,212 px of content. **And there are scrolls inside that scroll**
— `LegendPanel` has two (`max-h-52`, `max-h-40`) and `CoPilotPanel` two more
(`max-h-72`, `max-h-40`), each inside `RunsPanel`'s own `overflow-y-auto`. A
wheel two inches lower does something different. CLAUDE.md § Responsiveness
already prefers one scroll region; this finishes the job.

### The shape

```
 ┌───────────────────────────────────────────┐
 │ Counts │ Runs │ Legend │ Reader │ Totals  │  tabs: one open at a time
 ├───────────────────────────────────────────┤
 │ This sheet: 42 marks · 6 items            │  ALWAYS VISIBLE
 │ [↶ Undo] [🗑 Delete]                       │  (pinned strip, never scrolls)
 ├───────────────────────────────────────────┤
 │                                           │
 │   the open tab's content                  │  the ONE scroll area
 │   (no scroll boxes inside it)             │
 │                                           │
 │                                           │
 └───────────────────────────────────────────┘
```

**The rules, each one a thing that can be checked:**

1. **One tab open, and its content is the panel's one scroll area.** Inside a
   tab nothing has its own `max-h-*` + `overflow-y-auto`. The four nested
   scrollers above are removed, not restyled. Check: a walk of the panel finds
   exactly one element whose `overflowY` is `auto`/`scroll` and whose content
   is taller than it.
2. **The open tab is remembered** — per person, in `localStorage`, read and
   written inside `try/catch` so a blocked store just opens Counts. It is a
   convenience, so browser storage is the right place (CLAUDE.md storage
   rule); nothing on the server.
3. **Undo / Delete and this sheet's totals never scroll and never hide behind
   a tab.** They are the pinned strip above the scroll area. "This sheet"
   totals are the one-line "42 marks · 6 items" plus, when there are runs,
   their feet.
4. **Selecting something ON THE DRAWING opens its tab.** Click a run, the
   Runs tab opens with its editor; click a mark, Counts opens on its card.
   Without this the editor for the thing you just picked is inside a closed
   tab. Arming a tool does NOT switch tabs — that would fight rule 2. (Decided
   here; say if you want it otherwise.)
5. **A tab that needs attention says so on the tab**, in the new amber (§ 2.3):
   e.g. "Totals ⚠" when lines are not on the bid. Otherwise a warning inside a
   closed tab is invisible, which is the opposite of what this pass is for.
6. **The Reader tab exists only when the reader does** (`DISABLE_AI_FEATURES`
   and the access tier), and opening it never starts a read.

### What goes in which tab

| Tab        | Holds (today's components)                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Counts** | The counted items and their cards (`RunsPanel`'s count half), `QuantityDropsReview` for counts                   |
| **Runs**   | Traced runs, and the selected run's editor (`RunTypePicker`, `RunSpecEditor`, `RunEndsSection`/`Editor`)         |
| **Legend** | `LegendPanel` and `LayersPanel` (what is drawn, and what is shown)                                               |
| **Reader** | `CoPilotPanel`                                                                                                   |
| **Totals** | `TakeoffSummaryPanel` ("Not on the bid yet", folded by reason, § 2.4), "This bid, all sheets", `BidDropsReadout` |

**Names.** Counts, Runs, Legend, Reader, Totals are short enough for five tabs
at the 280 px minimum width, and each is one word an estimator already uses.
I would keep them. The one I'd consider changing is **Totals → "Bid"**, because
what it really answers is "what is on the bid and what isn't"; but "Totals" is
plainer, so it stays unless you prefer "Bid".

**Width check before building:** five tabs at 280 px is 56 px each. At UI
scale 1.4 that is tight. Measure it; if they do not fit, they scroll
sideways as a strip — they do not wrap to two rows, and they never shrink
below a 44 px touch height.

### The "Counted items" header (answer 6)

**Today's number adds two different things.** `RunsPanel.tsx` ~1297 prints
`stampGroups.reduce((n, g) => n + g.count, 0) + runs.length` — this sheet's
MARKS plus this sheet's RUNS. On the fixture's sheet 1 that is 3 exit-sign
marks + 6 runs = "9", a number that counts nothing. (Measured 2026-09-30:
"9" on sheet 1, "0" on sheet 3, while the list beneath covered the whole
bid.)

It becomes the pinned line in rule 3, scoped and split:
**"This sheet: 42 marks · 6 items"** — marks placed, and distinct things
counted or traced. When there are runs the line adds their feet:
"· 248 ft of runs". The words "this sheet" are what make it true; the bid-wide
figures live on the Totals tab and say "this bid".

---

## 2. Part A — readability, on the laptop (FIRST, answer 1)

### What it is today (measured 2026-09-30, "Bar layout check", 1536 × 735, UI scale 1.0, panel 400 px)

| What                                | Measured                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Text elements in the panel          | 218                                                                                                                                |
| Smaller than 12 px                  | **126 (58%)**: 11.2 px (`text-[0.7rem]`) and 10.4 px (`text-[0.65rem]`)                                                            |
| In the muted grey (`oklch 0.58`)    | **112 (51%)**, some of those at 60–80% opacity on top                                                                              |
| The scrolling list above the totals | **337 px tall, holding 3,212 px**: about nine and a half screens of scrolling                                                      |
| Nested scroll areas inside it       | **4** (two in `LegendPanel`, two in `CoPilotPanel`)                                                                                |
| Where "This bid, all sheets" starts | y = 540 of 735: the totals get the bottom quarter                                                                                  |
| Warning colour                      | The brand yellow `#F5C518`, the SAME one that marks the active sheet, the armed tool and links (108 uses across the takeoff files) |

These are one fixture's numbers. A real job with forty counts will be worse on
every row. Measure again on one before calling Part A done.

> **BUILT, 2026-09-30 (track-b): items 2–6.** Measured on "Bar layout
> check", 1536 wide, panel 400 px, all five tabs (AI flag OFF, so Reader is
> present):
>
> | Measure                       | Before         | After                                   |
> | ----------------------------- | -------------- | --------------------------------------- |
> | Text elements under 12 px     | 125 of 237     | **6 of 211**, all capitalised headings  |
> | In the muted grey             | 108            | 76                                      |
> | Warnings in the brand yellow  | 25             | **0**                                   |
> | Totals tab: content / visible | 897 / 589 px   | 589 / 589 (folded; fits without scroll) |
> | Runs tab: content / visible   | 2,266 / 589 px | 2,519 / 589 (the bigger text's cost)    |
>
> - Item 3: every yellow use in the panel, the scale control and the heights
>   chip was decided one by one. **Stays yellow:** the active tab, a selected
>   row, chip hover, the selected scale, the armed Capture hint, "Check it",
>   and PROPOSALS (pull points, proposed drops, "Suggested") — those are drawn
>   yellow-dashed on the drawing, and the row must match its marker.
>   **Moved to `--warning`:** everything saying something is missing or
>   wrong, plus the scale's off-standard triangle and note, which were a
>   THIRD warning colour (`orange-300/400`). `CalibrateLayer`'s graded
>   orange is a different surface and was not touched.
> - Item 4: `foldNotOnBid` in `shared/takeoffSummary.ts`, tested in
>   `server/takeoffSummary.test.ts`. A row keeps its own reason only when it
>   differs from the line's; a sentence that only restates the line is left
>   off. **No "Set scale" / "Pick a type" fix on the folded line** — the
>   summary does not know which sheet or run, and there is no existing jump
>   to send it to. The one fix that exists, Send, stays under the folds.
> - Found on screen at 280 px: the run-type prefix made the ITEM the part
>   that truncated (now its own 12 px line), and the branch-wiring question's
>   two buttons ran 50 px past the panel (pre-existing; now wrap).
> - Checked at 400 and 280 px, UI scale 1.0 and 1.25, dark and light. Not
>   checked at a 1,366-wide window: the driven window is fixed at 1,536, and
>   the panel's own width (280–620) is what these rules depend on.

### What changes

1. **The tabs in § 1.** They are the biggest single cut to scrolling, so they
   land first and the rest is sized inside them.
2. **Two text sizes in the panel, not four.** Rows at 14 px (`text-sm`),
   secondary lines at 12 px (`text-xs`). 10.4 px leaves the panel entirely;
   11.2 px is kept only for capitalised headings. Nothing that states a
   quantity, a price or a warning is smaller than 12 px.
3. **A warning amber that is not the brand yellow (answer 2).** One token,
   `--warning`, a true amber (around `oklch(0.80 0.16 70)`, more orange than
   `#F5C518`), with a tinted background band, so a warning row reads as a
   different KIND of row and not just a different colour of text. Yellow
   keeps meaning "active / selected / the thing you are on". Applies to "Not
   on the bid yet", "6 runs carry no extra", "No vertical footage", "Not
   priced", the drop-heights chip and the tab badge (§ 1 rule 5). **Light
   theme too**, where amber on white needs its own darker value. Grep every
   `#F5C518` / `amber-` use and decide each one: selection stays yellow,
   warning moves (CLAUDE.md § "A fix can manufacture the fault another fix
   was for": the one nobody re-reads is the one that was already right).
4. **"Not on the bid yet", folded by reason with a count (answer 3).**
   One line per reason — "Traced, not sent yet — 9", "Counted, not sent
   yet — 1", "No run type — 2", "No scale — 1" — each opening to its rows.
   The reason is no longer repeated under every row. Reasons with a fix keep
   it on the folded line ("No scale — 1 · Set scale"), so the common action
   needs no unfolding.
5. **Muted grey is for labels, not for facts.** A quantity, a length or a
   warning never sits in the muted grey, and never at reduced opacity.
6. **Legend and Reader follow the same sizes and the same warning token.**
   The Reader is absent locally (`DISABLE_AI_FEATURES=true`), so **Part A is
   looked at with the flag OFF** (CLAUDE.md: a local run with the flag on
   renders a smaller app, and has already produced a wrong conclusion about
   this exact panel).

### How Part A gets checked

- At UI scale 1.0 AND 1.25, on a 1366-wide window and on 1536, with the AI
  flag off. Screenshot before and after, the same fixture.
- **The table above, measured again, before and after**: share under 12 px,
  share in muted grey, scroll height over visible height, nested scrollers
  (target 0). A readability pass that cannot say what moved is intent, not
  outcome (CLAUDE.md § "A count taken before the change is intent").
- The remembered tab survives a reload; with storage blocked the panel still
  opens (on Counts).
- **Look, act, look again**: place a mark and check the pinned "This sheet"
  line moves; send a count and check the Totals tab's folded counts move.
  Both are cached queries (CLAUDE.md § "A test that calls the server cannot
  see a screen showing yesterday's answer").

---

## 3. Part B — the phone (SECOND)

> **Replaces the first draft's bottom drawers (2026-09-30).** That draft had
> the two side panels as drawers covering ~70% of the drawing, opened from a
> bar. With tabs, the phone gets the SAME tabs as one full-screen panel
> instead: one way to see the panel, not a phone-only arrangement of it.

### What is wrong today (from `todo.md`, measured 2026-09-29)

At a 390 px window the sheet list (240 px) and the counts panel (400 px, its
own `shrink-0`) don't fit beside the drawing. The counts panel starts at
x = 276 and runs **286 px off screen**, taking its card buttons (undo, trash,
"Add a drop") with it. One finger scrolls the page and two zoom the page,
never the sheet.

The app shell already has a phone layout below `md` (a top header and a
fixed bottom nav, `BidRenderShell.tsx` ~636 and ~693). The Plans screen has
nothing of its own.

### What a phone is for (answer 4)

**Quick counts and checking a bid. Not whole takeoffs.** So the phone is
built and checked for: open a sheet, count something, see this sheet's
totals, see what is not on the bid yet, send it. Tracing stays reachable
(in the tool overflow) because manual mode must stay complete, but it is not
polished for fingers — no magnifier, no extra work. Calibrating a scale is
the same: reachable, not tuned.

### Which layout, and when (answer 5)

**Laptop layout held sideways, phone layout held upright** — for tablets.
A plain width breakpoint cannot say that (an upright iPad is 768–834 px, right
on Tailwind's `md`). The rule:

- **Phone layout** when the window is narrower than 768 px, **or** the
  pointer is a finger (`pointer: coarse`) **and** the screen is upright
  (`orientation: portrait`).
- **Laptop layout** otherwise — including a sideways tablet, which also gets
  44 px touch targets because its pointer is coarse.

One pure function in `client/src/lib` (`plansLayout({ width, coarse,
portrait })`) with a test, read through one hook — not three media queries
scattered through the page, which is how two components end up disagreeing
about which layout they are in.

### The phone layout

```
 Drawing showing                     A tab open (full screen)
 ┌──────────────────────────┐        ┌──────────────────────────┐
 │ ← Bid   E1.01 Sheet 3 ▾  │        │ ← Plan        E1.01      │
 ├──────────────────────────┤        ├──────────────────────────┤
 │ [Count ▾]  [↶] [🗑]  [⋯] │        │Sheets│Counts│Runs│Totals⚠│
 ├──────────────────────────┤        ├──────────────────────────┤
 │                          │        │ This sheet: 42 marks ·   │
 │                          │        │ 6 items      [↶] [🗑]    │
 │        the drawing       │        ├──────────────────────────┤
 │                          │        │                          │
 │                          │        │  the open tab            │
 │                          │        │  (one scroll area)       │
 ├──────────────────────────┤        │                          │
 │ 42 marks · 6 items   [▤] │        │                          │
 └──────────────────────────┘        └──────────────────────────┘
```

- **The same tabs, the same components, one full-screen panel.** On the
  phone the sheet list joins them as a **Sheets** tab, since there is no room
  for a left panel. Legend and Reader sit in the tab strip's overflow if five
  or six tabs do not fit at 360 px. No phone-only copy of any panel
  (CLAUDE.md § "Copying a layout does not copy the behaviour").
- **The drawing screen keeps the "This sheet" line and Undo / Delete visible**
  (§ 1 rule 3 holds on the phone too). Tapping the line, or [▤], opens the
  panel on the remembered tab; "← Plan" closes it.
- **Opening the panel never loses your place.** The drawing's zoom and pan
  are the same when you come back.
- **The app's own bottom nav hides on the Plans screen in phone layout.** Two
  bars along the bottom is one too many. "← Bid" goes to the bid.
- **No slide animation.** A full-height panel that clips must not move by
  keyframe (CLAUDE.md § Responsiveness rule 4: `tab-enter` froze half-way in a
  background tab once). It appears, or fades.
- **Every control is at least 44 px tall** (takeoff-spec ground rule 2).
- **Nothing hover-only.** The sheet row's edit pencil appears on hover
  (`SheetIndex.tsx`); with a coarse pointer it is always shown.

### Touch, and the guard that comes with it

From `track-b-panning-plan.md` § 3, unchanged:

| Gesture on the drawing | Becomes                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| One finger, drag       | Pans the sheet (`touch-action: none` on the pane, NOT on the page)  |
| Two fingers            | Pinch-zooms the sheet about the midpoint                            |
| One finger, tap        | With a tool armed: places the point or the mark. With none: selects |

**Guard 3 is the whole risk:** a finger that lands to pan is a `pointerdown`,
and today a placement happens on `pointerdown`. On touch only, placement moves
to the TAP (down and up within the 4 px threshold). Mouse and pen keep placing
on `pointerdown`, which is what makes them precise. **The decision lives in
`client/src/lib`, with a test**: a touch sequence that moves past the threshold
places nothing. A second finger arriving cancels a pending tap. Touch pan and
pinch ship in the same change as this guard, never before it.

### How Part B gets checked

- **The driven Chrome window here cannot be resized** (it reports success and
  stays put, `local-verification-gotchas`). So a phone check needs a real
  phone on the LAN (`pnpm dev` bound to the machine's address), or Chrome
  DevTools device mode by hand. **Saying "checked at phone width" without one
  of those is not a check.**
- On a phone, upright: count something, read "This sheet", open Totals, send.
  Pan with Count armed and confirm **nothing was placed**. Pinch.
- On a tablet: upright gives the phone layout, sideways gives the laptop
  layout, and turning it mid-count loses nothing (armed tool, open tab, zoom).
- The leaf-element walk at 390 × 844 and 360 × 740.

---

## 4. What could put a wrong number on a bid

1. **A pan that places a mark or a point** (guard 3). That's why touch can't
   ship before the guard.
2. **A warning hidden in a closed tab.** A line not on the bid is a bid that
   is short, and with tabs it can be one click out of sight. § 1 rule 5 (the
   badge on the tab) is the guard, and it ships with the tabs, not after.
3. **A "This sheet" line that is stale.** It is a cached query; it goes
   through the screen's one refresh helper, keyed by sheet. Look, mark, look
   again.
4. **A tap meant for the drawing landing on the panel**, on the phone. The
   panel is full-screen and closes only by "← Plan", so there is no
   half-covered drawing to mis-tap.

---

## 5. Still open

Nothing blocks starting Part A. Two small calls were made in this plan and can
be overruled: **selecting on the drawing switches tabs** (§ 1 rule 4), and
**"Totals" keeps its name** rather than becoming "Bid".
