/**
 * PANEL AND FIXTURE SCHEDULES, read from a sheet's own text — by code, no AI.
 *
 * Read-only: what the drawing's schedule tables say, shown on the sheet so
 * an estimator stops re-typing them. Nothing here writes anywhere; where the
 * rows would be kept is a Track A table (todo.md, "bid_panels").
 *
 * ── The layouts it knows, measured 2026-10-06 (track-c) ─────────────────────
 * PANEL: a header row with two `CKT.` columns side by side (odd | even), a
 *   `BRKR` and `WIRE` column outside each, the description beyond those and
 *   the load (KVA) in phase columns A/B/C at the outer edge. Under the rows,
 *   a summary block — SUPPLY:, MAINS:, FED FROM …, TOTAL CONNECTED LOAD — and
 *   the panel's name as "PANEL 2B" (or "EXISTING PANEL 2B"). Several tables
 *   may share one header row.
 *     UNCC E003: 3 of 3 panels — 2A, 2B, 2HA — 42 of 42 circuits each.
 *     Weld 1 E-003: a different layout; nothing found, and the view says so.
 * FIXTURE: a header row with TYPE, then DESCRIPTION, then WATTS further right;
 *   each fixture starts with its mark in the TYPE column and its description
 *   wraps onto the rows below until the next mark.
 *     UNCC E004: A1, A2, A3, C1, EXC, UC — 6 of 6.
 *
 * Schedule layouts vary by engineer, so this is a reader per layout family
 * rather than one reader: a sheet whose table does not have these columns
 * reads as "no schedule found", never as a wrong one. A scan has no text
 * layer to read; that is said too, by the caller.
 */

/** A word on the page: its text and centre, page points, y down. */
export type ScheduleWord = {
  text: string;
  cx: number;
  cy: number;
  height: number;
};

export type PanelCircuit = {
  number: number;
  /** As printed — "20/1", "FEED", or null where the cell is empty. */
  breaker: string | null;
  amps: number | null;
  poles: number | null;
  /** Wire size as printed ("12", "EX"), null where empty. */
  wire: string | null;
  /** Empty where the row has none (a space). */
  description: string;
  /** The circuit's load in kVA, from whichever phase column holds it. */
  loadKva: number | null;
};

export type PanelSchedule = {
  /** "2B" — null when the name is not in the text near the table. */
  name: string | null;
  /** Its title says EXISTING PANEL. */
  existing: boolean;
  /** "208/120V, 3-PH, 4W" as printed. */
  supply: string | null;
  /** "400 AMP MAIN CIRCUIT BREAKER" as printed. */
  mains: string | null;
  mainsAmps: number | null;
  /** "PANEL 2HA via 112.5 KVA TRANSFORMER AND 400 A FEEDER" as printed. */
  fedFrom: string | null;
  connectedKva: number | null;
  demandKva: number | null;
  circuits: PanelCircuit[];
  /** Where the table's header sits, page points — to show it on the sheet. */
  at: { x: number; y: number };
};

export type FixtureType = {
  mark: string;
  description: string;
  /** The total-watts cell as printed ("26.3", "2W/FT"). */
  watts: string | null;
};

export type FixtureSchedule = {
  title: string | null;
  fixtures: FixtureType[];
  at: { x: number; y: number };
};

export type SheetSchedules = {
  panels: PanelSchedule[];
  fixtures: FixtureSchedule[];
};

type Row = { y: number; items: ScheduleWord[] };

/** Words on one baseline (within 2 pt), left to right, rows top to bottom. */
function rowsOf(words: readonly ScheduleWord[]): Row[] {
  const rows: Row[] = [];
  for (const w of [...words].sort((a, b) => a.cy - b.cy)) {
    const r = rows.find(r => Math.abs(r.y - w.cy) <= 2);
    if (r) r.items.push(w);
    else rows.push({ y: w.cy, items: [w] });
  }
  rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
  return rows;
}

const NUMBER = /^\d+(\.\d+)?$/;
/** A cell drawn empty: the schedules print "." or "-" in it. */
const blank = (text: string | undefined) =>
  text === undefined || /^[.\-–]$/.test(text);

/** Every schedule this page's text holds, in the layouts above. */
export function readSchedules(words: readonly ScheduleWord[]): SheetSchedules {
  const rows = rowsOf(words);
  return { panels: readPanels(rows), fixtures: readFixtures(rows) };
}

