"use client";
// The architecture page is rendered from the platform's own metadata (lineage parsed from the
// SQL, contracts, run statistics, cost model), published with every run. It cannot drift from
// what actually runs.
import { useMemo, useState } from "react";
import type { Artifacts, Contract, CostModel } from "@/lib/data";
import { when } from "@/lib/format";
import { useWidth } from "./charts/useWidth";

const REPO = "https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices";
const COLUMNS = ["Sources", "Bronze", "Silver", "Gold", "Diamond", "Predictive", "Decision", "Serving", "Experience"] as const;
type Col = (typeof COLUMNS)[number];

type Node = { id: string; label: string; col: Col; kind: "table" | "source" | "seed" | "serving" | "page" | "python"; sub?: string };

/** The column already names the layer, so the box can drop the prefix. */
const short = (t: string) => t.replace(/^(silver|gold|diamond|ml|decision|bronze|seed)_/, "");

const LAYER_TEXT: Record<Col, { what: string; guarantee: string; adr?: string }> = {
  Sources: { what: "Live public APIs and versioned reference seeds.", guarantee: "Each source has a declared load strategy: rolling window with MERGE by default.", adr: "0005-load-strategy-window-merge" },
  Bronze: { what: "Raw API responses with ingestion metadata, untouched.", guarantee: "Replayable: any downstream table can be rebuilt from bronze." },
  Silver: { what: "Typed, deduplicated, conformed observations; one continuous index per country.", guarantee: "Contracts checked before gold is touched; five index bases chain-linked to 2020 = 100.", adr: "0010-chain-linked-price-indices" },
  Gold: { what: "Star schema and the producer-versus-consumer transmission table.", guarantee: "Year-on-year changes only between consecutive years: no silent gaps.", adr: "0003-portable-sql-transformations" },
  Diamond: { what: "Certified metrics generated from one catalogue.", guarantee: "One definition per number, shared by the SQL, the docs and this site.", adr: "0006-diamond-metrics-layer" },
  Predictive: { what: "Three models, rolling-origin backtest, champion, forecast and published coefficients.", guarantee: "No future data in any score; complexity must beat the baseline to win.", adr: "0011-model-selection-champion-challenger" },
  Decision: { what: "Alert rules compiled from YAML; playbooks per role.", guarantee: "Thresholds are reviewed in pull requests, never hidden in a chart.", adr: "0012-decision-layer" },
  Serving: { what: "Read-only Postgres (Supabase) with row-level security.", guarantee: "Atomic publish: readers switch to a run only when it is complete.", adr: "0008-public-demo-supabase-vercel" },
  Experience: { what: "This website (Next.js on Vercel).", guarantee: "Applies published numbers only; a parity test fails the deploy if the simulator drifts.", adr: "0009-where-predictions-and-alerts-run" },
};

const ADRS = [
  ["0001", "Microsoft Fabric as the enterprise platform", "Databricks, Snowflake"],
  ["0002", "CI/CD with GitHub Actions and fabric-cicd", "Azure DevOps"],
  ["0003", "Portable SQL tested on DuckDB, run on Spark in Fabric", "PySpark only, dbt"],
  ["0004", "Eurostat instead of FAOSTAT", "FAOSTAT (unreachable from cloud runners)"],
  ["0005", "Rolling window and MERGE by default, per-source override", "Watermark only, full reloads"],
  ["0006", "Diamond layer generated from a metric catalogue", "Measures written per tool"],
  ["0007", "Governance as code, structured as a data product", "Catalogue tool first"],
  ["0008", "Public demo on Supabase and Vercel", "Power BI publish to web, static site"],
  ["0009", "Forecasts and alerts computed in the pipeline; browser applies published coefficients", "All in the browser, API on demand"],
  ["0010", "Chain-link five index bases and rebase to 2020 = 100", "Keep one base, splice growth rates"],
  ["0011", "Champion-challenger: simplest model within 5% of the best", "Lowest error wins"],
  ["0012", "Alert rules as code with role playbooks", "BI conditional formatting, per-user alerts"],
] as const;

