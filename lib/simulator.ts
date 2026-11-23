// The browser side of ADR 0009: apply the regression the pipeline published. Nothing is fitted
// here. scripts/parity.ts fails the build if this function does not reproduce every published
// forecast, so the simulator cannot drift from the governed model.

export type CoefRow = { model_id: string; kind: "slope" | "intercept"; country_iso3: string; term: string; value: number };

export const TERMS = [
  { term: "consumer_food_yoy_pct", label: "Shelf prices this year" },
  { term: "producer_yoy_pct", label: "Farm-gate prices this year" },
  { term: "producer_yoy_pct_lag1", label: "Farm-gate prices last year" },
] as const;

export type Inputs = { consumer: number; producer: number; producerLag: number };

export function regression(coef: CoefRow[]) {
  const rows = coef.filter((c) => c.model_id === "panel_dl");
  const slope = Object.fromEntries(rows.filter((r) => r.kind === "slope").map((r) => [r.term, r.value]));
  const alpha = Object.fromEntries(rows.filter((r) => r.kind === "intercept" && r.term === "country").map((r) => [r.country_iso3, r.value]));
  const alphaMean = rows.find((r) => r.kind === "intercept" && r.term === "mean")?.value ?? 0;
  return { slope, alpha, alphaMean };
}

export function predict(coef: CoefRow[], country: string, x: Inputs) {
  const { slope, alpha, alphaMean } = regression(coef);
  const values = [x.consumer, x.producer, x.producerLag];
  const intercept = alpha[country] ?? alphaMean;
  const parts = TERMS.map((t, i) => ({ ...t, coef: slope[t.term] ?? 0, input: values[i], contribution: (slope[t.term] ?? 0) * values[i] }));
  return { intercept, parts, total: intercept + parts.reduce((s, p) => s + p.contribution, 0) };
}
