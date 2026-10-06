/**
 * THE WHOLE PLAN SET, IN TWO LISTS: ON THE BID, AND NOT ON IT YET — WITH WHY.
 *
 * references/track-b-deletes-summary-pan-plan.md § 2, built 2026-09-29.
 *
 * ── It composes; it never computes a quantity of its own ─────────────────────
 * Every number here arrives from a query that already exists and already feeds
 * a screen: a count from `takeoffGroups.list`, a run type's feet and fittings
 * from `takeoffRunTypes.bridgeForBid`, an untyped run from
 * shared/runsNotOnBid.ts. A second computation of the same totals is the
 * disagreement CLAUDE.md warns about, so this module only SORTS what those
 * say into two lists and names the reason for each item on the wrong side.
 *
 * ── The same list decides the preview AND the send ──────────────────────────
 * `sendKey` is what "Send all" is asked to send. The server rebuilds this
 * summary when the send arrives and refuses if its sendable keys are not the
 * ones the preview showed — so nobody sends a set they did not see.
 *
 * Pure: no database, so the sorting rule has tests that read like it.
 */

/** Why an item is not on the bid. Each has a sentence (`reasonText`). */
export type NotOnBidReason =
  /** Counted or traced, and nobody has sent it. The one Send all fixes. */
  | "notSent"
  /** Would go, but the bid is locked. */
  | "locked"
  /** Counted against an assembly no longer in the library. */
  | "assemblyGone"
  /** A count kind that cannot be priced from yet (levels 2 and 3). */
  | "unsupported"
  /** A run-type row that cannot go: no material named, a fitting unknown. */
  | "cannotSend"
  /** Runs on a sheet with no scale, so they have no length. */
  | "noScale"
  /** Runs traced with no run type, so nothing says what they are. */
  | "noType"
  /** Conduit runs with nothing pulled through them (shared/runNoWire.ts). */
  | "noWire";

export type SendTarget =
  | { kind: "count"; groupId: number }
  | { kind: "runRow"; runTypeId: number; role: string };

export type SummaryItem = {
  /** Stable across reads — what the preview's `expect` is made of. */
  key: string;
  kind: "count" | "run";
  /** For a run row, the run type it belongs to; null for a count. */
  group: string | null;
  name: string;
  /** Null when there is no honest number (runs with no length). */
  qty: number | null;
  unit: "each" | "ft" | "runs";
  reason: NotOnBidReason | null;
  /** The sentence for `reason`, or the row's own message. */
  why: string | null;
  /** Set only for an item Send all may send right now. */
  send: SendTarget | null;
  /**
   * True when it is KNOWN to cross with no price — a free count, or a fitting
   * whose part is $0 — so the preview says "Not priced". False claims nothing:
   * the preview shows no money at all, so it can never show $0.
   */
  notPriced: boolean;
};

export type TakeoffSummary = {
  locked: boolean;
  onBid: SummaryItem[];
  notOnBid: SummaryItem[];
  /** The keys of `notOnBid` items with a `send` — the preview's list. */
  sendable: string[];
};

// ── Inputs, shaped like the queries that already exist ──────────────────────

export type SummaryCount = {
  id: number;
  label: string;
  /** "plain" is a free count, which crosses with no price. */
  kind: string;
  count: number;
  sendability:
    | { sendable: true }
    | {
        sendable: false;
        reason:
          | "already-on-bid"
          | "nothing-counted"
          | "no-price"
          | "unsupported-level";
      };
};

type RowSendability = { ok: true } | { ok: false; message: string };

export type SummaryRunType = {
  runTypeId: number;
  label: string;
  unmeasurableCount: number;
  rows: {
    role: string;
    materialName: string | null;
    feet: number;
    onBid: boolean;
    sendable: RowSendability;
  }[];
  fittings: {
    role: string;
    status: "counted" | "included" | "unknown";
    qty: number;
    why: string;
    materialName: string | null;
    onBid: boolean;
    sendable: RowSendability;
    /**
     * bridgeForBid's `priced`: false for a matched part at $0, null when no
     * part is matched (such a row cannot be sent anyway).
     */
    priced: boolean | null;
  }[];
};

/** A traced run is not "counted" — seen on screen 2026-09-29. */
const TRACED_NOT_SENT = "Traced, not sent yet.";

export const REASON_TEXT: Record<NotOnBidReason, string> = {
  notSent: "Counted, not sent yet.",
  noWire:
    "Conduit with nothing pulled through it, so no wire for it is priced. Add its wires on the run.",
  locked: "The bid is locked. Unlock it to add this.",
  assemblyGone: "Counted against an assembly no longer in your library.",
  unsupported: "This kind of count cannot be priced on the bid yet.",
  cannotSend: "Cannot go on the bid as it stands.",
  noScale: "On a sheet with no scale, so it has no length.",
  noType: "Traced with no run type, so nothing says what it is.",
};

