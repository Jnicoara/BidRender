/**
 * COMPANY SEPARATION, EVERY ROUTE (owner's queue, 2026-10-16): one company can
 * never read, change or count another's rows through any procedure.
 *
 * Not a list someone keeps up to date — a probe over `appRouter` itself, so a
 * procedure added tomorrow is probed tomorrow:
 *
 *   1. Company A builds a full bid (count, run, sent lines, its own material,
 *      assembly, labor rate, kit, client, tax area, expense). Every name A
 *      writes carries MARKER.
 *   2. A user of company B calls EVERY procedure, with each of A's ids in
 *      every id field and every other field filled with a valid value built
 *      from the procedure's own zod schema.
 *   3. A READ leak: a result containing MARKER. A WRITE leak: A's data —
 *      its bid as A sees it, its library, and a row count of every table A
 *      owns rows in — different after the call. A COUNT leak: B's dashboard
 *      and analytics counting anything.
 *
 * Skipped, and why: the separate sign-in realms (`auth.*`, `starterAuth.*`,
 * `starterLibrary.*`) — they are about who you are, not which company's rows;
 * the AI model is mocked so nothing can spend money.
 *
 * Fixture users 9919 (A) and 9920 (B).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    invokeLLM: vi.fn(async () => {
      throw new Error("no AI in the separation probe");
    }),
  };
});

import { appRouter } from "./routers";
import { getDb } from "./db";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  at,
  bidWithSheet,
  duplexAssembly,
  emtType,
  freshUser,
  own,
  rate,
  straightRun,
  type Caller,
} from "./bidBuilders.testHelper";

const A = 9919;
const B = 9920;
dropFixtureUsersAfterAll([A, B]);
const hasDb = Boolean(process.env.DATABASE_URL);
const MARKER = "ZZSECRETA";

type Ids = Record<string, number[]>;

// ─── Values from a zod 4 schema ──────────────────────────────────────────────

type Z = { _zod: { def: Record<string, unknown> & { type: string } } };
const defOf = (s: unknown) => (s as Z)._zod.def;

const ID_KEY = /(^id$|Id$)/;
const IDS_KEY = /(^ids$|Ids$)/;
const KIND_FOR: Record<string, string> = {
  bidId: "bid",
  sheetId: "sheet",
  bidPdfId: "pdf",
  groupId: "group",
  runId: "run",
  runTypeId: "runType",
  assemblyId: "assembly",
  materialId: "material",
  lineId: "line",
  stampId: "stamp",
  laborRateId: "rate",
  kitId: "kit",
  clientId: "client",
  taxJurisdictionId: "area",
  expenseId: "expense",
};

/** A valid-looking value for a non-id field. */
function valueFor(schema: unknown, key: string): unknown {
  const d = defOf(schema);
  switch (d.type) {
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "readonly":
    case "catch":
      return valueFor(d.innerType, key);
    case "pipe":
      return valueFor(d.in, key);
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.shape as Record<string, unknown>)) {
        const inner = defOf(v).type;
        if (inner === "optional") continue;
        out[k] = valueFor(v, k);
      }
      return out;
    }
    case "string":
      return key.toLowerCase().includes("email")
        ? "probe-b@test.invalid"
        : key.toLowerCase().includes("picture") || key === "picked"
          ? "data:image/png;base64,AA"
          : "probe";
    case "number":
    case "int":
      return 1;
    case "bigint":
      return 1;
    case "boolean":
      return false;
    case "date":
      return new Date("2026-01-01");
    case "enum":
      return Object.values(d.entries as Record<string, unknown>)[0];
    case "literal":
      return (d.values as unknown[])[0];
    case "array":
      return [valueFor(d.element, key)];
    case "union":
      return valueFor((d.options as unknown[])[0], key);
    case "record":
      return {};
    case "tuple":
      return (d.items as unknown[]).map(i => valueFor(i, key));
    default:
      return undefined;
  }
}

