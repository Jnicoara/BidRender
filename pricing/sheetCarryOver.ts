/**
 * CARRY OVER every typed value when a starter sheet is rebuilt — owner's
 * standing rule, 2026-10-08:
 *
 *   Any rebuild of starter-catalog-pricing.xlsx, labor-units-starter.xlsx or
 *   assembly-hours-starter.xlsx carries over every typed price and hours value
 *   by ITEM KEY (not row position or name). Renamed items keep values; new
 *   items come in blank; removed items go in a "dropped values" report. The
 *   rebuild must STOP and report if a typed value would be dropped for an
 *   item that still exists.
 *
 * pricing/buildStarterSheets.mts reads the file it is about to overwrite,
 * plans the carry-over here, refuses on any `stops`, writes the new file to
 * a temporary name, reads THAT back and runs `lostValues` against the plan —
 * and only then replaces the old file. The check reads the written file, not
 * the plan, because a plan is intent and the file is the outcome.
 *
 * ── What the item key is ────────────────────────────────────────────────────
 *   materials (prices, labor)  the catalog identity: the old row's name,
 *                              followed through RENAMED_BASELINE_MATERIALS
 *                              (one hop — the map never chains). The same
 *                              identity the seed uses to keep a row's id
 *                              through a rename.
 *   brand variants             the variant name (variants have no renames).
 *   starter assemblies         the Ref (DV34), which a starter keeps through a
 *                              rename of its name.
 * The row number is never used, so re-sorting a sheet moves nothing.
 *
 * Brand variants are carried too, though the owner's rule names three files:
 * a rebuild without --only rewrites all four, and losing typed brand prices
 * there is the same loss.
 */

export type SheetKind = "prices" | "labor" | "brands" | "assembly-hours";

/** The typed cells of one row, as the sheet holds them (blank = absent). */
export type TypedValues = Readonly<Record<string, string | number>>;

/** One row of the OLD sheet that has at least one typed value. */
export type TypedRow = {
  /** Sheet row number — for the report only, never for matching. */
  row: number;
  /** What the row was called on the old sheet: a name, or a Ref. */
  label: string;
  values: TypedValues;
  /** The row's "Unit of sale" / "Hours per", where the sheet has one. */
  unit?: string;
};

/** Where an old row's item is in the NEW catalog. */
export type Resolution =
  | { key: string; unit?: string; refuses?: string }
  | { gone: string }
  | { unknown: string };

export type CarryIssue = {
  sheet: SheetKind;
  row: number;
  label: string;
  values: TypedValues;
  why: string;
};

export type CarryPlan = {
  sheet: SheetKind;
  /** New item key -> the typed values to write on its row. */
  carried: Map<string, TypedValues>;
  /** Carried onto a row whose name changed. */
  renamed: { from: string; to: string }[];
  /** The item no longer ships: the value goes in the dropped-values report. */
  dropped: CarryIssue[];
  /** A value the rebuild would lose for an item that still exists: STOP. */
  stops: CarryIssue[];
};

/**
 * Plan the carry-over for one sheet. `resolve` says where an old row's item
 * is now; everything else — duplicates, a changed unit, a row that refuses
 * input — is decided here, so the rule has one place to be tested.
 */
export function planCarryOver(
  sheet: SheetKind,
  previous: readonly TypedRow[],
  resolve: (label: string) => Resolution
): CarryPlan {
  const plan: CarryPlan = {
    sheet,
    carried: new Map(),
    renamed: [],
    dropped: [],
    stops: [],
  };
  const from = new Map<string, TypedRow>();
  for (const r of previous) {
    if (Object.keys(r.values).length === 0) continue;
    const issue = (why: string): CarryIssue => ({
      sheet,
      row: r.row,
      label: r.label,
      values: r.values,
      why,
    });
    const at = resolve(r.label);
    if ("gone" in at) {
      plan.dropped.push(issue(at.gone));
      continue;
    }
    if ("unknown" in at) {
      // Cannot tell whether the item still exists, so it cannot be called
      // dropped: a stale name with no rename entry looks exactly like this.
      plan.stops.push(issue(at.unknown));
      continue;
    }
    if (r.unit !== undefined && at.unit !== undefined && r.unit !== at.unit) {
      plan.stops.push(
        issue(
          `was typed per "${r.unit}", the rebuilt row is per "${at.unit}" — the number would mean something else`
        )
      );
      continue;
    }
    if (at.refuses) {
      plan.stops.push(issue(at.refuses));
      continue;
    }
    const earlier = from.get(at.key);
    if (earlier) {
      if (!sameValues(earlier.values, r.values))
        plan.stops.push(
          issue(
            `"${earlier.label}" (row ${earlier.row}) and this row both land on "${at.key}" with different values`
          )
        );
      continue;
    }
    from.set(at.key, r);
    plan.carried.set(at.key, r.values);
    if (at.key !== r.label) plan.renamed.push({ from: r.label, to: at.key });
  }
  return plan;
}

