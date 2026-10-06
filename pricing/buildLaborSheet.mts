/**
 * Build the rows of `pricing/labor-units-starter.xlsx` — the starter LABOR
 * UNIT sheet (owner, 2026-10-06).
 *
 *   npx tsx pricing/buildLaborSheet.mts            # writes labor-rows.json
 *   NODE_PATH=<exceljs dir>/node_modules node pricing/writeLaborWorkbook.cjs
 *
 * ── Keyed by material ID, from a DATABASE — read this before importing ─────
 * The sheet is keyed by ID (a materials rename is coming, so a name key
 * would break). IDs are assigned by the database, so the IDs in this sheet
 * are the ones in the database this script READ (DATABASE_URL; it only
 * SELECTs). A sheet built from one database will not line up with another:
 * the import (shared/laborImport.ts) checks every row's name against the
 * row its ID finds and refuses a mismatch, so a wrong-database sheet writes
 * nothing rather than writing hours onto the wrong materials. To import into
 * production, build the sheet FROM production (read-only), or re-key it.
 *
 * ── What is in it ───────────────────────────────────────────────────────────
 * The families the owner listed, by size, from the shipped catalog. A family
 * the catalog does not carry is listed as "missing from catalog" with no ID,
 * never added (the import skips it). Every name below is looked up exactly;
 * one that is not found is reported on stdout AND listed as missing, so a
 * catalog rename cannot quietly drop a row.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import {
  STARTER_HOLD_REASON,
  liveStarterSchema,
  starterHolds,
} from "../server/seed/assemblyRecipe";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL is needed — the IDs come from a database.");

type Row = {
  family: string;
  id: number | null;
  name: string;
  unit: string;
  anchor: boolean;
  notes: string;
};

const PIPE_SIZES = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
];
const FLEX_SIZES = ['1/2"', '3/4"', '1"', '1-1/4"'];
const PIPE_ANCHORS = new Set(['1/2"', '1"', '2"', '4"']);

/** [family, [name, anchor?, notes?][]] — exact catalog names. */
const families: [string, [string, boolean?, string?][]][] = [
  ...(
    [
      ["EMT", "EMT"],
      ["PVC Sch 40", "PVC Sch 40"],
      ["Rigid (RMC)", "rigid conduit"],
      ["IMC", "IMC"],
    ] as const
  ).map(([family, word]): [string, [string, boolean?, string?][]] => [
    family,
    PIPE_SIZES.map(s => [`${s} ${word}`, PIPE_ANCHORS.has(s)]),
  ]),
  [
    "Flex (FMC)",
    FLEX_SIZES.map(s => [
      `${s} flexible metal conduit`,
      s === '1/2"' || s === '1"',
    ]),
  ],
  [
    "Liquid-tight (LFMC)",
    FLEX_SIZES.map(s => [
      `${s} liquidtight flexible conduit`,
      s === '1/2"' || s === '1"',
    ]),
  ],
  [
    "NM-B (Romex)",
    [
      ["14-2 NM-B", true],
      ["12-2 NM-B"],
      ["10-2 NM-B", true],
      ["14-3 NM-B"],
      ["12-3 NM-B"],
      ["10-3 NM-B"],
      ["8-2 NM-B"],
      ["8-3 NM-B"],
      ["6-2 NM-B"],
      ["6-3 NM-B", true],
    ],
  ],
  [
    "MC cable",
    [
      ["14-2 MC cable", true],
      ["12-2 MC cable"],
      ["12-3 MC cable"],
      ["10-2 MC cable", true],
      ["10-3 MC cable"],
      ["8-3 MC cable"],
      ["6-3 MC cable", true],
    ],
  ],
  [
    "UF-B",
    [["14-2 UF-B", true], ["12-2 UF-B"], ["10-2 UF-B"], ["8-2 UF-B", true]],
  ],
  [
    "SER / SEU",
    [
      ["6-6-6-6 SER CU", true],
      ["2-2-2-4 SER CU"],
      ["2-2-2-4 SER AL"],
      ["4/0-4/0-4/0-2/0 SER AL", true],
      ["4-4-6 SEU AL"],
      ["2-2-4 SEU AL"],
    ],
  ],
  [
    "Aluminum feeder (XHHW AL)",
    [
      ["#6 XHHW AL", true],
      ["#2 XHHW AL"],
      ["#1/0 XHHW AL", true],
      ["#2/0 XHHW AL"],
      ["#4/0 XHHW AL", true],
      ["250 kcmil XHHW AL"],
      ["350 kcmil XHHW AL"],
      ["500 kcmil XHHW AL", true],
    ],
  ],
  [
    "THHN copper — PER CONDUCTOR",
    [
      ["#14 THHN"],
      ["#12 THHN", true],
      ["#10 THHN"],
      ["#8 THHN"],
      ["#6 THHN", true],
      ["#4 THHN"],
      ["#2 THHN"],
      ["#1/0 THHN", true],
      ["#2/0 THHN"],
      ["#4/0 THHN"],
      ["250 kcmil THHN"],
      ["350 kcmil THHN"],
      ["500 kcmil THHN", true],
    ],
  ],
  [
    "Low-voltage cable",
    [
      ["Cat6 cable"],
      ["Cat6A cable"],
      ["RG6 coax cable"],
      ["16-2 fire alarm cable"],
    ],
  ],
  [
    "Field bends (one bend, by hand)",
    ["EMT", "rigid conduit", "IMC"].flatMap(word =>
      ['1/2"', '3/4"', '1"'].map((s): [string, boolean?, string?] => [
        `${s} ${word}`,
        s === '1/2"' || s === '1"',
        "FIELD BEND: hours for ONE bend of this pipe — written to its field-bend hours, not its per-foot unit",
      ])
    ),
  ],
  [
    "Elbows, 90°",
    ["EMT", "PVC Sch 40", "rigid conduit"].flatMap(word =>
      ['1-1/4"', '2"', '3"', '4"'].map((s): [string, boolean?] => [
        `${s} ${word} 90-degree elbow`,
        s === '2"' || s === '4"',
      ])
    ),
  ],
  [
    "LBs (conduit bodies)",
    [
      ['1/2" EMT LB conduit body', true],
      ['3/4" EMT LB conduit body'],
      ['1" EMT LB conduit body', true],
      ['2" EMT LB conduit body', true],
      ['1/2" rigid conduit LB conduit body'],
      ['1" rigid conduit LB conduit body'],
      ['2" rigid conduit LB conduit body'],
    ],
  ],
  [
    "Pull / junction / tee boxes",
    [
      ["4x4 pull box", true],
      ["6x6 pull box"],
      ["8x8 pull box"],
      ["12x12 pull box", true],
      ["24x24 pull box"],
      ['1/2" EMT T conduit body'],
      ['1" EMT T conduit body'],
    ],
  ],
  [
    "Strut and supports",
    [
      [
        '1-5/8" x 1-5/8" strut channel, 10 ft',
        false,
        "Sold as a 10 ft stick: hours for the STICK installed (10 × your per-ft)",
      ],
      ['3/8" all-thread rod, 10 ft', false, "One 10 ft rod hung"],
      ["Beam clamp"],
      ["Conduit hanger with bolt"],
    ],
  ],
  [
    "Panels",
    [
      ["100A main panel"],
      ["200A main panel"],
      ["400A main panel"],
      ["100A main-lug sub-panel"],
      ["200A main-lug sub-panel"],
    ],
  ],
  [
    "Breakers",
    [
      [
        "20A Single-Pole breaker",
        false,
        "Small frame — the catalog has no frame sizes",
      ],
      ["30A 2-Pole breaker"],
      ["100A 2-Pole breaker"],
      ["30A 3-Pole breaker"],
      ["100A 3-Pole breaker"],
      [
        "200A 3-Pole breaker",
        false,
        "Large frame — the catalog has no frame sizes",
      ],
    ],
  ],
  [
    "Disconnects",
    [30, 60, 100, 200].flatMap(a =>
      (["fused", "non-fused"] as const).map((k): [string] => [
        `${a}A ${k} disconnect, NEMA 1`,
      ])
    ),
  ],
  [
    "Transformers",
    [15, 30, 45, 75].map((k): [string] => [
      `${k} kVA dry-type transformer, 480V-208Y/120V 3-phase`,
    ]),
  ],
  ["Meter base", [["100A meter base"], ["200A meter base"]]],
  [
    "Grounding and bonding",
    [["Ground rod, 8 ft"], ["Ground rod, 10 ft"], ["Bonding jumper"]],
  ],
  [
    "Fixtures bid loose",
    [
      ["2x4 LED troffer"],
      ['6" recessed can, new construction IC'],
      ["4 ft LED strip fixture"],
      ["Wall pack, full cutoff"],
      ["Exit sign"],
      ["Emergency exit light combo"],
      [
        "20 ft light pole",
        false,
        "The pole and base; the head is its own fixture",
      ],
      ["LED area light"],
    ],
  ],
];

