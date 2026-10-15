/**
 * The guard in front of removing a bid.
 *
 * These exist because an audit found the two places that remove a bid
 * disagreeing: the Dashboard asked for confirmation, the Bids list archived on
 * a single click of a trash can. The wording and the confirm/cancel decision
 * now live in one module, and these pin both halves of what that module
 * promises:
 *
 *   • nothing but an explicit confirmation can produce an archive instruction;
 *   • the prompt says where the bid goes and how long it can be recovered.
 *
 * What these do NOT cover: that the component actually calls
 * `resolveArchiveAnswer` rather than the mutation directly. This repo tests
 * decisions rather than DOM (CLAUDE.md § Editing fields), so that wiring was
 * verified in the browser instead — see the commit message.
 */
import { describe, it, expect } from "vitest";
import {
  archiveConfirmCopy,
  resolveArchiveAnswer,
  type PendingArchive,
} from "./archiveBid";
import { RETENTION_DAYS } from "@shared/retention";

const PENDING: PendingArchive = { id: 42, name: "Oak Street remodel" };

describe("an accidental click cannot archive anything", () => {
  it("cancelling archives nothing", () => {
    expect(resolveArchiveAnswer(PENDING, "cancel")).toEqual({ action: "none" });
  });

  it("dismissing archives nothing", () => {
    // Escape, or a click outside the dialog. Both mean no, and both used to be
    // the only thing standing between a stray click and a vanished bid.
    expect(resolveArchiveAnswer(PENDING, "dismiss")).toEqual({
      action: "none",
    });
  });

  it("confirming with nothing pending archives nothing", () => {
    // A stray Enter as the dialog closes must not act on whatever was last
    // selected.
    expect(resolveArchiveAnswer(null, "confirm")).toEqual({ action: "none" });
  });

  it("only an explicit confirmation produces an instruction", () => {
    const answers = ["confirm", "cancel", "dismiss"] as const;
    const archiving = answers.filter(
      a => resolveArchiveAnswer(PENDING, a).action === "archive"
    );
    expect(archiving).toEqual(["confirm"]);
  });
});

describe("confirming archives the right bid", () => {
  it("returns an archive instruction carrying that bid's id", () => {
    expect(resolveArchiveAnswer(PENDING, "confirm")).toEqual({
      action: "archive",
      id: 42,
    });
  });

  it("never returns a delete instruction — archive is the only outcome", () => {
    // The type says so and this asserts it at runtime: there is deliberately
    // no path from a list straight to a permanent delete. That lives in the
    // Archive screen, and the server refuses it for anything not archived.
    const decision = resolveArchiveAnswer(PENDING, "confirm");
    expect(decision.action).toBe("archive");
    expect(Object.keys(decision)).toEqual(["action", "id"]);
  });
});

describe("what the prompt says", () => {
  const copy = archiveConfirmCopy("Oak Street remodel");

  it("names the bid, so nobody confirms the wrong one", () => {
    expect(copy.title).toContain("Oak Street remodel");
  });

  // The place and the end state in the words the app uses for them since
  // 2026-10-14 (one name for deleted things: "Recently deleted", and
  // "deleted for good" — references/copy-review-2026-10-14.md). Until then
  // these read /archive/ and /permanently deleted/; the copy change missed
  // this file, and the overnight log said no test pinned the strings.
  it("says where it goes", () => {
    expect(copy.body).toMatch(/Recently deleted/);
  });

  it("states the window and what happens at the end of it", () => {
    expect(copy.body).toContain(String(RETENTION_DAYS));
    expect(copy.body).toMatch(/deleted for good/i);
    expect(copy.body).toMatch(/restore/i);
  });

  it("says the bid itself is unchanged meanwhile", () => {
    // The question someone actually has: does archiving cost me my pricing?
    expect(copy.body).toMatch(/line items/i);
    expect(copy.body).toMatch(/pricing/i);
  });

  it("does not call it a delete — it is recoverable", () => {
    // Threatening deletion for a reversible action teaches people to fear a
    // safe one, and to distrust the wording when something IS destructive.
    expect(copy.title.toLowerCase()).not.toContain("delete");
    expect(copy.title.toLowerCase()).toContain("archive");
  });

  it("survives a name with quotes or markup in it", () => {
    const odd = archiveConfirmCopy(`Bob's "big" <job>`);
    expect(odd.title).toContain(`Bob's "big" <job>`);
  });
});
