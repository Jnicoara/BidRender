-- 0151 — THE STARTER EDITOR'S SECOND STEP: an authenticator app (TOTP) and
-- ten recovery codes (2026-10-12; Track C's BS-M2, references/
-- baseline-screen-plan.md § 1 and § 10, owner Q1 authenticator app, Q2 QR
-- code). Track A owns the number.
--
--   starter_editor_factors         one row per starter editor.
--     totpSecretEnc    the authenticator secret, AES-256-GCM under
--                      STARTER_TOTP_KEY — never stored in the clear.
--     enrolledAt       NULL until the first code is accepted at sign-in.
--     lastUsedStep     the 30-second step of the last accepted code; a code
--                      from that step or earlier is refused (used once).
--     failedAttempts   wrong codes since the last right one; five lock it.
--     lockedUntil      no code is accepted before this.
--   starter_editor_recovery_codes  ten per account, shown once by the script.
--     codeHash         HMAC-SHA256 under STARTER_TOTP_KEY, never the code.
--     usedAt           a used code is refused.
--
-- ── ADDITIVE. STEP 1. MUST RUN BEFORE THE CODE ──────────────────────────────
-- Two new tables, two FKs to users. No UPDATE, no existing table changed, no
-- number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `starter_editor_factors` (
	`userId` int NOT NULL,
	`totpSecretEnc` varchar(255) NOT NULL,
	`enrolledAt` timestamp NULL,
	`lastUsedStep` bigint NULL,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_editor_factors_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `starter_editor_factors_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `starter_editor_recovery_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`codeHash` varchar(255) NOT NULL,
	`usedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_editor_recovery_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_editor_recovery_codes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `starter_editor_recovery_codes_userId_idx` ON `starter_editor_recovery_codes` (`userId`);
