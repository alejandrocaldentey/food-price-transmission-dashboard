"use client";
// Diverging horizontal bars, one per country, sorted. The selected country is outlined and named.
import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { diverging } from "./scales";
import { useDark } from "./useDark";
import { useWidth } from "./useWidth";

type Row = { iso3: string; name: string; value: number };

export function RankBars({ rows, maxAbs, selected, onSelect, format, label }: { rows: Row[]; maxAbs: number; selected: string; onSelect: (iso3: string) => void; format: (v: number) => string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const dark = useDark();
  const [hover, setHover] = useState<string | null>(null);
  const color = diverging(maxAbs, dark);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const rowH = 17;
  const m = { left: 118, right: 56, top: 4 };
  const lo = Math.min(0, ...sorted.map((r) => r.value));
  const hi = Math.max(0, ...sorted.map((r) => r.value));
  const x = scaleLinear().domain([lo, hi]).range([m.left, width - m.right]).nice();
  const h = sorted.length * rowH + m.top + 8;
  return (
    <div className="figure" ref={ref}>
      <svg viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
        <line className="zero" x1={x(0)} x2={x(0)} y1={0} y2={h} />
        {sorted.map((r, i) => {
          const y = m.top + i * rowH;
          const on = r.iso3 === selected;
          const x0 = Math.min(x(0), x(r.value));
          const w = Math.max(1, Math.abs(x(r.value) - x(0)));
          return (
            <g
              key={r.iso3}
              onClick={() => onSelect(r.iso3)}
              onPointerEnter={() => setHover(r.iso3)}
              onPointerLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label={`${r.name} ${format(r.value)}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(r.iso3)}
            >
              <rect x={0} y={y} width={width} height={rowH} fill={hover === r.iso3 ? "var(--sunk)" : "transparent"} />
              <text x={m.left - 8} y={y + rowH / 2} dy="0.32em" textAnchor="end" style={{ fontSize: 12, fill: on ? "var(--ink)" : "var(--ink-2)", fontWeight: on ? 700 : 400 }}>
                {r.name}
              </text>
              <rect x={x0} y={y + 3} width={w} height={rowH - 6} rx={2} fill={color(r.value)} stroke={on ? "var(--ink)" : "none"} strokeWidth={on ? 1.5 : 0} />
              {(on || hover === r.iso3) && (
                <text x={r.value >= 0 ? x(r.value) + 6 : x(r.value) - 6} y={y + rowH / 2} dy="0.32em" textAnchor={r.value >= 0 ? "start" : "end"} style={{ fontSize: 12, fill: "var(--ink)", fontWeight: 700 }}>
                  {format(r.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
