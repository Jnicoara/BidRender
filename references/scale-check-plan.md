# Check a scale against a printed dimension — plan (Track B, 2026-10-16) — BUILT the same night

Owner, 2026-10-15: _"measure a printed dimension to check your scale" — tap
two ends of a printed dimension, type what it says, and the app warns if the
sheet scale is off by more than a small amount and offers to fix it. Plan in
references/, then build. It must never change a scale on its own._

## 0. What already exists (read before this)

- **The check itself is built** — `shared/planCalibration.ts`
  `checkCalibration` (2026-09-21) and `CalibrateLayer.tsx`'s check card:
  "Check it" on the scale chip → tap two ends → "Should be" → a verdict. It
  agrees within **2%** (`CHECK_TOLERANCE_PERCENT`), names a misread factor
  (1.5× scale-bar lead-in, 2×, 3×, 4×, 12× feet-for-inches), and never
  changes the scale. "Keep" records `scaleCheckedAt` only when a check was
  made.
- **The gap**: when it disagrees, the only way out is "Set it again" —
  measure a dimension AGAIN, from scratch, to set the scale. The dimension
  the estimator just measured already says what the scale is.
- The offer elsewhere ("Scale may be wrong: … Use it", door swings) is the
  same shape — a suggestion, applied only by a tap. Owner Q19 (2026-10-12):
  a scale is never applied by looking.

## 1. What gets built

1. `scaleFromCheck(currentRatio, check)` in `shared/planCalibration.ts`:
   the ratio the dimension implies — `currentRatio × expected ÷ measured` —
   named by the existing `describeScale` (a standard scale when within
   0.5%, else `1" = X`). Null when the check agrees or cannot be read.
2. In the check card, when the check DISAGREES: a button
   **"Use 1/8" = 1'-0" — what this dimension says"** beside Keep / Set it
   again. One tap sets it through the same `onApply` as setting a scale
   (so it flashes, can be undone, and is refused on a locked bid like any
   other scale change), then the card checks it against the same dimension
   — which now agrees.
3. Nothing else changes: no automatic apply, no new threshold (2% stays),
   no new column.

## 2. Decisions taken (B)

- **Snap to a standard only within 0.5%**, as `describeScale` already does:
  a sheet printed 3% small should be set to what it really measures, not
  to the name on the title block — that is the whole point of checking.
- **The offer leads with the scale, not the percent**: "Use 1/8" = 1'-0"",
  with the diagnosis (factor) staying in the verdict line above it.

No owner questions: nothing here moves a number without a tap.

## 3. As built (2026-10-16)

- `scaleFromCheck` saves the EXACT ratio (`1:N`, as calibration does) and
  shows it by name (`describeScale`): `describeScale`'s `1" = 4'-1"` form
  rounds to the inch, about 1% off — the error a check exists to remove.
- Found while testing on a phone: "Check it" (shown there only while
  tracing) left Trace armed, so the two taps drew a run. Starting a check now
  puts the trace tool down, or asks to finish a run already in progress.
  The check bar's buttons also overlapped at 390 px — fixed.
- `server/planCalibration.test.ts` (3 cases), `e2e/smoke/plans.spec.ts`
  "scale check" at four sizes; both fixes proved by breaking them.
