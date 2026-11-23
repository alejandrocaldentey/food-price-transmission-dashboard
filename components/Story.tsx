"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Alert, AlertRule, Country, DiamondRow } from "@/lib/data";
import { byUnit, pct, pp } from "@/lib/format";
import { useCountry } from "./useCountry";
import { EuropeMap } from "./charts/EuropeMap";
import { LineChart } from "./charts/LineChart";
import { RankBars } from "./charts/RankBars";
import { symmetricExtent } from "./charts/scales";
import { TraceNum, useTrace } from "./Trace";
import { Severity } from "./Severity";
import { AutoSelect } from "./AutoSelect";

type Props = { countries: Country[]; diamond: DiamondRow[]; alerts: Alert[]; rules: AlertRule[] };

const MAP_METRICS = [
  { name: "food_price_gap_pp", label: "Shelf minus farm-gate", unit: "pp", note: "Red: shelf prices rose faster than farm-gate prices. Blue: farm-gate prices rose faster, so processors and retailers absorbed costs." },
  { name: "producer_price_change_pct", label: "Farm-gate change", unit: "%", note: "Year-on-year change of the agricultural output price index." },
  { name: "consumer_food_price_change_pct", label: "Shelf change", unit: "%", note: "Year-on-year change of consumer food prices (HICP food and non-alcoholic beverages)." },
  { name: "food_inflation_premium_pp", label: "Food vs all prices", unit: "pp", note: "Red: food prices rose faster than overall inflation." },
] as const;