function readPanels(rows: readonly Row[]): PanelSchedule[] {
  const out: PanelSchedule[] = [];
  for (const h of rows) {
    const ckts = h.items.filter(i => /^CKT\.?$/i.test(i.text));
    const pairs: [ScheduleWord, ScheduleWord][] = [];
    for (let k = 0; k + 1 < ckts.length; k++)
      if (ckts[k + 1].cx - ckts[k].cx <= 80) {
        pairs.push([ckts[k], ckts[k + 1]]);
        k++;
      }
    const centres = pairs.map(([a, b]) => (a.cx + b.cx) / 2);
    pairs.forEach(([odd, even], p) => {
      const c = centres[p];
      // A table's own columns: up to halfway to its neighbour on the row.
      const left = p > 0 ? (centres[p - 1] + c) / 2 : c - 460;
      const right = p + 1 < pairs.length ? (c + centres[p + 1]) / 2 : c + 460;
      const inTable = (w: ScheduleWord) => w.cx > left && w.cx < right;
      const head = (re: RegExp, side: "L" | "R") => {
        const hits = h.items.filter(
          i =>
            re.test(i.text) &&
            inTable(i) &&
            (side === "L" ? i.cx < odd.cx : i.cx > even.cx)
        );
        // Nearest the CKT. column on that side.
        return side === "L" ? hits[hits.length - 1] : hits[0];
      };
      const brkrL = head(/^BRKR$/i, "L");
      const brkrR = head(/^BRKR$/i, "R");
      const wireL = head(/^WIRE$/i, "L");
      const wireR = head(/^WIRE$/i, "R");
      // The phase columns (A B C) under each LOAD (KVA) heading.
      const phase = rows
        .filter(r => r.y > h.y && r.y <= h.y + 25)
        .flatMap(r => r.items)
        .filter(i => /^[ABC]$/.test(i.text) && inTable(i));
      const phaseL = phase.filter(i => i.cx < odd.cx - 250).map(i => i.cx);
      const phaseR = phase.filter(i => i.cx > even.cx + 250).map(i => i.cx);

      const circuits = new Map<number, PanelCircuit>();
      let misses = 0;
      let lastY = h.y;
      for (const r of rows) {
        if (r.y <= h.y + 5) continue;
        const items = r.items.filter(inTable);
        const at = (x: number) =>
          items.find(i => Math.abs(i.cx - x) <= 6 && /^\d{1,3}$/.test(i.text));
        const a = at(odd.cx);
        const b = at(even.cx);
        if (!a && !b) {
          if (++misses > 3) break; // past the table
          continue;
        }
        misses = 0;
        lastY = r.y;
        const cell = (col: ScheduleWord | undefined) => {
          if (!col) return null;
          const t = items.find(i => Math.abs(i.cx - col.cx) <= 8)?.text;
          return blank(t) ? null : t!;
        };
        const isLoad = (i: ScheduleWord, cols: number[]) =>
          NUMBER.test(i.text) && cols.some(x => Math.abs(i.cx - x) <= 12);
        const side = (
          ckt: ScheduleWord,
          brkr: ScheduleWord | undefined,
          wire: ScheduleWord | undefined,
          cols: number[],
          from: number,
          to: number
        ): PanelCircuit => {
          const breaker = cell(brkr);
          const m = breaker ? /^(\d+)\/(\d)$/.exec(breaker) : null;
          const load = items.find(i => isLoad(i, cols));
          return {
            number: Number(ckt.text),
            breaker,
            amps: m ? Number(m[1]) : null,
            poles: m ? Number(m[2]) : null,
            wire: cell(wire),
            description: items
              .filter(
                i =>
                  i.cx > from &&
                  i.cx < to &&
                  // Only the empty-cell dot: a dash inside a description
                  // ("REC - COR. 213") is part of what it says.
                  i.text !== "." &&
                  !isLoad(i, cols)
              )
              .map(i => i.text)
              .join(" "),
            loadKva: load ? Number(load.text) : null,
          };
        };
        /*
          The description runs from just past the conduit column (134 pt
          from CKT. on UNCC) to the phase columns. It started at 160 until
          2026-10-06, and on screen 2B's even side read "- CORR, 213" for
          "REC - CORR, 213": its first word sits at 156.
        */
        if (a)
          circuits.set(
            Number(a.text),
            side(a, brkrL, wireL, phaseL, odd.cx - 340, odd.cx - 145)
          );
        if (b)
          circuits.set(
            Number(b.text),
            side(b, brkrR, wireR, phaseR, even.cx + 145, even.cx + 340)
          );
      }
      if (circuits.size === 0) return;

      // The summary block under the rows, and the title with the name.
      const below = rows
        .filter(r => r.y > lastY && r.y < lastY + 220)
        .map(r => ({ y: r.y, items: r.items.filter(inTable) }));
      const above = rows
        .filter(r => r.y < h.y && r.y > h.y - 90)
        .map(r => ({ y: r.y, items: r.items.filter(inTable) }));
      const titles: { name: string; existing: boolean; height: number }[] = [];
      for (const r of [...above, ...below])
        r.items.forEach((w, i) => {
          if (!/^PANEL(BOARD)?$/i.test(w.text)) return;
          const prev = r.items[i - 1]?.text ?? "";
          const next = r.items[i + 1];
          // "FED FROM PANEL 2HA" names the panel upstream, not this one.
          if (/^FROM$/i.test(prev) || !next || next.cx - w.cx > 120) return;
          if (!/^[A-Z0-9][A-Z0-9-]{0,7}$/i.test(next.text)) return;
          titles.push({
            name: next.text,
            existing: /^EXISTING$/i.test(prev) || /^\(?E\)?$/i.test(prev),
            height: w.height,
          });
        });
      titles.sort((p, q) => q.height - p.height);
      const labelled = (label: RegExp, span = 150) => {
        for (const r of below) {
          const k = r.items.findIndex(i => label.test(i.text));
          if (k < 0) continue;
          const at = r.items[k].cx;
          const text = r.items
            .slice(k + 1)
            .filter(i => i.cx < at + span)
            .map(i => i.text)
            .join(" ");
          return text || null;
        }
        return null;
      };
      const mains = labelled(/^MAINS:?$/i);
      const supply = labelled(/^SUPPLY:?$/i);
      let fedFrom: string | null = null;
      let connectedKva: number | null = null;
      let demandKva: number | null = null;
      for (const r of below) {
        const t = r.items;
        t.forEach((w, i) => {
          if (/^FED$/i.test(w.text) && /^FROM$/i.test(t[i + 1]?.text ?? ""))
            fedFrom ??=
              t
                .slice(i + 2)
                .filter(x => x.cx < w.cx + 300)
                .map(x => x.text)
                .join(" ") || null;
          const numberAfter = (from: number) =>
            t.slice(from).find(x => NUMBER.test(x.text));
          if (
            /^CONNECTED$/i.test(w.text) &&
            /^TOTAL$/i.test(t[i - 1]?.text ?? "")
          ) {
            const n = numberAfter(i + 1);
            if (n) connectedKva ??= Number(n.text);
          }
          if (
            /^DEMAND$/i.test(w.text) &&
            /^NEC$/i.test(t[i - 1]?.text ?? "") &&
            /^TOTAL$/i.test(t[i - 2]?.text ?? "")
          ) {
            const n = numberAfter(i + 1);
            if (n) demandKva ??= Number(n.text);
          }
        });
      }
      const amps = mains ? /(\d+)\s*A/i.exec(mains) : null;
      out.push({
        name: titles[0]?.name ?? null,
        existing: titles[0]?.existing ?? false,
        supply,
        mains,
        mainsAmps: amps ? Number(amps[1]) : null,
        fedFrom,
        connectedKva,
        demandKva,
        circuits: Array.from(circuits.values()).sort(
          (p, q) => p.number - q.number
        ),
        at: { x: c, y: h.y },
      });
    });
  }
  return out;
}

