-- A brand variant's brand, as a real column — NOT `brandNote`, which is the
-- user's own note of what their supply house stocks (migrations-0098-batch-
-- plan.md § 3; CLAUDE.md § Brands: panels and breakers only).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- NULL = generic, which every row is today.
--
-- Hand-written, not generated.
ALTER TABLE `materials` ADD `brand` varchar(64);
