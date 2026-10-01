/**
 * The "Name this symbol" form must be drawn on the SCREEN, not on the sheet.
 *
 * ── The fault this pins, 2026-09-30 ──────────────────────────────────────────
 * Capture on the legend "did nothing": press + Capture, box a symbol, release,
 * and no name box, no error. The form had opened. It was rendered from the
 * sheet's overlay, which sits inside the zoom transform, so it scaled and
 * moved with the drawing — measured on E0.01 of the Bar layout check fixture,
 * 62x31 px at 19% and 1,826 px above the top of the window at 179%. It took
 * the keyboard focus where nobody could see it.
 *
 * ── How this test can see it without a DOM ──────────────────────────────────
 * vitest runs in node with no DOM library, and the component file is not in
 * the suite's reach on its own, so it is rendered here the way
 * tradeContent.test.ts renders the landing page: renderToStaticMarkup.
 * `createPortal` is replaced with a recorder, because the server renderer
 * cannot render a portal — what matters is WHERE the card is sent, and the
 * recorder answers that exactly. Drawn inline (the fault), the card appears in
 * the markup and nothing is recorded; portalled (the fix), the reverse.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// vi.mock below is hoisted above every import, so this one already sees the
// recording createPortal.
import { SymbolCaptureForm } from "@/components/takeoff/SymbolCapture";

const portals = vi.hoisted(() => [] as { target: unknown; markup: string }[]);

vi.mock("react-dom", async importOriginal => {
  const actual = await importOriginal<typeof import("react-dom")>();
  const { renderToStaticMarkup: render } = await import("react-dom/server");
  return {
    ...actual,
    createPortal: (node: ReactNode, target: unknown) => {
      portals.push({ target, markup: render(node) });
      return null;
    },
  };
});

const noop = () => {};

beforeEach(() => {
  portals.length = 0;
});

describe("SymbolCaptureForm placement", () => {
  it("sends the card to the screen layer and draws nothing on the sheet", () => {
    const screenLayer = {
      name: "PlanPane chrome layer",
    } as unknown as HTMLElement;

    const inline = renderToStaticMarkup(
      createElement(SymbolCaptureForm, {
        thumbnail: null,
        chromeTarget: screenLayer,
        onSave: noop,
        onCancel: noop,
      })
    );

    expect(inline).not.toContain("Name this symbol");
    expect(portals).toHaveLength(1);
    expect(portals[0].target).toBe(screenLayer);
    expect(portals[0].markup).toContain("Name this symbol");
    // The screen layer is click-through; the card has to take clicks back.
    expect(portals[0].markup).toContain("pointer-events-auto");
  });

  it("falls back to drawing inline only when the layer has not mounted", () => {
    const inline = renderToStaticMarkup(
      createElement(SymbolCaptureForm, {
        thumbnail: null,
        chromeTarget: null,
        onSave: noop,
        onCancel: noop,
      })
    );

    expect(inline).toContain("Name this symbol");
    expect(portals).toHaveLength(0);
  });
});
