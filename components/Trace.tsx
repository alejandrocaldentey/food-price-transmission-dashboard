"use client";
// "Trace this number": every figure on the site can be opened to show how it was made, step by
// step, from the value Eurostat published to the certified metric, with the contracts it passed
// and the run that published it. Built only from published metadata, never hand-written.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Contract, DiamondRow, IndexRow, Metric, RunStats } from "@/lib/data";
import { byUnit, plain, when } from "@/lib/format";

export type TraceBundle = {
  metrics: Metric[];
  diamond: DiamondRow[];
  index: IndexRow[];
  names: Record<string, string>;
  contracts: Record<string, Contract>;
  sql: Record<string, string>;
  run: { run_id: string; published_at: string; git_sha: string | null; stats: RunStats | null } | null;
};

type Target = { iso3: string; year: number; metric: string };
const Ctx = createContext<(t: Target) => void>(() => {});
export const useTrace = () => useContext(Ctx);

const REPO = "https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices";
const SERIES = { PRODUCER_PI: "Farm-gate price index", CONSUMER_FOOD_PI: "Consumer food price index (HICP)" } as const;
const DATASET = { PRODUCER_PI: "apri_pi_outa", CONSUMER_FOOD_PI: "prc_hicp_aind" } as const;
const UNIT_LABEL: Record<string, string> = { I20: "2020 = 100", I15: "2015 = 100", I10: "2010 = 100", I05: "2005 = 100", I00: "2000 = 100", INX_A_AVG: "current HICP base" };

export function TraceProvider({ bundle, children }: { bundle: TraceBundle; children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target) => setTarget(t), []);
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTarget(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);
  return (
    <Ctx.Provider value={open}>
      {children}
      {target && <Drawer bundle={bundle} target={target} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  );
}

/** A number that opens its own trace. */
export function TraceNum({ iso3, year, metric, children }: Target & { children: ReactNode }) {
  const open = useTrace();
  return (
    <button type="button" className="num" onClick={() => open({ iso3, year, metric })} title="How was this number made?">
      {children}
    </button>
  );
}

function SqlFor({ bundle, tables }: { bundle: TraceBundle; tables: string[] }) {
  const files = tables.filter((t) => bundle.sql[t]);
  if (!files.length) return null;
  return (
    <details>
      <summary>Show the SQL that runs ({files.join(", ")})</summary>
      {files.map((t) => (
        <pre className="sql" key={t}>
          {bundle.sql[t]}
        </pre>
      ))}
    </details>
  );
}

