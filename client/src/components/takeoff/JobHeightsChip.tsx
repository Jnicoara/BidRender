/**
 * This job's heights, as a chip in the top bar beside the scale.
 *
 * ── Why it sits next to the scale ────────────────────────────────────────────
 * They are the same kind of thing and the pairing is worth making visible: the
 * SCALE is what makes flat distance measurable, and the HEIGHTS are what make
 * vertical distance measurable. A sheet with no scale cannot measure a traced
 * run; a job with no distribution height cannot measure a drop. Both say so
 * plainly in the bar rather than leaving a quiet zero in a total.
 *
 * ── No company-default warning here, deliberately ────────────────────────────
 * `CLAUDE.md` § Company defaults: overriding on one job is an ordinary local
 * edit, and repeating the yellow-triangle warning here would teach people to
 * read past it on the Settings screen, which is the one place it matters.
 * What this panel does instead is say, for every number, WHICH level it came
 * from — so you can tell at a glance what you have changed on this job.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowUpDown, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HeightFields } from "@/components/HeightFields";
import { formatFeetInches } from "@shared/takeoffGeometry";
import type { HeightRow } from "@shared/takeoffHeights";

function levelOf(source: HeightRow["source"]): string {
  if (source === "job") return "this job";
  if (source === "company") return "company";
  if (source === "shipped") return "starter";
  return "not set";
}

export function JobHeightsChip({ bidId }: { bidId: number }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const query = trpc.takeoffHeights.forBid.useQuery({ bidId });

  const refresh = () => {
    utils.takeoffHeights.forBid.invalidate({ bidId });
    // The runs panel prices its verticals from these, so it has to re-read.
    utils.takeoffRuns.invalidate();
  };
  const onError = (error: { message: string }) => toast.error(error.message);

  const setDistribution = trpc.takeoffHeights.setBidDistribution.useMutation({
    onSuccess: refresh,
    onError,
  });
  const setHeight = trpc.takeoffHeights.setBidHeight.useMutation({
    onSuccess: refresh,
    onError,
  });
  const clearHeight = trpc.takeoffHeights.clearBidHeight.useMutation({
    onSuccess: refresh,
    onError,
  });

  const data = query.data;
  const distribution = data?.distributionHeight;
  const unset = distribution?.inches == null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          title="The heights this job's drops and rises are measured from"
        >
          {unset ? (
            <TriangleAlert className="w-3.5 h-3.5 text-[#F5C518]" />
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-[#38BDF8]" />
          )}
          {/*
            "No heights" was insider language — it names the setting, not the
            consequence, and the consequence is the part that costs money.
            Reworded 2026-09-24 to say what is actually happening: the vertical
            footage is not being counted.
          */}
          {unset
            ? "Drop heights not set — drops not counted"
            : `Runs at ${formatFeetInches(distribution!.inches!)}`}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-3 space-y-3">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            This job's heights
          </div>
          {unset && (
            <p className="text-xs text-[#F5C518]">
              No distribution height is set, so no drop or rise is counted on
              any run. Set it here for this job, or in Settings for every job.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs">Pipe runs at</span>
            <HeightFields
              compact
              value={distribution?.inches ?? null}
              belowFloor={false}
              ariaPrefix="Distribution height"
              onSave={inches => setDistribution.mutate({ bidId, inches })}
            />
          </div>
          <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
            <span>{levelOf(distribution?.source ?? "unset")}</span>
            {distribution?.source === "job" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1 text-[0.7rem]"
                onClick={() => setDistribution.mutate({ bidId, inches: null })}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                {data?.companyDistributionInches == null
                  ? "Clear"
                  : `Back to company (${formatFeetInches(
                      data.companyDistributionInches
                    )})`}
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-2 space-y-1.5 max-h-72 overflow-y-auto">
          {(data?.types ?? [])
            .filter(row => row.isActive)
            .map((row, index, shown) => (
              <div key={row.typeKey} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate">{row.label}</span>
                  <HeightFields
                    compact
                    value={row.heightInches}
                    belowFloor={row.belowFloor}
                    ariaPrefix={row.label}
                    onSave={inches =>
                      setHeight.mutate({ bidId, typeKey: row.typeKey, inches })
                    }
                    onDismiss={
                      index === shown.length - 1
                        ? () => setOpen(false)
                        : undefined
                    }
                  />
                </div>
                <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
                  {/* The control says "Not set"; repeating it here is noise. */}
                  <span>
                    {row.heightInches === null ? "" : levelOf(row.source)}
                  </span>
                  {row.source === "job" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1 text-[0.7rem]"
                      onClick={() =>
                        clearHeight.mutate({ bidId, typeKey: row.typeKey })
                      }
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Back to company
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
