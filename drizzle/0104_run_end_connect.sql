-- Whether a run END's wall connection was confirmed by the estimator
-- (migrations-0098-batch-plan.md § S, Batch 1b; Track B, todo.md "the CONNECT
-- POINT columns", connect-point-plan.md § 9 Q3).
--
-- Since 2026-10-01 a run meets a wall device at the wall found in the drawing
-- (shared/connectPoint.ts). These two columns let the estimator mark such an
-- end as CHECKED:
--   NULL        not answered — the end counts and is shown, as today
--   'found'     the app found the wall and nobody has looked
--   'confirmed' the estimator checked it
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Two nullable columns, no default, no UPDATE: every existing run keeps the
-- one meaning it has (NULL). Old code ignores them. Neither moves a number —
-- a run's length comes from its points, whichever value these hold.
--
-- One ALTER, one statement. Hand-written, not generated (see 0065, 0067).
ALTER TABLE `takeoff_runs`
	ADD `startConnect` enum('found','confirmed'),
	ADD `endConnect` enum('found','confirmed');
