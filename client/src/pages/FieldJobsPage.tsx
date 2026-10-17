/**
 * JOBS — a Field member's home (references/field-and-coowner-plan.md § 1).
 *
 * The company's live jobs by name, address and stage, each opening on its
 * Plans. No money: it reads `bids.fieldList`, which names its fields one by
 * one and carries no total. A list, not a dashboard — the dashboard is
 * built from prices, and a crew member opening the app wants the job.
 */
import { MapPin, FileText, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function FieldJobsPage({
  onOpenPlans,
}: {
  onOpenPlans: (bidId: number) => void;
}) {
  const jobs = trpc.bids.fieldList.useQuery();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Open a job to see its plans, what was counted, and the materials to
            pull.
          </p>
        </div>

        {jobs.isLoading ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Loading the jobs…
          </p>
        ) : jobs.isError ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <p>Could not load the jobs. Your connection may have dropped.</p>
            <button
              type="button"
              className="mt-2 text-[#F5C518] underline"
              onClick={() => jobs.refetch()}
            >
              Try again
            </button>
          </div>
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No jobs yet. When the office starts one, it shows here.
          </p>
        ) : (
          <ul className="space-y-2">
            {(jobs.data ?? []).map(job => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onOpenPlans(job.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-[#F5C518]/60 transition-colors"
                >
                  <FileText className="w-5 h-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {job.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {job.siteAddress ? (
                        <>
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{job.siteAddress}</span>
                          <span aria-hidden>·</span>
                        </>
                      ) : null}
                      <span className="shrink-0">{job.status}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Plans
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
