/**
 * DO ALL THE SCREENS AGREE ON EVERY BID'S PRICE? — a cross-check, not a test.
 *
 *   node scripts/totalsCrossCheck.mjs [--setup] [email] [password]
 *
 * Against a running `pnpm dev`, signed in as a local account (default: the
 * stress company from scripts/stressSeed.mts). For EVERY bid it compares the
 * total due on the Dashboard card, "Find a bid", the bid page and the
 * proposal (the owner's rule: a card can never disagree with its bid), then
 * checks the bid page's own chain — direct = material + labor + charges,
 * + markup, + overhead, + profit, + tax — and that the lines add up to the
 * direct cost. `--setup` first prices the company for real (labor rates,
 * 260 materials, overhead/profit, a tax area, per-bid overrides, new lines),
 * because a catalog of $0 starters makes every comparison 0 = 0.
 *
 * First run, 2026-10-15: 151 bids, 44 with real totals — 0 disagreements,
 * 0 broken rules (references/stress-results.md). Local only.
 */
const base = "http://127.0.0.1:3004/api/trpc/";
const r = await fetch(base + "auth.login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    json: {
      email: process.argv.find(a => a.includes("@")) ?? "stress-c@example.com",
      password: process.argv.find(a => a.endsWith("!")) ?? "Stress-C-local-1!",
    },
  }),
});
const cookie = r.headers.get("set-cookie").split(";")[0];
const get = async (p, i) => {
  const j = await (
    await fetch(
      base +
        p +
        "?input=" +
        encodeURIComponent(JSON.stringify({ json: i ?? null })),
      { headers: { cookie } }
    )
  ).json();
  if (j.error) throw new Error(p + ": " + j.error.json.message);
  return j.result.data.json;
};
const post = async (p, i) => {
  const j = await (
    await fetch(base + p, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ json: i }),
    })
  ).json();
  if (j.error) return { error: j.error.json.message };
  return j.result.data.json;
};
const setup = process.argv.includes("--setup");
if (setup) {
  const rates = await get("laborRates.list", null);
  for (const [i, rate] of (Array.isArray(rates)
    ? rates
    : rates.rates
  ).entries())
    if (rate.rateType === "hourly")
      await post("laborRates.update", {
        id: rate.id,
        hourlyCost: 45 + i * 3.17,
      });
  const mats = await get("materials.list", {});
  const list = Array.isArray(mats)
    ? mats
    : (mats.items ?? mats.materials ?? []);
  let priced = 0;
  for (const [i, m] of list.slice(0, 260).entries()) {
    const res = await post("materials.update", {
      id: m.id,
      costPerUnit: Math.round((0.37 + ((i * 7.31) % 180)) * 100) / 100,
    });
    if (!res.error) priced++;
  }
  console.log("priced materials", priced);
  console.log(
    "defaults:",
    JSON.stringify(
      await post("bids.setPricingDefaults", {
        overheadEnabled: true,
        overheadMode: "percentage",
        overheadValue: 0.1,
        profitMethod: "markup",
        profitValue: 0.15,
      })
    ).slice(0, 80)
  );
  const area = await post("salesTax.create", {
    name: "Stress County",
    state: "WA",
    county: "Stress",
    city: null,
    components: [
      { label: "State", ratePct: 6.5 },
      { label: "Local", ratePct: 2.85 },
    ],
  });
  const bids = await get("bids.dashboard", null);
  const assemblies = await get("assemblies.list", {});
  let added = 0;
  for (const [k, bid] of bids.entries()) {
    if (bid.status !== "Draft") continue;
    await post("bids.unlockQuantities", { bidId: bid.id });
    for (let j = 0; j < 3; j++) {
      const a = assemblies[(k * 5 + j * 11) % assemblies.length];
      const res = await post("bids.addAssembly", {
        bidId: bid.id,
        assemblyId: a.id,
        qty: 1 + ((k + j) % 9),
      });
      if (!res.error) added++;
    }
    if (k % 3 === 0 && area?.id)
      await post("bids.update", { id: bid.id, taxJurisdictionId: area.id });
    if (k % 4 === 1)
      await post("bids.update", {
        id: bid.id,
        overheadValue: 0.18,
        profitValue: 0.22,
      });
    if (k % 5 === 2)
      await post("bids.update", { id: bid.id, productivityPct: 0.12 });
  }
  console.log("lines added", added);
}
// The cross-check
const dash = await get("bids.dashboard", null);
const money = x => Math.round(Number(x) * 100);
let customerCompared = 0;
let checked = 0,
  nonzero = 0;
