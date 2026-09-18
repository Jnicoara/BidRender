-- The distribution height: the elevation a company's raceway actually runs at.
--
-- ONE STATEMENT PER FILE, and that is deliberate across 0046–0052.
--
-- MySQL cannot undo a table change, and drizzle records a migration only when
-- the WHOLE file has succeeded. A file of six statements that dies on the
-- fourth therefore leaves three changes made, nothing recorded, and a re-run
-- that fails on "Duplicate column" — which has to be untangled by hand, on
-- production, at whatever hour it happened. One statement per file means a
-- failure can only mean "that statement failed and nothing was applied", and
-- running again resumes exactly there.
--
-- So the foreign key is INLINE in the CREATE TABLE rather than a second
-- statement after it. drizzle-kit does not generate it this way; the file was
-- edited by hand afterwards, which is safe — drizzle never compares a file's
-- contents against what a database ran (see references/deploying.md § 5) — and
-- the constraint NAMES are drizzle's own, unchanged, because a rename here
-- would make a fresh database disagree with an existing one.
--
-- This table ships EMPTY, and no row means the gate is shut: no vertical is
-- counted anywhere until a company enters this number. An existing bid reads
-- exactly as it did before the migration.
CREATE TABLE `takeoff_height_defaults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`distributionHeightInches` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_height_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_height_defaults_user_uq` UNIQUE(`userId`),
	CONSTRAINT `takeoff_height_defaults_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
