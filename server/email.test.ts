/**
 * server/email/ — the one door every email leaves through.
 *
 * No real provider is called: `fetch` is stubbed, and every refusal is decided
 * before it would be reached. What is pinned:
 *   - which settings turn email on, and that a missing one turns it OFF;
 *   - a link base is https (or plain http on this machine), never anything else;
 *   - staging delivers to its allow-list only, and to NOBODY without one;
 *   - the daily cap;
 *   - the provider request carries the message, and a failure comes back as
 *     `notSent` rather than a throw;
 *   - no log line carries the body (a reset link is a credential).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appBaseUrl, emailConfig, mayDeliverTo } from "./email/config";
import {
  maskAddress,
  resetEmailCountForTests,
  sendEmail,
  type EmailMessage,
} from "./email";

const LIVE = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "BidRidge <no-reply@bidridge.com>",
  APP_BASE_URL: "https://bidridge.com",
};

const message: EmailMessage = {
  kind: "password-reset",
  to: "owner@example.com",
  subject: "Reset your BidRidge password",
  text: "https://bidridge.com/#/reset-password?token=SECRET-TOKEN",
  html: "<a href='https://bidridge.com/#/reset-password?token=SECRET-TOKEN'>x</a>",
};

describe("emailConfig", () => {
  it("is on with a key, a from-address and an https base, for anyone", () => {
    expect(emailConfig(LIVE)).toEqual({
      kind: "resend",
      apiKey: "re_test_key",
      from: "BidRidge <no-reply@bidridge.com>",
      baseUrl: "https://bidridge.com",
      allowlist: null,
      dailyCap: 100,
    });
  });

  it("is off, saying which setting, when any one is missing", () => {
    expect(emailConfig({ ...LIVE, RESEND_API_KEY: "" })).toEqual({
      kind: "off",
      why: "RESEND_API_KEY is not set",
    });
    expect(emailConfig({ ...LIVE, EMAIL_FROM: undefined })).toMatchObject({
      kind: "off",
      why: "EMAIL_FROM is not set",
    });
    expect(emailConfig({ ...LIVE, APP_BASE_URL: undefined })).toMatchObject({
      kind: "off",
    });
    expect(
      emailConfig({ ...LIVE, APP_BASE_URL: "http://bidridge.com" })
    ).toMatchObject({ kind: "off" });
  });

  it("on staging, delivers to the allow-list only — and to nobody without one", () => {
    const staging = {
      ...LIVE,
      APP_BASE_URL: "https://staging.bidridge.com",
      STAGING_PASSWORD: "a-long-staging-password",
    };
    expect(emailConfig(staging)).toMatchObject({ allowlist: [] });
    expect(
      emailConfig({
        ...staging,
        STAGING_EMAIL_ALLOWLIST: " Owner@Example.com , second@example.com",
      })
    ).toMatchObject({
      allowlist: ["owner@example.com", "second@example.com"],
    });
  });

  it("reads a daily cap, and ignores one that is not a positive whole number", () => {
    expect(emailConfig({ ...LIVE, EMAIL_DAILY_CAP: "40" })).toMatchObject({
      dailyCap: 40,
    });
    expect(emailConfig({ ...LIVE, EMAIL_DAILY_CAP: "-1" })).toMatchObject({
      dailyCap: 100,
    });
  });
});

describe("appBaseUrl", () => {
  it("keeps the origin of an https address and drops any path", () => {
    expect(appBaseUrl("https://bidridge.com/")).toBe("https://bidridge.com");
    expect(appBaseUrl("https://bidridge.com/some/path")).toBe(
      "https://bidridge.com"
    );
  });
  it("allows plain http only on this machine", () => {
    expect(appBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(appBaseUrl("http://bidridge.com")).toBeNull();
    expect(appBaseUrl("javascript:alert(1)")).toBeNull();
    expect(appBaseUrl("not a url")).toBeNull();
    expect(appBaseUrl(undefined)).toBeNull();
  });
});

describe("mayDeliverTo", () => {
  it("compares addresses without case or spaces", () => {
    expect(mayDeliverTo(" OWNER@example.com", ["owner@example.com"])).toBe(
      true
    );
    expect(mayDeliverTo("other@example.com", ["owner@example.com"])).toBe(
      false
    );
    expect(mayDeliverTo("anyone@example.com", null)).toBe(true);
    expect(mayDeliverTo("anyone@example.com", [])).toBe(false);
  });
});

describe("sendEmail", () => {
  const fetchMock = vi.fn();
  let logs: string[];

  beforeEach(() => {
    resetEmailCountForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    logs = [];
    const record = (...args: unknown[]) => logs.push(args.join(" "));
    vi.spyOn(console, "log").mockImplementation(record);
    vi.spyOn(console, "warn").mockImplementation(record);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call the provider when email is off, and says why", async () => {
    const result = await sendEmail(message, { env: {} });
    expect(result).toEqual({
      status: "notSent",
      why: "RESEND_API_KEY is not set",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider for an address off the staging list", async () => {
    const result = await sendEmail(message, {
      env: { ...LIVE, STAGING_PASSWORD: "a-long-staging-password" },
    });
    expect(result).toMatchObject({ status: "notSent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through Resend with the message, and returns its id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
    );
    const result = await sendEmail(message, { env: LIVE });
    expect(result).toEqual({ status: "sent", id: "email_123" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      from: "BidRidge <no-reply@bidridge.com>",
      to: ["owner@example.com"],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  });

  it("returns notSent, not a throw, when Resend refuses or cannot be reached", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "domain is not verified" }), {
        status: 403,
      })
    );
    expect(await sendEmail(message, { env: LIVE })).toEqual({
      status: "notSent",
      why: "Resend answered 403: domain is not verified",
    });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await sendEmail(message, { env: LIVE })).toMatchObject({
      status: "notSent",
    });
  });

  it("stops at the daily cap, and starts again the next day", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id: "x" }), { status: 200 })
    );
    const env = { ...LIVE, EMAIL_DAILY_CAP: "2" };
    const day1 = new Date("2026-09-29T12:00:00Z");
    expect((await sendEmail(message, { env, now: day1 })).status).toBe("sent");
    expect((await sendEmail(message, { env, now: day1 })).status).toBe("sent");
    expect(await sendEmail(message, { env, now: day1 })).toEqual({
      status: "notSent",
      why: "daily cap of 2 reached",
    });
    const day2 = new Date("2026-09-30T00:00:01Z");
    expect((await sendEmail(message, { env, now: day2 })).status).toBe("sent");
  });

  it("never writes the body or the full address to a log", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x" }), { status: 200 })
    );
    await sendEmail(message, { env: LIVE });
    await sendEmail(message, { env: {} });
    expect(logs.length).toBe(2);
    for (const line of logs) {
      expect(line).not.toContain("SECRET-TOKEN");
      expect(line).not.toContain("owner@example.com");
    }
    expect(maskAddress("owner@example.com")).toBe("ow…@example.com");
  });
});
