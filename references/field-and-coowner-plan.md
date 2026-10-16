# Field and Co-owner roles — PLAN, then build (Track B, 2026-10-16)

Owner, 2026-10-16: _"PLAN then BUILD 'Field' role (sees plans + counts, NO
prices anywhere incl. print/CSV/API) and 'Co-owner' role. Migrations:
throwaway DB only, SQL drafts for A in track-a-handoff.md. Test that a Field
user can't get a price through any route."_

Builds on `todo.md` § "Two more roles — BEFORE BILLING" (owner, 2026-10-10),
which named the hard parts: `bids.view` carries money, so the money must be
split out ON THE SERVER, never hidden in the client; and every row is filed
under one owner's user id (`server/_core/companyScope.ts`).

## 0. What exists (read from the code)

- Roles `owner > admin > estimator > viewer` (`shared/permissions.ts`),
  stored on `company_members.role` and `company_invites.role`
  (`COMPANY_ROLE_VALUES`, `drizzle/schema.ts`). A role maps to a list of
  capabilities; `scoped(view, edit)` gates a whole router (queries need
  `view`, mutations `edit`), `requireCapability` gates one route.
- Every Plans router is `scoped("bids.view", "bids.edit")`. `bids.view`
  returns line costs and totals, so a viewer sees money today.
- `companyRouter.setRole` / `setStatus`: never to or from `owner` (that is a
  transfer, not built), never on someone at or above your rank, never
  yourself.

## 1. Field — the rule is FAIL CLOSED

**A Field member holds ONE capability, `plans.view`, and nothing else.**
Every route in the app already demands some capability (`bids.view`,
`library.view`, `pricing.view`…), so a Field member is refused everywhere
by construction. Only routes opened to `plans.view` on purpose are
reachable, and each of those is checked for money. A route added later is
closed to Field until somebody opens it.

Every existing role also gets `plans.view`, so opening a route to it takes
nothing from anyone.

**What `plans.view` opens (reads only):** the plan sets and sheets (list,
sheet names and numbers, page text search, schedule pages, the signed
viewer link), marks per sheet, counts by NAME and quantity
(`takeoffGroups.list` without money), traced runs and their footage, run
colours, heights, homeruns, and the materials list (`materialsList.get`,
already money-free and tested so). Two new reads replace money-carrying
ones: `bids.fieldList` (a job's name, address, status and date — no total)
and `bids.basics` (what the Plans header needs — no price).

**What it never reaches:** bid totals and lines, proposals and print,
the takeoff export's priced columns (already gated on `pricing.view`), the
library (it carries costs), labor rates, settings, analytics, clients,
the AI plan reader (it spends the company's money), the counted-items
"send to bid" bridge (it carries prices).

**The guard (`server/fieldNoPrices.test.ts`):** walk EVERY procedure in
`appRouter` as a Field member. Each must refuse (FORBIDDEN) unless it is on
the test's allow-list; every allow-listed read is called against a bid
priced with the test's own odd prices, and its answer must contain none of
them and no money-named field. A new route therefore fails the test until
somebody refuses it or adds it to the list with its answer checked.

Non-tRPC routes: `/manus-storage/…` serves only stored files (plans,
logos — no prices); `/api/scheduled/*` take the cron secret; nothing else
serves data. Checked by listing every `app.get/post/use` in `server/`.

**Field decisions taken (defaults, change any):**

- **F1 View only.** A Field member cannot place, move or delete a mark.
  "Sees plans + counts" is read as seeing. → morning question Q-F1.
- **F2 The job list shows** the bid's name, site address, status and date.
  Not the client's name or contact (that is `clients.view`).
- **F3 Lands on** the job list; a job opens on its Plans; the materials
  list is one button there. No dashboard, library, settings or analytics
  in the nav.
- **F4 Counts show names and quantities**, the assembly's name included
  (it says what to install), never its cost.

## 2. Co-owner

**Every capability, like the owner.** The data stays filed under the ONE
owner's id (`companies.ownerUserId`); a co-owner is a role, not a second
filing id — two filing ids would split the company's rows in two. That is
why the owner row cannot simply be duplicated.

**Rank:** `owner > coowner > admin > estimator > viewer > field`.

- A co-owner can do everything an owner does inside the app, and can act
  on admins and below (role, suspend).
- **Nobody below the owner can act on the owner** (unchanged), and a
  co-owner cannot act on another co-owner (equal rank — the same rule that
  stops an admin demoting an admin).
- **The owner can change or suspend a co-owner** — someone has to be able
  to, when a co-owner leaves. → Q-C1.
- **Made by `setRole` on an existing member, never by invitation**: an
  invite that mints an owner-level member is the escalation path
  `INVITABLE_ROLES` exists to close. Only the owner or a co-owner can make
  one.
- **Billing, cancelling the company, transferring ownership:** none is
  built; when billing lands these are owner-only until decided. → Q-C2,
  Q-C3.

## 3. Migration (draft for A, tested on a throwaway DB)

Additive, step 1: the new values are APPENDED to the enums, so every
existing row keeps its value and its stored index.

```sql
-- FR-M1  two more company roles: co-owner, field
ALTER TABLE `company_members` MODIFY `role`
  enum('owner','admin','estimator','viewer','coowner','field')
  NOT NULL DEFAULT 'estimator';
ALTER TABLE `company_invites` MODIFY `role`
  enum('owner','admin','estimator','viewer','coowner','field')
  NOT NULL DEFAULT 'estimator';
```

`COMPANY_ROLE_VALUES` in `drizzle/schema.ts` gains the two, appended, in
the same commit. Rank is code (`COMPANY_ROLES` order), not the enum order.

## 4. Build order

1. `plans.view`, the two roles' capabilities, rank — pure, tested
   (`shared/permissions.ts`). The two roles are `PLANNED_ROLES` until the
   column holds them.
2. Plans reads opened to `plans.view`; `bids.fieldList`, `bids.basics`.
3. The all-routes guard test.
4. Screens: Field's nav, job list, a read-only Plans with no money query
   sent; co-owner in the Crew page's role picker. Looked at on a throwaway
   DB carrying FR-M1, at laptop / iPad / phone.
5. After A applies FR-M1: the two roles move into `COMPANY_ROLES`, the
   Crew page offers them, and the guard test uses a real Field row.

## 5. Built 2026-10-16 (Track B, track-b) — what was found on the way

- **The walk works as designed.** Before any route was opened, a Field
  member reached 41 procedures, every one of them sign-in, who-am-I,
  onboarding flags or the starter editor's own login — no bid data. Each is
  on the test's list with its reason.
- **Proved red twice:** opening the run types' router to `plans.view` made
  two unlisted routes reachable (half 1 red); opening `bids.get` produced
  117 money findings (half 2 red).
- **Two background WRITES the Plans screen sent on open** — making sheet
  rows and detecting a scale — were refused for a Field member. Both now
  wait for `bids.edit`, which also stops a viewer sending them.
- **A viewer's Plans screen used to show every tool** and refuse each one
  on use. `marksFrozen` (locked OR cannot edit) now gates every tool; the
  words that say "locked" still read the lock itself.
- **Non-tRPC routes:** the plan upload POST already demands `bids.edit`
  (`server/planUpload.ts`); the rest serve stored files, the cron jobs,
  version and health.
- The Plans header reads `bids.basics` for every role now, not `bids.get`:
  it needed the name, and `bids.get` carries every price on the bid.
