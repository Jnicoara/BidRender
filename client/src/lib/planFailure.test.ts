/**
 * client/src/lib/planFailure.ts — a lost connection on the Plans screen says
 * it is the connection, never "could not be opened" with an exception name
 * (failure drill, 2026-10-15).
 */
import { describe, expect, it } from "vitest";
import { isConnectionFailure, planFailureText } from "./planFailure";
import { probeVerdict } from "./probePlanFile";

describe("what a failed plan says", () => {
  it("a dropped connection says it is the connection, and that nothing is lost", () => {
    const t = planFailureText(
      "sheet",
      "Large set.pdf",
      "UnknownErrorException: Failed to fetch"
    );
    expect(t.title).toBe("Couldn't load this sheet");
    expect(t.detail).toMatch(/takeoff is saved/);
    expect(t.detail).not.toMatch(/Exception/);
    expect(planFailureText("open", "E.pdf", "Failed to fetch").title).toBe(
      "Couldn't reach E.pdf"
    );
  });

  it("a real file fault keeps its reason, without the engine's exception name", () => {
    // A fault this cannot name keeps pdf.js's reason, minus its class name.
    const t = planFailureText(
      "open",
      "E.pdf",
      "UnknownErrorException: Bad font program."
    );
    expect(t).toEqual({
      title: "E.pdf could not be opened",
      detail: "Bad font program.",
      canRetry: true,
    });
    // "Invalid PDF structure" is a damaged FILE since 2026-10-16 (owner's
    // hard-PDF item: an honest message with a fix) — the block below.
    expect(
      planFailureText(
        "open",
        "E.pdf",
        "UnknownErrorException: Invalid PDF structure."
      ).detail
    ).not.toMatch(/Exception/);
  });

  it("tells connection from content", () => {
    expect(
      isConnectionFailure(
        "Unexpected server response (503) while retrieving PDF"
      )
    ).toBe(true);
    expect(isConnectionFailure("net::ERR_INTERNET_DISCONNECTED")).toBe(true);
    expect(isConnectionFailure("Invalid PDF structure.")).toBe(false);
    expect(isConnectionFailure("Unexpected server response (404)")).toBe(false);
  });
});

describe("a FILE problem says what it is and offers no Try again (hard-PDF drill, 2026-10-16)", () => {
  it("a password", () => {
    const t = planFailureText(
      "open",
      "Set.pdf",
      "PasswordException: No password given"
    );
    expect(t.title).toBe("Set.pdf is password-protected");
    expect(t.detail).toMatch(/without a password, and upload that copy/);
    expect(t.canRetry).toBe(false);
    expect(t.detail).not.toMatch(/Exception/);
  });

  it("a damaged or incomplete file", () => {
    for (const m of [
      "InvalidPDFException: Invalid PDF structure.",
      "MissingPDFException: Missing PDF",
      "FormatError: Invalid XRef stream",
    ]) {
      const t = planFailureText("open", "Set.pdf", m);
      expect(t.title).toBe("Set.pdf is damaged or incomplete");
      expect(t.canRetry).toBe(false);
    }
  });

  it("a dropped connection is still worth trying again", () => {
    expect(planFailureText("open", "Set.pdf", "Failed to fetch").canRetry).toBe(
      true
    );
  });
});

describe("the upload's probe refuses only a SURE file problem", () => {
  it("password and damage stop the upload; anything else lets it go", () => {
    expect(
      probeVerdict({
        type: "probeFailed",
        message: "PasswordException: No password given",
      })
    ).toMatchObject({ ok: false, problem: "password" });
    expect(
      probeVerdict({
        type: "probeFailed",
        message: "InvalidPDFException: Invalid PDF structure.",
      })
    ).toMatchObject({ ok: false, problem: "damaged" });
    expect(
      probeVerdict({
        type: "probeFailed",
        message: "Error: worker ran out of memory",
      })
    ).toEqual({ ok: true, pageCount: null });
    expect(probeVerdict(null)).toEqual({ ok: true, pageCount: null });
    expect(probeVerdict({ type: "probed", pageCount: 500 })).toEqual({
      ok: true,
      pageCount: 500,
    });
  });
});
