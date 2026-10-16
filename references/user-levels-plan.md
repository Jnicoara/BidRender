# User levels and a trade-ready core — PLAN ONLY (Track B, 2026-10-15 night)

Owner, 2026-10-15: _"PLAN ONLY: user LEVELS (Takeoff / Estimate / Pro —
names not decided) + trade-ready core (stop hard-wiring electrical into the
shared core). Questions numbered."_ Nothing here is built. Questions are
numbered **L1…** (levels) and **T1…** (trades); each has a suggested answer.

## 0. What is already decided — read first

- **CLAUDE.md § "As manual or as automated as the user wants"**: every level
  of working is legitimate and the app must not push between them. A level
  must therefore never make a path LOOK lesser — it hides, it never degrades.
- **CLAUDE.md § "Customization available, but never in the way"**: simple by
  default, deep when asked; ONE fold, never a hierarchy; hide OURS, never
  THEIRS.
- **Two axes already exist and must stay separate** (`shared/permissions.ts`):
  company ROLE (owner/admin/estimator/viewer — what you may do here) and
  ACCESS TIER (standard/internal — whether unreleased features exist for you).
  A level is a THIRD axis; folding it into either is the mistake the file's
  header warns about.
- **Seats** (`companies.seatLimit`, set by hand "until billing exists") and
  **billing** (before-beta-checklist: "Billing: seats, Stripe… unassigned")
  are not built. A level that is SOLD belongs with them.
- **Trades:** `assemblies.trade` (default "electrical") and `bids.trades`;
  "unlocking is gated at the app layer, so a new trade needs no migration"
  (CLAUDE.md § Project). `trade` is not `projectType`.

## 1. User levels

### 1.1 What a level is — the question everything hangs on (L1)

Two very different things share the word:

| | A **plan** (what the company bought) | A **mode** (how a person likes to work) |
| --- | --- | --- |
| Set by | the owner, at billing | each person, any time |
| Stored on | `companies` | `users` (or per membership) |
| Hides | features the company has not paid for | screens a person does not use |
| Can be undone by the user | no | yes, one click |

**L1. Is a level a PLAN (sold) or a MODE (preference)?** — Suggested:
**a plan, per company**, with no per-person mode yet. A mode duplicates what
"simple by default, deep when asked" already gives every screen, and a
person stuck in "Takeoff mode" who cannot find pricing is the "lesser path"
failure the manual-mode rule forbids.

### 1.2 A first cut of the three (L2)

Built from screens that exist today; every one is reachable in the app now.

| | Takeoff | Estimate | Pro |
| --- | --- | --- | --- |
| Plans: count, trace, scale, legend, Unassigned | ✓ | ✓ | ✓ |
| Takeoff export (CSV), materials list | ✓ | ✓ | ✓ |
| Library: materials, assemblies, run types | read + own | ✓ | ✓ |
| Bids priced: lines, labor, markup, tax | — | ✓ | ✓ |
| Proposal print / send | — | ✓ | ✓ |
| Starter offers (Updates tab) | — | ✓ | ✓ |
| More than one seat | — | — | ✓ |
| Analytics, QuickBooks, quote-app panel | — | — | ✓ |
| AI plan reading | ? | ? | ✓ (L5) |

**L2. Is this the split?** — Suggested: yes as a starting point; the line
that matters is Takeoff ↔ Estimate, i.e. **does a Takeoff company see money
at all?** (L3).

