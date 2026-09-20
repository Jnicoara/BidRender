-- Let a kind of run say what its ground is, as well as how many.
--
-- One statement, like 0054: the column, its foreign key and the count go in a
-- single ALTER because MySQL applies them together or not at all, which is the
-- property the one-statement rule is really after.
--
-- ── Two columns, because they answer different questions ────────────────────
-- `groundMaterialId` is WHICH wire — a #12 bare copper rather than the #12
-- THHN the phases are pulled in. `groundCount` is HOW MANY, which is one on
-- almost every circuit and two on an isolated-ground one.
--
-- The material lives on the TYPE and the count is inherited by a circuit that
-- may then differ, which is § 2.0's division of ownership: the type owns what a
-- run IS, the run owns what it carries. § 2.1 is emphatic that the app must
-- never decide how many conductors are in somebody's pipe, and that applies to
-- the ground exactly as it applies to the phases.
--
-- ── `set null` on delete, like every other provenance link here ─────────────
-- Retiring a material must not change what a traced run says it is (0058). A
-- type whose ground material has been deleted still names a ground count, still
-- prices its conduit and its phase conductors, and reads as needing a
-- specification for the one link that went — which is exactly what
-- `racewayMaterialId IS NULL` already means one column over.
--
-- ── NULL is "not yet said", and 0064 depends on it ──────────────────────────
-- Same reasoning as 0061, and the same guard: `groundCount IS NULL` is what
-- makes the backfill re-runnable and what keeps an un-split type neutral. A
-- type is not given a ground by this file.
ALTER TABLE `takeoff_run_types`
	ADD `groundMaterialId` int,
	ADD `groundCount` int,
	ADD CONSTRAINT `takeoff_run_types_groundMaterialId_materials_id_fk` FOREIGN KEY (`groundMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
