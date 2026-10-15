# Track B — morning questions, 2026-10-15

Things the overnight run did NOT decide, because they touch something shared,
money, or can't be undone. Each has a suggested answer after the dash.

## Q1. The Gate's MySQL image keeps being refused — change where it comes from?

`.github/workflows/gate.yml` pulls `public.ecr.aws/docker/library/mysql:8.0`
for the `test` job (moved off Docker Hub on 2026-10-09 for the same reason).
Tonight that pull failed with "toomanyrequests: Data limit exceeded" four
times (runs 38669536985, 38682319349, 38684208140 and one more), failing the
Gate in under a minute with no test run. A re-run got through each time.

The workflow is shared by every track and gates the staging deploy, so B did
not change it. Options:

1. Pull from GitHub's own registry (`ghcr.io`), which GitHub runners reach
   without the shared-IP limit — needs a copy of the image pushed there once.
2. Keep ECR but retry the pull in a step before the job's service starts
   (a service container can't retry; a `docker run` step can).
3. Leave it; re-run by hand when it happens.

— **Suggested: 1** (A's call — it is the Gate). Until then, "Gate red in
under a minute" means "look at the log before believing it".

## Q2. The first starter edit to an item gets slower as shops are added — fine for now?

Measured tonight (`stress-results-b.md` round 1): an admin's FIRST edit to a
starter item pins every shop that has no copy of it, about 3.3 ms per shop.
That is 0.2 s today, 6.7 s at 2,000 shops, about 30 s at 10,000. Later edits
to the same item are 10–18 ms at any size (fixed tonight; they were growing
too), and the preview is 27 ms.

— **Suggested: leave it** until there are a few thousand shops. A faster
pin means writing each table's copy rules a second time in SQL, and two
copies of those rules disagreeing is the money bug `shared/forkedRows.ts`
was written about. Not a number on anyone's bid either way.

## Q3. OPEN — touch "Select + two taps picks two" fails on iPad portrait and phone

`pnpm device:touch` (2026-10-15, production build, fresh bid 1728472): every
tap / drag / pinch / two-finger / undo check passes at all four sizes, but
"Select + two taps picks two" fails (no pill / 1 selected) on tablet-portrait
and phone, and the next step times out. NOT yet known whether the overnight
MarkLayer change (2dfc2a48, marks in a memoized layer) caused it — a mouse
click and Shift-click still select correctly (checked). The comparison run
with the old TraceLayer was cut off by the usage limit. **Next step: rebuild
with `git show 07a96f74:client/src/components/takeoff/TraceLayer.tsx` in
place and run `npx tsx scripts/deviceTouch.mts --bid=1728472
--sizes=phone`.** If it passes there, revert 2dfc2a48's TraceLayer half.
