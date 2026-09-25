/**
 * Settings — one panel at a time.
 *
 * ── Why this stopped being one scroll ────────────────────────────────────────
 * It used to render eight sections stacked in a single `max-w-lg` column:
 * theme, font size, pricing defaults, branding, sales tax, proposal design,
 * account, and a permanently-disabled "Units — coming soon". The four imported
 * ones alone are about 1,700 lines of component.
 *
 * Length was not really the problem. WHAT was buried was: the pricing defaults
 * carry `CompanyDefaultNotice`, the yellow-triangle panel warning that a change
 * there moves every new bid AND every existing bid still inheriting it. That
 * warning sat at scroll position three of eight, and a warning nobody scrolls
 * to is a warning that is not being given.
 *
 * So Pricing is now the first panel and the default one, and each section is
 * its own address — see SETTINGS_SECTIONS in @/lib/appRoutes. Addressable
 * matters here beyond tidiness: the Proposal screen links people straight to
 * the panel they need when a document still has placeholders in it, and
 * "somewhere on the settings page" was never a useful destination.
 *
 * ── What was removed ─────────────────────────────────────────────────────────
 * The "Units — Imperial / Metric" section, which shipped at `opacity-40
 * pointer-events-none` under "Metric units — coming soon". A control nobody can
 * press still costs every reader the moment it takes to work out that it is not
 * real. It comes back when metric does.
 */
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import {
  Sun,
  Moon,
  LogOut,
  User,
  Settings as SettingsIcon,
} from "lucide-react";
import { BidPricingDefaultsSection } from "@/components/BidPricingDefaultsSection";
import { HeightsSection } from "@/components/HeightsSection";
import { BrandingSection } from "@/components/BrandingSection";
import { SalesTaxSection } from "@/components/SalesTaxSection";
import { ProposalDesignControls } from "@/components/proposal/ProposalDesignControls";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCrosshairColor, useCrosshairSize } from "@/hooks/useCrosshairColor";
import {
  CROSSHAIR_COLORS,
  CROSSHAIR_SIZES,
  DEFAULT_CROSSHAIR_SIZE,
  crosshairSvg,
  type CrosshairColor,
  type CrosshairSize,
} from "@/lib/crosshairCursor";
import {
  SETTINGS_SECTIONS,
  routeToPath,
  type SettingsSection,
} from "@/lib/appRoutes";

/**
 * What each panel is called, and the one line under the heading.
 *
 * The blurb says what the panel REACHES, not what it contains — "every new bid
 * and every bid still following the default" is the fact that decides whether
 * someone should be in here at all.
 */
const SECTION_INFO: Record<SettingsSection, { label: string; blurb: string }> =
  {
    pricing: {
      label: "Pricing",
      blurb:
        "Material markup, overhead, profit and productivity. Each says below whether it reaches bids that already exist.",
    },
    heights: {
      label: "Heights",
      blurb:
        "What a traced line cannot see. Tracing measures flat distance only, so every drop and rise on a run comes from these numbers.",
    },
    branding: {
      label: "Branding",
      blurb:
        "Your company details and logo, as they appear on everything you send out.",
    },
    tax: {
      label: "Sales tax",
      blurb:
        "Off until you turn it on. The rates are yours to set and yours to keep right.",
    },
    proposal: {
      label: "Proposal",
      blurb:
        "How every proposal is laid out. Changes the look of new documents, never the price of a bid.",
    },
    display: {
      label: "Display",
      blurb:
        "Theme, text size and the plan crosshair. Saved on this device, and affects nothing else.",
    },
    account: {
      label: "Account",
      blurb: "Who you are signed in as.",
    },
  };

// ── Account ───────────────────────────────────────────────────────────────────
function AccountSection() {
  const { user, logout } = useAuth();
  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Signed in as{" "}
        <span className="text-foreground font-medium">
          {user?.email ?? user?.name ?? "Unknown"}
        </span>
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/40">
          <User size={14} className="text-muted-foreground" />
          <span className="text-sm text-foreground">
            {user?.name ?? "User"}
          </span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </section>
  );
}

// ── Display ───────────────────────────────────────────────────────────────────
/**
 * The plan viewer's crosshair colour.
 *
 * Each swatch is the REAL cursor image, drawn over a strip that is half white
 * paper and half dark, because that pair is what the choice is being judged
 * against — a flat colour chip would not show the outline doing its job.
 */
