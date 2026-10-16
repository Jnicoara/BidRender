/**
 * A FORM ON ANOTHER SITE CANNOT CHANGE ANYTHING — server/csrfGuard.ts.
 *
 * Over real HTTP, with a real session cookie, the request a hostile page can
 * make: a `multipart/form-data` POST (no preflight) to a mutation that takes
 * no input. Without the guard it RUNS — the test shows that first, so the
 * guard is visibly what stops it — and with the guard it is refused and
 * nothing changes. Fixture id 9477 is this file's alone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { isForgeableTrpcPost, refuseForgeableTrpcPost } from "./csrfGuard";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9477;
const OPEN_ID = `test-csrf-${USER}`;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describe("which requests are refused", () => {
  it("refuses every POST that is not JSON, and nothing else", () => {
    expect(isForgeableTrpcPost("POST", "multipart/form-data; boundary=x")).toBe(
      true
    );
    expect(
      isForgeableTrpcPost("POST", "application/x-www-form-urlencoded")
    ).toBe(true);
    expect(isForgeableTrpcPost("POST", "text/plain")).toBe(true);
    expect(isForgeableTrpcPost("POST", "application/octet-stream")).toBe(true);
    expect(isForgeableTrpcPost("POST", undefined)).toBe(true);
    expect(isForgeableTrpcPost("POST", "application/json")).toBe(false);
    expect(isForgeableTrpcPost("post", "Application/JSON; charset=utf-8")).toBe(
      false
    );
    expect(isForgeableTrpcPost("GET", undefined)).toBe(false);
  });

  it("is mounted on the real server ahead of tRPC", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "_core/index.ts"),
      "utf8"
    );
    const guard = src.indexOf('app.use("/api/trpc", refuseForgeableTrpcPost)');
    const trpc = src.indexOf("createExpressMiddleware(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(trpc);
  });
});

async function serve(withGuard: boolean) {
  const app = express();
  if (withGuard) app.use("/api/trpc", refuseForgeableTrpcPost);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function dismissedAt() {
  const db = (await getDb())!;
  const [row] = await db.select().from(users).where(eq(users.id, USER));
  return row.checklistDismissedAt;
}

describeDb("a cross-site form post, over HTTP, with the session cookie", () => {
  let cookie = "";
  beforeAll(async () => {
    const db = (await getDb())!;
    await db.delete(users).where(eq(users.id, USER));
    await db.insert(users).values({
      id: USER,
      openId: OPEN_ID,
      name: "CSRF fixture",
      role: "user",
      checklistDismissedAt: null,
    });
    cookie = `${COOKIE_NAME}=${await sdk.createSessionToken(OPEN_ID, { name: "CSRF fixture" })}`;
  });
  afterAll(async () => {
    const db = await getDb();
    await db?.delete(users).where(eq(users.id, USER));
  });

  /** What a hostile page's <form enctype="multipart/form-data"> sends. */
  const forged = (base: string) =>
    fetch(`${base}/api/trpc/onboarding.dismissChecklist`, {
      method: "POST",
      headers: { cookie },
      body: new FormData(),
    });

  it("RAN before the guard — this is the hole", async () => {
    const { server, base } = await serve(false);
    try {
      expect(await dismissedAt()).toBeNull();
      const response = await forged(base);
      expect(response.status).toBe(200);
      expect(await dismissedAt()).not.toBeNull();
    } finally {
      server.close();
      const db = (await getDb())!;
      await db
        .update(users)
        .set({ checklistDismissedAt: null })
        .where(eq(users.id, USER));
    }
  });

  it("is refused with the guard, and nothing changes", async () => {
    const { server, base } = await serve(true);
    try {
      const response = await forged(base);
      expect(response.status).toBe(415);
      expect(await dismissedAt()).toBeNull();
      // Our own client's JSON call still works.
      const ok = await fetch(`${base}/api/trpc/onboarding.dismissChecklist`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      });
      expect(ok.status).toBe(200);
      expect(await dismissedAt()).not.toBeNull();
    } finally {
      server.close();
    }
  });
});
