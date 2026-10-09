# Before beta — what must be true first

**A PLAN, drafted 2026-09-29 on track-c. Nothing here is built by this file.**
Pulled from `todo.md`, the plan files in `references/`, `ASSEMBLIES_PLAN.md`
and `STRATEGY_NOTES.md`, including items on branches not yet merged
(`track-b`, `a-email-reset`, `a-plans`, `a-migrations-plan`,
`a-fitting-labor`). Each line cites where it came from, so the next reader
can check it rather than trust it (CLAUDE.md § "Where decisions live").

**Read each line as: what a contractor would notice · track · size ·
migration?** Size is rough: small ≈ an afternoon, medium ≈ a day or two,
large ≈ several days. "Migration" means a new column or table. **If a line
says a migration is needed, classify each file additive or meaning-changing
before it ships** (CLAUDE.md § "Deploying a migration: THREE STEPS").

**This list goes stale the day it is written.** Before acting on a line,
open its source. If the source says it is done, or says something different,
the source wins: tick or fix the line here, don't do the work twice.

## 0. First, merge what is already built

- [ ] **Merge and deploy the finished branches in the planned order**: track-b
      (~30 commits, including several Plans-screen fixes below), track-c,
      a-fitting-labor, a-email-reset. The order is set in
      `origin/a-migrations-plan:references/migrations-0098-batch-plan.md` § 0,
      after the `90a286c` release · all · large · **yes** (0096, 0097 ride along)

Several lines below are marked **(built on track-b)**. For those, the only
work left is this merge plus looking at the screen afterwards.

## 1. Wrong numbers — anything that could put a wrong number on a bid

The whole product is the number. These come first because a wrong number
does not look broken. It gets believed, bid, and won or lost on.

### On the bid today

- [ ] **Locknuts and bushings are never counted.** Every rigid or IMC run,
      and every EMT run into a panel, comes out short those parts. The rule
      is decided and waits on the new roles · A then C · medium · **yes**
      (0099) · `todo.md` ~2010, `track-c-next-batch-plan.md` W5
- [ ] **The 8 starter assemblies carry placeholder labor hours nobody chose.**
      They need to say "Hours not set". Order matters: add the column, then
      ship the code, then clear the hours. Clearing first prices them at
      zero · A + C · medium · **yes** (0105 additive, then a meaning-changing
      UPDATE after the code) · `track-a-handoff-starter-assemblies.md` H2
- [ ] **No surface raceway in the catalog**, so contractors price Wiremold
      runs from EMT rows. Add the category, then the 500 and 700 series ·
      A then C · medium · **yes** (0098) · `track-c-retail-catalog-plan.md` R3
- [ ] **MC above a lay-in ceiling buys a strap every 6 ft instead of
      ceiling-wire clips.** Needs an "above lay-in" answer and a quick toggle
      (check takeoff-spec D3 first) · C/B · medium · maybe · `todo.md` ~2061
- [ ] **Old runs with a long double-click stub still buy an extra elbow.**
      Run the read-only stub review on production, then set
      `STUB_REVIEW_POINTS` from what it finds · A runs it, B sets it · small ·
      no · `track-b-panning-plan.md` § 7
- [x] **A drop can only be removed from a whole count, not from one mark** ·
      A then B · small · **yes** (0098 `dropExcluded` — this line said 0103) ·
      `todo.md` ~1460. **DONE 2026-10-05:** "No drop on these" on the
      selection pill (references/vertical-drops-plan.md § 8).
- [ ] **Re-applying markup to a line added before markup existed** reads
      today's recipe, and a hand-priced old line gets the company default ·
      B · medium · no · `todo.md` ~1615, `material-markup.md`
- [ ] **Possible double count when a company's own assembly already includes
      an elbow, LB or connector that the trace also counts.** By owner
      decision there is no guard until it is seen in practice. Keep it on
      the list so a beta report is recognised · unassigned · small · no ·
      `todo.md` ~1916

### What the Plans screen says about the count (built on track-b unless noted)

The first one should be the whole-set summary. Most of the rest are one
wrong colour or word each, from the track-b audit
(`track-b-deletes-summary-pan-plan.md` § 7):

- [ ] **Whole-set summary: "On the bid" against "Not on the bid yet — N",
      with the reason for each** (not sent, no type, no scale, no material,
      locked). It feeds the bid strip and the quote panel's gaps · B ·
      medium · no · same file § 2
