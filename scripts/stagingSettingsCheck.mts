/**
 * Check `staging-app-settings.txt` BEFORE it is pasted into App Platform.
 *
 *   pnpm tsx scripts/stagingSettingsCheck.mts
 *
 * references/deploying.md § 11. Prints what each check found, never a value.
 *
 * What it proves, each by trying rather than by reading the text:
 *
 *   - the certificate setting, read exactly as the app reads it
 *     (`mysqlConnection`), verifies the real database — over the PUBLIC host,
 *     since this laptop is not on the VPC; the app uses `private-`;
 *   - the plans key can write, read and delete a probe object in
 *     `bidrender-plans-staging`;
 *   - the same key is REFUSED on the live plans bucket and the backup bucket.
 *     A key that could reach either would let staging touch live plans or the
 *     backups — the exact thing a separate staging bucket exists to prevent.
 *
 * The probe object is deleted afterwards. The live buckets are only LISTED,
 * never written, so a wrongly-scoped key still changes nothing there.
 */
import { readFileSync } from "node:fs";
import { parse as parseEnv } from "dotenv";
import mysql from "mysql2/promise";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mysqlConnection } from "../server/databaseConnection";

const LIVE_BUCKETS = ["bidrender-plans", "bidsoftware"];
const STAGING_BUCKET = "bidrender-plans-staging";