/** Rows the catalog does not carry at all — listed, never added. */
const NOT_IN_CATALOG: [string, string, string][] = [
  ["ENT", '1/2" ENT', "per 100 ft"],
  ["Flex (FMC)", 'FMC above 1-1/4"', "per 100 ft"],
  ["Liquid-tight (LFMC)", 'LFMC above 1-1/4"', "per 100 ft"],
  ["Aluminum feeder (XHHW AL)", "MHF / aluminum MC feeder", "per 100 ft"],
  ["Transformers", "Transformers above 75 kVA, or other voltages", "each"],
  ["Breakers", "3-pole breakers above 200A (large frame)", "each"],
  ["Strut and supports", "Core drill (labor item, no material)", "each"],
  [
    "Strut and supports",
    'Firestop penetration (the catalog has "Firestop caulk" by the tube; the penetration is a planned assembly, MS4)',
    "each",
  ],
  ["Trenching", "Trenching (labor item, no material)", "per ft"],
];

const UNIT: Record<string, string> = {
  foot: "per 100 ft",
  each: "each",
  box: "per box",
};

const db = await mysql.createConnection(url);
const [found] = (await db.query(
  "SELECT id, name, unitOfSale FROM materials WHERE userId IS NULL AND isActive = 1"
)) as unknown as [{ id: number; name: string; unitOfSale: string }[]];
const byName = new Map(found.map(m => [m.name, m]));
const [shippedAssemblies] = (await db.query(
  "SELECT id, name FROM assemblies WHERE userId IS NULL AND isActive = 1"
)) as unknown as [{ id: number; name: string }[]];
await db.end();

