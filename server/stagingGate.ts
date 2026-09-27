/**
 * The staging password gate.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 * `staging.bidridge.com` is a practice copy of the site (references/
 * deploying.md § 11). It must not be usable, or even readable, by anyone who
 * wanders onto the address, and App Platform has no built-in way to put a
 * password on an app. So the app does it itself: every request is answered with
 * a password form until the browser holds a cookie proving it passed.
 *
 * ── It exists ONLY where STAGING_PASSWORD is set ────────────────────────────
 * Production never has that setting, and `registerStagingGate` then mounts
 * nothing at all — not a pass-through, nothing. That is the whole safety story
 * for the live site, and server/stagingGate.test.ts pins it: with the setting
 * absent, a page, the API and the gate's own address all behave exactly as if
 * this file did not exist.
 *
 * ── Why a form and a cookie, not HTTP basic auth ────────────────────────────
 * Basic auth pops the browser's own login dialog, which password managers
 * handle badly, which cannot say anything about what this site is, and which
 * blocks the automated browser used to check screens here. A form is one page
 * of HTML and behaves like every other login.
 *
 * ── The cookie ──────────────────────────────────────────────────────────────
 * `staging_gate` holds an HMAC of the password, not the password. HttpOnly, so
 * page scripts cannot read it. Changing STAGING_PASSWORD changes the HMAC, so
 * every browser that passed before is asked again — which is how you lock
 * someone back out.
 *
 * `bidridge_env=staging` is a second, READABLE cookie. It opens nothing (the
 * test says so); it exists so the client can draw the STAGING band from the
 * same single setting, rather than from a second one that could be forgotten.
 *
 * ── The one open path ───────────────────────────────────────────────────────
 * GET /api/version stays open, so `curl` can check which build is running
 * (deploying.md § 6) without a password. It reveals a build time and a commit
 * hash, nothing about any data.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { parse as parseCookieHeader } from "cookie";

/** The setting. Server-side only — never a `VITE_` name. */
export const STAGING_PASSWORD_VAR = "STAGING_PASSWORD";

/**
 * Shortest password accepted. Not a policy — the real one should be long and
 * random. This catches "staging" or "test" being typed in and the site then
 * LOOKING protected. Refusing to start says so; a weak gate says nothing.
 */
export const MIN_STAGING_PASSWORD_LENGTH = 12;

export const GATE_PATH = "/staging-gate";
export const GATE_COOKIE = "staging_gate";
export const ENV_COOKIE = "bidridge_env";

/** How long a browser stays let in. */
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type StagingGate =
  | { active: false }
  | { active: true; password: string };

export function readStagingGate(
  env: Record<string, string | undefined>
): StagingGate {
  const password = env[STAGING_PASSWORD_VAR]?.trim();
  if (!password) return { active: false };
  if (password.length < MIN_STAGING_PASSWORD_LENGTH) {
    throw new Error(
      `${STAGING_PASSWORD_VAR} is set but shorter than ` +
        `${MIN_STAGING_PASSWORD_LENGTH} characters. Refusing to start with a ` +
        `gate that only looks locked — set a long random value, or remove the ` +
        `setting entirely on a server that should have no gate.`
    );
  }
  return { active: true, password };
}

/** What the gate cookie holds for a given password. */
export function stagingGateToken(password: string): string {
  return createHmac("sha256", password)
    .update("bidridge-staging-gate-v1")
    .digest("hex");
}

