/**
 * STRESS SCREENS — how long each screen takes to show its real content, on
 * the stress company (scripts/stressSeed.mts), in a real browser.
 *
 *   pnpm tsx scripts/stressScreens.mts [--runs=3] [--size=laptop|phone]
 *
 * "Ready" is the thing a person is waiting for — the first bid card, the
 * drawn sheet, the bid total — never just "the page loaded". Each run is a
 * fresh load (goto), so caches inside the tab do not flatter the number; the
 * server's own caches are warm after the first run, which the first-run
 * column shows. Needs `pnpm dev`. Results: references/stress-results.md.
 */
import "dotenv/config";
import { chromium, type Page } from "@playwright/test";
import { STRESS } from "./stressConfig.mts";

const BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const RUNS = Number(arg("runs", "3"));
const SIZE = arg("size", "laptop");
const VIEWPORT =
  SIZE === "phone" ? { width: 375, height: 812 } : { width: 1440, height: 900 };

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: VIEWPORT,
    ...(SIZE === "phone" ? { isMobile: true, hasTouch: true } : {}),
  });
  const login = await context.request.post("/api/trpc/auth.login", {
    data: { json: { email: STRESS.ownerEmail, password: STRESS.password } },
  });
  if (login.status() !== 200) throw new Error(`sign-in: ${login.status()}`);
  const get = async <T,>(proc: string, input: unknown) =>
    (
      await (
        await context.request.get(
          `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
        )
      ).json()
    ).result.data.json as T;
  const bids = await get<{ id: number; name: string }[]>(
    "bids.dashboard",
    null
  );
  const big = bids.find(b => b.name.startsWith("Stress hospital wing"))!;
  const page = await context.newPage();
  // Guide and B's first-open tips out of the way: they are not what is timed.
  await page.goto("/#/dashboard");
  await page.evaluate(() =>
    localStorage.setItem(
      "bidrender.plans.tipsSeen",
      JSON.stringify({ seen: [], off: true })
    )
  );

  const screens: {
    name: string;
    hash: string;
    ready: (p: Page) => Promise<unknown>;
  }[] = [
    {
      name: `Dashboard (${bids.length} bids)`,
      hash: "/dashboard",
      ready: p =>
        p
          .getByText(/Stress job \d+/)
          .first()
          .waitFor(),
    },
    {
      name: "Bids list",
      hash: "/bids",
      ready: p =>
        p
          .getByText(/Stress job \d+/)
          .first()
          .waitFor(),
    },
    {
      name: "Plans list",
      hash: "/plans",
      ready: p =>
        p.locator("button[title^='Open the plans for']").first().waitFor(),
    },
    {
      name: "Bid page — big bid (20 lines from 2,500 marks)",
      hash: `/bids/${big.id}`,
      ready: p => p.getByText("Bid price").first().waitFor(),
    },
    {
      name: "Plans screen — big bid, sheet drawn (60 sheets)",
      hash: `/bids/${big.id}/plans`,
      ready: p =>
        p.locator("canvas.bg-white").first().waitFor({ timeout: 90_000 }),
    },
    {
      name: "Count screen — big bid",
      hash: `/bids/${big.id}/count`,
      ready: p =>
        p
          .getByText(/Stress|Duplex/)
          .first()
          .waitFor(),
    },
    {
      name: "Proposal — big bid",
      hash: `/bids/${big.id}/proposal`,
      ready: p => p.getByRole("button", { name: /Print/ }).first().waitFor(),
    },
    {
      name: "Recently deleted",
      hash: "/trash",
      ready: p =>
        p.getByRole("heading", { name: "Recently deleted" }).waitFor(),
    },
    {
      name: "Materials",
      hash: "/library/materials",
      ready: p => p.getByPlaceholder("Search materials…").waitFor(),
    },
  ];

  const rows = [
    `| Screen (${SIZE}) | first ms | median ms | max ms |`,
    "| --- | --- | --- | --- |",
  ];
  for (const screen of screens) {
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      await page.goto("about:blank");
      const started = Date.now();
      await page.goto(`${BASE}/#${screen.hash}`);
      try {
        await screen.ready(page);
        times.push(Date.now() - started);
      } catch (error) {
        times.push(NaN);
        console.log(
          `${screen.name}: not ready — ${(error as Error).message.split("\n")[0]}`
        );
      }
    }
    const ok = times.filter(t => !Number.isNaN(t)).sort((a, b) => a - b);
    rows.push(
      `| ${screen.name} | ${times[0] ?? "—"} | ${ok[Math.floor(ok.length / 2)] ?? "—"} | ${ok.at(-1) ?? "—"} |`
    );
  }
  console.log(rows.join("\n"));
  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
