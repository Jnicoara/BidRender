-- Give every mark already on a drawing the group it should have had.
--
-- Hand-written, like 0032 and 0035, and like them it carries no snapshot: it
-- changes data rather than shape, so drizzle-kit has nothing to diff.
--
-- ── What "the same counted thing" means for a mark placed before groups ──────
-- Exactly what the counter meant by it, so the panel reads the same before and
-- after: the ASSEMBLY where there is one, and the NAME where there is not.
-- Hence two passes rather than one. Grouping both together on `assemblyId`
-- would collapse every orphan on a bid — every mark whose library assembly has
-- since been deleted — into a single meaningless row, because in SQL one NULL
-- does not equal another. See groupStamps in shared/takeoffCounts.ts.
--
-- ── Every statement is re-runnable, and the guard below is why ──────────────
-- Each is gated on `groupId IS NULL`, so a second run over a finished table
-- touches nothing. The inserts run before the updates that clear that flag, so
-- a failure BETWEEN them would leave groups made and marks unattached — and
-- without a guard, a re-run would make those groups a SECOND time.
--
-- **This file originally left that gap open, on the stated grounds that
-- closing it "means reading `takeoff_groups` inside a statement that writes to
-- it, which MySQL handles badly". That was an assumption and it is wrong on
-- this server.** Tested against the real database on 2026-09-18 while writing
-- 0059: the guarded INSERT is accepted, and running this whole file twice in
-- one transaction touches 3 rows then 0. (A first attempt at that measurement
-- read the first run's 3 rows as a duplication and was wrong — they were two
-- test-fixture marks being backfilled correctly. Measuring the wrong thing
-- twice is how an assumption survives being checked.)
--
-- So the guard is here, added BEFORE production ever ran this file. Local had
-- already applied the unguarded version; that is harmless, because the guard
-- only changes what a SECOND run does and both versions produce the same end
-- state on a first one. Drizzle never compares a file's contents against what a
-- database ran (references/deploying.md § 5).
--
-- The worst case is now only: groups that exist with no marks pointing at them,
-- which count nothing and price nothing. One DELETE removes them:
--
--   DELETE FROM `takeoff_groups`
--   WHERE `id` NOT IN (SELECT `groupId` FROM `takeoff_stamps`
--                     WHERE `groupId` IS NOT NULL);
--
-- ── Order matters against 0056 ──────────────────────────────────────────────
-- This runs while `assemblyName` is still NOT NULL, so every label below is a
-- real string. 0056 relaxes the column afterwards, for the counts that have no
-- assembly at all.

-- ── Pass 1: marks that still know which assembly they placed ────────────────
-- MIN(assemblyName) because one assembly can have been renamed between drops,
-- leaving two snapshots of the same id. Either is honest; picking one
-- deterministically means a re-run cannot produce a different answer.
INSERT INTO `takeoff_groups` (`bidId`, `userId`, `label`, `kind`, `assemblyId`)
SELECT `s`.`bidId`, `s`.`userId`, MIN(`s`.`assemblyName`), 'assembly', `s`.`assemblyId`
FROM `takeoff_stamps` `s`
WHERE `s`.`groupId` IS NULL AND `s`.`assemblyId` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM `takeoff_groups` `g`
		WHERE `g`.`bidId` = `s`.`bidId` AND `g`.`assemblyId` = `s`.`assemblyId`
	)
GROUP BY `s`.`bidId`, `s`.`userId`, `s`.`assemblyId`;
--> statement-breakpoint

-- ── Pass 2: orphans, keyed by the name they kept ────────────────────────────
INSERT INTO `takeoff_groups` (`bidId`, `userId`, `label`, `kind`, `assemblyId`)
SELECT `s`.`bidId`, `s`.`userId`, `s`.`assemblyName`, 'assembly', NULL
FROM `takeoff_stamps` `s`
WHERE `s`.`groupId` IS NULL AND `s`.`assemblyId` IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM `takeoff_groups` `g`
		WHERE `g`.`bidId` = `s`.`bidId`
			AND `g`.`assemblyId` IS NULL
			AND `g`.`label` = `s`.`assemblyName`
	)
GROUP BY `s`.`bidId`, `s`.`userId`, `s`.`assemblyName`;
--> statement-breakpoint

-- ── Attach the marks: assembly-backed ───────────────────────────────────────
UPDATE `takeoff_stamps` `s`
JOIN `takeoff_groups` `g`
	ON `g`.`bidId` = `s`.`bidId`
	AND `g`.`userId` = `s`.`userId`
	AND `g`.`assemblyId` = `s`.`assemblyId`
SET `s`.`groupId` = `g`.`id`
WHERE `s`.`groupId` IS NULL AND `s`.`assemblyId` IS NOT NULL;
--> statement-breakpoint

-- ── Attach the marks: orphans ───────────────────────────────────────────────
UPDATE `takeoff_stamps` `s`
JOIN `takeoff_groups` `g`
	ON `g`.`bidId` = `s`.`bidId`
	AND `g`.`userId` = `s`.`userId`
	AND `g`.`assemblyId` IS NULL
	AND `g`.`label` = `s`.`assemblyName`
SET `s`.`groupId` = `g`.`id`
WHERE `s`.`groupId` IS NULL AND `s`.`assemblyId` IS NULL;
