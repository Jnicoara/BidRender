/**
 * "Build it from parts here" — shown when the bid's assembly search finds
 * nothing (todo.md § "Before beta: when the picker finds nothing", item b).
 *
 * Name it, pick catalog parts, optionally say the hours and who does them,
 * and it goes on the bid. "Save to my library" is ticked by default (the
 * owner's never-stuck rule, references/never-stuck-plan.md gap 11): ticked,
 * it is an ordinary library assembly from then on; unticked, it is kept in
 * the library's archive so it can still be brought back. Either way the line
 * is an ordinary assembly line. server/buildFromParts.ts has the rules; the
 * form's own rules are in @/lib/buildFromPartsDraft, where they are tested.
 *
 * Nothing here is required beyond a name and one part. Blank hours are
 * "hours not set" on the bid, fixable there like any other line — the form
 * never asks for more than the line needs to exist.
 *
 * In the PLAN VIEWER (`target.kind === "count"`, 2026-10-09) the same form
 * makes the assembly and hands it back to be armed or linked; it adds no
 * line, because the count reaches the bid through its marks. There it is
 * always saved to the library (server/buildFromParts.ts says why), so the
 * tick is not offered, and the form is narrow — a popover or a side panel —
 * so category, hours and role sit under "More options" (CLAUDE.md §
 * "Customization available, but never in the way"). The defaults stand
 * when nobody opens it: General, hours not set, no role.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaterialPicker } from "@/components/MaterialPicker";
import { money } from "@/lib/money";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  addDraftPart,
  buildRequest,
  draftPartsSummary,
  newBuildDraft,
  type BuildDraft,
} from "@/lib/buildFromPartsDraft";
import {
  ASSEMBLY_CATEGORY_ORDER,
  type AssemblyCategoryName,
} from "@shared/assemblyCategories";

/** Where the built assembly goes. */
export type BuildTarget =
  | {
      /** The bid and counting screens: a line on the bid. */
      kind: "line";
      /** How many go on the bid (the card's own qty box). */
      qty: number;
      unitLabel: string | null;
      /** Quick bid stacks repeat counts on one line. */
      merge?: boolean;
    }
  | {
      /** The plan viewer: the assembly only, then armed or linked. */
      kind: "count";
      /** The button, saying what happens next: "Save and count". */
      action: string;
    };

export interface BuiltAssembly {
  assemblyId: number;
  name: string;
  category: AssemblyCategoryName;
  savedToLibrary: boolean;
}

