/**
 * The price, hours and library actions on a hand-priced bid line — what a free
 * count from the plans is priced WITH.
 *
 * ── Blank is not zero, on screen as in the column ────────────────────────────
 * A free count arrives with no price and no hours (NULL — shared/handPricedLines
 * .ts). The fields show that as an empty box with a placeholder, never as `0`:
 * CLAUDE.md § Editing fields rule 6, "UNSET is not zero". Emptying a field puts
 * it back to blank, and the bid's warning strip names it again. The line's COST
 * column still reads $0.00 — the money convention — because a blank price IS
 * contributing nothing to the total, and the strip is where that shouts.
 *
 * ── Everything here is optional ──────────────────────────────────────────────
 * Typing the two numbers is the whole job. "Link to material or assembly" and
 * "Save as assembly" are there for somebody who wants them and ignorable by
 * somebody who does not — CLAUDE.md § "As manual or as automated as the user
 * wants". Neither is a prompt, and neither appears until the line is on the bid.
 *
 * ── Why the role picker only appears once there are hours ────────────────────
 * The common case for a fixture count is price only, and a role dropdown beside
 * a blank hours field is a question nobody has reached yet (§ 5f.2, "shown only
 * when hours are filled in"). Hours with no role price at $0, and the existing
 * "hours but no labor rate" entry on the strip says so.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, BookmarkPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InlineNumberField } from "@/components/InlineNumberField";
import { MaterialPicker } from "@/components/MaterialPicker";
import { money } from "@/lib/money";
import {
  lineNeedsHours,
  lineNeedsPrice,
  saveAsAssemblyRefusal,
} from "@shared/handPricedLines";

/**
 * The assembly shelves, as the Library screen lists them. A copy rather than an
 * import because the client does not load drizzle/schema; the server validates
 * against the real enum, so a drift here fails the save out loud rather than
 * filing anything on the wrong shelf.
 */
const ASSEMBLY_CATEGORIES = [
  "Devices",
  "Lighting",
  "Panels",
  "Equipment Connections",
  "Low Voltage/EMS",
] as const;

export type HandPricedLine = {
  id: number;
  name: string;
  assemblyId: number | null;
  takeoffRunTypeId: number | null;
  snapshotMaterialCost: string | null;
  snapshotLaborHours: string | null;
  snapshotLaborRate: string;
};

type Rate = { id: number; name: string; effectiveHourlyRate: number };

/**
 * The role whose rate this line froze, if one matches.
 *
 * A line stores the RATE, not which role it came from — the same as every other
 * line's snapshot — so the picker finds the role by its cost. Two roles at the
 * same rate are indistinguishable here and it does not matter which one shows:
 * they price identically, which is the only thing the line records.
 */
function roleForRate(rates: readonly Rate[], frozenRate: number): Rate | null {
  if (!(frozenRate > 0)) return null;
  return (
    rates.find(
      rate => Math.abs(rate.effectiveHourlyRate - frozenRate) < 1e-4
    ) ?? null
  );
}

