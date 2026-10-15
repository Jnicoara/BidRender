# Starter edits go out as offers — wiring the admin screen. PLAN ONLY

Track B, 2026-10-14. **Plan only: no code, no migration.** Read from
`track-b` at `2cc8f0b1` (which holds C's `applyStarterChange`, merged in
91dcf7f5) and `origin/local-dev` at `22c30965` (which holds A's boot change
`d38f5930` and `boot-seed-plan.md`; not yet in `track-b`).

**The ask (owner, 2026-10-14):** an admin edits a starter row on the
baseline screen → `applyStarterChange` logs it → existing shops see "N
starter updates available" offers → new shops get the change directly →
Drafts re-count only after Accept, sent and locked bids never move → the
"Example" tag goes with any price, hours or rate change.

**The short answer:** the design is already settled
(`baseline-screen-plan.md`, Q1–Q22, nothing open), every table it needs is
already migrated (0152–0155, 0163), and pinning, the change log and undo are
built. **What's missing is the middle:** reading offers, Accept/Ignore,
the Example-tag companion, the admin edit routes, and both sets of screens.
**No migration is needed from A for this.** One fault in the offer spec has
to be fixed before it's built (§ 3a).

> **Owner, 2026-10-14 — two changes after this was written:**
>
> - **Q1–Q7 (§ 8) are answered: all YES, as suggested.** Nothing in the
>   plan moves.
> - **B now builds the WHOLE feature, including the parts marked C below**:
>   the Example-tag companion in `applyStarterChange` (step 1), the offer
>   read with § 3a's per-field collapse, Accept/Ignore and `recountsDrafts`
>   (step 2), and the number tests. C stays on catalog reviews. Where this
>   plan says "C's call", read "B's call, citing C's spec"
>   (`baseline-screen-plan.md` § 10a). A still owns release order and
>   `starterDrift --apply` (§ 5). Recorded in both track handoffs.

> **BUILT 2026-10-14/15 (Track B, overnight; track-b, not merged).** Steps
> 1–6 of § 4. Where the build differs from the text below, it says so here:
>
> - **§ 3a's fix as built** (`collapseOffer`, shared/starterChange.ts): one
>   offer per (row, field) / (assembly, part); the offer is about the NEWEST
>   change and is gone once that is answered; the shop's value counts as
>   "BidRidge's" when it equals ANY value the starter held since the copy
>   (first change's old value, or an earlier change's new one), so neither
>   an earlier Ignore nor an earlier Accept makes it read own-value.
>   `baselineVersion` only marks where the copy started; Accept never moves
>   it.
> - **§ 2.6 as suggested:** the tag rides in the change's value,
>   `{"v": …, "example": …}`; price tagged only above $0, hours while any
>   is set, rates always (`exampleTagAfter`). `seedProposal` now reports a
>   person's change "live ahead" before its tag-split hold; LIFTING that hold
>   for `starterDrift --apply` stays A's.
> - **Updates is ONE view on Materials, Assemblies and Labor rates**
>   (`?view=updates`), showing every kind with the screen's own first: run
>   types and modifiers have no library screen, so a per-screen filter would
>   have hidden them. The tab shows only while there are updates. The
>   Dashboard card links to Materials → Updates.
> - **Labor rates are NOT editable on the admin screen yet**: a rate is
>   base wage × (1 + burden), stored as both, and a one-field change would
>   leave the rate disagreeing with its breakdown. Needs a two-field batch
>   (wage + rate) — next.
> - **Undo restores a $0 price** (found by eye): the above-zero rule is for
>   new values; an undo puts back what the row held.
> - **No `starter_accepted` price-history row**: nothing writes
>   `material_price_history` yet.
> - Files: `server/starterOffers.ts`, `server/routers/starterOffersRouter.ts`,
>   `starterLibraryRouter` (previewEdit / applyEdit / changeLog / undoBatch),
>   `client/src/components/library/StarterUpdates*.tsx`,
>   `client/src/pages/starter/StarterEditing.tsx`,
>   `client/src/lib/starterUpdates.ts`, `starterEdit.ts`,
>   `hooks/useRefreshStarterOffers.ts`.