const ADR_FILES: Record<string, string> = {
  "0001": "0001-platform-choice",
  "0002": "0002-cicd-github-actions",
  "0003": "0003-portable-sql-transformations",
  "0004": "0004-eurostat-instead-of-faostat",
  "0005": "0005-load-strategy-window-merge",
  "0006": "0006-diamond-metrics-layer",
  "0007": "0007-governance-as-data-product",
  "0008": "0008-public-demo-supabase-vercel",
  "0009": "0009-where-predictions-and-alerts-run",
  "0010": "0010-chain-linked-price-indices",
  "0011": "0011-model-selection-champion-challenger",
  "0012": "0012-decision-layer",
};

const FABRIC = [
  ["Compute and storage", "DuckDB in GitHub Actions", "Fabric Lakehouse (Spark SQL on Delta in OneLake), same SQL files"],
  ["Deployment", "GitHub Actions", "fabric-cicd from GitHub Actions, dev to prod workspaces"],
  ["Metrics", "Diamond table read by the site", "Same Diamond table, plus DAX measures generated from the catalogue in a Direct Lake semantic model"],
  ["Models", "scikit-learn in CI, registry as a table", "Fabric notebooks with MLflow tracking and model registry"],
  ["Alerts", "Alert table shown on the site", "Same table feeding Fabric Activator for notifications"],
  ["Natural-language access", "Not in the demo", "Fabric data agent over the semantic model"],
  ["Serving", "Supabase with row-level security", "Semantic model with row-level security; Supabase kept for the public demo"],
];

function contractRules(c?: Contract) {
  if (!c) return [];
  const out: string[] = [`primary key (${c.primary_key.join(", ")}) is unique`];
  for (const [col, r] of Object.entries(c.columns)) {
    if (r.required) out.push(`${col} is never null`);
    if (r.allowed) out.push(`${col} in {${r.allowed.join(", ")}}`);
    if (r.min !== undefined || r.max !== undefined) out.push(`${col} between ${r.min ?? "−∞"} and ${r.max ?? "∞"}`);
  }
  return out;
}

