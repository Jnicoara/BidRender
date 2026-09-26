/**
 * Does the trade-config architecture actually hold?
 *
 * ── The claim being tested ──────────────────────────────────────────────────
 * "Adding a trade is adding one config entry; it never means opening a page
 * component." That is easy to say, easy to believe, and decays the first time
 * somebody types a word like "electrician" straight into a section because it
 * was quicker. By then the second trade is a second page, and the promise the
 * data model makes — that a new trade is content plus an unlock, not a refactor
 * (CLAUDE.md § Project) — has quietly stopped being true in the marketing layer.
 *
 * So this renders the REAL landing page against a synthetic trade whose every
 * string is deliberately unlike anything electrical, and fails if a single word
 * of the shipped copy survives. A hardcoded headline cannot pass it.
 *
 * ── It also holds the page to being SHORT ───────────────────────────────────
 * The page was rebuilt down to three sections after the first version grew into
 * an ordinary six-section SaaS page that looked nothing like the product. A few
 * assertions here exist purely to make that regression loud: three sections,
 * three steps, one call to action, one image.
 *
 * ── Rendered, not inspected ─────────────────────────────────────────────────
 * renderToStaticMarkup rather than a DOM library: the page touches no browser
 * API during render, which makes it renderable in the node environment vitest
 * already uses. That keeps the test honest — it exercises the actual JSX rather
 * than a stand-in — and costs no new dependency.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "@/pages/landing/LandingPage";
import {
  DEFAULT_TRADE,
  TRADES,
  resolveTrade,
  STEP_ICONS,
  type TradeContent,
} from "@/content/trades";
import { electrical } from "@/content/trades/electrical";
import { TRADE_ALL, isKnownTrade, normalizeTradeId } from "@shared/trades";

// ── A trade that could not possibly be electrical ────────────────────────────

/**
 * Plumbing, written with deliberately distinctive strings.
 *
 * The odd words ("ZZTOP", "quokka") are load-bearing: they make it impossible
 * for an assertion to pass by accident on a word the page happens to contain
 * for another reason.
 */
const plumbing: TradeContent = {
  id: "plumbing",
  label: "Plumbing",
  meta: {
    title: "ZZTOP plumbing estimating title",
    description: "ZZTOP plumbing meta description",
    ogImage: "/brand/zztop-og.jpg",
    ogImageAlt: "ZZTOP og alt",
  },
  hero: {
    headline: "ZZTOP headline for pipefitters",
    subhead: "ZZTOP subhead about fixtures and stacks",
    ctaLabel: "ZZTOP cta label",
    shot: {
      src: "/brand/zztop-shot.jpg",
      alt: "ZZTOP screenshot alt",
      width: 1200,
      height: 800,
    },
  },
  howItWorks: {
    heading: "ZZTOP how heading",
    steps: [
      { title: "ZZTOP step one", body: "ZZTOP step one body", icon: "gauge" },
      { title: "ZZTOP step two", body: "ZZTOP step two body", icon: "layers" },
      { title: "ZZTOP step three", body: "ZZTOP step three body", icon: "zap" },
    ],
    closingLine: "ZZTOP closing line",
  },
  cta: {
    heading: "ZZTOP cta heading",
    body: "ZZTOP cta body",
    buttonLabel: "ZZTOP button label",
    placeholder: "ZZTOP placeholder",
    privacy: "ZZTOP privacy line",
    success: "ZZTOP success",
    alreadyOn: "ZZTOP already on",
  },
  vocabulary: { tradespeople: "quokkas" },
};

/** Render the real page with a given trade and nothing else changed. */
function render(
  trade: TradeContent,
  status: Parameters<typeof LandingPage>[0]["status"] = { kind: "idle" }
) {
  return renderToStaticMarkup(
    createElement(LandingPage, {
      trade,
      email: "",
      onEmailChange: () => {},
      onSubmit: () => {},
      status,
      onSignIn: () => {},
    })
  );
}

/** Every visible string a trade config supplies, flattened. */
function allCopy(trade: TradeContent): string[] {
  return [
    trade.hero.headline,
    trade.hero.subhead,
    trade.hero.ctaLabel,
    trade.hero.shot.alt,
    trade.howItWorks.heading,
    ...trade.howItWorks.steps.flatMap(s => [s.title, s.body]),
    ...(trade.howItWorks.closingLine ? [trade.howItWorks.closingLine] : []),
    trade.cta.heading,
    trade.cta.body,
    trade.cta.buttonLabel,
    trade.cta.placeholder,
    trade.cta.privacy,
    trade.vocabulary.tradespeople,
  ];
}