---

## 0. Decisions this builds on (searched before writing; none re-opened)

| Decision                                                                                                                  | Where                                                                                     | Used for           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| The owner's rule: never change a shop's prices, hours, items or bids; existing shops get OFFERS, new shops get the latest | `baseline-screen-plan.md` § 0                                                             | the whole plan     |
| Pin, then change, then offer; "new shops get the latest" needs no code                                                    | same, § 2; `server/starterChanges.ts`                                                     | §§ 2, 4            |
| Field kinds: `offer` / `everyone` / `unit` / `not-editable`                                                               | same, § 3; `shared/starterChange.ts` `STARTER_FIELDS`                                     | which edits pin    |
| Names are offers (Q17); finding fields reach everyone (Q21)                                                               | same, § 12                                                                                | admin edit preview |
| "Accept all" never takes a shop's own value (Q18)                                                                         | same, § 12; `acceptAllTakes`                                                              | Updates tab        |
| Accept warns "N draft bids use this and will re-count"                                                                    | same, § 10a.5 (owner-approved)                                                            | § 2.4              |
| Sent bids lock quantities (Q15) and freeze settings (Q16) when they leave Draft                                           | built: `server/bidProtection.ts` `leaveDraft`                                             | "sent never moves" |
| The log is append-only; undo is a new change that becomes its own offer                                                   | same, § 10a.1 #6, #14                                                                     | change log tab     |
| A start no longer rewrites starter numbers; the seed proposes and a person confirms                                       | `boot-seed-plan.md` §§ 2–3 (built `d38f5930`)                                             | prerequisite       |
| Example tag travels with its number ("companion"), written by `applyStarterChange`                                        | `track-c-handoff.md` "QUEUED — do NOT build yet"; `boot-seed-plan.md` § 3.1 "Gap, for C"  | § 2.6              |
| An accepted starter price is recorded as `starter_accepted`                                                               | `price-history-plan.md` (PH-M1 = 0163)                                                    | § 2.4              |
| Counts and screens: the offer count and the offer list share one query and one invalidation helper                        | CLAUDE.md § "A test that calls the server cannot see a screen showing yesterday's answer" | § 3c               |
| Never nag toward the library                                                                                              | CLAUDE.md § "As manual or as automated as the user wants"                                 | Q3                 |

---

## 1. What exists, measured by reading

**Built:**

- `applyStarterChange` (C, `server/starterChanges.ts`): refuse, skip same
  value, pin (`pinCompanies`), change, bump `version`, log, one
  transaction; `undoStarterChange`, `undoStarterBatch`, `pinsOf`,
  `changesFor`.
- Pure offer helpers (C, `shared/starterChange.ts`): `offerBucket`
  (`offer` / `own-value` / `nothing`), `acceptAllTakes`.
- Company edits clear the pin flag (`unpinOnEdit`, `server/db.ts` ~1479,
  used by the material, labor-rate, modifier, assembly and run-type
  updates).
- Forks record `baselineVersion` = the shared row's version at fork time
  (`server/db.ts` ~2109 and siblings).
- The admin side (B): `/starter` sign-in and the READ-ONLY screen
  (`client/src/pages/starter/StarterScreen.tsx`,
  `server/routers/starterLibraryRouter.ts`, every route
  `starterEditorProcedure`).
- Bid protection (A/C): `leaveDraft` locks quantities and freezes
  settings; `bids.mathVersion` (0148).
- Tables: `starter_change_batches` / `starter_changes` (0152),
  `starter_change_pins` (0153), `isPinnedCopy` / `hiddenAt` /
  `replacedById` (0154), `companies.starterSeenAt` /
  `starter_offer_answers` (0155), `material_price_history` (0163, local
  and staging).

