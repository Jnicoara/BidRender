/**
 * HomerunsView — the homeruns read off this sheet (@/lib/homeruns), shown
 * READ-ONLY on the drawing beside each arrow: "Homerun to 3LP-23,25, wires
 * not marked", and under it what the set's panel schedule says about each
 * circuit, or that no schedule for that panel was read.
 *
 * Nothing here is on the bid and nothing is saved. Where a homerun would be
 * kept is a Track A column (todo.md, "Homeruns read from the plan").
 *
 * The toggle shows only on a sheet that HAS a homerun — most have none, and
 * a control on every sheet that does nothing is one people learn to ignore
 * (CLAUDE.md § Customization). Off until asked: the labels sit on the
 * drawing, and a drawing is read first.
 */
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  homerunLabel,
  tieLines,
  tieToSchedule,
  type Homerun,
} from "@/lib/homeruns";
import type { PanelSchedule } from "@/lib/panelSchedules";

/** What the worker reads for one page. */
export type SheetHomeruns = {
  homeruns: Homerun[];
  /** Every panel schedule read on the set, to tie the tags to. */
  panels: PanelSchedule[];
};

export function HomerunsToggle({
  count,
  on,
  onChange,
}: {
  count: number;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  if (count === 0) return null;
  return (
    <Button
      size="sm"
      variant={on ? "secondary" : "ghost"}
      className="h-7 gap-1.5 text-xs shrink-0"
      aria-pressed={on}
      title="Homerun arrows and their circuit tags, read from this sheet — read-only"
      onClick={() => onChange(!on)}
    >
      <Cable className="w-3.5 h-3.5" />
      Homeruns
      <span className="text-muted-foreground">{count}</span>
    </Button>
  );
}

/**
 * Where each label goes, page points. Beside the tip, on the side AWAY from
 * the tag, so the drawing's own tag stays readable next to what was read
 * from it — placed beyond the tip at first, a box covered "3LP-12" and
 * "3LP-13,15,17" (seen on screen, E-200). A box that would land on one
 * already placed moves down until clear: 3LP-12's and 3LP-19,21's stacked.
 */
function placeLabels(read: SheetHomeruns) {
  const placed: {
    h: Homerun;
    lines: string[];
    left: number;
    top: number;
    w: number;
    hgt: number;
  }[] = [];
  const order = [...read.homeruns].sort((a, b) => a.arrow.y - b.arrow.y);
  for (const h of order) {
    const lines = [
      homerunLabel(h),
      ...tieLines(tieToSchedule(h.tag, read.panels), h.tag),
    ];
    const w = Math.max(...lines.map(l => l.length)) * FONT * 0.5 + PAD * 2;
    const hgt = lines.length * LINE + PAD * 2;
    const tagX = (h.tag.box.x0 + h.tag.box.x1) / 2;
    const left = tagX >= h.arrow.x ? h.arrow.x - 7 - w : h.arrow.x + 7;
    let top = h.arrow.y - hgt / 2;
    for (let guard = 0; guard < 20; guard++) {
      const hit = placed.find(
        p =>
          left < p.left + p.w &&
          p.left < left + w &&
          top < p.top + p.hgt &&
          p.top < top + hgt
      );
      if (!hit) break;
      top = hit.top + hit.hgt + 1;
    }
    placed.push({ h, lines, left, top, w, hgt });
  }
  return placed;
}

/** Label size on the drawing, page points: about the size of the tags. */
const FONT = 6.5;
const LINE = FONT * 1.3;
const PAD = 2;

export function HomerunLayer({
  width,
  height,
  renderScale,
  read,
}: {
  width: number;
  height: number;
  renderScale: number;
  read: SheetHomeruns;
}) {
  const k = renderScale;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      aria-label="Homeruns"
    >
      {placeLabels(read).map(({ h, lines, left, top, w, hgt }, i) => {
        return (
          <g key={i}>
            <circle
              cx={h.arrow.x * k}
              cy={h.arrow.y * k}
              r={5 * k}
              fill="none"
              stroke="#7C3AED"
              strokeWidth={1.2 * k}
            />
            <rect
              x={left * k}
              y={top * k}
              width={w * k}
              height={hgt * k}
              rx={1.5 * k}
              fill="#FFFFFF"
              fillOpacity={0.92}
              stroke="#7C3AED"
              strokeWidth={0.6 * k}
            />
            {lines.map((line, n) => (
              <text
                key={n}
                x={(left + PAD) * k}
                y={(top + PAD + LINE * (n + 0.8)) * k}
                fontSize={FONT * k}
                fill={n === 0 ? "#4C1D95" : "#374151"}
                fontWeight={n === 0 ? 600 : 400}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
