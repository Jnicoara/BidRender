-- Adds pricing_defaults.productivityPct only where it is still missing.
--
-- 0025 already adds this column; this file is a backfill for a database that
-- lacked it. It used to say `ADD COLUMN IF NOT EXISTS`, which TiDB accepts and
-- MySQL 8 refuses, so on a new MySQL database it stopped every migration after
-- it — and without the IF NOT EXISTS it would stop anyway, as a duplicate of
-- 0025. MySQL 8 has no conditional ADD COLUMN, so the check is done by hand:
-- look in information_schema, then run either the ALTER or a statement that
-- does nothing. Databases that ran the old wording never run this file again;
-- see server/migrationRun.ts.
SET @has_productivity_pct := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pricing_defaults' AND COLUMN_NAME = 'productivityPct');--> statement-breakpoint
SET @add_productivity_pct := IF(@has_productivity_pct = 0, 'ALTER TABLE `pricing_defaults` ADD COLUMN `productivityPct` decimal(6,4) DEFAULT ''0'' NOT NULL', 'DO 0');--> statement-breakpoint
PREPARE add_productivity_pct FROM @add_productivity_pct;--> statement-breakpoint
EXECUTE add_productivity_pct;--> statement-breakpoint
DEALLOCATE PREPARE add_productivity_pct;
