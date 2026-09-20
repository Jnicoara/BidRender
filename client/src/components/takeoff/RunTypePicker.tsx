/**
 * RunTypePicker — arm the trace tool with a kind of run.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Tracing used to ask only "conduit or cable", so every run on a sheet was
 * named "Run on Sheet 3", drawn in the same colour as its neighbour, and had
 * its settings entered again one run at a time. D3(a) in
 * references/takeoff-spec.md chose the answer on 2026-09-14 and rejected the
 * alternative by name: choose before tracing, and remember it for the next run
 * — exactly how the mark tool holds a counted group.
 *
 * So a run says what it is by being traced under a TYPE. The type carries the
 * name, the specification and later the colour; the run carries where it is and
 * how long.
 *
 * ── Sticky, because that is the whole point ──────────────────────────────────
 * Arming is a decision made once and spent many times: six identical homeruns
 * is one choice and six traces, not six choices. The caller keeps the armed
 * type per path type, so switching between conduit and cable does not lose
 * either. This component only opens when somebody wants to CHANGE it.
 *
 * ── Specifying one happens HERE, not on a screen of its own ─────────────────
 * The sidebar is eight destinations, down from fourteen, because several
 * screens were folded into the ones they belonged to. A ninth for a list most
 * contractors will touch twice would be that mistake in reverse. So the form
 * that says what a type is made of opens inside this popover, on the row it
 * belongs to — CLAUDE.md § "Customization available, but never in the way".
 *
 * Editing a SHIPPED type forks it, and the server does that on its own so no
 * caller can forget. This says so out loud when it happens: silently ending up
 * with two rows called 1/2in EMT and no idea which is yours is worse than the
 * extra sentence.
 *
 * ── A type that cannot price yet is offered anyway, and says so ──────────────
 * `needsSpecification` marks a type with no material behind it — the four rows
 * the backfill made from runs that predate the palette, and anything created
 * in a hurry. It is still perfectly good for naming and telling runs apart, so
 * hiding it would remove the thing somebody is mid-way through using. It is
 * labelled instead, the same way an unpriced material shows its $0 rather than
 * being filtered out of the library.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MaterialPicker } from "@/components/MaterialPicker";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { smartSearch } from "@/lib/smartSearch";
import { runTypeSpec } from "@shared/takeoffCounts";
import { cn } from "@/lib/utils";

export type PickableRunType = {
  id: number;
  label: string;
  pathType: "conduit" | "cable";
  /** Null on a cable type by design — the cable IS the raceway. */
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  racewayMaterialName: string | null;
  conductorMaterialName: string | null;
  conductorCount: number | null;
  needsSpecification: boolean;
  isShipped: boolean;
  runCount: number;
};

/** What the editor is holding, before it is saved. */
type Draft = {
  label: string;
  racewayMaterialId: number | null;
  racewayMaterialName: string | null;
  conductorMaterialId: number | null;
  conductorMaterialName: string | null;
  conductorCount: number | null;
};

export type RunTypePatch = {
  label: string;
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
};

const draftOf = (type: PickableRunType): Draft => ({
  label: type.label,
  racewayMaterialId: type.racewayMaterialId,
  racewayMaterialName: type.racewayMaterialName,
  conductorMaterialId: type.conductorMaterialId,
  conductorMaterialName: type.conductorMaterialName,
  conductorCount: type.conductorCount,
});

/**
 * A whole-number count in a DRAFT form, blank when nobody has said.
 *
 * ── Not InlineNumberField, and not by omission ──────────────────────────────
 * That component saves as you type, and its own header says a field inside an
 * explicit Save/Cancel form wants `selectOnFocus` alone. Here the draft IS the
 * state and Save is the commit, so there is nothing to persist per keystroke.
 *
 * ── Blank is unset, and that is the whole point of it being a component ─────
 * A count of zero conductors is a claim, and a false one. This shipped once as
 * a plain `0` in the field that decides how much wire gets bought — the second
 * time in this app after `0 ft 0 in` under a caption reading "not set". It is a
 * component rather than a copied input so the next count beside it cannot make
 * the same choice independently.
 */
function CountField({
  value,
  onChange,
  min = 1,
  max = 100,
  ariaLabel,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  return (
    <Input
      value={value === null ? "" : String(value)}
      onChange={e => {
        const raw = e.target.value.trim();
        if (raw === "") {
          onChange(null);
          return;
        }
        const next = Number(raw);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(max, Math.max(min, Math.floor(next))));
      }}
      onFocus={selectOnFocus}
      inputMode="numeric"
      placeholder="not set"
      className="h-7 w-16 text-xs"
      aria-label={ariaLabel}
    />
  );
}

/**
 * One material slot: what is in it, and how to change it.
 *
 * Collapsed to a line until somebody asks, because two open search boxes in a
 * popover is a screen of search boxes. Empty says what is missing rather than
 * sitting blank — an unset material is the thing that makes a type unpriceable,
 * and it has to read as absent rather than as nothing-to-see.
 */