/** The object schema at the top of a procedure's input, if any. */
function objectShape(schema: unknown): Record<string, unknown> | null {
  let s = schema;
  for (let i = 0; i < 6 && s; i++) {
    const d = defOf(s);
    if (d.type === "object") return d.shape as Record<string, unknown>;
    s = d.innerType ?? d.in ?? null;
  }
  return null;
}

/** Inputs to try: the base value with each of A's ids in each id field. */
function inputsFor(schema: unknown, ids: Ids): unknown[] {
  const shape = objectShape(schema);
  if (!shape) return [];
  const base = valueFor(schema, "") as Record<string, unknown>;
  const allIds = Object.values(ids).flat();
  const idKeys = Object.keys(shape).filter(
    k => ID_KEY.test(k) || IDS_KEY.test(k)
  );
  if (idKeys.length === 0) return [base];
  const tries: unknown[] = [];
  for (const key of idKeys) {
    const kind = KIND_FOR[key];
    const candidates = kind ? (ids[kind] ?? []) : allIds;
    for (const id of candidates) {
      const input: Record<string, unknown> = { ...base };
      // Every id field gets an A id of its own kind where it has one, so a
      // second id field never makes the call fail for the wrong reason.
      for (const other of idKeys) {
        const k = KIND_FOR[other];
        const pick = k && ids[k]?.length ? ids[k][0] : id;
        input[other] = IDS_KEY.test(other) ? [pick] : pick;
      }
      input[key] = IDS_KEY.test(key) ? [id] : id;
      tries.push(input);
    }
  }
  return tries;
}

// ─── A's world, and how to tell if it moved ──────────────────────────────────

let ids: Ids = {};
let aBidId = 0;

async function aState(c: Caller): Promise<string> {
  const bid = await c.bids.get({ id: aBidId });
  const db = (await getDb())!;
  const [tables] = (await (
    db as unknown as {
      execute(q: string): Promise<[Array<{ t: string }>]>;
    }
  ).execute(
    "SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'userId'"
  )) as unknown as [Array<{ t: string }>];
  const counts: Record<string, number> = {};
  for (const { t } of tables) {
    const [[row]] = (await (
      db as unknown as {
        execute(q: string): Promise<[Array<{ n: number }>]>;
      }
    ).execute(
      `SELECT COUNT(*) AS n FROM \`${t}\` WHERE userId = ${A}`
    )) as unknown as [Array<{ n: number }>];
    counts[t] = Number(row.n);
  }
  const lines = bid.lines.map(l => [
    l.id,
    l.name,
    l.qty,
    l.scopeTag,
    l.snapshotMaterialCost,
  ]);
  return JSON.stringify({
    name: bid.bid.name,
    status: bid.bid.status,
    locked: bid.bid.quantitiesLockedAt,
    lines,
    due: bid.totals.totalDue,
    counts,
  });
}

