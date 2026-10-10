/**
 * "Build hours from steps" — an assembly's WORK STEPS, under "More options"
 * (references/step-based-labor-plan.md § 7; owner answers § 13).
 *
 * Simple by default: the disclosure starts CLOSED, and an assembly with no
 * steps prices exactly as it always has. Opened, it lists the steps with a
 * count each; with no hours typed above, their total prices the assembly
 * (assemblyHoursSource).
 *
 * Two kinds of edit live here, and the words say which is which:
 *   - the LIST and the counts belong to this assembly's draft, and are saved
 *     with the assembly's Save button like its parts;
 *   - a step's MINUTES are shared — changing one changes every assembly that
 *     uses it — so that field saves on its own and says how many it reaches.
 *     A bid line already priced never moves (its hours froze when added).
 *
 * Minutes are a MEASUREMENT: not set shows as "not set", never 0 min
 * (CLAUDE.md § Editing fields 6).
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineNumberField } from "@/components/InlineNumberField";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  resolveLibraryStep,
  type DraftStep,
  type LibraryStep,
} from "@/lib/assemblyStepsDraft";

export function AssemblyStepsSection({
  steps,
  library,
  cableUnset,
  onChange,
}: {
  steps: readonly DraftStep[];
  library: readonly LibraryStep[];
  /** Cable lines in the recipe whose hours per foot are not set. */
  cableUnset: number;
  onChange: (next: DraftStep[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string>("");
  const utils = trpc.useUtils();
  const setMinutes = trpc.laborSteps.setMinutes.useMutation({
    onError: error => toast.error(error.message),
    onSettled: () => {
      void utils.laborSteps.list.invalidate();
      void utils.assemblies.get.invalidate();
    },
  });
  const acceptAll = trpc.laborSteps.acceptAll.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: ({ accepted }) =>
      toast.success(
        accepted === 1
          ? "1 example time is now yours."
          : `${accepted} example times are now yours.`
      ),
    onSettled: () => {
      void utils.laborSteps.list.invalidate();
      void utils.assemblies.get.invalidate();
    },
  });

  const listed = useMemo(
    () =>
      new Set(
        steps.flatMap(s => {
          if (s.kind !== "step") return [];
          const row = resolveLibraryStep(library, s.laborStepId);
          return row ? [row.id] : [];
        })
      ),
    [steps, library]
  );
  const addable = library.filter(step => !listed.has(step.id));
  const hasCable = steps.some(s => s.kind === "cable");
  const examples = library.filter(step => step.isExample).length;

  const update = (index: number, next: DraftStep | null) =>
    onChange(
      next === null
        ? steps.filter((_, i) => i !== index)
        : steps.map((s, i) => (i === index ? next : s))
    );

  return (
    <section className="border-t border-border pt-3 mt-1 space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-1 py-1 -ml-1 flex items-center gap-1 text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="text-sm">More options</span>
        {!open && steps.length > 0 && (
          <span className="text-xs text-muted-foreground">
            · built from {steps.length} step{steps.length === 1 ? "" : "s"}
          </span>
        )}
      </Button>

      {open && (
        <div className="space-y-3 pl-5">
          <div>
            <div className="text-sm font-medium">Build hours from steps</div>
            <p className="text-xs text-muted-foreground">
              List the work this assembly takes. With no hours typed above, the
              steps' total prices it; typed hours always win. A step's time is
              shared — changing it changes every assembly that uses it. Lines
              already on a bid keep the hours they had when they were added.
            </p>
          </div>

          {steps.length === 0 && (
            <p className="text-xs text-muted-foreground">No steps yet.</p>
          )}

          <ul className="space-y-2">
            {steps.map((line, index) => {
              if (line.kind === "cable")
                return (
                  <li
                    key="cable"
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="flex-1 min-w-0">
                      Cable in this recipe
                      <span className="block text-xs text-muted-foreground">
                        Each cable at its own hours per foot — the same number a
                        traced run uses.
                        {cableUnset > 0 &&
                          ` Hours per foot not set on ${cableUnset} cable${cableUnset === 1 ? "" : "s"} — set ${cableUnset === 1 ? "it" : "them"} on the Materials screen.`}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Remove the cable step"
                      onClick={() => update(index, null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                );
              const step = resolveLibraryStep(library, line.laborStepId);
              const minutes =
                step?.minutes == null ? null : Number(step.minutes);
              return (
                <li
                  key={`${line.laborStepId}-${index}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="flex-1 min-w-[10rem]">
                    {step?.name ?? "A step no longer in the library"}
                    <span className="block text-xs text-muted-foreground">
                      {step
                        ? `${step.unit} · used in ${step.usedBy} assembl${step.usedBy === 1 ? "y" : "ies"}${step.isExample ? " · Example time" : ""}`
                        : "not set"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Input
                      value={String(line.count)}
                      onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0)
                          update(index, { ...line, count: n });
                      }}
                      onFocus={selectOnFocus}
                      inputMode="decimal"
                      className="h-8 w-14 text-sm text-right"
                      aria-label={`How many: ${step?.name ?? "step"}`}
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                  </span>
                  {step ? (
                    <InlineNumberField
                      value={minutes}
                      whenUnset={{ placeholder: "not set" }}
                      suffix="min"
                      ariaLabel={`Minutes for ${step.name} — shared by ${step.usedBy} assemblies`}
                      className="w-20"
                      onSave={next =>
                        setMinutes.mutate({ id: step.id, minutes: next })
                      }
                      onClear={() =>
                        setMinutes.mutate({ id: step.id, minutes: null })
                      }
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      not set
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Remove ${step?.name ?? "step"}`}
                    onClick={() => update(index, null)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={adding} onValueChange={setAdding}>
              <SelectTrigger className="h-8 w-60 text-sm">
                <SelectValue placeholder="Add a step…" />
              </SelectTrigger>
              <SelectContent>
                {addable.map(step => (
                  <SelectItem key={step.id} value={String(step.id)}>
                    {step.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={adding === ""}
              onClick={() => {
                const row = library.find(s => s.id === Number(adding));
                if (!row) return;
                // Store the SHIPPED id when this is the company's fork of one,
                // as a material line does, so the seed's step stays the anchor.
                onChange([
                  ...steps,
                  {
                    kind: "step",
                    laborStepId: row.baselineId ?? row.id,
                    count: 1,
                  },
                ]);
                setAdding("");
              }}
            >
              Add
            </Button>
            {!hasCable && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => onChange([...steps, { kind: "cable" }])}
              >
                Add the cable step
              </Button>
            )}
          </div>

          {examples > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={acceptAll.isPending}
                onClick={() => acceptAll.mutate()}
              >
                Use these times
              </Button>
              <span className="text-xs text-muted-foreground">
                Makes the {examples} example step time
                {examples === 1 ? "" : "s"} your own, unchanged.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
