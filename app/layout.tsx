import "./globals.css";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { latestRun } from "@/lib/data";
import { when } from "@/lib/format";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "wdth"] });
const text = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-text" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "From farm to shelf: food price transmission in Europe",
  description:
    "How farm-gate price changes reach consumer food prices in 27 European countries, what comes next year, and what each data team should do. An end-to-end data architecture on live Eurostat and World Bank data.",
};

const REPO = "https://github.com/alejandrocaldentey/fabric-lakehouse-food-prices";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const run = await latestRun().catch(() => null);
  const stats = run?.stats;
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${code.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <a className="mark" href="/">
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path d="M3 20 C 8 20, 9 8, 13 8 S 18 16, 23 6" fill="none" stroke="var(--farm)" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M3 22 C 9 22, 11 12, 15 12 S 20 18, 23 10" fill="none" stroke="var(--shelf)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <b>From farm to shelf</b>
            </a>
            <Nav />
            {stats && (
              <div className="runbadge" title={`Run ${stats.run_id}`}>
                <span className="ok">
                  <span className="dot" aria-hidden="true" />
                  {stats.contracts_passed.length} contracts passed
                </span>
                <span>Published {when(run!.published_at)}</span>
              </div>
            )}
          </div>
        </header>
        {children}
        <footer>
          <div className="wrap">
            <span>
              Designed and built by{" "}
              <a href="https://www.linkedin.com/in/alejandro-caldentey-datalethia/">Alejandro Caldentey</a>, data architect.
            </span>
            <span>
              Data: Eurostat (apri_pi_outa, prc_hicp_aind) and World Bank, reused with attribution.{" "}
              <a href={REPO}>Pipeline</a> and <a href="https://github.com/alejandrocaldentey/food-price-transmission-dashboard">dashboard</a> code on GitHub.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
