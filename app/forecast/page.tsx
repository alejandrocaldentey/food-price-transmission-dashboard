import type { Metadata } from "next";
import { Forecast } from "@/components/Forecast";
import { TraceProvider } from "@/components/Trace";
import { loadPage } from "@/lib/bundle";
import { loadModels } from "@/lib/data";

export const metadata: Metadata = { title: "Forecast: next year's food inflation | From farm to shelf" };

export default async function Page() {
  const { run, core, art, bundle } = await loadPage();
  const m = await loadModels(run.run_id);
  const champion = (art as unknown as { models?: { champion: { min_skill_vs_naive: number; tolerance: number } } }).models?.champion;
  return (
    <TraceProvider bundle={bundle}>
      <Forecast
        countries={core.countries}
        diamond={core.diamond}
        models={m.models}
        backtest={m.backtest}
        forecast={m.forecast}
        coef={m.coef}
        rule={champion ?? { min_skill_vs_naive: 0.05, tolerance: 0.05 }}
      />
    </TraceProvider>
  );
}
