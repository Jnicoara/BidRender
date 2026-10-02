-- Per-mark columns for the marks batch (migrations-0098-batch-plan.md § S,
-- Batch 1): Track B's mark status and turning (track-b-count-pin-styles-plan.md
-- § 7 and § 12; connect-point-plan.md § 5.2), Track C's mark height and "Keep"
-- (check-my-marks-plan.md § 7 and § 10), and B's "remove ONE mark's drop"
-- (quote-app-panel-plan.md § H3).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Seven nullable columns, no default, no UPDATE. Every existing mark keeps the
-- one meaning it has today, because NULL is that meaning:
--   status             NULL = new (counted and priced, as every mark is now)
--   rotation, mirrored NULL = turning not known
--   mountHeightInches  NULL = follow the count's height. 0 is a REAL height (a
--                      floor box), so NULL and 0 must stay different — no
--                      DEFAULT 0 (CLAUDE.md § Editing fields, rule 6)
--   mountHeightSource  NULL = no override
--   checkAcceptedAt    NULL = never kept by a check
--   dropExcluded       NULL = follows the count's drop
-- Old code ignores them; new code against an old database would die on a bare
-- select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty: how a status
-- other than `new` is PRICED is a code change, and folding the "… - EXISTING TO
-- REMAIN" twin counts into `status` is a separate step-3 file, written only
-- after that code is live (§ R.9).
--
-- One ALTER, one statement: applied whole or not at all.
-- Hand-written, not generated, for the reason 0065 and 0067 give.
ALTER TABLE `takeoff_stamps`
	ADD `status` enum('new','existing','remove','relocate'),
	ADD `rotation` smallint,
	ADD `mirrored` boolean,
	ADD `mountHeightInches` decimal(7,2),
	ADD `mountHeightSource` enum('typed','read'),
	ADD `checkAcceptedAt` timestamp NULL,
	ADD `dropExcluded` boolean;
