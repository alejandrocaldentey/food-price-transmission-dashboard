// Build-time parity test (ADR 0009): the simulator formula must reproduce every forecast the
// pipeline published for the regression. Runs before `next build`; a mismatch fails the deploy.
import { predict, type CoefRow } from "../lib/simulator";

const URL = process.env.SUPABASE_URL ?? "https://urfygzyojmdrohqulvod.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  if (!KEY) {
    console.warn("parity: SUPABASE_PUBLISHABLE_KEY not set, skipped (local build)");
    return;
  }
  const [log] = await get<{ run_id: string }[]>(
    "food_price_publish_log?select=run_id&status=eq.complete&run_id=not.is.null&order=published_at.desc&limit=1",
  );
  if (!log) return console.warn("parity: no complete run published yet, skipped");
  const run = `run_id=eq.${encodeURIComponent(log.run_id)}`;
  const coef = await get<CoefRow[]>(`food_price_model_coef?select=model_id,kind,country_iso3,term,value&${run}`);
  const fc = await get<{ country_iso3: string; predicted: number; input_consumer_yoy: number; input_producer_yoy: number; input_producer_yoy_lag1: number }[]>(
    `food_price_forecast?select=country_iso3,predicted,input_consumer_yoy,input_producer_yoy,input_producer_yoy_lag1&model_id=eq.panel_dl&${run}`,
  );
  let worst = 0;
  for (const f of fc) {
    const p = predict(coef, f.country_iso3, { consumer: f.input_consumer_yoy, producer: f.input_producer_yoy, producerLag: f.input_producer_yoy_lag1 });
    worst = Math.max(worst, Math.abs(p.total - f.predicted));
  }
  if (!fc.length || worst > 1e-9) {
    console.error(`parity: FAILED on run ${log.run_id}: ${fc.length} forecasts, worst difference ${worst}`);
    process.exit(1);
  }
  console.log(`parity: OK, ${fc.length} forecasts of run ${log.run_id} reproduced (worst difference ${worst.toExponential(1)})`);
}

main().catch((e) => {
  console.error(`parity: could not run: ${e.message}`);
  process.exit(1);
});
