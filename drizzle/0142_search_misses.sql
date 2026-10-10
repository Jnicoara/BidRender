-- 0142 — the no-match search log (Track B, 2026-10-09;
-- references/track-b-handoff.md "(a) No-match search log").
--
--   search_misses   one row per search a company's picker found NOTHING for:
--                   the company (owner's user id), which picker, the words,
--                   the time. Never the person, the bid or a price.
--
-- The admin screen lists them, so the catalog grows from what estimators
-- actually looked for and did not find.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes, no number moves (no bid reads it).
-- The code survives the table being absent (it logs nothing and says so), so
-- either order is safe; the usual order is kept anyway.
--
-- Hand-written, not generated: SEARCH_MISSES_CREATE_SQL from Track B's
-- server/searchMissLog.ts, word for word, which server/searchMissLog.test.ts
-- builds in a scratch schema and compares with the declaration.
CREATE TABLE `search_misses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyUserId` int NOT NULL,
	`picker` varchar(16) NOT NULL,
	`words` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `search_misses_id` PRIMARY KEY(`id`),
	CONSTRAINT `search_misses_companyUserId_users_id_fk` FOREIGN KEY (`companyUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `search_misses_company_words_idx` ON `search_misses` (`companyUserId`,`picker`,`words`);
--> statement-breakpoint
CREATE INDEX `search_misses_createdAt_idx` ON `search_misses` (`createdAt`);
