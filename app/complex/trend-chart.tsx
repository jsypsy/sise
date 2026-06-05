"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { won } from "@/lib/format";

type RawDeal = { d: string; p: number; py: number; fl: number | null; g: string; c: boolean };
type TrendPoint = { ym: string; max: number };

type Period = "1년" | "3년" | "5년" | "전체";
const PERIODS: Period[] = ["1년", "3년", "5년", "전체"];

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

function aggregateSingle(deals: RawDeal[], startYm: string | null, pyFilter: number | null): TrendPoint[] {
  const map = new Map<string, number[]>();
  for (const { d, p, py, c } of deals) {
    if (c) continue;
    if (pyFilter !== null && py !== pyFilter) continue;
    const ym = d.slice(0, 7).replace("-", "");
    if (startYm && ym < startYm) continue;
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym)!.push(p);
  }
  return [...map.entries()]
    .map(([ym, prices]) => ({ ym, max: Math.max(...prices) }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

export default function TrendChart({ deals, selectedPy }: { deals: RawDeal[]; selectedPy?: number | null }) {
  const [period, setPeriod] = useState<Period>("전체");

  if (deals.length === 0) return null;

  const startYm = getStartYm(period);
  const points = aggregateSingle(deals, startYm, selectedPy ?? null);

  if (points.length < 2) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--ink-soft)]">
          월별 최고가 추이 (만원){selectedPy != null ? ` · ${selectedPy}평` : ""}
        </p>
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
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
            formatter={(value) => [won(Number(value)), "최고가"]}
            labelFormatter={(label) => fmtYm(String(label))}
            contentStyle={{
              fontSize: 12,
              background: "var(--paper)",
              border: "1px solid var(--line)",
            }}
          />
          <Line
            type="monotone"
            dataKey="max"
            stroke="#C7321F"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
