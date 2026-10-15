import { type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, RotateCcw, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { RETENTION_DAYS } from "@shared/retention";
import { errorText } from "@/lib/errorText";

/**
 * Recently deleted — ONE place to find and put back anything archived
 * (owner, 2026-10-14: "one easy-to-find Trash / Recently deleted place with
 * Restore").
 *
 * Nothing new is stored: every kind of thing in here already had its own
 * archive and its own `restore` — bids on the Archive screen, and materials,
 * assemblies, kits, modifiers and clients each on an "Archived" tab of their
 * own screen. This page reads those same lists and calls those same
 * restores, so it cannot disagree with them; it only saves anybody having to
 * know six places to look.
 *
 * "Delete forever" stays where it was — on the bid Archive and each screen's
 * Archived tab — because each has its own confirmation and its own rules
 * (a library row other rows point at is never deleted, only withdrawn). This
 * page is for getting things BACK, which is the job people come looking for.
 *
 * Only bids are cleared on a clock (RETENTION_DAYS after archiving, by the
 * nightly purge); library rows and clients stay archived until somebody
 * deletes them. The wording says which.
 */
export default function TrashPage({
  onOpenBidArchive,
  go,
}: {
  onOpenBidArchive: () => void;
  /** Open a screen's own Archived tab, for "see all". */
  go: (hash: string) => void;
}) {
  const utils = trpc.useUtils();

  const bids = trpc.bids.archived.useQuery();
  const materials = trpc.materials.list.useQuery({ status: "archived" });
  const assemblies = trpc.assemblies.list.useQuery({ status: "archived" });
  const kits = trpc.kits.list.useQuery({ status: "archived" });
  const modifiers = trpc.modifiers.list.useQuery({ status: "archived" });
  const clients = trpc.clients.list.useQuery({ archived: true });

  const done = (name: string) => toast.success(`${name} is back.`);
  const failed = (error: { message: string }) => toast.error(errorText(error));

  const restoreBid = trpc.bids.restore.useMutation({
    onError: failed,
    onSettled: () => {
      void utils.bids.archived.invalidate();
      void utils.bids.dashboard.invalidate();
      void utils.bids.search.invalidate();
      void utils.bids.list.invalidate();
    },
  });
  const restoreMaterial = trpc.materials.restore.useMutation({
    onError: failed,
    onSettled: () => void utils.materials.invalidate(),
  });
  const restoreAssembly = trpc.assemblies.restore.useMutation({
    onError: failed,
    onSettled: () => void utils.assemblies.invalidate(),
  });
  const restoreKit = trpc.kits.restore.useMutation({
    onError: failed,
    onSettled: () => void utils.kits.invalidate(),
  });
  const restoreModifier = trpc.modifiers.restore.useMutation({
    onError: failed,
    onSettled: () => void utils.modifiers.invalidate(),
  });
  const restoreClient = trpc.clients.restore.useMutation({
    onError: failed,
    onSettled: () => void utils.clients.invalidate(),
  });

  const loading =
    bids.isLoading ||
    materials.isLoading ||
    assemblies.isLoading ||
    kits.isLoading ||
    modifiers.isLoading ||
    clients.isLoading;

  const clientRows = clients.data?.items ?? [];
  const total =
    (bids.data?.length ?? 0) +
    (materials.data?.length ?? 0) +
    (assemblies.data?.length ?? 0) +
    (kits.data?.length ?? 0) +
    (modifiers.data?.length ?? 0) +
    clientRows.length;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="page-header border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Trash2 className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Recently deleted</h1>
            <p className="text-xs text-muted-foreground">
              Everything you archived or deleted, in one place. Restore puts it
              back exactly as it was. Bids are deleted for good {RETENTION_DAYS}{" "}
              days after you archive them; everything else waits for you.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
        <div className="max-w-4xl space-y-4">
          {loading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1].map(i => (
                <div
                  key={i}
                  className="h-24 rounded-xl border border-border bg-card animate-pulse"
                />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing here.</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                When you archive a bid, a client or a library item, it lands
                here, and Restore brings it back.
              </p>
            </div>
          ) : (
            <>
              <Section
                title="Bids"
                rows={(bids.data ?? []).map(b => ({
                  id: b.id,
                  name: b.name,
                  detail: `Deleted for good ${new Date(b.purgeDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${b.daysRemaining} day${b.daysRemaining === 1 ? "" : "s"} left`,
                }))}
                onRestore={row =>
                  restoreBid.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
                seeAll={{
                  label: "All deleted bids",
                  onClick: onOpenBidArchive,
                }}
              />
              <Section
                title="Materials"
                rows={(materials.data ?? []).map(m => ({
                  id: m.id,
                  name: m.name,
                }))}
                onRestore={row =>
                  restoreMaterial.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
                seeAll={{
                  label: "Materials › Archived",
                  onClick: () => go("/library/materials"),
                }}
              />
              <Section
                title="Assemblies"
                rows={(assemblies.data ?? []).map(a => ({
                  id: a.id,
                  name: a.name,
                }))}
                onRestore={row =>
                  restoreAssembly.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
              />
              <Section
                title="Kits"
                rows={(kits.data ?? []).map(k => ({ id: k.id, name: k.name }))}
                onRestore={row =>
                  restoreKit.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
              />
              <Section
                title="Modifiers"
                rows={(modifiers.data ?? []).map(m => ({
                  id: m.id,
                  name: m.name,
                }))}
                onRestore={row =>
                  restoreModifier.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
              />
              <Section
                title="Clients"
                rows={clientRows.map(c => ({ id: c.id, name: c.name }))}
                more={
                  clients.data?.nextCursor
                    ? "More on the Clients screen"
                    : undefined
                }
                onRestore={row =>
                  restoreClient.mutate(
                    { id: row.id },
                    { onSuccess: () => done(row.name) }
                  )
                }
                seeAll={{
                  label: "Clients › Archived",
                  onClick: () => go("/clients"),
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type Row = { id: number; name: string; detail?: string };

/** One kind of thing. Says nothing at all when it holds nothing. */
function Section({
  title,
  rows,
  onRestore,
  seeAll,
  more,
}: {
  title: string;
  rows: Row[];
  onRestore: (row: Row) => void;
  seeAll?: { label: string; onClick: () => void };
  more?: string;
}): ReactNode {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
        {seeAll && (
          <button
            onClick={seeAll.onClick}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {seeAll.label}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {rows.map(row => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{row.name}</div>
              {row.detail && (
                <div className="text-xs text-muted-foreground">
                  {row.detail}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => onRestore(row)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore
            </Button>
          </li>
        ))}
      </ul>
      {more && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          {more}
        </div>
      )}
    </section>
  );
}
