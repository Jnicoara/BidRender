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

**Update, third night: fixed, without a second copy of the rules** (you
asked). Every fork now copies for many shops at once, and the one-shop fork
is the same code with one shop. At 2,006 shops: material 6.2 s → 0.46 s,
assembly 18.8 s → 1.3 s (stress-results-b.md round 9). No decision needed.

## Q3. Touch checks — mostly settled; two steps open at 375 px (no decision needed)

Followed up 2026-10-15 morning (stress-results-b.md round 6). The overnight
MarkLayer change is NOT the cause (start-of-night code fails the same way)
and stays. The touch script tapped where marks had been before the drawing
moved; fixed. One real app fault found and fixed: "Name this symbol" stayed
open across a sheet change and a Trace and covered Finish on iPads.

iPad both ways and phone 390 now pass every check, twice. Open at 375 px
only: a mark re-placed right after Undo is still pending when counted, and
a trace may end at its second point (a "Finish" click is logged right after
it; not yet known whether a finger hit the floating Finish). Next step: put
the trace pill's Finish out of the drawing's way at 375 px, or confirm it
was the script's own tap — 30-minute box spent, so written up instead.

**Update, later 2026-10-15: both fixed** (stress-results-b.md round 7). Both
were the app: a floating panel's buttons covered the short drawing at 375
px. The selection panel's extras now sit behind "More" with a finger, and
the trace panel sits at the bottom of the drawing. Every touch size passes.

## Q4. One real-finger check on your phone (2 minutes)

On your phone, open any bid with a plan set → **Plans**, go to a drawing sheet. Tap **Count**, type any name, Enter; tap the drawing once, tap **Undo**, tap once more — after a second "This sheet:" should say **1 mark**. Then **… → Trace**, tap two points apart on the drawing, then tap **Finish** — one straight run should appear between your two taps (not stop early or add a third point), and "This sheet:" should show its feet. Staging is fine for this (use a throwaway bid); just tell me which step didn't do what's described.

## Q5. "Just count, pick the item later" — three small choices (built, none blocks)

Built tonight (`references/count-first-plan.md` § 5 has them in full).
Suggested answers are what was built.

1. A count you NAMED but linked to nothing still goes to the bid and is
   priced there (level 1, your 2026-09-25 decision) — it is not
   "Unassigned". — **Keep it so.**
2. **Answered YES, built (fourth night):** the total now says it. Was: the bid total does NOT say "+ N marks unassigned"; the warning sits
   under it and the print is blocked. — **Your call** (it changes what a
   total says, so parked).
3. The Unassigned count never becomes a bid line. — **Keep it so.**

## Q6. User levels and other trades — plan only, questions inside

`references/user-levels-plan.md` asks L1–L6 (is a level a plan you sell or
a per-person mode; does Takeoff show money; names) and T1–T6 (which trade
is second; may the no-number, no-migration steps 1–3 start). Nothing built.

## Q7. Field and Co-owner roles — five choices (built on the defaults, none blocks)

Plan: `references/field-and-coowner-plan.md`. Built as suggested; each is a
small change if you say otherwise.

- **Q-F1** Can a Field worker place or move marks, or only look? —
  **Built: only look.** Saying yes means letting `plans.view` members save
  marks; their counts would then move bid quantities.
- **Q-F2** Does the Field job list show the client's name? — **Built: no**
  (name, address, status, date). Client details are their own permission.
- **Q-C1** Can the owner demote or suspend a co-owner? — **Built: yes**
  (someone must, when a co-owner leaves). Co-owners cannot act on each other
  or on the owner.
- **Q-C2** When billing exists: who pays, and can a co-owner cancel the
  subscription or close the company? — **Not built**; owner-only until you
  decide.
- **Q-C3** Ownership transfer (the owner leaves for good) — not built. Needed
  before a co-owner can take over the company's data.
