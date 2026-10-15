# Guide mode — what was built and why (Track C, 2026-10-14)

**The owner's brief:** a new user is walked through upload plans → set
scale → count → run → review → print, with tips they can turn off, a
"Where do I…?" help search, staying on until they turn it off, under the
main flow and never covering working controls, in plain words an
electrician would use.

**Built on track-c** (`e8042584` and the commit after it). Code:
`client/src/lib/guide.ts` (the rule), `client/src/components/GuideStrip.tsx`,
`client/src/lib/helpTopics.ts` + `client/src/components/HelpSearch.tsx`,
the switch in Settings › Display, the mount in `BidRenderShell.tsx`.
Tests: `guide.test.ts`, `helpTopics.test.ts`, `e2e/smoke/guide.spec.ts`.
Screens: `references/overnight-shots/guide-*.png`.

## Decisions (G1–G8)

Read before changing guide mode; each cites what it follows.

- **G1 — The step IS the step bar's `next`.** `guideTip` calls
  `bidSteps()` (shared/bidSteps.ts); it has no rule of its own about what
  comes next. So the strip can never disagree with the step bar, and it
  inherits that rule's decisions: guidance never a gate, a bid counted by
  hand is not behind, runs are optional and never THE next step.
- **G2 — Tracked from data, never from page views** (CLAUDE.md §
  Onboarding). It reads `bids.progress`, which main.tsx refreshes after
  every mutation, so it moves on by itself. It ticks nothing on the
  getting-started checklist.
- **G3 — One tip, at the bottom, as a row of the layout.** A `shrink-0`
  row of the shell's main column, so the screen above ends where it starts
  (CLAUDE.md § Responsiveness 4) — nothing is ever drawn over a control,
  and no screen had to change for it (Track B's Plans screen included).
  On the Plans screen on a phone it is one line.
- **G4 — It steps aside for Track B's first-open Plans tips**
  (plan-reading-help-plan.md § 5) while one is ON SCREEN — not "until all
  four are seen", because B shows a tip only when the sheet has what it
  points at; the first version waited for all four and would have stayed
  silent on Plans for most sets.
- **G5 — Off is per person, on this browser** (like B's tips and the step
  bar switch): `bp_guide:<user id>` in localStorage, read defensively.
  Default ON; × closes one tip for good, "Turn off guide" (strip, wide
  screens) or Settings › Display turns it all off; Display also shows the
  closed tips again. **Not** stored on the account — that needs a column
  (a migration); see the open question below.
- **G6 — "Where do I…?" is local and has no AI.** CLAUDE.md § AI: manual
  mode is the product and an AI call is a button. So the help that says
  where things are works offline, for free, with AI switched off. The
  Dashboard's AI "Find it" box is unchanged and remains the fallback. Every
  topic's address is resolved through the app's router in the test, and no
  answer names a button that is hidden (the price-list import is —
  `priceListImport.ts`).
- **G7 — Viewers get no tips** (every step is one they cannot take);
  "Where do I…?" still works for them.
- **G8 — Plain words.** The test refuses "takeoff", "stamp", "group",
  "snapshot" in the step tips. "Get the drawings in", "Set the scale",
  "Count the devices", "Trace the runs (if the job needs it)", "Check the
  bid", "Print it or send it".

## Open questions (in `pricing/morning-questions.md`)

- **Q-G1** Should "guide off" follow the person to every device? That needs
  `users.guideOffAt` (one nullable column, additive) — a Track A migration.
  Until then a person turns it off once per browser.
