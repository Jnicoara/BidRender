/**
 * Low voltage — structured cabling, coax, audio, controls and landscape.
 *
 * ── Why these carry trade: "low-voltage" ─────────────────────────────────────
 * The same contractor often pulls both, but this is a different trade's
 * material list: an electrical estimator scrolling for a receptacle should not
 * be wading through Cat6 jacks, and a low-voltage bid should not inherit 200
 * rows of rigid conduit. `materials.trade` is the same open varchar the
 * assemblies use, so this is content rather than a migration — and it is the
 * first non-electrical content the catalog has carried, which is exactly the
 * shape a plumbing or HVAC list would take later.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const lv = (unitOfSale: "each" | "foot") => ({
  unitOfSale,
  costPerUnit: UNPRICED,
  category: "Low Voltage" as const,
  trade: "low-voltage",
});

export const LOW_VOLTAGE: BaselineMaterial[] = [
  {
    ...lv("foot"),
    name: "Cat6 cable",
    searchAliases: aliases(
      "cat 6 cat6a ethernet data network utp riser plenum blue lan"
    ),
  },
  {
    ...lv("each"),
    name: "Cat6 jack",
    searchAliases: aliases(
      "cat 6 keystone rj45 insert data network outlet punch down"
    ),
  },
  {
    ...lv("each"),
    name: "Cat6 patch panel",
    searchAliases: aliases(
      "cat 6 rack 24 port 48 port data network punch down idf mdf"
    ),
  },
  {
    ...lv("foot"),
    name: "RG6 coax cable",
    searchAliases: aliases(
      "rg-6 coaxial tv cable satellite catv quad shield video"
    ),
  },
  {
    ...lv("each"),
    name: "Coax F connector",
    searchAliases: aliases(
      "rg6 rg-6 compression crimp fitting tv satellite video end"
    ),
    defaultQty: 2,
  },
  {
    ...lv("foot"),
    name: "16/2 speaker wire",
    searchAliases: aliases(
      "16-2 16 gauge audio in wall cl2 cl3 two conductor sound"
    ),
  },
  {
    ...lv("foot"),
    name: "14/2 speaker wire",
    searchAliases: aliases(
      "14-2 14 gauge audio in wall cl2 cl3 two conductor sound"
    ),
  },
  {
    ...lv("foot"),
    name: "18/2 control wire",
    searchAliases: aliases(
      "18-2 18 gauge thermostat bell doorbell signal class 2 two conductor"
    ),
  },
  {
    ...lv("foot"),
    name: "18/4 control wire",
    searchAliases: aliases(
      "18-4 18 gauge thermostat signal class 2 four conductor hvac"
    ),
  },
  {
    ...lv("foot"),
    name: "Landscape lighting cable",
    searchAliases: aliases(
      "low voltage direct burial 12/2 14/2 outdoor yard garden buried"
    ),
  },
  {
    ...lv("each"),
    name: "Landscape light fixture",
    searchAliases: aliases(
      "path spot well up light uplight in-grade ingrade garden yard exterior 12v mr16"
    ),
  },
  ...["150W", "300W", "600W"].map(watts => ({
    ...lv("each"),
    name: `${watts} landscape transformer`,
    searchAliases: aliases(
      watts.replace("W", " watt"),
      "low voltage 12v 15v multi tap outdoor yard garden xfmr power supply"
    ),
  })),
];
