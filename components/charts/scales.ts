import { interpolateLab } from "d3-interpolate";
import { scaleLinear } from "d3-scale";

// Diverging blue <-> red with a neutral grey midpoint (validated pair; never a hue at zero).
const LIGHT = ["#184f95", "#6da7ec", "#e6e8e4", "#ef8a7f", "#b3302f"];
const DARK = ["#5598e7", "#256abf", "#2c3632", "#b84343", "#ef8a7f"];

export function diverging(maxAbs: number, dark = false) {
  const c = dark ? DARK : LIGHT;
  return scaleLinear<string>()
    .domain([-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs])
    .range(c)
    .interpolate(interpolateLab)
    .clamp(true);
}

// Sequential single hue (blue), light to dark, for counts.
export function sequential(max: number, dark = false) {
  return scaleLinear<string>()
    .domain([0, max])
    .range(dark ? ["#1c2a40", "#86b6ef"] : ["#e7f0fb", "#184f95"])
    .interpolate(interpolateLab)
    .clamp(true);
}

/** A robust symmetric extent: the 95th percentile of |v|, so one outlier does not wash the map out. */
export function symmetricExtent(values: number[]): number {
  const a = values.map(Math.abs).sort((x, y) => x - y);
  if (!a.length) return 1;
  const p = a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  const nice = [1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  return nice.find((n) => n >= p) ?? p;
}
