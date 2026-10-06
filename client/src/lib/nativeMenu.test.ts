import { describe, it, expect } from "vitest";
import { EDITABLE_SELECTOR, wantsNativeMenu } from "./nativeMenu";

/**
 * A stand-in for a DOM element: `closest` answers from a chain of ancestors,
 * each matched against the selector by tag or by contenteditable, the same
 * way the browser would for these selectors. vitest has no DOM here.
 */
function element(chain: { tag: string; contentEditable?: string }[]) {
  return {
    closest(selector: string) {
      expect(selector).toBe(EDITABLE_SELECTOR);
      return (
        chain.find(
          e =>
            ["input", "textarea", "select"].includes(e.tag) ||
            (e.contentEditable !== undefined && e.contentEditable !== "false")
        ) ?? null
      );
    },
  };
}

describe("wantsNativeMenu", () => {
  it("gives the browser's menu to the symbol name box inside the viewer", () => {
    // input -> card -> screen layer -> viewport
    expect(
      wantsNativeMenu(
        element([
          { tag: "input" },
          { tag: "div" },
          { tag: "div" },
          { tag: "div" },
        ])
      )
    ).toBe(true);
  });

  it("gives it to a textarea and to editable text", () => {
    expect(wantsNativeMenu(element([{ tag: "textarea" }]))).toBe(true);
    expect(
      wantsNativeMenu(
        element([{ tag: "span" }, { tag: "div", contentEditable: "true" }])
      )
    ).toBe(true);
  });

  it("keeps the drawing's right-click for the viewer", () => {
    expect(wantsNativeMenu(element([{ tag: "canvas" }, { tag: "div" }]))).toBe(
      false
    );
    expect(wantsNativeMenu(element([{ tag: "svg" }, { tag: "div" }]))).toBe(
      false
    );
    expect(
      wantsNativeMenu(element([{ tag: "div", contentEditable: "false" }]))
    ).toBe(false);
  });

  it("is false for anything that is not an element", () => {
    expect(wantsNativeMenu(null)).toBe(false);
    expect(wantsNativeMenu(undefined)).toBe(false);
    expect(wantsNativeMenu({})).toBe(false);
  });
});
