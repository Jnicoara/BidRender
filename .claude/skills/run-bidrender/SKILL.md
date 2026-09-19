---
name: run-bidrender
description: Build, run, drive, screenshot, or smoke-test the BidRender (formerly HelixBid, and BidPhase before that) electrical estimating app locally. Use when asked to run or start the app, verify a change works in the real app, take a screenshot of a screen, log in locally, or exercise the tRPC API end to end.
---

# Running BidRender

Express + tRPC server with a React/Vite client, served by a **single dev
process** (Vite runs as Express middleware). MySQL via Drizzle.

**You cannot reach a single screen or API route without a session, and there is
no way to log in from a script.** That is the whole difficulty of running this
app, and both tools here exist to solve it.

> **Corrected 2026-09-18.** This section used to say the app is OAuth-only.
> **It is not**, and has not been since v5.127 — sign-in is email and password
> against our own `users` table (`server/routers/authRouter.ts`). CLAUDE.md
> names that belief as the single most expensive wrong sentence in these docs,
> because it makes a finished job look like "first build a login system".
>
> **The minting below still works, for a reason that survived the change:** the
> session cookie is a plain HS256 JWT that the app signs AND verifies itself
> (`server/_core/sdk.ts`), so a token minted with the same `JWT_SECRET` is
> indistinguishable from a real sign-in. What changed is that logging in
> properly now needs a password rather than an OAuth server — which a script
> still cannot do, so this is still the path.

| Tool                                          | Use it for                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `.claude/skills/run-bidrender/smoke.mjs`      | **Primary agent path.** Drives the running server over its real HTTP API. |
| `.claude/skills/run-bidrender/devsession.mjs` | Mints the session token. Needed for browser work.                         |

All paths below are relative to the repo root.

## Prerequisites

- Node 20+ and `pnpm` (repo is pinned to pnpm; `npx pnpm <cmd>` works too).
- A reachable MySQL, with `DATABASE_URL` in `.env`.

> **Corrected 2026-09-18.** `.env` used to ship `DATABASE_URL` and nothing
> else. It now also carries `JWT_SECRET`, `VITE_APP_ID`, `LOCAL_STORAGE_DIR`,
> `DISABLE_AI_FEATURES`, `DISABLE_SCHEDULED_JOBS` and `CRON_SECRET` — so
> `pnpm dev` on its own is enough, and the four-variable command line below is
> only needed if you are deliberately running with different values. Mint with
> the same `JWT_SECRET` the server is using, whichever that is.

```bash
pnpm install
pnpm db:push
```

**`pnpm db:push` is required on a fresh checkout, before the first `pnpm dev`.**
It applies the migrations in `drizzle/`, and skipping it does not fail loudly —
the server starts and serves pages, so it looks like a working app with broken
data. Re-run it after any `git pull` that brings new files into `drizzle/`.

What a skipped migration looks like:

- `[BaselineMaterials] Seed failed: ... Unknown column 'category'` in the server
  log, once at startup. The seeder is wrapped in a `.catch()`, so this is a
  warning, not a crash — easy to scroll past.
- Materials render as one flat list with no category sections, because the
  column the screen groups by does not exist.
- Per-material trade slang finds nothing: "1900", "gem box" and "load center"
  return no results, since `searchAliases` is missing too. Note that slang
  carried by the global `ALIAS_MAP` — "romex", "j box", "rheostat" — keeps
  working, so search looks fine until you try the item-specific terms.

These are all one missing migration, not a bug in the app. `pnpm db:push` fixes
them; the seeder repairs the data itself on the next start.

## Run the server (agent path)

```bash
pnpm dev
```

`.env` supplies `JWT_SECRET` and `VITE_APP_ID`, which is all the running server
needs today — `OAUTH_SERVER_URL` unset simply logs "Manus login is off" and
carries on. To run with different values, set them on the command line and mint
your token with the SAME `JWT_SECRET`; a mismatch is a silent 401.

```bash
JWT_SECRET=local-dev-secret VITE_APP_ID=local-dev pnpm dev
```

Wait for `Server running on http://localhost:3000/`. **Read that line** — the
server silently takes the next free port if 3000 is taken.

The baseline material library (28 rows) seeds itself on startup, idempotently.

## Drive the API — start here

```bash
JWT_SECRET=local-dev-secret node .claude/skills/run-bidrender/smoke.mjs
```

