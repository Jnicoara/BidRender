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
import {
  laborPerFootCoverage,
  laborPerFootSentence,
} from "@shared/runTypeLabor";
import {
  isMarkColor,
  MARK_COLOR_NAMES,
  MARK_COLORS,
  runTypeColor,
  runTypeColorsInUse,
  runTypeColorShiftsIf,
  withRunTypeChoice,
  type MarkColor,
  type RunTypeColors,
} from "@shared/takeoffMarks";
import { RunTypeSwatch } from "@/components/takeoff/runIcons";
import {
  EMT_FITTING_STYLES,
  EMT_FITTING_STYLE_LABELS,
  isEmtFittingStyle,
  parseRacewayName,
  type EmtFittingStyle,
} from "@shared/runFittingMaterials";
import { cn } from "@/lib/utils";

export type PickableRunType = {
  id: number;
  label: string;
  pathType: "conduit" | "cable";
  /** A chosen color (Part B, 0088), or null for automatic. */
  color: string | null;
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
  /** EMT fitting style; NULL reads as set-screw. */
  fittingStyle: string | null;
  couplingMaterialId: number | null;
  connectorMaterialId: number | null;
  strapMaterialId: number | null;
  couplingMaterialName: string | null;
  connectorMaterialName: string | null;
  strapMaterialName: string | null;
  /**
   * This type's own extra and makeup (0090), NULL to follow the company.
   * Percentages as fractions; makeup in inches per conductor per end.
   */
  conduitExtraPct: number | null;
  wireExtraPct: number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  makeupByKindInches: Record<string, number> | null;
  /**
   * The rows every traced 90 and 45 is bought as, instead of the catalog's
   * standard elbow — how a type counts SWEEPS (plan § 8, S6). A sweep here
   * also widens how far apart two clicks can be and still be one bend
   * (`bendMergeFeetForOverrides`).
   */
  elbow90MaterialId: number | null;
  elbow45MaterialId: number | null;
  elbow90MaterialName: string | null;
  elbow45MaterialName: string | null;
  needsSpecification: boolean;
  isShipped: boolean;
  runCount: number;
};

/** What the editor is holding, before it is saved. */
type Draft = {
  label: string;
  /** Null is automatic. A stored value outside the palette opens as automatic. */
  color: MarkColor | null;
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
  fittingStyle: EmtFittingStyle | null;
  couplingMaterialId: number | null;
  couplingMaterialName: string | null;
  connectorMaterialId: number | null;
  connectorMaterialName: string | null;
  strapMaterialId: number | null;
  strapMaterialName: string | null;
  conduitExtraPct: number | null;
  wireExtraPct: number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  makeupByKindInches: Record<string, number> | null;
  elbow90MaterialId: number | null;
  elbow90MaterialName: string | null;
  elbow45MaterialId: number | null;
  elbow45MaterialName: string | null;
};

export type RunTypePatch = {
  label: string;
  /** Null is automatic. Sent every save, from a draft opened on the stored value. */
  color: MarkColor | null;
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
  groundMaterialId: number | null;
  groundCount: number | null;
  fittingStyle: EmtFittingStyle | null;
  couplingMaterialId: number | null;
  connectorMaterialId: number | null;
  strapMaterialId: number | null;
  /*
    Extra and makeup (0090). Sent every save from a draft opened on the stored
    row, so a field the form did not touch is written back unchanged — never
    cleared (CLAUDE.md § Editing fields, rule 7).
  */
  conduitExtraPct: number | null;
  wireExtraPct: number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  makeupByKindInches: Record<string, number> | null;
  elbow90MaterialId: number | null;
  elbow45MaterialId: number | null;
};

/** Where a fitting override is picked from. */
const FITTING_SHELF = ["Conduit Fittings", "Strut & Supports"];

/**
 * Whether the style picker applies. By the shipped name first, then by the
 * word, so a company that renamed its EMT fork still gets the picker.
 */
function isEmt(racewayName: string | null): boolean {
  if (racewayName === null) return false;
  return (
    parseRacewayName(racewayName)?.family === "EMT" ||
    /\bEMT\b/.test(racewayName)
  );
}

