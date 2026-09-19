/**
 * Layers: which marks and runs are showing right now.
 *
 * ── Two axes, deliberately not one list ──────────────────────────────────────
 * SYSTEM is what a thing IS — a duplex receptacle is "Devices" on every job,
 * forever, and that travels with the library assembly. LOCATION is where a
 * particular one SITS, tagged on the placed item because the same receptacle
 * is in a wall on one job and a ceiling on another.
 *
 * Collapsing them into one checklist would force a false choice between "show
 * me the devices" and "show me the underground", when the useful question is
 * usually both at once. So they filter independently and combine — see
 * ASSEMBLIES_PLAN.md § LAYERS.
 *
 * ── Absent is a layer, not a hiding place ────────────────────────────────────
 * An item with no Location tagged yet gets its own band rather than being
 * quietly excluded or quietly always-shown. Anything that can be filtered has
 * to be visible in the filter, or a user turns off two boxes and cannot work
 * out why their count dropped by more than those two.
 *
 * ── Runs are on the System axis too, and a TYPE is the finer answer ─────────
 * A traced run has no assembly and so no Category. It still has to be
 * filterable alongside everything else on the sheet, so conduit and cable get
 * their own System keys. One checklist covers the sheet; nothing on it is
 * unreachable.
 *
 * Once a run has a TYPE, that is what it is — `1/2" EMT, 2 #12 + ground`, not
 * "a conduit run" — so the type's name is its System key and the sheet filters
 * by the thing an estimator actually asks for: show me the half-inch homeruns.
 * This is the same axis answering more precisely, not a third axis: System has
 * always meant "what is this", and a type is a better answer to that question
 * than a raceway kind is.
 *
 * A run traced before types existed has no type, so it keeps the coarse key
 * and stays visible in the checklist. Dropping it into a types-only list would
 * hide work nobody could then find, which is what the "absent is a layer"
 * rule above exists to prevent.
 */

/** Everything with no Location tagged. A real band, not a fallback. */
export const UNASSIGNED_LOCATION = "__unassigned__";

/** System keys a traced run falls under, by its raceway type. */
export const RUN_SYSTEM_KEYS = {
  conduit: "Conduit runs",
  cable: "Cable runs",
} as const;

/** A layer the checklist can toggle. */
export type LayerKey = string;

/** One row of the checklist: what, how many, and what colour it is drawn in. */
export type LayerEntry = {
  key: LayerKey;
  count: number;
  /** Null when nothing on the sheet claims a colour for this band. */
  color: string | null;
};

/** What is currently switched on. Absent from the set means hidden. */
export type LayerState = {
  systems: Set<LayerKey>;
  locations: Set<LayerKey>;
};

/** The two facts any placed thing carries for filtering. */
export type LayeredItem = {
  systemKey: LayerKey;
  /** Null when the user has not tagged it — filtered as UNASSIGNED_LOCATION. */
  location: string | null;
  /**
   * The colour this thing is ALREADY drawn in, when it has one.
   *
   * A layer swatch is a legend, and a legend that disagrees with the drawing
   * is worse than none — it teaches a code the sheet does not use. So a run
   * type hands over the colour `runAppearance` gives its lines rather than
   * letting `layerColor` hash a different one out of the label.
   *
   * Optional because most layers have no colour of their own: a mark Category
   * is not drawn in one, so it falls back to the hash, which at least keeps
   * one Category the same colour everywhere.
   */
  systemColor?: string | null;
};

/** The System key for a stamp: its assembly's Category at drop time. */
export function systemKeyForStamp(assemblyCategory: string | null): LayerKey {
  // A stamp whose assembly predates category snapshotting, or whose assembly
  // is gone, still needs somewhere to live — and somewhere VISIBLE, so it can
  // be turned off deliberately rather than disappearing without explanation.
  return assemblyCategory?.trim() ? assemblyCategory : "Uncategorised";
}

/**
 * The System key for a traced run: its type's name, or the raceway kind.
 *
 * The name rather than the id, because a key is what the checklist SHOWS and
 * two runs of one type must land in one band. Two types with identical names
 * would merge — which is right, since a person cannot tell them apart either.
 */
export function systemKeyForRun(
  pathType: "conduit" | "cable",
  typeName?: string | null
): LayerKey {
  const named = typeName?.trim();
  return named ? named : RUN_SYSTEM_KEYS[pathType];
}

/** The Location key for anything placed. */
export function locationKeyOf(location: string | null): LayerKey {
  return location?.trim() ? location : UNASSIGNED_LOCATION;
}

/**
 * Every layer actually present on a sheet, with how many things are in it.
 *
 * Built from what is there rather than from the full vocabulary: a checklist
 * offering six Locations when the sheet only uses two is six rows of noise, and
 * the two that matter are harder to find among them.
 */
