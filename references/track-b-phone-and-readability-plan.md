# Track B — the Plans screen on a phone, and a readable right-hand panel

> **PLAN ONLY, 2026-09-30. Nothing here is built.** Written on `track-b` from
> the two "before beta" items in `todo.md` (owner, 2026-09-29). Both reshape
> the same right-hand panel, which is why they are one plan.
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
> - CLAUDE.md § Responsiveness rule 4: `h-dvh`, one child gives in a flex
>   column, and **never animate the position of a full-height container that
>   clips**. That rule matters here, because a drawer is exactly a full-height
>   panel that moves.
> - CLAUDE.md § "AI features": opening a drawer is not a button press for the
>   Plan reader. Nothing in a drawer may start a read.

---

## Recommendation, in one paragraph

**Do the readability pass FIRST, on the laptop, as its own commit, then the
phone drawers on top of the panel it produces.** The readability pass changes
what is in the panel and how tall it is. The drawers change where the panel
lives. Done in the other order, the drawer is sized and tested around a panel
that is about to change, and both get looked at twice. Below `md` (768 px) the
two side panels become **drawers over the drawing, one open at a time**,
opened from a bar along the bottom of the drawing. Touch pan and pinch-zoom
ship in the same change as guard 3, never before it.

---

## Part A — the right-hand panel, readable at a glance

### What it is today (measured 2026-09-30, "Bar layout check", 1536 × 735, UI scale 1.0, panel 400 px)

| What                                | Measured                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Text elements in the panel          | 218                                                                                                                                |
| Smaller than 12 px                  | **126 (58%)**: 11.2 px (`text-[0.7rem]`) and 10.4 px (`text-[0.65rem]`)                                                            |
| In the muted grey (`oklch 0.58`)    | **112 (51%)**, some of those at 60–80% opacity on top                                                                              |
| The scrolling list above the totals | **337 px tall, holding 3,212 px**: about nine and a half screens of scrolling                                                      |
| Where "This bid, all sheets" starts | y = 540 of 735: the totals get the bottom quarter                                                                                  |
| Warning colour                      | The brand yellow `#F5C518`, the SAME one that marks the active sheet, the armed tool and links (108 uses across the takeoff files) |

The last row is the one I'd fix first. **A warning that is the same yellow as
"this is selected" can't stand out, however big it is.** That is the "amber
that reads as amber" the todo asks for, and it's a colour decision more than a
size one.

These are one fixture's numbers. A real job with forty counts will be worse on
every row. Measure again on one before calling Part A done.

### What changes

1. **Two text sizes in the panel, not four.** Rows at 14 px (`text-sm`),
   secondary lines at 12 px (`text-xs`). Retire 10.4 px from the panel
   entirely, and keep 11.2 px only for column headings in capitals. Nothing
   that states a quantity, a price or a warning is smaller than 12 px.
2. **Muted grey is for labels, not for facts.** "Traced, not sent yet." under
   every row is the same fact eleven times, so it stays grey. A quantity, a
   length or a warning never sits in the muted grey, and never at reduced
   opacity.
3. **A warning colour that is not the brand yellow.** One token,
   `--warning`, a true amber (around `oklch(0.80 0.16 70)`, more orange than
   `#F5C518`), with a tinted background band, so a warning row reads as a
   different KIND of row and not just a different colour of text. Yellow
   keeps meaning "active / selected / the thing you are on". Applies to "Not
   on the bid yet", "6 runs carry no extra", "No vertical footage", "Not
   priced" and the drop-heights chip. **Light theme too**, where amber on white
   needs its own darker value.
4. **Totals you can reach without scrolling.** Two moves, both small:
   - **Group the "Not on the bid yet" rows by reason, folded.** "Traced, not
     sent yet — 9", "Counted, not sent yet — 1", "No run type — 2". One line
     each, open on a click. Today every row repeats its reason. This is
     CLAUDE.md § "Customization … never in the way" rule 1: the common few
     visible, the rest behind ONE control.
   - **The totals block stays pinned** (it already is) and gets the bigger
     type. It's the one block that has to be readable from arm's length.
5. **Legend and Plan reader follow the same two sizes and the same warning
   token.** The Plan reader is absent locally (`DISABLE_AI_FEATURES=true`), so
   **Part A must be looked at with the flag OFF** (CLAUDE.md: a local run with
   the flag on renders a smaller app, and has already produced a wrong
   conclusion about this exact panel).

### How Part A gets checked

- At UI scale 1.0 AND 1.25, on a 1366-wide laptop window and on 1536, with
  the AI flag off. Screenshot before and after, the same fixture.
- The leaf-element walk from CLAUDE.md § Responsiveness rule 4 (nothing with
  text below the bottom edge without a scroll ancestor).
