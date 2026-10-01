/**
 * Which count an assembly's next mark belongs to on one bid — the decision,
 * without a database (track-b-count-pin-styles-plan.md § 11.2).
 *
 * ── What this replaced, and why it was a lost number rather than a look ─────
 * Until 2026-10-01 the answer was "the first count on the bid with this
 * assembly" (`server/assemblyGroup.ts`). Three legend symbols linked to one
 * assembly were three doors into ONE count: "Linear 8ft: 22, Linear 4ft: 3"
 * was stored as one count of 25, under whichever name got there first, and no
 * mark recorded which symbol it came from. The bid TOTAL was right — every
 * mark is the same assembly at the same price — but the quantity per item was
 * gone, and nothing on screen said so.
 *
 * ── The rule now ─────────────────────────────────────────────────────────────
 * A linked symbol arms ITS OWN count: the assembly's, under the symbol's name.
 * Without a symbol (the toolbar's picker) and with several counts of the
 * assembly on the bid, nothing guesses — the person is asked which.
 *
 * Pure so the suite can reach every branch; the server applies the answer.
 */
import { nameMatchesSymbol, symbolLookupKey } from "./takeoffCounts";
import type { SymbolNames } from "./takeoffCounts";

export type CountRow = { id: number; label: string; assemblyId: number | null };

/** A captured legend symbol as this decision needs it. */
export type SymbolForCount = SymbolNames & {
  id: number;
  assemblyId: number | null;
};

export type AssemblyCountChoice<G extends CountRow> =
  /** Mark into this count. */
  | { kind: "use"; group: G }
  /** Make a new count of the assembly under this name. */
  | { kind: "create"; label: string }
  /**
   * The symbol's own count exists but was made before the symbol was linked,
   * so it has no assembly. It is this symbol's count — link it, rather than
   * start a second card beside it under the same name.
   */
  | { kind: "link-plain"; group: G }
  /** Several counts of this assembly and no symbol to say which: ask. */
  | { kind: "choose"; counts: G[] }
  /** The symbol's name is taken on this bid by a count of something else. */
  | { kind: "name-taken"; group: G };

export function chooseAssemblyCount<G extends CountRow>(args: {
  /** Every count on the bid, oldest first. */
  groups: readonly G[];
  assembly: { id: number; name: string };
  /** The legend symbol the click came from, when there was one. */
  symbol?: SymbolForCount | null;
  /** Every captured symbol in the company's legend. */
  symbols?: readonly SymbolForCount[];
  /**
   * What to do with several counts and no symbol. "ask" for a person;
   * "first" only where nobody is there to answer (recovered click queues),
   * and that caller says so in its toast.
   */
  ifSeveral?: "ask" | "first";
}): AssemblyCountChoice<G> {
  const { groups, assembly, symbol } = args;
  const ofAssembly = groups.filter(g => g.assemblyId === assembly.id);

  if (!symbol) {
    if (ofAssembly.length === 0)
      return { kind: "create", label: assembly.name };
    if (ofAssembly.length === 1 || args.ifSeveral === "first")
      return { kind: "use", group: ofAssembly[0] };
    return { kind: "choose", counts: ofAssembly };
  }

  // 1. The symbol's own count of this assembly — current name first.
  const current = symbolLookupKey(symbol.label);
  const own = ofAssembly
    .filter(g => nameMatchesSymbol(g.label, symbol))
    .sort(
      (a, b) =>
        Number(symbolLookupKey(b.label) === current) -
        Number(symbolLookupKey(a.label) === current)
    );
  if (own.length > 0) return { kind: "use", group: own[0] };

  // 2. Its own count from before it was linked: a plain one under its name.
  const plain = groups.find(
    g => g.assemblyId === null && nameMatchesSymbol(g.label, symbol)
  );
  if (plain) return { kind: "link-plain", group: plain };

  /*
    3. The one count this assembly already has, when this symbol is the ONLY
    one linked to it and that count is no other symbol's. That is a bid
    counted before this fix through the toolbar or the old first-wins rule,
    and every mark in it is this symbol's — starting a second card beside it
    would split one item in two on a job with nothing to separate.
  */
  const sharers = (args.symbols ?? []).filter(
    s => s.id !== symbol.id && s.assemblyId === assembly.id
  );
  if (sharers.length === 0 && ofAssembly.length === 1) {
    const only = ofAssembly[0];
    const someoneElses = (args.symbols ?? []).some(
      s => s.id !== symbol.id && nameMatchesSymbol(only.label, s)
    );
    if (!someoneElses) return { kind: "use", group: only };
  }

  // 4. A new count under the symbol's name — unless that name is in use.
  const taken = groups.find(
    g => symbolLookupKey(g.label) === symbolLookupKey(symbol.label)
  );
  if (taken) return { kind: "name-taken", group: taken };
  return { kind: "create", label: symbol.label };
}

/**
 * May a count be linked to an assembly this bid already counts? (`setSource`)
 *
 * Two PLAIN-named counts of one assembly split one number in half, and that
 * stays refused. Two captured ITEMS sharing one assembly are two quantities —
 * the case above — so a count that is a symbol's may join an assembly as long
 * as none of the assembly's counts is already that same symbol's.
 */
export function mayShareAssembly(
  group: { label: string },
  others: readonly { label: string }[],
  symbols: readonly SymbolNames[]
): boolean {
  const item = symbols.find(s => nameMatchesSymbol(group.label, s));
  if (!item) return others.length === 0;
  return !others.some(o => nameMatchesSymbol(o.label, item));
}