Finds the server (probing ports 3000–3005), authenticates, and exercises the
Materials library end to end: listing, create, fork-on-edit, revert, and the
refusals. Prints something like `31 passed, 0 failed` / `Smoke OK` and exits 0.

**The count grows as the script does, so treat it as a shape rather than a
number** — what matters is `0 failed` and exit 0. If the passing count is far
below what you last saw, the script is not running everything it should, which
is a different problem from a failure and is easy to read past. See CLAUDE.md
§ "A checklist that states a count".

It is **idempotent** — safe to re-run; it normalises any fork left by a
previous run and uses timestamped names for created rows.

Overrides: `BASE_URL=http://localhost:3002` to skip probing, `OPEN_ID=<openId>`
to act as a different user.

Extend this script when you add routers — it is the fastest way to exercise
real HTTP behaviour without a browser.

## Drive the UI (browser)

Only needed for client-side changes. There is no `chromium-cli`, Playwright,
or Puppeteer in this repo — use the Chrome extension browser tools.

1. Mint a token (`--list-users` first if unsure which openId is valid):

```bash
node .claude/skills/run-bidrender/devsession.mjs --list-users
JWT_SECRET=local-dev-secret node .claude/skills/run-bidrender/devsession.mjs test-open-id
```

2. Open `http://localhost:3000/`, then run the snippet the script printed in
   the page console. It sets `sessionStorage` and hard-reloads:

```js
sessionStorage.setItem("manus-cookie", "app_session_id=<TOKEN>");
location.reload();
```

3. Navigate to the screen, e.g. `http://localhost:3000/#/library/materials`.

**The reload is mandatory.** Routing is hash-based, so changing the hash does
not remount the app, and `auth.me` is a `retry: false` query — once it has
failed, the cached failure keeps the login form up forever.

### Drive the page through the DOM, not through coordinates

**Prefer finding an element and clicking it to clicking an (x, y).** Coordinate
clicks are the brittle half of browser work here: the toolbar wraps at narrow
widths, a popover shifts the layout under the cursor, and a stray click lands
on whatever moved into that spot.

```js
// Instead of clicking (464, 80) and hoping:
const trigger = [...document.querySelectorAll("button")].find(
  b => b.getAttribute("aria-label") === "Change conduit run type"
);
trigger.click();
await new Promise(r => setTimeout(r, 400));

// Read back what appeared, rather than screenshotting to find out:
[
  ...document.querySelectorAll("[data-radix-popper-content-wrapper] button"),
].map(b => b.textContent?.trim());
```

