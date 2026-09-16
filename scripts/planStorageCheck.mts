/**
 * Look inside the R2 plan bucket from this machine.
 *
 * The point is to be able to answer "did the file actually land in R2?" with
 * the bucket's own words rather than with the app's, which is the only way to
 * tell a working upload from a convincing-looking one.
 *
 * Reads only. Nothing here writes, deletes or touches the backup bucket — it
 * uses the R2_PLANS_* credentials, lent by loadPlansEnv.mts, which are scoped
 * to the plan bucket alone.
 *
 * Usage:
 *   pnpm r2:ls                     # everything, newest last
 *   pnpm r2:ls bid-plans/          # just one prefix
 */
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { loadPlansEnv } from "./loadPlansEnv.mjs";

const plans = loadPlansEnv();
const bucket = plans.R2_PLANS_BUCKET!;
const endpoint =
  plans.R2_PLANS_ENDPOINT ||
  `https://${plans.R2_PLANS_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const prefix = process.argv[2] ?? "";

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: plans.R2_PLANS_ACCESS_KEY_ID!,
    secretAccessKey: plans.R2_PLANS_SECRET_ACCESS_KEY!,
  },
});

function human(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

const rows: { key: string; size: number; modified: Date }[] = [];
let token: string | undefined;

do {
  const page = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      ContinuationToken: token,
    })
  );
  for (const object of page.Contents ?? []) {
    if (!object.Key) continue;
    rows.push({
      key: object.Key,
      size: object.Size ?? 0,
      modified: object.LastModified ?? new Date(0),
    });
  }
  token = page.NextContinuationToken;
} while (token);

rows.sort((a, b) => a.modified.getTime() - b.modified.getTime());

console.log(
  `r2://${bucket}/${prefix} — ${rows.length} file${rows.length === 1 ? "" : "s"}\n`
);
for (const row of rows) {
  console.log(
    `  ${row.modified.toISOString()}  ${human(row.size).padStart(9)}  ${row.key}`
  );
}
if (rows.length === 0) console.log("  (nothing stored here yet)");
