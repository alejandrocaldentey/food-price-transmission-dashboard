// Formatting shared by server and client components. Minus is a real minus sign.

export function signed(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return `0${digits ? "." + "0".repeat(digits) : ""}${suffix}`;
  return `${v > 0 ? "+" : "−"}${s}${suffix}`;
}

export const pct = (v: number | null | undefined, d = 1) => signed(v, d, "%");
export const pp = (v: number | null | undefined, d = 1) => signed(v, d, " pp");

export function plain(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return v < 0 ? `−${Math.abs(v).toFixed(digits)}` : v.toFixed(digits);
}

export function byUnit(v: number | null | undefined, unit: string): string {
  if (unit === "%") return pct(v);
  if (unit === "pp") return pp(v);
  if (unit === "ratio" || unit === "x") return plain(v, 2) + (unit === "x" ? "×" : "");
  if (unit === "years") return v === null || v === undefined ? "n/a" : `${v} yr`;
  if (unit.startsWith("index")) return plain(v, 1);
  return plain(v);
}

export function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
