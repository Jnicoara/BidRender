import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { BUILD_STAMP } from "../buildStamp";
import { APP_VERSION } from "../../shared/version";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { purgeArchivedBidsHandler } from "../scheduled/purgeArchivedBids";
import { BACKUP_PATH, backupToR2Handler } from "../scheduled/backupToR2";
import { PLAN_UPLOAD_PATH, planUploadHandler } from "../planUpload";
import { registerDiskStorageUploads } from "../diskStorage";
import {
  seedBaselineAssemblies,
  seedBaselineKits,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
  seedBaselineRunTypes,
} from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Which port to listen on — and in production, only that one.
 *
 * ── Why hunting for a free port is wrong once this is hosted ─────────────────
 * A hosting platform ASSIGNS the port and then probes it. Moving to the next
 * free one is the worst possible response: the app comes up healthy on 8081
 * while the health check knocks on 8080, so the deploy fails with a container
 * whose own logs say "Server running". That is a long evening.
 *
 * Failing immediately is the useful behaviour there. Something else holding the
 * assigned port in a container means something is genuinely wrong, and the
 * platform's restart is more likely to fix it than a quiet sidestep.
 *
 * ── Development keeps the old behaviour, on purpose ─────────────────────────
 * Locally a stale `pnpm dev` holding 3000 is ordinary, and the hunt is a small
 * kindness — the startup line prints the port it actually took. The cost of
 * being wrong is re-reading one line of output, not a failed deploy.
 */
async function resolvePort(): Promise<number> {
  const configured = process.env.PORT?.trim();
  const preferred = parseInt(configured || "3000", 10);

  if (!Number.isInteger(preferred) || preferred <= 0 || preferred > 65535) {
    throw new Error(
      `PORT is set to "${configured}", which is not a port number.`
    );
  }

  if (ENV.isProduction) {
    if (await isPortAvailable(preferred)) return preferred;
    throw new Error(
      `Port ${preferred} is already in use. In production the port is not ` +
        `negotiable — the platform assigns it and health-checks exactly it, ` +
        `so listening anywhere else would look healthy here and fail there.`
    );
  }

  const port = await findAvailablePort(preferred);
  if (port !== preferred) {
    console.log(`Port ${preferred} is busy, using port ${port} instead`);
  }
  return port;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // The same-origin plan upload, mounted BEFORE the body parsers so the PDF
  // arrives as a stream this handler forwards, rather than something a parser
  // has already tried to read. It is the fallback used when the browser is
  // blocked from PUTting to storage directly — see server/planUpload.ts.
  app.post(PLAN_UPLOAD_PATH, planUploadHandler);
  // Uploads into on-disk storage when LOCAL_STORAGE_DIR is set. Before the body
  // parsers for the same reason: the file arrives as a stream to write out.
  registerDiskStorageUploads(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Scheduled (cron) callbacks. `/api/scheduled/*` is NOT auto-registered, and
  // must be mounted before the Vite/static fallthrough or the platform's POST
  // lands on the SPA index instead of the handler.
  //
  // DISABLE_SCHEDULED_JOBS=true leaves both unmounted, for a machine the
  // platform scheduler cannot reach and whose copy of the data must not be
  // purged or backed up on a timer.
  if (process.env.DISABLE_SCHEDULED_JOBS === "true") {
    app.post("/api/scheduled/*", (_req, res) => {
      res.status(404).json({ error: "Scheduled jobs are turned off here." });
    });
  } else {
    app.post("/api/scheduled/purgeArchivedBids", purgeArchivedBidsHandler);
    // The nightly export to Cloudflare R2. Path comes from the handler module so
    // the mount, the registration command and the test cannot drift apart.
    app.post(BACKUP_PATH, backupToR2Handler);
  }
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  /**
   * What build is running — the deploy check, and the only one that cannot
   * quietly pass.
   *
   * Unauthenticated and mounted before the SPA fallthrough, so it can be
   * curled from anywhere the site is reachable:
   *
   *     curl -s https://bidridge.com/api/version
   *
   * It exists because the check it replaces could not fail. The sidebar tag
   * read APP_VERSION, a hand-typed string, and CLAUDE.md and
   * references/deploying.md both ended the deploy by confirming that it had
   * moved. On 2026-09-18 it had read v6.1 for thirty-three commits, so every
   * one of those confirmations was a pass with nothing behind it.
   *
   * `builtAt` moves on every build with nothing for anyone to remember, which
   * is the entire point. It carries no secret: a build time and a short commit
   * hash of a private repository tell an outsider nothing they could use, and
   * a check that needs a session is a check nobody runs from a phone at 6am.
   */
  app.get("/api/version", (_req, res) => {
    res.set("Cache-Control", "no-store").json({
      version: APP_VERSION,
      builtAt: BUILD_STAMP.builtAt,
      commit: BUILD_STAMP.commit,
      mode:
        process.env.NODE_ENV === "development" ? "development" : "production",
      now: new Date().toISOString(),
    });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = await resolvePort();

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Library seeds. Assemblies MUST run last: their recipes are resolved by
    // name against the material and modifier catalogs, and an assembly whose
    // materials have not landed yet is skipped rather than half-built.
    Promise.all([
      seedBaselineMaterials().catch(err =>
        console.warn("[BaselineMaterials] Seed failed:", err)
      ),
      seedBaselineLaborRates().catch(err =>
        console.warn("[BaselineLaborRates] Seed failed:", err)
      ),
      seedBaselineModifiers().catch(err =>
        console.warn("[BaselineModifiers] Seed failed:", err)
      ),
    ])
      .then(() => seedBaselineAssemblies())
      // Kits reference assemblies by name, so they come last of all.
      .then(() => seedBaselineKits())
      // Run types resolve their raceway and conductor by catalog name, so they
      // wait for materials too. Independent of assemblies and kits; chained
      // rather than parallel only to keep one failure from hiding another.
      .then(() => seedBaselineRunTypes())
      .catch(err =>
        console.warn("[BaselineAssemblies/Kits] Seed failed:", err)
      );
  });
}

/**
 * A server that failed to start must EXIT NON-ZERO.
 *
 * `catch(console.error)` printed the reason and then let the process fall off
 * the end of its event loop with status 0 — so a container that never bound a
 * port reported success. A hosting platform reads the exit code: a clean exit
 * looks like an app that chose to stop, and the useful signals (a crash loop, a
 * failed deploy rather than a silently dead one) all hang off a non-zero code.
 *
 * Found while testing the port change: refusing a taken port printed exactly
 * the right sentence and then exited 0, which is the failure mode this whole
 * change set was trying to remove.
 */
startServer().catch(error => {
  console.error("[startup] the server could not start:", error);
  process.exit(1);
});
