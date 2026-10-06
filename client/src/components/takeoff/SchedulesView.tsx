/**
 * SchedulesView — the panel and fixture schedules printed on this sheet,
 * read from its text by code (@/lib/panelSchedules), shown READ-ONLY.
 *
 * Nothing here is on the bid and nothing is saved: it is the drawing's own
 * table, laid out so it can be read without zooming into the title block.
 * Where these rows would be kept is a Track A table (todo.md, bid_panels).
 *
 * Shown only on a sheet that HAS a schedule in a layout the reader knows.
 * Most sheets have none, and a "no schedules" control on every one of them
 * is a control people learn to ignore (CLAUDE.md § Customization).
 */
import { useState } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  FixtureSchedule,
  PanelSchedule,
  SheetSchedules,
} from "@/lib/panelSchedules";

type Picked = { kind: "panel"; i: number } | { kind: "fixture"; i: number };

export function SchedulesView({
  schedules,
  sheetName,
}: {
  schedules: SheetSchedules | null;
  sheetName: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked>({ kind: "panel", i: 0 });
  if (!schedules) return null;
  const { panels, fixtures } = schedules;
  if (panels.length === 0 && fixtures.length === 0) return null;

  const count = [
    panels.length
      ? `${panels.length} panel${panels.length === 1 ? "" : "s"}`
      : null,
    fixtures.length ? "fixtures" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // A pick from another sheet may point past this one's tables.
  const current: Picked =
    picked.kind === "panel" && picked.i < panels.length
      ? picked
      : picked.kind === "fixture" && picked.i < fixtures.length
        ? picked
        : panels.length
          ? { kind: "panel", i: 0 }
          : { kind: "fixture", i: 0 };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 text-xs shrink-0"
        title="The schedules printed on this sheet, read from its text — read-only"
        onClick={() => setOpen(true)}
      >
        <Table2 className="w-3.5 h-3.5" />
        Schedules
        <span className="text-muted-foreground">{count}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col gap-3">
          <DialogHeader className="shrink-0">
            <DialogTitle>Schedules on {sheetName}</DialogTitle>
            <DialogDescription>
              Read from the drawing's text, as printed. Read-only — nothing here
              is on the bid.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {panels.map((p, i) => (
              <PickChip
                key={`p${i}`}
                active={current.kind === "panel" && current.i === i}
                onClick={() => setPicked({ kind: "panel", i })}
              >
                Panel {p.name ?? `${i + 1} (no name in text)`}
              </PickChip>
            ))}
            {fixtures.map((f, i) => (
              <PickChip
                key={`f${i}`}
                active={current.kind === "fixture" && current.i === i}
                onClick={() => setPicked({ kind: "fixture", i })}
              >
                {f.title ? titleCase(f.title) : "Fixture schedule"}
              </PickChip>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {current.kind === "panel" ? (
              <PanelTable panel={panels[current.i]} />
            ) : (
              <FixtureTable schedule={fixtures[current.i]} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PickChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function titleCase(text: string) {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function PanelTable({ panel }: { panel: PanelSchedule }) {
  const facts = [
    panel.existing ? "Existing" : null,
    panel.supply,
    panel.mains,
    panel.fedFrom ? `Fed from ${panel.fedFrom}` : null,
    panel.connectedKva !== null ? `Connected ${panel.connectedKva} kVA` : null,
    panel.demandKva !== null ? `Demand ${panel.demandKva} kVA` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        Panel {panel.name ?? "— name not in the drawing's text"}
      </div>
      {facts.length > 0 && (
        <div className="text-xs text-muted-foreground">{facts.join(" · ")}</div>
      )}
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border text-left">
            <th className="py-1 pr-2 font-normal w-10">Ckt</th>
            <th className="py-1 pr-2 font-normal w-16">Breaker</th>
            <th className="py-1 pr-2 font-normal w-12">Wire</th>
            <th className="py-1 pr-2 font-normal">Description</th>
            <th className="py-1 font-normal text-right w-16">Load kVA</th>
          </tr>
        </thead>
        <tbody>
          {panel.circuits.map(c => (
            <tr key={c.number} className="border-b border-border/50">
              <td className="py-0.5 pr-2 font-mono">{c.number}</td>
              <td className="py-0.5 pr-2 font-mono">{c.breaker ?? ""}</td>
              <td className="py-0.5 pr-2 font-mono">{c.wire ?? ""}</td>
              <td className="py-0.5 pr-2">{c.description}</td>
              <td className="py-0.5 text-right font-mono">{c.loadKva ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FixtureTable({ schedule }: { schedule: FixtureSchedule }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border text-left">
          <th className="py-1 pr-2 font-normal w-12">Type</th>
          <th className="py-1 pr-2 font-normal">Description</th>
          <th className="py-1 font-normal text-right w-16">Watts</th>
        </tr>
      </thead>
      <tbody>
        {schedule.fixtures.map((f, i) => (
          <tr
            key={`${f.mark}-${i}`}
            className="border-b border-border/50 align-top"
          >
            <td className="py-1 pr-2 font-mono">{f.mark}</td>
            <td className="py-1 pr-2">{f.description}</td>
            <td className="py-1 text-right font-mono">{f.watts ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
