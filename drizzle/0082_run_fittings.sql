-- Fittings counted from the trace: couplings, connectors and straps
-- (shared/runFittings.ts).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Every change here is a new nullable column, or new values appended to an
-- enum. No UPDATE, no existing value changes meaning. Old code ignores the new
-- columns and never writes the new roles; new code against an old database
-- would die on a bare select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is
-- empty — the seed fills the raceway defaults on the first boot of the new
-- build, which is a catalog release (references/deploying.md § 5b).
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
--
-- ── materials: four raceway facts, all NULL-means-not-said ──────────────────
-- Stick length and how sticks join (coupling / belled / coupling_on_stick /
-- continuous), and the strap spacing and distance from a box. NULL rather than
-- a DEFAULT: the count reads NULL as "cannot count this, and says so", and a
-- default would put a plausible number on a custom raceway nobody measured.
ALTER TABLE `materials`
	ADD `stickLengthFeet` decimal(6,2),
	ADD `stickJoint` varchar(24),
	ADD `strapSpacingFeet` decimal(6,2),
	ADD `strapFromBoxFeet` decimal(6,2);
--> statement-breakpoint
-- ── takeoff_run_types: the style, and three optional named fittings ─────────
-- `set null` on every link, like the three material links 0048 added.
ALTER TABLE `takeoff_run_types`
	ADD `fittingStyle` varchar(24),
	ADD `couplingMaterialId` int,
	ADD `connectorMaterialId` int,
	ADD `strapMaterialId` int,
	ADD CONSTRAINT `takeoff_run_types_couplingMaterialId_materials_id_fk` FOREIGN KEY (`couplingMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_run_types_connectorMaterialId_materials_id_fk` FOREIGN KEY (`connectorMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_run_types_strapMaterialId_materials_id_fk` FOREIGN KEY (`strapMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ── bid_line_items: three more roles on a run-type line ─────────────────────
-- Appended at the END of the enum, so every stored value keeps its index and
-- MySQL can change it in place. The unique index from 0070 already covers the
-- new roles: one live line per type per role, fittings included.
ALTER TABLE `bid_line_items`
	MODIFY COLUMN `runMaterialRole` enum('raceway','conductor','ground','coupling','connector','strap');
