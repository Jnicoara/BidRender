# BidRender — Design Brainstorm

## Three Approaches

### 1. Industrial Command Center

**Theme:** Dense, data-forward dark UI inspired by industrial SCADA systems and field tablets.
**Probability:** 0.07

### 2. Tactical Dark Mode SaaS

**Theme:** Premium dark-mode SaaS with safety-yellow accents, clean data grids, and a sidebar-first layout that feels like a professional estimating tool used by foremen and PMs.
**Probability:** 0.09

### 3. Blueprint Monochrome

**Theme:** Inspired by architectural blueprints — deep navy/slate backgrounds with cyan/white line-art motifs, technical grid patterns, and monospace type for numbers.
**Probability:** 0.04

---

## Chosen Approach: Tactical Dark Mode SaaS (Probability: 0.09)

### Design Movement

Industrial SaaS — the intersection of construction-industry pragmatism and modern software design. Think Procore meets Linear.

### Core Principles

1. **Data legibility above all** — every number must be instantly readable at arm's length on a phone screen.
2. **Hierarchy through contrast** — dark backgrounds with high-contrast text; accent color used sparingly for action only.
3. **Thumb-first layout** — large tap targets (min 48px), bottom nav on mobile, sidebar on desktop.
4. **Zero decoration** — no gradients for decoration; only purposeful color to communicate state.

### Color Philosophy

- Background: `#0F1117` (near-black charcoal) — reduces glare in bright field environments.
- Surface: `#1A1D27` (dark slate card) — subtle elevation from background.
- Border: `#2A2D3A` — barely-there separators.
- Accent: `#F5C518` (Safety Yellow / ANSI yellow) — used exclusively for primary CTAs and active states. Unmistakably this brand's color.
- Text Primary: `#F0F2F5` — near-white for maximum contrast.
- Text Secondary: `#8B90A0` — muted labels and metadata.
- Success: `#22C55E` (green) — positive outputs.
- Destructive: `#EF4444` (red).

### Layout Paradigm

- Desktop: Fixed left sidebar (64px icon-only, expands to 220px on hover) + main content area.
- Mobile: Fixed bottom navigation bar with 4 icon+label tabs.
- Content: Full-bleed sections with internal padding; no centered card containers.

### Signature Elements

1. **Safety-yellow left border** on active tab / selected row — a single 3px yellow line as the selection indicator.
2. **Monospace numbers** — all calculated outputs use `font-mono` to align digits in data grids.
3. **Subtle grid texture** on backgrounds — a faint 1px dot-grid pattern at 5% opacity, evoking graph paper / blueprints.

### Interaction Philosophy

- Inputs immediately recalculate outputs (no submit button for calculators).
- Transitions: 150ms ease-out for state changes; 200ms for panel slides.
- Button press: `scale(0.97)` active state.

### Animation

- Tab switches: 150ms fade + 4px slide-up entrance.
- Calculated values: brief 200ms number highlight flash on change.
- Floating export button: subtle pulse ring on idle to draw attention.

### Typography System

- Display / Headers: `Space Grotesk` (bold 700) — geometric, technical, modern.
- Body / Labels: `Inter` (400/500) — clean and readable.
- Numbers / Code: `JetBrains Mono` (500) — monospace for all calculated outputs.
- Scale: 12/14/16/20/24/32px.

### Brand Essence

**BidRender** — the estimating tool built for electricians who work in the field, not the boardroom. Fast. Precise. No fluff.
Personality: **Precise. Rugged. Efficient.**

### Brand Voice

Headlines sound like a seasoned foreman talking to his crew — direct, no filler.

- "Measure it. Price it. Win the bid."
- "Every foot of conduit. Every hour of labor. Calculated."
  Banned: "Welcome to BidRender", "Get started today", "Streamline your workflow".

### Wordmark & Logo

Superseded by the rename. The original idea was a bold stylized "B" formed from
two conduit cross-sections (circles) stacked — suggesting both the letter and
electrical conduit. What actually ships is the "BR" monogram in safety yellow on
dark, in the sidebar. The conduit-cross-section idea was never redrawn for the
new initials and is still there for the taking.

### Signature Brand Color

`#F5C518` — Safety Yellow. Unmistakably BidRender.
