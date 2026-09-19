-- The counted group: one row per thing being counted on one bid.
--
-- ONE STATEMENT PER FILE, as 0046–0052 established and for the same reason:
-- MySQL cannot undo a table change, and drizzle records a migration only when
-- the WHOLE file has succeeded. A file of thirteen statements that dies on the
-- ninth leaves eight changes made, nothing recorded, and a re-run that fails on
-- "Duplicate column" — untangled by hand, on production, at whatever hour it
-- happened. One statement per file means a failure can only mean "that
-- statement failed and nothing was applied".
--
-- drizzle-kit generated this change as thirteen statements in one file. It was
-- split by hand into 0053–0056, with the foreign keys and indexes folded INLINE
-- here. That is safe — drizzle never compares a file's contents against what a
-- database ran (references/deploying.md § 5) — and the constraint NAMES are
-- drizzle's own, unchanged, because a rename would make a fresh database
-- disagree with an existing one.
--
-- This table ships EMPTY and 0055 fills it from the marks already placed. Until
-- then nothing reads it, and an existing takeoff counts exactly as it did: the
-- counter falls back to the assembly snapshot on each mark, which is how every
-- count worked before this phase. See shared/takeoffCounts.ts.
--
-- Five foreign keys, and the split between them is deliberate. `bidId` and
-- `userId` CASCADE: a deleted bid takes its counts with it. `assemblyId`,
-- `materialId` and `laborRateId` SET NULL: they are provenance, and removing a
-- library row must never alter what a finished takeoff says it counted — the
-- label lives here, so the group stays readable with or without them.
-- ── COLLATE, spelled out, and it is not decoration ──────────────────────────
-- Every table in this schema is utf8mb4_unicode_ci, but the DATABASE default is
-- utf8mb4_0900_ai_ci — so a CREATE TABLE that says nothing lands on the other
-- one. That is invisible until a string column of a NEW table is compared with
-- a string column of an OLD one, at which point MySQL refuses outright:
--
--   ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations for operation '='
--
-- Which is exactly what 0055 does, joining `label` to `assemblyName`. It failed
-- on the first rehearsal against a real database and would have failed the same
-- way on production, mid-migration, with three statements already applied.
--
-- Four tables created before this one are already on the wrong side of that
-- line — ai_usage_daily, bid_mounting_heights, takeoff_height_defaults,
-- takeoff_mounting_heights. Nothing joins their strings to anything, so nothing
-- has broken yet. Naming the collation here makes this table match its
-- neighbours on any server, whatever that server's default happens to be.
CREATE TABLE `takeoff_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`kind` enum('plain','typed','material','assembly') NOT NULL DEFAULT 'plain',
	`assemblyId` int,
	`materialId` int,
	`unitCost` decimal(12,4),
	`unitHours` decimal(10,4),
	`laborRateId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_groups_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_groups_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_groups_assemblyId_assemblies_id_fk` FOREIGN KEY (`assemblyId`) REFERENCES `assemblies`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `takeoff_groups_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `takeoff_groups_laborRateId_labor_rates_id_fk` FOREIGN KEY (`laborRateId`) REFERENCES `labor_rates`(`id`) ON DELETE set null ON UPDATE no action,
	INDEX `takeoff_groups_bidId_idx` (`bidId`),
	INDEX `takeoff_groups_userId_idx` (`userId`)
) COLLATE=utf8mb4_unicode_ci;
