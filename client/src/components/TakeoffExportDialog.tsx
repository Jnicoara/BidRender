/**
 * "Export takeoff" — the choice of whether the file carries PRICES, made on
 * purpose each time (owner, 2026-09-29; quote-app-panel-plan.md § 4).
 *
 * One component, opened from the Takeoff screen and from the bid's Send menu,
 * so the two places cannot drift into offering the choice differently
 * (CLAUDE.md § "Copying a layout does not copy the behaviour with it").
 *
 * ── Unticked every time ──────────────────────────────────────────────────────
 * The box starts unticked whenever the dialog opens, and nothing remembers it.
 * A remembered "on" is how a file carrying the contractor's costs gets
 * forwarded to a supply house by accident. The box is not offered at all to
 * someone who cannot see prices, and the server refuses it for them too.
 */
import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/hooks/useCompany";
import { useTakeoffExport } from "@/hooks/useTakeoffExport";
import { mayIncludePrices } from "@shared/takeoffExport";

export function TakeoffExportDialog({
  bidId,
  open,
  onOpenChange,
}: {
  bidId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const company = useCompany();
  const canPrice = mayIncludePrices(
    company.can("pricing.view") ? ["pricing.view"] : []
  );
  const takeoffExport = useTakeoffExport(bidId);
  const [includePrices, setIncludePrices] = useState(false);
  // Unticked every time it opens.
  useEffect(() => {
    if (open) setIncludePrices(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export takeoff</DialogTitle>
          <DialogDescription>
            Every count and run, by sheet and for the whole bid, as a CSV for a
            spreadsheet.
          </DialogDescription>
        </DialogHeader>

        {canPrice && (
          <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm cursor-pointer">
            <Checkbox
              checked={includePrices}
              onCheckedChange={v => setIncludePrices(v === true)}
              className="mt-0.5"
              aria-describedby="takeoff-export-prices-note"
            />
            <span>
              <span className="font-medium">Include prices</span>
              <span
                id="takeoff-export-prices-note"
                className="block text-xs text-muted-foreground"
              >
                Your COSTS on the whole-bid rows, as the bid's Cost column shows
                them — before markup, overhead, profit and tax. Internal: do not
                send this file to a customer or a supplier.
              </span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={takeoffExport.pending}
            onClick={async () => {
              await takeoffExport.exportCsv({
                includePrices: canPrice && includePrices,
              });
              onOpenChange(false);
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {takeoffExport.pending
              ? "Preparing…"
              : includePrices
                ? "Download with prices"
                : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
