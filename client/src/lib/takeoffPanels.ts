/**
 * takeoffPanels — which of the viewer's side panels are open, and focus mode.
 *
 * ── Why this is a module and not three useStates ─────────────────────────────
 * Because "open" is not one fact. Focus mode collapses both panels and has to
 * put them BACK the way they were, which means the remembered arrangement and
 * the arrangement on screen are different things. Written inline that becomes
 * four booleans that can disagree, and the way it fails is that a panel never
 * comes back — the user presses the key again and half their screen is gone
 * for the rest of the session.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 * **A new user starts with both panels open.** Remembering the choice is
 * right; defaulting to the collapsed end of it is not. Someone seeing this
 * screen for the first time has to be shown what is there before they can
 * decide to hide it, and a bare drawing with two chevrons teaches nothing
 * about sheets, layers, the legend or the counted-items list.
 *
 * **Toggling a panel by hand leaves focus mode.** Focus mode means "both away";
 * asking for one of them back is asking for something else, and the state has
 * to say so or the next press of the focus key would restore an arrangement
 * the user has already moved on from.
 *
 * **Focus mode is remembered too.** Somebody who works in it all day should not
 * have to re-enter it for every bid. The first-run default above is what
 * protects the new user; there is nothing left to protect once somebody has
 * chosen.
 */

export type PanelKey = "sheets" | "work";

export type PanelState = {
  /** The documents and sheet list, on the left. */
  sheets: boolean;
  /** Counted items, the reader, layers and the legend, on the right. */
  work: boolean;
  /**
   * What to put back when focus mode ends — and the flag that says it is on.
   *
   * Null means focus mode is off. Holding the arrangement here rather than in
   * a separate "was open" pair is what makes it impossible to be in focus mode
   * with nothing to return to.
   */
  focusRestore: { sheets: boolean; work: boolean } | null;
  /** How wide each panel is when open, in CSS pixels. */
  sheetsWidth: number;
  workWidth: number;
};

/** What a dragged panel width is held between. */
export const PANEL_LIMITS = {
  sheets: { min: 180, max: 420, default: 240 },
  work: { min: 280, max: 620, default: 400 },
} as const;

/** What somebody sees the first time, before they have chosen anything. */
export const PANELS_DEFAULT: PanelState = {
  sheets: true,
  work: true,
  focusRestore: null,
  sheetsWidth: 240,
  workWidth: 400,
};

/**
 * Where the choice is kept.
 *
 * Per browser rather than per account, like the plan reader's auto-read: how
 * much screen to give the drawing is a fact about the machine in front of you,
 * and a laptop in a truck and a monitor at the office want different answers.
 */
export const PANELS_STORAGE_KEY = "bidrender.takeoff.panels";

export function isFocusMode(state: PanelState): boolean {
  return state.focusRestore !== null;
}

/** Is this panel actually on screen right now? */
export function panelIsOpen(state: PanelState, key: PanelKey): boolean {
  return state[key];
}

/**
 * Open or close one panel.
 *
 * Leaves focus mode, because focus mode is a claim about both panels and this
 * is a decision about one. The arrangement focus was holding is discarded
 * rather than merged: it describes a moment the user has just left.
 */
export function togglePanel(state: PanelState, key: PanelKey): PanelState {
  return { ...state, [key]: !state[key], focusRestore: null };
}

/** A panel was dragged. Width is remembered even while it is folded away. */
export function setPanelWidth(
  state: PanelState,
  key: PanelKey,
  width: number
): PanelState {
  const limits = PANEL_LIMITS[key];
  const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(width)));
  return key === "sheets"
    ? { ...state, sheetsWidth: clamped }
    : { ...state, workWidth: clamped };
}

/**
 * Focus mode on, or off again — the same call both ways.
 *
 * One key on, same key off, because mid-takeoff the point is to get the most
 * drawing without hunting for two separate chevrons, and to get it all back
 * the same way.
 */
export function toggleFocus(state: PanelState): PanelState {
  if (state.focusRestore) {
    return { ...state, ...state.focusRestore, focusRestore: null };
  }
  return {
    ...state,
    sheets: false,
    work: false,
    focusRestore: { sheets: state.sheets, work: state.work },
  };
}

/**
 * Read the remembered arrangement, falling back to both open.
 *
 * Anything unreadable — absent, corrupt, written by an older version, or a
 * browser that refuses storage — is the same answer as never having chosen:
 * show the new user everything. A parse failure must not open the screen in a
 * state nobody asked for.
 */
export function parsePanelState(raw: string | null): PanelState {
  if (!raw) return PANELS_DEFAULT;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return PANELS_DEFAULT;
    const record = value as Record<string, unknown>;
    const restore = record.focusRestore;
    return {
      sheets: readFlag(record.sheets),
      work: readFlag(record.work),
      focusRestore:
        restore && typeof restore === "object"
          ? {
              sheets: readFlag((restore as Record<string, unknown>).sheets),
              work: readFlag((restore as Record<string, unknown>).work),
            }
          : null,
      sheetsWidth: readWidth(record.sheetsWidth, "sheets"),
      workWidth: readWidth(record.workWidth, "work"),
    };
  } catch {
    return PANELS_DEFAULT;
  }
}

/** Anything that is not the boolean `false` means open — see PANELS_DEFAULT. */
function readFlag(value: unknown): boolean {
  return value !== false;
}

/**
 * A stored width, clamped to what is usable today.
 *
 * Clamped on the way IN as well as on the way out, because the limits can
 * change between versions and a width stored under the old ones would
 * otherwise come back as a panel that cannot be dragged back into range.
 */
function readWidth(value: unknown, key: PanelKey): number {
  const limits = PANEL_LIMITS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return limits.default;
  }
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export function serialisePanelState(state: PanelState): string {
  return JSON.stringify(state);
}
