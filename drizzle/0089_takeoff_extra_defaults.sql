-- A company's extra and makeup settings for traced runs
-- (references/track-b-held-migrations-plan.md § 1 and § 5; plan-viewer-overhaul
-- § 5j, R7, T16).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- One new table, every value column nullable, no UPDATE. The table starts
-- EMPTY: no row is "no company setting", which is what every company has
-- today. Old code ignores it; new code against an old database would die on a
-- bare select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. The CREATE
-- TABLE names its collation, per deploying.md § "A new table lands on the
-- WRONG collation".
--
-- ── Why every value is NULL, and why acceptedAt ─────────────────────────────
-- NULL is "not set", which falls through to the starter figure — and a starter
-- applies NOTHING until `acceptedAt` is stamped (CLAUDE.md § Starter content,
-- amended 2026-09-25; owner Q1, 2026-09-28). A default here would be a
-- percentage nobody chose, applied to every bid.
CREATE TABLE `takeoff_extra_defaults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conduitExtraPct` decimal(6,4),
	`wireExtraPct` decimal(6,4),
	`makeupDeviceInches` int,
	`makeupPanelInches` int,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_extra_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_extra_defaults_user_uq` UNIQUE(`userId`),
	CONSTRAINT `takeoff_extra_defaults_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
