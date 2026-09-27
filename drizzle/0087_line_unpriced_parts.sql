-- How many of an assembly's parts were $0 when a bid line was added
-- (todo.md, "A $0 part inside an assembly that has LABOR is not flagged").
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- One nullable int, no default, no UPDATE. NULL means "added before this
-- column", and the code reads NULL by looking at the assembly's recipe as it
-- is now — which is what the screen could have said before, so no existing
-- line changes meaning. Old code ignores the column; new code against an old
-- database would die on a bare select(). CLAUDE.md § "THREE STEPS, NOT TWO".
-- Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
--
-- ── Why NULL rather than DEFAULT 0 ──────────────────────────────────────────
-- 0 is an answer: "every part had a price". A default would stamp that onto
-- every existing line, including the lug assemblies this exists for, and
-- "not yet counted" would become indistinguishable from "counted, none".
ALTER TABLE `bid_line_items`
	ADD `snapshotUnpricedParts` int;