const draftOf = (type: PickableRunType): Draft => ({
  label: type.label,
  color: isMarkColor(type.color) ? type.color : null,
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
  fittingStyle: isEmtFittingStyle(type.fittingStyle) ? type.fittingStyle : null,
  couplingMaterialId: type.couplingMaterialId,
  couplingMaterialName: type.couplingMaterialName,
  connectorMaterialId: type.connectorMaterialId,
  connectorMaterialName: type.connectorMaterialName,
  strapMaterialId: type.strapMaterialId,
  strapMaterialName: type.strapMaterialName,
  conduitExtraPct: type.conduitExtraPct,
  wireExtraPct: type.wireExtraPct,
  makeupDeviceInches: type.makeupDeviceInches,
  makeupPanelInches: type.makeupPanelInches,
  makeupByKindInches: type.makeupByKindInches,
  elbow90MaterialId: type.elbow90MaterialId,
  elbow90MaterialName: type.elbow90MaterialName,
  elbow45MaterialId: type.elbow45MaterialId,
  elbow45MaterialName: type.elbow45MaterialName,
});

/**
 * One extra or makeup figure in the DRAFT form, blank when the type follows
 * the company. Like `CountField`: the draft is the state and Save is the
 * commit, so this holds a null rather than inventing a zero — a blank extra
 * means "the company's", and a typed 0 means "none on this type".
 */
function ExtraDraftField({
  value,
  onChange,
  suffix,
  max,
  ariaLabel,
}: {
  /** In the unit the field SHOWS: percent, or inches. */
  value: number | null;
  onChange: (next: number | null) => void;
  suffix: string;
  max: number;
  ariaLabel: string;
}) {
  return (
    <span className="flex items-center gap-1">
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
          onChange(Math.min(max, Math.max(0, next)));
        }}
        onFocus={selectOnFocus}
        inputMode="decimal"
        placeholder="company"
        className="h-7 w-20 text-xs"
        aria-label={ariaLabel}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

/** A fraction as the percent a field shows, rounded to what anyone types. */
const toPct = (fraction: number | null) =>
  fraction === null ? null : Math.round(fraction * 10000) / 100;
