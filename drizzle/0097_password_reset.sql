-- Password reset by email, and a way to end every old session
-- (references/stage-4-safety-plan.md, piece 1; owner's answers 2026-09-29).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- One new table and one new NULLABLE column with no default. No UPDATE, so
-- step 3 is empty. Old code never reads either: it selects the users columns
-- it knows about, and nothing it runs touches the new table.
--
-- ── users.sessionsValidAfter ────────────────────────────────────────────────
-- A session token issued before this moment is refused (server/_core/sdk.ts).
-- NULL means no reset or password change has happened since this column
-- existed, and every session is judged as before — which is why it has no
-- default: a DEFAULT of now() would sign out every user on the day it ran.
--
-- ── password_reset_tokens ───────────────────────────────────────────────────
-- The token itself is never stored: `tokenHash` is its SHA-256, the same rule
-- as company invite codes. `usedAt` makes a token single-use — it is claimed
-- with one conditional UPDATE (… WHERE usedAt IS NULL AND expiresAt > now), so
-- two requests racing on one link cannot both succeed. Deleting the user
-- takes their tokens with them.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` char(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_tokenHash_uq` UNIQUE(`tokenHash`),
	CONSTRAINT `password_reset_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `password_reset_tokens_userId_idx` ON `password_reset_tokens` (`userId`);
--> statement-breakpoint
ALTER TABLE `users` ADD `sessionsValidAfter` timestamp;
