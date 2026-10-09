-- 0141 — whether AI calls are being REFUSED on this server (2026-10-09;
-- todo.md "A dead AI key must SAY so", references/deploying.md § 8a).
--
--   ai_service_status   ONE row, id 1. A fact about the server's Anthropic
--                       key, not about a company: no userId, never scoped.
--     refusedSince        the FIRST refusal of the current run (no key, or a
--                         key Anthropic answers 401/403); NULL = not refused
--                         now. The next call that works clears it.
--     lastRefusedAt       the most recent refusal.
--     lastRefusalReason   'no-key' | 'key-refused'. Never key text.
--     lastWorkedAt        the most recent call that worked.
--
-- The admin AI screen reads it to say "AI calls are being refused since
-- <time>", so the owner hears about a dead key before a user does.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes, no number moves (no bid reads it).
-- The new code writes it on every AI call, so it must exist before that code
-- starts. Old code ignores it.
--
-- Hand-written, not generated.
CREATE TABLE `ai_service_status` (
	`id` int NOT NULL,
	`refusedSince` timestamp NULL,
	`lastRefusedAt` timestamp NULL,
	`lastRefusalReason` varchar(20),
	`lastWorkedAt` timestamp NULL,
	CONSTRAINT `ai_service_status_id` PRIMARY KEY(`id`)
) COLLATE=utf8mb4_unicode_ci;
