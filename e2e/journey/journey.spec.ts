/**
 * THE WHOLE JOB, ONCE, AS A NEW CUSTOMER WOULD DO IT — at laptop, iPad and
 * phone size (e2e/journey/playwright.config.ts).
 *
 *   sign up → set an hourly rate → set a profit → price the parts →
 *   make a bid → upload the plan → take the printed scale → capture two
 *   legend symbols → count (mouse on the laptop, finger on the touch
 *   projects) → link the counts to assemblies → send them → trace a run →
 *   give it wire and ends → set the job's run height → drops on the
 *   receptacles → a homerun → send the run → tag a line "Owner furnishes" →
 *   read the bid's totals → the proposal and its print → the takeoff CSV
 *
 * EVERY NUMBER THE APP PRINTS IS CHECKED AGAINST HAND MATH WRITTEN BELOW, to
 * the cent, read from the text a person sees (bid screen, proposal) and from
 * the downloaded file (CSV). The hand math is built from the prices this test
 * types and the geometry of the fixture plan — never from an app reply.
 *
 * ── What is driven through the screen, and what is not ─────────────────────
 * Through the screen: sign-up, the hourly rate, the profit, the bid, the
 * upload, the scale, symbol capture, every mark, both links, both sends, the
 * trace, its wire and ends, the run height, the drops, the scope tag, the
 * proposal and its Print button, the CSV download.
 *
 * Through the API (`trpc`), and why:
 *   - MATERIAL PRICES (`materials.update`). Fourteen catalog rows; typing them
 *     into the Materials screen is a test of that screen, not of the job.
 *   - THE HOMERUN (`homeruns.setBidSettings`, `placePanel`, `syncSheet`). The
 *     app reads circuits from circuit tags printed on the drawing; the shared
 *     fixture plan (e2e/smoke/fixturePlan.ts) has none, so the screen has
 *     nothing to offer. The test tells the server what the page would have
 *     read: panel LP-1, circuit 1, leaving the first receptacle.
 *
 * ── Two app faults this test found and pins (see the report) ───────────────
 *   1. RUN_LINE_RATE: a traced run's lines are frozen at the company's
 *      `pricing_defaults.defaultLaborRateId`, and NOTHING can set that column
 *      — not Settings, not the first-run screen, not any procedure
 *      (`bids.setPricingDefaults` has no such field). So every traced run's
 *      hours are priced at $0/h on every bid, and the bid's own advice ("press
 *      Fix this line") is not offered on run lines (shared/lineFix.ts gives
 *      run lines no `rate` gap). FIXED 2026-10-16: Settings › Pricing "Labor
 *      rate for traced runs" sets it, and a new account starts on Journeyman
 *      (owner, N4), whose $60 this test types on the first-run screen — so
 *      RUN_LINE_RATE is the $60 rate. A Draft holding lines sent at $0
 *      before that takes the rate only by "Update to the current math".
 *   2. A symbol linked from the LEGEND does not link the count already made
 *      from it on this bid; the count stays "by name" (no assembly, Not priced
 *      on the bid) until the symbol happens to be armed again. That is why the
 *      switch here is linked from its COUNT CARD, and the duplex from the
 *      legend (the sheet-2 count then adopts it — asserted below).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SYMBOLS } from "../smoke/fixturePlan";
import {
  openPlans,
  placeAt,
  sheetCanvas,
  sheetPoint,
  thisSheetLine,
  trpc,
  uploadFixturePlan,
} from "../smoke/helpers";

// ─── Hand math ────────────────────────────────────────────────────────────────

/** Typed on the first-run screen for Journeyman, the role both assemblies use. */
const RATE = 60;
/** Typed in Settings › Pricing: profit as a markup on cost. */
const PROFIT_PCT = 20;
/** See fault 1 in the header. What the app prices a traced run's hours at. */
const RUN_LINE_RATE = RATE; // set in Settings since 2026-10-16 (fault 1 fixed)

/** The test's own prices. Starter catalog rows ship at $0. */
const PRICES = {
  box: { name: "Single-gang new work box, plastic, 18 cu in", cost: 0.8 },
  receptacle: { name: "15A duplex receptacle", cost: 1.5 },
  duplexPlate: { name: "1-gang wall plate, duplex, nylon", cost: 0.4 },
  nm12: { name: "12/2 NM-B Copper", cost: 0.5 },
  wireNut: { name: "Wire nut, 22-8 AWG (tan/red)", cost: 0.1 },
  switch: { name: "15A single-pole switch", cost: 1.2 },
  togglePlate: { name: "1-gang wall plate, toggle, nylon", cost: 0.35 },
  nm14: { name: "14/2 NM-B Copper", cost: 0.4 },
  // bendHours: one field bend of this pipe (materials.fieldBendLaborHours).
  emt: { name: '1/2" EMT', cost: 0.6, hours: 0.04, bendHours: 0.1 },
  thhn: { name: "#12 THHN solid Copper", cost: 0.2, hours: 0.02 },
  ground: { name: "#12 THHN green solid Copper", cost: 0.2, hours: 0.04 },
  // Fittings carry no hours of their own: their labour is "in run rate",
  // inside the pipe's hours per foot (shared/lineFix.ts `laborInRunRate`).
  coupling: { name: '1/2" EMT set-screw coupling', cost: 0.5 },
  connector: { name: '1/2" EMT set-screw connector', cost: 0.4 },
  strap: { name: '1/2" EMT one-hole strap', cost: 0.25 },
} as const;

/**
 * Dollars → whole cents. Through toFixed first so binary noise cannot move a
 * cent (126.35 × 0.6 is 75.80999… in floating point). Every price above is
 * chosen so no figure lands on a half cent — the hand math never depends on
 * which way the app rounds a tie.
 */
const cents = (n: number) => Math.round(Number((n * 100).toFixed(6)));
const P = PRICES;

