/**
 * List traced runs whose END may be a double-click stub that bought an elbow.
 *
 * READ-ONLY. Owner, 2026-09-29: flag old runs so they can be reviewed — never
 * change them. The rule is `stubsToReview` in shared/runBends.ts, the same one
 * the run card on the Plans screen uses, so this list and the screen agree.
 *
 * It also prints how LONG those short end segments are, because the review
 * threshold (STUB_REVIEW_POINTS) is a number that should come from data: set
 * it too low and real stubs go unlisted, too high and every short run into a
 * box is listed. Re-run this and read the histogram before changing it.
 *
 *   pnpm tsx scripts/stubReview.mts                  # the .env database
 *   pnpm tsx scripts/stubReview.mts --bid 1164558    # one bid
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/stubReview.mts
 *
 * Reading production is safe: this issues SELECTs only, which is why it does
 * not go through scripts/databaseGuard.ts (that gate is for writers).
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mysqlConnection } from "../server/databaseConnection";
import {
  STUB_POINTS,
  STUB_REVIEW_POINTS,
  stubsToReview,
} from "../shared/runBends";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
// Which database this read — host and name only, never the credentials — so
// the person running it can see it was the one they meant.
try {
  const u = new URL(url);
  console.log(`Database: ${u.hostname}:${u.port}${u.pathname}`);
} catch {
  console.log("Database: (URL could not be parsed for display)");
}
const bidArg = process.argv.indexOf("--bid");
const bidId = bidArg > 0 ? Number(process.argv[bidArg + 1]) : null;

// Through the app's own connection settings, so a DigitalOcean URL with
// `ssl-mode=REQUIRED` connects over TLS with DATABASE_CA_CERT, as the app does.
const conn = await mysql.createConnection(mysqlConnection(url));
const [rows] = (await conn.query(
  `select r.id, r.bidId, b.name bidName, s.pageNumber, r.name, r.points,
          r.createdAt, r.isSuggestion
     from takeoff_runs r
     join bids b on b.id = r.bidId
     left join bid_pdf_sheets s on s.id = r.sheetId
    where r.isSuggestion = 0 ${bidId ? "and r.bidId = ?" : ""}
    order by r.bidId, r.id`,
  bidId ? [bidId] : []
)) as unknown as [
  {
    id: number;
    bidId: number;
    bidName: string;
    pageNumber: number | null;
    name: string;
    points: unknown;
    createdAt: Date;
  }[],
];
await conn.end();

const pointsOf = (raw: unknown): { x: number; y: number }[] => {
  const v = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(v) ? v : [];
};

// Every turning end segment up to 200 points, for the histogram.
const BUCKETS = [3, 10, 20, 30, 40, 60, 100, 200];
const histogram = new Map<string, number>();
const listed: string[] = [];
let runsChecked = 0;
for (const run of rows) {
  runsChecked++;
  const pts = pointsOf(run.points);
  for (const stub of stubsToReview(pts, 200)) {
    const b = BUCKETS.find(edge => stub.segmentPoints < edge) ?? 200;
    const lo = BUCKETS[BUCKETS.indexOf(b) - 1] ?? STUB_POINTS;
    const key = `${String(lo).padStart(3)}-${String(b).padEnd(3)} pt`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
    if (stub.segmentPoints < STUB_REVIEW_POINTS)
      listed.push(
        `bid ${run.bidId} "${run.bidName}" · sheet ${run.pageNumber ?? "?"} · run ${run.id} "${run.name}" · ${stub.end} segment ${stub.segmentPoints.toFixed(1)} pt, turn ${stub.degrees.toFixed(0)}° · traced ${run.createdAt.toISOString().slice(0, 10)}`
      );
  }
}

console.log(`Runs checked: ${runsChecked}${bidId ? ` (bid ${bidId})` : ""}`);
console.log(
  `\nTurning end segments by length (page points; STUB_POINTS=${STUB_POINTS} are already ignored):`
);
for (const key of Array.from(histogram.keys()).sort())
  console.log(`  ${key}  ${histogram.get(key)}`);
console.log(
  `\nTo review — shorter than STUB_REVIEW_POINTS=${STUB_REVIEW_POINTS} (${listed.length}):`
);
for (const line of listed) console.log(`  ${line}`);
if (listed.length === 0) console.log("  none");
