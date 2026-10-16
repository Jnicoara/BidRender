/**
 * STRESS TIMINGS — every heavy read and the common saves, alone and with
 * eleven companies working at once.
 *
 *   pnpm tsx scripts/stressTime.mts [--runs=10] [--load-seconds=30]
 *
 * Needs `pnpm dev` running (PORT from .env) and `scripts/stressSeed.mts`'s
 * data. Talks to the server over HTTP exactly as the browser does (signed
 * in, JSON), so a number here includes routing, scope, the query and the
 * serialisation — everything but the network and the paint. The paint is
 * `scripts/stressScreens.mts`. Results: references/stress-results.md.
 *
 * Read-mostly: the saves it times are a mark dropped and removed, a line
 * quantity set and set back — the data ends where it started.
 */
import "dotenv/config";
import { STRESS } from "./stressConfig.mts";

const BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const arg = (name: string, fallback: number) =>
  Number(
    process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ??
      fallback
  );
const RUNS = arg("runs", 10);
const LOAD_SECONDS = arg("load-seconds", 30);

type Session = { cookie: string };

async function signIn(email: string): Promise<Session> {
  const r = await fetch(`${BASE}/api/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email, password: STRESS.password } }),
  });
  if (!r.ok) throw new Error(`sign-in ${email}: HTTP ${r.status}`);
  return { cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function call<T = unknown>(
  s: Session,
  proc: string,
  input: unknown,
  mutation = false
): Promise<{ ms: number; data: T; bytes: number }> {
  const started = performance.now();
  const r = mutation
    ? await fetch(`${BASE}/api/trpc/${proc}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: s.cookie },
        body: JSON.stringify({ json: input ?? null }),
      })
    : await fetch(
        `${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`,
        { headers: { cookie: s.cookie } }
      );
  const text = await r.text();
  const ms = performance.now() - started;
  const body = JSON.parse(text);
  if (body.error)
    throw new Error(`${proc}: ${body.error.json?.message ?? r.status}`);
  return { ms, data: body.result.data.json as T, bytes: text.length };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (n: number) => `${Math.round(n)}`;

type Probe = {
  name: string;
  proc: string;
  input: unknown;
  mutation?: boolean;
  /** Run after, to undo a save. */
  after?: (data: unknown) => Promise<void>;
};

