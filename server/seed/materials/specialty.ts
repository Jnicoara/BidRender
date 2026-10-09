/**
 * SPECIALTY — shipped rows that stay in the catalog but sort AFTER everyday
 * items in the material picker and every material search (0140).
 *
 * The owner's catalog review, 2026-10-08: 108 rows in 25 groups,
 * references/catalog-review-2026-10-08.md § SPECIALTY, taken exactly as the
 * check listed them. Nothing here is deleted or hidden, and the starters that
 * use some of them (CS9, CS10, GC3, RS16, MH10, MH11, LT31, LT32) are
 * unchanged: they price from the same rows, which the picker just shows
 * lower down.
 *
 * By NAME, and every name must be shipped — server/catalogReview20261008
 * .test.ts fails on one that is not, so a later rename cannot silently drop
 * a row's tag. The near misses the check did NOT tag (fire alarm battery,
 * pole handhole cover and arm, the 480V transformers, 400A panels, …) stay
 * everyday until the owner says otherwise.
 */

const CANLESS_SIZES = ['2"', '3"', '5"', '8"'];
const CANLESS_VARIANTS = [
  "",
  ", CCT selectable",
  ", gimbal",
  ", slim",
  ", wet rated",
];
const CAN_TYPES = [
  "new construction IC",
  "new construction non-IC",
  "remodel IC",
  "remodel non-IC",
  "airtight shallow",
  "sloped ceiling",
];

export const SPECIALTY_MATERIALS: readonly string[] = [
  // 1/0 and 2/0 bare copper
  "1/0 bare stranded Copper",
  "2/0 bare stranded Copper",
  // Large Sch 80 sweeps: 2-1/2" to 4" (the check's reading of "large")
  ...['2-1/2"', '3"', '4"'].flatMap(size =>
    [90, 45].flatMap(angle =>
      [24, 36].map(
        radius => `${size} PVC Sch 80 ${angle}-degree sweep, ${radius}" radius`
      )
    )
  ),
  // 2-1/2" to 4" rigid conduit bodies
  ...['2-1/2"', '3"', '4"'].flatMap(size =>
    ["LB", "T", "LL", "LR", "C"].map(
      shape => `${size} rigid conduit ${shape} conduit body`
    )
  ),
  // Busway, cable tray, under-carpet cable
  "Busway",
  "Busway elbow",
  "Cable tray",
  "Cable tray elbow",
  "Cable tray tee",
  "Cable tray support bracket",
  "Under-carpet flat cable",
  // Power poles and furniture whips
  "Tele-power pole, 10 ft",
  "Tele-power pole, 15 ft",
  "Power pole fitting kit",
  "Modular furniture whip, 6 ft",
  "Modular furniture whip, 10 ft",
  // Fire alarm panels and modules
  "Fire alarm control panel",
  "Addressable module",
  "Fire alarm relay module",
  "Fire alarm remote annunciator",
  // Low voltage
  "RG11 coax cable Copper",
  "Fiber optic cable",
  "Fiber patch panel",
  "NVR enclosure",
  "HDMI wall plate",
  // Light poles, pole bases, anchor bolts
  "12 ft light pole",
  "20 ft light pole",
  "30 ft light pole",
  "Pole anchor bolt kit",
  "Concrete pole base",
  "Pole base cover",
  "Pole base grout",
  // Exothermic weld, snow melt
  "Exothermic weld mold",
  "Exothermic weld powder",
  "Snow melt controller",
  // Well pump parts
  "12/2 submersible pump cable Copper",
  "Well pump control box",
  "Well pump pressure switch",
  "Well pump pitless adapter",
  "Submersible pump splice kit",
  // Commercial and industrial gear
  "480V 3-phase panelboard",
  "Current transformer cabinet",
  "Variable frequency drive",
  "Combination motor starter",
  "Motor starter, size 0",
  "Motor starter, size 1",
  "Motor starter, size 2",
  "400A fused disconnect",
  "600A fused disconnect",
  "400A cartridge fuse",
  "600A cartridge fuse",
  // 2", 3", 5", 8" canless, every variant
  ...CANLESS_SIZES.flatMap(size =>
    CANLESS_VARIANTS.map(v => `${size} canless wafer LED downlight${v}`)
  ),
  // 3" and 5" can shells, every type
  ...['3"', '5"'].flatMap(size =>
    CAN_TYPES.map(type => `${size} recessed can, ${type}`)
  ),
];
