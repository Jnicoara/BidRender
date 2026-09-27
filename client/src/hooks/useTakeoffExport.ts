/**
 * "Export takeoff (CSV)" — one action, used from the Takeoff screen and from
 * the bid's Send menu.
 *
 * Fetched FRESH on every click (`staleTime: 0`), never from a cached copy: a
 * file that leaves the app must hold what the drawing says now, and a cached
 * answer from when the screen opened is exactly the stale number CLAUDE.md
 * warns about — confident, plausible and out of date.
 */
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadFile } from "@/lib/downloadFile";
import { UTF8_BOM } from "@shared/csvWrite";
import { takeoffExportCsv, takeoffExportFilename } from "@shared/takeoffExport";

export function useTakeoffExport(bidId: number) {
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const exportCsv = async () => {
    setPending(true);
    try {
      const doc = await utils.takeoffExport.get.fetch(
        { bidId },
        { staleTime: 0 }
      );
      if (doc.bySheet.length === 0) {
        // No file: an export with nothing in it is a download to throw away.
        toast.info("Nothing has been counted or traced on this bid yet.");
        return;
      }
      downloadFile(
        // BOM, so Excel opens a name like 1/2" EMT as UTF-8.
        new Blob([UTF8_BOM, takeoffExportCsv(doc)], {
          type: "text/csv;charset=utf-8;",
        }),
        takeoffExportFilename(doc)
      );
      toast.success("Takeoff saved as CSV.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The export failed."
      );
    } finally {
      setPending(false);
    }
  };

  return { exportCsv, pending };
}