const fromPct = (percent: number | null) =>
  percent === null ? null : percent / 100;

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
  emptyLabel = "Not set — pick one",
}: {
  title: string;
  hint: string;
  name: string | null;
  /**
   * What an empty slot SAYS. An input rather than a constant because empty
   * means different things in different slots: a missing raceway is a gap,
   * while an empty fitting override means "the catalog decides" and must not
   * read as a warning (CLAUDE.md, the `HeightFields` rule).
   */
  emptyLabel?: string;
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
      <p className="text-xs font-medium">{title}</p>
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
            className="h-6 mt-1 px-1.5 text-xs text-muted-foreground"
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
                {emptyLabel}
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
  runColors,
  customHeightTypes = [],
}: {
  pathType: "conduit" | "cable";
  types: PickableRunType[];
  /**
   * The company's OWN height types — a "Switchboard", an "MCC" — each of
   * which can take its own makeup on this type (owner, 2026-09-28: every value
   * at every level). Empty hides that part of the editor.
   */
  customHeightTypes?: readonly { typeKey: string; label: string }[];
  /**
   * Which colour each type has on this bid — `takeoffRuns.typeColors`. Each
   * row wears it, so choosing a type shows which lines on the drawing are
   * already that type. A type not yet used here shows no colour (see
   * RunTypeSwatch).
   */
  runColors: RunTypeColors;
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
  const [choosingFittings, setChoosingFittings] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  const startEditing = (type: PickableRunType) => {
    setEditing(type);
    setDraft(draftOf(type));
  };
  const stopEditing = () => {
    setEditing(null);
    setDraft(null);
    setChoosingFittings(false);
    setShowExtras(false);
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
      {/*
        Capped at the room Radix reports and scrolled, like the app's menus.
        The editor with "Choose fittings yourself" open measured 873px tall
        in a 737px window with no scroll, and Save sat at y=957 — off the
        screen, and past reach (2026-09-29, when the 90°/45° rows arrived;
        it was already over with the first three).
      */}
      <PopoverContent
        align="start"
        className="w-72 p-2 max-h-(--radix-popover-content-available-height) overflow-y-auto"
      >
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
              <p className="text-xs text-muted-foreground mb-1.5 leading-snug">
                This is a type BidRidge ships. Saving makes your own copy of it
                and leaves the original alone.
              </p>
            )}

            <p className="text-xs font-medium">Name</p>
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
              COLOR (Part B, owner 2026-09-27). The ONE place a type's color is
              chosen: everywhere else only shows it. Automatic first, because
              it is the default and the common case; the six after it.

              A swatch another type on this bid already wears says so ("also
              used by …") and is still pickable — two types may share a color
              (answer 2). Automatic shows the color it would be on this bid
              right now, so choosing it is not a guess.
            */}
            {(() => {
              const labels = new Map(types.map(t => [t.id, t.label]));
              const inUse = runTypeColorsInUse(runColors, labels, editing.id);
              const automatic = runTypeColor(
                editing.id,
                withRunTypeChoice(runColors, editing.id, null)
              );
              // Said before Save, so three lines do not recolor unannounced.
              const shifts = runTypeColorShiftsIf(
                runColors,
                labels,
                editing.id,
                draft.color
              );
              return (
                <div className="mt-2">
                  <p className="text-xs font-medium">Color</p>
                  <div
                    className="mt-1 flex flex-wrap items-center gap-1.5"
                    role="radiogroup"
                    aria-label="Run type color"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.color === null}
                      onClick={() => setDraft({ ...draft, color: null })}
                      className={cn(
                        "h-6 px-2 rounded border text-xs flex items-center gap-1.5",
                        draft.color === null
                          ? "border-foreground text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                      title={`Automatic — ${MARK_COLOR_NAMES[automatic].toLowerCase()} on this bid now, and whatever color is free on another`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: automatic }}
                        aria-hidden
                      />
                      Automatic
                    </button>
                    {MARK_COLORS.map(color => {
                      const others = inUse.get(color) ?? [];
                      const name = MARK_COLOR_NAMES[color];
                      const said =
                        others.length > 0
                          ? `${name} — also used by ${others.join(", ")} on this bid`
                          : name;
                      return (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={draft.color === color}
                          aria-label={said}
                          title={said}
                          onClick={() => setDraft({ ...draft, color })}
                          className={cn(
                            "relative w-6 h-6 rounded-full border-2 transition-transform",
                            draft.color === color
                              ? "border-foreground scale-110"
                              : "border-transparent hover:scale-110"
                          )}
                          style={{ background: color }}
                        >
                          {others.length > 0 && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-background border border-foreground/70"
                              aria-hidden
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {draft.color !== null &&
                    (inUse.get(draft.color)?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground leading-snug">
                        Also used by {inUse.get(draft.color)!.join(", ")} on
                        this bid.
                      </p>
                    )}
                  {draft.color !== null && (
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">
                      This color follows the type to every bid.
                    </p>
                  )}
                  {shifts.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">
                      On this bid,{" "}
                      {shifts
                        .map(
                          s =>
                            `${s.label} changes to ${MARK_COLOR_NAMES[s.to].toLowerCase()}`
                        )
                        .join(", ")}
                      .
                    </p>
                  )}
                </div>
              );
            })()}

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
                <p className="text-xs font-medium">Conductors per circuit</p>
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
                  <span className="text-xs text-muted-foreground">
                    insulated, not counting the ground
                  </span>
                </div>

                <p className="text-xs font-medium mt-2.5">Grounds</p>
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
                  <span className="text-xs text-muted-foreground">
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
            {/*
              FITTINGS — counted from the trace, so nothing here is a number.
              What the type decides is only WHICH rows they come from.

              The style is the common choice, so it is visible; it applies to
              EMT only until other families' styles ship (todo.md). Naming
              fittings by hand is the rare one — a custom raceway, or a part a
              company always buys — so it sits behind ONE control, and opens
              by itself when the type already names one (CLAUDE.md § "Hide
              OURS, never THEIRS").
            */}
            {pathType === "conduit" && (
              <div className="mt-2.5">
                <p className="text-xs font-medium">Fittings</p>
                {isEmt(draft.racewayMaterialName) ? (
                  <div
                    className="mt-1 flex gap-1"
                    role="radiogroup"
                    aria-label="EMT fitting style"
                  >
                    {EMT_FITTING_STYLES.map(style => {
                      const chosen =
                        (draft.fittingStyle ?? "set-screw") === style;
                      return (
                        <button
                          key={style}
                          type="button"
                          role="radio"
                          aria-checked={chosen}
                          onClick={() =>
                            setDraft({ ...draft, fittingStyle: style })
                          }
                          className={cn(
                            "flex-1 rounded border px-1.5 py-1 text-xs",
                            chosen
                              ? "border-[#F5C518] bg-[#F5C518]/10 text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {EMT_FITTING_STYLE_LABELS[style]}
                          {chosen && draft.fittingStyle === null
                            ? " (default)"
                            : ""}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Couplings, connectors, straps and bends are counted from the
                    trace and matched to this raceway in the catalog.
                  </p>
                )}

                {choosingFittings ||
                draft.couplingMaterialId !== null ||
                draft.connectorMaterialId !== null ||
                draft.strapMaterialId !== null ||
                draft.elbow90MaterialId !== null ||
                draft.elbow45MaterialId !== null ? (
                  <>
                    {(
                      [
                        ["coupling", "Coupling", "coupling"],
                        ["connector", "Connector", "connector"],
                        ["strap", "Strap", "strap"],
                        // Where a type is told to count sweeps (plan § 8, S6).
                        ["elbow90", "90° bends", "sweep"],
                        ["elbow45", "45° bends", "45 sweep"],
                      ] as const
                    ).map(([kind, title, example]) => (
                      <MaterialSlot
                        key={kind}
                        title={title}
                        categories={FITTING_SHELF}
                        hint={`Search fittings — “${example}”…`}
                        name={draft[`${kind}MaterialName`]}
                        emptyLabel={
                          kind === "elbow90" || kind === "elbow45"
                            ? "Standard elbow, from the catalog"
                            : "From the catalog"
                        }
                        onPick={m =>
                          setDraft({
                            ...draft,
                            [`${kind}MaterialId`]: m.id,
                            [`${kind}MaterialName`]: m.name,
                          })
                        }
                        onClear={() =>
                          setDraft({
                            ...draft,
                            [`${kind}MaterialId`]: null,
                            [`${kind}MaterialName`]: null,
                          })
                        }
                      />
                    ))}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChoosingFittings(true)}
                    className="mt-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  >
                    Choose fittings yourself
                  </button>
                )}
              </div>
            )}

            {/*
              EXTRA AND MAKEUP FOR THIS TYPE — behind one control, because most
              types follow the company, and open by itself when this one
              already differs (CLAUDE.md § "Hide OURS, never THEIRS"). Blank is
              "the company's"; a typed 0 is "none on this type".
            */}
            {showExtras ||
            draft.conduitExtraPct !== null ||
            draft.wireExtraPct !== null ||
            draft.makeupDeviceInches !== null ||
            draft.makeupPanelInches !== null ||
            (draft.makeupByKindInches !== null &&
              Object.keys(draft.makeupByKindInches).length > 0) ? (
              <div className="mt-2.5 space-y-1">
                <p className="text-xs font-medium">Extra and makeup</p>
                {pathType === "conduit" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Conduit extra, run and drops
                    </span>
                    <ExtraDraftField
                      value={toPct(draft.conduitExtraPct)}
                      onChange={v =>
                        setDraft({ ...draft, conduitExtraPct: fromPct(v) })
                      }
                      suffix="%"
                      max={100}
                      ariaLabel="Conduit extra percent for this type"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {pathType === "cable" ? "Cable extra" : "Wire extra"}, run
                    length and drops
                  </span>
                  <ExtraDraftField
                    value={toPct(draft.wireExtraPct)}
                    onChange={v =>
                      setDraft({ ...draft, wireExtraPct: fromPct(v) })
                    }
                    suffix="%"
                    max={100}
                    ariaLabel="Wire extra percent for this type"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Makeup at a box, per wire
                  </span>
                  <ExtraDraftField
                    value={draft.makeupDeviceInches}
                    onChange={v =>
                      setDraft({
                        ...draft,
                        makeupDeviceInches: v === null ? null : Math.round(v),
                      })
                    }
                    suffix="in"
                    max={240}
                    ariaLabel="Makeup at a box for this type, inches"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Makeup at a panel, per wire
                  </span>
                  <ExtraDraftField
                    value={draft.makeupPanelInches}
                    onChange={v =>
                      setDraft({
                        ...draft,
                        makeupPanelInches: v === null ? null : Math.round(v),
                      })
                    }
                    suffix="in"
                    max={240}
                    ariaLabel="Makeup at a panel for this type, inches"
                  />
                </div>
                {customHeightTypes.map(t => (
                  <div
                    key={t.typeKey}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      Makeup at {t.label}
                    </span>
                    <ExtraDraftField
                      value={draft.makeupByKindInches?.[t.typeKey] ?? null}
                      onChange={v => {
                        const next = { ...(draft.makeupByKindInches ?? {}) };
                        if (v === null) delete next[t.typeKey];
                        else next[t.typeKey] = Math.round(v);
                        setDraft({
                          ...draft,
                          makeupByKindInches:
                            Object.keys(next).length > 0 ? next : null,
                        });
                      }}
                      suffix="in"
                      max={240}
                      ariaLabel={`Makeup at ${t.label} for this type, inches`}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Blank follows the company. Extra is material only; makeup
                  carries labor.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowExtras(true)}
                className="mt-2.5 block text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
              >
                Extra and makeup differ for this type
              </button>
            )}

            <p
              className="text-xs text-muted-foreground mt-2.5"
              title={laborPerFootCoverage({ ...draft, pathType })}
            >
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
                      color: draft.color,
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
                      // Passed through from the draft on a cable, for the
                      // same reason as the ground: not shown is not cleared.
                      fittingStyle: draft.fittingStyle,
                      couplingMaterialId: draft.couplingMaterialId,
                      connectorMaterialId: draft.connectorMaterialId,
                      strapMaterialId: draft.strapMaterialId,
                      // From the draft, which opened on the stored row: a
                      // figure nobody touched goes back exactly as it was.
                      // Conduit extra is kept on a cable type too — not
                      // shown is not cleared (rule 7); nothing reads it there.
                      conduitExtraPct: draft.conduitExtraPct,
                      wireExtraPct: draft.wireExtraPct,
                      makeupDeviceInches: draft.makeupDeviceInches,
                      makeupPanelInches: draft.makeupPanelInches,
                      makeupByKindInches: draft.makeupByKindInches,
                      elbow90MaterialId: draft.elbow90MaterialId,
                      elbow45MaterialId: draft.elbow45MaterialId,
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
            <p className="text-xs text-muted-foreground mb-2">
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
                    <RunTypeSwatch
                      runTypeId={type.id}
                      pathType={pathType}
                      colors={runColors}
                      className="mt-px"
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
                        <span className="block text-xs text-muted-foreground">
                          No materials yet — cannot be priced
                        </span>
                      ) : (
                        <>
                          {runTypeSpec(type) && (
                            <span className="block text-xs text-muted-foreground truncate">
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
                          <span
                            className="block text-xs text-muted-foreground"
                            title={laborPerFootCoverage(type)}
                          >
                            {laborPerFootSentence(type)}
                          </span>
                        </>
                      )}
                    </span>
                    {type.runCount > 0 && (
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
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
                <p className="text-xs text-muted-foreground px-2 py-2">
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
                  <p className="px-2 pb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
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
                        <span className="block text-xs text-muted-foreground">
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
                  <span className="block text-xs text-muted-foreground mt-0.5 pl-[1.125rem]">
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
