/**
 * Prove a backup in R2 actually restores.
 *
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *   VERIFY_DATABASE_URL=mysql://root:pass@localhost:3306/mysql \
 *   pnpm tsx scripts/verifyBackup.mts [runId]
 *
 * Downloads what is really in the bucket, restores it into a scratch schema on
 * a server YOU name, and compares the result against the manifest that backup
 * wrote about itself.
 *
 * VERIFY_DATABASE_URL is required and deliberately separate from DATABASE_URL:
 * restoring a production backup on top of production is how a backup tool
 * becomes an outage. Point it at your local MySQL.
 */
import "dotenv/config";
import { readR2Config, REQUIRED_VARS } from "../server/backup/config";
import { assertWritableDatabase } from "./databaseGuard";
import { createR2Target } from "../server/backup/target";
import { verifyBackup, summariseVerify } from "../server/backup/verifyBackup";

const scratchUrl = process.env.VERIFY_DATABASE_URL?.trim();
if (!scratchUrl) {
  console.error(
    [
      "VERIFY_DATABASE_URL is not set.",
      "",
      "This is the server the backup is restored INTO, and it must not be the",
      "one being backed up. Point it at your local MySQL, e.g.",
      "",
      "  VERIFY_DATABASE_URL=mysql://root:password@localhost:3306/mysql",
    ].join("\n")
  );
  process.exit(1);
}

if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL.trim() === scratchUrl
) {
  console.error(
    "VERIFY_DATABASE_URL is the same as DATABASE_URL. Refusing: the restore\n" +
      "would run against the database being backed up."
  );
  process.exit(1);
}

/*
  This DROPs and CREATEs a scratch schema, so it is a write even though its
  purpose is to read. The existing refusal below catches the worst case —
  restoring onto the database being backed up — and this catches the wider one:
  any server that is not this machine.
*/
assertWritableDatabase(scratchUrl, {
  action: "restore a backup into a scratch schema",
});

const configResult = readR2Config();
if (!configResult.ok) {
  console.error(
    `Cloudflare R2 is not configured. Missing: ${configResult.missing.join(", ")}\n` +
      `Set all of: ${REQUIRED_VARS.join(", ")}`
  );
  process.exit(1);
}

const result = await verifyBackup({
  target: createR2Target(configResult.config),
  scratchDatabaseUrl: scratchUrl,
  runId: process.argv[2],
  onProgress: message => console.log(message),
});

console.log(`\n${summariseVerify(result)}`);
process.exit(result.ok ? 0 : 1);
