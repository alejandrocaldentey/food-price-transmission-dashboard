// Read-only access to the public Supabase demo (Diamond layer of fabric-lakehouse-food-prices).
// Uses the publishable key: RLS allows SELECT only. No write key ever reaches this app.

const URL = process.env.SUPABASE_URL ?? "https://urfygzyojmdrohqulvod.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

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
  headline_inflation_pct: number | null;
  food_inflation_premium_pp: number | null;
};

export type Country = { country_iso3: string; country_name: string };
export type PublishLog = { published_at: string; git_sha: string | null; source_note: string | null };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadAll() {
  const [metrics, countries, diamond, log] = await Promise.all([
    get<Metric[]>("food_price_metric?select=*&order=sort_order"),
    get<Country[]>("food_price_country?select=*&order=country_name"),
    get<DiamondRow[]>("food_price_diamond?select=*&order=country_iso3,year"),
    get<PublishLog[]>("food_price_publish_log?select=published_at,git_sha,source_note&order=published_at.desc&limit=1"),
  ]);
  return { metrics, countries, diamond, lastPublish: log[0] ?? null };
}

export function latestWithData(rows: DiamondRow[]): DiamondRow | undefined {
  return [...rows]
    .reverse()
    .find((r) => r.producer_price_change_pct !== null && r.consumer_food_price_change_pct !== null);
}

export function fmt(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "ratio") return value.toFixed(2);
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${unit === "%" ? "%" : " pp"}`;
}
