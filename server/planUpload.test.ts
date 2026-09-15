/**
 * The same-origin upload route's rules.
 *
 * ── What this route is and why it is tested apart ────────────────────────────
 * server/planUpload.ts is the fallback used when the browser is refused a
 * direct PUT to storage — which is what a bucket with no CORS rule for this
 * origin does to every upload, at every size, having sent zero bytes.
 *
 * The forwarding half of it (this process streaming a body on to S3) cannot be
 * exercised here: there is no storage configured in tests, and the Forge
 * credentials exist only on deployed infrastructure. So the decisions are
 * separated from the plumbing — `checkProxyUpload` is a pure function and
 * carries every rule worth protecting, which is what makes them assertable
 * without a 25MB request and a live bucket.
 *
 * That separation is deliberate and is the lesson of the commit that created
 * this bug: f1b4127 moved uploads to a browser→S3 PUT and verified it with unit
 * tests of the size validation only, so the one part that was new — the
 * transfer itself — was the one part nothing checked.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_UPLOAD_PATH,
  PROXY_UPLOAD_MAX_BYTES,
  checkProxyUpload,
} from "./planUpload";
import { MAX_PDF_BYTES, formatBytes } from "../shared/uploadLimits";

const MB = 1024 * 1024;

const check = (over: Record<string, unknown> = {}) =>
  checkProxyUpload({
    bidId: 42,
    filename: "E-101.pdf",
    contentLength: 4 * MB,
    ...over,
  });

describe("where it is mounted", () => {
  it("is an /api path, and not one the platform reserves for cron", () => {
    // `/api/scheduled/*` belongs to the platform scheduler. A collision there
    // would put an upload behind cron authentication.
    expect(PLAN_UPLOAD_PATH.startsWith("/api/")).toBe(true);
    expect(PLAN_UPLOAD_PATH.startsWith("/api/scheduled/")).toBe(false);
  });
});

describe("accepting an ordinary upload", () => {
  it("passes a normal plan through with its details parsed", () => {
    const result = check();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected acceptance");
    expect(result.request).toEqual({
      bidId: 42,
      filename: "E-101.pdf",
      byteSize: 4 * MB,
    });
  });

  it("accepts right up to its own ceiling", () => {
    expect(check({ contentLength: PROXY_UPLOAD_MAX_BYTES }).ok).toBe(true);
  });
});

describe("the fallback's own size ceiling", () => {
  it("sits below the platform's request limit rather than at it", () => {
    // The platform severs a request over its body limit before this handler is
    // reached, which is exactly the vague mid-transfer death being eliminated.
    // Refusing politely below that limit is the entire point.
    expect(PROXY_UPLOAD_MAX_BYTES).toBeLessThan(32 * MB);
  });

  it("is far below what the app itself accepts, and that is expected", () => {
    // Not a contradiction: MAX_PDF_BYTES is what a plan set may weigh, this is
    // what one REQUEST may weigh. They are different questions.
    expect(PROXY_UPLOAD_MAX_BYTES).toBeLessThan(MAX_PDF_BYTES);
  });

  it("refuses one byte over, with a 413", () => {
    const result = check({ contentLength: PROXY_UPLOAD_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.status).toBe(413);
  });

  it("says the file is NOT too large for BidRender, and not to split it", () => {
    // The message that would otherwise do real harm: telling someone their
    // 200MB set is too big sends them away to split a file that is perfectly
    // acceptable, to work around a bucket setting they cannot see.
    const result = check({ contentLength: 200 * MB });
    if (result.ok) throw new Error("expected a refusal");

    expect(result.message).toMatch(/do not split it/i);
    expect(result.message).toMatch(/storage configuration/i);
    expect(result.message).toContain(formatBytes(PROXY_UPLOAD_MAX_BYTES));
  });

  it("still gives the app's own message to a genuinely oversized file", () => {
    // Over MAX_PDF_BYTES is too big full stop, and must get the ordinary
    // "split the sheet set" advice rather than the fallback's explanation.
    const result = check({ contentLength: MAX_PDF_BYTES + MB });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/split/i);
    expect(result.message).not.toMatch(/do not split it/i);
  });
});

describe("what it refuses outright", () => {
  it("refuses a request that declares no size", () => {
    // Without Content-Length the limit cannot be applied before the body
    // arrives, which is the only moment applying it is any use.
    const result = check({ contentLength: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.status).toBe(411);
  });

  it("refuses a zero-length body", () => {
    expect(check({ contentLength: 0 }).ok).toBe(false);
  });

  it("refuses a missing or nonsense bid", () => {
    for (const bidId of [undefined, "", "abc", 0, -1, 1.5]) {
      expect(check({ bidId }).ok).toBe(false);
    }
  });

  it("refuses a missing filename", () => {
    for (const filename of [undefined, "", "   ", 12345]) {
      expect(check({ filename }).ok).toBe(false);
    }
  });

  it("refuses a file that is not a PDF", () => {
    const result = check({ filename: "Plans.dwg" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/PDF/);
  });

  it("applies the app's rules before its own", () => {
    // A .dwg that is also too big for the fallback should be told it is not a
    // PDF, which is the thing the user can actually act on.
    const result = check({ filename: "Plans.dwg", contentLength: 200 * MB });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/PDF/);
  });
});

describe("every refusal is answerable", () => {
  const refusals = [
    { label: "no size", over: { contentLength: undefined } },
    { label: "empty", over: { contentLength: 0 } },
    { label: "no bid", over: { bidId: undefined } },
    { label: "no filename", over: { filename: "" } },
    { label: "not a pdf", over: { filename: "Plans.dwg" } },
    { label: "over the fallback cap", over: { contentLength: 200 * MB } },
    {
      label: "over the app limit",
      over: { contentLength: MAX_PDF_BYTES + MB },
    },
  ];

  for (const { label, over } of refusals) {
    it(`carries a real status and a sentence for ${label}`, () => {
      const result = check(over);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a refusal");
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
      expect(result.message.length).toBeGreaterThan(10);
      // No jargon — the same bar the app's other refusals are held to.
      expect(result.message.toLowerCase()).not.toContain("undefined");
      expect(result.message.toLowerCase()).not.toContain("nan");
    });
  }
});
