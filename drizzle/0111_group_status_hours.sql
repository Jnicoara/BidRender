-- The PER-BID override of 0110's remove/relocate hours, on the count
-- (owner Q2, remove-relocate-labor-plan.md: decimal(10,4) NULL, no default).
-- NULL = follow the assembly's hours.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
--
-- Hand-written, not generated.
ALTER TABLE `takeoff_groups` ADD `removeLaborHours` decimal(10,4), ADD `relocateLaborHours` decimal(10,4);
