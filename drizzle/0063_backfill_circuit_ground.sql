-- Take the ground out of the conductor count, without changing the wire.
--
-- Hand-written, like 0055 and 0059, and like them it carries no snapshot: it
-- changes data rather than shape, so drizzle-kit has nothing to diff.
--
-- ── THE ONE PROPERTY THIS FILE HAS TO HAVE: IT MOVES NO FOOTAGE ─────────────
-- A circuit stored as 3 becomes 2 insulated and 1 ground. That is still three
-- pieces of wire the same length, so every run, every total, every materials
-- list and every bid comes to exactly what it came to before this ran. The
-- change is what the numbers MEAN, not what they COME TO.
--
-- It starts to matter only when somebody gives the ground its own size, which
-- they have to ask for. `shared/takeoffQuantities.ts` states the rule the other
-- way round and is where it is enforced: THE GROUND IS THE SAME WIRE AS THE
-- CONDUCTORS UNTIL YOU SAY OTHERWISE.
--
-- ── The property, stated the way it is actually true ───────────────────────
-- **Given code that reads `groundCount`, there is no state of this migration
-- in which a bid moves** — not applied, half applied, or applied twice. 0061
-- adds the column as NULL rather than defaulting it, and
-- `shared/takeoffQuantities.ts` treats an absent ground as ZERO, so an
-- un-split row keeps the old meaning and comes to exactly the footage it came
-- to yesterday. That is what makes this safe to run on a live database in the
-- middle of a working day: the failure mode of a botched run is a stale
-- description, not a wrong total.
--
-- **The qualifier is not decoration, and it was learned the expensive way.**
-- An earlier draft of this file claimed the property without it. Applying this
-- migration locally took a bid's wire from 125.01 ft to 83.34 ft, because
-- three routers hand-mapped a circuit row and so dropped the ground the moment
-- it left the conductor count. 0061 carries the full account; `circuitWire` is
-- the fix.
--
-- **THE CODE SHIPS BEFORE THIS RUNS.**
--
-- The test that this is true is not in this file and could not be: it is
-- server/takeoffMath.test.ts § "counting the ground separately", where a
-- circuit written as 2 + 1 is asserted to come to the same footage as one
-- written as 3. Written FIRST, before any of the code, at the estimator's
-- instruction, because it checks the migration rather than the arithmetic.
--
-- ── The judgement this makes, and that the data cannot support ─────────────
-- For a row storing 3, the app cannot know whether that meant "2 and a ground"
-- or "3 ungrounded conductors". It assumes a ground, because that is what the
-- column documented — `takeoff_run_circuits.conductorCount` said "INCLUDING
-- the ground" and the shipped types were built that way — and because under
-- the neutrality rule above, assuming wrong costs nothing until somebody sizes
-- a ground differently, by which point they are looking at the run.
--
-- Decided by the estimator on 2026-09-20, having been shown the alternative.
--
-- ── The floor, and why it is 2 and not 1 ───────────────────────────────────
-- A circuit storing 1 is one conductor. Decrementing it would leave zero
-- insulated conductors and a ground, which is not a circuit anybody entered.
-- It is left alone, with no ground, and reads as exactly what it says.
--
-- ── Re-runnable for ever, not merely today ─────────────────────────────────
-- `groundCount IS NULL` is a state no row written after 0061 can return to:
-- the app always sets it, and this statement sets it. So a second run finds
-- nothing, and — the case a `DEFAULT 0` would have got wrong — a circuit
-- somebody later enters as three ungrounded conductors is never touched,
-- because its ground count is 0 rather than NULL.
UPDATE `takeoff_run_circuits`
SET `conductorCount` = `conductorCount` - 1,
	`groundCount` = 1
WHERE `groundCount` IS NULL AND `conductorCount` >= 2;
--> statement-breakpoint

-- A single-conductor circuit keeps its conductor and gets no ground, so that
-- "not yet split" stops being true of it too and the guard above stays honest.
UPDATE `takeoff_run_circuits`
SET `groundCount` = 0
WHERE `groundCount` IS NULL;
