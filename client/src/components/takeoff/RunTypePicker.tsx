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
import { matchesTradeQuery } from "@shared/tradeSizeQuery";
import { compareBySize } from "@shared/materialSizeOrder";

/**
 * Which catalog shelves each kind of run is drawn from.
 *
 * Conduit runs are pipe; cable runs are the cable itself. Named here rather
 * than inferred so a new shelf cannot silently start appearing in a picker
 * nobody expected it in.
 */
export const CONDUIT_SHELF = ["Conduit"];
export const CABLE_SHELF = ["Wire & Cable"];
import { runTypeSpec } from "@shared/takeoffCounts";
import { laborPerFootSentence } from "@shared/runTypeLabor";
import { cn } from "@/lib/utils";

export type PickableRunType = {
  id: number;
  label: string;
  pathType: "conduit" | "cable";
  /** Null on a cable type by design — the cable IS the raceway. */
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  groundMaterialId: number | null;
  racewayMaterialName: string | null;
  conductorMaterialName: string | null;
  groundMaterialName: string | null;
  /**
   * Hours per unit of sale for each slot, as the router resolved them.
   *
   * Here rather than looked up, because this screen does not fetch the material
   * catalog at all. Null for no link AND for a link that no longer resolves,
   * which laborPerFootForRunType reads as unset rather than as free.
   */
  racewayLaborHours: string | null;
  conductorLaborHours: string | null;
  groundLaborHours: string | null;
  conductorCount: number | null;
  groundCount: number | null;
  needsSpecification: boolean;
  isShipped: boolean;
  runCount: number;
};

/** What the editor is holding, before it is saved. */
type Draft = {
  label: string;
  racewayMaterialId: number | null;
  racewayMaterialName: string | null;
  /*
    The labour unit rides along with the name it belongs to.

    Held in the draft rather than re-fetched, so the hours line answers while
    the form is open — pick a costed conductor and the figure moves before Save.

    It is never SENT: RunTypePatch has no labour field, because the hours live
    on the material and a run type holding its own copy would be the second
    place D17 was revised to remove.
  */
  racewayLaborHours: string | null;
  conductorMaterialId: number | null;
  conductorMaterialName: string | null;
  conductorLaborHours: string | null;
  conductorCount: number | null;
  groundMaterialId: number | null;
  groundMaterialName: string | null;
  groundLaborHours: string | null;
  groundCount: number | null;
};

export type RunTypePatch = {
  label: string;
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
  groundMaterialId: number | null;
  groundCount: number | null;
};