function MaterialSlot({
  title,
  hint,
  name,
  onPick,
  onClear,
}: {
  title: string;
  hint: string;
  name: string | null;
  onPick: (material: { id: number; name: string }) => void;
  onClear: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="mt-2.5">
      <p className="text-[0.7rem] font-medium">{title}</p>
      {picking ? (
        <div className="mt-1">
          <MaterialPicker
            compact
            autoFocus
            ariaLabel={title}
            placeholder={hint}
            onChoose={material => {
              onPick({ id: material.id, name: material.name });
              setPicking(false);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 mt-1 px-1.5 text-[0.7rem] text-muted-foreground"
            onClick={() => setPicking(false)}
          >
            <ArrowLeft className="w-3 h-3 mr-1" /> Back
          </Button>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            className="flex-1 min-w-0 text-left rounded border border-border px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setPicking(true)}
          >
            {name ? (
              <span className="block truncate">{name}</span>
            ) : (
              <span className="block truncate text-muted-foreground">
                Not set — pick one
              </span>
            )}
          </button>
          {name && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={onClear}
              title={`Clear ${title.toLowerCase()}`}
              aria-label={`Clear ${title.toLowerCase()}`}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Enough to choose from without the list becoming the screen. */
const MAX_RESULTS = 8;

export function RunTypePicker({
  pathType,
  types,
  armedId,
  onPick,
  onCreate,
  onSave,
  disabled,
  children,
}: {
  pathType: "conduit" | "cable";
  types: PickableRunType[];
  armedId: number | null;
  onPick: (type: PickableRunType) => void;
  /** Define one that does not exist yet, from whatever was typed. */
  onCreate: (label: string) => void;
  /**
   * Save what a type is made of. Omitted hides the editor entirely.
   *
   * The caller owns the mutation because it owns the refetch — and it is the
   * one that has to say the fork out loud, since `update` is what reports it.
   */
  onSave?: (id: number, patch: RunTypePatch) => Promise<void> | void;
  disabled?: boolean;
  /** The trigger. Given so the caller decides what the button looks like. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** The type being specified, and the draft being specified into. */
  const [editing, setEditing] = useState<PickableRunType | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = (type: PickableRunType) => {
    setEditing(type);
    setDraft(draftOf(type));
  };
  const stopEditing = () => {
    setEditing(null);
    setDraft(null);
  };

  const mine = useMemo(
    () => types.filter(t => t.pathType === pathType),
    [types, pathType]
  );

  const searchable = useMemo(
    () => mine.map(t => ({ id: String(t.id), description: t.label })),
    [mine]
  );

  const results = useMemo(() => {
    if (!query.trim()) return mine.slice(0, MAX_RESULTS);
    const hits = smartSearch(searchable, query, MAX_RESULTS);
    const byId = new Map(mine.map(t => [t.id, t]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((t): t is PickableRunType => Boolean(t));
  }, [query, searchable, mine]);

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        // Cleared on close so reopening does not present a stale query as the
        // current filter — same as the mark picker. The editor goes with it:
        // a half-typed specification is abandoned rather than kept warm, for
        // the same reason Escape abandons everywhere else in the app.
        if (!next) {
          setQuery("");
          stopEditing();
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {children ?? (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <ChevronDown className="w-3 h-3" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        {editing && draft ? (
          <>
            <div className="flex items-center gap-1 mb-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground shrink-0"
                onClick={stopEditing}
                aria-label="Back to the list"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </Button>
              <p className="text-xs font-medium truncate">
                What is this made of?
              </p>
            </div>
            {/*
              Said BEFORE the edit, not after it. A fork the user learns about
              from a toast has already happened; a fork they were told about is
              a choice. The server still does it either way — this is the
              sentence, not the guard.
            */}
            {editing.isShipped && (
              <p className="text-[0.7rem] text-muted-foreground mb-1.5 leading-snug">
                This is a type BidRidge ships. Saving makes your own copy of it
                and leaves the original alone.
              </p>
            )}

            <p className="text-[0.7rem] font-medium">Name</p>
            <Input
              value={draft.label}
              onChange={e => setDraft({ ...draft, label: e.target.value })}
              onFocus={selectOnFocus}
              onKeyDown={e => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  stopEditing();
                }
              }}
              placeholder={`3/4" EMT, 3 #12 THHN`}
              className="h-7 mt-1 text-xs"
              aria-label="Run type name"
            />

            {/*
              A cable type has no raceway slot at all, rather than an empty one.
              The cable IS the raceway and the conductor link holds it — see
              drizzle/schema.ts on takeoff_run_types — so offering a pipe to put
              it in would be offering a field that must stay null.
            */}
            {pathType === "conduit" && (
              <MaterialSlot
                title="Raceway"
                hint="Search conduit — “EMT”, “PVC”, “flex”…"
                name={draft.racewayMaterialName}
                onPick={m =>
                  setDraft({
                    ...draft,
                    racewayMaterialId: m.id,
                    racewayMaterialName: m.name,
                  })
                }
                onClear={() =>
                  setDraft({
                    ...draft,
                    racewayMaterialId: null,
                    racewayMaterialName: null,
                  })
                }
              />
            )}

            <MaterialSlot
              title={pathType === "cable" ? "The cable" : "Conductor"}
              hint={
                pathType === "cable"
                  ? "Search cable — “MC”, “romex”, “12-2”…"
                  : "Search wire — “#12 THHN”, “#10 stranded”…"
              }
              name={draft.conductorMaterialName}
              onPick={m =>
                setDraft({
                  ...draft,
                  conductorMaterialId: m.id,
                  conductorMaterialName: m.name,
                })
              }
              onClear={() =>
                setDraft({
                  ...draft,
                  conductorMaterialId: null,
                  conductorMaterialName: null,
                })
              }
            />

            {pathType === "conduit" && (
              <div className="mt-2.5">
                <p className="text-[0.7rem] font-medium">
                  Conductors per circuit
                </p>
                {/*
                  Including the ground, which is how takeoff_run_circuits counts
                  and how a run started under this type will count. Said here
                  because two meanings for one number is worse than one
                  imperfect meaning — § 2.1 of the overhaul document.
                */}
                <div className="flex items-center gap-2 mt-1">
                  <CountField
                    value={draft.conductorCount}
                    onChange={conductorCount =>
                      setDraft({ ...draft, conductorCount })
                    }
                    ariaLabel="Conductors per circuit"
                  />
                  <span className="text-[0.7rem] text-muted-foreground">
                    ground included
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-3">
              <Button
                size="sm"
                className="h-7 flex-1 gap-1.5 text-xs"
                disabled={!draft.label.trim() || saving || !onSave}
                onClick={async () => {
                  if (!onSave) return;
                  setSaving(true);
                  try {
                    await onSave(editing.id, {
                      label: draft.label.trim(),
                      racewayMaterialId:
                        pathType === "cable" ? null : draft.racewayMaterialId,
                      conductorMaterialId: draft.conductorMaterialId,
                      conductorCount: draft.conductorCount,
                    });
                    stopEditing();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Check className="w-3 h-3" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={stopEditing}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium mb-1">
              What kind of {pathType} run?
            </p>
            <p className="text-[0.7rem] text-muted-foreground mb-2">
              Every run you trace takes this until you change it.
            </p>

            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    if (results[0]) {
                      onPick(results[0]);
                      setOpen(false);
                    } else if (query.trim()) {
                      onCreate(query.trim());
                      setOpen(false);
                    }
                  }
                }}
                placeholder="Search, or type a new one…"
                className="h-7 pl-7 text-xs"
                autoFocus
              />
            </div>

            <div className="max-h-56 overflow-y-auto">
              {results.map(type => (
                <div
                  key={type.id}
                  className="flex items-start gap-1 rounded hover:bg-muted"
                >
                  <button
                    className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs flex items-start gap-2"
                    onClick={() => {
                      onPick(type);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "w-3 h-3 mt-0.5 shrink-0",
                        type.id === armedId ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{type.label}</span>
                      {/*
                  Said where it is chosen, not hidden behind a hover. A type
                  with nothing behind it still counts and still names its runs;
                  what it cannot do is price them, and that is worth knowing
                  before six runs are traced under it.

                  Once it HAS materials the same line says what they are, so
                  the palette answers "which of these is the 3/4 inch" without
                  opening anything. One helper builds the sentence for every
                  surface — shared/takeoffCounts.ts.
                */}
                      {type.needsSpecification ? (
                        <span className="block text-[0.7rem] text-muted-foreground">
                          No materials yet — cannot be priced
                        </span>
                      ) : (
                        runTypeSpec(type) && (
                          <span className="block text-[0.7rem] text-muted-foreground truncate">
                            {runTypeSpec(type)}
                          </span>
                        )
                      )}
                    </span>
                    {type.runCount > 0 && (
                      <span className="text-[0.7rem] text-muted-foreground shrink-0 tabular-nums">
                        {type.runCount}
                      </span>
                    )}
                  </button>
                  {onSave && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
                      onClick={() => startEditing(type)}
                      title={`Say what "${type.label}" is made of`}
                      aria-label={`Edit ${type.label}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}

              {results.length === 0 && !query.trim() && (
                <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
                  No {pathType} types yet — type a name to make one.
                </p>
              )}
            </div>

            {/*
          Defining one from what was typed, in the same place and the same
          shape as the mark picker's escape hatch. Counting first and pricing
          later is the natural order of the job, and so is tracing first and
          specifying later.
        */}
            {query.trim() && (
              <>
                <div className="h-px bg-border my-1.5" />
                <button
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted"
                  onClick={() => {
                    onCreate(query.trim());
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      New {pathType} type “
                      <span className="font-medium">{query.trim()}</span>”
                    </span>
                  </span>
                  <span className="block text-[0.7rem] text-muted-foreground mt-0.5 pl-[1.125rem]">
                    Add the materials to it whenever you like
                  </span>
                </button>
              </>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
