/**
 * opencv.js behind a module of our own, imported dynamically by the PDF
 * worker (pdfRenderer.worker.ts `loadOpenCv`) only when a scan is searched.
 *
 * Why this file exists: the emscripten module is a THENABLE. Imported
 * dynamically itself, `import("@techstark/opencv-js")` resolves to a
 * namespace carrying that `then`, so the import promise follows it — and
 * the module "resolves" to itself, forever. Seen 2026-10-01: the search sat
 * on "Looking across the sheet…" with nothing in the console. A STATIC
 * import, as here, never awaits anything, and this module's own namespace
 * has no `then`, so importing IT dynamically settles.
 */
import * as openCvNamespace from "@techstark/opencv-js";

/** The emscripten module as loaded; its runtime may still be starting. */
export function openCvModule(): Record<string, unknown> {
  const ns = openCvNamespace as unknown as Record<string, unknown>;
  return (ns.default ?? ns) as Record<string, unknown>;
}
