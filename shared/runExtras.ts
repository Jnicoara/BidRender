/**
 * EXTRA AND MAKEUP — which number applies to a run, and where it came from.
 *
 * references/track-b-held-migrations-plan.md § 1, and plan-viewer-overhaul.md
 * § 2.2 / § 5j / § 7.1 for the three quantities themselves:
 *
 *   conduit extra   a percentage of traced AND vertical (owner, 2026-10-05;
 *                   § 7.1 had it on the traced length only)
 *   wire extra      a percentage of traced AND vertical
 *   makeup          feet per conductor per END — never a percentage, wire only
 *
 * This file only RESOLVES. It turns the stored settings into the numbers one
 * run uses; the arithmetic that applies them is `quantitiesForRun`.
 *
 * ── Five values, three levels, one chain ─────────────────────────────────────
 * Owner, 2026-09-28: every value is adjustable for the company, per run type
 * and per run. NULL at any level means "follow the level above" and nothing is
 * ever copied down (§ 2.5), so changing a company figure re-prices every run
 * still following it.
 *
 *   run → run type → company → starter (only once accepted) → unset
 *
 * ── Starters apply NOTHING until the company accepts them (Q1) ───────────────
 * CLAUDE.md § Starter content, as amended 2026-09-25: a shipped number is
 * shown, dated, and inert until somebody clicks Accept. So an unaccepted
 * company resolves to `unset`, the effect is 0, and the screen says "no extra
 * set" — the whisper § 2.3 warns about, made to shout instead. It is also why
 * deploying this code moved no live bid.
 *
 * ── Makeup at an end: a named height type, then device or panel (Q10) ────────
 * Each end has a KIND (receptacle, panel, a company's own "Switchboard"). Its
 * CLASS is panel if the kind is `panel` or the company marked it a panel end,
 * and device otherwise. At each level, in order run → type → company, a figure
 * for that named kind wins over the plain device/panel figure — and a NEARER
 * level always wins over a further one. So a run type's panel makeup beats the
 * company's Switchboard makeup (owner, 2026-09-29, Q10): the type was set
 * deliberately for its wire size.
 *
 * ── Which ends get makeup ────────────────────────────────────────────────────
 * The same ends the fittings count a connector at: every end of a route leg,
 * and on a QUANTITY leg only an end with an approved drop (D21). One rule for
 * where wire terminates, so makeup and connectors cannot disagree.
 */
import { DISTRIBUTION_KIND } from "./takeoffHeights";
import { isApprovedDrop, type TraceMode } from "./traceMode";

/**
 * The starting values — shipped, labelled, dated, and INERT until accepted.
 *
 * Makeup CHANGED by the owner on 2026-09-28 (Q2): 18 in per conductor at a
 * device box, 5 ft at a panel. § 2.3's "2 ft … more at panels" is superseded.
 * Common conventions, not measured from anyone's jobs, and the screen says so.
 */
export const STARTER_EXTRAS = {
  conduitExtraPct: 0.05,
  wireExtraPct: 0.1,
  makeupDeviceInches: 18,
  makeupPanelInches: 60,
  /** Shown beside the starters so a convention reads as one. */
  date: "2026-09-28",
} as const;

/** One level's settings. Every field NULL means "follow the level above". */
export type ExtraSettings = {
  conduitExtraPct: number | null;
  wireExtraPct: number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  /** A height type's key → its own makeup at this level. NULL is none. */
  makeupByKindInches: Readonly<Record<string, number>> | null;
};

/** The company's settings, and whether it has accepted the starters. */
export type CompanyExtras = {
  conduitExtraPct: number | null;
  wireExtraPct: number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  accepted: boolean;
};

/** A company's own answer for one height type (0092). */
export type KindMakeup = {
  /** Panel or device end. NULL follows the shipped answer (only `panel` is). */
  makeupAt: "device" | "panel" | null;
  /** This type's own makeup at company level. NULL follows the class. */
  makeupInches: number | null;
};

/** Everything needed to resolve extras for any run on one bid. */
export type ExtrasContext = {
  company: CompanyExtras | null;
  kinds: ReadonlyMap<string, KindMakeup>;
  /**
   * A run type's own settings, for the id the RUNS store — the caller follows
   * a fork (`resolveRunType`) so this never answers with a superseded row.
   */
  typeFor: (runTypeId: number | null) => ExtraSettings | null;
};

/** No settings anywhere: every value resolves unset, and counts nothing. */
export const NO_EXTRAS_CONTEXT: ExtrasContext = {
  company: null,
  kinds: new Map(),
  typeFor: () => null,
};

export type ExtraSource = "run" | "type" | "company" | "starter" | "unset";

export type ResolvedExtra = {
  /** Null when nobody has set it — the effect is 0 and a screen says so. */
  value: number | null;
  source: ExtraSource;
};

/** A decimal column as drizzle returns it, or a number, or null. */
export function extraNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const usable = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** A percentage through run → type → company → accepted starter. */
export function resolveExtraPct(
  which: "conduitExtraPct" | "wireExtraPct",
  run: ExtraSettings | null,
  type: ExtraSettings | null,
  ctx: ExtrasContext
): ResolvedExtra {
  if (usable(run?.[which])) return { value: run[which], source: "run" };
  if (usable(type?.[which])) return { value: type[which], source: "type" };
  if (usable(ctx.company?.[which]))
    return { value: ctx.company[which], source: "company" };
  if (ctx.company?.accepted)
    return { value: STARTER_EXTRAS[which], source: "starter" };
  return { value: null, source: "unset" };
}

