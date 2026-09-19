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
-- ── Every statement is re-runnable ──────────────────────────────────────────
-- Each is gated on `groupId IS NULL`, so a second run over a finished table
-- touches nothing. The inserts run before the updates that clear that flag, so
-- a failure BETWEEN them would leave groups made and marks unattached, and a
-- re-run would make the groups a second time. That is the one gap here, and it
-- is left open on purpose: closing it means reading `takeoff_groups` inside a
-- statement that writes to it, which MySQL handles badly, and the repair is one
-- DELETE of the duplicate rows rather than anything lost. A group with no marks
-- counts nothing and prices nothing.
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
SELECT `bidId`, `userId`, MIN(`assemblyName`), 'assembly', `assemblyId`
FROM `takeoff_stamps`
WHERE `groupId` IS NULL AND `assemblyId` IS NOT NULL
GROUP BY `bidId`, `userId`, `assemblyId`;
--> statement-breakpoint

-- ── Pass 2: orphans, keyed by the name they kept ────────────────────────────
INSERT INTO `takeoff_groups` (`bidId`, `userId`, `label`, `kind`, `assemblyId`)
SELECT `bidId`, `userId`, `assemblyName`, 'assembly', NULL
FROM `takeoff_stamps`
WHERE `groupId` IS NULL AND `assemblyId` IS NULL
GROUP BY `bidId`, `userId`, `assemblyName`;
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
