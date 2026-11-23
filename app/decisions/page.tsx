import type { Metadata } from "next";
import { Decisions } from "@/components/Decisions";
import { latestRun, loadCore, loadDecisions, loadModels } from "@/lib/data";

export const metadata: Metadata = { title: "Decisions: alerts and playbooks by role | From farm to shelf" };

export default async function Page() {
  const run = await latestRun();
  if (!run) throw new Error("No complete run has been published yet.");
  const [core, d, m] = await Promise.all([loadCore(), loadDecisions(run.run_id), loadModels(run.run_id)]);
  return <Decisions countries={core.countries} rules={d.rules} alerts={d.alerts} roles={d.roles} plays={d.plays} models={m.models} />;
}