const draftOf = (type: PickableRunType): Draft => ({
  label: type.label,
  racewayMaterialId: type.racewayMaterialId,
  racewayMaterialName: type.racewayMaterialName,
  racewayLaborHours: type.racewayLaborHours,
  conductorMaterialId: type.conductorMaterialId,
  conductorMaterialName: type.conductorMaterialName,
  conductorLaborHours: type.conductorLaborHours,
  conductorCount: type.conductorCount,
  groundMaterialId: type.groundMaterialId,
  groundMaterialName: type.groundMaterialName,
  groundLaborHours: type.groundLaborHours,
  groundCount: type.groundCount,
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
export function CountField({
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
export function MaterialSlot({
  title,
  hint,
  name,
  onPick,
  onClear,
  categories,
}: {
  title: string;
  hint: string;
  name: string | null;
  /** The catalog shelves this slot searches. See MaterialPicker. */
  categories?: readonly string[];
  onPick: (material: {
    id: number;
    name: string;
    laborHours: string | null;
  }) => void;
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
            categories={categories}
            onChoose={material => {
              onPick({
                id: material.id,
                name: material.name,
                laborHours: material.laborHours ?? null,
              });
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

/** A catalog row this picker can turn straight into a run type. */
export type PickableRunMaterial = {
  id: number;
  name: string;
  category: string | null;
};

/**
 * What a new run type is made of, as handed to the caller.
 *
 * Nothing but the label is required, because typing a name for something the
 * catalog does not stock is still a legitimate way to start — see CLAUDE.md
 * § "As manual or as automated as the user wants".
 */
export type NewRunTypeSpec = {
  label: string;
  racewayMaterialId?: number | null;
  conductorMaterialId?: number | null;
  conductorCount?: number | null;
  groundMaterialId?: number | null;
  groundCount?: number | null;
};

export function RunTypePicker({
  pathType,
  types,
  catalog = [],
  armedId,
  onPick,
  onCreate,
  onSave,
  disabled,
  children,
}: {
  pathType: "conduit" | "cable";
  types: PickableRunType[];
  /** The materials catalog, so a run needs no type defined first. */
  catalog?: PickableRunMaterial[];
  armedId: number | null;
  onPick: (type: PickableRunType) => void;
  /** Define one that does not exist yet, from whatever was typed. */
  /**
   * Define one that does not exist yet.
   *
   * ── It carries the MATERIAL now, not just a name ──────────────────────────
   * Widened 2026-09-24. This used to take a bare label, so a type created here
   * had no `racewayMaterialId` — it traced footage and priced the pipe at
   * nothing. That was survivable while the only way in was typing a name
   * nobody had a material for; it is not survivable now that the list below
   * offers the catalog, because picking `2" PVC Sch 40` and getting a $0 line
   * would look exactly like picking it and getting a priced one.
   *
   * Every field the create route already accepts is passed through. The route
   * has taken them since it was written — the gap was only ever here.
   */
  onCreate: (spec: NewRunTypeSpec) => void;
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

  /**
   * The catalog, for a run whose type nobody has defined yet.
   *
   * ── Why the whole shelf and not just saved types ─────────────────────────
   * Reported 2026-09-24: "2 inch pvc" and "10/2" returned nothing but "New
   * conduit type", because this list only ever held run types somebody had
   * already created. That makes defining a type a toll gate in front of the
   * first trace, which is the thing CLAUDE.md § "As manual or as automated"
   * rules out — a plain 2" PVC run should need no setup at all.
   *
   * Saved types stay FIRST and keep their role as shortcuts: they carry
   * conductors, grounds and a name somebody chose. The catalog is the fallback
   * underneath, and picking from it creates the type in one step.
   *
   * Matching goes through `matchesTradeQuery` rather than `smartSearch`
   * because the failure here is spelling, not ranking: the catalog says
   * `2" PVC Sch 40` and `10-2 NM-B` while people type `2 inch pvc` and `10/2`.
   */
  const catalogHits = useMemo(() => {
    if (!query.trim() || catalog.length === 0) return [];
    const shelf = pathType === "conduit" ? CONDUIT_SHELF : CABLE_SHELF;
    const alreadyNamed = new Set(mine.map(t => t.label.toLowerCase()));
    return catalog
      .filter(m => shelf.includes(m.category ?? ""))
      .filter(m => !alreadyNamed.has(m.name.toLowerCase()))
      .filter(m => matchesTradeQuery(m.name, query))
      .sort((a, b) => compareBySize(a.name, b.name))
      .slice(0, MAX_RESULTS);
  }, [query, catalog, pathType, mine]);

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
                categories={CONDUIT_SHELF}
                hint="Search conduit — “EMT”, “PVC”, “flex”…"
                name={draft.racewayMaterialName}
                onPick={m =>
                  setDraft({
                    ...draft,
                    racewayMaterialId: m.id,
                    racewayMaterialName: m.name,
                    racewayLaborHours: m.laborHours,
                  })
                }
                onClear={() =>
                  setDraft({
                    ...draft,
                    racewayMaterialId: null,
                    racewayMaterialName: null,
                    racewayLaborHours: null,
                  })
                }
              />
            )}

            <MaterialSlot
              title={pathType === "cable" ? "The cable" : "Conductor"}
              categories={CABLE_SHELF}
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
                  conductorLaborHours: m.laborHours,
                })
              }
              onClear={() =>
                setDraft({
                  ...draft,
                  conductorMaterialId: null,
                  conductorMaterialName: null,
                  conductorLaborHours: null,
                })
              }
            />

            {/*
              The ground gets its own slot, and only on a conduit type.

              A cable carries its ground inside the jacket — a 12-2 MC IS two
              conductors and a ground — so there is nothing separate to name or
              to buy, and offering a picker would be offering a field that must
              stay null. Same reasoning as the raceway slot above.
            */}
            {pathType === "conduit" && (
              <MaterialSlot
                title="Ground"
                categories={CABLE_SHELF}
                hint="Search ground wire — “#12 bare”, “#10 green”…"
                name={draft.groundMaterialName}
                onPick={m =>
                  setDraft({
                    ...draft,
                    groundMaterialId: m.id,
                    groundMaterialName: m.name,
                    groundLaborHours: m.laborHours,
                  })
                }
                onClear={() =>
                  setDraft({
                    ...draft,
                    groundMaterialId: null,
                    groundMaterialName: null,
                    groundLaborHours: null,
                  })
                }
              />
            )}

            {pathType === "conduit" && (
              <div className="mt-2.5">
                <p className="text-[0.7rem] font-medium">
                  Conductors per circuit
                </p>
                {/*
                  "ground included" is gone, and its going is the whole point.

                  Until 2026-09-20 the note saying so sat directly BELOW a
                  second comment still explaining that the count included the
                  ground — the replacement was written and the thing it replaced
                  was never deleted, so the file asserted both meanings at once.
                  That is the same fault one level up: a reader takes the first
                  one they reach and stops looking.

                  It was true while one column counted both, and it stopped
                  being true when 0063 split them. A caption that quietly
                  describes the old meaning next to a number that now has a new
                  one is worse than no caption: it reads as confirmation.
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
                    insulated, not counting the ground
                  </span>
                </div>

                <p className="text-[0.7rem] font-medium mt-2.5">Grounds</p>
                <div className="flex items-center gap-2 mt-1">
                  <CountField
                    value={draft.groundCount}
                    min={0}
                    max={10}
                    onChange={groundCount =>
                      setDraft({ ...draft, groundCount })
                    }
                    ariaLabel="Grounds per circuit"
                  />
                  <span className="text-[0.7rem] text-muted-foreground">
                    usually one; two on an isolated ground
                  </span>
                </div>
              </div>
            )}

            {/*
              WHAT A FOOT OF THIS TAKES, FROM THE MATERIALS THEMSELVES.

              Nothing here is typed and nothing here is saved. D17 was revised
              on 2026-09-20 to read a run's labour off the same material rows
              everything else reads, precisely so this number cannot be
              maintained in two places and disagree with itself — so this is a
              readout, not a field.

              It is muted body text rather than a warning even when it says
              something is missing, matching "No materials yet — cannot be
              priced" on the rows below. A type with no hours yet is not a
              mistake; it is a job somebody has not done, and it is stated where
              they can do it.

              The sentence is built in shared/runTypeLabor.ts so this and the
              row below cannot word it differently — and so the rule that a
              partial figure never appears without what it is short by has a
              test that can go red.
            */}
            <p className="text-[0.7rem] text-muted-foreground mt-2.5">
              Labor {laborPerFootSentence({ ...draft, pathType })}
            </p>

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
                      /*
                        Passed through on a cable rather than nulled, and the
                        difference from the raceway above is the point.

                        Forcing the raceway to null on a cable is a GUARD: a
                        cable has no pipe, and a stray raceway link would be
                        wrong data. Doing the same to the ground would DESTROY
                        right data — 0064 split the shipped cables too, so
                        "12-2 MC cable" correctly stores 2 conductors and 1
                        ground, describing what is inside the jacket.

                        The cable form does not show these fields, so the draft
                        still holds whatever the type had and writes it back
                        unchanged. A form that cannot edit a field must not
                        clear it.
                      */
                      groundMaterialId: draft.groundMaterialId,
                      groundCount: draft.groundCount,
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
                      onCreate({ label: query.trim() });
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
                        <>
                          {runTypeSpec(type) && (
                            <span className="block text-[0.7rem] text-muted-foreground truncate">
                              {runTypeSpec(type)}
                            </span>
                          )}
                          {/*
                            What a foot takes, on the row where the type is
                            CHOSEN — the same reason the specification is here
                            rather than behind a hover. Six runs get traced
                            under a choice made in a second, and "this one has
                            no hours on its wire" is worth knowing before that
                            rather than at pricing.

                            Only on a specified type: a row already saying it
                            has no materials does not need a second line saying
                            it therefore has no hours.
                          */}
                          {/*
                            NOT truncate, and the line above it still is.

                            An IDENTIFIER may be clipped — the spec line names
                            materials, and "1/2in EMT · 2 x #12 THHN + #12 ba…"
                            still tells you which row this is. A CAVEAT may not.
                            Measured in the popover on 2026-09-20: the line box
                            is 191px, and the full sentence is 327px, so this
                            shipped for one screenshot reading "No labor units
                            yet — priced at mat…" — the figure's warning cut off
                            exactly where it started to say why it mattered.

                            Shortening was the obvious fix and is the wrong one:
                            at 191px even "0.0605 h per ft · 2 of 3 unset" is
                            217px, so any wording is one longer rate or a
                            two-digit count away from clipping again. Wrapping
                            cannot fail that way, and it costs a second line
                            only on the types that have something to warn about.
                          */}
                          <span className="block text-[0.7rem] text-muted-foreground">
                            {laborPerFootSentence(type)}
                          </span>
                        </>
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

              {/*
                ── The catalog, underneath the saved types ───────────────────
                Second, not first: a saved type carries conductors, grounds and
                a name somebody chose, and it should keep winning. This is the
                fallback that means a plain 2" PVC run needs no setup at all.

                Picking one creates the type WITH its raceway material, so the
                pipe prices. That is the whole point of the change — a row here
                that produced a $0 line would be worse than no row.
              */}
              {catalogHits.length > 0 && (
                <>
                  <div className="h-px bg-border my-1.5" />
                  <p className="px-2 pb-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    From the catalog
                  </p>
                  {catalogHits.map(material => (
                    <button
                      key={material.id}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-start gap-2"
                      onClick={() => {
                        onCreate({
                          label: material.name,
                          racewayMaterialId:
                            pathType === "conduit" ? material.id : null,
                          // A cable IS the run, so it goes in the conductor
                          // slot — there is no pipe to put it in.
                          conductorMaterialId:
                            pathType === "cable" ? material.id : null,
                          conductorCount: pathType === "cable" ? 1 : null,
                        });
                        setOpen(false);
                      }}
                    >
                      <Plus className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{material.name}</span>
                        <span className="block text-[0.7rem] text-muted-foreground">
                          Makes a {pathType} type from this material
                        </span>
                      </span>
                    </button>
                  ))}
                </>
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
                    onCreate({ label: query.trim() });
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