- **The numbers above, measured again, before and after**: share under 12 px,
  share in muted grey, scroll height over visible height. A readability pass
  that cannot say what moved is intent, not outcome (CLAUDE.md § "A count
  taken before the change is intent").

---

## Part B — the Plans screen at phone width

### What is wrong today (from `todo.md`, measured 2026-09-29)

At a 390 px window the sheet list (240 px) and the counts panel (400 px, its
own `shrink-0`) don't fit beside the drawing. The counts panel starts at
x = 276 and runs **286 px off screen**, taking its card buttons (undo, trash,
"Add a drop") with it. On the phone, one finger scrolls the page and two
zoom the page, never the sheet.

The app shell already has a phone layout below `md` (a top header and a
fixed bottom nav, `BidRenderShell.tsx` ~636 and ~693). The Plans screen has
nothing of its own. Its only breakpoints are those three in the shell.

### The layout

```
 ┌──────────────────────────┐
 │ ← Bid   E1.01 Sheet 3 ▾  │  one-line title bar: back, sheet picker
 ├──────────────────────────┤
 │ [Count] [Conduit] [⋯]    │  tools: the armed one + overflow menu
 ├──────────────────────────┤
 │                          │
 │        the drawing       │  gets everything else
 │                          │
 ├──────────────────────────┤
 │ Sheets │ Counts 9 │ Bid  │  drawer bar, inside the Plans screen
 └──────────────────────────┘
```

- **Below `md`, both side panels are drawers**, opened from a bar at the
  bottom of the drawing, **one at a time**. Opening Counts closes Sheets. The
  drawer covers the bottom ~70% of the drawing (a sheet, not a full-screen
  page), so you can still see where you are on the plan.
- **"Bid" in that bar is the pinned totals block on its own.** It's the
  thing people will want most often on a phone, and it shouldn't sit at the
  bottom of a scrolling drawer.
- **Above `md`, nothing changes.** The drawers are the same components
  (`LayersPanel`, `TakeoffSummaryPanel`, `SheetIndex` …) rendered into a
  different container. One component, two containers (CLAUDE.md § "Copying a
  layout does not copy the behaviour"). A second, phone-only copy of the
  counts panel is ruled out.
- **The app's own bottom nav hides on the Plans screen at phone width.** Two
  bars along the bottom is one too many. The back arrow goes to the bid.
- **No slide animation.** A drawer is a full-height panel that clips, so a
  `translateY` keyframe can freeze half-open in a background tab (CLAUDE.md
  § Responsiveness rule 4: this already happened once with `tab-enter`).
  Fade, or appear. That can be revisited only by measuring a throttled tab.
- **Every control in a drawer is at least 44 px tall** (takeoff-spec ground
  rule 2). Today's 18 px rails and 20 px icon buttons are mouse targets.
- **Nothing hover-only.** The sheet row's edit pencil appears on hover
  (`SheetIndex.tsx`). On a phone it has to be always visible, or reached by a
  long press with a visible alternative.

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
places nothing. A second finger arriving cancels a pending tap.

Tracing a run on a phone is taps, one per point, which already works with
"place on tap". Finishing a run needs an on-screen button, not a double-tap
(takeoff-spec already notes a Finish button exists).

### How Part B gets checked

- **The driven Chrome window here cannot be resized** (it reports success and
  stays put, `local-verification-gotchas`). So a phone check needs a real
  phone on the LAN (`pnpm dev` bound to the machine's address), or Chrome
  DevTools device mode by hand. **Saying "checked at phone width" without one
  of those is not a check.**
- On a phone: open each drawer, count something, trace a two-point run, pan
  with a tool armed and confirm **nothing was placed**, pinch, and read the
  totals.
- The leaf-element walk at 390 × 844 and 360 × 740.

---

## What could put a wrong number on a bid

1. **A pan that places a mark or a point** (guard 3). That's why touch can't
   ship before the guard.
2. **A drawer covering the thing you are counting**, so a tap meant for the
   drawing lands on a drawer row. Mitigation: a tap outside an open drawer
   only closes it, and does nothing else.
3. **Totals read from a drawer that is stale.** The Bid view is the same
   query the panel uses, so it goes through the same refresh helper (CLAUDE.md
   § "A test that calls the server cannot see a screen showing yesterday's
   answer"). Look, mark, look again, on the phone.

---

## Questions for you

1. **Order: readability first on the laptop, then the phone drawers?** That's
   my recommendation, because the drawers should be built around the finished
   panel. The other way gets the phone working sooner, but means checking the
   panel twice.
2. **Warnings in a new amber, with yellow kept for "selected"?** Today they're
   the same yellow. I'd separate them. It touches about a hundred places, so I
   want a yes before starting.
3. **Fold the "Not on the bid yet" list by reason** ("Traced, not sent yet —
   9", one line, open to see them)? It's the biggest single cut to scrolling.
   The catch: you'd see the reason, not each item, until you open it.
4. **On a phone, is the job "check and count", or everything?** Counting and
   reading totals on a phone is a clear win. Tracing long runs with a finger
   is possible, but slow and fiddly. If phones are for checking and quick
   counts, I'd make tracing work without polishing it. If you expect whole
   takeoffs on a phone, tracing needs more (a magnifier under the finger, for
   one).
5. **Tablets: phone layout or laptop layout?** A tablet held upright is
   about 768–820 px, right on the line. I'd give it the laptop layout with
   bigger touch targets, and the drawers only below 768. Tell me if your
   crews use tablets on site, because that changes which side of the line
   matters.
6. **The counts panel header says "Counted items 9" on one sheet and "0" on
   another, while the list under it covers the whole bid.** Is the number
   meant to be this sheet's count? If so it should say so ("9 on this
   sheet"). I'll fix the wording in Part A unless you say otherwise.
