/**
 * THE LABOR-UNIT SHEET IMPORT — what a pasted sheet would change, decided
 * here, in one pure function, so the preview and the Apply cannot disagree
 * (the server applies exactly the plan this returns).
 *
 * The sheet is `pricing/labor-units-starter.xlsx` (pricing/buildLaborSheet.mts).
 * Its two tabs are pasted, not uploaded: the app carries no spreadsheet
 * library (pricing/writeWorkbook.cjs says why), and Excel copies a range as
 * tab-separated text, which is what this reads.
 *
 * ── What it may write: hours, and nothing else ──────────────────────────────
 *   materials.laborHours            hours per unit of sale (per FOOT for
 *                                   pipe and wire — the sheet's "per 100 ft"
 *                                   is divided by 100 here)
 *   materials.fieldBendLaborHours   hours for one field bend of a raceway
 *   assemblies.baseLaborHours       the assembly's typed hours
 * Never a price, a name, a unit or a new row. A row this cannot place goes
 * on the `unmatched` list with the reason, and is never written anywhere.
 *
 * ── Blank is UNSET, never 0 ─────────────────────────────────────────────────
 * An empty MY HOURS cell skips the row: the material keeps whatever it has,
 * NULL included. Only a typed number writes, and a typed 0 is an answer
 * ("adds no time of its own"), the convention `materials.laborHours` keeps
 * (shared/materialLabor.ts). SUGGESTED is never read — a suggestion becomes
 * an hour only when somebody types or pastes it into MY HOURS.
 *
 * ── Keyed by ID, checked by NAME ────────────────────────────────────────────
 * The sheet is keyed by material ID (owner, 2026-10-06: a materials rename
 * is coming, and a name key would break on it). But an ID is assigned by the
 * database, so the same ID can be a different material in another database.
 * A sheet built from one database and pasted into another would then write
 * hours onto whatever rows happen to hold those IDs — wrong numbers, with
 * nothing to say so. So every row's NAME must agree with the row its ID
 * finds, or be a recorded rename of it (`RENAMED_BASELINE_MATERIALS`); a
 * disagreement is unmatched, not written.
 */

import { MAX_LABOR_UNIT_HOURS } from "./materialLabor";

/** The same limit a hand edit has — one number, not two (shared/materialLabor.ts). */
export const MAX_IMPORT_LABOR_HOURS = MAX_LABOR_UNIT_HOURS;
/** The assembly editor's own limit (assembliesRouter hoursSchema). */
export const MAX_IMPORT_ASSEMBLY_HOURS = 10000;

/** The sheet's units, exactly as the generator writes them. */
export const LABOR_SHEET_UNITS = {
  per100ft: "per 100 ft",
  each: "each",
  perBox: "per box",
  perBend: "per field bend",
} as const;

export type LaborSheetRow = {
  /** 1-based line in what was pasted, for the messages. */
  line: number;
  id: number | null;
  name: string;
  unit: string;
  /** MY HOURS: null when blank. NaN when present and not a number. */
  hours: number | null;
};

export type AssemblySheetRow = {
  line: number;
  id: number | null;
  name: string;
  hours: number | null;
};

