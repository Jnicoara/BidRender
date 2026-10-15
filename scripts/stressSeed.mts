/**
 * STRESS DATA — a busy company, three huge bids, and ten more companies.
 *
 *   pnpm tsx scripts/stressSeed.mts            # build (skips what exists)
 *   pnpm tsx scripts/stressSeed.mts --drop     # remove everything it made
 *
 * Owner's brief (2026-10-14, overnight run #2): "a company with 100+ bids,
 * bids with 2,000+ marks, 50+ sheet plan sets, 10 companies using the app at
 * once". This builds the data; `scripts/stressTime.mts` times it. Numbers
 * live in references/stress-results.md.
 *
 * Built THROUGH THE APP'S OWN ROUTES (appRouter.createCaller), so every row
 * is one a person could have made — validated, scoped, priced the way the
 * app prices. Only the plan-set row and the users are inserted directly
 * (an upload needs a browser), and the plan files are real PDFs drawn here
 * with jsPDF so the viewer can open them.
 *
 * Refuses any database not on this machine (scripts/databaseGuard.ts).
 * Sizes are constants below; keep them laptop-sized (16 GB machine).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { jsPDF } from "jspdf";
import { eq, inArray, like } from "drizzle-orm";
import { assertWritableDatabase } from "./databaseGuard";
import { getDb } from "../server/db";
import { appRouter } from "../server/routers";
import { resolveScope } from "../server/_core/companyScope";
import { writeDiskObject } from "../server/diskStorage";
import {
  bidPdfs,
  companies,
  companyMembers,
  users,
  type User,
} from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";

import { STRESS } from "./stressConfig.mts";
export { STRESS };

const PAGE = { width: 2592, height: 1728 };
const SMALL_KEY = "stress/plan-6-sheets.pdf";
const BIG_KEY = "stress/plan-60-sheets.pdf";
const LABELS = [
  "Duplex",
  "2x4 troffer",
  "Switch",
  "GFCI",
  "Exit sign",
  "Downlight",
  "Data drop",
  "Smoke detector",
  "Quad",
  "Floor box",
];

function plan(pages: number): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [PAGE.width, PAGE.height],
  });
  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage([PAGE.width, PAGE.height], "landscape");
    doc.setFontSize(28);
    doc.text(`E-${String(101 + p)} STRESS FLOOR PLAN ${p + 1}`, 60, 70);
    doc.setFontSize(16);
    doc.text(`SCALE: 1/8" = 1'-0"`, 60, 100);
    // A grid of rooms with symbols to count.
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 10; c++) {
        const x = 200 + c * 220;
        const y = 220 + r * 230;
        doc.rect(x, y, 200, 210);
        doc.rect(x + 20, y + 20, 14, 14);
        doc.circle(x + 100, y + 105, 9);
      }
  }
  return Buffer.from(doc.output("arraybuffer"));
}

function ctxFor(user: User): TrpcContext {
  return {
    user,
    req: { protocol: "http", headers: {} },
    res: { cookie: () => undefined, clearCookie: () => undefined },
  } as unknown as TrpcContext;
}

async function ensureUser(email: string, name: string): Promise<User> {
  const db = (await getDb())!;
  const [found] = await db.select().from(users).where(eq(users.email, email));
  if (found) return found;
  await db.insert(users).values({
    openId: `stress_${email}`,
    email,
    name,
    passwordHash: await bcrypt.hash(STRESS.password, 10),
    loginMethod: "email_password",
    emailVerified: true,
    role: "user",
    onboardingCompletedAt: new Date(),
  });
  const [row] = await db.select().from(users).where(eq(users.email, email));
  await resolveScope(row); // makes the company
  return row;
}

type Caller = ReturnType<typeof appRouter.createCaller>;

async function attachPlan(
  caller: Caller,
  dataUserId: number,
  bidId: number,
  key: string,
  pages: number
) {
  const db = (await getDb())!;
  const [pdf] = await db.insert(bidPdfs).values({
    bidId,
    userId: dataUserId,
    filename: `${pages}-sheet set.pdf`,
    storageKey: key,
    byteSize: 1024 * 1024,
    pageCount: pages,
    sortOrder: 0,
  });
  const { sheets } = await caller.bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: pages,
    outline: [],
  });
  for (const sheet of sheets)
    await caller.bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/8" = 1'-0"`,
    });
  return sheets.map(s => s.id);
}

/** One bid: a plan set, counts on it, runs, the counts sent, some assemblies. */
async function buildBid(
  caller: Caller,
  dataUserId: number,
  name: string,
  shape: {
    key: string;
    sheets: number;
    groups: number;
    marks: number;
    runs: number;
    assemblies: number[];
  },
  status: "Draft" | "Active" | "Won" | "Lost"
) {
  const bid = (await caller.bids.create({ name, status: "Draft" }))!;
  const sheetIds = await attachPlan(
    caller,
    dataUserId,
    bid.id,
    shape.key,
    shape.sheets
  );
  const groups = [];
  for (let g = 0; g < shape.groups; g++)
    groups.push(
      await caller.takeoffGroups.create({
        bidId: bid.id,
        label: `${LABELS[g % LABELS.length]}${g >= LABELS.length ? ` ${Math.floor(g / LABELS.length) + 1}` : ""}`,
      })
    );
  // Marks spread over every sheet and count, in batches of up to 100.
  let placed = 0;
  let i = 0;
  while (placed < shape.marks) {
    const sheetId = sheetIds[i % sheetIds.length];
    const group = groups[i % groups.length];
    // Small enough batches that every count gets marks on several sheets.
    const n = Math.min(
      40,
      Math.ceil(shape.marks / shape.groups / 2),
      shape.marks - placed
    );
    await caller.takeoffStamps.drop({
      bidId: bid.id,
      sheetId,
      groupId: group.id,
      at: Array.from({ length: n }, (_, k) => ({
        x: 200 + ((k * 37 + i * 11) % 2200),
        y: 220 + ((k * 53 + i * 7) % 1400),
      })),
    });
    placed += n;
    i++;
  }
  for (let r = 0; r < shape.runs; r++)
    await caller.takeoffRuns.save({
      bidId: bid.id,
      sheetId: sheetIds[r % sheetIds.length],
      name: `Run ${r + 1}`,
      pathType: r % 2 ? "cable" : "conduit",
      status: "committed",
      isSuggestion: false,
      points: [
        { x: 220 + r * 10, y: 240 },
        { x: 900 + r * 10, y: 240 },
        { x: 900 + r * 10, y: 700 },
      ],
    });
  for (const group of groups)
    await caller.takeoffGroups.sendToBid({ id: group.id });
  for (const [k, assemblyId] of shape.assemblies.entries())
    await caller.bids
      .addAssembly({ bidId: bid.id, assemblyId, qty: 1 + (k % 7) })
      .catch(() => undefined);
  if (status !== "Draft") await caller.bids.update({ id: bid.id, status });
  return bid.id;
}