function readFixtures(rows: readonly Row[]): FixtureSchedule[] {
  const out: FixtureSchedule[] = [];
  for (const h of rows) {
    const k = h.items.findIndex(i => /^TYPE$/i.test(i.text));
    if (k < 0) continue;
    const type = h.items[k];
    const desc = h.items[k + 1];
    if (!desc || !/^DESCRIPTION$/i.test(desc.text) || desc.cx - type.cx > 250)
      continue;
    const afterDesc = h.items[k + 2];
    const watts = h.items.filter(i => /^WATTS$/i.test(i.text)).pop();
    if (!afterDesc || !watts) continue;
    const descTo = afterDesc.cx - 25;
    const lo = type.cx - 15;
    const hi = watts.cx + 30;

    const fixtures: FixtureType[] = [];
    let lastY = h.y;
    for (const r of rows) {
      if (r.y <= h.y + 3) continue;
      const items = r.items.filter(i => i.cx > lo && i.cx < hi);
      if (items.length === 0) continue;
      if (r.y - lastY > 40) break; // past the table
      lastY = r.y;
      const mark = items.find(
        i =>
          Math.abs(i.cx - type.cx) <= 10 && /^[A-Z][A-Z0-9-]{0,4}$/.test(i.text)
      );
      const text = items
        .filter(i => i !== mark && i.cx > type.cx + 15 && i.cx < descTo)
        .map(i => i.text)
        .join(" ");
      if (mark) {
        const w = items.find(i => Math.abs(i.cx - watts.cx) <= 12)?.text;
        fixtures.push({
          mark: mark.text,
          description: text,
          watts: blank(w) ? null : w!,
        });
      } else if (fixtures.length > 0 && text) {
        const f = fixtures[fixtures.length - 1];
        f.description = f.description ? `${f.description} ${text}` : text;
      }
    }
    if (fixtures.length === 0) continue;
    const titleRow = rows.find(
      r =>
        r.y < h.y &&
        r.y > h.y - 70 &&
        r.items.some(i => /^SCHEDULE$/i.test(i.text) && i.cx > lo && i.cx < hi)
    );
    const sched = titleRow?.items.find(i => /^SCHEDULE$/i.test(i.text));
    out.push({
      title:
        titleRow && sched
          ? titleRow.items
              .filter(i => Math.abs(i.cx - sched.cx) < 250)
              .map(i => i.text)
              .join(" ")
          : null,
      fixtures,
      at: { x: type.cx, y: h.y },
    });
  }
  return out;
}
