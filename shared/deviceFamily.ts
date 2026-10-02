/**
 * Which FAMILY of device a count is, and so which SHAPE its pins are —
 * computed from names, nothing stored (references/track-b-count-pin-styles-plan.md
 * § 2, decision 2).
 *
 * ── The item first, then the assembly, then the category ────────────────────
 * Several captured items can share one assembly, and each is its own count
 * (shared/assemblyCounts.ts). Shape used to come from the assembly's CATEGORY
 * alone, so a duplex and a switch on one "Devices" assembly were both circles
 * and three lights on one assembly were three identical shapes. So the
 * count's own name decides first; the assembly's name and then its category
 * are defaults for a count whose name says nothing ("Kitchen", "Type 4").
 *
 * This departs from § 2's text, which put a specific category first. The
 * reason: § 11.4 makes the ITEM the thing a pin follows, and the cases where
 * the category would rightly win ("LED flat panel" in Lighting) are caught by
 * ordering the words below rather than by distrusting the name.
 *
 * ── Shape is the family's, always ───────────────────────────────────────────
 * Three lights are three squares (§ 11.4): shape says "lighting", and the
 * letter and colour (shared/pinLetters.ts) say which light. A chosen shape
 * (Track A's `markShape` columns, plan § 12) will override this; until then
 * this is the whole answer.
 */
import type { MarkShape } from "./takeoffMarks";

export const DEVICE_FAMILIES = [
  "receptacle",
  "box",
  "switch",
  "lighting",
  "data",
  "equipment",
  "other",
] as const;
export type DeviceFamily = (typeof DEVICE_FAMILIES)[number];

/** Plan § 2's map. Fire alarm, security and anything unknown share the hexagon. */
export const FAMILY_SHAPE: Record<DeviceFamily, MarkShape> = {
  receptacle: "circle",
  box: "circle",
  switch: "diamond",
  lighting: "square",
  data: "triangle",
  equipment: "rect",
  other: "hexagon",
};

/**
 * What an assembly category says, when no name does. Devices is the vague one
 * — receptacles AND switches — so it only says "circle-ish device", which is
 * the receptacle family's shape.
 */
export const CATEGORY_FAMILY: Record<string, DeviceFamily> = {
  Devices: "receptacle",
  Lighting: "lighting",
  Panels: "equipment",
  "Equipment Connections": "equipment",
  "Low Voltage/EMS": "data",
};

/**
 * Words → family, ORDER MATTERS, most specific first. Each line says why it
 * sits where it does when that is not obvious.
 */
const FAMILY_WORDS: readonly (readonly [RegExp, DeviceFamily])[] = [
  // A safety switch is equipment, not a wall switch — before "switch".
  [
    /\b(disconnect|safety switch|fused switch|non-fused|nonfused)\b/,
    "equipment",
  ],
  // A lighting PANEL is a panelboard — before the lighting words.
  [
    /\b(lighting panel|panelboard|panel board|load ?center|switchboard|switchgear|transformer|mdp)\b/,
    "equipment",
  ],
  // "Light switch" is a switch — before the lighting words.
  [
    /\b(switch|switches|dimmer|3[- ]?way|4[- ]?way|thermostat|occupancy|vacancy|timer|motion sensor|keypad)\b/,
    "switch",
  ],
  [
    /\b(smoke|heat detector|horn|strobe|pull station|fire alarm|co detector|camera|card reader|security)\b/,
    "other",
  ],
  [
    /\b(data|voice|phone|telephone|telecom|cat ?5e?|cat ?6a?|wap|access point|tv|catv|coax|low voltage)\b/,
    "data",
  ],
  [/\b(junction|j-box|jbox|j box|pull box)\b/, "box"],
  [
    /\b(receptacles?|recep|duplex|gfci|gfi|outlets?|plugs?|usb|quad|floor box|range|dryer)\b/,
    "receptacle",
  ],
  // "LED flat panel" is a light — before the bare "panel" below.
  [
    /\b(flat panel|panel light|lights?|lighting|luminaires?|fixtures?|troffers?|linear|downlights?|can light|recessed|pendants?|sconces?|exit|emergency|bug[- ]?eye|high ?bay|strip light|wall ?pack|flood ?light)\b/,
    "lighting",
  ],
  [
    /\b(panel|motor|rtu|ahu|hvac|condenser|furnace|water heater|mechanical|equipment)\b/,
    "equipment",
  ],
];

/** The family a name says, or null when it says nothing. */
export function familyFromName(
  name: string | null | undefined
): DeviceFamily | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [pattern, family] of FAMILY_WORDS)
    if (pattern.test(lower)) return family;
  return null;
}

/**
 * The family of one count: its own name, then its assembly's name, then its
 * assembly's category, else "other" (the hexagon — the letter separates it).
 */
export function deviceFamily(count: {
  label: string;
  assemblyName?: string | null;
  assemblyCategory?: string | null;
}): DeviceFamily {
  return (
    familyFromName(count.label) ??
    familyFromName(count.assemblyName) ??
    (count.assemblyCategory
      ? CATEGORY_FAMILY[count.assemblyCategory]
      : undefined) ??
    "other"
  );
}
