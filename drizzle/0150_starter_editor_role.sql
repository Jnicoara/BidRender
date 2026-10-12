-- 0150 — THE STARTER EDITOR ROLE: the master account that edits the shipped
-- starter (2026-10-12; Track C's BS-M1, references/baseline-screen-plan.md
-- § 1 and § 10, owner Q1/Q2/Q12). Track A owns the number.
--
--   users.role   gains 'starter_editor', appended at the END so every stored
--                value keeps its meaning. Only scripts/createStarterEditor.mts
--                writes it; signup cannot, and no route sets users.role.
--
-- ── ADDITIVE. STEP 1. MUST RUN BEFORE THE CODE ──────────────────────────────
-- `drizzle/schema.ts` declares the value. An enum widened at the end changes
-- no existing row and no number. Step 3 is EMPTY: no account is made by a
-- migration.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
ALTER TABLE `users` MODIFY COLUMN `role`
  enum('user','admin','contractor','starter_editor') NOT NULL DEFAULT 'user';
