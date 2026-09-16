/**
 * The navigation helper's closed set of actions.
 *
 * ── What these tests are actually protecting ─────────────────────────────────
 * The helper is an LLM, and the thing an LLM eventually does is name a
 * destination that does not exist — a plausible route, confidently wrong. The
 * defence is that the model never constructs a URL: it picks an id, and the id
 * is resolved against a fixed list before anything reaches the user.
 *
 * So the tests below are mostly about the resolver, and specifically about it
 * REFUSING things. A helper that navigates correctly for the eleven known
 * questions and also navigates to `#/admin/delete-everything` when the model
 * hallucinates it has not been made safe by the eleven that worked.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NAVIGATION_TARGETS,
  NAVIGATION_TARGET_IDS,
  resolveNavigationTarget,
} from "../shared/navigationTargets";
import { appRouter } from "./routers";
import { NAVIGATION_MODEL } from "./routers/navigationRouter";
import type { TrpcContext } from "./_core/context";

describe("the navigation allowlist", () => {
  it("resolves every id it publishes", () => {
    // The tool's enum is built from NAVIGATION_TARGET_IDS, so anything offered
    // to the model must resolve — or the model can be handed an option that
    // the validator then rejects, and the helper silently never works.
    for (const id of NAVIGATION_TARGET_IDS) {
      expect(
        resolveNavigationTarget(id),
        `${id} does not resolve`
      ).not.toBeNull();
    }
    expect(NAVIGATION_TARGET_IDS).toHaveLength(NAVIGATION_TARGETS.length);
  });

  it("refuses anything not on the list", () => {
    // The cases that matter: a route the model made up, a real-looking path,
    // an attempt to pass a URL where an id belongs, and the empty answers.
    const refused = [
      "admin",
      "delete-everything",
      "#/admin",
      "#/library/materials",
      "/library/labor-rates",
      "labor rates",
      "LABOR-RATES",
      "labor-rates ",
      "",
      "   ",
      "../../etc/passwd",
      "javascript:alert(1)",
      "https://example.com",
    ];
    for (const id of refused) {
      // Note "labor-rates " with a trailing space IS accepted — the resolver
      // trims — so it is excluded from the expectation below on purpose.
      if (id.trim() === "labor-rates") continue;
      expect(
        resolveNavigationTarget(id),
        `${JSON.stringify(id)} was accepted`
      ).toBeNull();
    }
  });

  it("refuses null and undefined rather than throwing", () => {
    // The model returning no target at all is ordinary traffic — the answer
    // degrades to prose — so this must be a null, never an exception.
    expect(resolveNavigationTarget(null)).toBeNull();
    expect(resolveNavigationTarget(undefined)).toBeNull();
  });

  it("tolerates the whitespace a model will eventually add", () => {
    expect(resolveNavigationTarget(" labor-rates ")?.id).toBe("labor-rates");
  });

  it("is case sensitive, so a near miss fails closed", () => {
    // Better a text-only answer than a guess about what the model meant.
    expect(resolveNavigationTarget("Labor-Rates")).toBeNull();
  });

  it("only ever points inside the app", () => {
    // Nothing in the list may send a user off-site or outside the hash router.
    //
    // The query string is allowed because folding Kits, Modifiers and Supplier
    // Pricing into tabs gave three targets a `?view=` — but it is allowed in
    // exactly that shape and no other. A bare `[^#]*` here would let a future
    // entry smuggle in a second `#`, a protocol or an encoded traversal, which
    // is the whole class of thing this assertion exists to stop.
    for (const target of NAVIGATION_TARGETS) {
      expect(target.path, `${target.id} leaves the app`).toMatch(
        /^#\/[a-z0-9/-]*(\?view=[a-z-]+)?$/
      );
      expect(target.path).not.toContain("..");
    }
  });

  it("has no duplicate ids, and no two ids describing the same screen twice", () => {
    // A duplicate id would shadow whichever came first, so ids stay unique.
    //
    // Paths deliberately may repeat. Screens were folded into each other, and
    // one screen can answer to several vocabularies: the Dashboard is both
    // "the dashboard" and "my bids", and dropping one of those phrasings would
    // turn the app's most common navigation request into a text-only answer.
    // What must not happen is two entries a user could not tell apart, so the
    // LABELS have to differ even where the paths do not.
    const ids = NAVIGATION_TARGETS.map(t => t.id);
    const labels = NAVIGATION_TARGETS.map(t => t.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("describes every target well enough to be matched", () => {
    // The purpose text is what the model actually matches a question against.
    // A thin one is a screen the helper can never find.
    for (const target of NAVIGATION_TARGETS) {
      expect(
        target.label.trim().length,
        `${target.id} has no label`
      ).toBeGreaterThan(0);
      expect(
        target.purpose.trim().length,
        `${target.id} needs a fuller purpose`
      ).toBeGreaterThan(30);
    }
  });

  it("covers the screens a lost user actually asks for", () => {
    // A regression guard on coverage rather than mechanism: these are the
    // destinations the feature exists to reach.
    for (const id of [
      "labor-rates",
      "materials",
      "assemblies",
      "quick-bid",
      "bids",
    ]) {
      expect(NAVIGATION_TARGET_IDS, `no target for ${id}`).toContain(id);
    }
  });
});

/**
 * The gateway is forced to reject, rather than relying on this environment
 * happening to lack a key.
 *
 * Without the mock these tests would pass locally for the wrong reason and then
 * fail on any machine that HAS a credential, because the call would succeed and
 * log nothing — a test that inverts depending on the environment it runs in is
 * worse than no test, since it teaches people the suite is unreliable.
 */
vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    invokeLLM: vi.fn(async () => {
      throw new Error("simulated gateway rejection: unknown model");
    }),
  };
});

describe("when the helper cannot reach a model", () => {
  const caller = () =>
    appRouter.createCaller({
      user: { id: 1, role: "user" },
    } as unknown as TrpcContext);

  afterEach(() => vi.restoreAllMocks());

  it("says nothing alarming to the user", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = await caller().navigation.ask({
      question: "where are labor rates",
    });

    // A missed navigation hint is not worth an error banner — the sidebar is
    // right there. The user gets the ordinary "not sure" and no target.
    expect(answer.target).toBeNull();
    expect(answer.message).toMatch(/not sure/i);
  });

  it("logs why, and which model it tried", async () => {
    // The point of the whole exercise. A wrong model id fails exactly like a
    // missing key, so the log line has to name the model or the next person
    // debugging this is back to guessing — which is how an OpenAI id survived
    // in a Claude-only app.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await caller().navigation.ask({ question: "where are labor rates" });

    const logged = warn.mock.calls.map(args => args.join(" ")).join("\n");
    expect(logged).toContain("helper call failed");
    expect(logged).toContain(NAVIGATION_MODEL);
    // And the reason itself, so the log distinguishes a bad id from a dead
    // gateway without anyone having to reproduce it.
    expect(logged).toContain("unknown model");
  });
});
