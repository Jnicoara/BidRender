-- The bid-line role for a T conduit body at a branch tee
-- (references/materials-track-c-plan.md § 4). A bid line is keyed by run type
-- + role, so a run type with box tees AND body tees needs a second role: the
-- box tees keep `teeBox` (+ `teeCover`), the body tees take `teeBody`, which
-- has no cover line because the body row is priced with its cover and gasket.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- No UPDATE. The value is appended at the END of the enum, so every stored
-- value keeps its index, exactly like 0082, 0084 and 0085. Nothing writes
-- `teeBody` until the Track C wiring ships, and old code never will, so a
-- database that accepts one unused value is harmless. Step 3 is empty.
--
-- `teeBody` ONLY — the owner's answer, 2026-09-29. LL/LR/C at a pull point
-- (plan § 7, L5) get their own migration when somebody builds that feature.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. The list is
-- 0085's, verbatim, plus the one new value.
ALTER TABLE `bid_line_items`
	MODIFY COLUMN `runMaterialRole` enum('raceway','conductor','ground','coupling','connector','strap','elbow90','elbow45','fieldBend','lb','pullBox','teeBox','teeCover','teeBody');
