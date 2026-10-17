# User levels and a trade-ready core — PLAN ONLY (Track C, 2026-10-16)

Owner, 2026-10-16: _"PLAN ONLY, no code: user LEVELS (Takeoff / Estimate /
Pro, names TBD; picked at signup, switch anytime; each level shows only its
screens; separate from pricing tiers) + a trade-ready core (stop
hard-wiring electrical into shared parts)."_ Nothing here is built.
Questions are numbered **UL1…** (levels) and **TR1…** (trades), each with a
suggested answer; they are also at the top of `pricing/morning-questions.md`.

**This replaces Track B's first plan in this file (2026-10-15 night,
`17222fa0`).** B's L1 suggested a level be a PLAN (sold, per company); the
owner's brief above decides the opposite — a level is a way of WORKING,
picked by the person, switchable any time, and not a pricing tier. B's
trade survey (§ 2.1) is kept, re-checked and credited; B's L3–L5 return as
UL questions below, re-asked for a mode instead of a plan.

## 0. What is already decided — read first

- **CLAUDE.md § "As manual or as automated as the user wants"**: every way
  of working is legitimate and the app must not push between them. So a
  level HIDES screens a person does not use; it never makes a path look
  lesser, never nags toward a higher level, and never removes or re-prices
  anything (the "one-way door" rule — both directions, always).
- **CLAUDE.md § "Customization available, but never in the way"**: simple
  by default, deep when asked; ONE control away, never a hierarchy.
- **The axes that exist must stay separate** (`shared/permissions.ts`):
  company ROLE (owner / admin / estimator / viewer — what you MAY do) and
  ACCESS TIER (standard / internal — whether an unreleased feature exists
  for you). Billing tiers are not built (`before-beta` checklist). **A level
  is a fourth thing: what you SEE.** It must not be folded into any of them.
- **Onboarding is tracked from data, never from page views** (CLAUDE.md §
  Onboarding) — true per level too.
- **A retired address must redirect, never fall through** (CLAUDE.md §
  Architecture, `RETIRED_PATHS`). A HIDDEN screen is the same problem: a
  bookmark or a link must say where the thing went, not land silently on
  the Dashboard.

## 1. User levels

### 1.1 What a level is — decided by the owner (UL1)

|                        | A level (this plan)                                   | A role             | A tier / billing                |
| ---------------------- | ----------------------------------------------------- | ------------------ | ------------------------------- |
| Says                   | which screens I use                                   | what I may change  | what exists / what we paid for  |
| Chosen by              | the person                                            | the company owner  | BidRidge / the owner at billing |
| Switch                 | any time, one click, Settings › Display and at signup | owner, Crew screen | —                               |
| Enforced on the server | **no** (it hides; it is not security)                 | yes                | yes                             |

**Because a level is not security, the server never refuses on it.** A
Takeoff person who opens a priced bid by link sees the screen with a line
"This is part of Estimate — switch to see it here" (UL5), and their ROLE
still decides what they can change. Gating on the server would turn a
preference into a lock — the "lesser path" CLAUDE.md forbids.

### 1.2 A first cut of the three (UL2)

From screens that exist today (`client/src/lib/appRoutes.ts` `Route`).

| Screen (route)                                        | Takeoff          | Estimate         | Pro              |
| ----------------------------------------------------- | ---------------- | ---------------- | ---------------- |
| Dashboard (`dashboard`)                               | ✓ (counts, no $) | ✓                | ✓                |
| Bids list, Plans list (`bid-list`, `plans-index`)     | ✓                | ✓                | ✓                |
| Plans screen: scale, count, trace, legend (`takeoff`) | ✓                | ✓                | ✓                |
| Count by hand (`count`)                               | ✓                | ✓                | ✓                |
| Bid page: lines, quantities (`bids`)                  | ✓ quantities     | ✓ priced         | ✓                |
| Materials list, takeoff export (CSV)                  | ✓                | ✓                | ✓                |
| Proposal (`proposal`)                                 | —                | ✓                | ✓                |
| Library: Materials, Assemblies (+ Kits, Modifiers)    | ✓ (UL4)          | ✓                | ✓                |
| Labor rates, Settings › Pricing / Tax                 | —                | ✓                | ✓                |
| Clients (`clients`)                                   | —                | ✓                | ✓                |
| Performance (`analytics`), close-out, QuickBooks      | —                | —                | ✓                |
| Crew (`team`)                                         | owner/admin role | owner/admin role | owner/admin role |
| Settings (other panels), Recently deleted, Admin      | ✓                | ✓                | ✓                |