const rows: Row[] = [];
const notFound: string[] = [];
for (const [family, items] of families) {
  for (const [name, anchor, note] of items) {
    const m = byName.get(name);
    const bend = family.startsWith("Field bends");
    if (!m) {
      notFound.push(name);
      rows.push({
        family,
        id: null,
        name,
        unit: bend ? "per field bend" : "",
        anchor: false,
        notes: "missing from catalog",
      });
      continue;
    }
    rows.push({
      family,
      id: m.id,
      name: m.name,
      unit: bend ? "per field bend" : (UNIT[m.unitOfSale] ?? m.unitOfSale),
      anchor: Boolean(anchor),
      notes:
        note ??
        (family.startsWith("THHN") ? "Per conductor: one wire, 100 ft" : ""),
    });
  }
}
for (const [family, name, unit] of NOT_IN_CATALOG)
  rows.push({
    family,
    id: null,
    name,
    unit,
    anchor: false,
    notes: "missing from catalog",
  });

/*
  Tab 2: ALL 168 starters, MOST-USED FIRST, by plan row
  (references/starter-assemblies-plan.md). No usage data exists (nothing
  counts bid lines per assembly), so this order is a judgement of how often
  each appears on a typical mixed resi / light-commercial / retail-service
  workload, and the sheet says so. Every starter must appear exactly once —
  the script stops otherwise, so a starter added later cannot be left off.

  A starter not in the database READ has no ID and is greyed, with the reason
  it is held (`starterHolds`). The import skips a row with no ID, so hours
  typed there are kept in the sheet but reach nothing until the starter seeds
  and the sheet is rebuilt.
*/
const ASSEMBLY_ORDER = `
  DV1 DV4 DV2 LT1 LT4 LT7 DV3 DV13 DV5 DV20 DV26 LT19 DV7 DV9 LT2 MS1 DV21
  DV16 DV8 LT27 LT28 LT22 LT20 DV6 LT6 LT8 LT5 PG7 PG8 RS7 RS9 DV22 DV11
  DV27 DV29 DV30 MS6 MS7 MS2 LT12 LT13 LT10 LT15 LT14 DV10 DV12 DV14 DV15
  DV17 DV18 DV19 DV23 RS4 RS5 RS6 RS1 RS2 RS3 MH1 MH2 PG1 PG9 DR16 DR17 DR18
  DR2 DR1 DR7 DR8 DR6 DR3 DR4 DR5 DR19 DR20 LT21 LT23 LT24 LT25 LT26 LT29
  LT16 LT9 LT3 LT11 RS8 RS17 RS12 RS13 RS10 RS11 RS20 RS19 MS4 MS13 MS8 MS9
  MS10 MS12 MS5 MS3 MS14 MS11 DV24 DV25 DV28 DV31 DV32 DV33 DV34 CS3 CS4 CS5
  CS6 CS7 CS8 CS1 CS2 CS11 CS12 CS13 CS14 CS9 CS10 CS15 CS16 PG10 PG11 PG5
  PG4 PG2 PG3 PG6 PG12 PG13 PG14 PG15 PG17 PG18 PG16 PG19 PG20 RS18 RS14 RS15
  RS16 MH4 MH3 MH13 MH14 MH5 MH6 MH9 MH12 MH7 MH8 MH10 MH11 LT17 LT18 LT30
  DR9 DR10 DR11 DR12 DR13 DR14 DR15
`
  .trim()
  .split(/\s+/);