const settings = parseEnv(readFileSync("staging-app-settings.txt"));
let failures = 0;
const ok = (msg: string) => console.log(`ok    ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`FAIL  ${msg}`);
};

// ── The certificate, as the app will read it ────────────────────────────────
{
  const privateUrl = new URL(settings.DATABASE_URL);
  const publicUrl = new URL(settings.DATABASE_URL);
  publicUrl.hostname = privateUrl.hostname.replace(/^private-/, "");
  if (!privateUrl.hostname.startsWith("private-"))
    fail("DATABASE_URL does not use the private- host");
  else ok("DATABASE_URL uses the private- host");
  if (settings.DATABASE_CA_CERT.includes("\n"))
    fail("DATABASE_CA_CERT spans several lines — it must be ONE line");
  try {
    const db = await mysql.createConnection(
      mysqlConnection(publicUrl.toString(), {
        DATABASE_CA_CERT: settings.DATABASE_CA_CERT,
      } as NodeJS.ProcessEnv)
    );
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      "SELECT DATABASE() AS db"
    );
    await db.end();
    ok(`certificate verifies the database, connected to ${rows[0].db}`);
  } catch (error) {
    fail(
      `database connection with these settings: ${(error as { code?: string }).code ?? (error as Error).message}`
    );
  }
}

// ── The plans key ────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: "auto",
  endpoint: settings.R2_PLANS_ENDPOINT,
  credentials: {
    accessKeyId: settings.R2_PLANS_ACCESS_KEY_ID,
    secretAccessKey: settings.R2_PLANS_SECRET_ACCESS_KEY,
  },
});

if (settings.R2_PLANS_BUCKET !== STAGING_BUCKET) {
  fail(`R2_PLANS_BUCKET is not ${STAGING_BUCKET}`);
} else {
  ok(`R2_PLANS_BUCKET is ${STAGING_BUCKET}`);
}

const probeKey = `staging-settings-check/${Date.now()}.txt`;
try {
  await s3.send(
    new PutObjectCommand({
      Bucket: STAGING_BUCKET,
      Key: probeKey,
      Body: "staging settings check",
      ContentType: "text/plain",
    })
  );
  const got = await s3.send(
    new GetObjectCommand({ Bucket: STAGING_BUCKET, Key: probeKey })
  );
  const body = await got.Body?.transformToString();
  await s3.send(
    new DeleteObjectCommand({ Bucket: STAGING_BUCKET, Key: probeKey })
  );
  if (body === "staging settings check")
    ok(`key can write, read and delete in ${STAGING_BUCKET}`);
  else fail(`read back something else from ${STAGING_BUCKET}`);
} catch (error) {
  fail(
    `key on ${STAGING_BUCKET}: ${(error as { name?: string }).name ?? (error as Error).message}`
  );
}

for (const bucket of LIVE_BUCKETS) {
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    fail(`key was ALLOWED to list ${bucket}`);
  } catch (error) {
    const name = (error as { name?: string }).name ?? "error";
    ok(`key refused on ${bucket} (${name})`);
  }
}

// ── The bucket's CORS rule, as a browser on the staging site meets it ───────
// Added 2026-09-27: the first staging rule allowed only PUT (copied from
// deploying.md § 9, which described uploads and forgot viewing). Uploads
// worked; opening a plan failed with "Failed to fetch", because the viewer
// GETs byte ranges straight from the bucket. So check VIEWING, not just
// uploading — with a real signed range request, the way pdf.js makes one.
const STAGING_ORIGIN = "https://staging.bidridge.com";
const objectUrl = `${settings.R2_PLANS_ENDPOINT.replace(/\/+$/, "")}/${STAGING_BUCKET}/cors-probe.pdf`;

async function preflight(origin: string, method: string, headers?: string) {
  const res = await fetch(objectUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      ...(headers ? { "Access-Control-Request-Headers": headers } : {}),
    },
  });
  return res.headers.get("access-control-allow-origin") === origin;
}

for (const [method, headers] of [
  ["GET", "range"],
  ["HEAD", "range"],
  ["PUT", "content-type"],
] as const) {
  if (await preflight(STAGING_ORIGIN, method, headers))
    ok(`browser on staging may ${method} (${headers})`);
  else
    fail(`bucket refuses a ${method} with ${headers} from ${STAGING_ORIGIN}`);
}
for (const stranger of ["https://bidridge.com", "https://evil.example"]) {
  if (await preflight(stranger, "GET", "range"))
    fail(`bucket lets ${stranger} read staging plans`);
  else ok(`bucket refuses ${stranger}`);
}

// A real ranged read, signed the way the app signs viewer links, and the
// response headers the viewer must be able to see.
const rangeKey = `staging-settings-check/${Date.now()}-range.pdf`;
try {
  await s3.send(
    new PutObjectCommand({
      Bucket: STAGING_BUCKET,
      Key: rangeKey,
      Body: "0123456789abcdefghij",
      ContentType: "application/pdf",
    })
  );
  const signed = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: STAGING_BUCKET, Key: rangeKey }),
    { expiresIn: 60 }
  );
  const res = await fetch(signed, {
    headers: { Origin: STAGING_ORIGIN, Range: "bytes=0-4" },
  });
  const exposed = (res.headers.get("access-control-expose-headers") ?? "")
    .toLowerCase()
    .split(/\s*,\s*/);
  if (res.status === 206 && (await res.text()) === "01234")
    ok("signed range read returns just the piece asked for (206)");
  else fail(`signed range read answered ${res.status}`);
  if (res.headers.get("access-control-allow-origin") === STAGING_ORIGIN)
    ok("the range response is readable by the staging site");
  else fail("the range response carries no CORS allow-origin for staging");
  for (const header of ["accept-ranges", "content-range", "etag"]) {
    if (exposed.includes(header)) ok(`the browser can read ${header}`);
    else fail(`${header} is not exposed — add it to ExposeHeaders`);
  }
} catch (error) {
  fail(`signed range read: ${(error as Error).message}`);
} finally {
  await s3
    .send(new DeleteObjectCommand({ Bucket: STAGING_BUCKET, Key: rangeKey }))
    .catch(() => {});
}

if (failures > 0) {
  console.log(
    `\n${failures} check(s) FAILED — do not paste these settings yet.`
  );
  process.exit(1);
}
console.log(
  "\nThe staging settings work, and the key reaches only the staging bucket."
);