export function Architecture({ art, publishedAt }: { art: Artifacts; publishedAt: string }) {
  const { lineage, contracts, sql, sources, run } = art;

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: [string, string][] = [];
    for (const s of sources) nodes.push({ id: `src:${s.id}`, label: `${s.api === "eurostat" ? "Eurostat" : "World Bank"} ${s.dataset ?? s.indicator}`, col: "Sources", kind: "source", sub: s.api === "eurostat" ? "Eurostat API" : "World Bank API" });
    for (const [t, layer] of Object.entries(lineage.layers)) {
      const col = (layer === "Seeds" ? "Sources" : layer) as Col;
      nodes.push({ id: t, label: t, col, kind: layer === "Seeds" ? "seed" : t.startsWith("ml_") ? "python" : "table" });
    }
    for (const s of sources) edges.push([`src:${s.id}`, s.api === "eurostat" ? "bronze_eurostat" : "bronze_worldbank"]);
    for (const [t, ups] of Object.entries(lineage.edges)) for (const u of ups) edges.push([u, t]);
    const serving: [string, string, string[]][] = [
      ["srv:keyed", "Diamond, indices, countries", ["diamond_country_year", "silver_price_index_chained", "dim_country"]],
      ["srv:ml", "Models, backtest, forecasts", ["ml_model_registry", "ml_backtest", "ml_forecast", "ml_coefficient"]],
      ["srv:decisions", "Alerts, rules, playbooks", ["decision_alert"]],
      ["srv:meta", "Lineage, contracts, run stats", []],
    ];
    for (const [id, label, ups] of serving) {
      nodes.push({ id, label, col: "Serving", kind: "serving" });
      for (const u of ups) edges.push([u, id]);
    }
    const pages: [string, string, string[]][] = [
      ["page:story", "Story", ["srv:keyed", "srv:decisions", "srv:meta"]],
      ["page:forecast", "Forecast", ["srv:keyed", "srv:ml"]],
      ["page:decisions", "Decisions", ["srv:decisions", "srv:ml"]],
      ["page:architecture", "Architecture", ["srv:meta"]],
    ];
    for (const [id, label, ups] of pages) {
      nodes.push({ id, label, col: "Experience", kind: "page" });
      for (const u of ups) edges.push([u, id]);
    }
    return { nodes, edges };
  }, [lineage, sources]);

  const [sel, setSel] = useState<string>("diamond_country_year");
  const related = useMemo(() => {
    const up = new Set<string>([sel]), down = new Set<string>([sel]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of edges) {
        if (down.has(a) && !down.has(b)) (down.add(b), (grew = true));
        if (up.has(b) && !up.has(a)) (up.add(a), (grew = true));
      }
    }
    return new Set([...up, ...down]);
  }, [sel, edges]);

  const [ref, width] = useWidth<HTMLDivElement>(1200);
  const W = Math.max(1100, width);
  const colW = W / COLUMNS.length;
  const nodeW = colW - 22;
  const nodeH = 36;
  const gap = 10;
  const pos: Record<string, { x: number; y: number }> = {};
  let H = 0;
  // order each column by the mean position of its inputs (barycentre), to keep lines from crossing
  const rank: Record<string, number> = {};
  for (const [ci, col] of COLUMNS.entries()) {
    const ns = nodes.filter((n) => n.col === col);
    const key = (n: Node) => {
      const ins = edges.filter(([, b]) => b === n.id).map(([a]) => rank[a]).filter((v) => v !== undefined);
      return ins.length ? ins.reduce((s, v) => s + v, 0) / ins.length : ns.indexOf(n);
    };
    const ordered = ci === 0 ? ns : [...ns].sort((a, b) => key(a) - key(b));
    ordered.forEach((n, i) => {
      rank[n.id] = i;
      pos[n.id] = { x: ci * colW + 11, y: 30 + i * (nodeH + gap) };
      H = Math.max(H, 30 + (i + 1) * (nodeH + gap));
    });
  }
  const maxChars = Math.floor((nodeW - 14) / 5.9);
  const boxLabel = (n: Node) => (n.kind === "source" ? n.label.split(" ").slice(-1)[0] : n.kind === "table" || n.kind === "python" || n.kind === "seed" ? short(n.label) : n.label);
  const selNode = nodes.find((n) => n.id === sel)!;
  const layer = LAYER_TEXT[selNode.col];
  const count = run.row_counts[sel];
  const ups = edges.filter(([, b]) => b === sel).map(([a]) => a);
  const downs = edges.filter(([a]) => a === sel).map(([, b]) => b);
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  const totalRows = Object.values(run.row_counts).reduce((a, b) => a + b, 0);
  const [scenario, setScenario] = useState("demo");

  return (
    <main>
      <section className="wrap hero">
        <h1 className="sentence" style={{ maxWidth: "26ch" }}>
          The last run built {Object.keys(run.row_counts).length} tables and {totalRows.toLocaleString("en-GB")} rows, and passed {run.contracts_passed.length} data contracts{run.duration_s ? ` in ${Math.round(run.duration_s)} seconds` : ""}.
        </h1>
        <p className="subline">
          Live Eurostat and World Bank data flow through a medallion lakehouse, a certified metric layer, a backtested forecast and versioned alert rules, then publish atomically to this site. This page is drawn from the metadata of that run, published {when(publishedAt)}: lineage is parsed from the SQL, never drawn by hand.
        </p>
      </section>

      <section className="wrap">
        <div className="section-head">
          <h2>Lineage, end to end</h2>
          <p className="prose">Select any step to see what it guarantees, its data contract, its row count and the code that builds it. Highlighted lines trace everything upstream and downstream of it.</p>
        </div>
        <div className="lineage" ref={ref}>
          <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width: "100%", minWidth: 1100 }} role="img" aria-label="Data lineage from sources to this website">
            {COLUMNS.map((c, i) => (
              <text key={c} x={i * colW + 9} y={14} className="layer-title">
                {c}
              </text>
            ))}
            {edges.map(([a, b]) => {
              const p = pos[a], q = pos[b];
              if (!p || !q) return null;
              const x1 = p.x + nodeW, y1 = p.y + nodeH / 2, x2 = q.x, y2 = q.y + nodeH / 2;
              const mx = (x1 + x2) / 2;
              const on = related.has(a) && related.has(b);
              return <path key={a + b} className={`edge${on ? " on" : ""}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} opacity={on ? 1 : 0.55} />;
            })}
            {nodes.map((n) => {
              const p = pos[n.id];
              const has = lineage.contracts.includes(n.id);
              const c = run.row_counts[n.id];
              return (
                <g
                  key={n.id}
                  className={`node${has ? " has-contract" : ""}${n.id === sel ? " on" : ""}`}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => setSel(n.id)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={n.id === sel}
                  aria-label={`${n.label}${has ? ", has a data contract" : ""}`}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(n.id)}
                  opacity={related.has(n.id) ? 1 : 0.45}
                >
                  <rect width={nodeW} height={nodeH} rx={n.kind === "page" ? 17 : n.kind === "source" || n.kind === "seed" ? 2 : 6} strokeDasharray={n.kind === "python" ? "4 3" : undefined} />
                  <title>{n.label}</title>
                  <text x={8} y={c !== undefined || n.sub ? 15 : nodeH / 2} dy={c !== undefined || n.sub ? 0 : "0.32em"}>
                    {boxLabel(n).length > maxChars ? boxLabel(n).slice(0, maxChars - 1) + "…" : boxLabel(n)}
                  </text>
                  {n.sub && (
                    <text x={8} y={29} className="count">
                      {n.sub}
                    </text>
                  )}
                  {c !== undefined && (
                    <text x={8} y={29} className="count">
                      {c.toLocaleString("en-GB")} rows{has ? ", contract" : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          Green outline: table with a data contract. Dashed: built by a Python step. Rounded: pages of this site.
        </p>

        <div className="split" style={{ marginTop: "1.5rem" }}>
          <div>
            <p className="muted small">{selNode.col}</p>
            <h3 style={{ fontSize: "1.6rem", marginTop: 2, wordBreak: "break-word" }}>{selNode.label}</h3>
            <p className="prose" style={{ marginTop: "0.6rem" }}>
              {layer.what} <b>Guarantee:</b> {layer.guarantee}{" "}
              {layer.adr && (
                <a href={`${REPO}/blob/main/docs/adr/${layer.adr}.md`}>Read the decision record.</a>
              )}
            </p>
            <table style={{ marginTop: "1rem", maxWidth: 520 }}>
              <tbody>
                {count !== undefined && (
                  <tr>
                    <th scope="row">Rows in the last run</th>
                    <td className="n">{count.toLocaleString("en-GB")}</td>
                  </tr>
                )}
                <tr>
                  <th scope="row">Reads from</th>
                  <td>{ups.length ? ups.map(label).join(", ") : "nothing upstream"}</td>
                </tr>
                <tr>
                  <th scope="row">Feeds</th>
                  <td>{downs.length ? downs.map(label).join(", ") : "nothing downstream"}</td>
                </tr>
              </tbody>
            </table>
            {contracts[sel] && (
              <>
                <h3 style={{ marginTop: "1.5rem", fontSize: "1.1rem" }}>Data contract, checked after every build</h3>
                <ul className="small" style={{ paddingLeft: "1.1rem", marginTop: "0.4rem" }}>
                  {contractRules(contracts[sel]).map((r) => (
                    <li key={r}>
                      <code>{r}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            {sql[sel] ? (
              <>
                <p className="muted small">The SQL that builds it, as published with the run</p>
                <pre className="sql">{sql[sel]}</pre>
              </>
            ) : selNode.kind === "python" ? (
              <p className="prose">
                Built by <a href={`${REPO}/blob/main/ml/forecast.py`}>ml/forecast.py</a> right after the Diamond table, from the model catalogue in <a href={`${REPO}/blob/main/ml/models.yaml`}>ml/models.yaml</a>. The step declares its inputs and outputs, so it appears in the lineage like any SQL table.
              </p>
            ) : selNode.kind === "source" ? (
              <p className="prose">
                Fetched through the public API on every run, with retries and a per-source load plan from <a href={`${REPO}/blob/main/ingestion/sources.yaml`}>sources.yaml</a>. A weekly CI job calls it for real and blocks the build if it is down.
              </p>
            ) : (
              <p className="prose">{layer.what}</p>
            )}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap section">
          <div className="section-head">
            <h2>Why this matters to a data leader</h2>
          </div>
          <div className="principles">
            <div>
              <h3>Numbers you can audit</h3>
              <p>Every figure on this site opens its own calculation, from the value Eurostat published to the certified metric, the contracts it passed and the commit that produced it.</p>
            </div>
            <div>
              <h3>One definition per metric</h3>
              <p>The metric catalogue generates the SQL and the docs, and will generate the DAX. Finance and pricing cannot end up with two versions of food inflation.</p>
            </div>
            <div>
              <h3>Quality gates, not quality reports</h3>
              <p>Contracts run as each table is built and stop the run. Bad data never reaches a consumer, so nobody has to explain it afterwards.</p>
            </div>
            <div>
              <h3>Models that earn their place</h3>
              <p>A backtest without leakage and a champion rule that prefers the simpler model at equal accuracy. Drift raises an alert for the owner.</p>
            </div>
            <div>
              <h3>Decisions as code</h3>
              <p>Thresholds and playbooks live in YAML, reviewed in pull requests, identical in every consumer. An alert always says what to do and what data work makes it repeatable.</p>
            </div>
            <div>
              <h3>Platform-portable by design</h3>
              <p>The SQL is written in the subset DuckDB and Spark SQL share, tested on DuckDB in CI. Moving the public demo to Supabase did not change a single metric definition.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>The same design on Microsoft Fabric</h2>
          <p className="prose">The public demo runs on free tiers. The enterprise path keeps every definition and swaps the runtime; deploying it to a Fabric workspace is the next phase.</p>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Concern</th>
                <th>Public demo</th>
                <th>Enterprise, on Fabric</th>
              </tr>
            </thead>
            <tbody>
              {FABRIC.map(([a, b, c]) => (
                <tr key={a}>
                  <td>
                    <b>{a}</b>
                  </td>
                  <td>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>What it costs</h2>
          <div className="seg" role="group" aria-label="Scenario">
            {["demo", "sme", "enterprise"].filter((k) => art.cost.scenarios[k]).map((k) => [k, art.cost.scenarios[k]] as const).map(([k, s]) => (
              <button key={k} aria-pressed={scenario === k} onClick={() => setScenario(k)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="prose">{art.cost.scenarios[scenario]?.assumptions}. Monthly ranges in {art.cost.currency}, {art.cost.region}, from a versioned cost model; unverified prices are shown as pending, never guessed.</p>
        </div>
        <CostTable cost={art.cost} scenario={scenario} />
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Decision records</h2>
          <p className="prose">Each choice is written down with the alternatives, the reason and when to revisit it.</p>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>ADR</th>
                <th>Decision</th>
                <th>Alternatives weighed</th>
              </tr>
            </thead>
            <tbody>
              {ADRS.map(([n, d, alt]) => (
                <tr key={n}>
                  <td>
                    <a href={`${REPO}/blob/main/docs/adr/${ADR_FILES[n]}.md`}>{n}</a>
                  </td>
                  <td>{d}</td>
                  <td className="muted">{alt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CostTable({ cost, scenario }: { cost: CostModel; scenario: string }) {
  const rows = cost.components.map((c) => {
    const usage = c.usage_per_month[scenario] ?? {};
    const qty = Number(Object.entries(usage).find(([k, v]) => k !== "sku" && typeof v === "number")?.[1] ?? 0);
    const { low, high } = c.unit_price;
    const range = low === null || high === null ? null : [qty * low, qty * high];
    return { c, usage, range };
  });
  const known = rows.filter((r) => r.range);
  const lo = known.reduce((s, r) => s + r.range![0], 0), hi = known.reduce((s, r) => s + r.range![1], 0);
  const eur = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Process</th>
            <th>Option</th>
            <th>Usage per month</th>
            <th className="n">Monthly cost</th>
            <th>Price checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, usage, range }) => (
            <tr key={c.process}>
              <td>{c.process}</td>
              <td>{c.option}</td>
              <td className="muted">
                {Object.entries(usage)
                  .map(([k, v]) => `${k.replace("_", " ")} ${v}`)
                  .join(", ")}
              </td>
              <td className="n">{range ? (range[0] === range[1] ? `${eur(range[0])}` : `${eur(range[0])} to ${eur(range[1])}`) : <span className="muted">pending</span>}</td>
              <td className="small">{c.verified_on ? <a href={c.source}>{c.verified_on}</a> : <span className="muted">not yet verified</span>}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>
              <b>Total of verified components</b>
            </td>
            <td className="n">
              <b>
                {eur(lo)} to {eur(hi)}
              </b>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>
        The public demo itself runs on GitHub Actions, Supabase and Vercel free tiers: 0 per month.
      </p>
    </div>
  );
}
