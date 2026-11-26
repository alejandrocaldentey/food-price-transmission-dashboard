"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BacktestRow, Coef, Country, DiamondRow, ForecastRow, Model } from "@/lib/data";
import { pct, plain } from "@/lib/format";
import { predict, TERMS } from "@/lib/simulator";
import { AutoSelect } from "./AutoSelect";
import { LineChart, type Series } from "./charts/LineChart";
import { useWidth } from "./charts/useWidth";
import { useCountry } from "./useCountry";

type Props = {
  countries: Country[];
  diamond: DiamondRow[];
  models: Model[];
  backtest: BacktestRow[];
  forecast: ForecastRow[];
  coef: Coef[];
  rule: { min_skill_vs_naive: number; tolerance: number };
};

const COLOR: Record<Model["model_id"], string> = { naive: "var(--ink-3)", panel_dl: "var(--s3)", gbm: "var(--s5)" };
const DASH: Record<Model["model_id"], string | undefined> = { naive: "4 4", panel_dl: undefined, gbm: undefined };

export function Forecast({ countries, diamond, models, backtest, forecast, coef, rule }: Props) {
  const [iso3, setIso3] = useCountry(countries);
  const names = Object.fromEntries(countries.map((c) => [c.country_iso3, c.country_name]));
  const champion = models.find((m) => m.is_champion)!;
  const [shown, setShown] = useState<Record<string, boolean>>({ naive: false, panel_dl: true, gbm: true });

  const fc = forecast.filter((f) => f.country_iso3 === iso3);
  const champFc = fc.find((f) => f.is_champion);
  const actual = Object.fromEntries(diamond.filter((d) => d.country_iso3 === iso3).map((d) => [d.year, d.consumer_food_price_change_pct]));
  const target = champFc?.target_year ?? new Date().getFullYear();
  const lastActual = target - 1;

  const series: Series[] = [{ id: "actual", label: "Actual", color: "var(--shelf)", values: actual, width: 2.5 }];
  for (const m of models) {
    if (!shown[m.model_id]) continue;
    const values: Record<number, number> = {};
    for (const b of backtest) if (b.model_id === m.model_id && b.country_iso3 === iso3) values[b.year] = b.predicted;
    const f = fc.find((x) => x.model_id === m.model_id);
    if (f) values[f.target_year] = f.predicted;
    series.push({ id: m.model_id, label: m.label.replace(" regression", "").replace("Panel distributed-lag", "Regression"), color: COLOR[m.model_id], values, dash: DASH[m.model_id], points: false, width: m.is_champion ? 2.25 : 1.75 });
  }
  const band = champFc && actual[lastActual] !== null && actual[lastActual] !== undefined
    ? { lower: { [lastActual]: actual[lastActual] as number, [target]: champFc.lower_80 }, upper: { [lastActual]: actual[lastActual] as number, [target]: champFc.upper_80 }, color: "var(--s3)", label: "80% interval" }
    : undefined;

  // simulator, starting from the published inputs
  const base = useMemo(() => {
    const f = forecast.find((x) => x.country_iso3 === iso3 && x.model_id === "panel_dl");
    return f ? { consumer: f.input_consumer_yoy, producer: f.input_producer_yoy, producerLag: f.input_producer_yoy_lag1, published: f.predicted } : null;
  }, [forecast, iso3]);
  const [x, setX] = useState({ consumer: 0, producer: 0, producerLag: 0 });
  useEffect(() => {
    if (base) setX({ consumer: base.consumer, producer: base.producer, producerLag: base.producerLag });
  }, [base]);
  const sim = predict(coef, iso3, x);
  const atBase = base && Math.abs(x.consumer - base.consumer) < 1e-9 && Math.abs(x.producer - base.producer) < 1e-9 && Math.abs(x.producerLag - base.producerLag) < 1e-9;
  const slope = Object.fromEntries(sim.parts.map((p) => [p.term, p.coef]));

  return (
    <main>
      <section className="wrap hero">
        <h1 className="sentence" style={{ maxWidth: "24ch" }}>
          In {target}, shelf food prices in{" "}
          <AutoSelect label="Country" value={iso3} onChange={setIso3} options={countries.map((c) => ({ value: c.country_iso3, label: c.country_name }))} /> should change{" "}
          <span className="shelf">{pct(champFc?.predicted)}</span>.
        </h1>
        <p className="subline">
          That is the champion model&apos;s forecast, with an 80% chance of landing between {pct(champFc?.lower_80)} and {pct(champFc?.upper_80)}. It uses only what was known at the end of {lastActual}: this year&apos;s shelf and farm-gate changes, and last year&apos;s farm-gate change.
        </p>
      </section>

      <section className="wrap">
        <div className="controls">
          <span className="small muted">Show backtest of</span>
          <div className="seg" role="group" aria-label="Models">
            {models.map((m) => (
              <button key={m.model_id} aria-pressed={shown[m.model_id]} onClick={() => setShown((s) => ({ ...s, [m.model_id]: !s[m.model_id] }))}>
                <span style={{ display: "inline-block", width: 14, height: 2, background: COLOR[m.model_id], marginRight: 6, verticalAlign: "middle", borderTop: m.model_id === "naive" ? "2px dashed var(--ink-3)" : undefined }} />
                {m.label}
                {m.is_champion && " (champion)"}
              </button>
            ))}
          </div>
        </div>
        <LineChart
          ariaLabel={`Consumer food price change in ${names[iso3]}: actual, out-of-sample predictions and the ${target} forecast`}
          years={[2005, target]}
          series={series}
          band={band}
          format={(v) => pct(v, 0)}
          zero={0}
          height={380}
          marks={[{ year: 2010, label: "backtest starts" }]}
        />
        <p className="small muted" style={{ marginTop: 6 }}>
          From 2010, every prediction comes from a model trained only on earlier years: no future data leaks into the score. The shaded fan is the champion&apos;s 80% interval for {target}.
        </p>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Three models, one champion</h2>
          <p className="prose">
            Scored on {champion.n_backtest} out-of-sample forecasts across 27 countries, 2010 to {champion.trained_through}. Error is the mean absolute error in percentage points of food inflation.
          </p>
        </div>
        <div className="split">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="n">Error (MAE)</th>
                  <th className="n">Better than naive</th>
                  <th className="n">Error in shock years</th>
                  <th className="n">Error, last 3 years</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.model_id} className={m.is_champion ? "is-champ" : undefined}>
                    <td>
                      <b>{m.label}</b>
                      <div className="small muted">{m.family}</div>
                      {m.is_champion && <span className="champ">Champion</span>}
                    </td>
                    <td className="n">{plain(m.mae, 2)} pp</td>
                    <td className="n">{m.model_id === "naive" ? "reference" : `${((m.skill_vs_naive ?? 0) * 100).toFixed(0)}%`}</td>
                    <td className="n">{plain(m.mae_shock_years, 2)} pp</td>
                    <td className="n">{plain(m.mae_recent, 2)} pp</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <ChampionRule models={models} rule={rule} />
            <p className="prose small" style={{ marginTop: "0.75rem" }}>
              The rule, in <a href="https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices/blob/main/ml/models.yaml">models.yaml</a>: a model must cut the naive error by at least {rule.min_skill_vs_naive * 100}%, and the simplest model within {rule.tolerance * 100}% of the best error wins. Complexity has to earn its place.
            </p>
          </div>
        </div>
        <p className="prose" style={{ marginTop: "1.5rem" }}>
          <b>Why the {champion.label.toLowerCase()} wins here.</b>{" "}
          {champion.model_id === "panel_dl"
            ? "It ties gradient boosting on error and cuts the naive error by about a fifth, and every coefficient has a meaning a buyer or a CFO can challenge. Gradient boosting does better in shock years, so it stays as the challenger to watch: if the next shocks keep favouring it, the rule will promote it on its own."
            : champion.model_id === "gbm"
              ? "It beats the regression by more than the tolerance, so its extra complexity has earned its place on this data."
              : "No model beats the naive baseline by enough, so the baseline stays: a forecast that cannot beat \"same as this year\" should not drive decisions."}
        </p>
      </section>

      <section className="band">
        <div className="wrap section">
          <div className="section-head">
            <h2>How each model works and when to use it</h2>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "14%" }} />
                  {models.map((m) => (
                    <th key={m.model_id}>
                      <span style={{ display: "inline-block", width: 14, height: 2, background: COLOR[m.model_id], marginRight: 6, verticalAlign: "middle" }} />
                      {m.label} {m.is_champion && <span className="champ">Champion</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Formula", "formula"],
                    ["How it works", "how_it_works"],
                    ["Strengths", "strengths"],
                    ["Weaknesses", "weaknesses"],
                    ["When to use it", "when_to_use"],
                  ] as const
                ).map(([label, k]) => (
                  <tr key={k}>
                    <th scope="row" style={{ verticalAlign: "top", borderBottom: "1px solid var(--rule)" }}>
                      {label}
                    </th>
                    {models.map((m) => (
                      <td key={m.model_id}>{k === "formula" ? <code>{m[k]}</code> : m[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Shock simulator</h2>
          <p className="prose">
            Move this year&apos;s numbers and see next year&apos;s shelf price change for {names[iso3]}. The browser does not fit anything: it applies the coefficients the pipeline published, and the deploy fails if this formula stops reproducing the pipeline&apos;s forecasts (ADR 0009).
          </p>
        </div>
        <div className="split">
          <div>
            {TERMS.map((t, i) => {
              const key = (["consumer", "producer", "producerLag"] as const)[i];
              return (
                <label key={t.term} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 5.5rem", gap: "0.25rem 1rem", alignItems: "center", marginBottom: "1.1rem" }}>
                  <span>
                    {t.label} <span className="muted small">({t.term.includes("lag") ? lastActual - 1 : lastActual})</span>
                  </span>
                  <b style={{ textAlign: "right", fontFamily: "var(--display)", fontSize: "1.2rem" }}>{pct(x[key])}</b>
                  <input
                    type="range"
                    min={-30}
                    max={40}
                    step={0.5}
                    value={x[key]}
                    onChange={(e) => setX((s) => ({ ...s, [key]: Number(e.target.value) }))}
                    style={{ gridColumn: "1 / -1", width: "100%" }}
                    aria-label={t.label}
                  />
                </label>
              );
            })}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {base && (
                <button className="btn" onClick={() => setX({ consumer: base.consumer, producer: base.producer, producerLag: base.producerLag })}>
                  Reset to {lastActual} data
                </button>
              )}
              <button className="btn" onClick={() => setX((s) => ({ ...s, producer: 25 }))}>
                Replay a 2022-size farm-gate shock (+25%)
              </button>
            </div>
          </div>
          <div className="panel">
            <p className="muted small">Expected shelf food price change, {target}</p>
            <p style={{ fontFamily: "var(--display)", fontSize: "3rem", fontWeight: 600, lineHeight: 1.1 }}>{pct(sim.total)}</p>
            <p className="small" style={{ marginTop: 4 }}>
              {atBase ? (
                <span className="sev" style={{ color: "var(--accent)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <circle cx="7" cy="7" r="6" fill="currentColor" />
                    <path d="M4 7.2 L6.2 9.3 L10 5" stroke="var(--bg)" strokeWidth="1.6" fill="none" />
                  </svg>
                  Matches the pipeline&apos;s published forecast ({pct(base?.published, 2)})
                </span>
              ) : (
                <span className="muted">Scenario: differs from the published inputs</span>
              )}
            </p>
            <Waterfall intercept={sim.intercept} parts={sim.parts} total={sim.total} country={names[iso3]} />
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              Read it as: every extra point of farm-gate inflation this year adds {plain(slope.producer_yoy_pct, 2)} points to shelf inflation next year; this year&apos;s shelf inflation carries over at {plain(slope.consumer_food_yoy_pct, 2)}.
            </p>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>How to use this forecast</h2>
        </div>
        <div className="principles">
          <div>
            <h3>Plan on the interval, not the point</h3>
            <p>An 80% interval about {plain((champFc?.upper_80 ?? 0) - (champFc?.lower_80 ?? 0), 0)} points wide is honest for annual data. Budget the margin at both ends.</p>
          </div>
          <div>
            <h3>Cite the run, not a screenshot</h3>
            <p>Every forecast belongs to a published run with its model version. Plans that cite the same run argue about decisions, not numbers.</p>
          </div>
          <div>
            <h3>Watch the challenger in shocks</h3>
            <p>Gradient boosting errs less when farm-gate prices jump. If a shock is unfolding, read both forecasts.</p>
          </div>
          <div>
            <h3>Trust has a monitor</h3>
            <p>
              A drift rule compares the champion&apos;s recent error with its long-run error and raises an alert for the data team. See <Link href="/decisions">decisions</Link>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ChampionRule({ models, rule }: { models: Model[]; rule: { min_skill_vs_naive: number; tolerance: number } }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const naive = models.find((m) => m.model_id === "naive")!;
  const eligible = models.filter((m) => m.model_id !== "naive" && (m.skill_vs_naive ?? 0) >= rule.min_skill_vs_naive);
  const best = Math.min(...eligible.map((m) => m.mae), naive.mae);
  const max = naive.mae * 1.1;
  const m = { left: 140, right: 60 };
  const x = (v: number) => m.left + (v / max) * (width - m.left - m.right);
  const rowH = 38;
  const h = models.length * rowH + 40;
  return (
    <div ref={ref} className="figure">
      <svg viewBox={`0 0 ${width} ${h}`} role="img" aria-label="Error by model with the champion tolerance band">
        <rect x={x(best)} y={0} width={x(best * (1 + rule.tolerance)) - x(best)} height={models.length * rowH} fill="var(--accent-wash)" />
        <line x1={x(naive.mae * (1 - rule.min_skill_vs_naive))} x2={x(naive.mae * (1 - rule.min_skill_vs_naive))} y1={0} y2={models.length * rowH} stroke="var(--ink-3)" strokeDasharray="3 3" />
        {models.map((md, i) => (
          <g key={md.model_id} transform={`translate(0,${i * rowH})`}>
            <text x={m.left - 10} y={rowH / 2} dy="0.32em" textAnchor="end" style={{ fontSize: 12, fill: "var(--ink)", fontWeight: md.is_champion ? 700 : 400 }}>
              {md.label.replace("Panel distributed-lag regression", "Regression")}
            </text>
            <rect x={m.left} y={rowH / 2 - 7} width={x(md.mae) - m.left} height={14} rx={3} fill={COLOR[md.model_id]} />
            <text x={x(md.mae) + 6} y={rowH / 2} dy="0.32em" style={{ fontSize: 12, fill: "var(--ink)", fontWeight: 700 }}>
              {plain(md.mae, 2)}
            </text>
          </g>
        ))}
        <text x={x(best)} y={models.length * rowH + 16} style={{ fontSize: 11, fill: "var(--accent)" }}>
          within {rule.tolerance * 100}% of best
        </text>
        <text x={x(naive.mae * (1 - rule.min_skill_vs_naive))} y={models.length * rowH + 32} textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-3)" }}>
          must beat naive by {rule.min_skill_vs_naive * 100}%
        </text>
      </svg>
    </div>
  );
}

function Waterfall({ intercept, parts, total, country }: { intercept: number; parts: { label: string; contribution: number }[]; total: number; country: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const steps = [{ label: `${country} baseline`, contribution: intercept }, ...parts];
  let run = 0;
  const bars = steps.map((s) => {
    const from = run;
    run += s.contribution;
    return { ...s, from, to: run };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)), total);
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)), total);
  const m = { left: 190, right: 56 };
  const x = (v: number) => m.left + ((v - lo) / (hi - lo || 1)) * (width - m.left - m.right);
  const rowH = 30;
  const rows = [...bars, { label: "Forecast", contribution: total, from: 0, to: total }];
  return (
    <div ref={ref} className="figure" style={{ marginTop: "1rem" }}>
      <svg viewBox={`0 0 ${width} ${rows.length * rowH + 6}`} role="img" aria-label="Contribution of each input to the forecast">
        <line className="zero" x1={x(0)} x2={x(0)} y1={0} y2={rows.length * rowH} />
        {rows.map((b, i) => {
          const isTotal = i === rows.length - 1;
          const x0 = x(Math.min(b.from, b.to));
          const w = Math.max(2, Math.abs(x(b.to) - x(b.from)));
          return (
            <g key={b.label} transform={`translate(0,${i * rowH})`}>
              <text x={m.left - 10} y={rowH / 2} dy="0.32em" textAnchor="end" style={{ fontSize: 12, fill: "var(--ink-2)", fontWeight: isTotal ? 700 : 400 }}>
                {b.label}
              </text>
              <rect x={x0} y={rowH / 2 - 8} width={w} height={16} rx={2} fill={isTotal ? "var(--shelf)" : b.contribution >= 0 ? "var(--s3)" : "var(--neg)"} opacity={isTotal ? 1 : 0.85} />
              <text x={Math.max(x(b.from), x(b.to)) + 6} y={rowH / 2} dy="0.32em" style={{ fontSize: 12, fill: "var(--ink)", fontWeight: 600 }}>
                {pct(isTotal ? total : b.contribution, 2).replace("%", " pp").replace(" pp", isTotal ? "%" : " pp")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
