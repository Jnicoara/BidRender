/**
 * What the browser tells the server about a sheet's circuits, and how the
 * server's homeruns are matched back to the circuits on screen
 * (references/homerun-footage-plan.md § 10 step 2).
 *
 * Only the browser can read the "2B-1" tags — the server keeps a page's
 * text, not where each word sits — so it sends each circuit with the device
 * its homerun leaves from. The server keeps that device only while the
 * homerun is UNCONFIRMED; a confirmed one is never re-pointed (plan § 6).
 *
 * Pure, here rather than in the page, so the suite can reach it.
 */
import type { CircuitGroup, CircuitReport } from "./circuitGroups";

export type HomerunSyncCircuit = {
  panel: string;
  circuits: number[];
  leavingStampId: number | null;
};

/**
 * The leaving device: the closest to the panel at right angles when the
 * panel is placed; otherwise the circuit's first device, so a homerun on
 * the Average method — which needs no panel spot — still has a device and
 * a sheet to leave from.
 */
export function leavingDeviceId(circuit: CircuitGroup): number | null {
  return circuit.closest?.device.id ?? circuit.devices[0]?.id ?? null;
}

export function homerunSyncPayload(
  report: CircuitReport
): HomerunSyncCircuit[] {
  return report.circuits
    .filter(c => c.devices.length > 0)
    .map(c => ({
      panel: c.panel,
      circuits: [...c.circuits],
      leavingStampId: leavingDeviceId(c),
    }));
}

/**
 * A stable string for a payload, so the page syncs only when something
 * changed — not on every render that rebuilt an equal report.
 */
export function syncSignature(
  sheetId: number,
  payload: readonly HomerunSyncCircuit[]
): string {
  return JSON.stringify([
    sheetId,
    [...payload]
      .map(c => [c.panel.toUpperCase(), c.circuits, c.leavingStampId])
      .sort((a, b) => String(a).localeCompare(String(b))),
  ]);
}

/**
 * Whether the page sends a sheet's circuits now, and whether as a RE-MATCH.
 *
 * Viewing only CREATES circuits the server has not seen; re-pointing an
 * unconfirmed homerun is a person's act — pressing Re-match, or placing a
 * panel by hand (owner, 2026-10-07). `armedSheetId` is the sheet a hand
 * placement asked to re-match.
 */
export type HomerunSyncState = {
  /** The signature last sent, so an equal report is not sent again. */
  lastSignature: string | null;
  /** The sheet a hand-placed panel armed for a re-match, if any. */
  armedSheetId: number | null;
};

/**
 * ── Why the arm carries a SHEET (fixed 2026-10-10) ──────────────────────
 * It used to be a bare "re-match on the next sync", and a sync goes out
 * only when the signature changes. The signature does not carry the
 * panel's spot, so a placement that left every leaving device the same
 * sent nothing and the arm stayed set — and the next sync of ANY sheet,
 * opened just to look at it, went out as a re-match and re-pointed that
 * sheet's unconfirmed homeruns (baseline-screen-plan.md § 9, F10). So:
 *
 *   - armed for THIS sheet: send now, as a re-match, even if the report is
 *     unchanged — the person asked for it, and the placement alone may not
 *     change the signature;
 *   - armed for ANOTHER sheet: this sheet's sync is an ordinary visit
 *     (create only). The arm is cleared by whatever sync goes out next, so
 *     it can only ever re-match the sheet the panel was placed on;
 *   - otherwise: send only a changed report, never as a re-match.
 */
export function homerunSyncStep(
  state: HomerunSyncState,
  sheetId: number,
  signature: string
): { send: boolean; rematch: boolean; next: HomerunSyncState } {
  const armedHere = state.armedSheetId === sheetId;
  if (!armedHere && signature === state.lastSignature)
    return { send: false, rematch: false, next: state };
  return {
    send: true,
    rematch: armedHere,
    next: { lastSignature: signature, armedSheetId: null },
  };
}

/**
 * The key a server homerun row matches a circuit on screen by. A two-pole
 * "2B-36,38" is stored on its FIRST circuit (the router keeps `min`), so a
 * circuit's key is its panel and its lowest number.
 */
export function homerunKey(panel: string | null, circuitNumber: number) {
  return `${(panel ?? "").toUpperCase()}-${circuitNumber}`;
}

/**
 * "Confirm all on this sheet" takes only homeruns whose method guessed
 * NOTHING (plan § 6): Average, or Measured to a panel placed by its printed
 * label. A panel placed by a tap, or a minimum, is the estimator's to look
 * at one by one — and an unconfirmed homeruns still counts meanwhile.
 */
export function confirmableHomeruns(
  rows: readonly {
    circuitId: number;
    panelName: string | null;
    sheetId: number | null;
    method: { method: string };
    footage: { state: string; confirmed?: boolean };
  }[],
  sheetId: number,
  labelledPanels: readonly string[]
): number[] {
  const labelled = new Set(labelledPanels.map(p => p.toUpperCase()));
  return rows
    .filter(
      r =>
        r.sheetId === sheetId &&
        r.footage.state === "computed" &&
        r.footage.confirmed === false &&
        (r.method.method === "average" ||
          (r.method.method === "measured" &&
            labelled.has((r.panelName ?? "").toUpperCase())))
    )
    .map(r => r.circuitId);
}

export function homerunKeyForCircuit(circuit: {
  panel: string;
  circuits: readonly number[];
}) {
  return homerunKey(circuit.panel, Math.min(...circuit.circuits));
}