function corr(a: number[], b: number[]) {
  const n = a.length;
  if (n < 5) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

export function Story({ countries, diamond, alerts, rules }: Props) {
  const names = useMemo(() => Object.fromEntries(countries.map((c) => [c.country_iso3, c.country_name])), [countries]);
  const [iso3, setIso3] = useCountry(countries);
  const trace = useTrace();
  const rows = useMemo(() => diamond.filter((d) => d.country_iso3 === iso3), [diamond, iso3]);
  const levelYears = rows.filter((r) => r.producer_price_index !== null && r.consumer_food_price_index !== null).map((r) => r.year);
  const first = Math.min(...levelYears), last = Math.max(...levelYears);
  const [since, setSince] = useState(first);
  useEffect(() => setSince((s) => (s < first || s >= last ? first : s)), [first, last]);
  const at = (y: number) => rows.find((r) => r.year === y);
  const cum = (k: "producer_price_index" | "consumer_food_price_index") => {
    const a = at(since)?.[k], b = at(last)?.[k];
    return a && b ? 100 * (b / a - 1) : null;
  };
  const farmCum = cum("producer_price_index"), shelfCum = cum("consumer_food_price_index");

  // headline insights, computed for the chosen range
  const inRange = rows.filter((r) => r.year > since && r.producer_price_change_pct !== null);
  const shock = inRange.reduce<DiamondRow | null>((best, r) => (!best || Math.abs(r.producer_price_change_pct!) > Math.abs(best.producer_price_change_pct!) ? r : best), null);
  const after = shock ? at(shock.year + 1) : undefined;
  const latest = [...rows].reverse().find((r) => r.producer_price_change_pct !== null && r.consumer_food_price_change_pct !== null);

  // does the shelf follow the farm? correlation same year vs one year later
  const [lag, setLag] = useState(true);
  const pairs = (k: number) => {
    const a: number[] = [], b: number[] = [];
    for (const r of rows) {
      const p = at(r.year - k)?.producer_price_change_pct, c = r.consumer_food_price_change_pct;
      if (p !== null && p !== undefined && c !== null && c !== undefined) {
        a.push(p);
        b.push(c);
      }
    }
    return corr(a, b);
  };
  const r0 = pairs(0), r1 = pairs(1);
  const europe = useMemo(() => {
    const by: Record<string, Record<number, DiamondRow>> = {};
    for (const d of diamond) (by[d.country_iso3] ??= {})[d.year] = d;
    let wins = 0, n = 0;
    const A0: number[] = [], B0: number[] = [], A1: number[] = [], B1: number[] = [];
    for (const ys of Object.values(by)) {
      const a0: number[] = [], b0: number[] = [], a1: number[] = [], b1: number[] = [];
      for (const d of Object.values(ys)) {
        const c = d.consumer_food_price_change_pct;
        if (c === null) continue;
        if (d.producer_price_change_pct !== null) { a0.push(d.producer_price_change_pct); b0.push(c); }
        const pl = ys[d.year - 1]?.producer_price_change_pct;
        if (pl !== null && pl !== undefined) { a1.push(pl); b1.push(c); }
      }
      const x0 = corr(a0, b0), x1 = corr(a1, b1);
      if (x0 !== null && x1 !== null) { n++; if (x1 > x0) wins++; }
      A0.push(...a0); B0.push(...b0); A1.push(...a1); B1.push(...b1);
    }
    return { wins, n, r0: corr(A0, B0), r1: corr(A1, B1) };
  }, [diamond]);

  const farmLevel = Object.fromEntries(rows.map((r) => [r.year, r.producer_price_index]));
  const shelfLevel = Object.fromEntries(rows.map((r) => [r.year, r.consumer_food_price_index]));
  const farmYoy = Object.fromEntries(rows.map((r) => [lag ? r.year + 1 : r.year, r.producer_price_change_pct]));
  const shelfYoy = Object.fromEntries(rows.map((r) => [r.year, r.consumer_food_price_change_pct]));
  const yoyYears: [number, number] = [first + 1, last + (lag ? 1 : 0)];

  // Europe view
  const allYears = [...new Set(diamond.map((d) => d.year))].sort((a, b) => a - b);
  const [metric, setMetric] = useState<(typeof MAP_METRICS)[number]["name"]>("food_price_gap_pp");
  const mm = MAP_METRICS.find((m) => m.name === metric)!;
  const yearsWithData = allYears.filter((y) => diamond.some((d) => d.year === y && d[metric] !== null));
  const [mapYear, setMapYear] = useState(yearsWithData[yearsWithData.length - 1]);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setMapYear((y) => {
        const i = yearsWithData.indexOf(y);
        if (i >= yearsWithData.length - 1) {
          setPlaying(false);
          return y;
        }
        return yearsWithData[i + 1];
      });
    }, 700);
    return () => clearInterval(timer.current!);
  }, [playing, yearsWithData]);
  const mapValues = Object.fromEntries(diamond.filter((d) => d.year === mapYear).map((d) => [d.country_iso3, d[metric]]));
  const maxAbs = symmetricExtent(diamond.map((d) => d[metric]).filter((v): v is number => v !== null));
  const fmtMap = (v: number) => byUnit(v, mm.unit);
  const rank = Object.entries(mapValues)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ({ iso3: k, name: names[k], value: v as number }));

  const signals = alerts.filter((a) => a.country_iso3 === iso3 && latest && a.year === latest.year);
  const ruleBy = Object.fromEntries(rules.map((r) => [r.rule_id, r]));
  const [table, setTable] = useState(false);

  const countryPicker = (
    <AutoSelect label="Country" value={iso3} onChange={setIso3} options={countries.map((c) => ({ value: c.country_iso3, label: c.country_name }))} />
  );
  const sincePicker = (
    <AutoSelect label="Start year" value={since} onChange={(v) => setSince(Number(v))} options={levelYears.filter((y) => y < last).map((y) => ({ value: y, label: String(y) }))} />
  );

  return (
    <main>
      <section className="wrap hero">
        <h1 className="sentence">
          Since {sincePicker}, farm-gate prices in {countryPicker} {farmCum !== null && farmCum < 0 ? "fell" : "rose"}{" "}
          <span className="farm">
            <TraceNum iso3={iso3} year={last} metric="producer_price_index">
              {Math.abs(farmCum ?? 0).toFixed(0)}%
            </TraceNum>
          </span>{" "}
          and shelf food prices{" "}
          <span className="shelf">
            <TraceNum iso3={iso3} year={last} metric="consumer_food_price_index">
              {Math.abs(shelfCum ?? 0).toFixed(0)}%
            </TraceNum>
          </span>
          .
        </h1>
        <p className="subline">
          {shock && (
            <>
              The sharpest farm-gate move was{" "}
              <TraceNum iso3={iso3} year={shock.year} metric="producer_price_change_pct">
                {pct(shock.producer_price_change_pct)}
              </TraceNum>{" "}
              in {shock.year}. Shelf prices moved {pct(shock.consumer_food_price_change_pct)} that year
              {after?.consumer_food_price_change_pct !== null && after?.consumer_food_price_change_pct !== undefined && <> and {pct(after.consumer_food_price_change_pct)} the next</>}.{" "}
            </>
          )}
          {latest && (
            <>
              In {latest.year}, the gap between shelf and farm-gate was{" "}
              <TraceNum iso3={iso3} year={latest.year} metric="food_price_gap_pp">
                {pp(latest.food_price_gap_pp)}
              </TraceNum>
              .
            </>
          )}
        </p>
        <p className="hint">Every underlined number opens the calculation behind it: the Eurostat figure, the chain-linking, the formula and the quality checks it passed.</p>
      </section>

      <section className="wrap">
        <div className="legend" aria-hidden="true">
          <span>
            <i style={{ background: "var(--farm)" }} />
            Farm-gate price level
          </span>
          <span>
            <i style={{ background: "var(--shelf)" }} />
            Shelf food price level
          </span>
          <span className="muted">Both indexed to 2020 = 100, chain-linked across five Eurostat bases</span>
        </div>
        <LineChart
          ariaLabel={`Farm-gate and shelf food price levels in ${names[iso3]}, ${first} to ${last}`}
          years={[first, last]}
          series={[
            { id: "farm", label: "Farm-gate", color: "var(--farm)", values: farmLevel, width: 2.5 },
            { id: "shelf", label: "Shelf", color: "var(--shelf)", values: shelfLevel, width: 2.5 },
          ]}
          format={(v) => v.toFixed(0)}
          zero={100}
          shadeBefore={since}
          height={360}
          onPick={(y) => trace({ iso3, year: y, metric: "food_price_gap_pp" })}
          pickLabel="Click to trace both numbers"
        />
        <div style={{ marginTop: 8 }}>
          <button className="btn quiet" onClick={() => setTable((t) => !t)} aria-expanded={table}>
            {table ? "Hide the table" : "Show these numbers as a table"}
          </button>
        </div>
        {table && (
          <div className="tablewrap" style={{ maxHeight: 360, overflowY: "auto", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="n">Farm-gate level</th>
                  <th className="n">Shelf level</th>
                  <th className="n">Farm-gate change</th>
                  <th className="n">Shelf change</th>
                  <th className="n">Gap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year}>
                    <td>{r.year}</td>
                    <td className="n">{byUnit(r.producer_price_index, "index")}</td>
                    <td className="n">{byUnit(r.consumer_food_price_index, "index")}</td>
                    <td className="n">{pct(r.producer_price_change_pct)}</td>
                    <td className="n">{pct(r.consumer_food_price_change_pct)}</td>
                    <td className="n">{pp(r.food_price_gap_pp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wrap section">
        <div className="split">
          <div>
            <div className="controls">
              <button className="btn" aria-pressed={lag} onClick={() => setLag((l) => !l)}>
                {lag ? "Showing farm-gate shifted one year later" : "Shift farm-gate one year later"}
              </button>
            </div>
            <LineChart
              ariaLabel={`Year-on-year farm-gate and shelf price changes in ${names[iso3]}`}
              years={yoyYears}
              series={[
                { id: "farm", label: lag ? "Farm-gate, year before" : "Farm-gate", color: "var(--farm)", values: farmYoy },
                { id: "shelf", label: "Shelf", color: "var(--shelf)", values: shelfYoy },
              ]}
              format={(v) => pct(v, 0)}
              zero={0}
              height={300}
              onPick={(y) => trace({ iso3, year: y, metric: "consumer_food_price_change_pct" })}
              pickLabel="Click to trace the shelf change"
            />
          </div>
          <div>
            <h2>Does the shelf follow the farm?</h2>
            <p className="prose" style={{ marginTop: "0.75rem" }}>
              Farm-gate prices move first and further. Across Europe, shelf prices track last year&apos;s farm-gate change more closely than this year&apos;s in {europe.wins} of {europe.n} countries (pooled r {europe.r1?.toFixed(2)} against {europe.r0?.toFixed(2)}): processing, contracts and retail pricing take about a year to pass a cost change on.
            </p>
            <p className="prose">
              {r0 !== null && r1 !== null && (r1 >= r0
                ? <>{names[iso3]} follows that pattern. Shift the farm-gate line one year later and the two lines line up.</>
                : <>{names[iso3]} is an exception: its shelf prices move more with this year&apos;s farm-gate change. Toggle the shift to compare.</>)}
            </p>
            <table style={{ marginTop: "1.25rem", maxWidth: 420 }}>
              <thead>
                <tr>
                  <th>Correlation with shelf prices in {names[iso3]}</th>
                  <th className="n">r</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Farm-gate change in the same year</td>
                  <td className="n">{r0 === null ? "n/a" : r0.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Farm-gate change one year earlier</td>
                  <td className="n">
                    <b>{r1 === null ? "n/a" : r1.toFixed(2)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="prose small" style={{ marginTop: "1rem" }}>
              That lag is what makes a forecast possible. The <Link href={`/forecast?c=${iso3}`}>forecast</Link> turns it into next year&apos;s number, with its error published.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap section">
          <div className="section-head">
            <h2>Across Europe</h2>
            <p className="prose">{mm.note} Pick a country on the map or in the ranking to tell its story above.</p>
          </div>
          <div className="controls">
            <div className="seg" role="group" aria-label="Metric">
              {MAP_METRICS.map((m) => (
                <button key={m.name} aria-pressed={metric === m.name} onClick={() => setMetric(m.name)}>
                  {m.label}
                </button>
              ))}
            </div>
            <label className="field">
              <button className="btn" onClick={() => {
                if (!playing && mapYear === yearsWithData[yearsWithData.length - 1]) setMapYear(yearsWithData[0]);
                setPlaying((p) => !p);
              }} aria-pressed={playing}>
                {playing ? "Pause" : "Play years"}
              </button>
              <input
                type="range"
                min={0}
                max={yearsWithData.length - 1}
                value={Math.max(0, yearsWithData.indexOf(mapYear))}
                onChange={(e) => setMapYear(yearsWithData[Number(e.target.value)])}
                aria-label="Year"
                style={{ width: 200 }}
              />
              <b style={{ fontFamily: "var(--display)", fontSize: "1.3rem", minWidth: "3ch" }}>{mapYear}</b>
            </label>
          </div>
          <div className="split even">
            <EuropeMap values={mapValues} names={names} maxAbs={maxAbs} selected={iso3} onSelect={setIso3} format={fmtMap} label={`${mm.label} by country in ${mapYear}`} />
            <div>
              <RankBars rows={rank} maxAbs={maxAbs} selected={iso3} onSelect={setIso3} format={fmtMap} label={`${mm.label} ranking, ${mapYear}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Signals for {names[iso3]} in {latest?.year}</h2>
          <Link className="btn" href={`/decisions?c=${iso3}`}>
            See what each team should do
          </Link>
          <p className="prose">Alert rules are versioned code, evaluated in the pipeline after every refresh. Thresholds never live inside a chart.</p>
        </div>
        {signals.length === 0 ? (
          <p className="muted">No rule fired for {names[iso3]} in {latest?.year}.</p>
        ) : (
          <ul className="alert-list">
            {signals.map((a) => (
              <li key={a.alert_id}>
                <div className="alert-row" style={{ cursor: "default", gridTemplateColumns: "6.5rem minmax(0,1fr) 6.5rem" }}>
                  <Severity level={a.severity} />
                  <span className="what">
                    <b>{ruleBy[a.rule_id]?.label}</b>
                    <span>{a.rule_id === "forecast_food_inflation" ? `Forecast for ${a.year + 1}` : `${a.year}`}</span>
                  </span>
                  <span className="val">{byUnit(a.value, ruleBy[a.rule_id]?.unit ?? "")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
