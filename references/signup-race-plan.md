# Signup race — one company per new account

Track A, 2026-10-14 (night run). Background: `track-a-handoff.md` session 43
— live user 3036 got companies #4–#8 in one second.

## 1. The code fix — BUILT on `track-a-night` (not on local-dev or live)

`createPersonalCompany` (`server/_core/companyScope.ts`) now runs under a
MySQL named lock per user (`personal-company:<userId>`, 10 s) and asks "does
this user have any membership?" again INSIDE the lock. The first request
creates the company; every request queued behind it finds the membership and
creates nothing. Company and membership go in one transaction.

The lock helper is new: `withNamedLock` in `server/db.ts`. Unlike
`withSeedLock`, the work runs **on the connection that holds the lock**. That
matters under a burst: every waiter sits on its own pooled connection, so
ten waiters fill the pool (mysql2 default 10), and a holder that needed a
second connection for its insert would wait behind its own waiters until
they timed out.

On lock timeout nothing is created and the request returns whatever
membership exists — none means `resolveScope` fails closed (FORBIDDEN) and
the next request tries again. It never creates without the lock.

The old duplicate-key catch is gone: no key could ever collide, which was
the bug. It comes back with § 2, where a key finally can.

**Proof** (`bidrender_test_localdev`, 2026-10-14):

| Check                                                                                                    | Result                            |
| -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `server/personalCompanyRace.test.ts` — 12 parallel first requests (> pool)                               | green, 5 runs of 5                |
| Same test with the lock removed (temporary edit, reverted)                                               | **red: 12 companies, expected 1** |
| New: a suspended member is still refused, never handed a new company                                     | green                             |
| `seedLock`, `permissions`, `starterEditorLogin`, `starterEditorPure`, `scopeDiscipline`, `sourceHygiene` | 113 / 113 green                   |
| `pnpm check`                                                                                             | clean                             |

**Deploy kind:** code only, no migration. Safe on its own. During the
rolling deploy an old instance does not take the lock, so the race is closed
only once the old build is gone (minutes, and a new signup must land in
exactly that window).

## 2. The database rule — DRAFTED, NOT APPLIED

`references/drafts/personal-company-unique.sql` — deliberately **not** in
`drizzle/` (`migrate.mts` would apply anything there). Give it the next free
number when the owner says go.

- Adds nullable `companies.personalOwnerUserId` with a UNIQUE index, so the
  database itself refuses a second personal company. NULLs never collide, so
  unmarked companies are unaffected.
- Backfill marks the LOWEST company id per owner. On live that marks #4 for
  user 3036 and leaves #5–#8 NULL, so the index **cannot fail** on the race's
  duplicates whether or not they are removed first. (The session-43 note
  said it "would fail on 3036's five rows" — true only for a backfill that
  marks every company.)
- **Kind: additive, step 1, step 3 empty.** The UPDATE fills only the column
  the file adds; old code never names it.

**Rehearsed** on a throwaway local schema (`CREATE TABLE … LIKE` from
`bidrender_test_localdev`, live's shape: one owner with five companies, one
with one; dropped after):

| Check                                                    | Result                              |
| -------------------------------------------------------- | ----------------------------------- |
| Apply                                                    | #4 and #9 marked, #5–#8 NULL        |
| Backfill re-run                                          | 0 rows affected                     |
| Second personal company for the same user                | refused, `ER_DUP_ENTRY`             |
| First personal company for a new user; an unmarked extra | accepted                            |
| The naive `WHERE id IN (SELECT … FROM companies)` form   | MySQL 1093, hence the derived table |

**Code that ships WITH it (not written — it names a column no database has
yet):** in `createPersonalCompany`, insert `personalOwnerUserId: user.id`,
and catch `ER_DUP_ENTRY` on that insert → re-read the membership. The lock
stays (it avoids the error path entirely in the common case); the index is
the forcing function for any future writer that forgets the lock. Add the
column to `drizzle/schema.ts` in the same commit as the migration.

**Open question for that day (not urgent):** an ownership transfer moves
`ownerUserId`, but the marker stays on the old owner. If that old owner later
has no membership at all, a lazy create would hit the index and they would
be refused (fail closed) rather than given a new company. Probably right;
decide when writing it.

## 3. Live repair — companies #5–#8 (owner's yes pending)

In `next-live-release-plan.md` § "Night prep 2026-10-14". Delete 4
membership rows + 4 company rows after a verified backup, guarded so each
delete only fires if the row still holds nothing.