/** Constant-time, and length-blind: both sides hashed to 32 bytes first. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function hasValidGateCookie(
  cookieHeader: string | undefined,
  password: string
): boolean {
  if (!cookieHeader) return false;
  const value = parseCookieHeader(cookieHeader)[GATE_COOKIE];
  if (!value) return false;
  return sameSecret(value, stagingGateToken(password));
}

/**
 * Where to send someone after the password. Only a path on THIS site: an
 * open redirect on a login form is a phishing tool.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  // After a wrong try the address bar reads GATE_PATH, and the form reports
  // that as where you were going — which would land you on the gate's own
  // address, outside the app.
  if (next === GATE_PATH || next.startsWith(`${GATE_PATH}?`)) return "/";
  return next;
}

function isHttps(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (proto ?? "").split(",")[0].trim() === "https";
}

function cookieOptions(req: Request) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isHttps(req),
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

function formPage(error: boolean): string {
  // Self-contained: no stylesheet, font or script from anywhere, because
  // nothing else on this server is reachable until the password is given.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>BidRidge staging</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f6f4; --card:#fff; --fg:#1a1a1a; --muted:#666; --line:#d8d8d4; --accent:#F5C518; --bad:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141414; --card:#1e1e1e; --fg:#eee; --muted:#aaa; --line:#333; --bad:#ff8a80; } }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--fg); font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif; padding:16px; }
  main { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:24px; }
  .tag { display:inline-block; background:var(--accent); color:#111; font-weight:700; font-size:12px; letter-spacing:.08em; padding:2px 8px; border-radius:4px; }
  h1 { font-size:20px; margin:12px 0 4px; }
  p { margin:0 0 16px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:14px; font-weight:600; margin-bottom:6px; }
  input { width:100%; font:inherit; padding:10px 12px; border:1px solid var(--line); border-radius:6px; background:transparent; color:inherit; }
  button { margin-top:12px; width:100%; font:inherit; font-weight:600; padding:10px; border:0; border-radius:6px; background:var(--accent); color:#111; cursor:pointer; }
  .err { color:var(--bad); font-size:14px; margin:0 0 12px; }
</style></head>
<body><main>
  <span class="tag">STAGING</span>
  <h1>BidRidge practice copy</h1>
  <p>This is not the live site. Enter the staging password to continue.</p>
  ${error ? '<p class="err" role="alert">That password did not match.</p>' : ""}
  <form method="post" action="${GATE_PATH}">
    <label for="password">Staging password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <input type="hidden" name="next" id="next" value="/">
    <button type="submit">Continue</button>
  </form>
</main>
<script>document.getElementById("next").value = location.pathname + location.search + location.hash;</script>
</body></html>`;
}

function refuse(req: Request, res: Response, error = false): void {
  res.status(401).setHeader("Cache-Control", "no-store");
  if (req.path.startsWith("/api/")) {
    res.json({
      error:
        "This is the BidRidge staging site. Open it in a browser and enter the staging password.",
    });
    return;
  }
  res.type("html").send(formPage(error));
}

/**
 * Mount the gate in front of everything, if and only if STAGING_PASSWORD is
 * set. Must be the FIRST thing registered on the app — a route mounted before
 * it is a route the gate does not cover. Returns whether it is active.
 */
export function registerStagingGate(
  app: Express,
  env: Record<string, string | undefined> = process.env
): boolean {
  const gate = readStagingGate(env);
  if (!gate.active) return false;
  const { password } = gate;

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  app.post(
    GATE_PATH,
    express.urlencoded({ extended: false, limit: "4kb" }),
    (req: Request, res: Response) => {
      const given =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (!sameSecret(given, password)) {
        refuse(req, res, true);
        return;
      }
      res.cookie(GATE_COOKIE, stagingGateToken(password), {
        ...cookieOptions(req),
        httpOnly: true,
      });
      res.cookie(ENV_COOKIE, "staging", cookieOptions(req));
      res.redirect(303, safeNextPath(req.body?.next));
    }
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && req.path === "/api/version") return next();
    if (hasValidGateCookie(req.headers.cookie, password)) {
      // The band cookie can be lost on its own — cleared by hand, or expired a
      // moment before the gate's. Then staging opens with no STAGING band,
      // which is the one thing the band exists to prevent (found on screen,
      // 2026-09-27). So anything let through gets it back.
      if (!parseCookieHeader(req.headers.cookie ?? "")[ENV_COOKIE]) {
        res.cookie(ENV_COOKIE, "staging", cookieOptions(req));
      }
      return next();
    }
    refuse(req, res);
  });

  return true;
}
