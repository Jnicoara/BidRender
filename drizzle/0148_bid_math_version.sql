-- 0148 — MATH VERSION PER BID: a release that changes the math reaches only
-- Drafts (2026-10-12; Track C's BS-M7, references/baseline-screen-plan.md
-- § 8 and § 10, owner Q14 and Q22). Track A owns the number.
--
--   bids.mathVersion   which math this bid prices by. NULL = version 0, the
--                      math before this system — every bid today.
--   bid_math_changes   one row per Draft whose total moved when it was
--                      brought to a newer version: from, to, both totals, the
--                      registry's reason; seenAt = the "Total changed
--                      because…" strip was dismissed.
--
-- ── ADDITIVE. STEP 1. MUST RUN BEFORE THE CODE ──────────────────────────────
-- `drizzle/schema.ts` declares both, so every bare select() of bids asks for
-- `mathVersion`. One nullable column, no default, and a new table; no UPDATE,
-- no number moves. Step 3 is EMPTY on purpose: no bid is stamped by a
-- migration. New bids get the current version from the code, and existing
-- Drafts are moved by `scripts/applyMathVersion.mts`, a release step that is
-- dry-run first (plan § 8 item 4).
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
ALTER TABLE `bids` ADD `mathVersion` int NULL;
--> statement-breakpoint
CREATE TABLE `bid_math_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`fromVersion` int NULL,
	`toVersion` int NOT NULL,
	`totalBefore` decimal(14,4) NOT NULL,
	`totalAfter` decimal(14,4) NOT NULL,
	`reason` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`seenAt` timestamp NULL,
	CONSTRAINT `bid_math_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_math_changes_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_math_changes_bidId_idx` ON `bid_math_changes` (`bidId`);