function CrosshairColorSetting() {
  const [color, setColor] = useCrosshairColor();
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-0.5">
          Crosshair color
        </h3>
        <p className="text-xs text-muted-foreground">
          The cursor on a plan while you count, trace or measure. Pick one that
          stands out from the marks on your sheets.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {(Object.keys(CROSSHAIR_COLORS) as CrosshairColor[]).map(key => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={color === key}
            onClick={() => setColor(key)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 transition-colors",
              color === key
                ? "border-[#F5C518] bg-[var(--bp-yellow-dim)]"
                : "border-border hover:border-border/80 hover:bg-muted/30"
            )}
          >
            <span
              className="relative flex h-9 w-16 overflow-hidden rounded border border-border/60"
              aria-hidden="true"
            >
              <span className="flex-1 bg-white" />
              <span className="flex-1 bg-[#0f1117]" />
              {/* Small, so every colour fits its chip; size is chosen below. */}
              <img
                src={`data:image/svg+xml,${encodeURIComponent(crosshairSvg(key, "small"))}`}
                alt=""
                width={24}
                height={24}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            </span>
            <span className="text-[0.7rem] text-foreground">
              {CROSSHAIR_COLORS[key].label}
            </span>
          </button>
        ))}
      </div>
      <CrosshairSizeSetting color={color} />
    </section>
  );
}

/**
 * The crosshair's size, beside its colour and saved the same way.
 *
 * Each option is the real cursor at its REAL size, in the chosen colour, over
 * the same paper/dark strip — the thing being chosen is how long the arms are
 * on screen, and a scaled-down preview would misreport exactly that.
 */