/*
  DUPLEX RECEPTACLE STANDARD (starter): 1 box + 1 receptacle + 1 plate +
  25 ft 12/2 NM whip + 3 wire nuts, 0.75 h typed on the assembly, Journeyman.
    material  0.80 + 1.50 + 0.40 + 25 × 0.50 + 3 × 0.10 = $15.50 each
    labor     0.75 h × $60 = $45.00 each            → $60.50 each
  SINGLE-POLE SWITCH (starter): 1 box + 1 switch + 1 toggle plate +
  20 ft 14/2 NM whip + 3 wire nuts, 0.60 h.
    material  0.80 + 1.20 + 0.35 + 20 × 0.40 + 3 × 0.10 = $10.65 each
    labor     0.60 h × $60 = $36.00 each            → $46.65 each
  The test reads both recipes back and fails loudly if a seed change moves
  them, rather than failing on a total with no explanation.
*/
const DUPLEX_UNIT_MAT =
  P.box.cost +
  P.receptacle.cost +
  P.duplexPlate.cost +
  25 * P.nm12.cost +
  3 * P.wireNut.cost;
const DUPLEX_HOURS = 0.75;
const SWITCH_UNIT_MAT =
  P.box.cost +
  P.switch.cost +
  P.togglePlate.cost +
  20 * P.nm14.cost +
  3 * P.wireNut.cost;
const SWITCH_HOURS = 0.6;

/** 3 receptacles on sheet 1 + 2 on sheet 2; 3 switches on sheet 1. */
const N_DUPLEX = SYMBOLS.duplex.length + SYMBOLS.sheet2Duplex.length; // 5
const N_SWITCH = SYMBOLS.switch.length; // 3

/*
  THE TRACED RUN: (450,1000) → (1350,1000) on sheet 1 = 900 pt. At the
  printed 1/4" = 1'-0", 1 ft is 0.25 in = 18 pt, so 900 pt = 50.00 ft.
  Both ends answered "No drop here": no verticals on the run.
*/
const TRACED_FT = 900 / 18; // 50
/*
  DROPS: run height 10'-0" typed for this job; a receptacle sits at 1'-6"
  (shipped height). Each receptacle mark drops 120 − 18 = 102 in = 8.50 ft
  of the run type (1/2" EMT, 2 #12 + ground) — except the receptacle the
  homerun leaves from, whose drop is the homerun's own up-drop.
*/
const DROP_FT = (120 - 18) / 12; // 8.5
/*
  THE HOMERUN (API, see header): circuit 1 leaves a receptacle on sheet 1;
  panel LP-1 is placed 540 pt straight up or down the page from it.
  Measured, right-angle: 0 + 540 pt = 30.00 ft. Up-drop at the receptacle
  10'-0" − 1'-6" = 8.50 ft; down at the panel, typed at 6'-0" for this job,
  10'-0" − 6'-0" = 4.00 ft. Installed 30 + 8.5 + 4 = 42.50 ft.
  Routing set to 10% on the bid; no extra, no makeup set; no extra bends.
    conduit and labour feet  42.50 × 1.10 = 46.75 ft
    wire per conductor       42.50 × 1.10 = 46.75 ft × (2 + 1 ground)
*/
const PANEL_IN = 72;
const HOMERUN_RUN_FT = 540 / 18; // 30
const HOMERUN_INSTALLED_FT = HOMERUN_RUN_FT + DROP_FT + (120 - PANEL_IN) / 12; // 42.5
const ROUTING = 0.1;
const HOMERUN_FT = HOMERUN_INSTALLED_FT * (1 + ROUTING); // 46.75
const DROP_MARKS = N_DUPLEX - 1; // the homerun claims one receptacle's drop
const DROPS_FT = DROP_MARKS * DROP_FT; // 34.00

/** Pipe on the bid: traced + drops + homerun. */
const EMT_FT = TRACED_FT + DROPS_FT + HOMERUN_FT; // 130.75
/** 2 conductors and 1 ground down the same pipe. */
const THHN_FT = 2 * EMT_FT; // 261.50
const GROUND_FT = EMT_FT; // 130.75
/*
  FITTINGS, per leg of pipe: the traced run (50 ft) and the homerun
  (46.75 ft). The drops' fittings are not counted (the app says so in
  words). 1/2" EMT in the catalog: 10 ft sticks, straps every 10 ft and
  within 3 ft of each box.
    couplings   sticks − 1:  50 → 5 sticks → 4;  46.75 → 5 sticks → 4   = 8
    connectors  one per end: 2 + 2                                      = 4
    straps      2 near the boxes + enough that no gap passes 10 ft:
                50:    2 + (ceil((50 − 6) / 10) − 1)    = 2 + 4 = 6
                46.75: 2 + (ceil((46.75 − 6) / 10) − 1) = 2 + 4 = 6     = 12
*/
/*
  BENDS: 1/2" EMT is bent by hand (a field bend, not a bought elbow). One 90
  at the top of each counted vertical: the homerun's up-drop at the
  receptacle and its drop at the panel = 2. The traced run is straight and
  has no verticals; the drops' bends are not counted (said by the app).
*/
const FIELD_BENDS = 2;
const LEGS = [TRACED_FT, HOMERUN_FT];
const COUPLINGS = LEGS.reduce((n, ft) => n + Math.ceil(ft / 10) - 1, 0); // 8
const CONNECTORS = 2 * LEGS.length; // 4
const STRAPS = LEGS.reduce((n, ft) => n + 2 + Math.ceil((ft - 6) / 10) - 1, 0); // 12

