-- The same split, on the palette a run is traced under.
--
-- Hand-written, no snapshot, same reasoning as 0063 — read that file first; it
-- carries the argument and this one only applies it to a second table.
--
-- ── Why this is its own file and not two statements in 0063 ────────────────
-- One statement per file, as 0046–0052 established. It also fails
-- independently, which matters here: the circuits are what the wire is
-- computed from, so 0063 landing without this one leaves every total correct
-- and only the palette's description stale.
--
-- ── Shipped rows are split here, and the seeder does NOT do it ─────────────
-- `server/seed/baselineRunTypes.ts` ships '1/2" EMT, 2 #12 + ground' with a
-- conductor count of 3, and after this runs it is 2 and a ground — which is
-- the first time the label and the specification agree with each other.
--
-- The seeder fills only NULL material links and has never written
-- `conductorCount` (server/db.ts), so there is exactly one owner of this
-- number and no chance of the two decrementing it twice. A database seeded
-- FRESH after this ships gets 2 and 1 from the seed file directly and is
-- skipped here, because its ground count is not NULL.
--
-- ── A user's fork is a user row and is split like any other ────────────────
-- A fork copied its conductor count from the shipped row it came from, under
-- the old meaning, so it needs the same treatment. It gets it: this touches
-- every row with a NULL ground count, shipped or not. The material link is
-- left alone — nothing here invents a ground wire, only the count of them.
UPDATE `takeoff_run_types`
SET `conductorCount` = `conductorCount` - 1,
	`groundCount` = 1
WHERE `groundCount` IS NULL AND `conductorCount` >= 2;
--> statement-breakpoint

-- Everything else: a type with one conductor, and a type that never named a
-- count at all. Both end up saying "no ground" rather than "not yet split", so
-- the guard above cannot catch them on a later run.
UPDATE `takeoff_run_types`
SET `groundCount` = 0
WHERE `groundCount` IS NULL;
