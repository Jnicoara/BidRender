/**
 * Rows the catalog reality check of 2026-10-09 ADDS — the decisions are
 * shared/catalogRealityCheck20261009.ts (renames, retirements, search
 * words) and references/catalog-reality-check-build.md (every call made).
 *
 * New rows only. A row renamed in place keeps its module and its id; this
 * file is for what did not exist before:
 *   - the 37 panel-table rows nothing was renamed into;
 *   - single-size crimp lugs the range rows were split into (the range row
 *     itself became its largest size, in place);
 *   - the second fire-alarm battery and control panel the split names;
 *   - the two reducing-washer pairs beside the renamed set;
 *   - two labels for the CW3 and CW11 starters (owner).
 * Every row ships unpriced, like every shipped row.
 */
import { NEW_PANEL_ROWS } from "../../../shared/catalogRealityCheck20261009";
import { UNPRICED, aliases, type BaselineMaterial } from "./types";

const each = (
  category: BaselineMaterial["category"]
): Pick<BaselineMaterial, "unitOfSale" | "costPerUnit" | "category"> => ({
  unitOfSale: "each",
  costPerUnit: UNPRICED,
  category,
});

const PANEL_WORDS = "load center loadcenter breaker box panelboard";

/** The 37 new single-phase load centers (panel table B). */
const NEW_PANELS: BaselineMaterial[] = NEW_PANEL_ROWS.map(row => ({
  ...each("Panels"),
  name: row.name,
  searchAliases: aliases(
    `${row.amps} amp ${row.spaces} space ${row.spaces} circuit`,
    PANEL_WORDS,
    row.main === "main-lug"
      ? "mlo subpanel sub-panel sub panel remote no main"
      : "service main breaker mb",
    row.where === "outdoor"
      ? "nema 3r exterior raintight rainproof"
      : "nema 1 interior"
  ),
  description:
    row.main === "main-lug"
      ? "Main-lug only — fed from an upstream breaker, with no main of its own."
      : undefined,
}));

const LUG_WORDS =
  "compression terminal ring one hole copper barrel feeder gauge";

/** Single-size crimp lugs (batch 1 and batch 2, devices). */
const NEW_LUGS: BaselineMaterial[] = [
  // #3 and #4 match the starters' own conductors (owner call 3, batch 2;
  // the transformer starter's #4 bare ground, batch 1).
  { name: "#8 AWG crimp lug", slang: "8ga" },
  { name: "#4 AWG crimp lug", slang: "4ga" },
  { name: "#3 AWG crimp lug", slang: "3ga" },
  { name: "#1 AWG crimp lug", slang: "1ga" },
  { name: "2/0 AWG crimp lug", slang: "aught ought service" },
  { name: "3/0 AWG crimp lug", slang: "aught ought service" },
  { name: "250 kcmil crimp lug, single size", slang: "mcm service" },
].map(({ name, slang }) => ({
  ...each("Connectors & Terminations"),
  name,
  searchAliases: aliases(slang.toLowerCase(), LUG_WORDS),
}));

const NEW_OTHERS: BaselineMaterial[] = [
  {
    ...each("Life Safety"),
    name: "12V 18Ah fire alarm battery",
    searchAliases: aliases("sla sealed lead acid facp standby"),
  },
  {
    ...each("Life Safety"),
    name: "Addressable fire alarm control panel",
    searchAliases: aliases("facp slc head end fa"),
  },
  {
    ...each("Conduit Fittings"),
    name: 'Reducing washer, 1" to 1/2"',
    searchAliases: aliases("reducer knockout ko step down enclosure hole pair"),
  },
  {
    ...each("Conduit Fittings"),
    name: 'Reducing washer, 1" to 3/4"',
    searchAliases: aliases("reducer knockout ko step down enclosure hole pair"),
  },
  // The labels CW3 and CW11 name (owner, 2026-10-09). Beside "Arc flash
  // label" and "Panel directory label".
  {
    ...each("Consumables"),
    name: "Emergency disconnect label",
    searchAliases: aliases(
      "sticker placard 230.85 service disconnect outdoor first responder"
    ),
  },
  {
    ...each("Consumables"),
    name: "EV-ready label",
    searchAliases: aliases(
      "sticker placard ev capable electric vehicle charging future conduit stub"
    ),
  },
];

export const REALITY_CHECK_ADDS: BaselineMaterial[] = [
  ...NEW_PANELS,
  ...NEW_LUGS,
  ...NEW_OTHERS,
];