**L3. In Takeoff, does a count show a price anywhere?** — Suggested: **no
money on any screen** — quantities only, exported. A half-priced takeoff is
a number nobody checked (CLAUDE.md's $0 rule) presented as an estimate.

**L4. Moving up or down keeps everything.** Down from Estimate to Takeoff
HIDES bids' pricing; it never deletes or re-prices it, and moving back up
shows it as it was. — Suggested: **yes, and say so on the downgrade screen.**
(Same shape as "retire, never delete".)

**L5. Where does AI plan reading sit?** Its cost is per person per day
(`shared/aiLimits.ts`). — Suggested: **every level, with the daily limit
scaled by level** rather than an on/off — manual mode is the product, AI an
accelerator, and a Takeoff user is the one it helps most.

**L6. Names.** "Takeoff / Estimate / Pro". — Owner's call; the code never
uses them (§ 1.3), so renaming is copy only.

### 1.3 How it would be built (when L1–L4 are answered)

- **`companies.plan`** — one nullable column (NULL = today's behaviour,
  everything, so every existing company is unchanged): additive migration,
  A's to run (CLAUDE.md three steps; step 1 only).
- **Capabilities, not level checks.** A level maps onto a set of FEATURE ids
  exactly like `ACCESS_TIERS` does (`hasFeature`); code asks
  `hasFeature("bids.pricing")`, never `plan === "pro"`. Then a fourth level,
  or moving one feature between levels, is a table edit — the
  `FEATURES` rule ("flipping it is one word") applied to a new axis.
- **Server first.** A hidden screen with a live procedure is not a gate; the
  same `internalProcedure` tag style refuses on the server.
- **Fail closed, fold not delete:** an unknown plan reads as the LOWEST level
  for features and hides nothing that was stored.

## 2. A trade-ready core

### 2.1 What the code says today (surveyed 2026-10-15; spot-checked)

The survey searched for literal "electrical", electrical vocabulary in shared
logic, enums and trade gating. **What it searched for is what it found** —
an electrical idea written in neutral words would not show up.

**Trade is a vocabulary, not a gate.** `shared/trades.ts` lists electrical
and low voltage (shipped) and plumbing and HVAC (not shipped), and says it
is "a vocabulary, NOT a gate". `shippedTrades` / `tradeApplies` have **no
callers outside tests** (checked). `trade` is a column on materials, labor
rates, assemblies, run types and kits; `bids.trades` is a JSON list. No
library screen or query filters by trade; only bid search does.

**Where a second trade would break the core** (file references in the
survey notes, kept in `overnight-log-b.md`):

| Area | What is electrical in it | Kind |
| --- | --- | --- |
| **Traced runs** | `pathType` is a MySQL ENUM of conduit / cable (checked, schema 3207, 3534); every run carries circuits of conductors + ground; quantities, labor, extras (`conduitPct`/`wirePct`), the "no wire" flag, homerun vs branch ownership, bends (NEC 360°/270°), fittings (LB, pull box…), export columns | **The big one** — a pipe or duct run has no honest home |
| **Shelves** | `materials.category` and `assemblies.category` are MySQL ENUMs of electrical shelves (checked, schema 966, 1415) | Contradicts "a new trade needs no migration" |
| **New rows** | materials and run types take no trade input (always the default); bids default to `["electrical"]` and the client never sends one; assembly trade is free text | Every new row is electrical |
| **AI prompts** | plan reading, Plan Copilot, tie-break, alias suggestions, navigation all say "electrical estimator" | Need a trade parameter |
| **Plan help / CAD** | `PlanLookUp` filters to `=== "electrical"`; CAD layers keep only `E-` layers | Need the bid's trades |
| **Electrical-only panels** | homeruns, panel schedules, circuits shown on every bid | Clutter for another trade |
| **Content tables in shared code** | heights, device families, pin letters, size order, search aliases and spoken-cable rewrites, labor-hour hints, example wages, scope prompts | Fine as content; need a trade KEY to coexist |
| **Accounting** | QuickBooks item hard-coded "Electrical work" | Books plumbing as electrical |

### 2.2 The order it would go in (none built)

1. **Say which trade new things are.** Materials and run types take a
   trade; a bid's trades come from the person (one picker, defaulting to
   the company's first trade); assembly trade becomes a picker from
   `TRADES`. No migration — the columns exist.
2. **Content keyed by trade.** Each content table above becomes
   `Record<TradeId, …>` with electrical as today's entry; a trade with no
   entry reads an empty table, never electrical's. Search aliases first
   (cheapest, most visible).
3. **Prompts and plan help take the bid's trades.** One function builds
   the "who is reading" sentence; `PlanLookUp` and CAD layers read the
   bid's trades.
4. **Shelves out of the ENUM.** `category` becomes a string checked
   against a per-trade list in code — the only way "content plus an
   unlock" stays true. Migration (widen the column), A's to run.
5. **The run model.** A path type is a property of a run TYPE, not a fixed
   enum: what it carries (conductors, nothing, a medium) and which
   quantities it produces. Electrical keeps conduit/cable exactly as today.
   This is the real refactor and its own plan, written against a real
   plumbing takeoff rather than imagined.
6. **The unlock.** Only then does `shippedTrades` gate anything — and it
   gates which trades a company may pick, never what existing rows hold.

### 2.3 Questions (T)

- **T1. Which trade is second?** — The run model (step 5) should be
  designed against ONE real trade. Suggested: **plumbing** (pipe runs and
  fittings map most closely onto what exists).
- **T2. Can steps 1–3 go ahead before T1 is answered?** They change no
  number on any bid and need no migration. — Suggested: **yes, on track-b,
  one step per commit.**
- **T3. Shelf categories out of the database ENUM (step 4)?** A
  migration for A. — Suggested: **yes, before any second trade**; it is the
  one place the "no migration" promise is false today.
- **T4. A company's trades** — set at sign-up, in Settings, or inferred
  from what they bid? — Suggested: **Settings, defaulting to electrical**
  for every existing company (so nothing changes for them).
- **T5. Does a level (§ 1) interact with trades?** e.g. one trade per
  company on Takeoff, several on Pro. — Suggested: **no**: two axes, kept
  apart, like role and tier.
- **T6. QuickBooks "Electrical work"** — per trade, or a company setting?
  — Suggested: **the line's trade** (a mixed bid books to two items).