export function layersPresent(items: LayeredItem[]): {
  systems: LayerEntry[];
  locations: LayerEntry[];
} {
  const systems = new Map<LayerKey, number>();
  const systemColors = new Map<LayerKey, string>();
  const locations = new Map<LayerKey, number>();

  for (const item of items) {
    systems.set(item.systemKey, (systems.get(item.systemKey) ?? 0) + 1);
    // First one wins. Every item in a band should agree — they are the same
    // type — and if two ever disagreed, picking one quietly beats a swatch
    // that changes colour depending on which run was traced last.
    const own = item.systemColor?.trim();
    if (own && !systemColors.has(item.systemKey)) {
      systemColors.set(item.systemKey, own);
    }
    const locationKey = locationKeyOf(item.location);
    locations.set(locationKey, (locations.get(locationKey) ?? 0) + 1);
  }

  const toList = (map: Map<LayerKey, number>, colors?: Map<LayerKey, string>) =>
    Array.from(map.entries()).map(([key, count]) => ({
      key,
      count,
      color: colors?.get(key) ?? null,
    }));

  return {
    systems: toList(systems, systemColors),
    locations: toList(locations),
  };
}

/** Every layer on, which is the state a sheet opens in. */
export function allLayersOn(items: LayeredItem[]): LayerState {
  const present = layersPresent(items);
  return {
    systems: new Set(present.systems.map(s => s.key)),
    locations: new Set(present.locations.map(l => l.key)),
  };
}

/**
 * Whether one item is showing.
 *
 * BOTH axes must pass — that is what "independently toggleable and combining"
 * means in practice. An item in a hidden System stays hidden however its
 * Location is set, and vice versa.
 */
export function isVisible(item: LayeredItem, state: LayerState): boolean {
  if (!state.systems.has(item.systemKey)) return false;
  return state.locations.has(locationKeyOf(item.location));
}

/** Filter any collection of placed things by the current layer state. */
export function filterByLayers<T extends LayeredItem>(
  items: T[],
  state: LayerState
): T[] {
  return items.filter(item => isVisible(item, state));
}

/**
 * Toggle one layer, returning a new state.
 *
 * Pure rather than mutating, so a component can hold it in state and React
 * actually notices the change — a mutated Set is the same object and re-renders
 * nothing, which reads as the checkbox being broken.
 */
export function toggleLayer(
  state: LayerState,
  axis: "systems" | "locations",
  key: LayerKey
): LayerState {
  const next = new Set(state[axis]);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return axis === "systems"
    ? { systems: next, locations: state.locations }
    : { systems: state.systems, locations: next };
}

/** Turn every layer on one axis on or off at once. */
export function setAxis(
  state: LayerState,
  axis: "systems" | "locations",
  keys: LayerKey[],
  on: boolean
): LayerState {
  const next = on ? new Set(keys) : new Set<LayerKey>();
  return axis === "systems"
    ? { systems: next, locations: state.locations }
    : { systems: state.systems, locations: next };
}

/** Whether anything is filtered out — drives the "showing a subset" warning. */
export function isFiltered(items: LayeredItem[], state: LayerState): boolean {
  return filterByLayers(items, state).length !== items.length;
}

/**
 * ── There is no `layerColor` any more, and the hash it used is gone ─────────
 *
 * A stable colour was hashed out of each layer's key, so a band kept its
 * colour as others came and went. That was fine while no band's colour MEANT
 * anything. It stopped being fine the moment a run type's band started wearing
 * the colour its lines are drawn in, because the panel then held two kinds of
 * swatch that look identical and say opposite things — one is a legend for the
 * sheet, the other is decoration.
 *
 * It was not theoretical. Measured in the running app on 2026-09-19, the
 * hashed "Uncategorised" band came out #F472B6 — the exact pink of the
 * `1/2" EMT, 2 #12 + ground` band two rows below it. One colour, two meanings,
 * in a list whose whole job is saying which is which. Four of the eight hashed
 * colours were in `MARK_COLORS` too, so this was going to keep happening.
 *
 * Reshuffling the palette would only have made collisions rarer, and a rare
 * wrong legend is worse than a frequent one because nobody is looking for it.
 * So: **a band shows a colour only when it HAS one on the drawing.** Everything
 * else gets a neutral chip, which is honest — that band is not a colour on the
 * sheet, and pretending otherwise was the whole fault.
 *
 * See `CLAUDE.md` § "A fix can manufacture the fault another fix was for".
 */

/** How a layer key reads in the checklist. */
export function layerLabel(key: LayerKey): string {
  return key === UNASSIGNED_LOCATION ? "Not tagged" : key;
}