async function main() {
  const owner = await signIn(STRESS.ownerEmail);
  const bids = (
    await call<{ id: number; name: string }[]>(owner, "bids.dashboard", null)
  ).data;
  const big = bids.find(b => b.name.startsWith("Stress hospital wing"))!;
  // A Draft bid: a Won or Lost one has its quantities locked.
  const small = (bids as { name: string; status?: string; id: number }[]).find(
    b => b.name.startsWith("Stress job") && b.status === "Draft"
  )!;
  const pdfs = (
    await call<{ id: number }[]>(owner, "bidPdfs.list", { bidId: big.id })
  ).data;
  const sheets = (
    await call<{ id: number }[]>(owner, "bidPdfs.sheets", {
      bidPdfId: pdfs[0].id,
    })
  ).data;
  const groups = (
    await call<{ groups?: { id: number }[] } | { id: number }[]>(
      owner,
      "takeoffGroups.list",
      { bidId: big.id }
    )
  ).data;
  const groupList = Array.isArray(groups) ? groups : (groups.groups ?? []);
  const got = (
    await call<{
      lines?: {
        id: number;
        quantity?: string;
        qty?: string;
        takeoffGroupId?: number | null;
        takeoffRunTypeId?: number | null;
      }[];
    }>(owner, "bids.get", { id: small.id })
  ).data;
  // A typed line: one that counts from the plans refuses a typed quantity
  // (the app is right to), so timing it measures the refusal, not a save.
  const line = got.lines?.find(
    l =>
      l &&
      typeof l.id === "number" &&
      l.takeoffGroupId == null &&
      l.takeoffRunTypeId == null
  );
  const counts = {
    bids: bids.length,
    bigSheets: sheets.length,
    bigGroups: groupList.length,
  };
  console.log(`Signed in. ${JSON.stringify(counts)}`);

  const probes: Probe[] = [
    { name: "Dashboard (all bids)", proc: "bids.dashboard", input: null },
    { name: "Bids list, first page", proc: "bids.search", input: {} },
    {
      name: "Bids list, search",
      proc: "bids.search",
      input: { text: "job 1" },
    },
    { name: "Recently deleted (bids)", proc: "bids.archived", input: null },
    { name: "Bid page — big bid", proc: "bids.get", input: { id: big.id } },
    {
      name: "Bid page — normal bid",
      proc: "bids.get",
      input: { id: small.id },
    },
    {
      name: "Step bar — big bid",
      proc: "bids.progress",
      input: { bidId: big.id },
    },
    {
      name: "Plans: sheet list (60)",
      proc: "bidPdfs.sheets",
      input: { bidPdfId: pdfs[0].id },
    },
    {
      name: "Plans: marks on one sheet",
      proc: "takeoffStamps.listForSheet",
      input: { sheetId: sheets[0].id },
    },
    {
      name: "Plans: runs on one sheet",
      proc: "takeoffRuns.listForSheet",
      input: { sheetId: sheets[0].id },
    },
    {
      name: "Plans: counts (20 groups, 2,500 marks)",
      proc: "takeoffGroups.list",
      input: { bidId: big.id },
    },
    {
      name: "Plans: whole-bid summary",
      proc: "takeoffSummary.forBid",
      input: { bidId: big.id },
    },
    {
      name: "Proposal — big bid",
      proc: "proposals.document",
      input: { bidId: big.id },
    },
    { name: "Materials (whole catalog)", proc: "materials.list", input: {} },
    { name: "Assemblies", proc: "assemblies.list", input: {} },
    {
      name: "SAVE: drop one mark (big bid)",
      proc: "takeoffStamps.drop",
      input: {
        bidId: big.id,
        sheetId: sheets[1].id,
        groupId: groupList[0]?.id,
        at: [{ x: 1500, y: 900 }],
      },
      mutation: true,
      after: async data => {
        const ids = ((data as { ids?: number[] })?.ids ??
          (data as { id?: number }[] | undefined)?.map?.(d => d.id) ??
          []) as number[];
        if (ids.length)
          await call(owner, "takeoffStamps.removeMany", { ids }, true).catch(
            () => undefined
          );
      },
    },
    ...(line
      ? [
          {
            name: "SAVE: change a line's quantity",
            proc: "bids.updateLine",
            input: { bidId: small.id, id: line.id, qty: 7 },
            mutation: true,
            // Set back, so the header's "data ends where it started" is
            // true — until 2026-10-15 it said so and left the line at 7.
            after: async () => {
              await call(
                owner,
                "bids.updateLine",
                { bidId: small.id, id: line.id, qty: Number(line.qty) },
                true
              );
            },
          } satisfies Probe,
        ]
      : []),
  ];

  const results: string[] = [
    "| What | p50 ms | p95 ms | max ms | reply KB |",
    "| --- | --- | --- | --- | --- |",
  ];
  const alone: Record<string, number> = {};
  for (const probe of probes) {
    const times: number[] = [];
    let bytes = 0;
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await call(owner, probe.proc, probe.input, probe.mutation);
        times.push(r.ms);
        bytes = r.bytes;
        if (probe.after) await probe.after(r.data);
      } catch (error) {
        results.push(
          `| ${probe.name} | ERROR: ${(error as Error).message} | | | |`
        );
        break;
      }
    }
    if (!times.length) continue;
    alone[probe.name] = pct(times, 50);
    results.push(
      `| ${probe.name} | ${fmt(pct(times, 50))} | ${fmt(pct(times, 95))} | ${fmt(Math.max(...times))} | ${(bytes / 1024).toFixed(0)} |`
    );
  }
  console.log("\n### Alone (one person)\n");
  console.log(results.join("\n"));

  // ── Eleven companies at once ────────────────────────────────────────────
  const others = await Promise.all(
    Array.from({ length: STRESS.others }, (_, i) =>
      signIn(`stress-c${i + 1}@example.com`)
    )
  );
  const otherBids = await Promise.all(
    others.map(
      async s =>
        (await call<{ id: number }[]>(s, "bids.dashboard", null)).data[0]?.id
    )
  );
  const stop = Date.now() + LOAD_SECONDS * 1000;
  const loadTimes: Record<string, number[]> = {};
  const record = (k: string, ms: number) => (loadTimes[k] ??= []).push(ms);
  let errors = 0;
  const worker = async (s: Session, bidId: number | undefined) => {
    while (Date.now() < stop) {
      for (const [k, proc, input] of [
        ["Dashboard", "bids.dashboard", null],
        ["Bid page", "bids.get", { id: bidId }],
        ["Plans summary", "takeoffSummary.forBid", { bidId }],
        ["Bids search", "bids.search", { text: "job" }],
      ] as const) {
        if (!bidId && k !== "Dashboard" && k !== "Bids search") continue;
        try {
          record(k, (await call(s, proc, input)).ms);
        } catch {
          errors++;
        }
      }
    }
  };
  // The busy company watches its big bid while the others work.
  const ownerWorker = async () => {
    while (Date.now() < stop) {
      for (const [k, proc, input] of [
        ["OWNER Dashboard", "bids.dashboard", null],
        ["OWNER big bid page", "bids.get", { id: big.id }],
        ["OWNER big summary", "takeoffSummary.forBid", { bidId: big.id }],
      ] as const) {
        try {
          record(k, (await call(owner, proc, input)).ms);
        } catch {
          errors++;
        }
      }
    }
  };
  await Promise.all([
    ...others.map((s, i) => worker(s, otherBids[i])),
    ownerWorker(),
  ]);
  const load = [
    "| What | calls | p50 ms | p95 ms | max ms | alone p50 |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const aloneFor: Record<string, string> = {
    "OWNER Dashboard": "Dashboard (all bids)",
    "OWNER big bid page": "Bid page — big bid",
    "OWNER big summary": "Plans: whole-bid summary",
  };
  for (const [k, xs] of Object.entries(loadTimes))
    load.push(
      `| ${k} | ${xs.length} | ${fmt(pct(xs, 50))} | ${fmt(pct(xs, 95))} | ${fmt(Math.max(...xs))} | ${aloneFor[k] ? fmt(alone[aloneFor[k]] ?? NaN) : ""} |`
    );
  console.log(
    `\n### ${STRESS.others + 1} companies at once, ${LOAD_SECONDS} s (errors: ${errors})\n`
  );
  console.log(load.join("\n"));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
