/**
 * The landing page. Three sections, and nothing else.
 *
 * ── Why it looks like this ──────────────────────────────────────────────────
 * The previous version had six sections, a gradient wash, a dot grid, pills,
 * icon cards and a differentiator matrix — a normal SaaS marketing page, and
 * nothing like the product it was selling. HelixBid's own screens are quiet:
 * `bg-background`, one border weight, `text-muted-foreground` for anything
 * secondary, and the safety yellow spent only on the thing you are meant to
 * press. A visitor who lands here and then signs in should not feel like they
 * changed websites.
 *
 * So this page invents no visual language of its own. It uses the app's Button
 * and Input, the app's tokens, and the app's own wordmark markup, and it earns
 * its "marketing page" status through whitespace rather than decoration.
 *
 * ── Presentational on purpose ───────────────────────────────────────────────
 * Takes a TradeContent, an email and a submit callback; talks to no server and
 * reads no global state. That is what lets the architecture test render the
 * REAL page against a synthetic trade rather than a stand-in for it, and it
 * keeps the page prerenderable. LandingPageContainer does the tRPC wiring.
 *
 * Not one word a visitor reads is in this file — it all comes from the trade
 * config. See content/trades/types.ts.
 */
import {
  Calculator,
  Check,
  FileText,
  Gauge,
  Layers,
  Loader2,
  Ruler,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StepIconKey, TradeContent } from "@/content/trades";

/**
 * The closed icon set, resolved.
 *
 * lucide-react, the same line-icon library every screen in the app already
 * uses — no second icon set, and nothing drawn by hand. A config names a key
 * and this turns it into a component; the key type makes an unknown one a
 * compile error rather than a hole on the page.
 */
const STEP_ICON: Record<StepIconKey, LucideIcon> = {
  ruler: Ruler,
  calculator: Calculator,
  fileText: FileText,
  layers: Layers,
  gauge: Gauge,
  zap: Zap,
};

export type SignupStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "joined" }
  | { kind: "already" }
  | { kind: "error"; message: string };

/** Where the hero button and the nav button both point. */
const SIGNUP_ANCHOR = "early-access";

/**
 * The app's wordmark, character for character.
 *
 * Lifted from HelixBidShell's sidebar rather than restyled, so the name looks
 * identical either side of signing in. The emblem beside it in the app is the
 * "HB" placeholder, deliberately left off here — a placeholder mark blown up on
 * a marketing page is worse than no mark at all.
 */
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={className ?? "font-bold text-base"}
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      <span className="text-foreground">Bid</span>
      <span className="text-[#F5C518]">Render</span>
    </span>
  );
}

export function LandingPage({
  trade,
  email,
  onEmailChange,
  onSubmit,
  status,
  onSignIn,
}: {
  trade: TradeContent;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  status: SignupStatus;
  /** Sends an existing user to the login flow. */
  onSignIn: () => void;
}) {
  const submitting = status.kind === "submitting";
  const done = status.kind === "joined" || status.kind === "already";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* This page is long enough that a keyboard user should not have to tab
          the nav to reach the one thing it asks of them. */}
      <a
        href={`#${SIGNUP_ANCHOR}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to signup
      </a>

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onSignIn}>
              Sign in
            </Button>
            <Button size="sm" asChild>
              <a href={`#${SIGNUP_ANCHOR}`}>{trade.hero.ctaLabel}</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────────
            Headline, one sentence, one button, one screenshot. Four things.
            Anything else added here is the old page coming back. */}
        <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="max-w-2xl">
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-balance"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {trade.hero.headline}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {trade.hero.subhead}
            </p>
            <Button size="lg" className="mt-8" asChild>
              <a href={`#${SIGNUP_ANCHOR}`}>{trade.hero.ctaLabel}</a>
            </Button>
          </div>

          {/* The screenshot sits in the same card treatment the app uses for
              every panel — one border, one radius, no shadow theatre. */}
          <figure className="mt-14 sm:mt-20 overflow-hidden rounded-xl border border-border bg-card">
            <img
              src={trade.hero.shot.src}
              alt={trade.hero.shot.alt}
              width={trade.hero.shot.width}
              height={trade.hero.shot.height}
              loading="eager"
              decoding="async"
              // The page's largest contentful paint; without this the browser
              // finds it at normal priority behind the stylesheet.
              fetchPriority="high"
              className="block w-full h-auto"
            />
          </figure>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────
            Three steps as text, with one icon each and a rail joining them.
            Just enough weight to read as finished, not as cards. */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {trade.howItWorks.heading}
            </h2>

            {/* The rail is what makes three blocks of text read as one
                sequence. It sits behind the icon row and each icon knocks a
                gap in it with the page background, so the line reads as
                joining the steps rather than underlining them.

                Only on `sm:` and up: once the steps stack on a phone, a
                horizontal line across them connects nothing. */}
            <ol className="relative mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[11px] hidden h-px bg-border sm:block"
              />

              {trade.howItWorks.steps.map((step, index) => {
                const Icon = STEP_ICON[step.icon];
                return (
                  <li key={step.title} className="relative">
                    <span className="relative flex w-fit items-center gap-2.5 bg-background pr-4">
                      <Icon
                        className="h-[22px] w-[22px] text-primary"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span
                        className="text-xs tabular-nums text-muted-foreground"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <h3 className="mt-4 text-base font-semibold">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </li>
                );
              })}
            </ol>

            {trade.howItWorks.closingLine && (
              <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {trade.howItWorks.closingLine}
              </p>
            )}
          </div>
        </section>

        {/* ── Signup ────────────────────────────────────────────────────────
            The one place on the page that writes anything. */}
        <section
          id={SIGNUP_ANCHOR}
          className="scroll-mt-4 border-t border-border"
        >
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
            <div className="max-w-md">
              <h2
                className="text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {trade.cta.heading}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {trade.cta.body}
              </p>

              {done ? (
                <p
                  className="mt-6 flex items-center gap-2 text-sm font-medium"
                  role="status"
                >
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {status.kind === "already"
                    ? trade.cta.alreadyOn
                    : trade.cta.success}
                </p>
              ) : (
                <form
                  className="mt-6"
                  onSubmit={event => {
                    event.preventDefault();
                    if (!submitting) onSubmit();
                  }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="early-access-email" className="sr-only">
                      Email address
                    </label>
                    <Input
                      id="early-access-email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={event => onEmailChange(event.target.value)}
                      placeholder={trade.cta.placeholder}
                      disabled={submitting}
                    />
                    <Button type="submit" disabled={submitting}>
                      {submitting && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {trade.cta.buttonLabel}
                    </Button>
                  </div>

                  {status.kind === "error" && (
                    <p className="mt-3 text-sm text-destructive" role="alert">
                      {status.message}
                    </p>
                  )}

                  {/* A promise about an email address is only worth anything
                      where the address is being typed. */}
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    {trade.cta.privacy}
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Estimating software for {trade.vocabulary.tradespeople}.</p>
          <p>© {new Date().getFullYear()} BidRender</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
