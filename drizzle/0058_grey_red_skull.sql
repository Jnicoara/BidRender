-- Point each traced run at the kind of run it is.
--
-- One statement — see 0053. The two columns, the foreign key and the index go
-- in a single ALTER because MySQL applies them together or not at all, which
-- is the property the one-statement rule is actually after. drizzle-kit
-- generated four statements; they are folded by hand.
--
-- ── Both columns are NULLABLE, and they stay that way ───────────────────────
-- 0059 fills them for runs already traced, and after that a new run gets both
-- at trace time. They stay nullable anyway: a run traced before the palette
-- existed and never revisited is a legitimate state, not a broken row, and the
-- readers already handle it — the run falls back to its own name exactly as it
-- does today. Tightening the column later would be a third migration enforcing
-- something the code guarantees.
--
-- ── SET NULL, not CASCADE, and this is the one place it really matters ──────
-- A run's `points` are measured work that somebody traced by hand across a
-- drawing. Losing the specification is recoverable — retype it. Losing the
-- footage is not. So deleting a type strips the link and leaves the run, which
-- is the opposite of the rule on `takeoff_stamps.groupId`, where deleting the
-- group IS deleting the count and the marks are worth nothing without it.
--
-- Retiring is the intended path regardless: `takeoff_run_types.status`
-- withdraws a type from every picker while everything pointing at it still
-- resolves. This is the backstop for when somebody deletes one anyway.
--
-- ── Why a label as well as a link ───────────────────────────────────────────
-- `runTypeLabel` is the FALLBACK, read only when the link is gone. While the
-- link resolves, the live label wins — which is what makes renaming a type
-- propagate to every run still following it. Written at trace time and never
-- updated afterwards: the moment it chases the live value it stops being a
-- fallback and becomes a second copy that can disagree with the first.
--
-- Same two-step as the counted marks (`stampName` in
-- shared/takeoffCounts.ts), and it is what makes "what was this before I
-- retired the type?" an answerable question.
--
-- ── Nothing on screen changes when this runs ────────────────────────────────
-- Every existing run reads exactly as it did: two empty columns, and no code
-- reading them yet.
ALTER TABLE `takeoff_runs`
	ADD `runTypeId` int,
	ADD `runTypeLabel` varchar(255),
	ADD CONSTRAINT `takeoff_runs_runTypeId_takeoff_run_types_id_fk` FOREIGN KEY (`runTypeId`) REFERENCES `takeoff_run_types`(`id`) ON DELETE set null ON UPDATE no action,
	ADD INDEX `takeoff_runs_runTypeId_idx` (`runTypeId`);