/** Human names for the run-type roles, where no material names the row. */
const ROLE_NAME: Record<string, string> = {
  raceway: "Pipe",
  conductor: "Wire",
  ground: "Ground",
  coupling: "Couplings",
  connector: "Connectors",
  strap: "Straps",
  elbow90: "90° elbows",
  elbow45: "45° elbows",
  fieldBend: "Field bends",
  lb: "LBs",
  pullBox: "Pull boxes",
};

export function takeoffSummary(input: {
  locked: boolean;
  counts: readonly SummaryCount[];
  runTypes: readonly SummaryRunType[];
  /** Runs (a branched run once) with no run type — runsNotOnBid().noType. */
  untypedRuns: number;
  /**
   * Conduit runs whose wire the bid would price and that carry none —
   * countRunsWithNoWire. Their pipe may be on the bid; their wire is not,
   * and a bid with pipe and no wire looks finished. Optional so a caller
   * with no runs need not say 0.
   */
  runsWithNoWire?: number;
}): TakeoffSummary {
  const onBid: SummaryItem[] = [];
  const notOnBid: SummaryItem[] = [];

  /** An item that WOULD go: on a locked bid it is listed, never sendable. */
  const wouldGo = (
    item: Omit<SummaryItem, "reason" | "why" | "send">,
    send: SendTarget
  ): SummaryItem =>
    input.locked
      ? { ...item, reason: "locked", why: REASON_TEXT.locked, send: null }
      : {
          ...item,
          reason: "notSent",
          why: item.kind === "run" ? TRACED_NOT_SENT : REASON_TEXT.notSent,
          send,
        };

  for (const c of input.counts) {
    // Nothing marked is not "missing" — there is nothing to be missing.
    if (!(c.count > 0)) continue;
    const base = {
      key: `count:${c.id}`,
      kind: "count" as const,
      group: null,
      name: c.label,
      qty: c.count,
      unit: "each" as const,
      notPriced: c.kind === "plain",
    };
    const s = c.sendability;
    if (s.sendable) {
      notOnBid.push(wouldGo(base, { kind: "count", groupId: c.id }));
    } else if (s.reason === "already-on-bid") {
      onBid.push({ ...base, reason: null, why: null, send: null });
    } else if (s.reason === "no-price") {
      notOnBid.push({
        ...base,
        reason: "assemblyGone",
        why: REASON_TEXT.assemblyGone,
        send: null,
      });
    } else if (s.reason === "unsupported-level") {
      notOnBid.push({
        ...base,
        reason: "unsupported",
        why: REASON_TEXT.unsupported,
        send: null,
      });
    }
  }

  for (const t of input.runTypes) {
    const row = (
      role: string,
      materialName: string | null,
      qty: number,
      unit: "ft" | "each",
      isOnBid: boolean,
      sendable: RowSendability,
      notPriced = false
    ) => {
      const base = {
        key: `run:${t.runTypeId}:${role}`,
        kind: "run" as const,
        group: t.label,
        name: materialName ?? ROLE_NAME[role] ?? role,
        qty,
        unit,
        notPriced,
      };
      if (isOnBid) {
        onBid.push({ ...base, reason: null, why: null, send: null });
      } else if (sendable.ok) {
        notOnBid.push(
          wouldGo(base, { kind: "runRow", runTypeId: t.runTypeId, role })
        );
      } else {
        notOnBid.push({
          ...base,
          reason: "cannotSend",
          why: sendable.message,
          send: null,
        });
      }
    };

    for (const r of t.rows) {
      // No footage means nothing to be missing; the no-scale line says why.
      if (!(r.feet > 0) && !r.onBid) continue;
      row(r.role, r.materialName, r.feet, "ft", r.onBid, r.sendable);
    }
    for (const f of t.fittings) {
      /*
        Only fittings there is something to buy for, or a question about.
        "Belled end — sticks join without couplings" and a type with no LBs
        are answers, not gaps; listing them under "not on the bid" would
        read as money missing where none is.
      */
      const counted = f.status === "counted" && f.qty > 0;
      if (!f.onBid && !counted && f.status !== "unknown") continue;
      row(
        f.role,
        f.materialName,
        f.qty,
        "each",
        f.onBid,
        f.sendable,
        f.sendable.ok && f.priced === false
      );
    }
    if (t.unmeasurableCount > 0) {
      notOnBid.push({
        key: `noScale:${t.runTypeId}`,
        kind: "run",
        group: t.label,
        name: `${t.unmeasurableCount} run${t.unmeasurableCount === 1 ? "" : "s"}`,
        qty: t.unmeasurableCount,
        unit: "runs",
        reason: "noScale",
        why: REASON_TEXT.noScale,
        send: null,
        notPriced: false,
      });
    }
  }

  if (input.untypedRuns > 0) {
    notOnBid.push({
      key: "noType",
      kind: "run",
      group: null,
      name: `${input.untypedRuns} traced run${input.untypedRuns === 1 ? "" : "s"}`,
      qty: input.untypedRuns,
      unit: "runs",
      reason: "noType",
      why: REASON_TEXT.noType,
      send: null,
      notPriced: false,
    });
  }

  const noWire = input.runsWithNoWire ?? 0;
  if (noWire > 0) {
    notOnBid.push({
      key: "noWire",
      kind: "run",
      group: null,
      name: `Wire for ${noWire} conduit run${noWire === 1 ? "" : "s"}`,
      qty: noWire,
      unit: "runs",
      reason: "noWire",
      why: REASON_TEXT.noWire,
      send: null,
      notPriced: false,
    });
  }

  return {
    locked: input.locked,
    onBid,
    notOnBid,
    sendable: notOnBid.filter(i => i.send !== null).map(i => i.key),
  };
}

