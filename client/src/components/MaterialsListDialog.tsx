/**
 * The materials list, on screen and on its way to a supplier.
 *
 * ── It shows the list before it exports it ───────────────────────────────────
 * The obvious build is two buttons that download files. This shows the document
 * first, because the thing being sent out is the estimator's read of the
 * drawing, and the moment to notice that a receptacle type is missing is before
 * a supplier quotes without it — not after. The preview is also what makes the
 * "no pricing" promise checkable by the person relying on it: they can see for
 * themselves that there is no money on it.
 *
 * ── Available the whole time, not at the end ─────────────────────────────────
 * Nothing here waits for a bid to be priced, and the dialog opens on an empty
 * takeoff and says so plainly. Getting a supplier quote is how a contractor
 * FINDS OUT what things cost, so gating it behind pricing would withhold it in
 * the one moment it is worth having.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Ruler,
} from "lucide-react";
import {
  exportFilename,
  isEmptyList,
  toCsv,
  unitLabel,
  type MaterialsListDoc,
} from "@shared/materialsList";
import { buildMaterialsListPdf } from "@/lib/materialsListPdf";

/** Hand the browser a file without leaving the page. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MaterialsListDialog({
  bidId,
  open,
  onOpenChange,
}: {
  bidId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = trpc.materialsList.get.useQuery(
    { bidId },
    { enabled: open }
  );
  const [busy, setBusy] = useState(false);

  // superjson revives preparedOn as a Date; the exporters both rely on that.
  const doc = data as MaterialsListDoc | undefined;
  const empty = doc ? isEmptyList(doc) : true;

  const totals = useMemo(() => {
    if (!doc) return { items: 0, pieces: 0 };
    return {
      items: doc.entries.length,
      pieces: doc.entries.length + doc.measured.length,
    };
  }, [doc]);

  const exportCsv = () => {
    if (!doc) return;
    download(
      // BOM, so Excel opens a name like 1/2" EMT as UTF-8 rather than mojibake.
      new Blob(["﻿", toCsv(doc)], { type: "text/csv;charset=utf-8;" }),
      exportFilename(doc, "csv")
    );
    toast.success("Materials list saved as CSV.");
  };

  const exportPdf = () => {
    if (!doc) return;
    setBusy(true);
    try {
      buildMaterialsListPdf(doc).save(exportFilename(doc, "pdf"));
      toast.success("Materials list saved as PDF.");
    } catch {
      toast.error("The PDF could not be built. The CSV is unaffected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Materials list</DialogTitle>
          <DialogDescription>
            Quantities only, for sending to a supplier for a quote. No prices,
            no labor, none of your bid figures — send it before the bid is
            priced.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="h-8 rounded bg-muted/40 animate-pulse"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Package className="w-9 h-9 text-muted-foreground/30 mb-3" />
              <p className="font-medium">Nothing taken off yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Mark assemblies on a plan, or add them to the bid, and they will
                appear here as quantities to quote.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {doc!.entries.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-medium py-2">Item</th>
                      <th className="text-right font-medium py-2 w-20">Qty</th>
                      <th className="text-left font-medium py-2 pl-3 w-14">
                        Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc!.entries.map(entry => (
                      <tr
                        key={`${entry.name}-${entry.unit}`}
                        className="border-b border-border/40"
                      >
                        <td className="py-1.5 pr-3">
                          <div>{entry.name}</div>
                          {entry.sources.length > 0 && (
                            <div className="text-[0.7rem] text-muted-foreground">
                              {entry.sources.join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {entry.qty}
                        </td>
                        <td className="py-1.5 pl-3 text-muted-foreground">
                          {unitLabel(entry.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Visually separated, because a footage and a piece count are
                  different kinds of number and one must not be read as the
                  other on a counter. */}
              {doc!.measured.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                    <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                    Measured from the drawing
                  </div>
                  {doc!.measured.map(entry => (
                    <div
                      key={entry.label}
                      className="flex items-baseline justify-between gap-3 py-1"
                    >
                      <div className="min-w-0">
                        <div className="text-sm">{entry.label}</div>
                        <div className="text-[0.7rem] text-muted-foreground">
                          {entry.note}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-sm shrink-0">
                        {entry.feet} ft
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {doc!.notes.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  {doc!.notes.map(note => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground flex-1">
            {empty
              ? "Nothing to export yet."
              : `${totals.items} item${totals.items === 1 ? "" : "s"}${
                  doc!.measured.length > 0
                    ? ` and ${doc!.measured.length} measured length${
                        doc!.measured.length === 1 ? "" : "s"
                      }`
                    : ""
                }.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={empty || isLoading}
            onClick={exportCsv}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button
            size="sm"
            className={cn("gap-1.5")}
            disabled={empty || isLoading || busy}
            onClick={exportPdf}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