export function HandPricedLineFields({
  bidId,
  line,
  onChanged,
}: {
  bidId: number;
  line: HandPricedLine;
  /** Refetch whatever the bid screen shows. Its one invalidation helper. */
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: rates = [] } = trpc.laborRates.list.useQuery();

  const price =
    line.snapshotMaterialCost === null
      ? null
      : Number(line.snapshotMaterialCost);
  const hours =
    line.snapshotLaborHours === null ? null : Number(line.snapshotLaborHours);
  const frozenRate = Number(line.snapshotLaborRate);
  /*
    The role just picked, remembered while its rate is still what the line froze.

    Without it, picking a role whose rate is $0 — every shipped role until the
    contractor prices it — snapped the picker straight back to "pick a role",
    because no role can be found BY a rate of zero. It read as a choice that
    did not take. Seen on screen 2026-09-25; the strip's "hours but no labor
    rate" entry is what then says why the labor is still $0.
  */
  const [pickedRoleId, setPickedRoleId] = useState<number | null>(null);
  const picked = rates.find(rate => rate.id === pickedRoleId);
  const role =
    picked && Math.abs(picked.effectiveHourlyRate - frozenRate) < 1e-4
      ? picked
      : roleForRate(rates, frozenRate);

  /*
    Optimistic, per CLAUDE.md § Responsiveness rule 1: the typed number is on
    the line the moment it is committed, and the totals follow from the refetch.
    Only the two snapshot fields are predicted — the rollup is the engine's to
    compute, not this component's.
  */
  const update = trpc.bids.updateLine.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            lines: old.lines.map(row =>
              row.id !== vars.id
                ? row
                : {
                    ...row,
                    ...(vars.materialCost !== undefined && {
                      snapshotMaterialCost:
                        vars.materialCost === null
                          ? null
                          : vars.materialCost.toFixed(4),
                    }),
                    ...(vars.laborHours !== undefined && {
                      snapshotLaborHours:
                        vars.laborHours === null
                          ? null
                          : vars.laborHours.toFixed(4),
                    }),
                  }
            ),
          }
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSettled: onChanged,
  });

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Price each
        <InlineNumberField
          value={price}
          whenUnset={{ placeholder: "no price" }}
          onSave={next =>
            update.mutate({ bidId, id: line.id, materialCost: next })
          }
          onClear={() =>
            update.mutate({ bidId, id: line.id, materialCost: null })
          }
          rules={{ min: 0, max: 99999999 }}
          className="h-7 w-24 text-sm"
          ariaLabel={`Price for one ${line.name}`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Labor each
        <InlineNumberField
          value={hours}
          whenUnset={{ placeholder: "no hours" }}
          onSave={next =>
            update.mutate({ bidId, id: line.id, laborHours: next })
          }
          onClear={() =>
            update.mutate({ bidId, id: line.id, laborHours: null })
          }
          rules={{ min: 0, max: 99999 }}
          suffix="h"
          className="h-7 w-24 text-sm"
          ariaLabel={`Labor hours for one ${line.name}`}
        />
      </label>
      {hours !== null && hours > 0 ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          by
          <select
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            value={role?.id ?? ""}
            aria-label={`Who does the labor on ${line.name}`}
            onChange={event => {
              const id = Number(event.target.value);
              if (id > 0) {
                setPickedRoleId(id);
                update.mutate({ bidId, id: line.id, laborRateId: id });
              }
            }}
          >
            {role === null ? (
              <option value="">
                {frozenRate > 0
                  ? `${money(frozenRate)}/h (no matching role)`
                  : "pick a role"}
              </option>
            ) : null}
            {rates.map(rate => (
              <option key={rate.id} value={rate.id}>
                {rate.name} — {money(rate.effectiveHourlyRate)}/h
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex items-center gap-1 ml-auto">
        <LinkToLibrary bidId={bidId} line={line} onChanged={onChanged} />
        <SaveAsAssembly
          bidId={bidId}
          line={line}
          rates={rates}
          defaultRole={role}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

/**
 * Price the line from something already in the library. One popover, two
 * sources — a material (its price, and its labor unit if it has one) or an
 * assembly (all four inputs, after which the line is a library line).
 */
function LinkToLibrary({
  bidId,
  line,
  onChanged,
}: {
  bidId: number;
  line: HandPricedLine;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"material" | "assembly">("material");
  const [query, setQuery] = useState("");
  const { data: assemblies = [] } = trpc.assemblies.list.useQuery(undefined, {
    enabled: open && source === "assembly",
  });

  const link = trpc.bids.linkLine.useMutation({
    onSuccess: ({ from }) => {
      toast.success(`Priced from ${from}.`);
      setOpen(false);
    },
    onError: error => toast.error(error.message),
    onSettled: onChanged,
  });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? assemblies.filter(a => a.name.toLowerCase().includes(q))
      : assemblies;
    return pool.slice(0, 8);
  }, [assemblies, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <Link2 className="w-3.5 h-3.5 mr-1" />
          Link to material or assembly
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-2" align="end">
        <p className="text-xs text-muted-foreground">
          Price this line from your library. Optional — the typed price works
          just as well.
        </p>
        <div className="flex gap-1">
          {(["material", "assembly"] as const).map(kind => (
            <Button
              key={kind}
              size="sm"
              variant={source === kind ? "secondary" : "ghost"}
              className="h-7 flex-1 text-xs"
              onClick={() => setSource(kind)}
            >
              {kind === "material" ? "Material" : "Assembly"}
            </Button>
          ))}
        </div>
        {source === "material" ? (
          <>
            <MaterialPicker
              compact
              autoFocus
              onChoose={material =>
                link.mutate({
                  bidId,
                  id: line.id,
                  source: { kind: "material", materialId: material.id },
                })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Takes its price, and its labor hours if it has them. You can still
              type over either.
            </p>
          </>
        ) : (
          <>
            <Input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search assemblies"
              className="h-8 text-sm"
              aria-label="Search assemblies"
            />
            <div className="max-h-56 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  No assemblies match.
                </p>
              ) : (
                matches.map(assembly => (
                  <button
                    key={assembly.id}
                    type="button"
                    disabled={link.isPending}
                    onClick={() =>
                      link.mutate({
                        bidId,
                        id: line.id,
                        source: { kind: "assembly", assemblyId: assembly.id },
                      })
                    }
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {assembly.name}
                  </button>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Takes its materials, hours and role at today's prices. From then
              on the line is priced like that assembly and is not typed over.
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Put this line in the library for next time. Says, before it does anything,
 * exactly which rows it will make — a typed price needs a material to live in,
 * because an assembly's price is the sum of its materials.
 */
function SaveAsAssembly({
  bidId,
  line,
  rates,
  defaultRole,
  onChanged,
}: {
  bidId: number;
  line: HandPricedLine;
  rates: readonly Rate[];
  defaultRole: Rate | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const refusal = saveAsAssemblyRefusal(line);
  const price = Number(line.snapshotMaterialCost ?? 0);
  const hours = Number(line.snapshotLaborHours ?? 0);
  const chosenRole = roleId ?? defaultRole?.id ?? null;

  const save = trpc.bids.saveLineAsAssembly.useMutation({
    onSuccess: () => {
      toast.success(`Saved "${line.name}" to your library.`);
      setOpen(false);
      void utils.assemblies.list.invalidate();
      void utils.materials.list.invalidate();
    },
    onError: error => toast.error(error.message),
    onSettled: onChanged,
  });

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setRoleId(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <BookmarkPlus className="w-3.5 h-3.5 mr-1" />
          Save as assembly
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-2.5" align="end">
        {refusal ? (
          <p className="text-xs text-muted-foreground">{refusal}</p>
        ) : (
          <>
            <p className="text-xs">
              {price > 0 ? (
                <>
                  Adds two things to your library: a material{" "}
                  <strong>{line.name}</strong> at {money(price)}, and an
                  assembly of the same name holding it, with {hours} h.
                </>
              ) : (
                <>
                  Adds an assembly <strong>{line.name}</strong> with no
                  materials and {hours} h.
                </>
              )}{" "}
              This line then points at it. Nothing on this bid changes.
            </p>
            <label className="block text-xs text-muted-foreground">
              Category
              <select
                className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value="" disabled>
                  Choose one
                </option>
                {ASSEMBLY_CATEGORIES.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {hours > 0 ? (
              <label className="block text-xs text-muted-foreground">
                Who does the hours
                <select
                  className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                  value={chosenRole ?? ""}
                  onChange={event => setRoleId(Number(event.target.value))}
                >
                  <option value="" disabled>
                    Choose a role
                  </option>
                  {rates.map(rate => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} — {money(rate.effectiveHourlyRate)}/h
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8"
                disabled={
                  save.isPending ||
                  category === "" ||
                  (hours > 0 && chosenRole === null)
                }
                onClick={() =>
                  save.mutate({
                    bidId,
                    id: line.id,
                    category: category as (typeof ASSEMBLY_CATEGORIES)[number],
                    laborRateId: chosenRole,
                  })
                }
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Whether a line has anything blank, for the note under its name. */
export function handPricedGap(line: HandPricedLine): string | null {
  const noPrice = lineNeedsPrice(line);
  const noHours = lineNeedsHours(line);
  if (noPrice && noHours) return "No price or labor typed yet";
  if (noPrice) return "No price typed yet";
  if (noHours) return "No labor hours typed yet";
  return null;
}
