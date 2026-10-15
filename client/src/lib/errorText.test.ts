import { describe, expect, it, vi } from "vitest";
import {
  INTERNAL_TEXT,
  INVALID_TEXT,
  OFFLINE_TEXT,
  errorText,
} from "./errorText";

vi.spyOn(console, "warn").mockImplementation(() => {});

describe("errorText", () => {
  it("keeps a message the server wrote for the person", () => {
    const written =
      'A material named "Wire nut" already exists. Edit that one instead of adding a duplicate.';
    expect(errorText({ message: written, data: { code: "CONFLICT" } })).toBe(
      written
    );
    // Deliberate internal messages are sentences, and pass too.
    expect(
      errorText({
        message: "Could not save the logo. Try a smaller file.",
        data: { code: "INTERNAL_SERVER_ERROR" },
      })
    ).toBe("Could not save the logo. Try a smaller file.");
  });

  it("says 'couldn't reach' when nothing answered", () => {
    expect(errorText(new TypeError("Failed to fetch"))).toBe(OFFLINE_TEXT);
    expect(errorText({ message: "Load failed" })).toBe(OFFLINE_TEXT);
    // A tRPC error the server never answered: no data.
    expect(
      errorText({
        name: "TRPCClientError",
        message: "fetch error",
        data: undefined,
      })
    ).toBe(OFFLINE_TEXT);
  });

  it("passes a plain Error a screen threw itself, which is written for the person", () => {
    expect(errorText(new Error("Pick a PDF file."))).toBe("Pick a PDF file.");
    expect(errorText(undefined)).toBe(INTERNAL_TEXT);
  });

  it("never shows a validation dump", () => {
    const zod =
      '[{"code":"too_small","minimum":1,"path":["name"],"message":"String must contain at least 1 character(s)"}]';
    expect(errorText({ message: zod, data: { code: "BAD_REQUEST" } })).toBe(
      INVALID_TEXT
    );
  });

  it("never shows code from an internal error", () => {
    for (const raw of [
      "ER_DUP_ENTRY: Duplicate entry '5' for key 'PRIMARY'",
      "Cannot read properties of undefined (reading 'id')",
      "DB unavailable",
    ])
      expect(
        errorText({ message: raw, data: { code: "INTERNAL_SERVER_ERROR" } })
      ).toBe(INTERNAL_TEXT);
  });
});