/**
 * HTML-escape the way React does, so an assertion about an apostrophe does not
 * fail on `&#x27;`.
 */
function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── The architecture claim ───────────────────────────────────────────────────

describe("a new trade is a config entry, not page code", () => {
  it("renders a trade the page components have never heard of", () => {
    // The whole test in one assertion: plumbing.ts does not exist in the repo,
    // no component was touched, and the page renders it completely.
    const html = render(plumbing);
    for (const copy of allCopy(plumbing)) {
      expect(html, `missing from the rendered page: "${copy}"`).toContain(
        escapeForHtml(copy)
      );
    }
  });

  it("leaks not one word of the shipped electrical copy", () => {
    // The failure mode this is really guarding: a component that renders the
    // config for most things but keeps one hardcoded headline or footer line.
    const html = render(plumbing);
    for (const copy of allCopy(electrical)) {
      expect(html, `electrical copy leaked through: "${copy}"`).not.toContain(
        escapeForHtml(copy)
      );
    }
    expect(html.toLowerCase()).not.toContain("electric");
  });

  it("points the hero at the trade's own screenshot", () => {
    const html = render(plumbing);
    expect(html).toContain(plumbing.hero.shot.src);
    expect(html).not.toContain(electrical.hero.shot.src);
  });

  it("uses the trade's vocabulary in the shared chrome", () => {
    // The footer is chrome, so its sentence is not in the config — but the word
    // it uses for the people it serves has to be. This catches "Estimating
    // software for electricians." hardcoded into a footer.
    const html = render(plumbing);
    expect(html).toContain("quokkas");
    expect(html).not.toContain("electricians");
  });

  it("omits the closing line when a trade has nothing to say there", () => {
    const terse: TradeContent = {
      ...plumbing,
      howItWorks: { ...plumbing.howItWorks, closingLine: undefined },
    };
    const html = render(terse);
    expect(html).not.toContain("ZZTOP closing line");
    // And the rest of the page is unaffected.
    expect(html).toContain(escapeForHtml(plumbing.howItWorks.heading));
  });
});

// ── The page stays short ─────────────────────────────────────────────────────