**UL2. Is this the split?** — Suggested: **yes as a start**; the line that
matters is Takeoff ↔ Estimate (UL3). Crew follows the ROLE, not the level,
because hiding it from an owner on Takeoff would stop them inviting anyone.

**UL3. On Takeoff, does money show anywhere?** — Suggested: **no money on
any screen** — quantities only, exported. A half-priced takeoff is a
number nobody checked presented as an estimate (CLAUDE.md § Starter
content). The prices still EXIST; they are not shown.

**UL4. On Takeoff, the library?** A count is "what is it" — an assembly or
a typed name (level 1 of plan-viewer-overhaul § 3). — Suggested: **Materials
and Assemblies visible, their price columns hidden**; a Takeoff user who
never opens the library still counts (the manual-mode test).

**UL5. A link to a screen the level hides** (a shared bid link, a
bookmark, the AI helper's answer) — Suggested: **open it, with one line at
the top: "This is part of Estimate. Switch to Estimate · Not now"**. Never a
404, never a silent Dashboard. Same shape as `RETIRED_PATHS`, by design.

**UL6. Per person or per company?** — Suggested: **per person** (it is how
_I_ work); a new invitee starts on the inviting owner's level. A company
setting would make the estimator who prices and the field person who only
counts share one view, which is the case levels exist for.

**UL7. Picked at signup — and existing users?** — Suggested: signup asks
ONE question with the three choices and a "not sure → Estimate" default;
**every existing user is Pro** (NULL = Pro), so nobody's screen changes on
the day it ships.

**UL8. Does the level change the guide and the step bar?** — Suggested:
**yes**: Takeoff's steps end at "Export the quantities" instead of "Print
it or send it"; the guide reads the same rule (`shared/bidSteps.ts` with
the level as an input — G1 of `guide-mode.md` keeps them unable to
disagree).

**UL9. Names.** "Takeoff / Estimate / Pro" — owner's call. The code stores
a key (`takeoff` / `estimate` / `pro`); the words are copy only.

### 1.3 How it would be built (when UL2–UL7 are answered)

1. **Store it.** `users.workLevel` ENUM('takeoff','estimate','pro') NULL —
   NULL reads as Pro, so every existing user is unchanged. ADDITIVE, step 1,
   step 3 empty; A writes and runs it (CLAUDE.md § three steps). Until it
   exists nothing here ships — localStorage would make "switch anytime"
   per-browser, the Q-G1 problem guide mode already has.
2. **One pure rule, tested.** `client/src/lib/workLevel.ts`:
   `levelShows(level, route, view?)` and `levelShowsMoney(level)`, beside
   `appRoutes.ts` so `appRoutes.test.ts` can cross-check every `Route`
   against the table above (a new screen with no answer fails the test —
   the forcing function, not a reminder).
3. **Every place that lists screens reads it**: the sidebar and the phone
   bar (`BidRenderShell`), `shared/navigationTargets.ts` (the AI helper
   names only screens the level shows — or says "in Estimate"), "Where do
   I…?" topics (`helpTopics.ts`), `shared/onboarding.ts` steps, the guide
   and step bar (UL8). One rule, read by all; a test per consumer that
   nothing hidden is offered.
4. **Money hiding is a component, not a sweep.** The bid page, Dashboard
   cards and library rows show money through a few shared cells
   (`LineCost`, the totals strip, `MoneyCell`-type helpers). They take
   `showMoney` from one hook. A screen-by-screen `{level !== "takeoff" &&}`
   would be the "two copies drift" failure (CLAUDE.md § Copying a layout).
5. **The switch**: Settings › Display ("How I work"), and the signup step.
   Switching changes nothing stored except `workLevel`.
6. **Looked at, at every level, at laptop and phone** — a level changes
   what a person sees, so it is not verified until somebody has looked
   (CLAUDE.md § A layout change).

What it does NOT do: refuse a procedure, change a role, change a price,
move a bid, or hide anything the person ADDED (hide ours, never theirs).

## 2. A trade-ready core

### 2.1 What the code says today (B's survey 2026-10-15, re-checked 2026-10-16)

The survey searched for literal "electrical", electrical vocabulary in
shared logic, enums and trade gating. **What it searched for is what it
found** — an electrical idea written in neutral words would not show up.
Re-check 2026-10-16: 14 files in `shared/` say "electrical" (by the word,
case-insensitive); nothing new hard-wired since B's survey except the
scope prompts and scope phrases (step 6a/6b, both electrical content).

