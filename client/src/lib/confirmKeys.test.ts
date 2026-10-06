import { describe, expect, it } from "vitest";
import { actionKeyAllowed } from "./confirmKeys";

describe("a confirm's action button", () => {
  it("is never pressed by Enter", () => {
    expect(actionKeyAllowed("Enter")).toBe(false);
  });

  it("is pressed by Space, which is deliberate", () => {
    expect(actionKeyAllowed(" ")).toBe(true);
  });
});
