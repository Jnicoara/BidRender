/**
 * A bid's numbers, on their way to QuickBooks.
 *
 * ── It shows the lines before it writes the file ─────────────────────────────
 * Same reasoning as the materials list: this file becomes an invoice in someone
 * else's system, and the moment to notice a wrong customer or a missing charge
 * is before it is imported, not after an accountant has posted it. The total is
 * shown next to the bid's own Total due so the two can be compared at a glance
 * — that equality is the whole promise, and it should be visible rather than
 * merely asserted in a test.
 *
 * ── Warnings are shown here and never written into the file ──────────────────
 * A bid with no customer, or one that has not been won, still exports — the
 * user may have a reason. What it does not do is stay quiet about it, because
 * QuickBooks will reject a customerless row silently and an invoice for a lost
 * job is worse than a rejected one.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, FileSpreadsheet, Receipt } from "lucide-react";
import { UTF8_BOM } from "@shared/csvWrite";
import {
  accountingFilename,
  toQuickBooksCsv,
  type AccountingExport,
} from "@shared/accountingExport";
import { money } from "@/lib/money";

export function AccountingExportDialog({
  bidId,
  open,
  onOpenChange,
}: {
  bidId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = trpc.accounting.quickbooks.useQuery(
    { bidId },
    // A refusal for an incomplete bid refuses again; see ProposalPage.
    { enabled: open, retry: false }
  );
  const [downloaded, setDownloaded] = useState(false);

  const doc = data as AccountingExport | undefined;
  const empty = !doc || doc.lines.length === 0;

  const download = () => {
    if (!doc) return;
    const blob = new Blob([UTF8_BOM, toQuickBooksCsv(doc)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = accountingFilename(doc);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    toast.success("Accounting export saved.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Send to accounting</DialogTitle>
          <DialogDescription>
            This bid's numbers as a CSV QuickBooks Online can import — customer,
            reference, date and the money. No scope of work, and none of your
            overhead, profit or cost figures.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-8 rounded bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            // The server's sentence, which names the ERR- references and says
            // where to fix them. An empty dialog would read as "nothing to send".
            <p className="py-4 text-sm text-red-500">{error.message}</p>
          ) : (
            <div className="space-y-4">
              {doc && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">Reference </span>
                    <span className="font-mono">{doc.invoiceNo}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Customer </span>
                    {doc.customer || (
                      <span className="text-amber-400">not set</span>
                    )}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Date </span>
                    {new Date(doc.invoiceDate).toLocaleDateString()}
                  </span>
                </div>
              )}

              {doc && doc.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
                  {doc.warnings.map(warning => (
                    <p
                      key={warning}
                      className="text-xs text-amber-300 flex gap-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{warning}</span>
                    </p>
                  ))}
                </div>
              )}

              {empty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Receipt className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <p className="font-medium">Nothing to bill yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add assemblies to the bid and its numbers will appear here.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-medium py-2">Item</th>
                      <th className="text-left font-medium py-2">
                        Description
                      </th>
                      <th className="text-right font-medium py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc!.lines.map((line, i) => (
                      <tr
                        key={`${line.item}-${line.description}-${i}`}
                        className="border-b border-border/40"
                      >
                        <td className="py-1.5 pr-3">{line.item}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {line.description}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {money(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="py-2 text-right font-medium">
                        Total
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums font-semibold text-[#F5C518]">
                        {money(doc!.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* Said once, plainly. It is a one-time setup step in QuickBooks
                  with a visible consequence, as against letting QuickBooks
                  recompute the tax and quietly bill a different total. */}
              {!empty && doc!.lines.some(l => l.item === "Sales tax") && (
                <p className="text-xs text-muted-foreground">
                  Sales tax is carried as its own line at the exact figure on
                  this bid, and every line is marked non-taxable so QuickBooks
                  does not add its own on top. Point the "Sales tax"
                  product/service at your sales-tax liability account the first
                  time you import.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground flex-1">
            {downloaded
              ? "In QuickBooks: Settings → Import data → Invoices."
              : empty
                ? "Nothing to export yet."
                : `${doc!.lines.length} line${doc!.lines.length === 1 ? "" : "s"}.`}
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={empty || isLoading}
            onClick={download}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> QuickBooks CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
