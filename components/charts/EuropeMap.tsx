"use client";
// Choropleth of one metric for one year. Paths are pre-projected at build time
// (scripts/build-map.mjs), so the browser ships no geometry library.
import { useState } from "react";
import map from "@/lib/europe-map.json";
import { diverging } from "./scales";
import { useDark } from "./useDark";

type Props = {
  values: Record<string, number | null | undefined>;
  names: Record<string, string>;
  maxAbs: number;
  selected: string;
  onSelect: (iso3: string) => void;
  format: (v: number) => string;
  label: string;
};

export function EuropeMap({ values, names, maxAbs, selected, onSelect, format, label }: Props) {
  const dark = useDark();
  const color = diverging(maxAbs, dark);
  const [hover, setHover] = useState<{ iso3: string; x: number; y: number } | null>(null);
  const feats = map.features as { iso3: string | null; name: string; d: string; cx: number; cy: number }[];
  const inData = (iso3: string | null) => !!iso3 && iso3 in names;
  const sel = feats.find((f) => f.iso3 === selected);

  return (
    <div className="figure">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={label}>
        <defs>
          <pattern id="nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--sunk)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--rule-strong)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {feats.map((f, i) => {
          const v = f.iso3 ? values[f.iso3] : undefined;
          const tracked = inData(f.iso3);
          const fill = !tracked ? "var(--sunk)" : v === null || v === undefined ? "url(#nodata)" : color(v);
          return (
            <path
              key={f.iso3 ?? `x${i}`}
              d={f.d}
              fill={fill}
              stroke="var(--bg)"
              strokeWidth={0.8}
              style={{ cursor: tracked ? "pointer" : "default" }}
              tabIndex={tracked ? 0 : -1}
              aria-label={tracked ? `${names[f.iso3!]}: ${v === null || v === undefined ? "no data" : format(v)}` : undefined}
              onPointerMove={(e) => {
                if (!tracked) return setHover(null);
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ iso3: f.iso3!, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onPointerLeave={() => setHover(null)}
              onClick={() => tracked && onSelect(f.iso3!)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tracked && onSelect(f.iso3!)}
            />
          );
        })}
        {sel && <path d={sel.d} fill="none" stroke="var(--ink)" strokeWidth={2} pointerEvents="none" />}
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 14, 380), top: Math.max(0, hover.y - 10) }}>
          <div className="r">
            <span>{names[hover.iso3]}</span>
            <b>{values[hover.iso3] === null || values[hover.iso3] === undefined ? "no data" : format(values[hover.iso3] as number)}</b>
          </div>
          <div className="foot small">Click to tell this country&apos;s story</div>
        </div>
      )}
      <MapLegend maxAbs={maxAbs} format={format} dark={dark} />
    </div>
  );
}

function MapLegend({ maxAbs, format, dark }: { maxAbs: number; format: (v: number) => string; dark: boolean }) {
  const color = diverging(maxAbs, dark);
  const stops = Array.from({ length: 11 }, (_, i) => -maxAbs + (i * 2 * maxAbs) / 10);
  return (
    <div className="small muted" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
      <span>{format(-maxAbs)} or less</span>
      <span style={{ display: "inline-flex" }}>
        {stops.map((s) => (
          <i key={s} style={{ width: 18, height: 10, background: color(s), display: "inline-block" }} />
        ))}
      </span>
      <span>{format(maxAbs)} or more</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
        <svg width="14" height="10" aria-hidden="true">
          <rect width="14" height="10" fill="url(#nodata)" />
        </svg>
        no data that year
      </span>
    </div>
  );
}