describe("the page stays as small as it was rebuilt to be", () => {
  const html = render(electrical);

  it("has exactly three sections", () => {
    // Hero, how it works, signup. A fourth is the old six-section marketing
    // page creeping back — which is the specific thing this rebuild removed.
    expect((html.match(/<section/g) ?? []).length).toBe(3);
  });

  it("allows exactly three steps, at the type level and in the output", () => {
    expect(electrical.howItWorks.steps).toHaveLength(3);
    expect((html.match(/<li\b/g) ?? []).length).toBe(3);
  });

  it("shows one image and only the three step icons", () => {
    // One screenshot, and no second picture. The icons are deliberate — one
    // per step, to stop the section reading as a draft — but three is the
    // budget: the version before this had an icon tile on every card in a
    // four-section grid.
    expect((html.match(/<img/g) ?? []).length).toBe(1);
    expect((html.match(/<svg/g) ?? []).length).toBe(3);
  });

  it("draws one connector rail, and only where the steps sit side by side", () => {
    // The rail is what makes three blocks read as a sequence. On a phone the
    // steps stack, and a horizontal line across stacked items joins nothing.
    expect(html).toMatch(/hidden h-px bg-border sm:block|sm:block[^"]*h-px/);
    expect(html).toContain('aria-hidden="true"');
  });

  it("offers one destination, not a menu of calls to action", () => {
    // Nav button, hero button and the skip link all point at the same anchor;
    // there is no second offer anywhere on the page.
    const anchors = Array.from(html.matchAll(/href="#([^"]+)"/g)).map(
      m => m[1]
    );
    expect(new Set(anchors)).toEqual(new Set(["early-access"]));
  });

  it("keeps the hero to a headline, a sentence, a button and a picture", () => {
    const hero = html.slice(
      0,
      html.indexOf("<section", html.indexOf("<section") + 1)
    );
    expect((hero.match(/<h1/g) ?? []).length).toBe(1);
    // One paragraph in the hero. A second is a subhead that grew into prose.
    expect((hero.match(/<p\b/g) ?? []).length).toBe(1);
  });
});

// ── It looks like the app, not like a marketing page ─────────────────────────

describe("it reuses the app's visual language", () => {
  const html = render(electrical);

  it("uses the app's own tokens rather than bespoke colours", () => {
    expect(html).toContain("bg-background");
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain("border-border");
  });

  it("spends the safety yellow only through the app's primary token", () => {
    // The old page painted #F5C518 into pills, washes, rules and icon tiles.
    // The wordmark is the one literal that survives, because it is lifted
    // verbatim from the app's own sidebar.
    const literals = Array.from(html.matchAll(/#F5C518/gi));
    expect(literals.length).toBeLessThanOrEqual(1);
    expect(html).toContain("bg-primary");
  });

  it("carries no gradient, wash or dot-grid decoration", () => {
    for (const pattern of [
      "gradient",
      "backdrop-blur",
      "shadow-2xl",
      "animate-pulse",
    ]) {
      expect(html, `decoration crept back in: ${pattern}`).not.toContain(
        pattern
      );
    }
  });
});

// ── The signup section's states ──────────────────────────────────────────────

describe("the signup section", () => {
  it("shows the form, the privacy line and the button by default", () => {
    const html = render(plumbing);
    expect(html).toContain(escapeForHtml(plumbing.cta.privacy));
    expect(html).toContain('type="email"');
    expect(html).toContain(escapeForHtml(plumbing.cta.buttonLabel));
  });

  it("always carries a privacy line next to the field", () => {
    // Both shipped and synthetic — a promise about an email address is only
    // worth anything where the address is typed, so it is not optional.
    for (const trade of [electrical, plumbing]) {
      expect(render(trade)).toContain(escapeForHtml(trade.cta.privacy));
    }
  });

  it("replaces the form with a confirmation once joined", () => {
    const html = render(plumbing, { kind: "joined" });
    expect(html).toContain(escapeForHtml(plumbing.cta.success));
    expect(html).not.toContain('type="email"');
  });

  it("says something different when the address is already on the list", () => {
    // A duplicate is good news, not an error, and must not read as one.
    const html = render(plumbing, { kind: "already" });
    expect(html).toContain(escapeForHtml(plumbing.cta.alreadyOn));
    expect(html).not.toContain(escapeForHtml(plumbing.cta.success));
  });

  it("shows an error without losing the form", () => {
    const html = render(plumbing, { kind: "error", message: "ZZTOP boom" });
    expect(html).toContain("ZZTOP boom");
    expect(html).toContain('type="email"');
  });
});

// ── Mobile first ─────────────────────────────────────────────────────────────

describe("the layout is mobile-first", () => {
  const html = render(electrical);

  it("never puts a multi-column grid at the base breakpoint", () => {
    // The bug this catches: `grid-cols-3` written without a breakpoint prefix,
    // invisible on the laptop it was written on and unreadable on the phone
    // half of this audience. Columns must be opt-in at `sm:` and up.
    const classes = Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap(m =>
      m[1].split(/\s+/)
    );
    const bare = classes.filter(c => /^grid-cols-[2-9]/.test(c));
    expect(bare, `unprefixed multi-column grids: ${bare}`).toEqual([]);
    expect(classes.some(c => /^(sm|md|lg):grid-cols-[2-9]/.test(c))).toBe(true);
  });

  it("stacks the signup field and button on a narrow screen", () => {
    expect(html).toMatch(/class="[^"]*flex-col[^"]*sm:flex-row/);
  });

  it("carries no fixed pixel widths that could overflow a phone", () => {
    const fixed = Array.from(html.matchAll(/class="([^"]*)"/g))
      .flatMap(m => m[1].split(/\s+/))
      .filter(c => /^w-\[\d{3,}px\]$/.test(c));
    expect(fixed, `fixed widths on the landing page: ${fixed}`).toEqual([]);
  });

  it("gives the screenshot intrinsic dimensions so nothing jumps", () => {
    // Without width/height the browser reserves no space, and the largest image
    // on the page shoves everything below it down when it lands.
    expect(html).toMatch(/<img[^>]*width="\d+"[^>]*height="\d+"/);
  });
});

// ── Icons come from a fixed set ──────────────────────────────────────────────

describe("step icons", () => {
  it("renders every declared icon key without a hole", () => {
    // A config names an icon; it never imports one. Rendering all of them
    // proves the map is complete — a missing entry would crash here rather
    // than leave a blank square on a live page.
    for (const icon of STEP_ICONS) {
      const html = render({
        ...plumbing,
        howItWorks: {
          ...plumbing.howItWorks,
          steps: plumbing.howItWorks.steps.map(s => ({
            ...s,
            icon,
          })) as (typeof plumbing)["howItWorks"]["steps"],
        },
      });
      expect(
        (html.match(/<svg/g) ?? []).length,
        `icon "${icon}" did not render`
      ).toBe(3);
    }
  });

  it("uses the trade's chosen icons, not one hardcoded per position", () => {
    // Two trades with different icons must produce different markup, or the
    // icons are chrome pretending to be content.
    const a = render(electrical);
    const b = render(plumbing);
    expect(a).not.toBe(b);
    // lucide sets a class per icon, e.g. "lucide-ruler".
    expect(a.toLowerCase()).toContain("ruler");
    expect(b.toLowerCase()).not.toContain("ruler");
  });
});

// ── The registry ─────────────────────────────────────────────────────────────

describe("the trade registry", () => {
  it("ships electrical, and only electrical, today", () => {
    expect(TRADES.map(t => t.id)).toEqual(["electrical"]);
    expect(DEFAULT_TRADE.id).toBe("electrical");
  });

  it("falls back rather than rendering nothing for an unknown trade", () => {
    // A stale link to a trade that was renamed or pulled should land on a page
    // that exists, not on an error.
    expect(resolveTrade("plumbing").id).toBe("electrical");
    expect(resolveTrade(null).id).toBe("electrical");
    expect(resolveTrade("  ELECTRICAL ").id).toBe("electrical");
  });

  it("only sells trades the data model can actually tag a row with", () => {
    // The seam this closes: `TradeContent.id` is the SAME string that lands in
    // `assemblies.trade`, `materials.trade` and `early_access_signups.tradeId`.
    // That used to be a comment saying so, and a comment is not a connection —
    // a landing page advertising a trade the registry has never heard of would
    // collect signups nobody could match to a catalog.
    for (const trade of TRADES) {
      expect(isKnownTrade(trade.id)).toBe(true);
      // Already in stored form: no stray case or whitespace to normalise away.
      expect(normalizeTradeId(trade.id)).toBe(trade.id);
    }
  });

  it("never uses the reserved `all` sentinel as a marketing trade", () => {
    // `all` means "every trade" on the shared-settings tables. A page selling
    // it would be a page selling nothing in particular.
    expect(TRADES.map(t => t.id)).not.toContain(TRADE_ALL);
  });
});

// ── The shipped copy has to hold up too ──────────────────────────────────────

describe("the electrical content itself", () => {
  it("leads the headline with what the product does, not the name", () => {
    // "BidRidge" explains nothing to someone meeting it for the first time.
    expect(electrical.hero.headline.toLowerCase()).not.toContain("bidridge");
    expect(electrical.hero.headline.toLowerCase()).toContain("estimating");
  });

  it("keeps the subhead to a single sentence", () => {
    // The brief was one sentence, not a paragraph — and a paragraph is exactly
    // what this grows back into.
    const sentences = electrical.hero.subhead
      .split(/[.!?]+\s/)
      .filter(s => s.trim().length > 0);
    expect(sentences).toHaveLength(1);
    expect(electrical.hero.subhead.length).toBeLessThanOrEqual(200);
  });

  it("keeps each step to a sentence or two", () => {
    for (const step of electrical.howItWorks.steps) {
      expect(
        step.body.length,
        `step too long: ${step.title}`
      ).toBeLessThanOrEqual(160);
    }
  });

  it("names the product and what it does in the page title", () => {
    expect(electrical.meta.title).toContain("BidRidge");
    expect(electrical.meta.title.toLowerCase()).toContain("estimating");
    // Search results truncate; a title past ~75 characters loses its tail.
    expect(electrical.meta.title.length).toBeLessThanOrEqual(75);
  });

  it("keeps the meta description inside what a result will show", () => {
    expect(electrical.meta.description.length).toBeGreaterThan(80);
    expect(electrical.meta.description.length).toBeLessThanOrEqual(200);
  });

  it("claims no customers, because there are none yet", () => {
    // Invented social proof is the fastest way to lose this audience.
    const everything = JSON.stringify(electrical).toLowerCase();
    for (const word of [
      "testimonial",
      "trusted by",
      "customers say",
      "5-star",
    ]) {
      expect(everything).not.toContain(word);
    }
  });

  it("avoids the vocabulary that gives away a page written by a stranger", () => {
    const everything = JSON.stringify(electrical).toLowerCase();
    for (const word of [
      "streamline",
      "empower",
      "leverage",
      "seamless",
      "revolutioniz",
      "game-chang",
      "best-in-class",
      "synerg",
    ]) {
      expect(
        everything,
        `marketing filler in the copy: "${word}"`
      ).not.toContain(word);
    }
  });

  it("uses a real product screenshot rather than stock imagery", () => {
    expect(electrical.hero.shot.src).toMatch(/^\/brand\//);
    expect(electrical.hero.shot.width).toBeGreaterThan(0);
    expect(electrical.hero.shot.height).toBeGreaterThan(0);
    expect(electrical.hero.shot.alt.length).toBeGreaterThan(40);
  });
});