- [ ] **"Send N to bid" previews what can't be sent and why, and refuses if
      the drawing changed in the meantime.** Track-b has started it · B ·
      medium · no · same file § 3
- [ ] **Draft runs are priced with only a faded grey badge to show it.**
      Make it amber, with a way to jump to each draft · B · small · no ·
      audit #12
- [x] **A detected scale applies itself with a quiet grey "Detected".** It
      should be amber "check it" until checked · B · small · no · audit #10. **Done 2026-10-06 (Track B).** Amber "Detected", followed by "Check it", until checked.
- [ ] **A scale kept after a check that disagreed still shows green
      "checked"** · B/A · small · **yes** (a column) · audit #11
- [x] **A typed scale the app can't read is dropped silently** and the old
      scale stays · B · small · no · audit #9. **Done 2026-10-06 (Track B).** Says so under the box, names the scale still in effect, keeps the text.
- [x] **A run end nobody answered counts no drop but says so in grey**,
      where the same state on a count is amber · B · small · no · audit #6. **Done 2026-10-06 (Track B).** Amber with a triangle.
- [x] **The From/To end choices carry over to the next run**, so a drop can
      be counted from the previous run's answer · B · small · no · audit #7. **Done 2026-10-06 (Track B).** The "Run finished" toast names the ends ("Panel → Receptacle"); the choices still carry over, as decided.
- [x] **A Send that added nothing shows a green success toast** · B ·
      small · no · audit #15. **Done 2026-10-06 (Track B).** A warning toast whenever anything was not sent.
- [x] **Enter in the run-type search arms the top fuzzy match**, so a typo
      arms the wrong type · B · small · no · audit #16. **Done 2026-10-06 (Track B).** Enter picks only an exact name, else makes a new type; the toast names what is armed (`client/src/lib/runTypeEnter.ts`, tested).
- [ ] **Sheet coverage:** show which sheets were never worked, and warn
      before a bid goes out with untouched sheets (rated Essential) · B/A ·
      medium · maybe · `takeoff-spec.md` V19

### Before the priced catalog uploads

These don't produce a wrong number today, but they will the moment real
prices ship without them.

- [ ] **A separate signal for "nobody has priced this".** Once shipped rows
      carry prices, `costPerUnit = 0` stops meaning unpriced, and the
      unpriced filter will report a fully priced catalog that no contractor
      has checked · C (A if it is a column) · medium · maybe · CLAUDE.md
      § "Where a priced catalog lands", `todo.md` ~164
