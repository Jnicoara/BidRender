# Track B — overnight log, 2026-10-14 → 15

Owner away. Rules: push ONLY track-b; never local-dev / staging / main; no
staging or live DB; no migrations (draft for A and park); MySQL 3307 shared,
never stopped; one dev server at most. Questions that move a bid number
beyond the plan, money, or anything irreversible go to
`references/morning-questions-b.md`.

## Step 0 — local-dev Gate for d0152f60 (21:38–)

- Run 38682319349 failed in 9 s before any test: the `test` job could not
  pull `public.ecr.aws/docker/library/mysql:8.0` ("toomanyrequests: Data
  limit exceeded"), the third such refusal tonight (also 38669536985 on
  track-b). Not a code fault. Re-ran the failed job once (a re-run, not a
  push).
- **Result (22:14):** re-run green. test ✓, deploy-staging ✓, smoke **96
  passed / 2 skipped** (7.0 m), staging `/api/version` = `d0152f60`
  (built 04:52:58Z). Nothing to fix.
- **Recurring, not code:** the Gate's MySQL image pull from
  `public.ecr.aws` hit "toomanyrequests" four times tonight (38669536985,
  38682319349, 38684208140, …). A re-run gets through. See
  `morning-questions-b.md` Q1.

## Starter offers — steps 1–2 (21:38–21:47, commit time) · `94fc00b4`

