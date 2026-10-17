/**
 * STRESS, in the browser, on staging (e2e/stress/playwright.config.ts).
 *
 *   1. A company with 50 fully marked bids — each with a plan set uploaded to
 *      the real bucket, a scale, 50 marks counted and sent to the bid. Then
 *      the Dashboard, the Bids list, a bid page and its print view are timed
 *      from navigation to the thing a person waits for.
 *   2. The same four screens on a throttled "slow 3G" connection.
 *   3. A large plan set (STRESS_PDF_MB, default 300; STRESS_PDF_PAGES,
 *      default 400) uploaded through the Plans screen, timed to the attach
 *      and to sheet 1 on screen.
 *
 * Timings print as `[stress]` lines (references/stress-results.md); the
 * speed limits are the everyday ones (2 s a screen), and anything over goes
 * to todo.md with its cause. Every bid is named with the smoke's throwaway
 * prefix and archived at the end — and the smoke's sweep archives any a
 * crashed run leaves.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createThrowawayBid,
  discardBid,
  openPlans,
  sheetCanvas,
  trpc,
} from "../smoke/helpers";
import { buildFixturePlan } from "../smoke/fixturePlan";
import { writeBigPlanPdf } from "../../server/stressPdf.testHelper";

test.describe.configure({ mode: "serial" });

const BIDS = Number(process.env.STRESS_BIDS ?? 50);
const MARKS = 50;
const MB = Number(process.env.STRESS_PDF_MB ?? 300);
const PAGES = Number(process.env.STRESS_PDF_PAGES ?? 400);
const SCREEN_LIMIT_MS = 2000;

const made: number[] = [];
let lastBid = 0;
let assemblyName = "";
const timings: string[] = [];

function record(line: string) {
  timings.push(line);
  console.log(`[stress] ${line}`);
}

async function timed(label: string, page: Page, go: () => Promise<unknown>) {
  const t0 = Date.now();
  await go();
  const ms = Date.now() - t0;
  record(
    `${label}: ${ms} ms${ms > SCREEN_LIMIT_MS ? ` (OVER the ${SCREEN_LIMIT_MS} ms limit)` : ""}`
  );
  return ms;
}

async function screens(page: Page, tag: string) {
  await timed(`${tag} Dashboard`, page, async () => {
    await page.goto("/#/");
    await expect(page.getByText(/CI smoke stress/).first()).toBeVisible();
  });
  await timed(`${tag} Bids list`, page, async () => {
    await page.goto("/#/bids");
    await expect(page.getByText(/CI smoke stress/).first()).toBeVisible();
  });
  await timed(`${tag} bid page`, page, async () => {
    await page.goto(`/#/bids/${lastBid}`);
    await expect(
      page.getByRole("button", { name: "Lock quantities" }).first()
    ).toBeVisible();
  });
  await timed(`${tag} print view`, page, async () => {
    await page.goto(`/#/bids/${lastBid}/proposal`);
    await expect(
      page.getByText(new RegExp(assemblyName.slice(0, 12), "i")).first()
    ).toBeVisible();
  });
}

test.afterAll(async ({ request }) => {
  for (const id of made) await discardBid(request, id).catch(() => {});
  console.log(`[stress] SUMMARY\n${timings.join("\n")}`);
});

test("build a company with fully marked bids", async ({ request }) => {
  const assemblies = await trpc<
    { id: number; name: string; userId: number | null }[]
  >(request, "assemblies.list");
  const starter = assemblies.find(a => /duplex/i.test(a.name)) ?? assemblies[0];
  assemblyName = starter.name;
  const plan = buildFixturePlan();
  const t0 = Date.now();
  for (let i = 0; i < BIDS; i++) {
    const bidId = await createThrowawayBid(request, `stress ${i + 1}`);
    made.push(bidId);
    const filename = `ci-stress-${i + 1}.pdf`;
    const ticket = await trpc<{ uploadUrl: string; storageKey: string }>(
      request,
      "bidPdfs.createUploadTicket",
      { bidId, filename, byteSize: plan.length },
      true
    );
    const put = await request.fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      data: plan,
    });
    expect(put.ok(), `upload ${i + 1}`).toBe(true);
    const pdf = await trpc<{ id: number }>(
      request,
      "bidPdfs.confirmAttach",
      { bidId, filename, storageKey: ticket.storageKey, byteSize: plan.length },
      true
    );
    await trpc(
      request,
      "bidPdfs.setPageCount",
      { id: pdf.id, pageCount: 2 },
      true
    );
    await trpc(
      request,
      "bidPdfs.ensureSheets",
      { bidPdfId: pdf.id, pageCount: 2 },
      true
    );
    const sheets = await trpc<{ id: number }[]>(request, "bidPdfs.sheets", {
      bidPdfId: pdf.id,
    });
    await trpc(
      request,
      "bidPdfs.setSheetScale",
      { id: sheets[0].id, scaleText: `1/4" = 1'-0"` },
      true
    );
    const group = await trpc<{ id: number }>(
      request,
      "takeoffGroups.forAssembly",
      { bidId, assemblyId: starter.id },
      true
    );
    await trpc(
      request,
      "takeoffStamps.drop",
      {
        bidId,
        sheetId: sheets[0].id,
        groupId: group.id,
        at: Array.from({ length: MARKS }, (_, k) => ({
          x: 300 + (k % 10) * 120,
          y: 300 + Math.floor(k / 10) * 120,
        })),
      },
      true
    );
    await trpc(request, "takeoffGroups.sendToBid", { id: group.id }, true);
    lastBid = bidId;
  }
  record(
    `built ${BIDS} fully marked bids (upload + scale + ${MARKS} marks + sent, each): ${((Date.now() - t0) / 1000).toFixed(0)} s`
  );
});

test("screens on a normal connection", async ({ page }) => {
  await screens(page, "normal:");
});

test("screens on slow 3G", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // Chrome DevTools' "Slow 3G" preset.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  });
  await screens(page, "slow 3G:");
});

test("a large plan set uploaded through the screen", async ({
  page,
  request,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "stress-set-"));
  try {
    const big = await writeBigPlanPdf(join(dir, "ci-stress-big-set.pdf"), {
      pages: PAGES,
      targetBytes: MB * 1024 * 1024,
      symbolsPerPage: 120,
    });
    const bidId = await createThrowawayBid(request, "stress big set");
    made.push(bidId);
    await openPlans(page, bidId);
    const attached = page.waitForResponse(
      r => r.url().includes("bidPdfs.confirmAttach") && r.ok(),
      { timeout: 40 * 60_000 }
    );
    const t0 = Date.now();
    await page
      .locator("input[type=file][accept*='pdf']")
      .setInputFiles(big.path);
    await expect(sheetCanvas(page)).toBeVisible({ timeout: 10 * 60_000 });
    record(
      `big set ${(big.bytes / 1024 / 1024).toFixed(0)} MB / ${PAGES} sheets: sheet 1 on screen after ${Date.now() - t0} ms (drawn from the local file while it uploads)`
    );
    await attached;
    record(
      `big set: upload finished and attached after ${((Date.now() - t0) / 1000).toFixed(0)} s`
    );
    // Opened again from the bucket, as a colleague would.
    const t1 = Date.now();
    await page.reload();
    await expect(sheetCanvas(page)).toBeVisible({ timeout: 10 * 60_000 });
    record(
      `big set: reopened from the bucket, sheet 1 on screen after ${Date.now() - t1} ms`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