type Line = {
  name: string;
  qty: number;
  hours: number;
  material: number;
  labor: number;
};
const run = (
  suffix: string,
  qty: number,
  unit: number,
  hoursPer = 0
): Line => ({
  name: `1/2" EMT, 2 #12 + ground — ${suffix}`,
  qty,
  hours: qty * hoursPer,
  material: qty * unit,
  labor: qty * hoursPer * RUN_LINE_RATE,
});
/** The switch line is tagged "Owner furnishes, we install": its material is the owner's. */
const lines = (switchOwnerFurnished: boolean): Line[] => [
  {
    name: "JY DUPLEX",
    qty: N_DUPLEX,
    hours: N_DUPLEX * DUPLEX_HOURS,
    material: N_DUPLEX * DUPLEX_UNIT_MAT, // 77.50
    labor: N_DUPLEX * DUPLEX_HOURS * RATE, // 225.00
  },
  {
    name: "JY SWITCH",
    qty: N_SWITCH,
    hours: N_SWITCH * SWITCH_HOURS,
    material: switchOwnerFurnished ? 0 : N_SWITCH * SWITCH_UNIT_MAT, // 31.95 → 0
    labor: N_SWITCH * SWITCH_HOURS * RATE, // 108.00
  },
  run('1/2" EMT', EMT_FT, P.emt.cost, P.emt.hours),
  run("#12 THHN solid Copper", THHN_FT, P.thhn.cost, P.thhn.hours),
  run("#12 THHN green solid Copper", GROUND_FT, P.ground.cost, P.ground.hours),
  run('1/2" EMT set-screw coupling', COUPLINGS, P.coupling.cost),
  run('1/2" EMT set-screw connector', CONNECTORS, P.connector.cost),
  run('1/2" EMT one-hole strap', STRAPS, P.strap.cost),
  // A field bend's line is labour only: the pipe is already on the EMT line.
  run('1/2" EMT field bend', FIELD_BENDS, 0, P.emt.bendHours),
];
const lineCost = (l: Line) => cents(l.material) + cents(l.labor);
function totals(switchOwnerFurnished: boolean) {
  const ls = lines(switchOwnerFurnished);
  const material = ls.reduce((s, l) => s + cents(l.material), 0);
  const labor = ls.reduce((s, l) => s + cents(l.labor), 0);
  const hours = ls.reduce((s, l) => s + l.hours, 0);
  const direct = material + labor;
  const profit = Math.round((direct * PROFIT_PCT) / 100);
  return { material, labor, hours, direct, profit, price: direct + profit };
}

// ─── Reading what the person sees ─────────────────────────────────────────────

/** "$1,234.56" → 123456 cents. */
function moneyIn(text: string): number {
  const m = text.match(/\$\s?([\d,]+\.\d\d)/);
  if (!m) throw new Error(`no dollar figure in: ${JSON.stringify(text)}`);
  return Math.round(Number(m[1].replace(/,/g, "")) * 100);
}

/** The innerText of the smallest visible block holding `name` and a $ figure. */
async function rowText(page: Page, name: string): Promise<string> {
  return page.evaluate(name => {
    const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    const hits = all.filter(
      el =>
        el.textContent?.trim() === name &&
        el.offsetParent !== null &&
        !el.closest("[aria-hidden='true']")
    );
    for (const hit of hits) {
      for (
        let a = hit.parentElement;
        a && a !== document.body;
        a = a.parentElement
      ) {
        if (/\$\s?[\d,]+\.\d\d/.test(a.innerText)) return a.innerText;
      }
    }
    return "";
  }, name);
}

/** The text of a totals row — the label's parent block. */
async function totalRow(page: Page, label: RegExp): Promise<string> {
  const row = page
    .locator("span")
    .filter({ hasText: label })
    .filter({ visible: true })
    .first()
    .locator("xpath=..");
  return row.innerText();
}

/** The byte-order mark the export starts with (so Excel reads UTF-8). */
const BOM = new RegExp("^" + String.fromCharCode(0xfeff));

