"use client";

import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { won } from "@/lib/format";

type TrendPoint = { ym: string; max: number; avg: number; cnt: number };
type TrendData = { [pyeong: string]: TrendPoint[] };

interface TrendChartProps {
  aptNm: string;
  sggCd: string;
  supabaseUrl: string;
}

const LINE_COLORS = ["#C7321F", "#2C557E", "#9A7B1F", "#4A7C59", "#7B4A7C"];

function fmtYm(ym: string): string {
  // YYYYMM → "YY.MM"
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

export default function TrendChart({ aptNm, sggCd, supabaseUrl }: TrendChartProps) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    const url = `${supabaseUrl}/storage/v1/object/public/trends/${sggCd}/${encodeURIComponent(aptNm)}.json`;

    fetch(url)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<TrendData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [aptNm, sggCd, supabaseUrl]);

  if (loading) {
    return <p className="text-xs text-[var(--ink-soft)] mb-4">추이 로딩 중...</p>;
  }

  if (!data) return null;

  const pyeongs = Object.keys(data).slice(0, 5);
  if (pyeongs.length === 0) return null;

  // 모든 pyeong의 ym을 합쳐 정렬
  const ymSet = new Set<string>();
  for (const p of pyeongs) {
    for (const pt of data[p]) {
      ymSet.add(pt.ym);
    }
  }
  const yms = [...ymSet].sort();

  type Row = Record<string, number | string>;
  const chartData: Row[] = yms.map((ym) => {
    const row: Row = { ym };
    for (const p of pyeongs) {
      const pt = data[p].find((d) => d.ym === ym);
      if (pt !== undefined) {
        row[`${p}평_max`] = pt.max;
      }
    }
    return row;
  });

  if (chartData.length < 2) return null;

  return (
    <div className="mb-6">
      <p className="text-xs text-[var(--ink-soft)] mb-2">월별 최고가 추이 (만원)</p>
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
              dataKey={`${p}평_max`}
              name={`${p}평`}
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
