// Read-only access to the public Supabase demo, the serving layer of fabric-lakehouse-food-prices.
// Uses the publishable key: RLS allows SELECT only. No write key ever reaches this app.
//
// Two kinds of table (see the pipeline's publish/supabase.py):
// - keyed tables (countries, metrics, Diamond, indices) hold the latest value per key;
// - snapshot tables carry a run_id. We read the latest *complete* run from the publish log and
//   filter every snapshot on it, so a page never mixes two runs or sees a half-written one.

import "server-only";

const URL = process.env.SUPABASE_URL ?? "https://urfygzyojmdrohqulvod.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const PAGE = 1000; // PostgREST max rows per request

export type Metric = {
  name: string;
  label: string;
  description: string;
  unit: string;
  status: "certified" | "experimental" | "deprecated";
  owner: string;
  sort_order: number;
};

export type DiamondRow = {
  country_iso3: string;
  year: number;
  producer_price_change_pct: number | null;
  consumer_food_price_change_pct: number | null;
  food_price_gap_pp: number | null;
  pass_through_ratio_lag1: number | null;
  producer_price_index: number | null;
  consumer_food_price_index: number | null;
  headline_inflation_pct: number | null;
  food_inflation_premium_pp: number | null;
};

export type IndexRow = {
  country_iso3: string;
  series_code: "PRODUCER_PI" | "CONSUMER_FOOD_PI";
  year: number;
  index_value: number;
  source_unit: string;
  source_value: number;
  rebase_factor: number;
  link_year: number | null;
};

export type Country = { country_iso3: string; country_name: string };

export type RunStats = {
  run_id: string;
  finished_at: string;
  duration_s: number | null;
  row_counts: Record<string, number>;
  contracts_passed: string[];
  champion: string | null;
  years: [number, number];
  git_sha: string | null;
};

export type PublishLog = {
  published_at: string;
  git_sha: string | null;
  source_note: string | null;
  run_id: string;
  stats: RunStats | null;
};

export type Model = {
  model_id: "naive" | "panel_dl" | "gbm";
  label: string;
  family: string;
  formula: string;
  how_it_works: string;
  strengths: string;
  weaknesses: string;
  when_to_use: string;
  is_champion: boolean;
  n_backtest: number;
  mae: number;
  rmse: number;
  bias: number;
  skill_vs_naive: number | null;
  mae_shock_years: number | null;
  mae_recent: number | null;
  trained_through: number;
  sort_order: number;
};

export type BacktestRow = {
  model_id: Model["model_id"];
  country_iso3: string;
  year: number;
  actual: number;
  predicted: number;
};

export type ForecastRow = {
  model_id: Model["model_id"];
  country_iso3: string;
  target_year: number;
  predicted: number;
  lower_80: number;
  upper_80: number;
  is_champion: boolean;
  input_consumer_yoy: number;
  input_producer_yoy: number;
  input_producer_yoy_lag1: number;
};

export type Coef = { model_id: string; kind: "slope" | "intercept"; country_iso3: string; term: string; value: number };

export type AlertRule = {
  rule_id: string;
  label: string;
  category: "market" | "forecast" | "data" | "model";
  scope: "country" | "platform";
  value_expression: string;
  unit: string;
  levels: { severity: "high" | "medium"; when: string }[];
  message: string;
  sort_order: number;
};

export type Alert = {
  alert_id: string;
  rule_id: string;
  category: AlertRule["category"];
  country_iso3: string | null;
  year: number;
  severity: "high" | "medium";
  value: number;
};

export type Role = { role_id: string; label: string; focus: string; sort_order: number };
export type Play = { rule_id: string; role_id: string; question: string; data: string; kpi: string; horizon: string; exposure: "cost" | "price" | "volume" | "trust" };

export type Lineage = { edges: Record<string, string[]>; layers: Record<string, string>; contracts: string[] };
export type Contract = {
  table: string;
  owner: string;
  primary_key: string[];
  columns: Record<string, { required?: boolean; min?: number; max?: number; allowed?: string[] }>;
};
export type Source = {
  id: string;
  api: string;
  dataset?: string;
  indicator?: string;
  description: string;
  filters?: Record<string, string | string[]>;
  series_code: string;
  load: { strategy: string; window_years?: number };
};
export type CostModel = {
  currency: string;
  region: string;
  scenarios: Record<string, { label: string; assumptions: string }>;
  components: {
    process: string;
    option: string;
    unit: string;
    unit_price: { low: number | null; high: number | null };
    source: string;
    verified_on: string | null;
    usage_per_month: Record<string, Record<string, number | string>>;
  }[];
};
export type Artifacts = {
  lineage: Lineage;
  contracts: Record<string, Contract>;
  sql: Record<string, string>;
  sources: Source[];
  product: Record<string, unknown> & { name: string; title: string; owner: string; purpose: string };
  cost: CostModel;
  run: RunStats;
};

async function get<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${PAGE}&offset=${offset}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "public" },
      // Data are published weekly; 15 minutes keeps pages fresh after a publish and the free tiers idle.
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export async function latestRun(): Promise<PublishLog | null> {
  const rows = await get<PublishLog>(
    "food_price_publish_log?select=published_at,git_sha,source_note,run_id,stats&status=eq.complete&run_id=not.is.null&order=published_at.desc",
  );
  return rows[0] ?? null;
}

const run = (id: string) => `run_id=eq.${encodeURIComponent(id)}`;

export async function loadCore() {
  const [metrics, countries, diamond, index] = await Promise.all([
    get<Metric>("food_price_metric?select=*&order=sort_order"),
    get<Country>("food_price_country?select=*&order=country_name"),
    get<DiamondRow>("food_price_diamond?select=*&order=country_iso3,year"),
    get<IndexRow>("food_price_index?select=*&order=country_iso3,series_code,year"),
  ]);
  return { metrics, countries, diamond, index };
}

export async function loadModels(runId: string) {
  const [models, backtest, forecast, coef] = await Promise.all([
    get<Model>(`food_price_model?select=*&${run(runId)}&order=sort_order`),
    get<BacktestRow>(`food_price_backtest?select=model_id,country_iso3,year,actual,predicted&${run(runId)}&order=country_iso3,year`),
    get<ForecastRow>(`food_price_forecast?select=*&${run(runId)}`),
    get<Coef>(`food_price_model_coef?select=model_id,kind,country_iso3,term,value&${run(runId)}`),
  ]);
  return { models, backtest, forecast, coef };
}

export async function loadDecisions(runId: string) {
  const [rules, alerts, roles, plays] = await Promise.all([
    get<AlertRule>(`food_price_alert_rule?select=*&${run(runId)}&order=sort_order`),
    get<Alert>(`food_price_alert?select=alert_id,rule_id,category,country_iso3,year,severity,value&${run(runId)}`),
    get<Role>(`food_price_role?select=role_id,label,focus,sort_order&${run(runId)}&order=sort_order`),
    get<Play>(`food_price_play?select=rule_id,role_id,question,data,kpi,horizon,exposure&${run(runId)}`),
  ]);
  return { rules, alerts, roles, plays };
}

export async function loadArtifacts(runId: string): Promise<Artifacts> {
  const rows = await get<{ name: keyof Artifacts; body: never }>(`food_price_artifact?select=name,body&${run(runId)}`);
  return Object.fromEntries(rows.map((r) => [r.name, r.body])) as unknown as Artifacts;
}