export type MakeupClass = "device" | "panel";

/**
 * Device or panel, for makeup. Only the shipped `panel` type is a panel end
 * unless the company marked one of its own as a panel (Q4, 0092).
 */
export function makeupClassOf(
  kind: string | null,
  ctx: ExtrasContext
): MakeupClass {
  if (kind === null) return "device";
  const own = ctx.kinds.get(kind)?.makeupAt;
  if (own) return own;
  return kind === "panel" ? "panel" : "device";
}

/** Makeup at one end of kind `kind`, by the chain in the header. */
export function resolveMakeup(
  kind: string | null,
  run: ExtraSettings | null,
  type: ExtraSettings | null,
  ctx: ExtrasContext
): ResolvedExtra & { makeupClass: MakeupClass } {
  const makeupClass = makeupClassOf(kind, ctx);
  const classKey =
    makeupClass === "panel" ? "makeupPanelInches" : "makeupDeviceInches";
  const named = (level: ExtraSettings | null) =>
    kind === null ? null : (level?.makeupByKindInches?.[kind] ?? null);

  const answer = (value: number, source: ExtraSource) => ({
    value,
    source,
    makeupClass,
  });
  // Nearer level first; within a level, the named type before the class.
  const runNamed = named(run);
  if (usable(runNamed)) return answer(runNamed, "run");
  if (usable(run?.[classKey])) return answer(run[classKey], "run");
  const typeNamed = named(type);
  if (usable(typeNamed)) return answer(typeNamed, "type");
  if (usable(type?.[classKey])) return answer(type[classKey], "type");
  const companyNamed =
    kind === null ? null : (ctx.kinds.get(kind)?.makeupInches ?? null);
  if (usable(companyNamed)) return answer(companyNamed, "company");
  if (usable(ctx.company?.[classKey]))
    return answer(ctx.company[classKey], "company");
  if (ctx.company?.accepted) return answer(STARTER_EXTRAS[classKey], "starter");
  return { value: null, source: "unset", makeupClass };
}

/**
 * What one run row applies — the numbers `quantitiesForRun` reads.
 *
 * Every figure is a plain number, with 0 where nothing applies, and `unset`
 * says which were 0 because NOBODY SET THEM — so a screen can say "no extra
 * set" instead of letting a zero pass as an answer (§ 5j).
 */
export type RunExtras = {
  conduitPct: number;
  wirePct: number;
  /** Makeup per conductor at each end, inches. 0 at an end that takes none. */
  makeupStartInches: number;
  makeupEndInches: number;
  unset: { conduit: boolean; wire: boolean; makeup: boolean };
};

/** A run row, as far as its extras are concerned. */
export type ExtrasRow = {
  runTypeId: number | null;
  traceMode: TraceMode | null;
  startKind: string | null;
  endKind: string | null;
  startTeeId: number | null;
  endTeeId: number | null;
  conduitExtraPct: string | number | null;
  wireExtraPct: string | number | null;
  makeupDeviceInches: number | null;
  makeupPanelInches: number | null;
  makeupByKindInches: Record<string, number> | null;
};

/** A run row's own settings, as one level of the chain. */
export function runExtraSettings(row: ExtrasRow): ExtraSettings {
  return {
    conduitExtraPct: extraNumber(row.conduitExtraPct),
    wireExtraPct: extraNumber(row.wireExtraPct),
    makeupDeviceInches: row.makeupDeviceInches,
    makeupPanelInches: row.makeupPanelInches,
    makeupByKindInches: row.makeupByKindInches,
  };
}

/**
 * The extras one run row applies. Takes the ROW, so none of its eleven fields
 * can be left behind by a caller (CLAUDE.md § "structural in the maths").
 */
export function extrasForRun(row: ExtrasRow, ctx: ExtrasContext): RunExtras {
  const run = runExtraSettings(row);
  const type = ctx.typeFor(row.runTypeId);
  const conduit = resolveExtraPct("conduitExtraPct", run, type, ctx);
  const wire = resolveExtraPct("wireExtraPct", run, type, ctx);

  const quantity = row.traceMode === "quantity";
  const endMakeup = (kind: string | null, teeId: number | null) => {
    // A quantity leg's end is a termination only where a drop was approved —
    // the same `open:` rule the connector count follows (D21).
    if (quantity && !isApprovedDrop(kind)) return null;
    // A tee end is a box where legs meet: a device-class end with no kind.
    const at = teeId !== null ? null : kind === DISTRIBUTION_KIND ? null : kind;
    return resolveMakeup(at, run, type, ctx);
  };
  const start = endMakeup(row.startKind, row.startTeeId);
  const end = endMakeup(row.endKind, row.endTeeId);

  return {
    conduitPct: conduit.value ?? 0,
    wirePct: wire.value ?? 0,
    makeupStartInches: start?.value ?? 0,
    makeupEndInches: end?.value ?? 0,
    unset: {
      conduit: conduit.source === "unset",
      wire: wire.source === "unset",
      // Unset only where an end COUNTS makeup and nobody gave it a figure; an
      // open quantity end takes none, which is an answer rather than a gap.
      makeup:
        (start !== null && start.source === "unset") ||
        (end !== null && end.source === "unset"),
    },
  };
}
