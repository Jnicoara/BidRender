/**
 * "This assembly keeps running long — adjust it?"
 *
 * ── It lives where the change would land ─────────────────────────────────────
 * On the Assemblies library, not on the bid that produced the evidence. The
 * suggestion is about the library, the accept button edits the library, and a
 * card that offers to change something the user cannot see is a card they
 * cannot judge.
 *
 * ── Accept, dismiss, or leave it ─────────────────────────────────────────────
 * Three outcomes and no default. Nothing here is pre-selected, nothing times
 * out into an action, and closing the page changes nothing — the same
 * suggest-then-confirm shape the alias suggestions use. Dismissing is
 * remembered, so a contractor who knows why those three jobs ran long is not
 * asked again every time another one closes out.
 *
 * ── It states its evidence ───────────────────────────────────────────────────
 * How many jobs, and how far off. A suggestion a person cannot check is one
 * they either accept blindly or ignore entirely, and both are worse than the
 * number they already had.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Lightbulb, X } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { errorText } from "@/lib/errorText";

export function HourSuggestions() {
  const utils = trpc.useUtils();
  const access = useCompany();
  const { data: suggestions = [] } = trpc.closeout.suggestions.useQuery();

  const respond = trpc.closeout.respond.useMutation({
    onError: e => toast.error(errorText(e)),
    onSuccess: (_r, vars) => {
      void utils.closeout.suggestions.invalidate();
      void utils.assemblies.list.invalidate();
      toast.success(
        vars.action === "accept"
          ? "Base hours updated."
          : "Suggestion dismissed."
      );
    },
  });

  if (suggestions.length === 0) return null;

  // The accept button edits the library, so a role that cannot do that is shown
  // the evidence without a control that would only fail.
  const canApply = access.can("library.edit");

  return (
    <div className="space-y-2 mb-4">
      {suggestions.map(suggestion => {
        const current = Number(suggestion.currentHours);
        const suggested = Number(suggestion.suggestedHours);
        const ratio = Number(suggestion.ratio);
        const off = Math.round(Math.abs(ratio - 1) * 100);
        const direction = ratio > 1 ? "over" : "under";

        return (
          <div
            key={suggestion.id}
            className="rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/[0.04] px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <Lightbulb className="w-4 h-4 text-[#F5C518] shrink-0" />
            <div className="flex-1 min-w-[16rem]">
              <p className="text-sm">
                <span className="font-medium">{suggestion.assemblyName}</span>{" "}
                has run{" "}
                <span className="font-mono">
                  {off}% {direction}
                </span>{" "}
                its estimate across {suggestion.sampleSize} closed-out job
                {suggestion.sampleSize === 1 ? "" : "s"}.
              </p>
              <p className="text-xs text-muted-foreground">
                Base hours <span className="font-mono">{current}</span> →{" "}
                <span className="font-mono text-foreground">{suggested}</span>.
                Bids already priced are not affected.
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canApply && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate({ id: suggestion.id, action: "accept" })
                  }
                >
                  Use {suggested}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                disabled={respond.isPending || !canApply}
                onClick={() =>
                  respond.mutate({ id: suggestion.id, action: "dismiss" })
                }
                title={
                  canApply
                    ? "Dismiss — you will not be asked about this assembly again"
                    : "Your role cannot change the library"
                }
              >
                <X className="w-3.5 h-3.5 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
