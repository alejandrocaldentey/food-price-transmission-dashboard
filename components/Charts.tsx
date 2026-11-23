"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DiamondRow } from "@/lib/data";

const FARM = "#b45309";
const PLATE = "#1d4ed8";
const fmtPct = (v: unknown) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—");

export function TransmissionChart({ rows }: { rows: DiamondRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={48} />
        <ReferenceLine y={0} stroke="#9ca3af" />
        <Tooltip formatter={(v) => fmtPct(v)} />
        <Legend />
        <Line
          name="Farm-gate prices"
          dataKey="producer_price_change_pct"
          stroke={FARM}
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
        />
        <Line
          name="Consumer food prices"
          dataKey="consumer_food_price_change_pct"
          stroke={PLATE}
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GapChart({ rows }: { rows: DiamondRow[] }) {
  const data = rows.filter((r) => r.food_price_gap_pp !== null);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}`} tickLine={false} axisLine={false} width={40} />
        <ReferenceLine y={0} stroke="#9ca3af" />
        <Tooltip formatter={(v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)} pp` : "—")} />
        <Bar name="Consumer minus farm-gate (pp)" dataKey="food_price_gap_pp">
          {data.map((r) => (
            <Cell key={r.year} fill={(r.food_price_gap_pp ?? 0) >= 0 ? PLATE : FARM} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
