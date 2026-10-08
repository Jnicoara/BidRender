/**
 * "Never stuck" — references/never-stuck-plan.md, gaps 1–7 (2026-10-07).
 *
 * A warning that names a missing number must also be the way to fill it in,
 * and its explanation must reach a finger, not only a mouse. The pure rule is
 * tested directly; the screens are pinned by source guards, because vitest
 * here does not render React components (CLAUDE.md). Each guard below fails
 * on the code as it stood before the change.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXAMPLE_RATE_WHY, focusOnOpen, NEEDS_WHY } from "./needsFix";

const src = (rel: string) =>
  readFileSync(resolve(__dirname, "..", rel), "utf8");

describe("focusOnOpen — the editor lands on the field the warning named", () => {
  it("opens on the name when no warning opened it (the pencil)", () => {
    expect(focusOnOpen(null, "name")).toBe(true);
    expect(focusOnOpen(null, "price")).toBe(false);
  });
  it("opens on the price, not the name, from Needs price", () => {
    expect(focusOnOpen("price", "price")).toBe(true);
    expect(focusOnOpen("price", "name")).toBe(false);
  });
  it("opens on the hours from Needs hours / Set hours, and the rate from Needs rate", () => {
    expect(focusOnOpen("hours", "hours")).toBe(true);
    expect(focusOnOpen("rate", "rate")).toBe(true);
    expect(focusOnOpen("rate", "hours")).toBe(false);
  });
  it("says why, in words a person reads, for each", () => {
    for (const why of [...Object.values(NEEDS_WHY), EXAMPLE_RATE_WHY])
      expect(why.length).toBeGreaterThan(30);
  });
});

describe("gap 1 — Materials: Needs price / Needs hours are buttons", () => {
  const page = src("pages/MaterialsLibraryPage.tsx");
  it("each label opens the editor on its own field", () => {
    expect(page).toMatch(/onClick=\{\(\) => startEditing\("price"\)\}/);
    expect(page).toMatch(/onClick=\{\(\) => startEditing\("hours"\)\}/);
  });
  it("the price and hours boxes take focus when named", () => {
    expect(page).toMatch(/autoFocus=\{focusOnOpen\(openedFor, "price"\)\}/);
    expect(page).toMatch(/autoFocus=\{focusOnOpen\(openedFor, "hours"\)\}/);
  });
  it("the reason shows as text in the editor, not as a hover title", () => {
    expect(page).toMatch(/NEEDS_WHY\[openedFor\]/);
    expect(page).not.toMatch(/title="No price yet/);
    expect(page).not.toMatch(/title="No labor unit yet/);
  });
});

describe("gap 2 — Labor rates: Needs rate / Set hours / Example rate are buttons", () => {
  const page = src("pages/LaborRatesPage.tsx");
  it("each opens the editor on the number it names, with the reason", () => {
    expect(page).toMatch(
      /openEditor\(\{ field: "rate", why: NEEDS_WHY\.rate \}\)/
    );
    expect(page).toMatch(/field: "hours", why: String\(rate\.rateError\)/);
    expect(page).toMatch(/field: "rate", why: EXAMPLE_RATE_WHY/);
  });
  it("the rate box takes focus in EVERY mode — typed rate, wage breakdown, salary", () => {
    // Found on staging: example rates open in the wage breakdown, and only
    // the plain hourly box had autoFocus, so the cursor landed nowhere.
    for (const label of [
      "Base wage per hour",
      "Hourly rate",
      "Annual salary",
    ]) {
      const at = page.indexOf(`aria-label="${label}"`);
      expect(at, label).toBeGreaterThan(-1);
      const tag = page.slice(
        page.lastIndexOf("<Input", at),
        page.indexOf("/>", at)
      );
      expect(tag, label).toMatch(
        /autoFocus=\{focusOnOpen\(openedFor, "rate"\)\}/
      );
    }
  });
  it("no rate warning explains itself only on hover", () => {
    expect(page).not.toMatch(/title="No rate yet/);
    expect(page).not.toMatch(/title="BidRidge's example loaded rate/);
  });
});

describe("gap 3 — explanations a finger can open", () => {
  it.each([
    "components/LineCost.tsx",
    "components/NotPricedTotal.tsx",
    "components/ExampleTags.tsx",
  ])("%s uses TapExplain and no hover-only title", file => {
    const s = src(file);
    expect(s).toMatch(/<TapExplain\b/);
    expect(s).not.toMatch(/\btitle=/);
  });
  it("a tap on an explanation inside a clickable row does not also open the row", () => {
    expect(src("components/TapExplain.tsx")).toMatch(
      /onClick=\{e => e\.stopPropagation\(\)\}/
    );
  });
});

describe("gap 4 — a shop can rename its own height type", () => {
  it("Settings → Heights calls the rename the server already had", () => {
    const s = src("components/HeightsSection.tsx");
    expect(s).toMatch(/trpc\.takeoffHeights\.renameType\.useMutation/);
    // Only the company's own types: a shipped name is ours.
    expect(s).toMatch(/row\.isShipped\s*\?\s*undefined/);
  });
});

describe("gap 5 — the export dialog sets the customer in place", () => {
  it("renders the client picker where it said 'not set'", () => {
    const s = src("components/AccountingExportDialog.tsx");
    expect(s).toMatch(/<ClientLinkField\b/);
    expect(s).toMatch(/accounting\.quickbooks\.invalidate/);
  });
});

describe("gap 6 — a kit names the assemblies with hours not set, with their hours box", () => {
  it("sets an assembly's hours from the kit panel", () => {
    const s = src("pages/KitsPage.tsx");
    expect(s).toMatch(/filter\(p => p\.breakdown\.hoursNotSet\)/);
    expect(s).toMatch(
      /setAssemblyHours\.mutate\(\{\s*id: p\.item\.assemblyId,\s*baseLaborHours: hours/
    );
  });
});

describe("gap 7 — the analytics 'not priced' note opens the bids it counts", () => {
  it("both panels hand the note its bids and a way to open them", () => {
    expect(src("components/analytics/OutcomesPanel.tsx")).toMatch(
      /notPricedBids=\{totals\.notPricedBidList\}\s*onOpenBid=\{onOpenBid\}/
    );
    expect(src("components/analytics/ProfitabilityPanel.tsx")).toMatch(
      /notPricedBids=\{report\.notPricedJobList\}\s*onOpenBid=\{onOpenBid\}/
    );
    expect(src("pages/AnalyticsPage.tsx")).toMatch(
      /<OutcomesPanel report=\{outcomes\} onOpenBid=\{onOpenBid\} \/>/
    );
  });
});
