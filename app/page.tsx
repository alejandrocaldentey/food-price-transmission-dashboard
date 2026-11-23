import { Story } from "@/components/Story";
import { TraceProvider } from "@/components/Trace";
import { loadPage } from "@/lib/bundle";
import { loadDecisions } from "@/lib/data";

export default async function Page() {
  const { run, core, bundle } = await loadPage();
  const { alerts, rules } = await loadDecisions(run.run_id);
  return (
    <TraceProvider bundle={bundle}>
      <Story countries={core.countries} diamond={core.diamond} alerts={alerts} rules={rules} />
    </TraceProvider>
  );
}