This also gives a better answer than a screenshot for anything textual — the
strings come back exactly, with no reading them off an image. **Screenshots are
still the only way to check LAYOUT** (see CLAUDE.md § "A layout or copy change
is NOT verified"), so the useful split is: drive with the DOM, judge with the
eye.

Aria labels are worth adding to icon-only controls for this reason alone. The
run-type chevrons carry them and that is how the palette was verified.

**When Chrome's page zoom gets stuck.** It happened on 2026-09-18: the zoom
went to 200% mid-session, every screenshot came back magnified, and the browser
tool refuses page-zoom shortcuts —
`"ctrl+0" was not pressed: page zoom keyboard shortcuts are not supported`.
`resize_window` does not reset it either. `window.devicePixelRatio` is how to
tell (2 where it was 1).

The workaround is the advice above: DOM-driven interaction does not care about
zoom at all, and `computer`'s `zoom` action still crops a region for reading.
Closing the tab does not help — Chrome remembers zoom per origin — so if it is
still wrong at the start of a session, reset it by hand in the browser before
relying on any coordinate click.

## Tests and typecheck

```bash
pnpm check                                  # tsc --noEmit — the correctness gate, no ESLint
pnpm test                                   # vitest, server/**/*.test.ts only
pnpm vitest run server/materialsRouter.test.ts
```

**`pnpm test` WRITES TO WHATEVER `DATABASE_URL` POINTS AT** — `vitest.config.ts`
loads `dotenv/config`, so every run reads `.env`, and `.env` points at the local
dev database. Nothing is mocked; the suites create, update and delete real rows.
There is no separate test database. To keep a run off your dev data, give it its
own (`dotenv/config` will not overwrite a variable already set):

```bash
DATABASE_URL='mysql://user:pass@127.0.0.1:3307/bidrender_test' pnpm test
```

`pnpm db:push` against that URL once first, to create the tables. See todo.md
§ "Working on this repo — traps".

## Gotchas

- **Missing `VITE_OAUTH_PORTAL_URL` crashes the entire app, not just login.**
  `getLoginUrl` does `new URL(undefined + "/app-auth")` inside `AuthGuard`,
  which is a whole-app error boundary. You get a red `TypeError: Invalid URL`
  page and _no_ route renders. It looks like a broken build; it is a missing
  env var.
- **A token needs non-empty `openId`, `appId` AND `name`.** `verifySession`
  rejects the whole token if any is blank, and the only trace is
  `[Auth] Session payload missing required fields` in the server log — the
  client just sees a 401. `VITE_APP_ID` unset is the usual cause.
- **The `openId` must already exist in `users`.** For an unknown one the
  server tries to sync the user from the OAuth server, which is not running,
  and fails with `Failed to sync user info`. Use `--list-users`.
- **Orphaned servers outlive the shell that started them.** `tsx watch`
  children survive killing the parent, keep holding ports, and — started with
  a different `JWT_SECRET` — answer first and reject your token. `smoke.mjs`
  detects this and says so explicitly. Clear them (PowerShell):

```powershell
foreach ($p in 3000..3005) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force } }
```

- **`materials.userId` is a real foreign key.** Inserting a material for a
  user id that does not exist fails with `ER_NO_REFERENCED_ROW_2`. Test
  suites must create their fixture users first.
- **vitest runs one test FILE at a time** — `fileParallelism: false` in
  `vitest.config.ts`, set because DB-backed suites were racing each other and
  producing lock-timeout failures that looked like noise. Tests within a file
  still share the connection. Keep using distinct fixture user ids
  (4242/9999 vs 4243/9998) anyway: the setting is a decision someone can
  reverse, and colliding ids would then delete each other's rows mid-run.
- **Don't put POSIX inline env vars in `package.json` scripts.** cmd.exe can't
  parse them and the script dies with `'NODE_ENV' is not recognized`. The repo
  uses `cross-env` for exactly this reason.
- **A bid has three per-bid surfaces**, all needing an id: `/bids/:id/plans`
  (takeoff), `/bids/:id/count` (keyboard counting, formerly Quick bid) and
  `/bids/:id/proposal`. None is reachable without a bid, which is why none of
  them is in the nav.
- **Six addresses now redirect.** `/matdb`, `/library/kits`,
  `/library/modifiers`, `/quickbid`, `/bids` and `/projects` were folded into
  other screens
  and are rewritten in the address bar when followed — so a URL you type may
  not be the URL you end up on. The table is `RETIRED_PATHS` in
  `client/src/lib/appRoutes.ts`, with `appRoutes.test.ts` against it. Supplier
  pricing is `#/library/materials?view=pricing`; kits and modifiers are
  `?view=` tabs on `#/library/assemblies`.
- **Supplier pricing and the catalog are one table.** Both views read and write
  the same `materials` rows — the catalog edits what a material _is_, the
  pricing view edits what it _costs_. They were separate screens on separate
  data long ago; they are not any more.

## Troubleshooting

| Symptom                                              | Cause / fix                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `TypeError: Invalid URL` red error page              | `VITE_OAUTH_PORTAL_URL` not set.                                                         |
| `smoke.mjs`: "answered but rejected the token"       | Stale server on a lower port with a different secret. Kill it (above) or set `BASE_URL`. |
| `Please login (10001)` from the API                  | `JWT_SECRET` mismatch, or blank `VITE_APP_ID` when minting.                              |
| Login form appears despite a valid token             | You changed the hash instead of reloading. Run `location.reload()`.                      |
| `Failed to sync user info` in server log             | That `openId` is not in `users`. Use `--list-users`.                                     |
| `'NODE_ENV' is not recognized`                       | Checkout predates the `cross-env` fix, or deps not installed. `pnpm install`.            |
| `ER_NO_REFERENCED_ROW_2` on a material insert        | The `userId` has no row in `users`.                                                      |
| `Unknown column '<name>'` in a `Seed failed` warning | Migrations not applied. `pnpm db:push`.                                                  |
| Materials show no category sections                  | Same — `pnpm db:push`, then restart.                                                     |
| "1900" / "gem box" find nothing, but "romex" works   | Same — `searchAliases` column is missing; only global-map slang still resolves.          |
