/**
 * client/src/lib/planFailure.ts — a lost connection on the Plans screen says
 * it is the connection, never "could not be opened" with an exception name
 * (failure drill, 2026-10-15).
 */
import { describe, expect, it } from "vitest";
import { isConnectionFailure, planFailureText } from "./planFailure";

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
    const t = planFailureText(
      "open",
      "E.pdf",
      "UnknownErrorException: Invalid PDF structure."
    );
    expect(t).toEqual({
      title: "E.pdf could not be opened",
      detail: "Invalid PDF structure.",
    });
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