- Per-field offer collapse (`collapseOffer`), owner/admin rule, Example-tag
  companion (`exampleTagAfter`) written in the same change, `recountsDrafts`
  with every offer field classified. `seedProposal` reports a person's
  change live-ahead before its tag-split hold (A's T1 went red without it).
- Tests: `server/starterOfferRules.test.ts` (17, pure), `starterChanges`
  asserts the tag + one change row. 11 related files, 141 passed.

## Starter offers — steps 3–4 (21:47–21:52) · `cf2d3dc8`

- `server/starterOffers.ts`: the read, Accept / Accept all / Ignore /
  un-ignore (one transaction, stale picks refused), draft re-count count.
- `server/starterOffers.test.ts` (9): plan tests 1–12. The lock filter was
  removed once to see test 8 go red, then restored.

## Starter offers — step 5 (21:52–21:57) · `25bebd5f`

- Admin routes previewEdit (a rolled-back dry run, so preview = Confirm),
  applyEdit, changeLog, undoBatch; shop router `starterOffers` (count =
  list length; answers owner/admin only, red with the gate removed).
- Gate 38684208140: image-pull rate limit, superseded by the next push.

## Starter offers — step 6, screens (21:57–22:16)

- Shop: Dashboard card (owner/admin, only while N > 0), one Updates view
  on Materials / Assemblies / Labor rates (tab only while there are
  updates), `useRefreshStarterOffers` as the one refresh.
- Admin: pencil on each material / assembly / run type → field → Preview
  → Confirm; Change log tab with Undo (preview first). Labor rates not
  editable yet (wage and rate must change together).
- **By eye** (playwright, owner session + a throwaway starter editor, both
  local): laptop 1536, iPad 820×1180 and 1180×820, phone 375. Preview
  0.9 s; Confirm 0.9 s; Accept round trip 1.6 s. Stale-count check: Accept
  on Materials → back to Dashboard with no reload → card gone, tab badge
  gone. Re-count warning on a run-type waste offer ("2 draft bids…") and
  not on a price; confirm dialog states it.
- **Fixed from looking (each with a test that failed first):**
  1. Undo of a price set from $0 was REFUSED ("must be above 0") — the
     above-zero rule is for new values. Pricing an unpriced item could not
     be undone, and the Undo preview said it could. `plan(…, restoring)`.
  2. "Now not set" on a run type's waste — it follows the company default;
     now "your default".
  3. "Pins 0 shops that don't have their own copy yet" — `previewSentence`
     says zero plainly.
- Noted, not chased: the dev Dashboard takes 2.5–7 s on a COLD page load
  (Vite serving unbundled modules); `starterOffers.count` is 3–5 ms on the
  server. Change-log times read 7 h early locally (local MySQL stores local
  time, the driver reads UTC); live MySQL is UTC.
- Local data: two test changes (14/2 NM-B price, a run type's wire waste)
  made and undone through the app; user 1 is offered the price undo.

## Starter offers — labor-rate edits (22:14–22:19)

- A shipped rate edits as a PAIR: the admin changes the wage or a burden
  part; `rateEdit` writes it AND the hourly rate `loadedRate` makes, in
  one batch (`rateEditFields`). Typing the rate itself on a broken-down rate
  is refused; a plain rate edits its rate; a salaried role its salary or
  hours. `previewStarterChanges` previews a batch.
- Tests: `starterOfferRules` (+3: 45 × 1.41 = 63.45, refusal, shapes),
  `starterEdit` (+2: which boxes a rate gets), `starterLibrary` (+1: one
  batch, two changes, tag kept). 5 files, 55 passed.
- By eye laptop + phone 375: "Base wage $26.00 → $45.00 / Hourly rate
  $36.66 → $63.45", preview 1.1 s.
- **Scaling note:** a preview is a dry run that pins every shop (69 here,
  1.1 s). With thousands of shops it grows linearly — measured in the
  stress pass.

## Starter offers — a recipe part's quantity on the admin screen · `a8e3b2ef`

- Pencil on each part row → "Quantity in this assembly" → Preview → Confirm
  (a `part_field` change). Looked at on laptop.

## Gate 38686356758 RED, fixed · `4a7dfca6`

- `server/auth.email.test.ts` mocks `./db` without the fork functions; the
  routers now import `starterChanges.ts`, whose registry read
  `db.forkMaterial` at module load → 1 of 440 files red. The registry looks
  each fork up when called. Reproduced red locally, then green.

## Stress rounds 1–5 (see `stress-results-b.md`)

| Round | Found                                                                                                            | Fixed in   |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | every starter change visited every shop (414 ms/change at 306 shops); preview forked every shop (7.3 s at 2,006) | `07a96f74` |
| 2     | every pan step re-rendered every mark (5.2 s / 20 steps at 5,000 marks, dev)                                     | `2dfc2a48` |
| 3     | opening the 500-sheet set downloaded all 270 MB (schedule search read every page)                                | `d7245405` |
| 4     | marks placed offline never retried; one failed sheet killed the plan                                             | `9150f9b1` |
| 5     | two tabs, Back mid-save — held                                                                                   | notes only |

- Gates: 38688083146 green (2dfc2a48), 38689454507 green (d7245405).
- Servers: dev server stopped at the start of round 2; a PRODUCTION build on
  3002 used for every measurement since (one server at a time).

## Stopped — usage limit (round 6, touch)

- Touch check: all gestures pass at iPad both ways, phone, phone-375; the
  Select-mode step fails on iPad portrait and phone — open,
  `morning-questions-b.md` Q3. Probes deleted; production server stopped;
  MySQL 3307 left running.

## Morning follow-up — touch (Q3) (01:15)

- MarkLayer cleared (start-of-night build in a worktree fails the same
  step); the touch script fixed (tap marks where they are, every phone size,
  named failures); "Name this symbol" now closes on a sheet change / Trace /
  armed count (`@/lib/captureLifetime`). iPad both ways + phone 390 pass
  twice; two steps open at 375 px (Q3). Worktree removed; server stopped.

## Second morning — screenshots, phone check, 375 px (06:00–06:45)

- Screenshots of every new screen at laptop, iPad both ways and phone 390:
  `references/overnight-shots/b/` (33 files, index in its README). The
  starter change used for them was undone through the app's Undo.
- Morning Q4: the two-minute real-finger check for the owner's phone.
- Both 375 px touch steps fixed (stress-results-b.md round 7) — both were a
  floating panel's buttons over a short drawing: the selection pill's
  extras fold behind "More" with a finger; the trace pill docks to the
  bottom. `pnpm device:touch` passes at all five touch sizes; `pnpm check`
  clean. Leftover touch-check counts removed; server stopped; MySQL 3307
  left running.
- Gate 38743997163 green on eb94729a.

# Third night, 2026-10-15 → 16 (started 22:01)

Owner's list: 1 merge A's fix · 2 "$0.00" after Undo · 3 375 px trace
toolbar · 4 zoom at 5,000 marks · 5 slow first admin edit · 6 count now,
item later · 7 user-levels plan · 8 break-it loop. Free memory 2.9 GB at
start.

## Item 2 — "$0.00" after the screenshot Undo (22:01–22:12) · `893c4bcf`

- **The item really was the stored 0**, which is how `costPerUnit` (NOT NULL
  DEFAULT 0) says "not priced". The screens were wrong: the starter editor's
  list, its change log ("$1.23 → $0.00") and a shop's Updates printed it as
  a dollar amount. Now "not priced"; labor rows "rate not set" with no
  "$0.00 / h". `starterPriceText` in `client/src/lib/starterUpdates.ts`;
  test red without it. Looked at laptop and phone 390.
- The shop's own Materials screen still shows `$0` + its filter, per
  CLAUDE.md § 6 (MONEY) — not changed.
- Gate 38853954418 green.

## Item 3 — 375 px trace toolbar (22:12–22:20) · `b7230030`

- Measured first: in Trace at 375x667 the toolbar was FIVE rows (mode;
  From/to; a lone divider; the scale with two notes running off the edge;
  Fit) and the drawing 237 px tall, with a two-row pill over it.
- Now two rows (mode + compact scale + icon Fit; From/to) and a one-row
  pill (number, New leg icon, Undo, Finish, X; Snap only while a leg start
  is picked). Drawing **351 px** tall. iPad portrait looked at: toolbar
  unchanged, pill one row.
- `pnpm device:touch` all five sizes: **84 ok, 0 FAIL**, exit 0.

## Item 1 — A's fix reached local-dev (22:21) · `04693306`

- local-dev a4c97280 (Q-DB1 database recovery, Lax cookie, S12) merged into
  track-b; CHANGELOG conflict only, both kept; no `drizzle/` change;
  `pnpm check` clean. Gate 38855439414 green (covers item 3 too).

## Item 4 — zoom at 5,000 marks (22:23–22:40) · `0e554ad6`

- Production build, bid 1728469. A wheel step: **149–166 ms → 33 ms**
  median (worst 244 → 91). Marks drawn once and scaled by a CSS variable
  that settles 200 ms after the zoom stops. stress-results-b.md round 8.
- Drawn mark size = the clamp rule at 19–386%; touch check 84/0.

## Item 5 — slow first admin edit (22:40–22:49) · `3f4402e6`

- At 2,006 shops (test DB): material 6.2 s → 0.46 s, modifier 4.9 → 0.29,
  run type 7.0 → 0.48, assembly 18.8 → 1.3 s. One fork code path for one
  shop or many (`forkForOwners`). Copies counted correct; new statement-
  count test red on one-at-a-time forks. 204 fork tests green. Morning Q2
  closed. stress-results-b.md round 9. Gate green on c0542084.

## Item 6 — count first, pick the item later (22:50–23:20) · `00948893` plan, `745da6da` server, `b6b8ad2e` screens

- Plan: `references/count-first-plan.md` (answers overhaul § 16.5; § 16
  points at it). One Unassigned count per bid, reserved label nobody can
  type, never sent, blocks a priced print; bid total wording untouched.
- Caught by its own test: the counts list computed sendability after
  swapping in the display name, so the holding pen read sendable — fixed.
- Looked at laptop + phone 390 end to end (picker, "?" pins, print block,
  bid strip, assign by name); probe marks removed from bid 1728369.
  device:touch 84/0, client tests 1642, server suites 302. Morning Q5.

## Item 7 — user levels + trade-ready core, PLAN ONLY (23:05–23:25) · `17222fa0`

- `references/user-levels-plan.md`: levels as a third axis beside role and
  tier (L1–L6), and a trade survey (55 sites, the key ones spot-checked:
  `category` and `pathType` are MySQL ENUMs; `shippedTrades`/`tradeApplies`
  have no non-test callers) with a build order and T1–T6. Nothing built.
- Survey notes worth keeping (file:line): run model `shared/takeoffQuantities.ts`
  53/57-103/767-925; `shared/runNoWire.ts`; `shared/branchWire.ts` 58,95-160;
  `shared/runFittings.ts` 148-187; `shared/runBends.ts` 81; prompts
  `server/planReading.ts` 60,139, `planCopilotRouter.ts` 596,
  `server/tieBreak.ts` 88,191, `shared/aliasSuggestions.ts` 216;
  `PlanLookUp.tsx` 453-468; `client/src/lib/cadLayers.ts` 41-80;
  `shared/accountingExport.ts` 100; `bidsRouter.ts` 456.
- Also tonight (item 8 / todo): moveToGroup toast fix `04bb1d2e`;
  bids.dashboard measured 240/440/840 ms at 50/100/200 marked bids
  (`90fcb4fc`, no code change).

## Item 8 — break-it pass on starter offers + Plans (23:25–23:30)

- Starter offers' Accept path read through: stale picks refused, one
  transaction, answers upserted; nothing found.
- The new Unassigned count, attacked from every route that takes a count id
  — four faults, each fixed with a test red without it:
  `04bb1d2e` "Move to" Unassigned toasted `__unassigned__`;
  `a2544d45` an undo blocked by a newer Unassigned count named it so;
  `6b27d143` the Unassigned count itself could be linked to an assembly
  (kept its reserved label, became sendable — could reach the bid);
  `75d8e319` setDrop on it was allowed (drops can add footage).
- Safe todo: dashboard timing measured (`90fcb4fc`, numbers only). The
  starter rename path is not safe unattended (A's seed area) — left.
- Dev and production servers stopped; MySQL 3307 left running.