function CrosshairSizeSetting({ color }: { color: CrosshairColor }) {
  const [size, setSize] = useCrosshairSize();
  return (
    <div className="space-y-2 pt-1">
      <h4 className="text-xs font-medium text-foreground">Crosshair size</h4>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {(Object.keys(CROSSHAIR_SIZES) as CrosshairSize[]).map(key => {
          const px = CROSSHAIR_SIZES[key].px;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={size === key}
              onClick={() => setSize(key)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 transition-colors",
                size === key
                  ? "border-[#F5C518] bg-[var(--bp-yellow-dim)]"
                  : "border-border hover:border-border/80 hover:bg-muted/30"
              )}
            >
              <span
                className="relative flex h-14 w-20 overflow-hidden rounded border border-border/60"
                aria-hidden="true"
              >
                <span className="flex-1 bg-white" />
                <span className="flex-1 bg-[#0f1117]" />
                <img
                  src={`data:image/svg+xml,${encodeURIComponent(crosshairSvg(color, key))}`}
                  alt=""
                  width={px}
                  height={px}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />
              </span>
              <span className="text-[0.7rem] text-foreground">
                {CROSSHAIR_SIZES[key].label}
                {key === DEFAULT_CROSSHAIR_SIZE && (
                  <span className="text-muted-foreground"> · default</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Theme and text size.
 *
 * The size control used to be seven preset buttons AND a slider. The slider is
 * `min={0.8} max={1.4} step={0.1}`, which produces exactly 0.8, 0.9, 1.0 … 1.4
 * — the same seven values the buttons offered. Two controls for one setting is
 * a choice the user has to make before they can make the actual choice, so the
 * buttons are gone and the slider keeps its readout. Reset is the one thing a
 * slider is genuinely bad at, so 100% stays available as a single button.
 */
function DisplaySection() {
  const { uiFontScale, setUiFontScale } = useApp();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Theme</h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Light mode card */}
          <button
            onClick={() => isDark && toggleTheme?.()}
            aria-pressed={!isDark}
            className={cn(
              "relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200",
              !isDark
                ? "border-[#F5C518] bg-[var(--bp-yellow-dim)]"
                : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
            )}
          >
            <div className="w-full rounded-md overflow-hidden border border-border/50 shadow-sm">
              <div className="h-5 bg-[#e8eaf0] flex items-center gap-1 px-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d0d3de]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#d0d3de]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#d0d3de]" />
              </div>
              <div className="h-12 bg-[#f5f6fa] flex gap-1.5 p-1.5">
                <div className="w-6 bg-[#e8eaf0] rounded-sm" />
                <div className="flex-1 space-y-1">
                  <div className="h-2 bg-[#d8dae3] rounded-sm w-3/4" />
                  <div className="h-2 bg-[#e8eaf0] rounded-sm w-1/2" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Sun
                size={13}
                className={!isDark ? "text-[#D4A900]" : "text-muted-foreground"}
              />
              <span
                className={cn(
                  "text-xs font-semibold",
                  !isDark ? "text-foreground" : "text-muted-foreground"
                )}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Light
              </span>
            </div>

            {!isDark && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F5C518]" />
            )}
          </button>

          {/* Dark mode card */}
          <button
            onClick={() => !isDark && toggleTheme?.()}
            aria-pressed={isDark}
            className={cn(
              "relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200",
              isDark
                ? "border-[#F5C518] bg-[var(--bp-yellow-dim)]"
                : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
            )}
          >
            <div className="w-full rounded-md overflow-hidden border border-white/10 shadow-sm">
              <div className="h-5 bg-[#1a1d27] flex items-center gap-1 px-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2a2d3a]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#2a2d3a]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#2a2d3a]" />
              </div>
              <div className="h-12 bg-[#0f1117] flex gap-1.5 p-1.5">
                <div className="w-6 bg-[#1a1d27] rounded-sm" />
                <div className="flex-1 space-y-1">
                  <div className="h-2 bg-[#2a2d3a] rounded-sm w-3/4" />
                  <div className="h-2 bg-[#1a1d27] rounded-sm w-1/2" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Moon
                size={13}
                className={isDark ? "text-[#F5C518]" : "text-muted-foreground"}
              />
              <span
                className={cn(
                  "text-xs font-semibold",
                  isDark ? "text-foreground" : "text-muted-foreground"
                )}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Dark
              </span>
            </div>

            {isDark && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F5C518]" />
            )}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-0.5">
            Text size
          </h3>
          <p className="text-xs text-muted-foreground">
            Scales all UI text. Useful on a large monitor, or when reading at
            arm's length in a truck.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Smaller</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-foreground tabular-nums">
                {Math.round(uiFontScale * 100)}%
              </span>
              {Math.abs(uiFontScale - 1) > 0.001 && (
                <button
                  onClick={() => setUiFontScale(1)}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset
                </button>
              )}
            </span>
            <span>Larger</span>
          </div>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.1}
            value={uiFontScale}
            onChange={e => setUiFontScale(parseFloat(e.target.value))}
            aria-label="Text size"
            className="w-full accent-[#F5C518] cursor-pointer"
          />
        </div>

        {/* Live preview — real estimating text, so the size is judged against
            the thing it will actually be read on. */}
        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
            Preview
          </p>
          <p
            style={{ fontSize: `calc(${uiFontScale} * 13px)` }}
            className="text-foreground font-medium"
          >
            Run 1 — 142.5 ft · EMT ¾"
          </p>
          <p
            style={{ fontSize: `calc(${uiFontScale} * 11px)` }}
            className="text-muted-foreground"
          >
            Conductors: 3 × #12 AWG Cu · Page 2
          </p>
          <p
            style={{ fontSize: `calc(${uiFontScale} * 10px)` }}
            className="text-muted-foreground font-mono"
          >
            Fittings: 4 × Connectors · 2 × 90° Ells
          </p>
        </div>
      </section>

      <CrosshairColorSetting />
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────────
export default function SettingsPage({
  section,
}: {
  section: SettingsSection;
}) {
  const info = SECTION_INFO[section] ?? SECTION_INFO.pricing;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">{info.blurb}</p>
          </div>
        </div>

        {/* One panel at a time. Navigating by hash rather than by state so a
            panel can be linked to and lands in browser history — the Proposal
            screen depends on both. */}
        <div
          className="flex flex-wrap items-center gap-1 mt-3"
          role="tablist"
          aria-label="Settings sections"
        >
          {SETTINGS_SECTIONS.map(key => {
            const active = key === section;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (active) return;
                  window.location.hash = routeToPath("settings", { view: key });
                }}
                className={cn(
                  "px-3 py-1 rounded-md text-xs transition-colors",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {SECTION_INFO[key].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl">
          {section === "pricing" && <BidPricingDefaultsSection />}
          {section === "heights" && <HeightsSection />}
          {section === "branding" && <BrandingSection />}
          {section === "tax" && <SalesTaxSection />}
          {section === "proposal" && <ProposalDesignControls />}
          {section === "display" && <DisplaySection />}
          {section === "account" && <AccountSection />}
        </div>
      </div>
    </div>
  );
}
