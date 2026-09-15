#!/usr/bin/env node
/**
 * devsession.mjs — mint a local session token for BidRender.
 *
 * WHY THIS EXISTS
 * The app is OAuth-only and there is no local OAuth server in development.
 * Without a session you cannot reach a single screen or API route. But the
 * session cookie is a plain HS256 JWT that the app signs AND verifies itself
 * (server/_core/sdk.ts: signSession / verifySession), so a token minted here
 * with the same JWT_SECRET is indistinguishable from a real login.
 *
 * THREE THINGS THE TOKEN MUST GET RIGHT — each one silently 401s otherwise:
 *   1. Signed with the same JWT_SECRET the server is running with.
 *   2. openId, appId AND name must all be non-empty strings. verifySession
 *      rejects the whole token if any is blank, logging only
 *      "[Auth] Session payload missing required fields".
 *   3. openId must already exist in the `users` table. For an unknown openId
 *      the server tries to sync the user from the OAuth server, which is not
 *      running, so auth fails with "Failed to sync user info".
 *
 * Usage:
 *   node .claude/skills/run-bidrender/devsession.mjs --list-users
 *   node .claude/skills/run-bidrender/devsession.mjs [openId]
 *
 * Env:
 *   JWT_SECRET    must match the running server. Default: local-dev-secret
 *   VITE_APP_ID   any non-empty string. Default: local-dev
 *   DATABASE_URL  only needed for --list-users (read from .env if present)
 */
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";

// Minimal .env reader — avoids depending on dotenv being installed.
function loadEnvFile() {
  try {
    for (const line of readFileSync(
      new URL("../../../.env", import.meta.url),
      "utf8"
    ).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env — fine, caller may have exported vars directly
  }
}
loadEnvFile();

const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret";
const APP_ID = process.env.VITE_APP_ID || "local-dev";
export const COOKIE_NAME = "app_session_id"; // shared/const.ts

/** Mint a session JWT. Exported so smoke.mjs can reuse it. */
export async function mintToken(openId = "test-open-id") {
  return new SignJWT({ openId, appId: APP_ID, name: "Dev" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30)
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function listUsers() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — cannot list users.");
    process.exit(1);
  }
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(
    "SELECT id, openId, role, email FROM users ORDER BY id"
  );
  await conn.end();
  if (!rows.length) {
    console.log("No users in the database. Any openId will fail auth.");
    console.log(
      "Create one, or run `pnpm test` once — the test suites insert fixture users."
    );
    return;
  }
  console.log("Usable openIds:\n");
  for (const r of rows)
    console.log(
      `  ${String(r.id).padEnd(6)} ${r.openId.padEnd(34)} ${r.role ?? ""}  ${r.email ?? ""}`
    );
}

async function mint(openId) {
  const token = await mintToken(openId);

  console.log(token);
  console.error("");
  console.error(
    "--- paste into the browser devtools console, then HARD RELOAD ---"
  );
  console.error(
    `sessionStorage.setItem(${JSON.stringify("manus-cookie")}, ${JSON.stringify(`${COOKIE_NAME}=${token}`)}); location.reload();`
  );
  console.error("");
  console.error("--- or use it directly against the API ---");
  console.error(
    `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/trpc/auth.me`
  );
}

// Only act as a CLI when invoked directly, not when imported by smoke.mjs.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
) {
  const arg = process.argv[2];
  if (arg === "--list-users") {
    await listUsers();
  } else {
    await mint(arg || "test-open-id");
  }
}
