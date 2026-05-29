"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { Signal } from "@/lib/types";
import { won } from "@/lib/format";

const LINE_COLORS = ["#C7321F", "#2C557E", "#9A7B1F", "#4A7C59", "#7B4A7C"];

export default function PriceChart({ signals }: { signals: Signal[] }) {
  const pyeongs = [...new Set(signals.map((s) => s.pyeong))].sort((a, b) => a - b);

  // 날짜별 { date, [pyeong평]: price } 형태로 변환 (중개거래만)
  type Row = Record<string, number | string>;
  const byDate = new Map<string, Row>();
  for (const s of signals) {
    if (s.dealing_gbn === "직거래" || s.canceled) continue;
    if (!byDate.has(s.deal_date)) byDate.set(s.deal_date, { date: s.deal_date });
    const key = `${s.pyeong}평`;
    const existing = byDate.get(s.deal_date)![key] as number | undefined;
    if (existing === undefined || s.price > existing) {
      byDate.get(s.deal_date)![key] = s.price;
    }
  }

  const chartData = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  if (chartData.length < 2) return null;

  return (
    <div>
      <p className="text-xs text-[var(--ink-soft)] mb-2">가격 추이 (중개거래, 만원)</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--ink-soft)" }}
            tickFormatter={(v: string) => v.slice(2)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--ink-soft)" }}
            tickFormatter={(v: number) => won(v)}
            width={72}
          />
          <Tooltip
            formatter={(value) => [won(Number(value)), ""]}
            contentStyle={{
              fontSize: 12,
              background: "var(--paper)",
              border: "1px solid var(--line)",
            }}
          />
          {pyeongs.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          {pyeongs.map((pyeong, i) => (
            <Line
              key={pyeong}
              type="monotone"
              dataKey={`${pyeong}평`}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
