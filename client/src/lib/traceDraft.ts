/**
 * Protecting trace work in progress.
 *
 * ── Why a local copy at all, when the server autosaves ───────────────────────
 * Tracing a run is minutes of careful clicking, and there is a window the
 * server cannot cover: between two autosaves, and before the first one lands.
 * A crash, a closed tab or a dropped connection in that window loses work the
 * user cannot reconstruct — they would have to re-trace from memory against a
 * drawing that gives no clue where they had got to.
 *
 * So the points are mirrored into localStorage on every click, which costs
 * nothing and survives a reload, a crash and an offline moment. The server copy
 * is the durable one; this is the crash mat under it.
 *
 * ── Keyed per sheet, not globally ────────────────────────────────────────────
 * Two sheets can each hold an unfinished trace. A single "current draft" slot
 * would have one silently overwrite the other on switching sheets, which is
 * exactly the kind of quiet loss this exists to prevent.
 */
import type { PagePoint } from "@shared/takeoffGeometry";
import type { RunPathType } from "@shared/takeoffQuantities";

// Still `helixbid:`, the product's old name, on purpose: a browser may hold an
// unsent draft under this key, and a renamed key would never find it.
const KEY_PREFIX = "helixbid:trace-draft:";

/** How long a stranded draft stays offerable before it is assumed stale. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TraceDraft = {
  sheetId: number;
  bidId: number;
  /** The server row this is mirroring, once one exists. */
  runId: number | null;
  name: string;
  pathType: RunPathType;
  points: PagePoint[];
  /** When it was last touched, for the staleness check. */
  savedAt: number;
};

const keyFor = (sheetId: number) => `${KEY_PREFIX}${sheetId}`;

/**
 * Mirror the in-progress trace locally.
 *
 * Deliberately swallows storage errors: a full or disabled localStorage must
 * not interrupt tracing, because the server autosave is still running and the
 * user losing their flow over a backup failing is a worse outcome than the
 * backup being absent.
 */
export function saveDraft(draft: Omit<TraceDraft, "savedAt">): void {
  try {
    const payload: TraceDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(keyFor(draft.sheetId), JSON.stringify(payload));
  } catch {
    /* storage unavailable — the server copy stands */
  }
}

/**
 * Recover a draft for a sheet, if there is a usable one.
 *
 * Returns null rather than a partial object for anything malformed or expired.
 * Offering the user a corrupt half-path to "restore" would be worse than
 * offering nothing: they would accept it, and the missing vertices would go
 * unnoticed into a measured length.
 */
