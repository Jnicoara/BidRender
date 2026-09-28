/**
 * Deleting a bid deletes its plan files — and nothing a surviving row names.
 *
 * Until 2026-09-27 every permanent delete removed database rows only, and the
 * customer's drawings stayed in storage. These run against a REAL disk store in
 * a temp folder and real rows, because the failure being guarded is a file
 * that is still on disk, and only the disk can say so.
 *
 * R2 is not here: whether an object is in the bucket is exercised by hand
 * against the real bucket (see r2Storage.test.ts for why it is not mocked).
 * `storageDelete` asks the disk folder too when R2 is live, so the disk half of
 * that case is the one below.
 *
 * Fixture ids are distinct from every other suite — files run in parallel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import { writeDiskObject, diskRelativePath } from "./diskStorage";
import { purgeExpiredBids } from "./scheduled/purgeArchivedBids";
import { RETENTION_DAYS } from "../shared/retention";
import type { TrpcContext } from "./_core/context";

const USER = 7461;
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-stored-files-${USER}`, role: "user" },
  } as unknown as TrpcContext);

let root = "";
const savedEnv: Record<string, string | undefined> = {};

function onDisk(key: string): boolean {
  return existsSync(path.join(root, ...diskRelativePath(key)!.split("/")));
}

async function bidWithPlan(key: string) {
  const bid = (await caller().bids.create({
    name: `Stored files ${key}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "plans.pdf",
    storageKey: key,
    byteSize: 4,
    sortOrder: 0,
  });
  await writeDiskObject(key, "%PDF");
  return bid;
}

beforeAll(async () => {
  for (const name of ["PLAN_STORAGE", "LOCAL_STORAGE_DIR"]) {
    savedEnv[name] = process.env[name];
  }
  root = await mkdtemp(path.join(tmpdir(), "bidrender-stored-files-"));
  process.env.PLAN_STORAGE = "disk";
  process.env.LOCAL_STORAGE_DIR = root;

  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database!.insert(users).values({
      id: USER,
      openId: `test-stored-files-${USER}`,
      name: "Stored files test user",
    });
  }
});

afterAll(async () => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
});

describe.skipIf(!hasDb)("deleting a bid for good", () => {
  it("deletes its plan file (was left in storage)", async () => {
    const key = `bid-plans/${USER}/a/one_${Date.now()}.pdf`;
    const bid = await bidWithPlan(key);
    await caller().bids.archive({ id: bid.id });
    expect(onDisk(key)).toBe(true);

    await caller().bids.deleteForever({ id: bid.id });

    expect(onDisk(key)).toBe(false);
  });

  it("does it for Delete all too", async () => {
    const one = `bid-plans/${USER}/b/one_${Date.now()}.pdf`;
    const two = `bid-plans/${USER}/b/two_${Date.now()}.pdf`;
    for (const key of [one, two]) {
      const bid = await bidWithPlan(key);
      await caller().bids.archive({ id: bid.id });
    }
    await caller().bids.deleteAllArchived({ expectedCount: 2 });
    expect(onDisk(one)).toBe(false);
    expect(onDisk(two)).toBe(false);
  });

  it("does it for the nightly purge", async () => {
    const key = `bid-plans/${USER}/c/purged_${Date.now()}.pdf`;
    const bid = await bidWithPlan(key);
    const now = new Date();
    await db.archiveBid(
      bid.id,
      USER,
      new Date(now.getTime() - (RETENTION_DAYS + 1) * 86_400_000)
    );
    await purgeExpiredBids(now);
    expect(onDisk(key)).toBe(false);
  });

  it("keeps a file another row still names, until the last one goes", async () => {
    const key = `bid-plans/${USER}/d/shared_${Date.now()}.pdf`;
    const first = await bidWithPlan(key);
    const second = await bidWithPlan(key);
    for (const bid of [first, second]) {
      await caller().bids.archive({ id: bid.id });
    }

    await caller().bids.deleteForever({ id: first.id });
    expect(onDisk(key)).toBe(true);
    expect(
      await readFile(
        path.join(root, ...diskRelativePath(key)!.split("/")),
        "utf8"
      )
    ).toBe("%PDF");

    await caller().bids.deleteForever({ id: second.id });
    expect(onDisk(key)).toBe(false);
  });
});

describe.skipIf(!hasDb)("removing one plan set", () => {
  it("deletes that file and leaves the bid's other plans", async () => {
    const keep = `bid-plans/${USER}/e/keep_${Date.now()}.pdf`;
    const drop = `bid-plans/${USER}/e/drop_${Date.now()}.pdf`;
    const bid = await bidWithPlan(keep);
    const database = await getDb();
    const [inserted] = await database!.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "drop.pdf",
      storageKey: drop,
      byteSize: 4,
      sortOrder: 1,
    });
    await writeDiskObject(drop, "%PDF");

    await caller().bidPdfs.remove({ id: inserted.insertId });

    expect(onDisk(drop)).toBe(false);
    expect(onDisk(keep)).toBe(true);
  });
});

describe.skipIf(!hasDb)("a company logo", () => {
  it("drops the old file when replaced, and the last one when cleared", async () => {
    const first = `company-logos/${USER}/first_${Date.now()}.png`;
    const second = `company-logos/${USER}/second_${Date.now()}.png`;
    await writeDiskObject(first, "png1");
    await writeDiskObject(second, "png2");

    await caller().proposals.confirmLogo({ storageKey: first });
    await caller().proposals.confirmLogo({ storageKey: second });
    expect(onDisk(first)).toBe(false);
    expect(onDisk(second)).toBe(true);

    await caller().proposals.clearLogo();
    expect(onDisk(second)).toBe(false);
  });
});

describe("a delete that leaves a file behind cannot be written", () => {
  /*
    Every raw delete of a row that names a stored file must go through
    server/storedFiles.ts, which reads the keys first and releases the files
    after. A new router calling `db.deleteBidForever` directly is exactly how
    the drawings were left behind the first time — three delete features were
    built on the raw call. This is the red that stops a fourth.
  */
  const RAW = [
    "deleteBidForever(",
    "deleteBidPdf(",
    "removeSampleProject(",
    "deleteProject(",
  ];
  const ALLOWED = new Set(["db.ts", "storedFiles.ts"]);

  async function sourceFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
        out.push(full);
    }
    return out;
  }

  it("calls the raw deletes only from storedFiles.ts", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(path.resolve(__dirname))) {
      if (ALLOWED.has(path.basename(file))) continue;
      const text = await readFile(file, "utf8");
      for (const call of RAW) {
        if (text.includes(`db.${call}`)) offenders.push(`${file}: db.${call}`);
      }
      // A logo or legacy PDF key written straight to its row skips the release.
      // `[^)]` and `[^;]` cross line breaks, so a call split over lines counts.
      if (/updateCompanyBranding\([^)]*logoKey/.test(text))
        offenders.push(`${file}: updateCompanyBranding with logoKey`);
      if (/db\.updateProject\([^;]*pdfKey/.test(text))
        offenders.push(`${file}: updateProject with pdfKey`);
    }
    expect(offenders).toEqual([]);
  });
});
