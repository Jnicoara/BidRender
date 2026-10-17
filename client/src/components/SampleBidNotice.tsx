/**
 * The banner on the sample bid itself.
 *
 * ── Why a banner here and only a badge elsewhere ─────────────────────────────
 * On a list, a badge is enough: the row sits beside real ones and the contrast
 * does the work. Inside the bid there is nothing to contrast against — the
 * screen is identical to a real bid's, which is exactly the property that makes
 * the sample useful and exactly what makes forgetting easy. So this one says it
 * in a sentence rather than a word.
 *
 * It says three things in the order a person needs them: what this is, that
 * editing it is safe, and how to be rid of it. The middle one is the one that
 * unlocks the feature — a user who is not sure whether they are allowed to
 * touch it will not touch it, and a sample nobody edits teaches nothing.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FlaskConical, Trash2 } from "lucide-react";
import { SAMPLE_NOTICE } from "@shared/sampleProject";
import { errorText } from "@/lib/errorText";

export function SampleBidNotice({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);

  const remove = trpc.sample.remove.useMutation({
    onError: e => toast.error(errorText(e)),
    onSuccess: () => {
      void utils.invalidate();
      toast.success("Sample removed. Nothing of yours was touched.");
      window.location.hash = "/dashboard";
    },
    onSettled: () => setBusy(false),
  });

  return (
    <div className="mb-4 rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/[0.04] px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
      <FlaskConical className="w-4 h-4 text-[#F5C518] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[18rem]">
        <p className="text-sm font-medium">{SAMPLE_NOTICE.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {SAMPLE_NOTICE.body}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive shrink-0"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          remove.mutate({ bidId });
        }}
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete sample
      </Button>
    </div>
  );
}
