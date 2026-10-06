# Track B: panning at every zoom

> **BUILT 2026-09-29 on `track-b`, except touch and phone** (moved to their
> own piece, `todo.md` "Before beta"). Three commits: the guards (§ 3, guards
> 1, 2, 4 and 5; `client/src/lib/dragThreshold.ts`), the slack at Fit (§ 2,
> `FIT_SLACK_FRACTION` 0.15), and the trackpad (§ 6,
> `client/src/lib/wheelIntent.ts`). Each was measured on screen; the numbers
> are in the commit messages. Still to measure: whether 15% feels like "a
> little", and whether the wheel rule tells YOUR mouse from YOUR trackpad.

**Planned 2026-09-29 on `track-b`.** Owner's brief: pan at
every zoom, pinch to zoom, two-finger scroll pans, and a pan never selects or
edits anything. It follows `references/track-b-deletes-summary-pan-plan.md` § 6,
which read the code; this adds the measurement that section asked for.

**No migration.** All of it is in `client/src/lib/planView.ts`, the viewer's
pointer and wheel handlers in `TakeoffPage.tsx`, and the overlays.

## Decisions this overrides — both files get a line when it is built

| Earlier decision                                                                                                                                          | What this plan does                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-viewer-overhaul.md` § "decide per VIEW, not per axis" (~line 2146): "If the whole sheet fits, centre both — that behaviour is deliberate and stays" | **Overridden by the owner, 2026-09-29.** A sheet that fits can be moved a little. The per-VIEW rule (one decision for both axes) is kept. |
| `planView.ts` `clampView` header: "a sheet small enough to see whole is not one anybody is repositioning"                                                 | Replaced by a measured slack (§ 2).                                                                                                       |
| Wheel always zooms about the pointer (`TakeoffPage.tsx` ~923)                                                                                             | Two-finger scroll pans; pinch (wheel with `ctrlKey`) zooms. The mouse wheel is Question 1.                                                |

## 1. Measured on screen, 2026-09-29

On the local app, sheet 2 of the Old Blueridge school set (a 36×24 drawing), at
**Fit**, in a 1536 px wide window:

| What                                                               | Measured                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Plan pane                                                          | 796 × 633 px                                                     |
| Sheet at Fit                                                       | 748 × 499 px, zoom 0.1924, offset (24, 67)                       |
| An 80 × 60 px plain drag on empty sheet                            | **Nothing moved** — the transform was identical before and after |
| A two-finger-scroll wheel event (deltaX 30, deltaY 40, no ctrlKey) | **Zoomed out** 0.1924 → 0.1776 and re-centred; nothing panned    |
| `touch-action` on the pane                                         | `auto` — the phone browser owns finger drags                     |

**Why it is stuck:** `clampView` returns the centred position whenever the
whole sheet fits (`planView.ts` ~164), throwing the pan away, and Fit is in
that state by definition. Everything from Fit down to `MIN_ZOOM` is stuck.

**Why the obvious fix is too loose:** the rule used when zoomed in keeps only a
quarter of the pane covered (`MIN_VISIBLE_FRACTION` 0.25). At Fit that allows x
from −549 to +597 px — the sheet could be pushed about 570 px sideways, most of
it off screen. That is not "a little".

## 2. The fix

**Two regimes, one decision for both axes (as now), and the join is no worse
than today's:**

- **The whole sheet fits → it may move up to `FIT_SLACK_FRACTION` of the pane
  from centre, per axis.** Proposed 0.15: at the measured pane, ±119 px sideways
  and ±95 px up and down. Enough to move a detail out from under a panel or the
  cursor, never enough to lose the sheet.
- **Any part is off screen → the existing overlap rule, unchanged.**
- **The join.** Zooming OUT from a view panned far across the boundary clamps
  it into the slack. Today the same gesture snaps it all the way to centre, so
  the jump gets smaller, not bigger. Zooming IN never jumps, because every
  slack position is inside the overlap range.
- **Fit and the `0` key still centre exactly.** They are the way home.
- **Zoom about the pointer now keeps its anchor** below Fit, within the slack.
  Today it cannot, because the result is re-centred.

**Measure again after building, not before deciding:** is 15% "a little" on a
laptop and on a phone? A number chosen here is a guess until someone has
dragged it.

## 3. What moves and what never does

| Gesture                                       | Today                                                                                                                   | After                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Drag on empty sheet (mouse, pen)              | Pans only when zoomed in                                                                                                | Pans at every zoom, after a 4 px threshold                                                                          |
| Drag starting on a point, mark, run, box edge | Points: edits and never pans (`stopPropagation`). **Marks and run bodies: pan, then the click on release SELECTS them** | Edits the item it started on; a mark or run body is not draggable, so a drag there is a pan and **selects nothing** |
| Two-finger trackpad scroll                    | Zooms                                                                                                                   | **Pans** by (deltaX, deltaY)                                                                                        |
| Pinch on trackpad (wheel + ctrlKey)           | Zooms (by accident; ctrlKey unread)                                                                                     | Zooms about the pointer, deliberately                                                                               |
| Mouse wheel                                   | Zooms                                                                                                                   | **Question 1**                                                                                                      |
| Phone: one finger                             | Browser scrolls the page                                                                                                | Pans (on empty sheet), with `touch-action: none` on the pane                                                        |
| Phone: two fingers                            | Browser zooms the page                                                                                                  | Pinch-zooms the sheet about the midpoint                                                                            |
| Right / middle / Space-drag                   | Pans (capture phase)                                                                                                    | Unchanged                                                                                                           |

**Guards, each one code rather than a comment** (CLAUDE.md § a comment
claiming that something else handles it):

1. **A pan never selects.** After a drag that passed the 4 px threshold,
   swallow the `click` that follows (one capture-phase listener, armed on
   pan-start and dropped after the next click or 300 ms). Test: a mark under
   a drag start is not in the selection afterwards.
2. **Calibrating stops the event.** `CalibrateLayer.tsx` ~931 places its
   point on pointerdown and lets the event bubble on to the pan. Harmless
   today only because the sheet is stuck at Fit; with slack, the sheet would
   slide between the two calibration clicks. Add `stopPropagation`, like the
   trace overlay already has.
3. **On TOUCH, points and marks are placed on a TAP, not on pointerdown.**
   A finger that lands to pan is a pointerdown, so with a tool armed it would
   place a point or a mark where the pan began. On mouse and pen, placement
   stays on pointerdown, which is what makes it precise. Test in
   `client/src/lib`: a touch sequence that moves more than the threshold places
   nothing.
4. **Panning never moves a mark or changes a measurement or a scale.** This is
   true by construction, because the pan is a CSS transform and page
   coordinates come from `getBoundingClientRect` at the event. Pinned by a
   `planView.test.ts` case: the page point under the pointer maps back to the
   same page coordinate before and after a pan, at five zooms.
5. **Vertex jitter.** A press on a point handle commits a move on ANY pointer
   movement (`TraceLayer.tsx` ~609). Apply the same 4 px threshold so a click
   on a handle is never an edit.

## 4. Tests

- Rewrite the three `planView.test.ts` cases that assert centring below Fit:
  "centres a drawing smaller than the viewport and ignores the pan", "treats
  zoomed-out-below-viewport as small", and "centres both axes again the moment
  the whole sheet fits". Replace them with slack assertions.
- **Fixtures not shaped like the viewport** (CLAUDE.md § a test fixture shaped
  like its container): 2000×600 and 600×2000 in the 800×600 pane, plus the
  measured 748×499-in-796×633. At Fit on each:
  - a (+40, +40) drag moves both axes by exactly 40;
  - a hard shove stops at the slack on both axes;
  - `fitView` centres;
  - zooming out across the boundary never moves the view further from centre
    than today does.
- The five guards in § 3, each with the test named there.

## 5. What could put a wrong number on a bid

Ranked:

1. **A touch pan that places a point or a mark** where the finger landed,
   while a tool is armed. It would be a real new risk the moment one-finger
   pan exists on a phone. Guard 3 is required and ships in the same change.
2. **A pan that selects, followed by Delete** — removing a count's marks or a
   run nobody picked. This exists today (a drag from a mark selects it), and
   slack makes drags at low zoom far more common. Guard 1.
3. **Calibration against a sliding sheet.** Each point is still read
   correctly, but the user aims at a moving target, and the scale multiplies
   every run on the sheet. Guard 2.
4. **A click on a vertex handle recorded as a tiny move.** A run's length and
   bends change by a hair with nothing to show for it. Guard 5.
5. **Not a risk: a pan shifting a clicked point.** Points are read from the
   live transform at the press; there is no momentum and no animation. Guard 4
   pins it.

## Owner's answers, 2026-09-29 — what is being built

1. **The mouse wheel stays ZOOM**, like Bluebeam. Panning is click-drag on
   empty sheet, plus the two-finger trackpad **if it can be done safely**.
   So the trackpad pans only when a wheel event is recognisably a
   trackpad's (§ 6); anything that looks like a mouse notch zooms, as today.
2. **Slack: build it at 15%, then measure it.**
3. **Touch and phone move to their own piece**, with the drawer layout
   (`todo.md`, "Before beta: the Plans screen at phone width"). Guard 3 goes
   with it.
4. **"If drag-to-pan clashes with the drawing tools, say so before building."**
   It does not, because armed tools are unchanged. With Count or a trace
   armed, a left press still places at once, on pointerdown, as today; pan
   then with right-drag, middle-drag, Space+drag or the trackpad. With no
   tool armed, a left drag on empty sheet pans. Changing armed tools to
   "place on release" WOULD clash, and is not being done.

## 6. Two-finger trackpad pan, safely

A wheel event does not say where it came from. What is recognisable:

- **ctrlKey**: a trackpad PINCH (and Ctrl+wheel on a mouse). Zoom, as today.
- **Sideways movement** (`deltaX` not 0): a trackpad. A mouse wheel has none.
- **Fractional or small steps in pixel mode**: a trackpad. A mouse notch
  arrives as a whole number, usually 100 or 120 px in pixel mode, or as lines
  (`deltaMode` 1).

A gesture is a stream of events, so the decision is made ONCE per gesture, at
the first event, and held until the wheel has been quiet for 150 ms. That way
a trackpad scroll does not flip to zooming halfway through.

**Why this is safe for the numbers:** a pan is a CSS transform. It cannot move
a mark, change a length or change a scale, and a click during a scroll is still
read from the live transform. Misreading a trackpad as a mouse zooms, which is
the behaviour today. Misreading a smooth-scrolling mouse as a trackpad pans,
which is annoying but moves nothing. **Measure it on your own mouse and
trackpad after it ships.** The rule is `client/src/lib/wheelIntent.ts`, and
its tests say what it assumes.

## 7. Stub review on production — steps for Track A (read-only)

Owner, 2026-09-29: **Track A runs this, not Track B.** It reads and writes
nothing. It lists traced runs whose end may be a slipped double-click that
bought an elbow (`stubsToReview` in `shared/runBends.ts`), and prints how long
those end segments are, so that `STUB_REVIEW_POINTS` (40, reasoned but not
measured) can be set from real data.

1. **Get a checkout that has `scripts/stubReview.mts`** (on `track-b` from
   2026-09-29). Either merge first, or run
   `git worktree add ../stub-check origin/track-b` and work there.
   `node_modules` must be installed.
2. **Confirm `.env.production.local` holds both `DATABASE_URL` and
   `DATABASE_CA_CERT`.** The script connects through
   `server/databaseConnection.ts`, as the app does, so the DigitalOcean URL
   uses TLS.
3. **From the repo root, run:**

   ```bash
   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/stubReview.mts > stub-review-prod.txt
   ```

   Only `DOTENV_CONFIG_PATH` changes which file is read. **It needs no
   `ALLOW_REMOTE_DATABASE`,** because it only SELECTs. If a version of it ever
   asks for that word, stop: it is not the read-only script described here.

4. **Check the first line.** It must read
   `Database: bidrender-db-do-user-44374734-0.a.db.ondigitalocean.com:25060/bidrender`.
   If it names `127.0.0.1` or anything else, the wrong file was read: stop,
   and do not report the numbers.
5. **Check the rest of the output.** Expect `Runs checked: N`, where N is the
   number of non-suggestion runs in production. Then a histogram of turning
   end segments by length, then a list headed `To review`. If the counts look
   wrong (for example 0 runs checked on a database known to have runs), stop
   and find out why before reporting. A mismatch means either this step is
   stale or the database is not the one you think.
6. **Hand back `stub-review-prod.txt`.** It holds bid and run names, which are
   customer data, so share it the way bid data is shared, never anywhere
   public. Track B sets `STUB_REVIEW_POINTS` from the histogram. The owner
   reviews the listed runs on the Plans screen, where each shows "Check this
   elbow" with a Show button.
7. **Delete `stub-review-prod.txt`** once it has been handed over.
