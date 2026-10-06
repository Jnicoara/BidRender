/**
 * server/email/ — the one door every email leaves through.
 *
 * No real provider is called: `fetch` is stubbed, and every refusal is decided
 * before it would be reached. What is pinned:
 *   - the three modes: stub everywhere but production, off in production
 *     without a key, real sends only in production with one;
 *   - the From address is mail.bidridge.com, and links default to the primary
 *     domain of each server — never anything from a request;
 *   - staging delivers to its allow-list only, and to NOBODY without one;
 *   - one address per send;
 *   - the daily and monthly caps, and a provider quota refusal pausing
 *     everybody until it resets;
 *   - every failure comes back as `notSent` (never a throw) and is logged,
 *     and no log line carries the body (a reset link is a credential).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appBaseUrl,
  emailConfig,
  mayDeliverTo,
  singleAddress,
} from "./email/config";
import {
  emailAvailability,
  maskAddress,
  resetEmailCountForTests,
  sendEmail,
  type EmailMessage,
} from "./email";

const LIVE = { NODE_ENV: "production", RESEND_API_KEY: "re_test_key" };
const STAGING = {
  ...LIVE,
  STAGING_PASSWORD: "a-long-staging-password",
  STAGING_EMAIL_ALLOWLIST: "owner@example.com",
};

const message: EmailMessage = {
  kind: "password-reset",
  to: "owner@example.com",
  subject: "Reset your BidRidge password",
  text: "https://bidridge.com/#/reset-password?token=SECRET-TOKEN",
  html: "<a href='https://bidridge.com/#/reset-password?token=SECRET-TOKEN'>x</a>",
};

describe("emailConfig", () => {
  it("in production with the key: real sends from mail.bidridge.com, links to bidridge.com", () => {
    expect(emailConfig(LIVE)).toEqual({
      kind: "resend",
      apiKey: "re_test_key",
      from: "BidRidge <no-reply@mail.bidridge.com>",
      baseUrl: "https://bidridge.com",
      allowlist: null,
      dailyCap: 100,
      monthlyCap: 3000,
    });
  });

  it("in production WITHOUT the key: off, naming the setting — not a crash", () => {
    expect(emailConfig({ NODE_ENV: "production" })).toEqual({
      kind: "off",
      why: "RESEND_API_KEY is not set",
    });
  });

  it("anywhere else: a stub, even with a key in the environment", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      const config = emailConfig({ NODE_ENV, RESEND_API_KEY: "re_leaked" });
      expect(config.kind).toBe("stub");
      // The key is not carried into stub mode at all.
      if (config.kind !== "off") expect(config.apiKey).toBe("");
    }
    expect(emailConfig({ PORT: "3001" })).toMatchObject({
      baseUrl: "http://localhost:3001",
    });
  });

  it("on staging: links to staging, and delivers to the allow-list only — or nobody", () => {
    expect(emailConfig(STAGING)).toMatchObject({
      baseUrl: "https://staging.bidridge.com",
      allowlist: ["owner@example.com"],
    });
    expect(
      emailConfig({ ...STAGING, STAGING_EMAIL_ALLOWLIST: undefined })
    ).toMatchObject({ allowlist: [] });
    expect(
      emailConfig({
        ...STAGING,
        STAGING_EMAIL_ALLOWLIST: " Owner@Example.com , second@example.com",
      })
    ).toMatchObject({
      allowlist: ["owner@example.com", "second@example.com"],
    });
  });

  it("takes APP_BASE_URL over the default, and refuses one that is not https", () => {
    expect(
      emailConfig({ ...LIVE, APP_BASE_URL: "https://www.bidridge.com/x" })
    ).toMatchObject({ baseUrl: "https://www.bidridge.com" });
    expect(
      emailConfig({ ...LIVE, APP_BASE_URL: "http://bidridge.com" })
    ).toMatchObject({ kind: "off" });
  });

  it("reads caps, and ignores one that is not a positive whole number", () => {
    expect(
      emailConfig({ ...LIVE, EMAIL_DAILY_CAP: "40", EMAIL_MONTHLY_CAP: "900" })
    ).toMatchObject({ dailyCap: 40, monthlyCap: 900 });
    expect(emailConfig({ ...LIVE, EMAIL_DAILY_CAP: "-1" })).toMatchObject({
      dailyCap: 100,
    });
  });
});

describe("appBaseUrl", () => {
  it("allows https, and plain http only on this machine", () => {
    expect(appBaseUrl("https://bidridge.com/")).toBe("https://bidridge.com");
    expect(appBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(appBaseUrl("http://bidridge.com")).toBeNull();
    expect(appBaseUrl("javascript:alert(1)")).toBeNull();
    expect(appBaseUrl("not a url")).toBeNull();
  });
});

describe("one address per send", () => {
  it("accepts exactly one plain address and nothing that reads as a list", () => {
    expect(singleAddress(" owner@example.com ")).toBe("owner@example.com");
    for (const bad of [
      "a@example.com, b@example.com",
      "a@example.com;b@example.com",
      "a@example.com b@example.com",
      "Owner <owner@example.com>",
      "not-an-address",
      "",
    ])
      expect(singleAddress(bad)).toBeNull();
  });

  it("compares allow-list addresses without case or spaces", () => {
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
  const ok = () =>
    new Response(JSON.stringify({ id: "email_123" }), { status: 200 });

  beforeEach(() => {
    resetEmailCountForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    logs = [];
    const record = (...args: unknown[]) => logs.push(args.join(" "));
    vi.spyOn(console, "log").mockImplementation(record);
    vi.spyOn(console, "warn").mockImplementation(record);
    vi.spyOn(console, "error").mockImplementation(record);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a local run logs the send and never calls the provider", async () => {
    const result = await sendEmail(message, {
      env: { NODE_ENV: "development", RESEND_API_KEY: "re_leaked" },
    });
    expect(result).toEqual({ status: "stubbed" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join("\n")).toMatch(/logged and NOT sent/);
  });

  it("production without a key: notSent, logged, no provider call", async () => {
    const result = await sendEmail(message, {
      env: { NODE_ENV: "production" },
    });
    expect(result).toEqual({
      status: "notSent",
      why: "RESEND_API_KEY is not set",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join("\n")).toMatch(/NOT sent.*RESEND_API_KEY is not set/);
  });

  it("refuses more than one address before the provider sees it", async () => {
    const result = await sendEmail(
      { ...message, to: "a@example.com, b@example.com" },
      { env: LIVE }
    );
    expect(result).toEqual({
      status: "notSent",
      why: "the recipient is not exactly one address",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("staging refuses an address off the list", async () => {
    const result = await sendEmail(
      { ...message, to: "someone@example.com" },
      { env: STAGING }
    );
    expect(result).toMatchObject({ status: "notSent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through Resend to ONE address, from mail.bidridge.com", async () => {
    fetchMock.mockResolvedValue(ok());
    expect(await sendEmail(message, { env: STAGING })).toEqual({
      status: "sent",
      id: "email_123",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      from: "BidRidge <no-reply@mail.bidridge.com>",
      to: ["owner@example.com"],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  });

  it("returns notSent, never a throw, when Resend refuses or cannot be reached — and logs it", async () => {
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
    expect(logs.filter(l => l.includes("NOT sent"))).toHaveLength(2);
    // A one-off refusal is not a quota: the next send is still tried.
    expect(emailAvailability({ env: LIVE })).toEqual({ status: "ok" });
  });

  it("a daily-quota refusal pauses everybody until the next UTC day", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "daily_quota_exceeded",
          message: "You have reached your daily email sending quota.",
        }),
        { status: 429 }
      )
    );
    const noon = new Date("2026-09-29T12:00:00Z");
    expect((await sendEmail(message, { env: LIVE, now: noon })).status).toBe(
      "notSent"
    );
    expect(emailAvailability({ env: LIVE, now: noon })).toMatchObject({
      status: "later",
    });
    // Nothing more reaches the provider while paused.
    await sendEmail(message, { env: LIVE, now: noon });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      emailAvailability({ env: LIVE, now: new Date("2026-09-30T00:00:01Z") })
    ).toEqual({ status: "ok" });
  });

  it("an unrecognised 429 pauses for a minute only", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
      })
    );
    const t = new Date("2026-09-29T12:00:00Z");
    await sendEmail(message, { env: LIVE, now: t });
    expect(emailAvailability({ env: LIVE, now: t }).status).toBe("later");
    expect(
      emailAvailability({ env: LIVE, now: new Date(t.getTime() + 61_000) })
        .status
    ).toBe("ok");
  });

  it("stops at the daily cap and the monthly cap", async () => {
    fetchMock.mockImplementation(async () => ok());
    const env = { ...LIVE, EMAIL_DAILY_CAP: "2", EMAIL_MONTHLY_CAP: "3" };
    const day1 = new Date("2026-09-29T12:00:00Z");
    expect((await sendEmail(message, { env, now: day1 })).status).toBe("sent");
    expect((await sendEmail(message, { env, now: day1 })).status).toBe("sent");
    expect(await sendEmail(message, { env, now: day1 })).toEqual({
      status: "notSent",
      why: "daily cap of 2 reached",
    });
    const day2 = new Date("2026-09-30T08:00:00Z");
    expect((await sendEmail(message, { env, now: day2 })).status).toBe("sent");
    expect(await sendEmail(message, { env, now: day2 })).toEqual({
      status: "notSent",
      why: "monthly cap of 3 reached",
    });
    const nextMonth = new Date("2026-10-01T00:00:01Z");
    expect(emailAvailability({ env, now: nextMonth })).toEqual({
      status: "ok",
    });
  });

  it("never writes the body, the key or the full address to a log", async () => {
    fetchMock.mockResolvedValue(ok());
    await sendEmail(message, { env: LIVE });
    await sendEmail(message, { env: { NODE_ENV: "production" } });
    await sendEmail(message, { env: { NODE_ENV: "development" } });
    expect(logs.length).toBe(3);
    for (const line of logs) {
      expect(line).not.toContain("SECRET-TOKEN");
      expect(line).not.toContain("re_test_key");
      expect(line).not.toContain("owner@example.com");
    }
    expect(maskAddress("owner@example.com")).toBe("ow…@example.com");
  });
});
