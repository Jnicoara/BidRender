/**
 * FAILURE DRILLS — file storage down, AI down, email down (owner's queue,
 * 2026-10-16; the same shape as Track C's database drill): while it is down
 * the app says so honestly and loses nothing; when it comes back the app
 * recovers ON ITS OWN, with no restart.
 *
 *   storage — the plan bucket is a fake S3 server on this machine that the
 *             test turns off and on (R2_PLANS_ENDPOINT). Nothing reaches R2.
 *   AI      — `invokeLLM` mocked to fail, then to answer. Nothing spent.
 *   email   — the real email door with production settings and a FAKE key;
 *             `fetch` is replaced, so nothing reaches the email provider.
 *
 * Fixture user 9921.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return { ...actual, invokeLLM: vi.fn() };
});

import { invokeLLM } from "./llm";
import { resolveReadBackend } from "./storage";
import { resetR2StorageForTests } from "./r2Storage";
import { releaseStoredFiles } from "./storedFiles";
import { emailAvailability, resetEmailCountForTests, sendEmail } from "./email";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, bidWithSheet, freshUser } from "./bidBuilders.testHelper";

const USER = 9921;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

// ─── Storage ─────────────────────────────────────────────────────────────────

describe("file storage down, then back", () => {
  let server: Server;
  let up = true;
  const heads: string[] = [];
  const saved: Record<string, string | undefined> = {};
  const ENV = {
    PLAN_STORAGE: "r2",
    R2_PLANS_ACCOUNT_ID: "drill",
    R2_PLANS_ACCESS_KEY_ID: "drill-key",
    R2_PLANS_SECRET_ACCESS_KEY: "drill-secret",
    R2_PLANS_BUCKET: "drill-plans",
    LOCAL_STORAGE_DIR: "",
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (!up) {
        req.socket.destroy(); // a store that does not answer at all
        return;
      }
      heads.push(`${req.method} ${req.url}`);
      if (req.method === "HEAD" && req.url?.includes("there.pdf")) {
        res.writeHead(200, { "content-length": "1024", etag: '"abc"' });
        res.end();
      } else if (req.method === "DELETE") {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    for (const [k, v] of Object.entries({
      ...ENV,
      R2_PLANS_ENDPOINT: `http://127.0.0.1:${port}`,
    })) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    resetR2StorageForTests();
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetR2StorageForTests();
    await new Promise<void>(r => server.close(() => r()));
  });

  it("while up, a stored plan is found in the bucket", async () => {
    expect(await resolveReadBackend("bid-plans/1/2/there.pdf")).toBe("r2");
  });

  it("while down, opening a plan FAILS LOUDLY — never 'that file does not exist'", async () => {
    up = false;
    resetR2StorageForTests(); // nothing remembered: the next read must ask
    // The proxy turns this throw into 502 "Storage backend error"
    // (_core/storageProxy.ts). Answering null instead would say the
    // contractor's plan is gone.
    await expect(
      resolveReadBackend("bid-plans/1/2/there.pdf")
    ).rejects.toThrow();
  }, 60_000);

  it("while down, deleting a file loses nothing: the delete is counted as failed and left for the sweep", async () => {
    const result = await releaseStoredFiles(["bid-plans/9921/1/gone.pdf"]);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(1);
  }, 60_000);

  it("back up: the same plan opens again, with no restart", async () => {
    up = true;
    expect(await resolveReadBackend("bid-plans/1/2/there.pdf")).toBe("r2");
  });
});

// ─── AI ──────────────────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("AI down, then back", () => {
  let sheetId = 0;
  const reply = (content: string) =>
    ({ choices: [{ message: { content }, finish_reason: "stop" }] }) as never;
  const crops = [{ id: 1, picture: "data:image/png;base64,AA" }];

  beforeAll(async () => {
    await freshUser(USER);
    ({ sheetId } = await bidWithSheet(as(USER), USER, "Drill AI"));
  }, 60_000);

  it("down: says so plainly, changes nothing; back: answers, no restart", async () => {
    const c = as(USER);
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("ECONNRESET"));
    const down = await c.planCopilot.checkScanFinds({
      sheetId,
      picked: "data:image/png;base64,AA",
      crops,
    });
    expect(down.answers).toEqual([{ cropId: 1, answer: null }]);
    expect(down.message).toMatch(/could not be reached\. Nothing was changed/);

    vi.mocked(invokeLLM).mockResolvedValueOnce(reply("Picture 1: 1"));
    const back = await c.planCopilot.checkScanFinds({
      sheetId,
      picked: "data:image/png;base64,AA",
      crops,
    });
    expect(back).toEqual({
      answers: [{ cropId: 1, answer: "same" }],
      message: null,
    });
  });
});

// ─── Email ───────────────────────────────────────────────────────────────────

describe("email down, then back", () => {
  const env = {
    NODE_ENV: "production",
    RESEND_API_KEY: "re_drill_fake",
    APP_BASE_URL: "https://drill.invalid",
  };
  const message = {
    kind: "password-reset" as const,
    to: "drill@test.invalid",
    subject: "Reset",
    text: "link",
    html: "<p>link</p>",
  };
  const realFetch = globalThis.fetch;
  let mode: "down" | "quota" | "up" = "down";

  beforeAll(() => {
    resetEmailCountForTests();
    globalThis.fetch = (async () => {
      if (mode === "down") throw new TypeError("fetch failed");
      if (mode === "quota")
        return new Response(
          JSON.stringify({
            name: "daily_quota_exceeded",
            message: "daily quota",
          }),
          { status: 429 }
        );
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    resetEmailCountForTests();
  });

  it("a provider that does not answer: not sent, logged, never a crash", async () => {
    const r = await sendEmail(message, { env });
    expect(r.status).toBe("notSent");
  });

  it("a quota refusal PAUSES email and says so; it lifts on its own", async () => {
    mode = "quota";
    const now = new Date("2026-10-16T12:00:00Z");
    const r = await sendEmail(message, { env, now });
    expect(r.status).toBe("notSent");
    expect(emailAvailability({ env, now }).status).toBe("later");
    // The next UTC day, with the provider back: available, and it sends.
    mode = "up";
    const tomorrow = new Date("2026-10-17T12:00:00Z");
    expect(emailAvailability({ env, now: tomorrow }).status).toBe("ok");
    expect((await sendEmail(message, { env, now: tomorrow })).status).toBe(
      "sent"
    );
  });
});
