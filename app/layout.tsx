import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Food price transmission in Europe",
  description:
    "How farm-gate price changes reach consumer food prices across Europe. Certified metrics from an open lakehouse built on Eurostat and World Bank data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
