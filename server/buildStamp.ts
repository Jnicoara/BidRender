/**
 * The build stamp as the SERVER knows it — read once, from the file the build
 * wrote beside the bundle.
 *
 * Written by scripts/build.mts. Absent when running from source with tsx, which
 * is not an error: it is how `/api/version` reports a development server as one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildStamp } from "../shared/buildStamp";

const EMPTY: BuildStamp = { builtAt: null, commit: null };

/**
 * Read at module load rather than per request. The file cannot change under a
 * running process — a new build is a new process — so re-reading it would only
 * add a disk hit to a route whose whole value is being trivially cheap.
 */
function read(): BuildStamp {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(path.join(here, "build-stamp.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<BuildStamp>;
    return {
      builtAt: typeof parsed.builtAt === "string" ? parsed.builtAt : null,
      commit: typeof parsed.commit === "string" ? parsed.commit : null,
    };
  } catch {
    return EMPTY;
  }
}

export const BUILD_STAMP: BuildStamp = read();