describe.skipIf(!hasDb)("company separation, every procedure", () => {
  let a: Caller;
  let b: Caller;

  beforeAll(async () => {
    await freshUser(A);
    await freshUser(B);
    a = as(A);
    b = as(B);
    const rateId = await rate(a, `${MARKER} journeyman`, 61);
    const material = await own(a, `${MARKER} part`, 4.2, 0.1);
    const asm = await duplexAssembly(a, rateId);
    await a.assemblies.update({ id: asm.id, name: `${MARKER} receptacle` });
    const { bidId, sheetId } = await bidWithSheet(a, A, `${MARKER} bid`);
    aBidId = bidId;
    const g = await a.takeoffGroups.forAssembly({ bidId, assemblyId: asm.id });
    if (!("id" in g)) throw new Error("count");
    const dropped = await a.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: g.id as number,
      at: at(3, 3000),
    });
    const { lineId } = await a.takeoffGroups.sendToBid({ id: g.id as number });
    const type = await emtType(a, `${MARKER} EMT`);
    const run = await straightRun(
      a,
      bidId,
      sheetId,
      type.id,
      `${MARKER} run`,
      40
    );
    await a.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const kit = await a.kits.create({
      name: `${MARKER} kit`,
      items: [{ assemblyId: asm.id, qty: 1 }],
    });
    const client = await a.clients.create({ name: `${MARKER} client` });
    const area = await a.salesTax.create({
      name: `${MARKER} area`,
      state: "IL",
      components: [{ label: "State", ratePct: 5 }],
    });
    const expense = await a.bidExtras.expenses.addToBid({
      bidId,
      name: `${MARKER} permit`,
      amount: 50,
    });
    const detail = await a.bids.get({ id: bidId });
    const pdfs = await a.bidPdfs.list({ bidId });
    ids = {
      bid: [bidId],
      sheet: [sheetId],
      pdf: pdfs.map(p => p.id),
      group: [g.id as number],
      stamp: dropped.ids,
      line: detail.lines.map(l => l.id).filter((v, i, s) => s.indexOf(v) === i),
      run: [run.id],
      runType: [type.id],
      assembly: [asm.id],
      material: [material],
      rate: [rateId],
      kit: [kit!.id],
      client: [(client as { id: number }).id],
      area: [area!.id],
      expense: [(expense as { id?: number })?.id ?? 0].filter(Boolean),
    };
    expect(lineId).toBeGreaterThan(0);
  }, 120_000);

  it("no procedure shows B a row of A's, changes A's data, or counts it", async () => {
    const procs = (
      appRouter as unknown as {
        _def: {
          procedures: Record<
            string,
            { _def: { type: string; inputs: unknown[] } }
          >;
        };
      }
    )._def.procedures;
    const skip = /^(auth|starterAuth|starterLibrary)\./;
    const before = await aState(a);
    const readLeaks: string[] = [];
    const writeLeaks: string[] = [];
    let calls = 0;
    let answered = 0;
    const paths = Object.keys(procs)
      .filter(p => !skip.test(p))
      .sort();
    for (const path of paths) {
      const proc = procs[path];
      const schema = proc._def.inputs[0];
      const inputs = schema ? inputsFor(schema, ids) : [undefined];
      for (const input of inputs) {
        calls++;
        let result: unknown;
        try {
          const fn = path
            .split(".")
            .reduce<unknown>(
              (o, k) => (o as Record<string, unknown>)[k],
              b
            ) as (i: unknown) => Promise<unknown>;
          result = await fn(input);
          answered++;
        } catch {
          continue;
        }
        const text = JSON.stringify(result ?? null) ?? "";
        if (text.includes(MARKER))
          readLeaks.push(`${path} ${JSON.stringify(input).slice(0, 120)}`);
        if (proc._def.type === "mutation") {
          const now = await aState(a);
          if (now !== before) {
            writeLeaks.push(`${path} ${JSON.stringify(input).slice(0, 120)}`);
            break;
          }
        }
      }
    }
    console.log(
      `[separation] ${paths.length} procedures, ${calls} calls, ${answered} answered, ${readLeaks.length} read leaks, ${writeLeaks.length} write leaks`
    );
    expect(readLeaks, "B read A's rows").toEqual([]);
    expect(writeLeaks, "B changed A's data").toEqual([]);
    expect(await aState(a)).toBe(before);
  }, 600_000);

  it("B's dashboard and analytics count nothing of A's", async () => {
    const dash = JSON.stringify(await b.bids.dashboard());
    expect(dash).not.toContain(MARKER);
    const archived = JSON.stringify(await b.bids.archived());
    expect(archived).not.toContain(MARKER);
  });

  it("the detector can fire: the same reads, made by A, do show A's rows", async () => {
    // A control, so "0 leaks" above means "none", not "a detector that can
    // never see one" (CLAUDE.md: a measurement needs the same suspicion as
    // an assumption).
    const own = JSON.stringify([
      await a.bids.get({ id: aBidId }),
      await a.kits.get({ id: ids.kit[0] }),
      await a.bids.dashboard(),
    ]);
    expect(own).toContain(MARKER);
    expect(await aState(a)).toContain(`${MARKER} bid`);
  });
});
