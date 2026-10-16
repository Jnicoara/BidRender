/**
 * THE BASELINE SCREEN — what the shipped starter holds (baseline-screen-plan.md
 * § 1, § 3). Every change goes through the edit dialog (StarterEditing.tsx),
 * which previews and then calls `applyStarterChange`: pinned, logged and
 * offered (§ 2, § 4). The Change log tab lists every change with Undo.
 *
 * The band is the plan's wording, word for word, and stays on every tab.
 *
 * Materials search runs the SAME pipeline every search box in the app runs
 * (@/lib/materialSearch), with no usage — which is exactly what a brand-new
 * company sees, the company this starter is for.
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, LogOut, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ExampleTags } from "@/components/ExampleTags";
import { SearchCorrectionNote } from "@/components/SearchCorrectionNote";
import { money, unitCost } from "@/lib/money";
import { needsPricing } from "@shared/materialPricing";
import { materialSearchIndex, searchMaterials } from "@/lib/materialSearch";
import {
  STARTER_TABS,
  starterSessionNote,
  starterTabFromHash,
  type StarterTab,
} from "@/lib/starterAddress";
import { unitLabel } from "@shared/materialsList";
import type { ExampleKind } from "@shared/exampleTags";
import type { EditTable } from "@/lib/starterEdit";
import { ChangeLogTab, EditButton, StarterEditDialog } from "./StarterEditing";

/** What an Example tag means HERE: a number every new company starts on. */
const STARTER_WHY: Record<ExampleKind, string> = {
  price:
    "Ships tagged “Example price”. A company sees the tag until it sets its own price.",
  hours:
    "Ships tagged “Example hours”. A company sees the tag until it sets its own hours.",
  rate: "Ships tagged “Example rate”. A company sees the tag until it sets its own rate.",
};

const TAB_LABEL: Record<StarterTab, string> = {
  materials: "Materials",
  assemblies: "Assemblies",
  "labor-rates": "Labor rates",
  "run-types": "Run types",
  changes: "Change log",
};

/** The row being changed in the edit dialog. */
type Editing = {
  table: EditTable;
  rowId: number;
  itemName: string;
  current: Record<string, unknown>;
  /** Set for a recipe line: the part (material) whose quantity changes. */
  part?: { materialId: number };
};

type Me = { name: string | null; email: string | null; sessionEndsAt: number };

type Starter = inferRouterOutputs<AppRouter>["starterLibrary"];
type MaterialRow = Starter["materials"][number];
type AssemblyRow = Starter["assemblies"][number];
type RateRow = Starter["laborRates"][number];
type RunTypeRow = Starter["runTypes"][number];

/** "Sign in again." from any starter call: the session is over. */
function sessionEnded(error: unknown): boolean {
  const e = error as { data?: { code?: string } } | null;
  return e?.data?.code === "UNAUTHORIZED";
}

