# Overnight run 2026-10-14 → 15 — parked items, with sketches

Things from the owner's queue that were NOT built tonight, why, and what to
build. Each has a line in `pricing/morning-questions.md` under "From the
overnight build work".

## P1. Slimmer Plans toolbar (5e) — parked: shared with Track B, needs a pick

**Measured on the laptop shot (1536 x 864, Bar layout check, E0.01):** the
Plans screen spends **150 px** above the drawing — header 75 px (title + the
new step bar), tool row 36 px, scale/zoom row 36 px, borders. The second row
holds the scale ("3/16" = 1'-0" · not checked · Check it · scan, can't check
by code"), Ceilings, the drop-heights warning, and zoom − % + Fit Focus.

**Sketch — one tool row on a laptop, the status moved to the panel:**

```
← Bid  Plans — Bar layout check   ✓Plans › ✓Scale › •Count …   [Materials list] [Export] [+ Add PDF]
‹ E0.01 1/5 › ⋯ | Count  Check sheet | ─ Conduit▾  ┄ Cable▾ | ↶ ↷ 🗑 |  3/16"=1'-0" ✓  − 19% + Fit Focus
```

- The scale chip keeps one short form ("3/16" = 1'-0"" + a state dot); the
  long "not checked · scan, can't check by code" moves into its popover.
- Ceilings and "Drop heights not set — drops not counted" move to the top of
  the right panel's "This sheet" line, where the counts are (a warning about
  what is counted belongs beside the count).
- "Copy text" (Track B's) moves into the ⋯ menu.

Saves one 36 px row on every laptop visit. Not built because two of the
moves are Track B's controls and the warning's placement is a judgement
call (it is the "drops not counted" warning — a number warning, which must
not get quieter). **Owner: yes / no / a different split?**

## P2. Finger pan vs drop-a-point (5e) — already WORKS; only the telling is missing

Built and measured earlier (`@/lib/touchGesture`, device-audit § Touch): a
**tap** places, a **drag** pans, **two fingers** pinch; mouse and pen are not
touched (desktop right-drag / Space-drag pan and left-click point keep
working). What a new tablet user lacks is being TOLD. Suggestion: one line in
Track B's first-open tips (plan-reading help step 4) on a touch device —
"Tap to drop a point · drag to move the sheet · pinch to zoom". Left to B
because the tips are B's component.

## P3. Demo / New work / Both sheet tag (5e) — already BUILT by Track B

The sheet "⋯" menu → "More options — this sheet shows": Not said / New work
/ Demo / **Demo and new** (`shared/sheetWorkTag.ts`). The owner's list says
"Both". Not renamed: it is B's label and "Demo and new" also shows in
banners where "Both" alone would not say both of what. **Owner: keep "Demo
and new", or "Both"?**
