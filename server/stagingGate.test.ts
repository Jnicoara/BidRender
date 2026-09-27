/**
 * The staging password gate — server/stagingGate.ts.
 *
 * Two halves, and the first is the one that matters most: with no
 * STAGING_PASSWORD the gate must not exist at all, because production never
 * has that setting and a gate that fired there would lock every contractor out
 * of the live site. The second half is that when it IS set, nothing gets past
 * it without the password — not a page, not the API, not an upload.
 *
 * Driven over real HTTP against a throwaway Express app, because the thing
 * being tested is what a browser receives: status, headers, cookies.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENV_COOKIE,
  GATE_COOKIE,
  GATE_PATH,
  MIN_STAGING_PASSWORD_LENGTH,
  readStagingGate,
  registerStagingGate,
  safeNextPath,
  stagingGateToken,
} from "./stagingGate";

const PASSWORD = "correct-horse-battery-staple";

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>(resolve =>
    server ? server.close(() => resolve()) : resolve()
  );
  server = null;
});

/** An app shaped like the real one: API routes, a version route, an SPA. */
async function start(env: Record<string, string | undefined>) {
  const app = express();
  const active = registerStagingGate(app, env);
  app.get("/api/version", (_req, res) => res.json({ version: "test" }));
  app.post("/api/trpc/bids.create", (_req, res) => res.json({ ok: true }));
  app.get("/api/trpc/auth.me", (_req, res) => res.json({ user: null }));
  app.get("*", (_req, res) => res.type("html").send("<div id=root></div>"));
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { active, base: `http://127.0.0.1:${port}` };
}

function cookiesOf(res: Response): string[] {
  return res.headers.getSetCookie();
}

describe("with no STAGING_PASSWORD — the live site", () => {
  it("is not active and lets every request through untouched", async () => {
    const { active, base } = await start({});
    expect(active).toBe(false);

    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("id=root");
    expect(page.headers.get("x-robots-tag")).toBeNull();
    expect(cookiesOf(page)).toEqual([]);

    const api = await fetch(`${base}/api/trpc/bids.create`, { method: "POST" });
    expect(api.status).toBe(200);
  });

  it("treats a blank or whitespace setting as not set", () => {
    expect(readStagingGate({ STAGING_PASSWORD: "" }).active).toBe(false);
    expect(readStagingGate({ STAGING_PASSWORD: "   " }).active).toBe(false);
  });

  it("does not answer the gate's own address", async () => {
    const { base } = await start({});
    const res = await fetch(`${base}${GATE_PATH}`, {
      method: "POST",
      body: new URLSearchParams({ password: PASSWORD }),
    });
    // Falls through to whatever the app does with an unknown POST — never a
    // gate cookie.
    expect(cookiesOf(res).join(";")).not.toContain(GATE_COOKIE);
  });
});

describe("with STAGING_PASSWORD set — staging", () => {
  const env = { STAGING_PASSWORD: PASSWORD };

  it("refuses a password too short to be one, rather than appearing locked", () => {
    expect(() =>
      readStagingGate({
        STAGING_PASSWORD: "x".repeat(MIN_STAGING_PASSWORD_LENGTH - 1),
      })
    ).toThrow(/STAGING_PASSWORD/);
  });

  it("answers a page with the password form, not the app", async () => {
    const { active, base } = await start(env);
    expect(active).toBe(true);
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toContain("id=root");
    expect(body).toContain('name="password"');
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("refuses the API without the cookie, reads and writes alike", async () => {
    const { base } = await start(env);
    const read = await fetch(`${base}/api/trpc/auth.me`);
    expect(read.status).toBe(401);
    const write = await fetch(`${base}/api/trpc/bids.create`, {
      method: "POST",
    });
    expect(write.status).toBe(401);
    expect(await write.text()).not.toContain('"ok":true');
  });

  it("leaves /api/version open so a deploy can be checked", async () => {
    const { base } = await start(env);
    const res = await fetch(`${base}/api/version`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("a wrong password gets the form again and no cookie", async () => {
    const { base } = await start(env);
    const res = await fetch(`${base}${GATE_PATH}`, {
      method: "POST",
      body: new URLSearchParams({ password: "wrong-password-here", next: "/" }),
      redirect: "manual",
    });
    expect(res.status).toBe(401);
    expect(cookiesOf(res)).toEqual([]);
    expect(await res.text()).toContain("did not match");
  });

  it("the right password sets both cookies and sends you where you were going", async () => {
    const { base } = await start(env);
    const res = await fetch(`${base}${GATE_PATH}`, {
      method: "POST",
      body: new URLSearchParams({
        password: PASSWORD,
        next: "/bids/7/plans?x=1",
      }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bids/7/plans?x=1");
    const cookies = cookiesOf(res).join("\n");
    expect(cookies).toContain(`${GATE_COOKIE}=${stagingGateToken(PASSWORD)}`);
    expect(cookies).toMatch(new RegExp(`${GATE_COOKIE}=[^\\n]*HttpOnly`, "i"));
    expect(cookies).toContain(`${ENV_COOKIE}=staging`);
  });

  it("with the cookie, the app and the API answer normally", async () => {
    const { base } = await start(env);
    const headers = { cookie: `${GATE_COOKIE}=${stagingGateToken(PASSWORD)}` };
    const page = await fetch(`${base}/`, { headers });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("id=root");
    const api = await fetch(`${base}/api/trpc/bids.create`, {
      method: "POST",
      headers,
    });
    expect(api.status).toBe(200);
  });

  it("a cookie minted for a different password does not open it", async () => {
    const { base } = await start(env);
    const res = await fetch(`${base}/`, {
      headers: {
        cookie: `${GATE_COOKIE}=${stagingGateToken("some-other-password")}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("the readable env cookie alone does not open it", async () => {
    const { base } = await start(env);
    const res = await fetch(`${base}/`, {
      headers: { cookie: `${ENV_COOKIE}=staging` },
    });
    expect(res.status).toBe(401);
  });
});

describe("safeNextPath — the redirect after the password", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/settings/pricing#top")).toBe("/settings/pricing#top");
  });
  it("refuses anything that would leave the site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});
