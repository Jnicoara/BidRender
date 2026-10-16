# Plans screen — test map (Track B, started 2026-10-15 night)

Owner, 2026-10-15: _every tool on the Plans screen … a test that fails if it
breaks (prove it by breaking it once), at laptop, iPad both ways and phone
390, mouse AND finger._

**Where the tests live.** `e2e/smoke/plans.spec.ts` — a Playwright smoke
spec, so it runs with `pnpm smoke` locally AND in the Gate's smoke job after
every local-dev deploy to staging (`.github/workflows/gate.yml`). Projects:
`desktop` 1440×900 (mouse), `tablet-portrait` 820×1180, `tablet-landscape`
1180×820 and `phone` 390×844 (finger: `hasTouch`, taps). Its plan is its own
generated PDF (`e2e/smoke/deepPlan.ts`) with the text each tool reads, so
nothing depends on a real drawing or on AI (`DISABLE_AI_FEATURES` locally).

**"Proved by breaking it."** Each row names the one-line break that turned
its test red, run once and then removed. A test that has never failed has
not been shown to test anything.

**If a count here does not match what you see** — a row says "4 sizes" and
the run shows 3 — stop and find out why before trusting either: the map is
stale or the run skipped something, and those want opposite fixes.

Sizes: **L** laptop 1440 (mouse) · **P** iPad upright 820×1180 · **S** iPad
sideways 1180×820 · **Ph** phone 390 (P, S, Ph by finger). Every row ran
green at all four on 2026-10-16 (`pnpm smoke`: 156 passed, 6 skipped — the
three phone skips below, at the two specs' own counts — 8.3 min locally).
"Red at" lists the projects the break was run on; each failed at its own
test and nothing earlier.

| # | Tool | What the test does (reads the server where it can) | Sizes | Broken by (one line, then restored) | Red at |
| --- | --- | --- | --- | --- | --- |
| 1 | Sheet switching | 3 sheets numbered from title blocks; Next / Previous reach page 2 and back | L P S Ph | Next sheet's `onClick` does nothing (`SheetChip.tsx`) | L |
| 2 | Scale — offer | printed scale is OFFERED, not applied (server has none); "Use 1/4"…" sets it | L P S Ph | the offer button does nothing (`ScaleControl.tsx`) | L, P |
| 3 | Count | type a name, Enter, three marks; server holds 3 within 2 pt of the symbols | L P S Ph | server stores x + 10 pt (`takeoffStampsRouter.drop`) | L, Ph |
| 4 | Undo / redo | place, Undo button, Redo (button; phone: Tools menu) | L P S Ph | Redo button / Redo menu item does nothing | L (button), Ph (menu) |
| 5 | Select + delete | select two (Shift-click; finger: Select / "Select several"), Delete, Undo restores the same positions | L P S Ph | the pill's Delete does nothing (`TraceLayer.tsx`) | L, P, Ph |
| 6 | Just count | two marks into Unassigned; "Pick what they are" by name; proposal's `unassignedMarks` 0 | L P S Ph | the move after picking is skipped (`assignUnassigned`) | L |
| 7 | Drops | "Add a drop to each one", pick a type; saved on the count | L P S Ph | the drop picker's `onChange` does nothing (`GroupDrop.tsx`) | L |
| 8 | Trace | Trace, two points, Finish: 61.1 ft (1100 pt at 1/4") | L P S Ph | Finish cancels instead (`TraceLayer.tsx`) | L, Ph |
| 9 | Layers | None hides marks ("N hidden", warning), All shows them | L P S Ph | None does nothing (`LayersPanel.tsx`) | L |
| 10 | Detail link + Back | tap "2/E-202", Go to detail → page 2; Back → page 1 | L P S Ph | "Go to detail" does nothing (`SheetNotes.tsx`) | L, P |
| 11 | Note tag | tap the boxed "1": dialog shows note 1's text | L P S Ph | the note dialog loses its text | L, P |
| 12 | Look up / symbol guide | "WP" → Usually means, weatherproof; "duplex" → What it looks like | L P S Ph | abbreviation results emptied (`PlanLookUp.tsx`) | L |
| 13 | Homeruns | toggle shows the arrow tagged A-1,3 | L P S (not on a phone, by design) | toggle does nothing (`HomerunsView.tsx`) | L |
| 14 | Heights | set the job's run height 10 ft → chip "Runs at 10…" | L P S (chip not on a phone) | the save does nothing (`JobHeightsChip.tsx`) | L |
| 15 | Scale may be wrong | 1/8" against a 1/4" title and 36" doors → "Scale may be wrong", Use it → 1/4" | L P S (chip only while tracing on a phone) | Use it does nothing (`ScaleControl.tsx`) | L |
| 16 | Sheet cards | each page's card shows E-201 / E-202 / E-001 | L P S Ph | the card's number is blanked (`SheetIndex.tsx`) | L |

**Not covered here, and why.** AI tools (Reader, ask-AI) are off locally
and never run in a test — they spend money. "Find all matching" and Check
sheet are Track A's counting deep test (`references/feature-test-map.md`).
Ceilings / height areas, Circuits and Copy text are laptop-only extras with
unit tests underneath but no screen test yet. Marks surviving zoom, reload,
offline, a second person: `references/plans-test-map.md` § "Marks never
move or vanish" (item 3, next).

## Before this (what already covered the Plans screen)

- `e2e/smoke/flow.spec.ts` (desktop, mouse): 14 steps — upload, scale read
  off the sheet, legend capture and rename, count, link, send, sheet switch,
  Again, refresh keeps sheet + zoom, undo/redo/delete, trace measure +
  delete, clear sheet, locked bid, proposal.
- `e2e/smoke/touch.spec.ts` (iPads): count, link, send by touch.
- `e2e/smoke/screens.spec.ts`: nothing cut off, no sideways scroll, every
  size.
- `pnpm device:touch` (local only, not in the Gate): taps, drags, pinch,
  undo, select, delete, box-capture, trace by taps, at five touch sizes.
- ~144 `client/src/lib` unit files cover the logic underneath (view maths,
  gestures, undo stack, scale check, detail refs, keyed notes, homerun
  text…), but none of them can see a screen.

## Marks never move or vanish — `e2e/smoke/marks.spec.ts` (item 3, 2026-10-16)

Marks on two sheets and a three-point run, then each step below. After
EVERY step the check is the same (`holdsExactly`): the server's marks on
both sheets and the run's points equal what was placed — not one more, not
one fewer — and every mark drawn on the open sheet sits on its saved point
(its centre read back through the drawing's own position on screen, within
1 pt plus half a pixel). Laptop (mouse), iPad both ways and phone (finger):
41 passed, 3.4 min locally.

| Step | Broken by (red) |
| --- | --- |
| placed (mouse clicks / finger taps) | marks drawn 40 px right of their point (`TraceLayer.tsx` transform) — red at the first check |
| zoom in and out (wheel / two-finger spread) | the same break; zoom also asserts the drawing grew |
| turn the device (portrait ⇄ landscape) | — (same check) |
| switch sheets and back | — |
| reload | — |
| offline, then online: placed offline, saved once | — |
| a LOST ANSWER (saved, reply never came) | the send without keys — red here |
| undo and redo | — |
| RELOAD while a batch is in flight | recovery without keys — red here. **This was a live fault**, found by the next row on its first run: the mark was on the bid twice. Fixed in `9f13e976` (`markKeys.recoveredKeys`). |
| a second session edits the same sheet at the same time | — (adds one, deletes one of ours, we add one; all three right after a reload) |
