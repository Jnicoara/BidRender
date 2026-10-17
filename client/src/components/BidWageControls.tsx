/**
 * PREVAILING WAGE on a bid — under "Pricing settings", below the method
 * (bid-methods-plan.md § 5). Absent until the company has a wage set or the
 * bid already uses one: most bids are not public work.
 *
 *   - the set this job uses (a Draft only, like the method — owner Q14);
 *   - "Will registered apprentices work this job?" when the set has an
 *     apprentice row. Unanswered is never yes: apprentice hours cost at the
 *     journeyman row, and the screen says so;
 *   - each classification's prevailing cost on this job beside the role's
 *     own rate, with what is wrong in words (`bidWageRows`).
 *
 * It MOVES NO NUMBER, and says so in one line: bid lines keep the rate they
 * froze, because a line does not record which role it is (re-costing is
 * morning-questions-b.md Q9). A comparison that looked like a price change
 * would be the confident wrong number CLAUDE.md warns about.
 */
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/errorText";
import { Button } from "@/components/ui/button";
import { localDay } from "@shared/prevailingWage";

export function BidWageControls({
  bidId,
  canEdit,
}: {
  bidId: number;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const q = trpc.bids.wageForBid.useQuery({
    id: bidId,
    today: localDay(new Date()),
  });
  const onSettled = () => void utils.bids.wageForBid.invalidate({ id: bidId });
  const pick = trpc.bids.setWageSet.useMutation({
    onError: e => toast.error(errorText(e)),
    onSettled,
  });
  const answer = trpc.bids.setRegisteredApprentices.useMutation({
    onError: e => toast.error(errorText(e)),
    onSettled,
  });
  const d = q.data;
  if (!d || (d.sets.length === 0 && !d.set)) return null;
  const editable = canEdit && d.changeable;

  return (
    <div className="space-y-2" data-testid="bid-wage">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Prevailing wage</span>
        {editable ? (
          <select
            aria-label="Prevailing wage set for this job"
            className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs"
            value={d.set?.id ?? ""}
            disabled={pick.isPending}
            onChange={e =>
              pick.mutate({
                id: bidId,
                wageRateSetId:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">None — not public work</option>
            {d.set && !d.sets.some(s => s.id === d.set!.id) && (
              <option value={d.set.id}>{d.set.name} (archived)</option>
            )}
            {d.sets.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium">{d.set?.name ?? "None"}</span>
        )}
      </div>

      {d.set && (
        <>
          {d.set.reminder && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {d.set.reminder}
            </p>
          )}

          {d.asksApprentices && (
            <div className="space-y-1">
              <p className="text-xs">
                Will registered apprentices work this job?
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="Registered apprentices"
              >
                {(
                  [
                    [true, "Yes"],
                    [false, "No"],
                  ] as const
                ).map(([v, label]) => (
                  <Button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={d.registeredApprentices === v}
                    size="sm"
                    variant={
                      d.registeredApprentices === v ? "default" : "outline"
                    }
                    className="h-7 text-xs"
                    disabled={!editable || answer.isPending}
                    onClick={() => answer.mutate({ id: bidId, answer: v })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-1.5">
            {d.rows.map((r, i) => (
              <li
                key={i}
                className="rounded-md border border-border px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                  <span className="font-medium">
                    {r.label}
                    {r.roleName && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {r.roleName}
                      </span>
                    )}
                  </span>
                  <span className="font-mono">
                    {r.prevailingCost === null
                      ? "—"
                      : `$${r.prevailingCost.toFixed(2)}/h prevailing`}
                    {r.roleCost !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · ${r.roleCost.toFixed(2)}/h yours
                      </span>
                    )}
                  </span>
                </div>
                {r.warnings.map(w => (
                  <p
                    key={w}
                    className="text-[11px] text-amber-700 dark:text-amber-300"
                  >
                    {w}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            This compares — it does not re-price. Lines on this bid keep the
            rate they were added at; to price at the prevailing cost, set each
            role's rate on Labor rates before adding lines.
          </p>
        </>
      )}
    </div>
  );
}
