"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { won } from "@/lib/format";

type RawDeal = { d: string; p: number; py: number; fl: number | null; g: string; c: boolean };
type TrendPoint = { ym: string; max: number; cnt: number };
type TrendData = Record<string, TrendPoint[]>;

type Period = "1년" | "3년" | "5년" | "전체";
const PERIODS: Period[] = ["1년", "3년", "5년", "전체"];
const LINE_COLORS = ["#C7321F", "#2C557E", "#9A7B1F", "#4A7C59", "#7B4A7C"];

function fmtYm(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

function getStartYm(period: Period): string | null {
  if (period === "전체") return null;
  const months = period === "1년" ? 12 : period === "3년" ? 36 : 60;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function aggregate(deals: RawDeal[], startYm: string | null): TrendData {
  const map = new Map<string, number[]>();
  for (const { d, p, py, c } of deals) {
    if (c) continue;
    const ym = d.slice(0, 7).replace("-", "");
    if (startYm && ym < startYm) continue;
    const key = `${py}|${ym}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const result: TrendData = {};
  for (const [key, prices] of map) {
    const [pyStr, ym] = key.split("|");
    if (!result[pyStr]) result[pyStr] = [];
    result[pyStr].push({ ym, max: Math.max(...prices), cnt: prices.length });
  }
  for (const py of Object.keys(result)) {
    result[py].sort((a, b) => a.ym.localeCompare(b.ym));
  }
  return result;
}

export default function TrendChart({ deals }: { deals: RawDeal[] }) {
  const [period, setPeriod] = useState<Period>("전체");

  if (deals.length === 0) return null;

  const startYm = getStartYm(period);
  const data = aggregate(deals, startYm);

  const pyeongs = Object.keys(data)
    .sort((a, b) => {
      const ca = data[a].reduce((s, pt) => s + pt.cnt, 0);
      const cb = data[b].reduce((s, pt) => s + pt.cnt, 0);
      return cb - ca;
    })
    .slice(0, 5);

  if (pyeongs.length === 0) return null;

  const ymSet = new Set<string>();
  for (const p of pyeongs) for (const pt of data[p]) ymSet.add(pt.ym);
  const yms = [...ymSet].sort();

  type Row = Record<string, number | string>;
  const chartData: Row[] = yms.map((ym) => {
    const row: Row = { ym };
    for (const p of pyeongs) {
      const pt = data[p].find((d) => d.ym === ym);
      if (pt) row[`${p}평`] = pt.max;
    }
    return row;
  });

  if (chartData.length < 2) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--ink-soft)]">월별 최고가 추이 (만원)</p>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-2 py-0.5 rounded ${
                period === p
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="ym"
            tick={{ fontSize: 10, fill: "var(--ink-soft)" }}
            tickFormatter={(v: string) => fmtYm(v)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--ink-soft)" }}
            tickFormatter={(v: number) => won(v)}
            width={72}
          />
          <Tooltip
            formatter={(value) => [won(Number(value)), ""]}
            labelFormatter={(label) => fmtYm(String(label))}
            contentStyle={{
              fontSize: 12,
              background: "var(--paper)",
              border: "1px solid var(--line)",
            }}
          />
          {pyeongs.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          {pyeongs.map((p, i) => (
            <Line
              key={p}
              type="monotone"
              dataKey={`${p}평`}
              name={`${p}평`}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