/**
 * Every planned value the rebuilt sheet does not hold, one line each. Empty
 * means nothing typed was lost. `rebuilt` is what was READ BACK from the
 * written file, keyed the same way.
 */
export function lostValues(
  plan: CarryPlan,
  rebuilt: ReadonlyMap<string, TypedValues>
): string[] {
  const lost: string[] = [];
  for (const [key, values] of Array.from(plan.carried)) {
    const got = rebuilt.get(key) ?? {};
    for (const [field, v] of Object.entries(values))
      if (!sameValue(got[field], v))
        lost.push(
          `${plan.sheet}: ${key} — ${field} was ${JSON.stringify(v)}, the rebuilt sheet has ${got[field] === undefined ? "nothing" : JSON.stringify(got[field])}`
        );
  }
  return lost;
}

/** Materials: the old name, then the rename map, then the retired list. */
export function materialResolver(opts: {
  current: ReadonlyMap<string, { unit: string; refuses?: string }>;
  renamed: Readonly<Record<string, string>>;
  retired: readonly string[];
}): (label: string) => Resolution {
  const retired = new Set(opts.retired);
  return label => {
    const to = opts.current.has(label) ? label : opts.renamed[label];
    const now = to === undefined ? undefined : opts.current.get(to);
    if (to !== undefined && now) return { key: to, ...now };
    if (retired.has(label) || (to !== undefined && retired.has(to)))
      return { gone: "retired from the catalog" };
    if (to !== undefined)
      return { unknown: `renamed to "${to}", which the catalog does not ship` };
    return {
      unknown:
        "not in the catalog, and not listed as renamed or retired — rename it in RENAMED_BASELINE_MATERIALS or retire it before rebuilding",
    };
  };
}

/** Starter assemblies: by Ref; a starter now under another Ref stops. */
export function assemblyResolver(opts: {
  current: readonly { ref: string; name: string; refuses?: string }[];
  /** The old sheet's Ref -> its "Assembly" column. */
  oldNames: ReadonlyMap<string, string>;
}): (label: string) => Resolution {
  const byRef = new Map(opts.current.map(a => [a.ref, a]));
  const byName = new Map(opts.current.map(a => [a.name, a]));
  return ref => {
    const now = byRef.get(ref);
    if (now) return { key: ref, refuses: now.refuses };
    const name = opts.oldNames.get(ref);
    const moved = name === undefined ? undefined : byName.get(name);
    if (moved)
      return {
        unknown: `Ref ${ref} is gone but "${name}" ships as ${moved.ref} — decide which it is before rebuilding`,
      };
    return { gone: "no longer a shipped starter" };
  };
}

/** Brand variants: by name; one not on the new list is dropped. */
export function brandResolver(
  current: ReadonlyMap<string, { unit: string }>
): (label: string) => Resolution {
  return name => {
    const now = current.get(name);
    return now
      ? { key: name, unit: now.unit }
      : { gone: "no longer a brand variant on the sheet" };
  };
}

/** The dropped-values report, as text. Empty string when nothing dropped. */
export function droppedReport(plans: readonly CarryPlan[]): string {
  const lines: string[] = [];
  for (const p of plans)
    for (const d of p.dropped)
      lines.push(
        `${p.sheet}\trow ${d.row}\t${d.label}\t${Object.entries(d.values)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ")}\t${d.why}`
      );
  return lines.length
    ? `sheet\told row\titem\ttyped values\twhy\n${lines.join("\n")}\n`
    : "";
}