**Not built:** the offer READ for a shop, Accept / Ignore / un-ignore, the
draft re-count count, the Example-tag companion, any admin route that
WRITES, the admin edit UI and change log, and every shop-side screen
(Dashboard count, Updates tabs).

---

## 2. The flow, end to end

### 2.1 The admin edits one starter row

On the baseline screen (Materials / Assemblies / Labor rates / Run types),
a row's editable fields become inline edits, with `STARTER_FIELDS` deciding
what each one is:

- **`offer`** (price, hours, rate, raceway facts, name, recipe parts…):
  Save opens a **preview**: "Old → New. Pins **N** shops that don't have
  their own copy yet; offers it to **M** shops. New shops get it straight
  away." Counts only, never names (plan § 4). Confirm calls
  `applyStarterChange({ source: "screen", editorUserId, changes: [one] })`.
- **`everyone`** (search words, shelf, description, sort order): the
  preview says "Reaches every shop now. Changes no number." No pins.
- **`unit`** and **`not-editable`**: not editable on the screen at all; the
  field reads as plain text, with "Units never change — add a new item"
  where it's a unit (plan § 3).

**One edit = one batch** (Q5 below). The screen never writes a shared row
any other way; `applyStarterChange` is the only door, as plan § 10a.3 says.

### 2.2 What happens to each kind of shop

| Shop                                            | What it sees after the admin's Confirm                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Has no copy of the item** (the usual case)    | A **pin** is made first, holding today's values, so nothing changes for them. An offer appears. |
| **Has its own edited copy**                     | Nothing changes. The offer appears under "You changed this" (own-value), never in Accept all.   |
| **Has a copy that already holds the new value** | Nothing. No offer (bucket `nothing`).                                                           |
| **Created after the change**                    | Reads the shared row, so it **has the new value directly**. No pin, no offer, no code.          |

### 2.3 The shop sees the offer

- **Dashboard:** a card, "**N starter updates available** · Review", shown
  only while N > 0, to roles that can accept (Q1). Not on any bid screen
  (Q3).
- **Updates tab** on Materials, Assemblies, Labor rates and Run types: one
  row per offer, showing the item, the field, **yours → BidRidge's new**, the
  date, and **Accept** / **Ignore**. Above the list: **Accept all (N)**. Own-value
  rows sit in a section of their own, "You changed these — BidRidge has a
  new value", each with its own Accept and no Accept all. An "Ignored (N)"
  fold lets a shop un-ignore.
- **Several changes to one field show as ONE row**: yours → the latest (§ 3a,
  Q4).

### 2.4 Accept, and what moves

