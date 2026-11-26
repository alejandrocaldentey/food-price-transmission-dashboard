"use client";
import { useMemo, useState } from "react";
import type { Alert, AlertRule, Country, Model, Play, Role } from "@/lib/data";
import { byUnit, plain } from "@/lib/format";
import { AutoSelect } from "./AutoSelect";
import { sequential } from "./charts/scales";
import { useDark } from "./charts/useDark";
import { useWidth } from "./charts/useWidth";
import { Severity } from "./Severity";
import { useCountry } from "./useCountry";

type Props = { countries: Country[]; rules: AlertRule[]; alerts: Alert[]; roles: Role[]; plays: Play[]; models: Model[] };
const CATS = ["market", "forecast", "data", "model"] as const;
const CAT_LABEL = { market: "Market", forecast: "Forecast", data: "Data quality", model: "Model health" };

function threshold(rule: AlertRule, sev: "high" | "medium") {
  const w = rule.levels.find((l) => l.severity === sev)?.when;
  return w ? w.replace("{value}", "value").replace("ABS(value)", "|value|") : "n/a";
}

export function Decisions({ countries, rules, alerts, roles, plays, models }: Props) {
  const names = Object.fromEntries(countries.map((c) => [c.country_iso3, c.country_name]));
  const [iso3, setIso3] = useCountry(countries);
  const [scope, setScope] = useState<"all" | "one">("all");
  const [role, setRole] = useState(roles[0]?.role_id);
  const [cats, setCats] = useState<Record<string, boolean>>({ market: true, forecast: true, data: true, model: true });
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const ruleBy = Object.fromEntries(rules.map((r) => [r.rule_id, r]));
  const marketYears = alerts.filter((a) => a.category === "market").map((a) => a.year);
  const latestYear = Math.max(...marketYears);
  const [year, setYear] = useState(latestYear);
  const playFor = (rule: string) => plays.find((p) => p.rule_id === rule && p.role_id === role);
  const roleObj = roles.find((r) => r.role_id === role);

  // forecast and data alerts sit on the latest data year; model alerts on the training year
  const current = alerts.filter((a) => {
    if (a.category === "model") return year === latestYear;
    return a.year === year;
  });
  const visible = current
    .filter((a) => cats[a.category])
    .filter((a) => !onlyHigh || a.severity === "high")
    .filter((a) => scope === "all" || a.country_iso3 === iso3 || a.country_iso3 === null)
    .sort((a, b) => (a.severity === b.severity ? Math.abs(b.value) - Math.abs(a.value) : a.severity === "high" ? -1 : 1));
  const high = visible.filter((a) => a.severity === "high").length;
  const withPlay = visible.filter((a) => playFor(a.rule_id)).length;

  const champion = models.find((m) => m.is_champion);
  const drift = champion && champion.mae_recent !== null ? champion.mae_recent / champion.mae : null;

  return (
    <main>
      <section className="wrap hero">
        <h1 className="sentence" style={{ maxWidth: "30ch", fontSize: "clamp(1.9rem, 3.6vw, 2.9rem)" }}>
          {withPlay} signal{withPlay === 1 ? "" : "s"} to act on in{" "}
          <AutoSelect label="Year" value={year} onChange={(v) => setYear(Number(v))} options={[...new Set(marketYears)].sort((a, b) => b - a).map((y) => ({ value: y, label: String(y) }))} />, for{" "}
          <AutoSelect label="Role" value={role} onChange={setRole} options={roles.map((r) => ({ value: r.role_id, label: asRole(r.label) }))} />.
        </h1>
        <p className="subline">{roleObj?.focus} Each signal below poses the business question it forces and the data work that answers it. The decision stays with the business owner; the data team owns the evidence.</p>
      </section>

      <section className="wrap">
        <div className="controls">
          <div className="seg" role="group" aria-label="Countries">
            <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              All countries
            </button>
            <button aria-pressed={scope === "one"} onClick={() => setScope("one")}>
              Only {names[iso3]}
            </button>
          </div>
          {scope === "one" && (
            <label className="field">
              Country
              <select value={iso3} onChange={(e) => setIso3(e.target.value)}>
                {countries.map((c) => (
                  <option key={c.country_iso3} value={c.country_iso3}>
                    {c.country_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="seg" role="group" aria-label="Signal types">
            {CATS.map((c) => (
              <button key={c} aria-pressed={cats[c]} onClick={() => setCats((s) => ({ ...s, [c]: !s[c] }))}>
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Severity">
            <button aria-pressed={!onlyHigh} onClick={() => setOnlyHigh(false)}>
              High and medium
            </button>
            <button aria-pressed={onlyHigh} onClick={() => setOnlyHigh(true)}>
              High only
            </button>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: "0.75rem" }}>
          {visible.length} signal{visible.length === 1 ? "" : "s"}, {high} high. Open one to see the play for your role.
        </p>
        {visible.length === 0 ? (
          <p className="muted" style={{ padding: "1.5rem 0" }}>No rule fired with these filters. Widen the signal types or pick another year.</p>
        ) : (
          <ul className="alert-list">
            {(all ? visible : visible.slice(0, 10)).map((a) => {
              const r = ruleBy[a.rule_id];
              const play = playFor(a.rule_id);
              const isOpen = open === a.alert_id;
              const when = a.category === "forecast" ? `for ${a.year + 1}` : a.category === "model" ? `trained through ${a.year}` : `${a.year}`;
              return (
                <li key={a.alert_id}>
                  <button className="alert-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.alert_id)}>
                    <Severity level={a.severity} />
                    <span className="what">
                      <b>
                        {r?.label}
                        {a.country_iso3 ? `, ${names[a.country_iso3] ?? a.country_iso3}` : ", whole platform"}
                      </b>
                      <span>
                        {CAT_LABEL[a.category]}, {when}
                        {!play && " (no play for this role)"}
                      </span>
                    </span>
                    <span className="val">{byUnit(a.value, r?.unit ?? "")}</span>
                    <span className="chev" aria-hidden="true" style={{ color: "var(--ink-3)" }}>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="play">
                      <div style={{ gridColumn: "1 / -1" }}>
                        <p className="muted">{message(r, a, names)}</p>
                      </div>
                      {play ? (
                        <>
                          <div>
                            <h4>Business question</h4>
                            <p>{play.question}</p>
                          </div>
                          <div>
                            <h4>Data work that answers it</h4>
                            <p>{play.data}</p>
                          </div>
                          <div>
                            <h4>KPI to add</h4>
                            <p>{play.kpi}</p>
                          </div>
                          <div>
                            <h4>Horizon and exposure</h4>
                            <p>
                              {play.horizon}, {play.exposure === "trust" ? "trust in the numbers" : `${play.exposure} line`}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p style={{ gridColumn: "1 / -1" }}>This rule has no play for {roleObj?.label}. It matters to other roles; switch role above to read theirs.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {visible.length > 10 && (
          <button className="btn quiet" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>
            {all ? "Show the top 10" : `Show all ${visible.length} signals`}
          </button>
        )}
      </section>

      <section className="band">
        <div className="wrap section">
          <div className="section-head">
            <h2>When the alarms rang</h2>
            <p className="prose">Market rules fired per country and year since 2001. A stronger colour means more rules fired at once. 2022 lights up almost everywhere; click a cell to read that year&apos;s signals.</p>
          </div>
          <HeatGrid
            alerts={alerts.filter((a) => a.category === "market")}
            names={names}
            selected={{ iso3: scope === "one" ? iso3 : null, year }}
            onPick={(c, y) => {
              setIso3(c);
              setScope("one");
              setYear(y);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Rule monitor</h2>
          <p className="prose">
            Every rule lives in <a href="https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices/blob/main/decisions/rules.yaml">rules.yaml</a>, is reviewed in a pull request and compiles to SQL that runs after each refresh. On Fabric, the same table is designed to feed Activator for notifications.
          </p>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Type</th>
                <th>Tests</th>
                <th>High when</th>
                <th>Medium when</th>
                <th className="n">Firing in {latestYear}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const now = alerts.filter((a) => a.rule_id === r.rule_id && (r.category === "model" || a.year === latestYear));
                return (
                  <tr key={r.rule_id}>
                    <td>
                      <b>{r.label}</b>
                      <div className="small muted">
                        <code>{r.rule_id}</code>
                      </div>
                    </td>
                    <td>{CAT_LABEL[r.category]}</td>
                    <td>
                      <code>{r.value_expression.replace(/^a\.|^m\./, "")}</code>
                    </td>
                    <td>
                      <code>{threshold(r, "high")}</code>
                    </td>
                    <td>
                      <code>{threshold(r, "medium")}</code>
                    </td>
                    <td className="n">
                      {r.rule_id === "model_drift" ? (
                        <>
                          {now.length} <span className="small muted">(now {plain(drift, 2)}×)</span>
                        </>
                      ) : (
                        now.length
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/** "Head of Data · Food manufacturer" reads as "head of data at a food manufacturer" in a sentence. */
function asRole(label: string) {
  const [who, where] = label.split(" · ");
  const w = who.charAt(0).toLowerCase() + who.slice(1);
  const article = /^[aeiou]/i.test(w) ? "an" : "a";
  return where ? `${article} ${w.replace("Data", "data")} at a ${where.toLowerCase().replace(" or distributor", "")}` : `${article} ${w}`;
}

function message(r: AlertRule | undefined, a: Alert, names: Record<string, string>) {
  if (!r) return "";
  const v = byUnit(a.value, r.unit);
  return r.message
    .replaceAll("{value}", v)
    .replaceAll("{abs}", byUnit(Math.abs(a.value), r.unit).replace(/^\+/, ""))
    .replaceAll("{year}", String(a.year))
    .replaceAll("{next_year}", String(a.year + 1))
    .replaceAll("{country}", a.country_iso3 ? names[a.country_iso3] : "");
}

function HeatGrid({ alerts, names, selected, onPick }: { alerts: Alert[]; names: Record<string, string>; selected: { iso3: string | null; year: number }; onPick: (iso3: string, year: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>(1000);
  const dark = useDark();
  const [hover, setHover] = useState<{ c: string; y: number; n: number; x: number; top: number } | null>(null);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of alerts) if (a.country_iso3) m[`${a.country_iso3}:${a.year}`] = (m[`${a.country_iso3}:${a.year}`] ?? 0) + 1;
    return m;
  }, [alerts]);
  const years = [...new Set(alerts.map((a) => a.year))].sort((a, b) => a - b);
  const cs = Object.keys(names).sort((a, b) => names[a].localeCompare(names[b]));
  const max = Math.max(...Object.values(counts));
  const color = sequential(max, dark);
  const left = 112, top = 22;
  const cw = (width - left - 4) / years.length;
  const ch = 18;
  const h = top + cs.length * ch + 4;
  return (
    <div className="figure" ref={ref}>
      <svg viewBox={`0 0 ${width} ${h}`} role="img" aria-label="Number of market alerts by country and year">
        {years.map((y, i) =>
          i % (cw < 34 ? 5 : 1) === 0 || y === years[years.length - 1] ? (
            <text key={y} x={left + i * cw + cw / 2} y={14} textAnchor="middle" className="tick">
              {y}
            </text>
          ) : null,
        )}
        {cs.map((c, j) => (
          <g key={c}>
            <text x={left - 8} y={top + j * ch + ch / 2} dy="0.32em" textAnchor="end" style={{ fontSize: 12, fill: c === selected.iso3 ? "var(--ink)" : "var(--ink-2)", fontWeight: c === selected.iso3 ? 700 : 400 }}>
              {names[c]}
            </text>
            {years.map((y, i) => {
              const n = counts[`${c}:${y}`] ?? 0;
              const on = c === selected.iso3 && y === selected.year;
              return (
                <rect
                  key={y}
                  x={left + i * cw + 1}
                  y={top + j * ch + 1}
                  width={cw - 2}
                  height={ch - 2}
                  rx={2}
                  fill={n ? color(n) : "var(--sunk)"}
                  stroke={on ? "var(--ink)" : "none"}
                  strokeWidth={on ? 2 : 0}
                  style={{ cursor: "pointer" }}
                  onPointerEnter={() => setHover({ c, y, n, x: left + i * cw, top: top + j * ch })}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onPick(c, y)}
                />
              );
            })}
          </g>
        ))}
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 20, width - 200), top: hover.top + 22 }}>
          <div className="r">
            <span>
              {names[hover.c]}, {hover.y}
            </span>
            <b>
              {hover.n} rule{hover.n === 1 ? "" : "s"}
            </b>
          </div>
          <div className="foot small">Click to read them</div>
        </div>
      )}
    </div>
  );
}
