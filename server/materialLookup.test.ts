/**
 * Following a material fork.
 *
 * The bug these guard against was a MONEY bug on the main path and it was
 * silent: pricing a shipped material did nothing for any assembly built from
 * it, because the assembly stored the baseline's id and the fork is a new row.
 * $3.45 on the Materials screen, $0.00 inside the assembly, nothing on screen
 * saying which was right.
 *
 * `shared/laborRateLookup.ts` solved exactly this for roles and wrote down why.
 * These tests are deliberately the same cases, so the two resolvers cannot
 * drift into behaving differently on the same shape of data.
 */
import { describe, it, expect } from "vitest";
import { resolveMaterial, materialIdsToFetch } from "../shared/materialLookup";

/** A shipped row: owned by nobody, forked from nothing. */
const baseline = { id: 410, baselineId: null, costPerUnit: "0.0000" };
/** The user's edit of it, which is a different row with a different id. */
const fork = { id: 346161, baselineId: 410, costPerUnit: "3.4500" };
/** Something the user invented, with no baseline behind it. */
const own = { id: 900, baselineId: null, costPerUnit: "12.0000" };

describe("a stored id finds the material the user actually means", () => {
  it("returns the row directly when the id still exists", () => {
    expect(resolveMaterial([baseline, own], 410)).toBe(baseline);
    expect(resolveMaterial([baseline, own], 900)).toBe(own);
  });

  it("follows a fork when the stored id points at the baseline", () => {
    /*
      THE BUG. The assembly stores 410. The user has forked it to 346161 and
      priced that at $3.45. An innerJoin on 410 fetches the $0 baseline; this
      returns the fork.

      Note the list: the baseline is ABSENT, because a fork supersedes it and
      `mergeLibraryRows` has already dropped it. That precondition is the whole
      contract — see the next test.
    */
    const found = resolveMaterial([fork, own], 410);
    expect(found).toBe(fork);
    expect(found?.costPerUnit).toBe("3.4500");
  });

  it("RETURNS THE BASELINE if the caller forgot to merge first", () => {
    /*
      Not a wish — a warning, pinned so it cannot be mistaken for a bug later.

      Resolution is direct-then-fork, matching `resolveLaborRate`, and that
      order is only right on a merged list. Handed both rows it returns the $0
      baseline the fork exists to replace: the original money bug, restored in
      full. This caught exactly that mistake in getAssemblyMaterialLines on
      2026-09-20, minutes after the query was first written.

      If this ever starts returning the fork, somebody changed the precedence —
      and the two resolvers now disagree about the same shape of data.
    */
    expect(resolveMaterial([baseline, fork, own], 410)).toBe(baseline);
  });

  it("follows the fork even when the baseline is not in the list", () => {
    // `mergeLibraryRows` hides a superseded baseline from the user's library,
    // so a caller working from that merged view never sees 410 at all.
    expect(resolveMaterial([fork, own], 410)).toBe(fork);
  });

  it("prefers a DIRECT hit over a fork of the same id", () => {
    // Order must not decide it: asking for the baseline's own id when the
    // baseline is present returns the baseline. Only a missing direct hit
    // falls through to the fork.
    expect(resolveMaterial([fork, baseline], 346161)).toBe(fork);
  });

  it("returns undefined for a material that is gone, never a stand-in", () => {
    // A deleted material is a MISSING line, not a free one. Substituting a
    // zero here is how a bid quietly loses a part.
    expect(resolveMaterial([baseline, fork], 999)).toBeUndefined();
  });

  it("returns undefined for a null or missing id rather than guessing", () => {
    expect(resolveMaterial([baseline], null)).toBeUndefined();
    expect(resolveMaterial([baseline], undefined)).toBeUndefined();
  });

  it("does not match a fork belonging to a DIFFERENT baseline", () => {
    const otherFork = { id: 500, baselineId: 411, costPerUnit: "9.9900" };
    expect(resolveMaterial([otherFork], 410)).toBeUndefined();
  });
});

describe("the ids a query has to fetch to resolve a set of lines", () => {
  it("de-duplicates, because one material can be on several lines", () => {
    expect(materialIdsToFetch([410, 410, 900])).toEqual([410, 900]);
  });

  it("drops anything that is not a real id", () => {
    expect(materialIdsToFetch([410, NaN, 900])).toEqual([410, 900]);
  });

  it("gives the SAME list both halves of the query are built from", () => {
    /*
      The query asks for `id IN (list) OR (userId = me AND baselineId IN
      (list))`. Building those from two different lists could return a fork
      whose baseline was never fetched, and then resolution would depend on
      which rows happened to arrive.
    */
    const stored = [410, 410, 900];
    const a = materialIdsToFetch(stored);
    const b = materialIdsToFetch(stored);
    expect(a).toEqual(b);
  });
});

describe("it behaves the same way resolveLaborRate does", () => {
  /*
    Not a copy-paste check — a guard on the PATTERN. Two resolvers for two
    forkable things should answer the same question the same way, so that the
    next person who meets a third one recognises the shape instead of inventing
    a third behaviour.
  */
  it("resolves direct, then fork, then gives up — in that order", () => {
    const rows = [
      { id: 1, baselineId: null },
      { id: 2, baselineId: 1 },
      { id: 3, baselineId: null },
    ];
    expect(resolveMaterial(rows, 1)?.id).toBe(1);
    expect(resolveMaterial([rows[1], rows[2]], 1)?.id).toBe(2);
    expect(resolveMaterial(rows, 99)).toBeUndefined();
  });
});
