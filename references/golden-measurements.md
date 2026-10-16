# Golden measurements (Track C, 2026-10-15 night)

**The owner's brief:** test drawings with known true lengths that every
change must reproduce within a tiny tolerance, or the Gate fails.

**Where:** `server/goldenMeasurements.test.ts`. It is an ordinary server test, so
the Gate's full vitest run includes it on every push. It needs no binary
fixture: each drawing is a PDF built in the test, like
`e2e/smoke/fixturePlan.ts`.

## What one case does

1. pdf.js opens the PDF and reads its text. This is the same library the
   viewer uses, with the same `getViewport({ scale: 1 })`, so `/Rotate` and
   `/UserUnit` are applied the way the screen applies them.
2. The server's `bidPdfs.detectSheetScale` reads the scale from that text.
   `setSheetScale` then applies the offer, as the one-tap accept does. On a
   scan, a person types the scale instead.
3. Each corner is clicked at zooms 0.19 / 0.5 / 1 / 2.5 / 6, at pixel
   density 1 and 2, by mouse (whole device pixels) and by touch (fractions).
   The click is converted the way `TraceLayer.clientToPage` converts it
   (around the shared `screenToPagePoints`).
4. `takeoffRuns.save` measures the run again on the server. The stored
   `lengthInches` and the billable feet are then compared with the truth.

## The drawings (13 measured, 2 refusals)

| Case               | Scale         | Paper               | Run                                                                        |
| ------------------ | ------------- | ------------------- | -------------------------------------------------------------------------- |
| straight           | 1/8" = 1'-0"  | ARCH D 36×24        | 100 ft                                                                     |
| L-shape            | 3/16" = 1'-0" | ANSI D 34×22        | 30 + 40 ft                                                                 |
| multi-point zigzag | 1/4" = 1'-0"  | ARCH D              | four 3-4-5 legs = 60 ft                                                    |
| SHORT              | 1/4" = 1'-0"  | ARCH D              | 6 in                                                                       |
| LONG perimeter     | 1/8" = 1'-0"  | ARCH E1 42×30       | 320 ft                                                                     |
| engineering        | 1" = 20'      | ARCH D              | 300 ft                                                                     |
| metric             | 1:100         | A1 841×594 mm       | 25 m                                                                       |
| rotated 90°        | 1/4" = 1'-0"  | ARCH D              | L, 60 ft                                                                   |
| rotated 180°       | 1/4" = 1'-0"  | ARCH D              | diagonal                                                                   |
| rotated 270°       | 1/8" = 1'-0"  | ARCH D              | zigzag                                                                     |
| reduced print      | 1/4" printed  | 11×17               | 40 ft at the PRINTED scale (sheetSize warns; the arithmetic never guesses) |
| UserUnit 2         | 1/4" = 1'-0"  | ARCH D at half size | 60 ft                                                                      |
| scan               | typed 1/4"    | ARCH D, image only  | L, 65 ft                                                                   |
| not to scale       | "SCALE: NTS"  | —                   | says NTS, offers no scale                                                  |
| no scale set       | —             | —                   | stores NO length (never a guess)                                           |

## Tolerance — 0.01 real inch, and billable feet EXACTLY

- **Noise is far below it.** Floating point error is about 1e-9 in. The
  column keeps 4 decimals (±0.00005 in).
- **Every fault worth catching is far above it.** A scale 0.5 % off moves
  the SHORTEST case (6 in) by 0.03 in. A wrong rotation, or a pixel density
  not divided out, moves a run by inches or feet.
- **It is 1/1200 of the foot an estimator buys**, so nothing this tolerance
  lets through can reach a bid.
- **The billable feet must match exactly**, because that is the number on
  the bid.

Mouse clicks also get the pixel slack a real pointer has: half a reportable
step per corner, per axis. That error comes from the screen, not from the
arithmetic, and the bound is computed in the test.

**Proven red:** with `pointsToRealInches` multiplied by 1.005, 26 of 28
cases fail. The 2 that stay green are the no-scale ones, which have no
length to get wrong.

## On screen — mouse vs touch (the part vitest cannot reach)

Run by hand, on the production build:
`scratchpad goldenscreen.mjs <rotation>`. It uses a 1/4" sheet with a
24 + 16 = 40 ft L, attached to a local bid. Each run was traced with the
real toolbar ("Trace conduit", corners, Finish), by a mouse at density 1 and
a finger at density 2, at fit and after three "Zoom in"s.

| Page | mouse, fit | mouse, zoomed | touch, fit | touch, zoomed |
| ---- | ---------- | ------------- | ---------- | ------------- |
| 0°   | 40 ft      | 40 ft         | 40 ft      | 40 ft         |
| 90°  | 40 ft      | 40 ft         | 40 ft      | 40 ft         |
| 270° | 40 ft      | 40 ft         | 40 ft      | 40 ft         |

Each run measured 40.0000 ft from its own stored points, with the toast
reading "40 ft flat". Screenshots:
`references/overnight-shots/golden-screen-rot{0,90,270}-{mouse,touch}-z{0,3}.png`.
Every result was exactly 40.0000, which suggests the clicks met the drawn
line's ends exactly. So this checks the frame (rotation, zoom, density,
mouse vs touch) end to end, not pixel rounding. The vitest cases cover the
rounding.

**Verdict: the app measures right in every case.** Nothing was parked at
the top of `pricing/morning-questions.md`.

## Not covered, and why

- **A CropBox offset from the MediaBox.** pdf.js's viewport handles it.
  Add a case if a real sheet ever shows one misbehaving.
- **The touch router itself (pinch, pan).** It lives in a component, so it
  is covered by the on-screen run above, not by vitest.