async function drop() {
  const db = (await getDb())!;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, "stress-c%@example.com"));
  const ids = rows.map(r => r.id);
  if (ids.length) {
    const owned = await db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.ownerUserId, ids));
    if (owned.length) {
      const cids = owned.map(c => c.id);
      await db
        .delete(companyMembers)
        .where(inArray(companyMembers.companyId, cids));
      await db.delete(companies).where(inArray(companies.id, cids));
    }
    await db.delete(users).where(inArray(users.id, ids));
  }
  console.log(`Dropped ${ids.length} stress users and everything they owned.`);
}

async function main() {
  const host = assertWritableDatabase(process.env.DATABASE_URL, {
    action: "build stress-test data",
  });
  console.log(`Stress seed on ${host}.`);
  if (process.argv.includes("--drop")) return drop();

  const started = Date.now();
  await writeDiskObject(SMALL_KEY, plan(STRESS.sheetsPerBid));
  await writeDiskObject(BIG_KEY, plan(STRESS.bigSheets));
  console.log(`Plans drawn (${((Date.now() - started) / 1000).toFixed(1)} s).`);

  const owner = await ensureUser(STRESS.ownerEmail, "Stress Co");
  const scope = await resolveScope(owner);
  const caller = appRouter.createCaller(ctxFor(owner));
  const library = (await caller.assemblies.list()) as { id: number }[];
  const pick = (n: number, seed: number) =>
    Array.from(
      { length: n },
      (_, k) => library[(seed * 13 + k * 7) % library.length].id
    );
  const existing = (await caller.bids.dashboard()).length;
  const statuses = ["Draft", "Draft", "Active", "Won", "Lost"] as const;

  for (let b = existing; b < STRESS.bids; b++) {
    const big = b < STRESS.bigBids;
    await buildBid(
      caller,
      scope.dataUserId,
      big ? `Stress hospital wing ${b + 1}` : `Stress job ${b + 1}`,
      big
        ? {
            key: BIG_KEY,
            sheets: STRESS.bigSheets,
            groups: STRESS.bigGroups,
            marks: STRESS.bigMarks,
            runs: STRESS.bigRuns,
            assemblies: pick(10, b),
          }
        : {
            key: SMALL_KEY,
            sheets: STRESS.sheetsPerBid,
            groups: 3,
            marks: 30 + (b % 31),
            runs: 2,
            assemblies: pick(3, b),
          },
      big ? "Draft" : statuses[b % statuses.length]
    );
    if ((b + 1) % 10 === 0 || big)
      console.log(
        `  bid ${b + 1}/${STRESS.bids} (${((Date.now() - started) / 1000).toFixed(0)} s)`
      );
  }

  for (let o = 1; o <= STRESS.others; o++) {
    const user = await ensureUser(`stress-c${o}@example.com`, `Stress Co ${o}`);
    const s = await resolveScope(user);
    const c = appRouter.createCaller(ctxFor(user));
    const have = (await c.bids.dashboard()).length;
    for (let b = have; b < STRESS.otherBids; b++)
      await buildBid(
        c,
        s.dataUserId,
        `Co ${o} job ${b + 1}`,
        {
          key: SMALL_KEY,
          sheets: STRESS.sheetsPerBid,
          groups: 3,
          marks: 30,
          runs: 2,
          assemblies: pick(3, b + o),
        },
        statuses[b % statuses.length]
      );
  }
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(0)} s. Sign in as ${STRESS.ownerEmail} / ${STRESS.password} (local only).`
  );
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
