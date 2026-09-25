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

/*
  ── Moved from the pricing sheet, 2026-09-25 ───────────────────────────────
  Cable is sold BY THE FOOT here, like every other cable in the catalog. The
  sheet had all of these as "each", which prices a 1000 ft box as one foot.
*/
const cable = (name: string, slang: string): BaselineMaterial => ({
  ...lv("foot"),
  name,
  searchAliases: aliases(slang),
});
const part = (name: string, slang: string): BaselineMaterial => ({
  ...lv("each"),
  name,
  searchAliases: aliases(slang),
});
const lvFromSheet: BaselineMaterial[] = [
  cable("18/5 control wire", "18-5 18 gauge thermostat hvac five conductor"),
  cable("18/8 control wire", "18-8 18 gauge thermostat hvac eight conductor"),
  cable("22/2 security cable", "22-2 alarm burglar sensor contact cl2"),
  cable("22/4 security cable", "22-4 alarm burglar keypad cl2"),
  cable("Cat5e cable", "cat 5e cat5 ethernet data network utp lan"),
  cable("Cat6 shielded cable", "cat 6 stp ftp ethernet data network"),
  // "Cat6A" is its own row now; the Cat6 cable no longer answers to it.
  cable("Cat6A cable", "cat 6a 10g ethernet data network augmented"),
  cable("Fiber optic cable", "fibre single mode multimode om3 om4 os2"),
  cable("RG11 coax cable", "rg-11 coaxial tv satellite long run trunk"),
  cable("Security camera cable", "siamese rg59 power video cctv"),
  part("Cat5e jack", "cat 5e keystone rj45 insert data network"),
  part("Cat6A jack", "cat 6a keystone rj45 insert data network"),
  part("Cat5e patch panel", "cat 5e rack 24 port 48 port punch down"),
  part("Fiber patch panel", "fibre enclosure lgx splice tray rack"),
  part("Patch panel blank", "rack filler 1u cover"),
  part("Cat6 patch cord, 3 ft", "cat 6 jumper ethernet rj45 lead"),
  part("Cat6 patch cord, 7 ft", "cat 6 jumper ethernet rj45 lead"),
  part("Network rack, wall mount", "data cabinet 19 inch swing gate"),
  part("Rack shelf", "cantilever tray 19 inch 1u 2u"),
  part("Horizontal cable manager", "rack 1u 2u d-ring finger duct"),
  part("Vertical cable manager", "rack upright finger duct"),
  part("D-ring cable guide", "backboard wall ring cable management"),
  part("Hook-and-loop cable strap", "velcro wrap tie reusable bundle"),
  part("Structured media enclosure", "smc media panel can recessed"),
  part("NVR enclosure", "camera recorder cabinet security"),
  part("Keystone wall plate, 1-port", "data cover faceplate jack"),
  part("Keystone wall plate, 2-port", "data cover faceplate jack"),
  part("Keystone wall plate, 4-port", "data cover faceplate jack"),
  part("Keystone wall plate, 6-port", "data cover faceplate jack"),
  part("Coax wall plate", "f connector tv cover faceplate"),
  part("HDMI wall plate", "av tv cover faceplate"),
  part("Speaker wall plate", "binding post banana audio cover faceplate"),
  part("Thermostat wall plate", "tstat cover blank adapter"),
  part("Keypad mounting plate", "alarm security keypad backbox"),
  part("Coax splitter", "2 way 3 way 4 way tv"),
  part("Coax amplifier", "distribution amp signal booster tv"),
  part("Coax ground block", "grounding block bond tv satellite"),
  part("In-ceiling speaker", "recessed audio 6.5 8 inch"),
  part("Volume control", "speaker impedance wall audio knob"),
  part("Security camera, bullet", "cctv ip poe outdoor"),
  part("Security camera, dome", "cctv ip poe ceiling"),
  part("Doorbell button", "push button bell chime"),
  part("Lighted doorbell button", "push button bell chime illuminated"),
  part("Doorbell chime, wired", "bell ding dong"),
  part("Doorbell chime, wireless", "bell ding dong plug in"),
  part("Doorbell diode", "ring nest video bypass chime"),
  part("Video doorbell", "ring nest smart camera"),
  part("Video doorbell chime kit", "ring nest power adapter kit"),
  part("Chime extender kit", "wireless bell extender"),
];

export const LOW_VOLTAGE: BaselineMaterial[] = [
  {
    ...lv("foot"),
    name: "Cat6 cable",
    searchAliases: aliases(
      // No "cat6a" since 2026-09-25: Cat6A cable is its own row.
      "cat 6 ethernet data network utp riser plenum blue lan"
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
  ...lvFromSheet,
];
