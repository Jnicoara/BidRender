import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

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
      .catch(err =>
        console.warn("[BaselineAssemblies/Kits] Seed failed:", err)
      );
  });
}

startServer().catch(console.error);