const starterByRef = new Map(BASELINE_ASSEMBLIES.map(a => [a.ref, a]));
const unordered = BASELINE_ASSEMBLIES.filter(
  a => !ASSEMBLY_ORDER.includes(a.ref)
).map(a => a.ref);
const unknownOrRepeated = ASSEMBLY_ORDER.filter(
  (ref, i) => !starterByRef.has(ref) || ASSEMBLY_ORDER.indexOf(ref) !== i
);
if (unordered.length || unknownOrRepeated.length) {
  throw new Error(
    `ASSEMBLY_ORDER must list every starter once. Missing: ${unordered.join(" ") || "none"}; unknown or repeated: ${unknownOrRepeated.join(" ") || "none"}`
  );
}
const schema = liveStarterSchema();
const assemblyRows = ASSEMBLY_ORDER.map(ref => {
  const spec = starterByRef.get(ref)!;
  const a = shippedAssemblies.find(s => s.name === spec.name);
  const holds = starterHolds(spec, schema);
  return {
    id: a?.id ?? null,
    ref,
    name: spec.name,
    category: spec.category,
    notes: a
      ? ""
      : holds.length
        ? `not seeded yet: ${holds.map(h => STARTER_HOLD_REASON[h]).join("; ")}${
            spec.missingParts?.length
              ? ` (${spec.missingParts.join(", ")})`
              : ""
          }`
        : "missing from this database",
  };
});

const out = {
  builtFrom: url.replace(/\/\/[^@]*@/, "//***@"),
  builtAt: new Date().toISOString(),
  rows,
  assemblyRows,
};
fs.writeFileSync(
  path.join(HERE, "labor-rows.json"),
  JSON.stringify(out, null, 2)
);
console.log(
  `rows: ${rows.length} (${rows.filter(r => r.id !== null).length} with an ID, ${rows.filter(r => r.id === null).length} missing from catalog) · assemblies: ${assemblyRows.length}`
);
if (notFound.length)
  console.log("NOT FOUND by exact name:", notFound.join(" | "));
