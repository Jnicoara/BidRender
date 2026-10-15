/**
 * DuplicateUnitPanel — generate numbered copies of one or more repeating units.
 *
 * Shared by the Bids detail screen and the Quick-bid flow: a quick residential
 * bid wants repeating rooms just as much as a hotel does, and two copies of
 * this would drift apart. The copy semantics live in db.generateBidUnits —
 * copies inherit the template's snapshot so every generated room prices the
 * same, and each one keeps a link back to the template it came from.
 *
 * ── One group by default ─────────────────────────────────────────────────────
 * A house with four identical bedrooms should never meet the word "group". The
 * panel opens as the single-template form it has always been; a second group
 * appears only when someone asks for one, and the row of controls per group is
 * the same row they already understand.
 *
 * Numbering runs continuously across groups — 35 standard rooms then 5 ADA
 * rooms give Room 101–140 — because a hotel numbers rooms by position, not by
 * which spec built them. That is enforced on the server; the preview here just
 * tells the truth about it before the click.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { errorText } from "@/lib/errorText";

type Group = { source: string; count: string };

export function DuplicateUnitPanel({
  bidId,
  units,
  onDone,
}: {
  bidId: number;
  units: string[];
  onDone: () => void;
}) {
  // `units` arrives from a query, so it is empty on first render. Seeding state
  // from it would leave the picker permanently blank; fall back at read time.
  const [groups, setGroups] = useState<Group[]>([{ source: "", count: "10" }]);
  const [baseName, setBaseName] = useState("Room");
  const [startNumber, setStartNumber] = useState("101");

  const sourceAt = (index: number) => groups[index].source || units[0] || "";

  const generate = trpc.bids.generateUnits.useMutation({
    onError: error => toast.error(errorText(error)),
    onSuccess: result => {
      const made = result.created.length;
      toast.success(
        made === 0
          ? "Nothing generated — every label already existed."
          : `Generated ${made} cop${made === 1 ? "y" : "ies"}` +
              (result.skipped.length
                ? `, skipped ${result.skipped.length} existing`
                : "")
      );
      onDone();
    },
  });

  if (units.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Give some line items a unit label (e.g. “Room 101”) to build a repeating
        unit, then you can generate numbered copies of it here.
      </div>
    );
  }

  const totalCopies = groups.reduce((sum, g) => {
    const n = Number(g.count);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);
  const start = Number(startNumber);
  const lastNumber =
    Number.isInteger(start) && totalCopies > 0 ? start + totalCopies - 1 : null;

  const submit = () => {
    const start = Number(startNumber);
    if (!baseName.trim()) {
      toast.error("Give the copies a name.");
      return;
    }
    if (!Number.isInteger(start) || start < 0) {
      toast.error("Start number must be a whole number.");
      return;
    }

    const specs = [];
    for (let index = 0; index < groups.length; index++) {
      const source = sourceAt(index);
      const n = Number(groups[index].count);
      if (!source) {
        toast.error("Pick a unit to copy.");
        return;
      }
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        toast.error("Each group needs between 1 and 200 copies.");
        return;
      }
      specs.push({ sourceUnitLabel: source, count: n });
    }

    generate.mutate({
      bidId,
      baseName: baseName.trim(),
      startNumber: start,
      groups: specs,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Generate copies of a unit
      </div>

      {/* Naming, which is shared by every group — one continuous run. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground w-16">Name them</span>
        <Input
          value={baseName}
          onChange={e => setBaseName(e.target.value)}
          className="h-8 w-28 text-sm"
          placeholder="Room"
          aria-label="Copy name"
        />
        <span className="text-xs text-muted-foreground">starting at</span>
        <Input
          value={startNumber}
          onChange={e => setStartNumber(e.target.value)}
          className="h-8 w-20 text-sm text-right"
          inputMode="numeric"
          onFocus={selectOnFocus}
          aria-label="Start number"
        />
      </div>

      {groups.map((group, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground w-16">
            {index === 0 ? "Copy" : "and"}
          </span>
          <Select
            value={sourceAt(index)}
            onValueChange={value =>
              setGroups(gs =>
                gs.map((g, i) => (i === index ? { ...g, source: value } : g))
              )
            }
          >
            <SelectTrigger
              className="h-8 w-44 text-sm"
              aria-label={`Source unit ${index + 1}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map(unit => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">×</span>
          <Input
            value={group.count}
            onChange={e =>
              setGroups(gs =>
                gs.map((g, i) =>
                  i === index ? { ...g, count: e.target.value } : g
                )
              )
            }
            className="h-8 w-16 text-sm text-right"
            inputMode="numeric"
            onFocus={selectOnFocus}
            aria-label={`How many copies of group ${index + 1}`}
          />
          {groups.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove group ${index + 1}`}
              onClick={() => setGroups(gs => gs.filter((_, i) => i !== index))}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={groups.length >= 20}
          onClick={() => setGroups(gs => [...gs, { source: "", count: "5" }])}
        >
          <Plus className="w-3.5 h-3.5" /> Another unit type
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={generate.isPending}
          onClick={submit}
        >
          <Copy className="w-3.5 h-3.5" /> Generate {totalCopies || ""}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {lastNumber !== null ? (
          <>
            Numbering runs straight through — {baseName || "Room"} {start} to{" "}
            {baseName || "Room"} {lastNumber}
            {groups.length > 1 ? ", across every unit type above" : ""}.{" "}
          </>
        ) : null}
        Copies carry their template’s frozen costs, so every copy prices the
        same. They stay linked to it: edit the template and you will be asked
        whether to update them, and editing one copy on its own unlinks that
        copy.
      </p>
    </div>
  );
}
