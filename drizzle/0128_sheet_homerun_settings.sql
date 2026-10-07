-- A sheet's (an AREA's) override of the bid's homerun method (Track C,
-- homerun-footage-plan.md § 4; todo.md → "On bid_pdf_sheets"). NULL = follow
-- the bid. The area's ceiling is NOT asked again: it is
-- `bid_pdf_sheets.distributionHeightInches` (0109).
--
-- ── ADDITIVE. STEP 1 ─────────────────────────────────────────────────────────
-- A second ALTER on bid_pdf_sheets after 0109 — a different release, so two
-- files on purpose (one ALTER per table per release).
-- Pairing rule: as 0125. Hand-written, not generated.
ALTER TABLE `bid_pdf_sheets` ADD `homerunMethod` varchar(16), ADD `homerunAverageFt` decimal(8,2), ADD `homerunMinimumFt` decimal(8,2);
