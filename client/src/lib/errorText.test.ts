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

  it("says WHICH field and WHAT limit, for the refusals that are clear", () => {
    const say = (issue: object) =>
      errorText({
        message: JSON.stringify([issue], null, 2),
        data: { code: "BAD_REQUEST" },
      });
    // The exact shape the server sent for a 10,000-character bid name.
    expect(
      say({
        origin: "string",
        code: "too_big",
        maximum: 255,
        inclusive: true,
        path: ["name"],
        message: "Too big: expected string to have <=255 characters",
      })
    ).toBe("The name is too long — 255 characters at most.");
    expect(
      say({
        origin: "string",
        code: "too_small",
        minimum: 1,
        path: ["clientName"],
      })
    ).toBe("The client name can't be blank.");
    expect(
      say({
        origin: "number",
        code: "too_big",
        maximum: 999999,
        path: ["lines", 0, "qty"],
      })
    ).toBe("The quantity is too large — 999,999 at most.");
    expect(
      say({ origin: "number", code: "too_small", minimum: 0, path: [] })
    ).toBe("That can't be below 0.");
  });

  it("keeps the general sentence for anything it cannot say plainly", () => {
    const say = (message: string) =>
      errorText({ message, data: { code: "BAD_REQUEST" } });
    expect(
      say('[{"origin":"string","code":"invalid_format","path":["email"]}]')
    ).toBe(INVALID_TEXT);
    expect(say("[not json")).toBe(INVALID_TEXT);
    expect(say("[]")).toBe(INVALID_TEXT);
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