const bad = [];
for (const row of dash) {
  const g = await get("bids.get", { id: row.id });
  const s = await get("bids.search", { text: row.name });
  const srow = (s.items ?? s).find(x => x.id === row.id);
  const d = await get("proposals.document", { bidId: row.id }).catch(e => ({
    error: e.message,
  }));
  const values = {
    dashboard: money(row.totalDue),
    bidPage: money(g.totals?.totalDue),
    search: srow ? money(srow.totalDue) : null,
    proposal: d.error ? null : money(d.internalTotals?.totalDue),
    // What the CUSTOMER reads on the document — not only the internal figures.
    customerSees:
      d.error || d.document?.investment?.total == null
        ? null
        : money(d.document.investment.total),
  };
  checked++;
  if (values.customerSees !== null) customerCompared++;
  if (values.bidPage) nonzero++;
  const vals = Object.values(values).filter(v => v !== null);
  if (new Set(vals).size > 1)
    bad.push({
      id: row.id,
      name: row.name,
      status: row.status,
      ...values,
      proposalError: d.error?.slice(0, 60),
    });
}
console.log(
  `checked ${checked} bids (${nonzero} with a non-zero total); disagreements: ${bad.length}; customer-facing total compared on ${customerCompared}`
);
for (const b of bad.slice(0, 12)) console.log(JSON.stringify(b));

// ── The bid page's own chain, on every bid with a total ──
const near = (a, b) => Math.abs(a - b) <= 0.011;
let chainChecked = 0,
  evaluated = 0;
const chainBad = [];
for (const row of dash) {
  const g = await get("bids.get", { id: row.id });
  const t = g.totals;
  if (!t || !(t.totalDue > 0)) continue;
  chainChecked++;
  const lineSum = (g.lines ?? [])
    .filter(l => !l.archivedAt)
    .reduce((s, l) => s + Number(l.breakdown?.directCost ?? NaN), 0);
  const rules = {
    "direct = material + labor + marked-up charges": near(
      t.directCost,
      t.materialCost + t.laborCost + t.markedUpCharges
    ),
    "with markup = direct + material markup": near(
      t.costWithMarkup,
      t.directCost + t.materialMarkup
    ),
    "with overhead = with markup + overhead": near(
      t.costWithOverhead,
      t.costWithMarkup + t.overheadAmount
    ),
    "price = with overhead + profit": near(
      t.finalPrice,
      t.costWithOverhead + t.profitAmount
    ),
    "with tax = price + tax": near(
      t.totalWithTax,
      t.finalPrice + t.salesTaxAmount
    ),
    "lines add up to the direct cost": Number.isNaN(lineSum)
      ? "unknown"
      : near(lineSum, t.directCost - t.markedUpCharges),
  };
  if (!Number.isNaN(lineSum)) evaluated++;
  const broken = Object.entries(rules)
    .filter(([, ok]) => ok === false)
    .map(([k]) => k);
  if (broken.length)
    chainBad.push({
      id: row.id,
      name: row.name,
      broken,
      t: {
        d: t.directCost,
        m: t.materialCost,
        l: t.laborCost,
        ch: t.markedUpCharges,
        lines: Math.round(lineSum * 100) / 100,
      },
    });
}
console.log(
  `chain checked on ${chainChecked} priced bids; broken: ${chainBad.length}; line-sum rule evaluated on ${evaluated}`
);
for (const b of chainBad.slice(0, 8)) console.log(JSON.stringify(b));
process.exitCode = bad.length || chainBad.length ? 1 : 0;
