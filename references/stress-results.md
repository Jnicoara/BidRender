# Stress results — overnight run #2 (2026-10-14 → 15)

**Status: data built, NOT yet timed** (the run stopped at the usage limit).

- `scripts/stressSeed.mts` built, on `bidrender_local_c` in 66 s, through the
  app's own routes: **Stress Co** (stress-c@example.com, local only) with
  150 bids, 3 of them 60-sheet sets with 2,500 marks / 20 counts / 40 runs
  each, the rest 6-sheet sets with 30–60 marks; plus 10 more companies
  (stress-c1…c10) with 10 bids each. `--drop` removes all of it.
- Next: `pnpm tsx scripts/stressTime.mts` (API p50/p95 alone, then 11
  companies at once for 30 s) and `pnpm tsx scripts/stressScreens.mts`
  (time to real content per screen, laptop and `--size=phone`). Both need
  `pnpm dev`. Anything over 2 s gets found and fixed.
- Failure drills: `scripts/dbFaultProxy.mts` (pass / slow / hang / down
  between ONE dev server and MySQL — never stop MySQL itself).