function Drawer({ bundle, target, onClose }: { bundle: TraceBundle; target: Target; onClose: () => void }) {
  const { iso3, year, metric } = target;
  const m = bundle.metrics.find((x) => x.name === metric);
  const row = bundle.diamond.find((d) => d.country_iso3 === iso3 && d.year === year);
  const value = row ? (row[metric as keyof DiamondRow] as number | null) : null;
  const idx = useMemo(() => {
    const out: Record<string, IndexRow> = {};
    for (const r of bundle.index) if (r.country_iso3 === iso3 && (r.year === year || r.year === year - 1)) out[`${r.series_code}:${r.year}`] = r;
    return out;
  }, [bundle.index, iso3, year]);

  const needs = {
    producer: ["producer_price_change_pct", "food_price_gap_pp", "producer_price_index", "pass_through_ratio_lag1"].includes(metric),
    consumer: ["consumer_food_price_change_pct", "food_price_gap_pp", "consumer_food_price_index", "food_inflation_premium_pp", "pass_through_ratio_lag1"].includes(metric),
    level: metric.endsWith("_index"),
    headline: ["headline_inflation_pct", "food_inflation_premium_pp"].includes(metric),
  };
  const series = ([needs.producer && "PRODUCER_PI", needs.consumer && "CONSUMER_FOOD_PI"].filter(Boolean) as ("PRODUCER_PI" | "CONSUMER_FOOD_PI")[]).filter(
    (s) => !(metric === "producer_price_index" && s === "CONSUMER_FOOD_PI") && !(metric === "consumer_food_price_index" && s === "PRODUCER_PI"),
  );
  const years = needs.level ? [year] : [year - 1, year];
  const path = ["silver_price_observation", ...(series.length ? ["silver_price_index_chained"] : []), "gold_price_transmission", "diamond_country_year"];
  const contracts = path.filter((t) => bundle.contracts[t]);
  const rules = (t: string) => {
    const c = bundle.contracts[t];
    return c ? Object.values(c.columns).reduce((n, r) => n + (r.required ? 1 : 0) + (r.allowed ? 1 : 0) + (r.min !== undefined || r.max !== undefined ? 1 : 0), 1) : 0;
  };
  const yoy = (s: "PRODUCER_PI" | "CONSUMER_FOOD_PI") => {
    const a = idx[`${s}:${year - 1}`], b = idx[`${s}:${year}`];
    return a && b ? 100 * (b.index_value / a.index_value - 1) : null;
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="How this number was made">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <p className="muted small">How this number was made</p>
            <h2 style={{ marginTop: 4 }}>
              {m?.label ?? metric}, {bundle.names[iso3] ?? iso3}, {year}
            </h2>
            <p style={{ fontFamily: "var(--display)", fontSize: "2.2rem", fontWeight: 600, marginTop: 6 }}>{byUnit(value, m?.unit ?? "")}</p>
          </div>
          <button className="btn" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <ol className="steps">
          {series.length > 0 && (
            <li>
              <h3>
                Published by Eurostat <span className="layer">bronze</span>
              </h3>
              <p className="small muted">Raw values as the API returned them, in the base each year comes from.</p>
              <div className="calc">
                {series.flatMap((s) =>
                  years.map((t) => {
                    const r = idx[`${s}:${t}`];
                    return (
                      <div key={s + t}>
                        {DATASET[s]} {t}: {r ? <b>{plain(r.source_value)}</b> : "missing"} {r ? `(${r.source_unit}, ${UNIT_LABEL[r.source_unit] ?? r.source_unit})` : ""}
                      </div>
                    );
                  }),
                )}
              </div>
            </li>
          )}
          {series.length > 0 && (
            <li>
              <h3>
                Chain-linked and rebased to 2020 = 100 <span className="layer">silver</span>
              </h3>
              <p className="small muted">Older bases are linked to the newest one at the year it starts, so levels from different bases become comparable (ADR 0010).</p>
              <div className="calc">
                {series.flatMap((s) =>
                  years.map((t) => {
                    const r = idx[`${s}:${t}`];
                    return r ? (
                      <div key={s + t}>
                        {t}: {plain(r.source_value)} × {r.rebase_factor.toFixed(4)} = <b>{plain(r.index_value, 2)}</b>
                        {r.link_year ? `  (linked at ${r.link_year})` : ""}
                      </div>
                    ) : null;
                  }),
                )}
              </div>
              <SqlFor bundle={bundle} tables={["silver_price_index_chained"]} />
            </li>
          )}
          {series.length > 0 && !needs.level && (
            <li>
              <h3>
                Year-on-year change <span className="layer">gold</span>
              </h3>
              <div className="calc">
                {series.map((s) => {
                  const a = idx[`${s}:${year - 1}`], b = idx[`${s}:${year}`];
                  return a && b ? (
                    <div key={s}>
                      {SERIES[s]}: 100 × ({plain(b.index_value, 2)} / {plain(a.index_value, 2)} − 1) = <b>{byUnit(yoy(s), "%")}</b>
                    </div>
                  ) : (
                    <div key={s}>{SERIES[s]}: needs two consecutive years</div>
                  );
                })}
              </div>
              <SqlFor bundle={bundle} tables={["gold_price_transmission"]} />
            </li>
          )}
          {needs.headline && (
            <li>
              <h3>
                Published by the World Bank <span className="layer">bronze to gold</span>
              </h3>
              <div className="calc">
                FP.CPI.TOTL.ZG {year}: <b>{byUnit(row?.headline_inflation_pct, "%")}</b>
              </div>
            </li>
          )}
          <li>
            <h3>
              Certified metric <span className="layer">diamond</span>
            </h3>
            <p className="small">{m?.description}</p>
            <div className="calc">
              {metric} = <b>{byUnit(value, m?.unit ?? "")}</b>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Status {m?.status}, owner {m?.owner}. One definition in <a href={`${REPO}/blob/main/metrics/metrics.yaml`}>metrics.yaml</a> generates this SQL column and the docs; the DAX measure for Fabric comes from the same file next.
            </p>
            <SqlFor bundle={bundle} tables={["diamond_country_year"]} />
          </li>
          <li>
            <h3>Quality gates passed</h3>
            <p className="small muted">Each table is checked against its data contract right after it is built. A failure stops the run before anything is published.</p>
            <ul className="small" style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {contracts.map((t) => (
                <li key={t}>
                  <a href={`${REPO}/blob/main/quality/contracts/${t}.yaml`}>{t}</a>: {rules(t)} rules, key ({bundle.contracts[t].primary_key.join(", ")})
                </li>
              ))}
            </ul>
          </li>
          {bundle.run && (
            <li>
              <h3>Published</h3>
              <p className="small">
                Run <code>{bundle.run.run_id}</code>, {when(bundle.run.published_at)}
                {bundle.run.git_sha && (
                  <>
                    , from commit <a href={`${REPO}/commit/${bundle.run.git_sha}`}>{bundle.run.git_sha.slice(0, 7)}</a>
                  </>
                )}
                . Readers switch to a run only once all its tables are written.
              </p>
            </li>
          )}
        </ol>
      </aside>
    </>
  );
}
