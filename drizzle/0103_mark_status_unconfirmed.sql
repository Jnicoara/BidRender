-- `unconfirmed` on a mark's status (migrations-0098-batch-plan.md § S,
-- Batch 1b): a mark nobody has checked yet — placed by the AI reader or offered
-- by Find all matching. Never counted toward a quantity, and never a snap target
-- for a run (shared/markStatus.ts). Without it, telling an unchecked AI mark
-- apart from a real one needs a join through the reader's findings, and the
-- snap in legSnap.ts copies a misplaced mark's position into a run's length
-- (todo.md, WRONG-NUMBER RISK; connect-point-plan.md).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- No UPDATE. The value is appended at the END of the enum, so every stored
-- value keeps its index — and there are none to keep: 0098 added the column
-- days ago and nothing writes it yet, so every row is NULL (= new). The list
-- is 0098's, verbatim, plus the one value, and must match MARK_STATUSES in
-- drizzle/schema.ts exactly and in order (schemaCheck compares the whole list).
-- NULL stays allowed and there is still no default: NULL is "new".
--
-- Hand-written, not generated (see 0065, 0067).
ALTER TABLE `takeoff_stamps`
	MODIFY COLUMN `status` enum('new','existing','remove','relocate','unconfirmed');
