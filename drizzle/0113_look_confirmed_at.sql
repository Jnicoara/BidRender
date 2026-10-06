-- When a look was first confirmed by hand, shared across browsers — today it
-- lives per browser in @/lib/trustedLooks (Track C handoff, 2026-10-06).
-- NULL = never confirmed.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Decides which finds are pre-trusted, never a quantity.
--
-- Hand-written, not generated.
ALTER TABLE `symbol_looks` ADD `confirmedAt` timestamp NULL;