- [ ] **Example-price flag, frozen onto each bid line** ("BidRidge example,
      dated"), so a shipped example price is never mistaken for the
      contractor's own · A then B · medium · **yes** (second batch) ·
      `quote-app-panel-plan.md` § 10 H2
- [ ] **Parent items and brand variants for panels and breakers.** Must land
      before the pricing list uploads, because the list already carries the
      Parent column · A (schema) + C · large · **yes** (0100–0102) ·
      `ASSEMBLIES_PLAN.md` "Parent items and brand variants"
- [ ] **Supplier price import has no dry run.** It writes as it goes, so a
      half-matching import is only found afterwards · C · small · no ·
      `audit-2026-09-21.md` § 7a (confirmed: no `dryRun` in
      `server/routers`)
- [ ] **A live money check with a priced fixture on the smoke account.** The
      last live check compared $0 with $0 · unassigned · small · no ·
      `todo.md` ~1631

## 2. Safety and security

- [ ] **Invite gate.** Today anyone can sign up. Signup should need a code
      the server checks, and only the owner can invite a new company. Must
      land before anyone outside is given the address · A · medium · **yes**
      (`signup_invites`) · `stage-4-safety-plan.md` § 5,
      `origin/a-plans:references/invite-gate-plan.md`
- [ ] **Password reset by email, and signing out other devices on a
      password change.** Built on a-email-reset, not merged. Today a session
      lasts a year (`ONE_YEAR_MS`) and can't be revoked · A · medium ·
      **yes** (0097) · `stage-4-safety-plan.md`
- [ ] **Terms page — the owner writes the sentence.** Keeping anonymised
      corrections from deleted bids depends on it · owner · small · no ·
      `todo.md` ~157, `stage-4-safety-plan.md` Q7
- [ ] **AI correction log.** Must ship before outside users touch the AI, or
      their first corrections are lost for good · A · medium · **yes**
      (`ai_correction_log`) · `stage-4-safety-plan.md` build order 4
- [ ] **Attorney answer on route-around before any outside user sees it.**
      Auto branch runs routing around the building outline and no-go areas
      sit close to the McCormick patent's claims 4–6; until the attorney
      answers the four questions, route-around works only for the owner's
      company and test accounts, and outside users get flag-only · owner
      (attorney), then C moves the switch · small · no · owner 2026-10-09,
      `auto-branch-runs-plan.md` § 3f and § 9
- [ ] **Run the orphaned-plan-file sweep against production** (customer
      drawings). The code is built; the dry run and reading its list are
      not done · owner step, B · small · no · `todo.md` ~1479,
      `track-b-beta-plan.md` piece 1
- [ ] **Deletes say what is lost and can be undone:** one confirm that names
      it ("Delete run R3, 84 ft, 2 drops?"), where Enter does not confirm,
      plus Undo in the toast · B · medium · no ·
      `track-b-deletes-summary-pan-plan.md` § 1
- [ ] **Removing a bid line is a hover-only X** with no confirm or undo ·
      B · small · no · same file § 1.2 m
- [ ] **Deleting a legend symbol is hover-only and drops learned
      corrections** · B · small · no · same file § 1.2 l
- [x] **Deleting a count card isn't lock-checked on the server**
      (`takeoffGroups.remove`) · B · small · no · same file § 1.2 c′.
      **Already done** — the lock check went in on 2026-09-29 (owner); this
      line was stale until 2026-10-06.
- [ ] Deleted-bids log, so a restored backup can re-apply later deletes.
      Optional: today it is a documented manual step · A · small · **yes** ·
      `track-b-beta-plan.md` "For Track A"

## 3. Must work — a beta user has to finish a real bid

- [ ] **An outside electrician completes one real bid alone.** This is the
      gate that says beta is ready. Its stated login blocker is already
      fixed in code · owner · medium · no · `ASSEMBLIES_PLAN.md` ~477,
      `STRATEGY_NOTES.md`
- [ ] **Starter assemblies: build the 168 decided parts lists.** Needs the
      two new assembly categories and "hours not set" first · C (A for
      schema) · large · **yes** (0104, 0105) · `starter-assemblies-plan.md`
- [ ] **Proposal sections are one company-wide setting**, so switching a
      section off for one job changes every other job's proposal. Store the
      choice per bid · B/A · medium · **yes** (small) ·
      `plan-viewer-overhaul.md` § 5g
- [ ] **Pick a stranded trace back up.** A trace interrupted half-way can't
      be continued · B · medium · no · `takeoff-spec.md` T7, `todo.md` ~1815
- [ ] **Invite emails need a real Reply-To** (no-reply@bidridge.com has no
      inbox) · A · small · no · `stage-4-safety-plan.md` owner answers
- [ ] **Search: some alias phrases were shortened by the alias builder**
      ("2 hole strap" can't find EMT strap). Audit every seed row with a
      script · C · small · no · `todo.md` ~1866
- [ ] **Search: "condulet" and "conduit body" lead with the C body instead
      of the LB, and "c body" can't find the C body** · C · small · no ·
      `materials-track-c-plan.md` § 7
- [ ] **Search: the old spelling `5/6" wafer` finds nothing** · C · small ·
      no · `todo.md` ~1847
- [ ] **Seed-heavy tests time out when another worktree's suite is running.**
      The one-query fix is written and measured in `todo.md` § "Flaky
      tests", and waits on whoever owns `server/db.ts`. It also takes
      ~1.5 s off every server start · A/B (db.ts) · small · no · `todo.md`
      § "Flaky tests"

## 4. Looks and readability

- [ ] **The Plans screen at phone width.** The counts panel runs 286 px off
      a 390 px screen, taking undo, trash and "Add a drop" with it. Both
      side panels become drawers, with touch pan and pinch, and a finger
      landing to pan must not place a mark · B · large · no ·
      `origin/track-b:todo.md` "Before beta: the Plans screen at phone width"
- [ ] **The Plans right-hand panel is hard to read:** text too small and
      muted, warnings that don't stand out, a scroll to reach the totals ·
      B · medium · no · `origin/track-b:todo.md` ~61
- [ ] **One setting, six names** ("drop heights", "run height", "Pipe runs
      at"…). "No drop" has five wordings and "Type" two meanings · B · small
      · no · `track-b-deletes-summary-pan-plan.md` audit #18–20
- [ ] **"Count" names two screens, "Send" goes both in and out** (rename the
      bid menu to "Share"), and three different things are called "Undo" ·
      B · small · no · audit #22, #23, #26
- [ ] **The getting-started checklist can't be finished without building a
      library**, which breaks the "manual or automated" rule · B · small ·
      no · audit #21
- [ ] **By-hand counting is hidden until a name is typed**, and the intro
      contradicts the Count popover about needing a scale · B · small · no ·
      audit #24
- [ ] **Unpriced lines follow two policies:** the quote panel blocks, the
      proposal asks, and the block advice is wrong for a labor-rate gap ·
      B · small · no · audit #17, #25. **Advice part done 2026-10-06 (Track B):** each gap now says where to fix it (labor rate → Labor rates; traced part → Materials, then Send again). The two policies (#25) are still open.
- [x] **DONE 2026-10-08 (B, Gap 6.1, todo.md).** **Open a just-uploaded plan from the file on this machine** instead of
      downloading it again. This is the biggest time-to-first-sheet win · B
      · medium · no · `origin/track-b:references/track-b-plans-screen-edits-plan.md`
      Part 4 § 2
- [ ] **A tee's main line and branch both read "from a tee"**, and deleting
      the first leg deletes the whole run · B · small · no · `todo.md` ~1809,
      ~1812
- [ ] **Never looked at on a phone:** the Plans "Recent plans" row and card
      chip. The next-batch layout was never checked at 1536 px desktop width
      · B · small · no · `todo.md` ~1547, ~1577

## 5. Nice to have — can wait until after beta

- Materials list paged and searched on the server. Needed before the catalog
  passes 3,000 rows; it is at 1,554 · C · medium · no · `todo.md` ~34
- Schedule cross-check (enter the plan's fixture and panel schedule, flag
  disagreement with the count) · B/A · large · **yes** · `takeoff-spec.md` C14
  — _rated Essential there; move up if beta users bid from schedules_
- Reader tiles plus a daily AI limit counted in sheets rather than calls,
  gated on the accuracy bake-off (owner hand-counts first) · A · large · no ·
  `reader-accuracy-test-plan.md`
- Material markup pieces 2–5 and a per-line markup override · B/A · large ·
  **yes** · `material-markup.md`
- Purchase list rounded to whole packs, which needs pack sizes · C · small ·
  **yes** · `todo.md` ~2072
- T bodies at a tee, and LL/LR/C at a pull point: rows shipped, takeoff
  wiring waits · A then C · medium · **yes** (0096 + a role) ·
  `materials-track-c-plan.md` § 4, § 7
- Fitting styles for FMC, LFMC and PVC, and PVC expansion fittings · C ·
  medium · maybe · `todo.md` ~2004, ~2046
- Quote bucket per charge; takeoff-only jobs; alternates and allowances ·
  B/A · small to large · **yes** · `quote-app-panel-plan.md` H1,
  `plan-viewer-overhaul.md` § 5g, § 5h
- Mark first, name it after; location tags with a screen control; viewer
  extras (drag a mark, hide pages, side-by-side, revision compare…) · B ·
  large · maybe · `plan-viewer-overhaul.md` § 16, `takeoff-spec.md`
- Billing: seats, Stripe, email verification · unassigned · large · maybe ·
  `todo.md` ~285, ~1640
- Leftover Manus code and doc lines; `tsconfig` target so `scripts/` is
  typechecked · C · small · no · `todo.md` ~1116, ~1606

## Notes for whoever uses this list

**The sources disagree in places. The ones found while drafting:**

- **`takeoff-spec.md`'s inventory (2026-09-14) lists as Missing things that
  are now built:** zoom and pan, known-dimension scale, run types, dragging
  a point, traced footage to the bid, extras, mark drops. Removing a mark is
  built on track-b while `todo.md` ~1580 says no control exists.
- **`plan-viewer-overhaul.md` § 4's phase table** still shows Phases 5, 8 and
  9 as unbuilt, and they are built.
- **`ASSEMBLIES_PLAN.md` ~487** says login is blocked by
  `VITE_OAUTH_PORTAL_URL`. Sign-in is email and password now (CLAUDE.md
  § Architecture).
- **Several `todo.md` boxes are unticked for work their own text calls
  done:** ~1055, ~1081, ~1099, ~1196, ~1602, ~1936. The legacy
  estimate-engine boxes around ~279 and ~775–810 describe screens that no
  longer exist.

Worth a tidy-up pass, but none of it is a beta item. It matters because a
stale "Missing" is how work gets planned twice.