/** Which columns of a sheet are the key, the unit, and the typed values. */
export type SheetSpec = {
  sheet: SheetKind;
  key: string;
  unit?: string;
  /** Typed only if one of these holds a value… */
  typed: readonly string[];
  /** …and then these ride along with it (a pack price means per that pack). */
  with?: readonly string[];
};

export const SHEET_SPECS: Readonly<Record<SheetKind, SheetSpec>> = {
  prices: {
    sheet: "prices",
    key: "Name",
    unit: "Unit of sale",
    typed: ["Pack price"],
    with: ["Pack size", "Pack qty"],
  },
  brands: {
    sheet: "brands",
    key: "Name",
    unit: "Unit of sale",
    typed: ["Pack price"],
    with: ["Pack size", "Pack qty"],
  },
  labor: {
    sheet: "labor",
    key: "Name",
    unit: "Hours per",
    typed: ["MY HOURS", "Bend hours (raceway only)"],
  },
  "assembly-hours": {
    sheet: "assembly-hours",
    key: "Ref",
    typed: ["MY HOURS"],
  },
};

/** The little of an exceljs worksheet this reads. */
export type SheetLike = {
  rowCount: number;
  getRow(i: number): {
    values: unknown;
    getCell(i: number): { value: unknown };
  };
};

/** A cell as a typed value: blank -> undefined, a formula -> its result. */
export function cellValue(v: unknown): string | number | undefined {
  let p = v;
  if (p && typeof p === "object" && "result" in (p as object))
    p = (p as { result: unknown }).result;
  if (p && typeof p === "object" && "richText" in (p as object))
    p = (p as { richText: { text: string }[] }).richText
      .map(t => t.text)
      .join("");
  if (p === null || p === undefined) return undefined;
  if (typeof p === "number") return p;
  const s = String(p).trim();
  return s === "" ? undefined : s;
}

/**
 * Every row with a typed value, read by COLUMN NAME from the header row —
 * a column that moved is still found, and one that is missing is an error
 * rather than a silent "nothing typed".
 */
export function readTypedRows(
  ws: SheetLike,
  spec: SheetSpec,
  headerRow: number,
  firstDataRow: number
): { rows: TypedRow[]; extra: Map<string, Record<string, string>> } {
  const header = (ws.getRow(headerRow).values as unknown[]).map(v =>
    String(cellValue(v) ?? "")
  );
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 1) throw new Error(`${spec.sheet}: no "${name}" column`);
    return i;
  };
  const cKey = col(spec.key);
  const cUnit = spec.unit ? col(spec.unit) : 0;
  const typed = spec.typed.map(n => [n, col(n)] as const);
  const along = (spec.with ?? []).map(n => [n, col(n)] as const);
  // The Assembly column, so a Ref that moved can be told from one removed.
  const cName = header.indexOf("Assembly");
  const rows: TypedRow[] = [];
  const extra = new Map<string, Record<string, string>>();
  for (let r = firstDataRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellValue(row.getCell(cKey).value);
    if (label === undefined) continue;
    const values: Record<string, string | number> = {};
    for (const [n, c] of typed) {
      const v = cellValue(row.getCell(c).value);
      if (v !== undefined) values[n] = v;
    }
    if (Object.keys(values).length)
      for (const [n, c] of along) {
        const v = cellValue(row.getCell(c).value);
        if (v !== undefined) values[n] = v;
      }
    if (cName >= 1) {
      const name = cellValue(row.getCell(cName).value);
      if (name !== undefined)
        extra.set(String(label), { Assembly: String(name) });
    }
    const unit = cUnit ? cellValue(row.getCell(cUnit).value) : undefined;
    rows.push({
      row: r,
      label: String(label),
      values,
      ...(unit !== undefined ? { unit: String(unit) } : {}),
    });
  }
  return { rows, extra };
}

/** Typed rows keyed by their label — what a rebuilt sheet is checked as. */
export const keyed = (rows: readonly TypedRow[]) =>
  new Map(rows.map(r => [r.label, r.values]));

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb)
    ? na === nb
    : String(a).trim() === String(b).trim();
}

function sameValues(a: TypedValues, b: TypedValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return Array.from(keys).every(k => sameValue(a[k], b[k]));
}