/** A minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function marksOnSheet(page: Page): Promise<number> {
  const text = await thisSheetLine(page).innerText();
  return Number(text.match(/(\d+) marks?/)?.[1] ?? NaN);
}

type Group = {
  id: number;
  label: string;
  kind: string;
  assemblyId: number | null;
  count: number;
};

// ─── The journey ──────────────────────────────────────────────────────────────

test("a new account bids a whole job, and every printed number matches hand math", async ({
  page,
}, info) => {
  const touch = info.project.use.hasTouch === true;
  const stamp = Date.now();
  const email = `journey-${info.project.name}-${stamp}@test.invalid`;
  const password = `Jy#${stamp}aA`;
  const bidName = `Journey ${info.project.name} ${stamp}`;

  // Count print() calls instead of opening a print dialog.
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number; print: () => void };
    w.__printed = 0;
    w.print = () => {
      w.__printed += 1;
    };
  });

  /** A tap on a touch project, a click otherwise. */
  const press = async (loc: Locator) => (touch ? loc.tap() : loc.click());

  /*
    The plan panel. Docked on the laptop; on the iPad (upright) and the phone
    it is a full-screen sheet opened from the bar and closed with "← Plan".
  */
  const openPanel = page.getByRole("button", {
    name: "Open the panel: counts, runs, sheets and totals",
  });
  const backToPlan = page.getByRole("button", { name: /^Plan$/ });
  // On the phone the panel is a bottom sheet closed with "Done".
  const panelDone = page.getByRole("button", { name: /^Done$/ });
  const showPanel = async () => {
    if (await openPanel.isVisible()) await press(openPanel);
  };
  const showPlan = async () => {
    if (await backToPlan.isVisible()) await press(backToPlan);
    else if (await panelDone.isVisible()) await press(panelDone);
  };
  const phone = info.project.name === "phone";
  /**
   * Wait until the drawing stops moving. A bar that grows or a sheet that
   * re-fits moves it, and a tap aimed before the move lands somewhere else.
   */
  const settled = async () => {
    let last = "";
    await expect
      .poll(
        async () => {
          const box = JSON.stringify(await sheetCanvas(page).boundingBox());
          const same = box === last;
          last = box;
          return same;
        },
        { intervals: [250] }
      )
      .toBe(true);
  };
  /** Take the scale printed on sheet 1: one tap on the offer. */
  const takePrintedScale = async () => {
    await press(
      page.getByRole("button", { name: /read off the sheet/ }).first()
    );
    await sheetsList();
    await expect(page.getByText(/^1\/2 scaled$/).first()).toBeVisible();
    await showPlan();
  };
  /** The sheet list is a column on the laptop and a "Sheets" tab when narrower. */
  const sheetsList = async () => {
    await showPanel();
    const sheetsTab = page.getByRole("tab", { name: /^Sheets/ });
    if (await sheetsTab.isVisible()) await press(sheetsTab);
  };
  const tab = async (name: string) => {
    await showPanel();
    await press(page.getByRole("tab", { name: new RegExp(`^${name}`) }));
  };

  /** Arm a captured symbol from the Legend tab, then go back to the drawing. */
  const arm = async (name: string) => {
    await tab("Legend");
    await press(
      page
        .getByText(new RegExp(`^${name}$`, "i"))
        .filter({ visible: true })
        .first()
    );
    await showPlan();
    await expect(
      page.getByText(new RegExp(`^Counting ${name}`, "i")).first()
    ).toBeVisible();
  };

  /** A box dragged between two PDF points — by finger on a touch project. */
  const dragBox = async (
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const a = await sheetPoint(page, from);
    const b = await sheetPoint(page, to);
    if (!touch) {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      await page.mouse.up();
      return;
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x, y: a.y }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  };

  const groups = async () =>
    (
      await trpc<{ groups: Group[] }>(page.request, "takeoffGroups.list", {
        bidId,
      })
    ).groups;

  await test.step("sign up through the screen", async () => {
    await page.goto("/#/signup");
    await page.locator("#name").fill("Journey Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await press(page.getByRole("button", { name: "Create account" }).last());
    await expect(page.getByText("Welcome to BidRidge")).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step("first run: type the Journeyman rate", async () => {
    const jm = page.getByRole("textbox", { name: "Journeyman hourly rate" });
    await jm.fill(String(RATE));
    await jm.press("Enter");
    await expect(page.getByText(`$${RATE}.00`).first()).toBeVisible();
    await press(page.getByRole("button", { name: "Start my first bid" }));
    await expect(page.getByRole("button", { name: /Empty bid/ })).toBeVisible();
  });

  await test.step(`Settings › Pricing: profit ${PROFIT_PCT}% markup`, async () => {
    await page.goto("/#/settings/pricing");
    const profit = page.getByRole("textbox", { name: /^Default profit/ });
    await profit.fill(String(PROFIT_PCT));
    await profit.press("Enter");
    await expect
      .poll(
        async () =>
          (
            await trpc<{ profitValue: string }>(
              page.request,
              "bids.pricingDefaults"
            )
          ).profitValue
      )
      .toBe((PROFIT_PCT / 100).toFixed(4));
    // Fault 1, FIXED 2026-10-16: the traced-run labor rate is set here
    // (BidPricingDefaultsSection "Labor rate for traced runs"). Since the
    // owner's N4 answer a NEW account already starts on Journeyman — and the
    // $60 typed for Journeyman on the first-run screen forked it, so the
    // picker must follow the fork: Journeyman, no "Not set", no $0 warning,
    // and no "Example rate" (it is the shop's own $60 now).
    const runRate = page.locator("#run-labor-rate");
    await runRate.scrollIntoViewIfNeeded();
    await expect(runRate.locator("option:checked")).toHaveText("Journeyman");
    await expect(
      page.getByText(/Not set — the hours on traced runs|has no rate yet/)
    ).toHaveCount(0);
    await expect(page.getByText(/^Example rate \$59\.22/)).toHaveCount(0);
    // Picking it again by hand changes nothing and still says nothing.
    await runRate.selectOption({ label: "Journeyman" });
    await expect(
      page.getByText(/Not set — the hours on traced runs/)
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await trpc<{ defaultLaborRateId: number | null }>(
              page.request,
              "bids.pricingDefaults"
            )
          ).defaultLaborRateId
      )
      .not.toBeNull();
  });

  await test.step("price the parts this job uses (API — see header)", async () => {
    const all = await trpc<{ id: number; name: string }[]>(
      page.request,
      "materials.list",
      {}
    );
    for (const p of Object.values(PRICES)) {
      const row = all.filter(m => m.name === p.name);
      expect(row, `exactly one catalog row named ${p.name}`).toHaveLength(1);
      await trpc(
        page.request,
        "materials.update",
        {
          id: row[0].id,
          costPerUnit: p.cost,
          ...("hours" in p ? { laborHours: p.hours } : {}),
          ...("bendHours" in p ? { fieldBendLaborHours: p.bendHours } : {}),
        },
        true
      );
    }
    // The recipes the hand math assumes, read back. A seed change fails HERE.
    const library = await trpc<{ id: number; name: string }[]>(
      page.request,
      "assemblies.list",
      {}
    );
    for (const [name, parts, hours] of [
      [
        DUPLEX_ASSEMBLY,
        [
          [P.box, 1],
          [P.receptacle, 1],
          [P.duplexPlate, 1],
          [P.nm12, 25],
          [P.wireNut, 3],
        ],
        DUPLEX_HOURS,
      ],
      [
        SWITCH_ASSEMBLY,
        [
          [P.box, 1],
          [P.switch, 1],
          [P.togglePlate, 1],
          [P.nm14, 20],
          [P.wireNut, 3],
        ],
        SWITCH_HOURS,
      ],
    ] as const) {
      const a = library.find(x => x.name === name);
      expect(a, `starter assembly ${name}`).toBeTruthy();
      const detail = await trpc<{
        baseLaborHours: string;
        materials: { name: string; qty: string; costPerUnit: string }[];
      }>(page.request, "assemblies.get", { id: a!.id });
      expect(Number(detail.baseLaborHours), `${name} hours`).toBe(hours);
      expect(
        detail.materials
          .map(m => [m.name, Number(m.qty), Number(m.costPerUnit)])
          .sort(),
        `${name} recipe, priced`
      ).toEqual(parts.map(([p, q]) => [p.name, q, p.cost]).sort());
    }
  });

  let bidId = 0;
  await test.step("create a bid", async () => {
    await page.goto("/#/dashboard");
    await press(page.getByRole("button", { name: /Empty bid/ }));
    await page.getByPlaceholder(/Bid name/).fill(bidName);
    await press(page.getByRole("button", { name: "Create" }));
    await page.waitForURL(/#\/bids\/\d+/);
    bidId = Number(page.url().match(/#\/bids\/(\d+)/)![1]);
    expect(bidId).toBeGreaterThan(0);
  });

  await test.step("upload the plan and take the scale printed on sheet 1", async () => {
    await openPlans(page, bidId);
    await uploadFixturePlan(page);
    // A first-visit tip can sit over the drawing; it says "Got it".
    const tip = page.getByRole("button", { name: "Got it" });
    if (await tip.isVisible()) await press(tip);
    await sheetsList();
    await expect(page.getByText(/^0\/2 scaled$/).first()).toBeVisible();
    await showPlan();
    // The phone shows the scale chip only while tracing (counting needs no
    // scale), so there the offer is taken at the start of the trace step.
    if (!phone) await takePrintedScale();
  });

  await test.step("capture the two legend symbols", async () => {
    for (const [name, at] of [
      ["JY DUPLEX", SYMBOLS.legendDuplex],
      ["JY SWITCH", SYMBOLS.legendSwitch],
    ] as const) {
      await tab("Legend");
      await press(page.getByRole("button", { name: /Capture/ }).first());
      await showPlan();
      await settled();
      await dragBox(
        { x: at.x - 30, y: at.y + 30 },
        { x: at.x + 30, y: at.y - 30 }
      );
      await page.getByRole("textbox", { name: "Symbol name" }).fill(name);
      await press(page.getByRole("button", { name: "Save symbol" }));
      await showPanel();
      await expect(
        page.getByText(name, { exact: true }).filter({ visible: true }).first()
      ).toBeVisible();
    }
  });

  await test.step(`count sheet 1 by ${touch ? "finger" : "mouse"}`, async () => {
    await arm("JY DUPLEX");
    await settled();
    for (const at of SYMBOLS.duplex) await placeAt(page, at, touch);
    await expect.poll(() => marksOnSheet(page)).toBe(3);
    await page.keyboard.press("Escape");
    await arm("JY SWITCH");
    await settled();
    for (const at of SYMBOLS.switch) await placeAt(page, at, touch);
    await expect.poll(() => marksOnSheet(page)).toBe(6);
    await page.keyboard.press("Escape");
  });

  await test.step("link the switch count from its card, the duplex symbol from the legend", async () => {
    await tab("Counts");
    // Cards in the order counted: JY DUPLEX, then JY SWITCH.
    await press(page.getByRole("button", { name: "Link assembly…" }).nth(1));
    await page
      .getByPlaceholder("Search assemblies…")
      .fill(SWITCH_ASSEMBLY.toLowerCase());
    await press(
      page
        .getByRole("button", { name: new RegExp(`^${SWITCH_ASSEMBLY}`) })
        .first()
    );
    await tab("Legend");
    await press(
      page.getByRole("button", { name: "Link JY DUPLEX to an assembly" })
    );
    await page
      .getByPlaceholder("Search assemblies…")
      .fill(DUPLEX_ASSEMBLY.toLowerCase());
    await press(
      page
        .getByRole("button", { name: new RegExp(`^${DUPLEX_ASSEMBLY}`) })
        .first()
    );
    await expect(
      page.getByText(DUPLEX_ASSEMBLY).filter({ visible: true }).first()
    ).toBeVisible();
    await expect
      .poll(
        async () => (await groups()).find(g => g.label === "JY SWITCH")?.kind
      )
      .toBe("assembly");
  });

  await test.step(`count sheet 2 by ${touch ? "finger" : "mouse"}`, async () => {
    await showPlan();
    await press(page.getByRole("button", { name: "Next sheet" }));
    await expect(page.getByText(/^2\/2$/).first()).toBeVisible();
    await expect(sheetCanvas(page)).toBeVisible();
    await arm("JY DUPLEX");
    await settled();
    for (const at of SYMBOLS.sheet2Duplex) await placeAt(page, at, touch);
    await expect.poll(() => marksOnSheet(page)).toBe(2);
    await page.keyboard.press("Escape");
    // Arming the now-linked duplex made its count the assembly's: 3 + 2.
    await expect
      .poll(async () =>
        (await groups()).map(g => `${g.label}:${g.kind}:${g.count}`).sort()
      )
      .toEqual([
        `JY DUPLEX:assembly:${N_DUPLEX}`,
        `JY SWITCH:assembly:${N_SWITCH}`,
      ]);
    await press(page.getByRole("button", { name: "Previous sheet" }));
    await expect(page.getByText(/^1\/2$/).first()).toBeVisible();
  });

  await test.step("send the two counts to the bid", async () => {
    await tab("Totals");
    await press(page.getByRole("button", { name: /^Send 2 to bid…$/ }));
    await press(page.getByRole("button", { name: /^Send 2 to bid$/ }));
    await expect(page.getByText(/^On the bid — 2$/).first()).toBeVisible();
  });

  await test.step('trace a 50 ft run of 1/2" EMT, give it wire and ends', async () => {
    await showPlan();
    if (info.project.name === "phone") {
      // The phone bar keeps Count, Undo and Delete; tracing is under Tools,
      // with no run-type picker — the run's own "Change what this run is"
      // sets the type after.
      await press(page.getByRole("button", { name: "More tools" }));
      await press(page.getByRole("menuitem", { name: /^Trace / }).first());
      // The scale chip shows now; take the printed scale with one tap.
      await press(
        page.getByRole("button", { name: /read off the sheet/ }).first()
      );
      await expect(page.getByText(`1/4" = 1'-0"`).first()).toBeVisible();
    } else {
      await press(
        page.getByRole("button", { name: "Change conduit run type" })
      );
      await press(
        page
          .getByRole("button", { name: /^1\/2" EMT, 2 #12 \+ ground/ })
          .first()
      );
      await press(
        page.getByRole("button", { name: /^Trace conduit: 1\/2" EMT/ })
      );
    }
    await settled();
    await placeAt(page, { x: 450, y: 1000 }, touch);
    if (touch) {
      await placeAt(page, { x: 1350, y: 1000 }, true);
      // The length it will commit. On touch it sits beside a bare "Finish"
      // in its own "Run total" readout (B, eb94729a: the pill docks to the
      // bottom on touch); on a mouse it is inside the button.
      await expect(page.getByLabel("Run total")).toHaveText(`${TRACED_FT}'-0"`);
      await press(page.getByRole("button", { name: /^Finish/ }));
    } else {
      const end = await sheetPoint(page, { x: 1350, y: 1000 });
      await page.mouse.dblclick(end.x, end.y);
    }
    if (phone) {
      await sheetsList();
      await expect(page.getByText(/^1\/2 scaled$/).first()).toBeVisible();
    }
    await tab("Runs");
    await expect(thisSheetLine(page)).toContainText(`${TRACED_FT} ft of runs`);
    if (info.project.name === "phone") {
      // Open the run (its row), then change its type.
      await press(page.getByText("Run on Sheet 1").first());
      await press(
        page.getByRole("button", { name: "Change what this run is" })
      );
      await press(
        page
          .getByRole("button", { name: /^1\/2" EMT, 2 #12 \+ ground/ })
          .first()
      );
    }
    await expect(
      page
        .getByText(
          '1/2" EMT · 2 x #12 THHN solid Copper + #12 THHN green solid Copper'
        )
        .first()
    ).toBeVisible();
    await press(page.getByRole("button", { name: "Use the run type's wire" }));
    await expect(page.getByText("of which bare ground").first()).toBeVisible();
    // Open the run, answer the end it left unanswered: no drop at either end.
    if (
      !(await page
        .getByRole("button", { name: "No drop here" })
        .first()
        .isVisible())
    )
      await press(
        page
          .getByText(
            '1/2" EMT · 2 x #12 THHN solid Copper + #12 THHN green solid Copper'
          )
          .first()
      );
    await press(
      page.getByRole("button", { name: "No drop here", pressed: false })
    );
    await expect(
      page.getByRole("button", { name: "No drop here", pressed: true })
    ).toHaveCount(2);
  });

  await test.step(`pipe runs at 10'-0", the panel sits at 6'-0"`, async () => {
    if (phone) {
      /*
        The phone's plan bar has no heights chip (TakeoffPage: `!phone &&
        <JobHeightsChip>`), so the job level cannot be set there. The phone
        sets the COMPANY's heights in Settings › Heights instead — a job with
        none of its own follows them, so the arithmetic is the same.
      */
      await page.goto("/#/settings/heights");
      await press(page.getByRole("button", { name: "Set a height" }).first());
      const feet = page.getByRole("textbox", {
        name: "Distribution height feet",
      });
      await feet.fill("10");
      await feet.press("Enter");
      await expect(feet).toHaveValue("10");
      const panelRow = page
        .getByText("Panel", { exact: true })
        .locator(
          "xpath=ancestor::div[.//button[normalize-space()='Set a height']][1]"
        );
      await press(panelRow.getByRole("button", { name: "Set a height" }));
      const panelFeet = page.getByRole("textbox", { name: "Panel feet" });
      await panelFeet.fill(String(PANEL_IN / 12));
      await panelFeet.press("Enter");
      await expect(panelFeet).toHaveValue(String(PANEL_IN / 12));
      await openPlans(page, bidId);
      await expect(sheetCanvas(page)).toBeVisible({ timeout: 60_000 });
      return;
    }
    await showPlan();
    await press(page.getByRole("button", { name: /Drop heights not set/ }));
    await press(
      page.getByRole("dialog").getByRole("button", { name: "Set" }).first()
    );
    const feet = page.getByRole("textbox", {
      name: "Distribution height feet",
    });
    await feet.fill("10");
    await feet.press("Enter");
    // The panel's height too, so the homerun's drop at the panel counts.
    const panelRow = page
      .getByRole("dialog")
      .locator("div.space-y-0\\.5")
      .filter({ hasText: /^Panel/ });
    await press(panelRow.getByRole("button", { name: "Set" }));
    const panelFeet = page.getByRole("textbox", { name: "Panel feet" });
    await panelFeet.fill(String(PANEL_IN / 12));
    await panelFeet.press("Enter");
    await expect(page.getByRole("textbox", { name: "Panel feet" })).toHaveValue(
      String(PANEL_IN / 12)
    );
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: /^Runs at 10'-0"/ })
    ).toBeVisible();
  });

  await test.step("a drop to every receptacle", async () => {
    await tab("Counts");
    await press(
      page.getByRole("button", { name: "Add a drop to each one" }).first()
    );
    await page
      .getByRole("combobox", { name: "What each mark drops to" })
      .selectOption({ label: `Receptacle (1'-6")` });
    await page
      .getByRole("combobox", { name: "What each drop is made of" })
      .selectOption({ label: '1/2" EMT, 2 #12 + ground' });
    // Before the homerun claims one: 8.50 ft × 5 = 42.50 ft, said in words.
    await expect(
      page.getByText(
        `${DROP_FT.toFixed(2)} ft × ${N_DUPLEX} = ${(DROP_FT * N_DUPLEX).toFixed(2)} ft`
      )
    ).toBeVisible();
  });

  await test.step("a homerun: panel LP-1, circuit 1 from the first receptacle (API — see header)", async () => {
    const plans = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
      bidId,
    });
    const sheets = await trpc<{ id: number; pageNumber: number }[]>(
      page.request,
      "bidPdfs.sheets",
      {
        bidPdfId: plans[0].id,
      }
    );
    const sheet1 = sheets.find(s => s.pageNumber === 1)!.id;
    const stamps = await trpc<
      { id: number; groupId: number; x: string | number; y: string | number }[]
    >(page.request, "takeoffStamps.listForSheet", { sheetId: sheet1 });
    const duplexGroup = (await groups()).find(g => g.label === "JY DUPLEX")!;
    const leaving = stamps.find(s => s.groupId === duplexGroup.id)!;
    expect(leaving, "a receptacle mark on sheet 1").toBeTruthy();
    // 540 pt straight up or down the page from that mark: right-angle 540 pt.
    const lx = Number(leaving.x);
    const ly = Number(leaving.y);
    const panelSpot = { x: lx, y: ly + 540 <= 1728 ? ly + 540 : ly - 540 };
    const runTypes = await trpc<{ id: number; label: string }[]>(
      page.request,
      "takeoffRunTypes.list",
      { bidId }
    );
    const emtType = runTypes.find(t => t.label === '1/2" EMT, 2 #12 + ground')!;
    await trpc(
      page.request,
      "homeruns.setBidSettings",
      {
        bidId,
        method: "measured",
        routingPct: ROUTING,
        runTypeId: emtType.id,
        extraBends: 0,
      },
      true
    );
    await trpc(
      page.request,
      "homeruns.syncSheet",
      {
        bidId,
        sheetId: sheet1,
        circuits: [
          { panel: "LP-1", circuits: [1], leavingStampId: leaving.id },
        ],
        create: true,
      },
      true
    );
    await trpc(
      page.request,
      "homeruns.placePanel",
      {
        bidId,
        panel: "LP-1",
        spot: { sheetId: sheet1, ...panelSpot },
        by: "hand",
      },
      true
    );
    const hr = await trpc<{ totals: { conduitFt: number } }>(
      page.request,
      "homeruns.forBid",
      { bidId }
    );
    expect(cents(hr.totals.conduitFt)).toBe(cents(HOMERUN_FT));
  });

  await test.step("send the run to the bid", async () => {
    await page.reload();
    await expect(page.getByText(/^Plans — /).first()).toBeVisible({
      timeout: 60_000,
    });
    await tab("Totals");
    await press(page.getByRole("button", { name: /^Send \d+ to bid…$/ }));
    await press(page.getByRole("button", { name: /^Send \d+ to bid$/ }));
    await expect(
      page.getByText("Everything counted and traced is on the bid.").first()
    ).toBeVisible();
  });

  const expectBidScreen = async (switchOwnerFurnished: boolean) => {
    const want = totals(switchOwnerFurnished);
    // Exactly the lines the hand math has — no more (a surprise line is a
    // number nobody checked), no fewer.
    const onBid = await trpc<{ lines: { name: string }[] }>(
      page.request,
      "bids.get",
      { id: bidId }
    );
    expect(onBid.lines.map(l => l.name).sort(), "the lines on the bid").toEqual(
      lines(switchOwnerFurnished)
        .map(l => l.name)
        .sort()
    );
    for (const l of lines(switchOwnerFurnished)) {
      const text = await rowText(page, l.name);
      expect(text, `bid line ${l.name} is on screen`).not.toBe("");
      const qty = String(Math.round(l.qty * 100) / 100).replace(".", "\\.");
      expect(text, `${l.name}: quantity`).toMatch(
        new RegExp(`(^|\\s)${qty}(\\s|$)`)
      );
      if (l.hours > 0)
        expect(text, `${l.name}: hours`).toContain(
          `${Math.round(l.hours * 100) / 100} h`
        );
      expect(moneyIn(text), `${l.name}: cost`).toBe(lineCost(l));
    }
    const materials = await totalRow(page, /^Materials$/);
    expect(materials, "nothing left unpriced").not.toMatch(/not priced/i);
    expect(moneyIn(materials), "Materials").toBe(want.material);
    const labor = await totalRow(page, /^Labor \(/);
    expect(labor, "Labor hours").toContain(
      `Labor (${Math.round(want.hours * 100) / 100} h)`
    );
    expect(moneyIn(labor), "Labor").toBe(want.labor);
    expect(moneyIn(await totalRow(page, /^Direct cost$/)), "Direct cost").toBe(
      want.direct
    );
    const profit = await totalRow(page, /^Profit /);
    expect(profit).toContain(`Profit ${PROFIT_PCT}% markup`);
    expect(moneyIn(profit), "Profit").toBe(want.profit);
    const price = await totalRow(page, /^Bid price/);
    expect(price, "nothing left unpriced").not.toMatch(/not priced/i);
    expect(moneyIn(price), "Bid price").toBe(want.price);
  };

  await test.step("the bid screen: every line and every total", async () => {
    await page.goto(`/#/bids/${bidId}`);
    await expect(
      page
        .getByText(/^JY DUPLEX$/)
        .filter({ visible: true })
        .first()
    ).toBeVisible({ timeout: 60_000 });
    await expectBidScreen(false);
    // Fault 1 fixed: with the run rate picked in Settings, the bid no longer
    // warns that run lines have hours but no labor rate (it did, with 4).
    await expect(
      page.getByText("lines have hours but no labor rate", { exact: false })
    ).toHaveCount(0);
  });

  await test.step("scope tag: the owner furnishes the switches", async () => {
    await press(page.getByRole("button", { name: "Who does JY SWITCH?" }));
    await press(
      page.getByRole("menuitemradio", { name: /^Owner furnishes, we install/ })
    );
    await expect(
      page.getByRole("button", {
        name: /^Owner furnishes, we install — change who does JY SWITCH/,
      })
    ).toBeVisible();
    await expect
      .poll(async () => moneyIn(await rowText(page, "JY SWITCH")))
      .toBe(lineCost(lines(true)[1]));
    await expectBidScreen(true);
  });

  await test.step("the proposal prints the same total", async () => {
    const want = totals(true);
    await page.goto(`/#/bids/${bidId}/proposal`);
    // "Total investment" and its note are one block; the figure is beside it.
    const investment = page
      .locator("article")
      .getByText(/^Total investment$/i)
      .locator("xpath=../..");
    await expect(investment).toBeVisible({ timeout: 60_000 });
    const printed = await investment.innerText();
    expect(printed, "the printed total is a figure").not.toMatch(
      /Price pending/
    );
    expect(moneyIn(printed), "Total investment").toBe(want.price);
    await expect(
      page
        .locator("article")
        .getByText(`${Math.round(want.hours * 100) / 100} labor hours`)
        .first()
    ).toBeVisible();
    for (const l of lines(true))
      await expect(
        page.locator("article").getByText(l.name, { exact: true }).first()
      ).toBeVisible();
    await expect(
      page
        .locator("article")
        .getByText(`Owner-furnished, installed by us: ${N_SWITCH} JY SWITCH`)
    ).toBeVisible();
    // "Your figures", beside the document: the same chain as the bid screen.
    const figures = await page
      .getByText(/^Your figures$/i)
      .locator("xpath=..")
      .innerText();
    const figure = (label: string) => {
      const m = figures.match(new RegExp(`${label}\\n(\\$[\\d,]+\\.\\d\\d)`));
      expect(m, `Your figures: ${label}`).toBeTruthy();
      return moneyIn(m![1]);
    };
    expect(figures).not.toMatch(/not priced/i);
    expect(figure("Materials")).toBe(want.material);
    expect(figure("Labor")).toBe(want.labor);
    expect(figure("Direct cost")).toBe(want.direct);
    expect(figure("Profit")).toBe(want.profit);
    expect(figure("Bid price")).toBe(want.price);
    expect(figure("Total due")).toBe(want.price);
    await press(page.getByRole("button", { name: /Print \/ Save PDF/ }));
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __printed: number }).__printed
        )
      )
      .toBe(1);
  });

  await test.step("the takeoff CSV, with prices", async () => {
    const want = totals(true);
    await page.goto(`/#/bids/${bidId}`);
    await press(page.getByRole("button", { name: /^Send/ }).first());
    await press(page.getByRole("menuitem", { name: /^Takeoff/ }));
    await press(page.getByRole("checkbox"));
    const download = page.waitForEvent("download");
    await press(page.getByRole("button", { name: "Download with prices" }));
    const file = await (await download).path();
    const rows = parseCsv(readFileSync(file, "utf8").replace(BOM, ""));
    const find = (section: string, item: string) => {
      const start = rows.findIndex(r => r[0] === section);
      const header = rows[start + 1];
      const row = rows
        .slice(start + 2)
        .find(r => r[header.indexOf("Item")] === item);
      expect(row, `${section}: ${item}`).toBeTruthy();
      return Object.fromEntries(header.map((h, i) => [h, row![i]]));
    };
    const num = (s: string) => Number(s);

    expect(rows[0]).toEqual(["Takeoff", bidName]);
    // By sheet: what was marked and traced where.
    const bySheet = (sheetTitle: string, item: string) => {
      const start = rows.findIndex(r => r[0] === "By sheet");
      const header = rows[start + 1];
      const row = rows
        .slice(start + 2)
        .find(
          r =>
            r[header.indexOf("Sheet title")] === sheetTitle &&
            r[header.indexOf("Item")] === item
        );
      expect(row, `By sheet: ${sheetTitle} ${item}`).toBeTruthy();
      return Object.fromEntries(header.map((h, i) => [h, row![i]]));
    };
    expect(num(bySheet("Sheet 1", "JY DUPLEX").Quantity)).toBe(
      SYMBOLS.duplex.length
    );
    expect(num(bySheet("Sheet 2", "JY DUPLEX").Quantity)).toBe(
      SYMBOLS.sheet2Duplex.length
    );
    expect(num(bySheet("Sheet 1", "JY SWITCH").Quantity)).toBe(N_SWITCH);
    /*
      The run row, per sheet. Everything pipe-shaped is on sheet 1: the
      50 ft trace, the 46.75 ft homerun and the drops of the 3 − 1 = 2
      sheet-1 receptacles the homerun does not claim. The CSV files the
      homerun's footage under "Traced ft" (see the report); the drops are the
      "Vertical ft". Sheet 2's two receptacle drops (17 ft) are counted in the
      whole-bid row only — sheet 2 has no run row of its own.
    */
    const sheet1DropsFt = (SYMBOLS.duplex.length - 1) * DROP_FT; // 17
    const runRow = bySheet("Sheet 1", '1/2" EMT, 2 #12 + ground');
    expect(cents(num(runRow["Traced ft"])), "sheet 1 traced ft").toBe(
      cents(TRACED_FT + HOMERUN_FT)
    );
    expect(cents(num(runRow["Vertical ft"])), "sheet 1 vertical ft").toBe(
      cents(sheet1DropsFt)
    );
    const sheet1Ft = TRACED_FT + HOMERUN_FT + sheet1DropsFt; // 113.75
    expect(cents(num(runRow.Quantity)), "sheet 1 pipe").toBe(cents(sheet1Ft));
    expect(cents(num(runRow["Wire ft"])), "sheet 1 wire").toBe(
      cents(2 * sheet1Ft)
    );
    expect(cents(num(runRow["Ground ft"])), "sheet 1 ground").toBe(
      cents(sheet1Ft)
    );

    // Whole bid: quantities and the money the bid's Cost column shows.
    const duplex = find("Whole bid", "JY DUPLEX");
    expect(num(duplex.Quantity)).toBe(N_DUPLEX);
    expect(cents(num(duplex["Unit cost"]))).toBe(
      cents(DUPLEX_UNIT_MAT + DUPLEX_HOURS * RATE)
    );
    expect(cents(num(duplex["Line cost"]))).toBe(lineCost(lines(true)[0]));
    const sw = find("Whole bid", "JY SWITCH");
    expect(num(sw.Quantity)).toBe(N_SWITCH);
    // Owner furnishes the switch: our cost is the labour only.
    expect(cents(num(sw["Unit cost"]))).toBe(cents(SWITCH_HOURS * RATE));
    expect(cents(num(sw["Line cost"]))).toBe(lineCost(lines(true)[1]));
    const runAll = find("Whole bid", '1/2" EMT, 2 #12 + ground');
    expect(cents(num(runAll.Quantity)), "whole-bid pipe").toBe(cents(EMT_FT));
    expect(cents(num(runAll["Traced ft"])), "whole-bid traced ft").toBe(
      cents(TRACED_FT + HOMERUN_FT)
    );
    expect(cents(num(runAll["Vertical ft"])), "whole-bid vertical ft").toBe(
      cents(DROPS_FT)
    );
    expect(cents(num(runAll["Wire ft"])), "whole-bid wire").toBe(
      cents(THHN_FT)
    );
    expect(cents(num(runAll["Ground ft"])), "whole-bid ground").toBe(
      cents(GROUND_FT)
    );
    // Every line from the run type, fittings and bends included.
    const runLinesCost = lines(true)
      .filter(l => l.name.startsWith('1/2" EMT, 2 #12 + ground'))
      .reduce((s, l) => s + lineCost(l), 0);
    expect(cents(num(runAll["Line cost"])), "run type line cost").toBe(
      runLinesCost
    );
    const footer = (label: RegExp) => {
      const r = rows.find(x => label.test(x[0]));
      expect(r, String(label)).toBeTruthy();
      return cents(num(r![1]));
    };
    expect(footer(/^Priced rows above, added up$/)).toBe(want.direct);
    expect(footer(/^Direct cost — the same figure as on the bid$/)).toBe(
      want.direct
    );
    expect(
      rows.some(r => /Not priced, as the bid counts/.test(r[0] ?? ""))
    ).toBe(false);
  });
});

const DUPLEX_ASSEMBLY = "Duplex receptacle standard";
const SWITCH_ASSEMBLY = "Single-pole switch";
