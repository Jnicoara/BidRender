-- Which part a run-type bid line was sent with (bid_line_items.runMaterialId).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- One nullable column and a foreign key, then an UPDATE that fills ONLY that
-- new column — the 0055-filling-0054 shape, so it is still additive
-- (references/deploying.md § 5, question 1). No existing value changes
-- meaning. Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
--
-- ── Why a column ────────────────────────────────────────────────────────────
-- Send-again now swaps a fitting line to its type's CURRENT style and refills
-- a line that was sent unpriced (owner, 2026-09-26). Both need to know which
-- part the line holds. The line's name says it in words, and the markup
-- snapshot happens to record it, but neither is a place anything should be
-- READ from — so the send records it here.
ALTER TABLE `bid_line_items`
	ADD `runMaterialId` int,
	ADD CONSTRAINT `bid_line_items_runMaterialId_materials_id_fk` FOREIGN KEY (`runMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ── Backfill: lines sent before this column existed ─────────────────────────
-- A run-type line's send wrote the part's id into its markup snapshot as its
-- one part (`markupPartForMaterial(material, id)`), so it is recoverable
-- there. Only where that material still exists, so the foreign key holds;
-- anything else stays NULL, and the send leaves that line's part alone.
-- Guarded on NULL, so a second run changes nothing. Production had no bid
-- lines at all on 2026-09-26; this is for local and rehearsal copies.
UPDATE `bid_line_items` b
  JOIN `materials` m
    ON m.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(b.`snapshotMarkupSource`, '$.parts[0].materialId')) AS UNSIGNED)
   SET b.`runMaterialId` = m.`id`
 WHERE b.`takeoffRunTypeId` IS NOT NULL
   AND b.`runMaterialId` IS NULL
   AND JSON_EXTRACT(b.`snapshotMarkupSource`, '$.parts[0].materialId') IS NOT NULL
   AND JSON_TYPE(JSON_EXTRACT(b.`snapshotMarkupSource`, '$.parts[0].materialId')) <> 'NULL';
