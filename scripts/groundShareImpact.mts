/**
 * WHICH BIDS WOULD REPORT LESS BARE COPPER once one-ground-per-pipe ships.
 *
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/groundShareImpact.mts
 *
 * READ ONLY. It opens no write path and takes no `ALLOW_REMOTE_DATABASE`,
 * because there is nothing here to guard — the point is to look before
 * deciding, not to change anything.
 *
 * ── What it counts, and why that is the right question ──────────────────────
 * Until 2026-09-24 every circuit pulled its own ground the full length of its
 * run, so a conduit with three circuits was billed three grounds. Sharing means
 * the run pulls the LARGEST of them once. A run's ground therefore changes when
 *
 *     SUM(groundCount) > MAX(groundCount)
 *
 * over its circuits — which is any conduit run with two or more circuits that
 * each want a ground. One circuit, or one ground between them, is unaffected.
 *
 * ── The footage figure is FLAT ONLY, and says so ───────────────────────────
 * A run's real ground footage includes the drops at its ends, which need the
 * job's height settings and the per-end answers. This reports the traced length
 * only, so the delta it prints is a FLOOR: the true change is that much or
 * more. It is here to size the exposure, not to restate a bid.
 *
 * A run on an unscaled sheet has no length at all and is reported as such
 * rather than as zero — CLAUDE.md § "UNSET is not zero".
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  bidPdfSheets,
  bids,
  takeoffRunCircuits,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import {
  measurabilityOf,
  runFeet,
  type RunPathType,
} from "../shared/takeoffQuantities";

function where(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? "");
    return parsed.hostname + ":" + (parsed.port || "3306") + parsed.pathname;
  } catch {
    return "(DATABASE_URL unset or unparseable)";
  }
}

const db = await getDb();
if (!db) throw new Error("No database.");
console.log("database: " + where());

const allRuns = await db.select().from(takeoffRuns);
const conduitRuns = allRuns.filter(r => r.pathType === "conduit");
const circuits = conduitRuns.length
  ? await db
      .select()
      .from(takeoffRunCircuits)
      .where(
        inArray(
          takeoffRunCircuits.runId,
          conduitRuns.map(r => r.id)
        )
      )
  : [];

const byRun = new Map<number, typeof circuits>();
for (const c of circuits) {
  const list = byRun.get(c.runId) ?? [];
  list.push(c);
  byRun.set(c.runId, list);
}

type Affected = {
  runId: number;
  bidId: number;
  oldGrounds: number;
  newGrounds: number;
  flatFeet: number | null;
};

const affected: Affected[] = [];
for (const run of conduitRuns) {
  const rows = byRun.get(run.id) ?? [];
  if (rows.length < 2) continue;
  const counts = rows.map(c => Math.max(0, c.groundCount ?? 0));
  const oldGrounds = counts.reduce((a, b) => a + b, 0);
  const newGrounds = counts.reduce((a, b) => Math.max(a, b), 0);
  if (oldGrounds === newGrounds) continue;

  const [sheet] = await db
    .select()
    .from(bidPdfSheets)
    .where(eq(bidPdfSheets.id, run.sheetId))
    .limit(1);
  const measurability = sheet
    ? measurabilityOf({
        scaleRatio:
          sheet.scaleRatio === null ? null : Number(sheet.scaleRatio),
        scaleSource: sheet.scaleSource as "detected" | "manual" | "none",
        notToScale: sheet.notToScale,
      })
    : ({ ok: false, reason: "no-scale", message: "" } as const);
  const flatFeet = measurability.ok
    ? runFeet(
        {
          pathType: run.pathType as RunPathType,
          points: run.points ?? [],
        },
        measurability.ratio
      )
    : null;

  affected.push({
    runId: run.id,
    bidId: run.bidId,
    oldGrounds,
    newGrounds,
    flatFeet,
  });
}

if (affected.length === 0) {
  console.log("\nNo run anywhere would change. Nothing is affected.");
  console.log(
    `Checked ${conduitRuns.length} conduit run(s), ${circuits.length} circuit(s).`
  );
  process.exit(0);
}

const bidIds = Array.from(new Set(affected.map(a => a.bidId)));
const bidRows = await db.select().from(bids).where(inArray(bids.id, bidIds));
const ownerIds = Array.from(new Set(bidRows.map(b => b.userId)));
const userRows = ownerIds.length
  ? await db.select().from(users).where(inArray(users.id, ownerIds))
  : [];
const userById = new Map(userRows.map(u => [u.id, u]));

console.log(
  `\n${affected.length} run(s) across ${bidRows.length} bid(s) would report less ground.\n`
);
for (const bid of bidRows) {
  const mine = affected.filter(a => a.bidId === bid.id);
  const owner = userById.get(bid.userId);
  const feet = mine.reduce(
    (sum, a) => sum + (a.flatFeet ?? 0) * (a.oldGrounds - a.newGrounds),
    0
  );
  const unmeasured = mine.filter(a => a.flatFeet === null).length;
  console.log(
    `bid ${bid.id} "${bid.name}" — status ${bid.status}` +
      `, client ${bid.clientId === null ? "none" : "#" + bid.clientId}` +
      `, sample ${bid.isSample}` +
      `, archived ${bid.archivedAt === null ? "no" : "yes"}`
  );
  console.log(
    `    owner ${bid.userId} <${owner?.email ?? "?"}>` +
      `, created ${bid.createdAt?.toISOString?.().slice(0, 10) ?? "?"}`
  );
  console.log(
    `    ${mine.length} run(s); at least ${feet.toFixed(2)} ft less bare copper` +
      (unmeasured > 0 ? ` (+${unmeasured} run(s) on an unscaled sheet)` : "")
  );
  for (const a of mine) {
    console.log(
      `      run ${a.runId}: grounds ${a.oldGrounds} -> ${a.newGrounds}` +
        `, flat ${a.flatFeet === null ? "not measurable" : a.flatFeet.toFixed(2) + " ft"}`
    );
  }
}

console.log(
  "\nStatus is the only record of whether a bid went out — there is no stored" +
    '\n"sent" flag. Draft has not been sent; Active/Won/Lost has, or may have.'
);
process.exit(0);