export function BuildFromPartsPanel({
  bidId,
  query,
  target,
  onBuilt,
  onCancel,
  pinActions = false,
}: {
  bidId: number;
  /** What the search was looking for — the new assembly's starting name. */
  query: string;
  target: BuildTarget;
  onBuilt: (result: BuiltAssembly) => void;
  onCancel: () => void;
  /**
   * Pin the Save/Cancel row to the bottom of the popover's own scroll area,
   * so it is on screen however tall the builder grows (iPad landscape:
   * todo.md "Save needs a scroll"). Only inside a `bg-popover` scroller —
   * the row paints that colour over what scrolls beneath it.
   */
  pinActions?: boolean;
}) {
  const forCount = target.kind === "count";
  const [draft, setDraft] = useState<BuildDraft>(() => newBuildDraft(query));
  const [moreOpen, setMoreOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<BuildDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
    setProblem(null);
  };

  const { data: rates = [] } = trpc.laborRates.list.useQuery();
  const build = trpc.bids.buildFromParts.useMutation();
  const utils = trpc.useUtils();

  const summary = draftPartsSummary(draft);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const checked = buildRequest(draft);
    if (!checked.ok) {
      setProblem(checked.problem);
      return;
    }
    if (target.kind === "line" && !(target.qty > 0)) {
      setProblem("Enter a quantity greater than zero above.");
      return;
    }
    const where =
      target.kind === "line"
        ? {
            qty: target.qty,
            unitLabel: target.unitLabel,
            merge: target.merge ?? false,
          }
        : // Always saved: a count has to find its assembly again.
          { addLine: false, saveToLibrary: true };
    build.mutate(
      { bidId, ...checked.request, ...where },
      {
        onSuccess: result => {
          // The plan viewer's lists read the library; the bid screens
          // refresh it themselves along with the line they added.
          if (target.kind === "count") void utils.assemblies.list.invalidate();
          onBuilt({
            assemblyId: result.assemblyId,
            name: checked.request.name,
            category: checked.request.category,
            savedToLibrary: result.savedToLibrary,
          });
        },
        onError: error => setProblem(error.message),
      }
    );
  };

  const nameField = (
    <label className="block text-xs text-muted-foreground">
      Name
      <Input
        value={draft.name}
        onChange={e => set({ name: e.target.value })}
        className="mt-1 h-8 text-sm text-foreground"
      />
    </label>
  );
  const categoryField = (
    <label className="block text-xs text-muted-foreground">
      Category
      <select
        className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        value={draft.category}
        onChange={e =>
          set({ category: e.target.value as AssemblyCategoryName })
        }
      >
        {ASSEMBLY_CATEGORY_ORDER.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const hoursAndRole = (
    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <label className="block text-xs text-muted-foreground">
        Hours for one
        <Input
          value={draft.hours}
          onChange={e => set({ hours: e.target.value })}
          onFocus={selectOnFocus}
          inputMode="decimal"
          placeholder="not set"
          className="mt-1 h-8 text-right text-sm text-foreground"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Who does it
        <select
          className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
          value={draft.laborRateId ?? ""}
          onChange={e =>
            set({
              laborRateId:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        >
          <option value="">Not set yet</option>
          {rates.map(rate => (
            <option key={rate.id} value={rate.id}>
              {rate.name}
              {rate.effectiveHourlyRate > 0
                ? ` — ${money(rate.effectiveHourlyRate)}/h`
                : " — no rate yet"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <form
      onSubmit={submit}
      className={
        forCount
          ? // Already inside a popover or panel that draws the frame.
            "space-y-3 text-sm"
          : "rounded-lg border border-[#F5C518]/40 bg-[#F5C518]/5 p-3 space-y-3 text-sm"
      }
      aria-label="Build an assembly from parts"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">Build it from parts</div>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {forCount ? (
        nameField
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
          {nameField}
          {categoryField}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Parts, for one</div>
        {draft.parts.length > 0 ? (
          <div className="rounded-md border border-border divide-y divide-border bg-card">
            {draft.parts.map(part => (
              <div
                key={part.materialId}
                className={
                  forCount
                    ? // Narrow: the name gets its own line, or it reads "4…".
                      "flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5"
                    : "flex items-center gap-2 px-2 py-1.5"
                }
              >
                <span
                  className={
                    forCount ? "basis-full truncate" : "flex-1 min-w-0 truncate"
                  }
                  title={part.name}
                >
                  {part.name}
                </span>
                {/* One group, so the × cannot wrap onto a line of its own;
                    `contents` leaves the wide layout exactly as it was. */}
                <div
                  className={
                    forCount ? "flex flex-1 items-center gap-2" : "contents"
                  }
                >
                  <Input
                    value={part.qty}
                    onChange={e =>
                      set({
                        parts: draft.parts.map(p =>
                          p.materialId === part.materialId
                            ? { ...p, qty: e.target.value }
                            : p
                        ),
                      })
                    }
                    onFocus={selectOnFocus}
                    inputMode="decimal"
                    className="h-7 w-16 text-right text-sm"
                    aria-label={`Quantity of ${part.name}`}
                  />
                  <span className="w-10 text-xs text-muted-foreground">
                    {part.unitOfSale}
                  </span>
                  <span className="w-20 text-right font-mono text-xs">
                    {part.costPerUnit > 0 ? (
                      money(part.costPerUnit)
                    ) : (
                      <span className="text-[#F5C518]">not priced</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        parts: draft.parts.filter(
                          p => p.materialId !== part.materialId
                        ),
                      })
                    }
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${part.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <MaterialPicker
          compact
          exclude={draft.parts.map(p => p.materialId)}
          placeholder="Add a part — try “4 square box”, “fan brace”…"
          ariaLabel="Search parts to add"
          maxRecent={forCount ? 3 : undefined}
          onChoose={material => set(addDraftPart(draft, material))}
        />
        {summary.priced || summary.notPriced ? (
          <p className="text-xs text-muted-foreground">
            {summary.priced}
            {summary.priced && summary.notPriced ? " " : null}
            {summary.notPriced ? (
              <span className="text-[#F5C518]">{summary.notPriced}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {forCount ? (
        /*
          "More options": the defaults stand unopened — General, hours not
          set (fixable on the bid like any line), no role. Always saved, so
          no tick; the sentence says where it went.
        */
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMoreOpen(open => !open)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={moreOpen}
          >
            {moreOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            More options
          </button>
          {moreOpen ? (
            <div className="space-y-2">
              {categoryField}
              {hoursAndRole}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Saved to your library, so every sheet can count it.
          </p>
        </div>
      ) : (
        <>
          {hoursAndRole}
          <div className="space-y-0.5">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#F5C518]"
                checked={draft.saveToLibrary}
                onChange={e => set({ saveToLibrary: e.target.checked })}
              />
              Save to my library
            </label>
            <p className="pl-6 text-xs text-muted-foreground">
              {draft.saveToLibrary
                ? "Next time, search for it like any other assembly."
                : "Only this bid uses it. It is kept in the library's archive, so you can bring it back later."}
            </p>
          </div>
        </>
      )}

      {problem ? (
        <p role="alert" className="text-xs text-red-500">
          {problem}
        </p>
      ) : null}

      <div
        className={
          pinActions
            ? // -mt-2/pt-2 and -mb-2/pb-2 cancel out, so the buttons sit
              // exactly where they did; the padding is opaque cover for the
              // fields scrolling under it and the popover's own p-2.
              // bottom is -0.5rem, not 0: sticky measures against the
              // popover's CONTENT box, so bottom-0 lifted the row 8px even
              // with nothing to scroll (measured in Firefox, 2026-10-09).
              "sticky bottom-[-0.5rem] z-10 -mt-2 -mb-2 flex flex-wrap gap-2 bg-popover pt-2 pb-2"
            : "flex flex-wrap gap-2"
        }
      >
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={build.isPending}
        >
          {build.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : null}
          {target.kind === "count" ? target.action : "Add to bid"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
