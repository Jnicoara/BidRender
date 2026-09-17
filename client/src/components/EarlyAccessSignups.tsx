/**
 * The waitlist, read back.
 *
 * ── Why this screen exists at all ───────────────────────────────────────────
 * A signup form that shows a thank-you and keeps no record has lost every
 * address typed into it, and nobody finds out until the day someone asks how
 * many people signed up. This is the other half of that promise: the landing
 * page writes to early_access_signups, and this reads it — on screen, and as a
 * CSV for anywhere else.
 *
 * ── Download without a round trip ───────────────────────────────────────────
 * The CSV is built on the server and handed over as text, then turned into a
 * download here with a Blob. That avoids adding a bespoke Express route with
 * its own auth check beside the tRPC one that already exists — two auth paths
 * for one export is how one of them ends up wrong.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, Download, Mail, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function EarlyAccessSignups() {
  const utils = trpc.useUtils();
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, refetch } = trpc.earlyAccess.list.useQuery({
    limit: 500,
  });

  const setNotified = trpc.earlyAccess.setNotified.useMutation({
    // Optimistic: ticking someone off is a one-field edit and must land
    // instantly, per CLAUDE.md § Responsiveness.
    onMutate: async ({ id, notified }) => {
      await utils.earlyAccess.list.cancel();
      const snapshot = utils.earlyAccess.list.getData({ limit: 500 });
      utils.earlyAccess.list.setData({ limit: 500 }, old =>
        old
          ? {
              ...old,
              signups: old.signups.map(row =>
                row.id === id
                  ? { ...row, notifiedAt: notified ? new Date() : null }
                  : row
              ),
            }
          : old
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      if (context?.snapshot)
        utils.earlyAccess.list.setData({ limit: 500 }, context.snapshot);
      toast.error(error.message);
    },
    onSettled: () => void utils.earlyAccess.list.invalidate(),
  });

  const download = async () => {
    setDownloading(true);
    try {
      const result = await utils.earlyAccess.exportCsv.fetch();
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bidridge-early-access-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${result.count} ${result.count === 1 ? "signup" : "signups"}.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That export failed."
      );
    } finally {
      setDownloading(false);
    }
  };

  const signups = data?.signups ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Early access signups
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Addresses submitted from the landing page. Tick one off once you
            have contacted them.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={download}
            disabled={downloading || signups.length === 0}
          >
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading signups…
          </div>
        ) : signups.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Mail className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No signups yet. They will appear here the moment somebody submits
              the form on the landing page.
            </p>
          </div>
        ) : (
          signups.map(row => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
            >
              <button
                type="button"
                onClick={() =>
                  setNotified.mutate({
                    id: row.id,
                    notified: row.notifiedAt === null,
                  })
                }
                className={cn(
                  "h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors",
                  row.notifiedAt
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border text-transparent hover:border-primary/50"
                )}
                aria-label={
                  row.notifiedAt
                    ? `Mark ${row.email} as not contacted`
                    : `Mark ${row.email} as contacted`
                }
                aria-pressed={row.notifiedAt !== null}
              >
                <Check className="w-3 h-3" />
              </button>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm truncate",
                    row.notifiedAt && "text-muted-foreground line-through"
                  )}
                >
                  {row.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatWhen(row.createdAt)} · {row.tradeId}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {data && data.total > signups.length && (
        <p className="text-xs text-muted-foreground mt-2">
          Showing the {signups.length} most recent of {data.total}. Export the
          CSV for the full list.
        </p>
      )}
      {data && data.total > 0 && data.total === signups.length && (
        <p className="text-xs text-muted-foreground mt-2">
          {data.total} {data.total === 1 ? "signup" : "signups"} total.
        </p>
      )}
    </div>
  );
}

export default EarlyAccessSignups;
