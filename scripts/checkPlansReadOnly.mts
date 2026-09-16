/**
 * Prove what the backup's plan-reading token can and cannot do.
 *
 * ── Why the negative checks are the point ────────────────────────────────────
 * "Object Read only, one bucket" is a claim made in a dashboard. The design of
 * the backup rests on it being true: it is the reason the backup holds a
 * credential that can see every contractor's plans at all. A token that was
 * accidentally created Read & Write, or scoped to all buckets, would work
 * perfectly and silently carry far more authority than intended.
 *
 * So this tries the things that must FAIL, and treats success at any of them
 * as the failure.
 *
 * Nothing here writes anything anywhere. Against the backup bucket it attempts
 * only a read — if a read-only token cannot read it, it certainly cannot write
 * it, and attempting a write to prove that would risk putting junk in the
 * backups if the scoping were wrong.
 *
 * Usage:  pnpm tsx scripts/checkPlansReadOnly.mts
 */
import { readFileSync } from "node:fs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ── Read what is needed, by name, and nothing else ──────────────────────────
const text = readFileSync(".env.production.local", "utf8");
const env: Record<string, string> = {};
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  const value = line
    .slice(eq + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  if (value) env[line.slice(0, eq).trim()] = value;
}

const endpointFor = (account: string, override?: string) =>
  override || `https://${account}.r2.cloudflarestorage.com`;

const PLANS_BUCKET = env.R2_PLANS_BUCKET!;
const BACKUP_BUCKET = env.R2_BUCKET!;

/** The token under test: meant to be Object Read only on the plan bucket. */
const readOnly = new S3Client({
  region: "auto",
  endpoint: endpointFor(env.R2_PLANS_ACCOUNT_ID!, env.R2_PLANS_ENDPOINT),
  credentials: {
    accessKeyId: env.R2_PLANS_READONLY_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_PLANS_READONLY_SECRET_ACCESS_KEY!,
  },
});

/** The app's own plans token, used only to put a probe object there to read. */
const readWrite = new S3Client({
  region: "auto",
  endpoint: endpointFor(env.R2_PLANS_ACCOUNT_ID!, env.R2_PLANS_ENDPOINT),
  credentials: {
    accessKeyId: env.R2_PLANS_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_PLANS_SECRET_ACCESS_KEY!,
  },
});

const PROBE_KEY = "__readonly-check/probe.txt";
const PROBE_BODY = "probe for the read-only token check";

let failures = 0;
const pass = (what: string) => console.log(`  PASS  ${what}`);
const fail = (what: string, detail = "") => {
  failures += 1;
  console.log(`  FAIL  ${what}${detail ? ` — ${detail}` : ""}`);
};

const reason = (e: unknown) => {
  const code = (e as { name?: string }).name;
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return `${code ?? "error"}${status ? ` (HTTP ${status})` : ""}`;
};

console.log(`\nplan bucket:   ${PLANS_BUCKET}`);
console.log(`backup bucket: ${BACKUP_BUCKET}\n`);

// ── Set up something to read ────────────────────────────────────────────────
await readWrite.send(
  new PutObjectCommand({
    Bucket: PLANS_BUCKET,
    Key: PROBE_KEY,
    Body: PROBE_BODY,
    ContentType: "text/plain",
  })
);
console.log("── what it MUST be able to do ──");

// 1. Read an object from the plan bucket.
try {
  const got = await readOnly.send(
    new GetObjectCommand({ Bucket: PLANS_BUCKET, Key: PROBE_KEY })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of got.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (body === PROBE_BODY) pass("read an object from the plan bucket");
  else fail("read an object from the plan bucket", "bytes did not match");
} catch (e) {
  fail("read an object from the plan bucket", reason(e));
}

// 2. List the plan bucket — the backup needs no listing, but a read token
//    normally has it and its absence would be worth knowing about.
try {
  await readOnly.send(
    new ListObjectsV2Command({ Bucket: PLANS_BUCKET, MaxKeys: 1 })
  );
  pass("list the plan bucket");
} catch (e) {
  console.log(
    `  note  cannot list the plan bucket (${reason(e)}) — harmless, the backup reads keys from the database`
  );
}

console.log("\n── what it MUST NOT be able to do ──");

// 3. Write to the plan bucket.
try {
  await readOnly.send(
    new PutObjectCommand({
      Bucket: PLANS_BUCKET,
      Key: "__readonly-check/should-never-exist.txt",
      Body: "if you can read this, the token is not read-only",
    })
  );
  fail(
    "write to the plan bucket",
    "THE WRITE SUCCEEDED — this token is not read-only. Delete it and create one with Object Read only."
  );
} catch (e) {
  pass(`write to the plan bucket is refused (${reason(e)})`);
}

// 4. Delete from the plan bucket.
try {
  await readOnly.send(
    new DeleteObjectCommand({ Bucket: PLANS_BUCKET, Key: PROBE_KEY })
  );
  fail(
    "delete from the plan bucket",
    "THE DELETE SUCCEEDED — this token can destroy plans. Replace it."
  );
} catch (e) {
  pass(`delete from the plan bucket is refused (${reason(e)})`);
}

// 5. Reach the backup bucket at all. A read attempt only — see the header.
try {
  await readOnly.send(
    new ListObjectsV2Command({ Bucket: BACKUP_BUCKET, MaxKeys: 1 })
  );
  fail(
    "list the backup bucket",
    "THIS TOKEN CAN SEE THE BACKUPS — it is not scoped to the plan bucket. Replace it."
  );
} catch (e) {
  pass(`the backup bucket is out of reach (${reason(e)})`);
}

// ── Tidy up the probe, with the token that put it there ─────────────────────
await readWrite.send(
  new DeleteObjectCommand({ Bucket: PLANS_BUCKET, Key: PROBE_KEY })
);
console.log("\nprobe object removed.");

console.log(
  failures === 0
    ? "\nAll checks passed: reads plans, cannot write them, cannot see backups.\n"
    : `\n${failures} check(s) FAILED — see above.\n`
);
process.exit(failures === 0 ? 0 : 1);
