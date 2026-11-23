"use client";
// Line chart with a snapping crosshair, one tooltip for every series, direct end labels and an
// optional interval band. Clicking a year calls onPick (used to open the trace of that number).
import { scaleLinear } from "d3-scale";
import { line as d3line, area as d3area } from "d3-shape";
import { useMemo, useState } from "react";
import { useWidth } from "./useWidth";

export type Series = {
  id: string;
  label: string;
  color: string;
  values: Record<number, number | null | undefined>;
  dash?: string;
  width?: number;
  points?: boolean;
  muted?: boolean;
};

export type Band = { lower: Record<number, number>; upper: Record<number, number>; color: string; label: string };

type Props = {
  years: [number, number];
  series: Series[];
  band?: Band;
  height?: number;
  format: (v: number) => string;
  yTitle?: string;
  zero?: number;
  shadeBefore?: number;
  marks?: { year: number; label: string }[];
  onPick?: (year: number) => void;
  pickLabel?: string;
  ariaLabel: string;
};

export function LineChart({ years, series, band, height = 340, format, yTitle, zero, shadeBefore, marks, onPick, pickLabel, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 16, right: 96, bottom: 28, left: 48 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const { x, y, yTicks, xTicks } = useMemo(() => {
    const vals: number[] = [];
    for (const s of series) for (const v of Object.values(s.values)) if (v !== null && v !== undefined) vals.push(v);
    if (band) vals.push(...Object.values(band.lower), ...Object.values(band.upper));
    if (zero !== undefined) vals.push(zero);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || 1;
    const y = scaleLinear().domain([lo - pad, hi + pad]).range([ih, 0]).nice(6);
    const x = scaleLinear().domain(years).range([0, iw]);
    const span = years[1] - years[0];
    const step = span > 18 ? 5 : span > 8 ? 2 : 1;
    const xTicks: number[] = [];
    for (let t = Math.ceil(years[0] / step) * step; t <= years[1]; t += step) xTicks.push(t);
    return { x, y, yTicks: y.ticks(6), xTicks };
  }, [series, band, years, iw, ih, zero]);

  const path = (s: Series) =>
    d3line<[number, number | null | undefined]>()
      .defined((d) => d[1] !== null && d[1] !== undefined)
      .x((d) => x(d[0]))
      .y((d) => y(d[1] as number))(
      Array.from({ length: years[1] - years[0] + 1 }, (_, i) => [years[0] + i, s.values[years[0] + i]]),
    ) ?? "";

  const bandPath = band
    ? d3area<number>()
        .x((t) => x(t))
        .y0((t) => y(band.lower[t]))
        .y1((t) => y(band.upper[t]))(Object.keys(band.lower).map(Number).sort((a, b) => a - b)) ?? ""
    : "";

  // direct labels at the last value, nudged apart so they never collide
  const ends = series
    .filter((s) => !s.muted)
    .map((s) => {
      const ys = Object.keys(s.values).map(Number).filter((t) => s.values[t] !== null && s.values[t] !== undefined && t <= years[1]);
      const last = Math.max(...ys);
      return { s, last, py: y(s.values[last] as number) };
    })
    .filter((e) => Number.isFinite(e.last))
    .sort((a, b) => a.py - b.py);
  for (let i = 1; i < ends.length; i++) if (ends[i].py - ends[i - 1].py < 16) ends[i].py = ends[i - 1].py + 16;

  const pick = (clientX: number, el: SVGRectElement) => {
    const r = el.getBoundingClientRect();
    const t = Math.round(x.invert(((clientX - r.left) / r.width) * iw));
    return Math.min(years[1], Math.max(years[0], t));
  };

  const tipLeft = hover !== null ? Math.min(m.left + x(hover) + 14, width - 190) : 0;

  return (
    <div className="figure" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${m.left},${m.top})`}>
          {shadeBefore !== undefined && shadeBefore > years[0] && (
            <rect x={0} y={0} width={x(shadeBefore) - 0} height={ih} fill="var(--sunk)" />
          )}
          <g className="grid">
            {yTicks.map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {zero !== undefined && <line className="zero" x1={0} x2={iw} y1={y(zero)} y2={y(zero)} />}
          <g className="axis">
            {yTicks.map((t) => (
              <text key={t} x={-10} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={ih + 20} textAnchor="middle">
                {t}
              </text>
            ))}
            {yTitle && (
              <text x={-m.left} y={-4} textAnchor="start" className="tick">
                {yTitle}
              </text>
            )}
          </g>
          {marks?.map((mk) => (
            <g key={mk.year} transform={`translate(${x(mk.year)},0)`}>
              <line y1={0} y2={ih} stroke="var(--rule-strong)" strokeDasharray="2 3" />
              <text y={10} x={5} className="tick">
                {mk.label}
              </text>
            </g>
          ))}
          {band && <path d={bandPath} fill={band.color} opacity={0.18} />}
          {series.map((s) => (
            <path
              key={s.id}
              d={path(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={s.muted ? 0.35 : 1}
            />
          ))}
          {series
            .filter((s) => s.points)
            .flatMap((s) =>
              Object.entries(s.values)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([t, v]) => (
                  <circle key={s.id + t} cx={x(+t)} cy={y(v as number)} r={4.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
                )),
            )}
          {ends.map((e) => (
            <text key={e.s.id} x={x(e.last) + 8} y={e.py} dy="0.32em" style={{ fontSize: 12, fill: "var(--ink-2)", fontWeight: 600 }}>
              {e.s.label}
            </text>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={ih} stroke="var(--ink-3)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle key={s.id} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
                );
              })}
            </g>
          )}
          <rect
            x={0}
            y={0}
            width={iw}
            height={ih}
            fill="transparent"
            style={{ cursor: onPick ? "pointer" : "crosshair" }}
            onPointerMove={(e) => setHover(pick(e.clientX, e.currentTarget))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onPick?.(pick(e.clientX, e.currentTarget))}
          />
        </g>
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: tipLeft, top: m.top }}>
          <div className="t">{hover}</div>
          {series.map((s) => {
            const v = s.values[hover];
            return (
              <div className="r" key={s.id}>
                <span>
                  <i style={{ background: s.color }} />
                  {s.label}
                </span>
                <b>{v === null || v === undefined ? "n/a" : format(v)}</b>
              </div>
            );
          })}
          {band && band.lower[hover] !== undefined && (
            <div className="r">
              <span>{band.label}</span>
              <b>
                {format(band.lower[hover])} to {format(band.upper[hover])}
              </b>
            </div>
          )}
          {onPick && <div className="foot small">{pickLabel ?? "Click to trace this number"}</div>}
        </div>
      )}
    </div>
  );
}
