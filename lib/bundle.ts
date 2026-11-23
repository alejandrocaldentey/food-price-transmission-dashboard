import "server-only";
import type { TraceBundle } from "@/components/Trace";
import { loadArtifacts, loadCore, latestRun } from "./data";

/** Everything a page needs to render and to trace any of its numbers, from one published run. */
export async function loadPage() {
  const run = await latestRun();
  if (!run) throw new Error("No complete run has been published yet.");
  const [core, art] = await Promise.all([loadCore(), loadArtifacts(run.run_id)]);
  const names = Object.fromEntries(core.countries.map((c) => [c.country_iso3, c.country_name]));
  const bundle: TraceBundle = {
    metrics: core.metrics,
    diamond: core.diamond,
    index: core.index,
    names,
    contracts: art.contracts,
    sql: art.sql,
    run: { run_id: run.run_id, published_at: run.published_at, git_sha: run.git_sha, stats: run.stats },
  };
  return { run, core, art, names, bundle };
}
