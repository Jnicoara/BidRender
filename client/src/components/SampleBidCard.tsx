/**
 * "Have a look at a finished bid before you build one."
 *
 * ── Offered, not imposed ─────────────────────────────────────────────────────
 * This card is the answer to the blank-dashboard problem, and it answers it
 * without putting anything in the account: the invitation is what greets a new
 * user, and sample data only exists once they say yes. Seeding automatically
 * would mean every new account's first bid is fiction and their first dashboard
 * total is a lie they have to learn to read past.
 *
 * ── It stops offering once there is real work ────────────────────────────────
 * The card is for an empty account. A contractor with three live bids does not
 * need an example, and a permanent "try the sample" panel on a working
 * dashboard is clutter that says the app has not noticed they started.
 *
 * Once the sample EXISTS it changes into a way back into it plus a way to be rid
 * of it, and that second half matters: sample data the user cannot easily
 * delete is sample data they will resent.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FlaskConical, Trash2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { SAMPLE_NOTICE } from "@shared/sampleProject";
import { errorText } from "@/lib/errorText";

export function SampleBidCard({
  onOpenBid,
}: {
  onOpenBid: (bidId: number) => void;
}) {
  const utils = trpc.useUtils();
  const access = useCompany();
  const [busy, setBusy] = useState(false);
  const { data } = trpc.sample.state.useQuery();

  const refresh = () => {
    void utils.sample.state.invalidate();
    void utils.bids.list.invalidate();
    void utils.bids.dashboard.invalidate();
    void utils.bids.search.invalidate();
    void utils.clients.list.invalidate();
  };

  const create = trpc.sample.create.useMutation({
    onError: e => toast.error(errorText(e)),
    onSuccess: result => {
      refresh();
      onOpenBid(result.bidId);
    },
    onSettled: () => setBusy(false),
  });

  const remove = trpc.sample.remove.useMutation({
    onError: e => toast.error(errorText(e)),
    onSuccess: () => {
      refresh();
      toast.success("Sample removed. Nothing of yours was touched.");
    },
    onSettled: () => setBusy(false),
  });

  // A viewer cannot create bids, so offering them one only produces an error.
  if (!access.can("bids.edit")) return null;
  if (!data) return null;

  const hasSample = data.sampleBidId !== null;

  // Nothing to say to an account that is already working and has no sample.
  if (!hasSample && !data.isNewAccount) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-[16rem]">
        {hasSample ? (
          <>
            <p className="text-sm font-medium">{SAMPLE_NOTICE.title}</p>
            <p className="text-xs text-muted-foreground">
              A priced retail buildout to explore. It is left out of your
              dashboard totals, and deleting it changes nothing of yours.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              Not sure where to start? Open a finished example.
            </p>
            <p className="text-xs text-muted-foreground">
              A small commercial retail buildout, priced end to end — line
              items, modifiers, charges and a proposal you can print. Clearly
              marked as a sample, and deletable in one click.
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {hasSample ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onOpenBid(data.sampleBidId!)}
            >
              Open sample
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                remove.mutate({ bidId: data.sampleBidId! });
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              create.mutate();
            }}
          >
            Show me an example bid
          </Button>
        )}
      </div>
    </div>
  );
}
