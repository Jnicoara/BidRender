-- Give every run already traced the kind of run it is.
--
-- Hand-written, like 0032, 0035 and 0055, and like them it carries no snapshot:
-- it changes data rather than shape, so drizzle-kit has nothing to diff.
--
-- ── What it may say, and what it must not ───────────────────────────────────
-- A run today knows one thing about what it is: conduit or cable. So each user
-- gets ONE type per path type, labelled exactly that, and nothing else is
-- filled in. No size, no conductor count, no material — those are a
-- specification, and a specification nobody entered is not a fact about their
-- job. The same discipline as the mounting heights gate: a guess that looks
-- like the contractor's own number is worse than a blank, because a blank gets
-- filled in and a plausible number gets bid.
--
-- The half-defined type is not hidden, either. `racewayMaterialId IS NULL` is
-- what "this still needs a specification" looks like, readable exactly the way
-- `costPerUnit = 0` means "this material still needs a price" — one fact, read
-- directly, rather than a second flag that can drift out of step with it.
--
-- ── One type per USER, not per bid ──────────────────────────────────────────
-- The table is a library (0057). A contractor with runs across six bids gets
-- ONE "Conduit", not six — which is the whole reason the table is per-user and
-- the migration cost that decided it. Grouping by bid here would manufacture
-- exactly the duplicates the design exists to avoid, on the one day it is
-- cheap to avoid them.
--
-- ── Re-running this is safe, and that was TESTED rather than assumed ────────
-- Both statements are guarded so a second run changes nothing:
--
--   the INSERT skips any (user, path type) that already has a type
--   the UPDATE only touches runs with no type yet
--
-- **0055 says the equivalent guard was left out because "closing it means
-- reading `takeoff_groups` inside a statement that writes to it, which MySQL
-- handles badly".** That was an assumption and it is wrong on this server:
-- tested against the real database on 2026-09-18, the guarded INSERT below is
-- accepted and a second run inserts 0 rows. 0055 ran and stands as it is; this
-- file does not inherit its gap. (CLAUDE.md § "A number that can be measured
-- should not be asserted" — the same rule, applied to a behaviour.)
--
-- ── If it fails partway anyway ──────────────────────────────────────────────
-- Statement 1 alone: types created, no run attached. Re-run it — the guard
-- makes that a no-op and statement 2 then attaches everything. Nothing to
-- repair by hand.
-- Statement 2 alone: cannot leave a half state that a re-run does not finish,
-- for the same reason.
-- Either way the WORST case is types that exist with no runs pointing at them,
-- which count nothing, price nothing and are one DELETE to remove:
--
--   DELETE FROM `takeoff_run_types`
--   WHERE `racewayMaterialId` IS NULL
--     AND `id` NOT IN (SELECT `runTypeId` FROM `takeoff_runs`
--                      WHERE `runTypeId` IS NOT NULL);

-- ── One type per user per path type, from what their runs already say ───────
INSERT INTO `takeoff_run_types` (`userId`, `label`, `pathType`)
SELECT `r`.`userId`,
	CASE `r`.`pathType` WHEN 'conduit' THEN 'Conduit' ELSE 'Cable' END,
	`r`.`pathType`
FROM `takeoff_runs` `r`
WHERE `r`.`runTypeId` IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM `takeoff_run_types` `t`
		WHERE `t`.`userId` = `r`.`userId` AND `t`.`pathType` = `r`.`pathType`
	)
GROUP BY `r`.`userId`, `r`.`pathType`;
--> statement-breakpoint

-- ── Attach every run, and snapshot the label it was traced under ────────────
-- Both columns together: the link is what a rename follows, the label is what
-- survives the link being gone. See 0058 on why a copy that chases the live
-- value stops being a fallback.
UPDATE `takeoff_runs` `r`
JOIN `takeoff_run_types` `t`
	ON `t`.`userId` = `r`.`userId`
	AND `t`.`pathType` = `r`.`pathType`
SET `r`.`runTypeId` = `t`.`id`,
	`r`.`runTypeLabel` = `t`.`label`
WHERE `r`.`runTypeId` IS NULL;