// ── "Not on the bid yet", folded by reason ──────────────────────────────────

/**
 * One line per reason, with a count, each opening to its rows
 * (references/track-b-phone-and-readability-plan.md § 2.4, owner's answer 3,
 * 2026-09-30). The reason is said ONCE, on the line, instead of under every
 * row — measured before: the same "Traced, not sent yet." eleven times over.
 *
 * A row still says its own reason when it differs from the line's — a run
 * row that "cannot go as it stands" carries a message of its own (no
 * material named, a fitting unknown), and folding that away would turn a
 * fixable row into an unexplained one.
 */
export type NotOnBidFold = {
  /** The reason, with "notSent" split into traced and counted. */
  id: string;
  label: string;
  /** Rows in this fold — the same unit as "Not on the bid yet — N". */
  count: number;
  /** Said once, under the line; null when every row says its own. */
  why: string | null;
  items: (SummaryItem & { ownWhy: string | null })[];
  /** True when Send all sends every row in this fold. */
  sendable: boolean;
};

const FOLD_LABEL: Record<string, string> = {
  "notSent:run": "Traced, not sent yet",
  "notSent:count": "Counted, not sent yet",
  locked: "Bid is locked",
  noType: "No run type",
  noScale: "No scale",
  noWire: "No wire in the pipe",
  cannotSend: "Can't go on the bid as it stands",
  assemblyGone: "Assembly no longer in your library",
  unsupported: "Can't be priced on the bid yet",
};

/** Things one press fixes first; things that need work elsewhere after. */
const FOLD_ORDER = Object.keys(FOLD_LABEL);

export function foldNotOnBid(notOnBid: readonly SummaryItem[]): NotOnBidFold[] {
  const byId = new Map<string, SummaryItem[]>();
  for (const item of notOnBid) {
    const reason = item.reason ?? "cannotSend";
    const id = reason === "notSent" ? `notSent:${item.kind}` : reason;
    const list = byId.get(id) ?? [];
    list.push(item);
    byId.set(id, list);
  }
  const rank = (id: string) => {
    const at = FOLD_ORDER.indexOf(id);
    return at < 0 ? FOLD_ORDER.length : at;
  };
  return Array.from(byId.entries())
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, items]) => {
      // The line's sentence is the one most rows share, so a fold whose
      // rows all say the same thing says it once and nothing under rows.
      const tally = new Map<string, number>();
      for (const i of items) {
        if (i.why) tally.set(i.why, (tally.get(i.why) ?? 0) + 1);
      }
      const shared =
        Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const why = shared !== null && tally.get(shared)! > 1 ? shared : null;
      const label = FOLD_LABEL[id] ?? id;
      const sentence = why ?? (items.length === 1 ? items[0].why : null);
      return {
        id,
        label,
        count: items.length,
        // "Traced, not sent yet" over "Traced, not sent yet." says it twice
        // (seen on screen 2026-09-30) — a sentence that only restates the
        // line is left off.
        why: sentence !== null && sentence === `${label}.` ? null : sentence,
        items: items.map(i => ({
          ...i,
          ownWhy: items.length === 1 || i.why === why ? null : (i.why ?? null),
        })),
        sendable: items.every(i => i.send !== null),
      };
    });
}

/**
 * Whether the list Send all was shown is the list it would send now. Order
 * does not matter; membership does, both ways — an item added since the
 * preview would be sent unseen, and one gone would be a promise not kept.
 */
export function sameSendList(
  shown: readonly string[],
  now: readonly string[]
): boolean {
  if (shown.length !== now.length) return false;
  const set = new Set(now);
  return shown.every(key => set.has(key)) && new Set(shown).size === set.size;
}
