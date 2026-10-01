/**
 * The built client as a browser receives it — real Express, real files in a
 * temp folder, real HTTP. See server/staticCaching.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ASSET_CACHE_CONTROL,
  SHELL_CACHE_CONTROL,
  serveBuiltClient,
  staticCacheControl,
} from "./staticCaching";

let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "bidridge-static-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><p>app</p>");
  writeFileSync(path.join(dir, "assets", "index-abc123.js"), "export {};");
  writeFileSync(path.join(dir, "sw.js"), "/* worker */");
  writeFileSync(path.join(dir, "favicon.svg"), "<svg/>");
  const app = express();
  serveBuiltClient(app, dir);
  server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe("a missing asset after a deploy", () => {
  it("is a 404, not the front page with a 200", async () => {
    // The fault: an old tab asked for an old hashed file, got index.html with
    // a 200, and the service worker kept that HTML as the script forever.
    const response = await fetch(`${base}/assets/BidRenderShell-gone999.js`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/text\/html/);
  });

  it("a real asset is served and marked immutable", async () => {
    const response = await fetch(`${base}/assets/index-abc123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(ASSET_CACHE_CONTROL);
  });
});

describe("the files that name the current build are always re-checked", () => {
  for (const url of ["/", "/index.html", "/sw.js", "/settings/pricing"]) {
    it(`${url} is no-cache`, async () => {
      const response = await fetch(`${base}${url}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(SHELL_CACHE_CONTROL);
    });
  }

  it("an unknown app path still opens the app", async () => {
    const response = await fetch(`${base}/settings/pricing`);
    expect(await response.text()).toContain("<p>app</p>");
  });

  it("other files keep the default", () => {
    expect(staticCacheControl("/favicon.svg")).toBeNull();
    expect(staticCacheControl("/manifest.webmanifest")).toBeNull();
  });
});
