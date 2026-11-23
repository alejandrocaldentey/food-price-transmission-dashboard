import type { Metadata } from "next";
import { Architecture } from "@/components/Architecture";
import { latestRun, loadArtifacts } from "@/lib/data";

export const metadata: Metadata = { title: "Architecture: lineage, contracts, cost | From farm to shelf" };

export default async function Page() {
  const run = await latestRun();
  if (!run) throw new Error("No complete run has been published yet.");
  const art = await loadArtifacts(run.run_id);
  return <Architecture art={art} publishedAt={run.published_at} />;
}