export type ParsedLaborSheet =
  | { kind: "materials"; rows: LaborSheetRow[] }
  | { kind: "assemblies"; rows: AssemblySheetRow[] }
  | { kind: "unreadable"; reason: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** One line into cells: tab first (Excel's copy), else comma with quotes. */
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map(c => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** A cell as hours: blank is null; anything else must be a plain number. */
function hoursCell(text: string | undefined): number | null {
  const t = (text ?? "").trim();
  if (t === "") return null;
  if (!/^\d*\.?\d+$/.test(t)) return Number.NaN;
  return Number(t);
}

function idCell(text: string | undefined): number | null {
  const t = (text ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/**
 * Read a pasted tab of the sheet. The header row says which tab it is:
 * "Assembly ID" is tab 2, "ID" is tab 1. Both need a "MY HOURS" column.
 */
export function parseLaborSheet(raw: string): ParsedLaborSheet {
  const lines = raw.split(/\r?\n/);
  const headerAt = lines.findIndex(l => /my hours/i.test(l));
  if (headerAt < 0)
    return {
      kind: "unreadable",
      reason:
        'No "MY HOURS" header found. Copy the tab from its header row down, then paste.',
    };
  const header = cells(lines[headerAt]).map(norm);
  const col = (name: string) => header.indexOf(name);
  const hoursAt = col("my hours");
  const assemblyIdAt = col("assembly id");
  if (assemblyIdAt >= 0) {
    const nameAt = col("assembly");
    const rows: AssemblySheetRow[] = [];
    lines.slice(headerAt + 1).forEach((l, i) => {
      if (!l.trim()) return;
      const c = cells(l);
      rows.push({
        line: headerAt + 2 + i,
        id: idCell(c[assemblyIdAt]),
        name: c[nameAt] ?? "",
        hours: hoursCell(c[hoursAt]),
      });
    });
    return { kind: "assemblies", rows };
  }
  const idAt = col("id");
  const nameAt = col("name");
  const unitAt = col("unit");
  if (idAt < 0 || nameAt < 0 || unitAt < 0)
    return {
      kind: "unreadable",
      reason:
        'The header needs "ID", "Name", "Unit" and "MY HOURS" — copy the tab as the sheet has it.',
    };
  const rows: LaborSheetRow[] = [];
  lines.slice(headerAt + 1).forEach((l, i) => {
    if (!l.trim()) return;
    const c = cells(l);
    rows.push({
      line: headerAt + 2 + i,
      id: idCell(c[idAt]),
      name: c[nameAt] ?? "",
      unit: c[unitAt] ?? "",
      hours: hoursCell(c[hoursAt]),
    });
  });
  return { kind: "materials", rows };
}

// ─── The plan ────────────────────────────────────────────────────────────────

export type LaborField = "laborHours" | "fieldBendLaborHours";

/** A material as the plan needs it, already resolved for this company. */
export type ImportMaterial = {
  /** The row an edit lands on — the company's own copy if it has one. */
  id: number;
  name: string;
  unitOfSale: "each" | "foot" | "box";
  laborHours: number | null;
  fieldBendLaborHours: number | null;
  /** Has a raceway spec, so a field bend means something. */
  isRaceway: boolean;
};

export type LaborChange = {
  line: number;
  materialId: number;
  name: string;
  field: LaborField;
  from: number | null;
  to: number;
  /** The sheet's own number and unit, for the preview's words. */
  typed: string;
};

export type Unmatched = { line: number; name: string; reason: string };

export type LaborPlan = {
  changes: LaborChange[];
  unchanged: number;
  /** Rows with MY HOURS blank: left exactly as they are. */
  blank: number;
  unmatched: Unmatched[];
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function planLaborImport(
  rows: readonly LaborSheetRow[],
  find: (id: number) => ImportMaterial | null,
  /** The current name a shipped OLD name was renamed to, if it was. */
  renamedTo: (oldName: string) => string | null
): LaborPlan {
  const plan: LaborPlan = {
    changes: [],
    unchanged: 0,
    blank: 0,
    unmatched: [],
  };
  const miss = (row: LaborSheetRow, reason: string) =>
    plan.unmatched.push({ line: row.line, name: row.name, reason });
  for (const row of rows) {
    if (row.hours === null) {
      plan.blank += 1;
      continue;
    }
    if (!Number.isFinite(row.hours) || row.hours < 0) {
      miss(row, "MY HOURS is not a number");
      continue;
    }
    if (row.id === null) {
      miss(row, "no ID — a row the catalog does not have");
      continue;
    }
    const m = find(row.id);
    if (!m) {
      miss(row, `no material with ID ${row.id} in this database`);
      continue;
    }
    const renamed = renamedTo(row.name);
    if (
      norm(m.name) !== norm(row.name) &&
      !(renamed !== null && norm(renamed) === norm(m.name))
    ) {
      miss(
        row,
        `ID ${row.id} is "${m.name}" here, not "${row.name}" — was the sheet made from another database?`
      );
      continue;
    }
    const unit = norm(row.unit);
    let field: LaborField = "laborHours";
    let to: number;
    if (unit === LABOR_SHEET_UNITS.perBend) {
      if (!m.isRaceway) {
        miss(row, "a field bend, but this material is not a raceway");
        continue;
      }
      field = "fieldBendLaborHours";
      to = row.hours;
    } else if (unit === LABOR_SHEET_UNITS.per100ft) {
      if (m.unitOfSale !== "foot") {
        miss(
          row,
          `per 100 ft, but this material is sold by the ${m.unitOfSale}`
        );
        continue;
      }
      to = row.hours / 100;
    } else if (
      unit === LABOR_SHEET_UNITS.each ||
      unit === LABOR_SHEET_UNITS.perBox
    ) {
      const want = unit === LABOR_SHEET_UNITS.each ? "each" : "box";
      if (m.unitOfSale !== want) {
        miss(
          row,
          `${row.unit}, but this material is sold by the ${m.unitOfSale}`
        );
        continue;
      }
      to = row.hours;
    } else {
      miss(row, `unit "${row.unit}" is not one the sheet uses`);
      continue;
    }
    to = round4(to);
    if (to > MAX_IMPORT_LABOR_HOURS) {
      miss(row, `over the ${MAX_IMPORT_LABOR_HOURS} h limit for one unit`);
      continue;
    }
    const from = field === "laborHours" ? m.laborHours : m.fieldBendLaborHours;
    if (from !== null && round4(from) === to) {
      plan.unchanged += 1;
      continue;
    }
    plan.changes.push({
      line: row.line,
      materialId: m.id,
      name: m.name,
      field,
      from,
      to,
      typed: `${row.hours} h ${row.unit}`,
    });
  }
  return plan;
}

export type ImportAssembly = {
  id: number;
  name: string;
  baseLaborHours: number;
};

export type AssemblyChange = {
  line: number;
  assemblyId: number;
  name: string;
  from: number;
  to: number;
};

export type AssemblyPlan = {
  changes: AssemblyChange[];
  unchanged: number;
  blank: number;
  unmatched: Unmatched[];
};

export function planAssemblyHoursImport(
  rows: readonly AssemblySheetRow[],
  find: (id: number) => ImportAssembly | null
): AssemblyPlan {
  const plan: AssemblyPlan = {
    changes: [],
    unchanged: 0,
    blank: 0,
    unmatched: [],
  };
  for (const row of rows) {
    const miss = (reason: string) =>
      plan.unmatched.push({ line: row.line, name: row.name, reason });
    if (row.hours === null) {
      plan.blank += 1;
      continue;
    }
    if (!Number.isFinite(row.hours) || row.hours < 0) {
      miss("MY HOURS is not a number");
      continue;
    }
    if (row.id === null) {
      miss("no assembly ID");
      continue;
    }
    const a = find(row.id);
    if (!a) {
      miss(`no assembly with ID ${row.id} in this database`);
      continue;
    }
    if (norm(a.name) !== norm(row.name)) {
      miss(
        `ID ${row.id} is "${a.name}" here, not "${row.name}" — was the sheet made from another database?`
      );
      continue;
    }
    const to = round4(row.hours);
    if (to > MAX_IMPORT_ASSEMBLY_HOURS) {
      miss(`over the ${MAX_IMPORT_ASSEMBLY_HOURS} h limit`);
      continue;
    }
    if (round4(a.baseLaborHours) === to) {
      plan.unchanged += 1;
      continue;
    }
    plan.changes.push({
      line: row.line,
      assemblyId: a.id,
      name: a.name,
      from: a.baseLaborHours,
      to,
    });
  }
  return plan;
}