export function loadDraft(
  sheetId: number,
  now: number = Date.now()
): TraceDraft | null {
  try {
    const raw = window.localStorage.getItem(keyFor(sheetId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TraceDraft>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.sheetId !== sheetId ||
      typeof parsed.bidId !== "number" ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.points)
    ) {
      return null;
    }

    if (now - parsed.savedAt > DRAFT_TTL_MS) return null;

    // Every point must be usable. One bad vertex invalidates the whole draft,
    // because a silently shortened path measures wrong and looks fine.
    const points = parsed.points as PagePoint[];
    for (const point of points) {
      if (
        typeof point?.x !== "number" ||
        typeof point?.y !== "number" ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        return null;
      }
    }

    // Nothing worth restoring — a draft of one click is not work.
    if (points.length < 2) return null;

    return {
      sheetId,
      bidId: parsed.bidId,
      runId: typeof parsed.runId === "number" ? parsed.runId : null,
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name
          : "Recovered run",
      pathType: parsed.pathType === "cable" ? "cable" : "conduit",
      points,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

/** Drop the local mirror once the work is safely committed. */
export function clearDraft(sheetId: number): void {
  try {
    window.localStorage.removeItem(keyFor(sheetId));
  } catch {
    /* nothing to do */
  }
}

/**
 * Whether there is unsaved work worth warning about on the way out.
 *
 * A path of fewer than two points is a stray click, not work — warning about
 * it would train people to dismiss the warning that matters.
 */
export function hasUnsavedWork(
  points: PagePoint[],
  savedPointCount: number
): boolean {
  if (points.length < 2) return false;
  return points.length !== savedPointCount;
}

// ─── Stamp queue (phase 2c) ───────────────────────────────────────────────────
/**
 * Stamps clicked but not yet confirmed by the server.
 *
 * Dropping fifty markers across a floor plan is the same kind of investment as
 * tracing a run, and deserves the same protection. Clicks are queued locally
 * and flushed in batches — a request per click would put the drawing behind the
 * network — so there is always a window where work exists only in the browser.
 * This mirrors that window to storage, on the same principle as the trace
 * draft: the server copy is durable, this is the crash mat under it.
 */
// The old product name again, for the same reason as KEY_PREFIX.
const STAMP_KEY_PREFIX = "helixbid:stamp-queue:";

/**
 * One click, waiting to be sent.
 *
 * ── Two shapes live here, and that is deliberate ────────────────────────────
 * Since phase 6 a mark belongs to a `takeoff_groups` row and `groupId` is all
 * it needs. A queue written by an OLDER build carries `assemblyId` and
 * `assemblyName` instead and no group — and a browser can be holding one of
 * those right now: the key survives deploys on purpose (CLAUDE.md), the TTL is
 * seven days, and the whole point of this mirror is work that exists nowhere
 * else.
 *
 * So both are accepted and the recovery path resolves the old one into a group
 * before sending it. Refusing it instead would silently discard clicks somebody
 * made — which is the exact failure this file exists to prevent, and worse than
 * the half-restored batch it already refuses, because there would be nothing
 * left to notice.
 */
export type QueuedStamp = {
  /** Phase 6 and later. Null on a queue written by an older build. */
  groupId?: number | null;
  /** Pre-phase-6 only. Resolved into a group on recovery. */
  assemblyId?: number | null;
  /** Pre-phase-6 only. */
  assemblyName?: string | null;
  x: number;
  y: number;
};

export type StampQueue = {
  sheetId: number;
  bidId: number;
  stamps: QueuedStamp[];
  savedAt: number;
};

const stampKeyFor = (sheetId: number) => `${STAMP_KEY_PREFIX}${sheetId}`;

export function saveStampQueue(
  sheetId: number,
  bidId: number,
  stamps: QueuedStamp[]
): void {
  try {
    if (stamps.length === 0) {
      window.localStorage.removeItem(stampKeyFor(sheetId));
      return;
    }
    const payload: StampQueue = { sheetId, bidId, stamps, savedAt: Date.now() };
    window.localStorage.setItem(stampKeyFor(sheetId), JSON.stringify(payload));
  } catch {
    /* storage unavailable — the flush still runs */
  }
}

/**
 * Recover stamps that were clicked but never reached the server.
 *
 * Refuses anything malformed or stale for the same reason a trace draft does:
 * a user accepts whatever is offered, and half a batch of markers restored
 * silently is a quantity that is wrong with nothing to say so.
 */
export function loadStampQueue(
  sheetId: number,
  now: number = Date.now()
): StampQueue | null {
  try {
    const raw = window.localStorage.getItem(stampKeyFor(sheetId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StampQueue>;
    if (
      parsed?.sheetId !== sheetId ||
      typeof parsed.bidId !== "number" ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.stamps) ||
      parsed.stamps.length === 0
    ) {
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) return null;

    for (const stamp of parsed.stamps as QueuedStamp[]) {
      if (
        typeof stamp?.x !== "number" ||
        typeof stamp?.y !== "number" ||
        !Number.isFinite(stamp.x) ||
        !Number.isFinite(stamp.y)
      ) {
        return null;
      }
      /*
        One of the two shapes, and nothing in between. A group id is the
        current one; a non-empty assembly name is the older one, which the
        caller turns into a group before sending. An entry with neither cannot
        say what it was counting, and a mark that cannot say that is worse
        restored than dropped — it would land on the drawing as an unnamed
        tally nobody can price or explain.
      */
      const hasGroup = typeof stamp.groupId === "number" && stamp.groupId > 0;
      const hasLegacyName =
        typeof stamp.assemblyName === "string" && stamp.assemblyName.length > 0;
      if (!hasGroup && !hasLegacyName) return null;
    }

    return {
      sheetId,
      bidId: parsed.bidId,
      stamps: parsed.stamps as QueuedStamp[],
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearStampQueue(sheetId: number): void {
  try {
    window.localStorage.removeItem(stampKeyFor(sheetId));
  } catch {
    /* nothing to do */
  }
}
