import CountrySelect from "@/components/CountrySelect";
import { GapChart, TransmissionChart } from "@/components/Charts";
import { fmt, latestWithData, loadAll, type DiamondRow, type Metric } from "@/lib/data";

const REPO = "https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices";
const KPIS = [
  "producer_price_change_pct",
  "consumer_food_price_change_pct",
  "food_price_gap_pp",
  "food_inflation_premium_pp",
] as const;

function KpiCard({ metric, value }: { metric: Metric; value: number | null }) {
  return (
    <div className="card" title={metric.description}>
      <div className="card-label">
        {metric.label}
        {metric.status !== "certified" && <span className="badge">{metric.status}</span>}
      </div>
      <div className={`card-value ${value !== null && value < 0 ? "neg" : ""}`}>{fmt(value, metric.unit)}</div>
      <div className="card-desc">{metric.description}</div>
    </div>
  );
}

function story(country: string, r: DiamondRow): string {
  const farm = r.producer_price_change_pct ?? 0;
  const plate = r.consumer_food_price_change_pct ?? 0;
  const gap = plate - farm;
  const direction =
    Math.abs(gap) < 1
      ? "moved almost in step with"
      : gap > 0
        ? `rose ${gap.toFixed(1)} points more than`
        : `rose ${Math.abs(gap).toFixed(1)} points less than`;
  return `In ${r.year}, consumer food prices in ${country} ${direction} farm-gate prices (${fmt(plate, "%")} vs ${fmt(farm, "%")}).`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { country: requested } = await searchParams;
  const { metrics, countries, diamond, lastPublish } = await loadAll();
  const iso3 = countries.some((c) => c.country_iso3 === requested) ? requested! : "ESP";
  const countryName = countries.find((c) => c.country_iso3 === iso3)?.country_name ?? iso3;
  const rows = diamond.filter((r) => r.country_iso3 === iso3 && r.year >= 2005);
  const latest = latestWithData(rows);
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m]));

  const latestYear = latest?.year;
  const ranking = diamond
    .filter((r) => r.year === latestYear && r.food_price_gap_pp !== null)
    .sort((a, b) => (b.food_price_gap_pp ?? 0) - (a.food_price_gap_pp ?? 0));
  const nameOf = Object.fromEntries(countries.map((c) => [c.country_iso3, c.country_name]));

  return (
    <main>
      <header>
        <p className="eyebrow">Food price transmission · Europe</p>
        <h1>Do farm-gate price shocks reach the plate?</h1>
        <p className="lede">
          How changes in what farmers are paid show up in what consumers pay for food, country by country. Every number
          comes from one certified definition in a public metric catalogue.
        </p>
        <CountrySelect countries={countries} value={iso3} />
      </header>

      {latest ? (
        <>
          <p className="story">{story(countryName, latest)}</p>
          <section className="cards">
            {KPIS.map((k) => byName[k] && <KpiCard key={k} metric={byName[k]} value={latest[k]} />)}
          </section>

          <section className="panel">
            <h2>Farm-gate vs consumer food prices, year-on-year</h2>
            <TransmissionChart rows={rows} />
          </section>

          <section className="panel">
            <h2>The gap: consumer minus farm-gate change</h2>
            <p className="note">Blue: consumers paid more than the farm-gate change explains. Amber: less.</p>
            <GapChart rows={rows} />
          </section>

          <section className="panel">
            <h2>Europe in {latestYear}: where the gap was widest</h2>
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Farm-gate</th>
                  <th>Consumer food</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.country_iso3} className={r.country_iso3 === iso3 ? "current" : ""}>
                    <td>
                      <a href={`/?country=${r.country_iso3}`}>{nameOf[r.country_iso3] ?? r.country_iso3}</a>
                    </td>
                    <td>{fmt(r.producer_price_change_pct, "%")}</td>
                    <td>{fmt(r.consumer_food_price_change_pct, "%")}</td>
                    <td>{fmt(r.food_price_gap_pp, "pp")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="story">No complete data for {countryName} yet.</p>
      )}

      <footer>
        <p>
          <strong>How it is built.</strong> Eurostat and World Bank APIs → lakehouse (bronze, silver, gold) → Diamond
          layer generated from a <a href={`${REPO}/blob/main/docs/metrics.md`}>metric catalogue</a> → published to
          Supabase by CI → this page (Next.js on Vercel, read-only). Decisions are recorded as{" "}
          <a href={`${REPO}/tree/main/docs/adr`}>architecture decision records</a>.
        </p>
        <p>
          Sources: Eurostat (apri_pi_outa, prc_hicp_aind) and World Bank (FP.CPI.TOTL.ZG), reused with attribution.
          {lastPublish && ` Last published ${new Date(lastPublish.published_at).toISOString().slice(0, 10)}.`} Built by{" "}
          <a href="https://www.linkedin.com/in/alejandro-caldentey-datalethia/">Alejandro Caldentey</a>.
        </p>
      </footer>
    </main>
  );
}