export default function StarterScreen({
  me,
  onSessionEnded,
  onSignedOut,
}: {
  me: Me;
  onSessionEnded: () => void;
  onSignedOut: () => void;
}) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<StarterTab>(() =>
    starterTabFromHash(window.location.hash)
  );
  useEffect(() => {
    const onHash = () => setTab(starterTabFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const materials = trpc.starterLibrary.materials.useQuery();
  const assemblies = trpc.starterLibrary.assemblies.useQuery();
  const laborRates = trpc.starterLibrary.laborRates.useQuery();
  const runTypes = trpc.starterLibrary.runTypes.useQuery();
  const queries = [materials, assemblies, laborRates, runTypes];

  // Every starter call slides the session, so the time shown is re-read
  // after each load rather than left at what it was on arrival.
  const loadedAt = queries.map(q => q.dataUpdatedAt).join(",");
  useEffect(() => {
    void utils.starterAuth.me.invalidate();
  }, [loadedAt, utils]);

  const ended = queries.some(q => sessionEnded(q.error));
  useEffect(() => {
    if (ended) onSessionEnded();
  }, [ended, onSessionEnded]);

  const signOut = trpc.starterAuth.signOut.useMutation({
    onSettled: () => {
      utils.starterLibrary.invalidate();
      onSignedOut();
    },
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts: Record<StarterTab, number | undefined> = {
    materials: materials.data?.length,
    assemblies: assemblies.data?.length,
    "labor-rates": laborRates.data?.length,
    "run-types": runTypes.data?.length,
    changes: undefined,
  };
  const [editing, setEditing] = useState<Editing | null>(null);

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <div
        role="note"
        className="shrink-0 bg-[#F5C518] text-black text-center text-xs sm:text-sm font-semibold px-4 py-1.5"
      >
        STARTER: changes reach NEW companies; existing ones get an offer
      </div>

      <header className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <h1
          className="text-lg font-bold tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Bid<span className="text-[#F5C518]">Ridge</span>{" "}
          <span className="text-muted-foreground font-medium">starter</span>
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="text-foreground">{me.name || me.email}</span>
          <span>{starterSessionNote(me.sessionEndsAt, now)}</span>
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-foreground hover:bg-muted"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <nav className="shrink-0 flex items-end gap-1 overflow-x-auto border-b border-border px-2">
        {STARTER_TABS.map(key => (
          <a
            key={key}
            href={`#${key}`}
            className={cn(
              "whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px",
              tab === key
                ? "border-[#F5C518] text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {TAB_LABEL[key]}
            {counts[key] !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {counts[key]!.toLocaleString()}
              </span>
            )}
          </a>
        ))}
      </nav>

      {tab === "materials" ? (
        <MaterialsTab rows={materials.data} onEdit={setEditing} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === "assemblies" && (
            <AssembliesTab rows={assemblies.data} onEdit={setEditing} />
          )}
          {tab === "labor-rates" && (
            <LaborRatesTab rows={laborRates.data} onEdit={setEditing} />
          )}
          {tab === "run-types" && (
            <RunTypesTab rows={runTypes.data} onEdit={setEditing} />
          )}
          {tab === "changes" && <ChangeLogTab />}
        </div>
      )}
      {editing && (
        <StarterEditDialog
          key={`${editing.table}:${editing.rowId}`}
          {...editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Materials ────────────────────────────────────────────────────────────────

type Filter = "all" | "notPriced" | "noHours";

function MaterialsTab({
  rows,
  onEdit,
}: {
  rows: MaterialRow[] | undefined;
  onEdit: (e: Editing) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const all = rows ?? [];
  const index = useMemo(() => materialSearchIndex(all), [all]);
  const searched = useMemo(
    () =>
      query.trim()
        ? searchMaterials(index, query, all.length, new Map(), new Date())
        : null,
    [index, query, all.length]
  );
  const shown = useMemo(() => {
    const base = searched ? searched.rows : all;
    if (filter === "notPriced") return base.filter(m => m.notPriced);
    if (filter === "noHours") return base.filter(m => m.laborHours === null);
    return base;
  }, [searched, all, filter]);

  const notPriced = all.filter(m => m.notPriced).length;
  const noHours = all.filter(m => m.laborHours === null).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 12,
  });

  return (
    <>
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="relative w-full sm:w-80">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search as an estimator would — “romex”, “gem box”"
            className="h-9 pl-8"
            aria-label="Search the starter materials"
          />
        </div>
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
        />
        <FilterChip
          active={filter === "notPriced"}
          onClick={() => setFilter("notPriced")}
          label={`Not priced ${notPriced}`}
          warn={notPriced > 0}
        />
        <FilterChip
          active={filter === "noHours"}
          onClick={() => setFilter("noHours")}
          label={`Hours not set ${noHours}`}
          warn={noHours > 0}
        />
        <SearchCorrectionNote
          correctedQuery={searched?.correctedQuery ?? null}
          className="w-full"
        />
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {rows === undefined ? (
          <Skeleton />
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nothing in the starter matches.
          </p>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map(item => {
              const m = shown[item.index];
              const showShelf =
                !searched &&
                (item.index === 0 ||
                  shown[item.index - 1].category !== m.category);
              return (
                <div
                  key={m.id}
                  data-index={item.index}
                  ref={virtual.measureElement}
                  className="absolute left-0 right-0"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {showShelf && (
                    <div className="bg-muted/40 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.category ?? "Uncategorized"}
                    </div>
                  )}
                  <MaterialLine
                    m={m}
                    onEdit={() =>
                      onEdit({
                        table: "materials",
                        rowId: m.id,
                        itemName: m.name,
                        current: m,
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function MaterialLine({ m, onEdit }: { m: MaterialRow; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-border/50 pl-4 pr-2 py-2">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm">
          {m.name}
          {m.isSpecialty && (
            <span className="ml-2 rounded border border-border px-1 text-[10px] text-muted-foreground">
              Specialty
            </span>
          )}
        </p>
        {m.searchAliases && (
          <p className="truncate text-xs text-muted-foreground">
            Also found by: {m.searchAliases}
          </p>
        )}
      </div>
      <div className="flex items-baseline gap-2 text-sm tabular-nums">
        {m.notPriced ? (
          <span className="text-xs text-amber-400">not priced</span>
        ) : (
          <>
            <span>{unitCost(m.costPerUnit)}</span>
            <span className="text-xs text-muted-foreground">
              / {unitLabel(m.unitOfSale)}
            </span>
          </>
        )}
        <ExampleTags
          line={{ snapshotPriceWasExample: m.isExamplePrice }}
          why={STARTER_WHY}
        />
      </div>
      <div className="flex w-36 items-baseline justify-end gap-2 text-sm tabular-nums">
        {m.laborHours === null ? (
          <span className="text-xs text-amber-400">hours not set</span>
        ) : (
          <span>{m.laborHours} h</span>
        )}
        <ExampleTags
          line={{ snapshotHoursWereExample: m.isExampleLaborHours }}
          why={STARTER_WHY}
        />
      </div>
      <EditButton onClick={onEdit} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs tabular-nums",
        active
          ? "border-[#F5C518] bg-[#F5C518]/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
        warn && !active && "text-amber-400"
      )}
    >
      {label}
    </button>
  );
}

// ── Assemblies ───────────────────────────────────────────────────────────────

function AssembliesTab({
  rows,
  onEdit,
}: {
  rows: AssemblyRow[] | undefined;
  onEdit: (e: Editing) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (rows === undefined) return <Skeleton />;
  return (
    <ul>
      {rows.map(a => (
        <li key={a.id} className="border-b border-border/50">
          <div className="flex items-center pr-2">
            <button
              type="button"
              onClick={() => setOpen(o => (o === a.id ? null : a.id))}
              aria-expanded={open === a.id}
              className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 text-left hover:bg-muted/30"
            >
              <span className="flex min-w-0 flex-1 basis-64 items-baseline gap-1.5 text-sm">
                {open === a.id ? (
                  <ChevronDown size={14} className="shrink-0 self-center" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 self-center" />
                )}
                {a.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.category}
              </span>
              <span className="flex w-40 items-baseline justify-end gap-2 text-sm tabular-nums">
                {a.laborOnly ? (
                  <span className="text-xs text-muted-foreground">
                    labor only ·
                  </span>
                ) : null}
                {a.baseLaborHours === null ? (
                  <span className="text-xs text-amber-400">hours not set</span>
                ) : (
                  <span>
                    {+(a.baseLaborHours + a.overheadLaborHours).toFixed(4)} h
                  </span>
                )}
                <ExampleTags
                  line={{ snapshotHoursWereExample: a.isExampleHours }}
                  why={STARTER_WHY}
                />
              </span>
            </button>
            <EditButton
              onClick={() =>
                onEdit({
                  table: "assemblies",
                  rowId: a.id,
                  itemName: a.name,
                  current: a,
                })
              }
            />
          </div>
          {open === a.id && (
            <AssemblyParts id={a.id} name={a.name} onEdit={onEdit} />
          )}
        </li>
      ))}
    </ul>
  );
}

function AssemblyParts({
  id,
  name,
  onEdit,
}: {
  id: number;
  name: string;
  onEdit: (e: Editing) => void;
}) {
  const detail = trpc.starterLibrary.assembly.useQuery({ id });
  if (!detail.data)
    return <p className="px-10 pb-3 text-xs text-muted-foreground">…</p>;
  const { parts } = detail.data;
  return (
    <div className="px-4 pb-3 sm:pl-10">
      {parts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No parts.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {parts.map(p => (
              <tr key={p.lineId} className="border-t border-border/40">
                <td className="py-1 pr-3 tabular-nums w-12 text-right">
                  {p.qty}
                </td>
                <td className="py-1 pr-3">
                  {p.name ?? (
                    <span className="text-amber-400">
                      Not a starter material (id {p.materialId})
                    </span>
                  )}
                </td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap">
                  {p.costPerUnit === null ? (
                    ""
                  ) : needsPricing(p.costPerUnit) ? (
                    <span className="text-xs text-amber-400">not priced</span>
                  ) : (
                    `${unitCost(p.costPerUnit)} / ${p.unitOfSale ? unitLabel(p.unitOfSale) : ""}`
                  )}
                </td>
                <td className="w-9 py-0.5 text-right">
                  {p.name !== null && (
                    <EditButton
                      onClick={() =>
                        onEdit({
                          table: "assemblies",
                          rowId: id,
                          itemName: `${name}: ${p.name}`,
                          current: { qty: p.qty },
                          part: { materialId: p.materialId },
                        })
                      }
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Labor rates and run types ────────────────────────────────────────────────

function LaborRatesTab({
  rows,
  onEdit,
}: {
  rows: RateRow[] | undefined;
  onEdit: (e: Editing) => void;
}) {
  if (rows === undefined) return <Skeleton />;
  return (
    <>
      <ul>
        {rows.map(r => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-4 border-b border-border/50 pl-4 pr-2 py-1.5"
          >
            <span className="flex-1 basis-48 text-sm">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {r.rateType === "salary" ? "salaried" : "hourly"} · {r.trade}
            </span>
            <span className="flex w-44 items-baseline justify-end gap-2 text-sm tabular-nums">
              {r.needsRate && !r.isExampleRate ? (
                // Not "$0.00 / h": a rate nobody set is not a free hour.
                <span className="text-xs text-amber-400">rate not set</span>
              ) : (
                <span>{money(r.hourlyRate)} / h</span>
              )}
              <ExampleTags
                line={{ snapshotLaborRateWasExample: r.isExampleRate }}
                why={STARTER_WHY}
              />
            </span>
            <EditButton
              onClick={() =>
                onEdit({
                  table: "laborRates",
                  rowId: r.id,
                  itemName: r.name,
                  current: r,
                })
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function RunTypesTab({
  rows,
  onEdit,
}: {
  rows: RunTypeRow[] | undefined;
  onEdit: (e: Editing) => void;
}) {
  if (rows === undefined) return <Skeleton />;
  return (
    <ul>
      {rows.map(t => (
        <li
          key={t.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-border/50 pl-4 pr-2 py-1.5"
        >
          <span className="flex-1 basis-48 text-sm">{t.label}</span>
          <span className="text-xs text-muted-foreground">
            {[
              t.raceway,
              t.conductor &&
                (t.conductorCount === null
                  ? `${t.conductor} (count not set)`
                  : `${t.conductorCount} × ${t.conductor}`),
              t.groundCount ? `${t.groundCount} ground` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <EditButton
            onClick={() =>
              onEdit({
                table: "runTypes",
                rowId: t.id,
                itemName: t.label,
                current: t,
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}