**Trade is a vocabulary, not a gate.** `shared/trades.ts` lists electrical
and low voltage (shipped) and plumbing and HVAC (not shipped).
`shippedTrades` / `tradeApplies` have no callers outside tests. `trade` is
a column on materials, labor rates, assemblies, run types and kits;
`bids.trades` is a JSON list. Nothing filters the library by trade.

| Area                       | What is electrical in it                                                                                                                                  | Kind                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Traced runs**            | `pathType` ENUM conduit / cable; circuits of conductors + ground; extras, "no wire", homeruns, bends (360°/270°), fittings (LB, pull box), export columns | **The big one** — a pipe or duct run has no honest home |
| **Shelves**                | `materials.category`, `assemblies.category` are MySQL ENUMs of electrical shelves                                                                         | Contradicts "a new trade needs no migration"            |
| **New rows**               | materials and run types take no trade; bids default to `["electrical"]`; assembly trade is free text                                                      | Every new row is electrical                             |
| **AI prompts**             | plan reading, Plan Copilot, tie-break, alias suggestions, navigation: "electrical estimator"                                                              | Need a trade parameter                                  |
| **Plan help / CAD**        | `PlanLookUp` filters `=== "electrical"`; CAD keeps `E-` layers                                                                                            | Need the bid's trades                                   |
| **Electrical-only panels** | homeruns, panel schedules, circuits on every bid                                                                                                          | Clutter for another trade                               |
| **Content in shared code** | heights, device families, pin letters, size order, search aliases, spoken-cable rewrites, labor hints, example wages, **scope prompts and scope phrases** | Fine as content; needs a trade KEY                      |
| **Accounting**             | QuickBooks item "Electrical work"                                                                                                                         | Books plumbing as electrical                            |

### 2.2 The order it would go in (none built)

1. **Say which trade new things are** — materials and run types take a
   trade; a bid's trades come from one picker defaulting to the company's
   first trade; assembly trade becomes a picker from `TRADES`. No
   migration — the columns exist. Moves no number.
2. **Content keyed by trade** — each content table becomes
   `Record<TradeId, …>` with electrical as today's entry; a trade with no
   entry reads an EMPTY table, never electrical's (a plumber asked "who
   furnishes the light fixtures?" is the failure). Search aliases first;
   scope prompts carry a trade column when S2 lands (`scope_prompts`, see
   `scope-tags-plan.md` 6b — a small addition, flagged in TR4).
3. **Prompts and plan help take the bid's trades** — one function builds
   the "who is reading" sentence; `PlanLookUp` and CAD layers read them.
4. **Shelves out of the ENUM** — `category` becomes a string checked
   against a per-trade list in code. Migration (widen the column), A's.
5. **The run model** — a path type becomes a property of a run TYPE (what
   it carries; which quantities it produces). Electrical keeps conduit /
   cable exactly as today. The real refactor; its own plan, written
   against a real takeoff of the second trade, not imagined.
6. **The unlock** — only then does `shippedTrades` gate which trades a
   company may PICK, never what existing rows hold.

### 2.3 How levels and trades meet

They are two axes, kept apart like role and tier: a level is which
screens, a trade is which content. The one place they touch is the step
bar — the run step reads "Trace the runs" for electrical today, and both
the trade (what a run is) and the level (whether Print is a step) feed the
same `bidSteps` input.

### 2.4 Questions (TR)

- **TR1. Which trade is second?** The run model (step 5) is designed
  against ONE real trade. — Suggested: **plumbing** (pipe runs and fittings
  map most closely onto what exists).
- **TR2. May steps 1–3 go ahead before TR1?** No number moves, no
  migration. — Suggested: **yes, one step per commit, on a track branch.**
- **TR3. Shelves out of the database ENUM (step 4)?** A migration for A. —
  Suggested: **yes, before any second trade** — the one place the "no
  migration" promise is false today.
- **TR4. Scope prompts get a `trade` column?** S2 is still a draft (A adds
  it after the live release). Adding `trade VARCHAR(32) NOT NULL DEFAULT
'electrical'` now costs one line; later it is a second migration. —
  Suggested: **yes, fold it into S2 before A runs it.**
- **TR5. A company's trades** — set at signup, in Settings, or inferred
  from bids? — Suggested: **Settings, defaulting to electrical** for every
  existing company; signup asks only the level (UL7), not the trade, until
  a second trade ships.
- **TR6. QuickBooks "Electrical work"** — per trade or a company setting?
  — Suggested: **the line's trade** (a mixed bid books to two items).