Accept (C's server function) writes the change's new value into the shop's
copy, plus its Example tag (§ 2.6), records an `accepted` answer, and, for a
price, a `material_price_history` row `starter_accepted` (when that door is
built). `isPinnedCopy` stays as it was.

**What moves, and what never does:**

- **Lines already on any bid: never.** Price, hours, rate, markup and
  modifier are frozen per line (plan § 9a). Accept changes the shop's NEXT
  lines.
- **Sent bids (Active / Won / Lost) and any locked bid: never.**
  `leaveDraft` locked their quantities and froze their settings, and their
  lines are frozen anyway.
- **Unlocked Drafts: only fields Drafts read live, and only after Accept.**
  Those are raceway facts, run-type parts / waste / fittings, and an
  assembly's mounting height (plan § 9 F1). Before Accept, the shop's
  pinned copy holds the old value, so its Drafts don't move.
- **So Accept warns first, and only when it will move something:** "**3
  draft bids use this and will re-count.**" A price or hours offer shows no
  warning, because no Draft re-counts on it. The rule deciding which fields
  re-count is one pure function, `recountsDrafts(table, field)`, tested
  against `STARTER_FIELDS` so a new field can't skip the decision.

### 2.5 Ignore, un-ignore, undo

- **Ignore** writes an `ignored` answer. Un-ignore deletes it (plan §
  10a.1 #13).
- **A newer change to the same field after an Ignore is a new offer** (Q7).
- **Admin undo** is a new change (append-only log). A shop that accepted is
  offered the undo; a shop that ignored sees nothing (plan § 10a.1 #14).
  The collapse in § 3a gives exactly this without special cases.

### 2.6 The Example tag goes with the number (C's queued rule)

When a change sets a price, labor hours, a rate or assembly hours,
`applyStarterChange` writes the matching tag (`isExamplePrice`,
`isExampleLaborHours`, `isExampleRate`, `isExampleHours`) **in the same
change, never as its own**. Accept writes it to the shop's copy with the
number. Pins already copy the tags as they are.

**How it's stored is C's call; the suggestion:** carry the tag inside the
change row's value, `{"v": "0.5500", "example": true}`, rather than as a
second `starter_changes` row. A second row would show up as its own offer
("Example tag: off → on"), which means nothing to a shop and could be
accepted without its number. `sameStarterValue` keeps comparing `v` only.

---

## 3. Fix in the spec before building (for C)

### 3a. An Accept can silently drop an older, unanswered change — collapse per field

Plan § 10a.3 lists a shop's candidate offers as "changes whose `version` is
above the copy's `baselineVersion`, with no answer", and Accept "raises its
`baselineVersion` to the change's `version`". **`baselineVersion` is one
number per ROW, but changes are per FIELD.** Worked case:

1. The admin changes a material's **price** (version 4 → 5), then its
   **hours** (5 → 6). The shop's pin is at version 4.
2. The shop accepts **hours** only. Its `baselineVersion` becomes 6.
3. The price change is version 5, which is no longer above 6. **It
   vanishes from the list without being accepted or ignored**, and the
   shop keeps the old price believing it saw everything.

A second fault from the same root: two changes to ONE field (price 0.48 →
0.52, later 0.52 → 0.55). A shop still at 0.48 compares against the second
change's old value (0.52), so `offerBucket` calls it **own-value**, as if
the shop had typed a price, when it never touched it.

**Fix:**

- Read offers **per (row, field)**, or per (assembly, part) for recipes.
  Take the changes after the copy's fork version, in order. The **base** is
  the old value of the FIRST of them (what the starter held when the copy was
  made); the **offer** is the new value of the LAST.
- Bucket with `offerBucket({ oldValue: base, newValue: latest,
companyValue })`.
- An answer row is written for **every change it covers**, so the answer
  survives and the next new change starts a new offer.
- **Stop using `baselineVersion` to hide offers.** Keep it as "the version
  this copy was made from" and leave it alone on Accept, or advance it only
  to the highest version with no unanswered change left before it. C
  decides which; the tests in § 6 decide whether it's right.

### 3b. A recipe offer is per part, never a whole recipe

`part_add` / `part_remove` / `part_field` are already one change per part
(plan § 10a.1 #4). The Updates row reads "Add 1 × _Wire connector, red_ to
_Duplex receptacle_" (or Remove, or "qty 2 → 3"). Accept edits the shop's
own copy of the assembly: an ordinary fork edit.

### 3c. One count, one list, one refresh

The Dashboard's N and the Updates list must come from the **same server
function** (the count is the list's length, not a second query), and every
Accept, Ignore and un-ignore invalidates through **one** helper
(`refreshStarterOffers`) that covers the count, every Updates tab and the
library lists. That's CLAUDE.md's stale-count rule; the check is by eye in §
7, because the server tests cannot see a cache.

### 3d. Who may answer

`starter_offer_answers.answeredByUserId` is the person;
`companyOwnerUserId` is the shop (`ctx.scope.dataUserId`). Accept and Ignore
change the shop's library for everyone in it, so the routes need a role gate
(Q1). Reading the count can be open to every member.

---

## 4. Build steps, in order, and who builds each

**Prerequisite (owner/A, no code):** local-dev's boot change (`d38f5930`)
and 0152–0156 are merged into `track-b` and `track-c` before any WRITE path
is wired. C's own header says it: a start before the boot change would write
the seed back over a logged change.

| #   | Step                                                                                                                                                                                                                                              | Who                                        | Depends on                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| 1   | **Example-tag companion** in `applyStarterChange` (§ 2.6), and `boot-seed-plan.md`'s `--apply` stops refusing a proposal whose tag differs                                                                                                        | **C** (+ A updates `starterDrift --apply`) | boot change merged into track-c |
| 2   | **Offer read** `starterOffersFor(companyOwnerUserId)`, collapsed per field (§ 3a), with buckets; **Accept one / Accept all / Ignore / un-ignore**; `recountsDrafts` and the draft count; `starter_accepted` price history when the door exists    | **C**                                      | 1                               |
| 3   | **Admin write routes**: `starterLibrary.previewEdit` (counts: shops to pin, shops offered) and `starterLibrary.applyEdit` (calls step 1's function), `changeLog`, `undoChange`, `undoBatch` (preview, then confirm). All `starterEditorProcedure` | **B** (thin routers over C's functions)    | 1                               |
| 4   | **Admin edit UI** on `StarterScreen`: inline edits by field kind, the preview dialog, a **Change log** tab with Undo                                                                                                                              | **B**                                      | 3                               |
| 5   | **Shop routes**: `starterOffers.count`, `.list`, `.accept`, `.acceptAll`, `.ignore`, `.unignore`, role-gated (Q1), scoped by `dataUserId`                                                                                                         | **B** (routers) over **C** (step 2)        | 2                               |
| 6   | **Shop UI**: Dashboard card, Updates tabs on Materials / Assemblies / Labor rates / Run types, the Accept re-count warning, `refreshStarterOffers`                                                                                                | **B**                                      | 5                               |
| 7   | **Release** (§ 5)                                                                                                                                                                                                                                 | **A**                                      | 1–6                             |

**Later, not in this plan** (plan § 11 order 6–7, unchanged): hide with
replacement and its offer, Add with the "New" badge (`starterSeenAt`), "My
changes", sheet upload, Copy from my company, and the seed proposal on the
screen ("Seed file proposes 37 changes: Review", which reads A's
`seedProposal`).

### Who does what, in one table

> **Superseded 2026-10-14 (owner):** B builds steps 1–6, C's rows included;
> C stays on catalog reviews. A's row is unchanged. The table below is the
> original split, kept so the reassignment is visible.

| Track | Work                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **No migration**: every table exists (0152–0155, 0163). Release ordering (§ 5); `starterDrift --apply` once the companion exists; confirm with `scripts/schemaDrift.mts` that live has 0152–0156 before step 3's code ships. |
| **C** | Steps 1–2: the companion tag, the offer read with § 3a's collapse, Accept/Ignore, `recountsDrafts`, and the number tests.                                                                                                    |
| **B** | Steps 3–6: admin routes and UI, shop routes and UI, the one refresh helper, every by-eye check.                                                                                                                              |

---

## 5. Release order (A)

1. **0152–0156 on live** (additive, step 1). Live is at 152 today.
2. **The boot change live**, alone (A's plan § 5). After this, a deploy
   can't touch the starter.
3. **This code.** Nothing calls the write path until the starter editor
   signs in and saves, so the deploy itself moves nothing.
4. **Proof:** `scripts/bidTotals.mts` before and after the deploy, identical
   for every bid. Then, on staging, one real edit → Accept on a fixture shop
   → Drafts using a re-counting field move, every other bid identical.

Step 3 of the three-step migration rule is empty: there is no backfill.

---

## 6. Test plan — each one must fail with its guard removed

**C (server, `bidrender_test_*`):**

1. **New shop gets it directly:** a shop created after a change reads the
   new value and has **0** offers.
2. **Existing shop is pinned and offered:** reads the OLD value after the
   change; has 1 offer, bucket `offer`.
3. **Own value:** a shop that edited the field gets bucket `own-value`, and
   `acceptAll` doesn't take it.
4. **§ 3a, two fields:** price change then hours change; accept hours only
   → **the price offer is still listed**. (Red on the spec as written.)
5. **§ 3a, one field twice:** 0.48 → 0.52 → 0.55; a shop at 0.48 sees ONE
   row, 0.48 → 0.55, bucket `offer` (not own-value). (Red on the spec as
   written.)
6. **Undo:** a shop that accepted is offered the undo; one that ignored
   sees nothing; one that never answered sees nothing (its value already
   equals the undo's target).
7. **Example tag:** a price change sets `isExamplePrice` on the shared row;
   Accept sets it on the shop's copy; a shop edit still clears it; and the
   tag is never listed as an offer of its own.
8. **Bids:** a fixture shop with a Draft, an Active, a Won and a locked
   Draft, all using one run type. Change its raceway stick length and Accept:
   `bidTotals` shows **only the unlocked Draft moved**. Change the price of
   a material on all four bids' lines and Accept: **nothing moved** (lines
   are frozen).
9. **Before Accept nothing moves:** the same fixture, after the admin's
   change and before Accept: every bid identical.
10. **`recountsDrafts`** covers every `offer` field in `STARTER_FIELDS`
    (fails on an unclassified field), and the warning count equals the
    Drafts that actually moved in test 8.
11. **Scope:** Accept from shop A never writes shop B's copy, and a viewer
    role is refused (Q1).
12. **Failed Accept-all writes nothing** (one transaction).

**B (routers and pure client code):**

13. Every admin route refuses no session, a password-only session and a
    company login (as `server/starterLibrary.test.ts` does today).
14. `previewEdit`'s counts equal the pins `applyEdit` then makes.
15. Shop routes: `count` equals `list.length` for every fixture shop.

**Proof per release:** `bidTotals.mts` before and after; only Drafts may
move, and only after an Accept.

---

## 7. By eye (B), at laptop, iPad both ways, phone 375

- **Admin:** edit one price → the preview shows the counts → Confirm → the
  row and the Change log show it → Undo → back.
- **Shop, the stale-count check (CLAUDE.md):** look at the Dashboard's N →
  Accept one on Materials → go back: **N went down by one** without a reload.
  Then Accept all, Ignore and un-ignore, checking the number each time.
- **The re-count warning** shows on a raceway offer and not on a price offer.
- **A Draft's total** moves only after Accept; a Won bid's never.

---

## 8. Owner questions — ANSWERED 2026-10-14: all YES, as suggested

The owner accepted every suggested answer below as written. They are now
decisions; quote them, do not re-open them without saying why.

1. **Who in a shop can accept or ignore updates?** — Owner and admins only;
   estimators and viewers see the count, not the buttons.
2. **When a shop accepts a BidRidge price, does it say "Example price"
   again?** — Yes: it's BidRidge's number until the shop types its own.
3. **Where do updates show?** — The Dashboard card and an Updates tab on
   each library screen. Never on a bid screen, and no pop-ups.
4. **Several BidRidge changes to one item before a shop looks: one row or
   one per change?** — One row, yours → latest. The steps show on tap.
5. **An admin edit goes out on Confirm, one edit at a time?** — Yes, each
   Confirm is its own batch with Undo. Batching many edits comes with the
   sheet upload.
6. **Accept all includes changes that re-count Drafts?** — Yes, but its
   dialog states the total first: "This re-counts 3 draft bids."
7. **A shop ignored a change; BidRidge changes the same field again — offer
   it?** — Yes, a newer value is a new offer.
