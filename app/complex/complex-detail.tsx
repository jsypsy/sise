"use client";

import { useMemo, useState } from "react";
import { won } from "@/lib/format";
import type { RawDeal } from "@/lib/complex";
import TrendChart from "./trend-chart";

type DealRow = RawDeal & { delta_pct: number | null; is_high: boolean };

const PAGE_SIZE = 20;

function computeDeltas(deals: RawDeal[]): DealRow[] {
  const peakByPy = new Map<number, number>();
  for (const d of deals) {
    if (d.c) continue;
    peakByPy.set(d.py, Math.max(peakByPy.get(d.py) ?? 0, d.p));
  }
  const sorted = [...deals].sort((a, b) => a.d.localeCompare(b.d));
  const prevByPy = new Map<number, number>();
  return sorted
    .map((deal) => {
      const prev = prevByPy.get(deal.py);
      const delta = !deal.c && prev != null ? Math.round(((deal.p - prev) / prev) * 100) : null;
      if (!deal.c) prevByPy.set(deal.py, deal.p);
      const is_high = !deal.c && deal.p === peakByPy.get(deal.py);
      return { ...deal, delta_pct: delta, is_high };
    })
    .sort((a, b) => b.d.localeCompare(a.d));
}

export default function ComplexDetail({ rawDeals }: { rawDeals: RawDeal[] }) {
  const deals = useMemo(() => computeDeltas(rawDeals), [rawDeals]);

  const pyeongOptions = useMemo(() => {
    const count = new Map<number, number>();
    for (const d of deals) if (!d.c) count.set(d.py, (count.get(d.py) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([py]) => py);
  }, [deals]);

  // 기본 평형: 국평(33~34평) 우선, 없으면 거래 최다 평형. 둘 다 없으면 전체.
  const [filterPy, setFilterPy] = useState<number | null>(
    () => pyeongOptions.find((py) => py === 33 || py === 34) ?? pyeongOptions[0] ?? null
  );
  const [page, setPage] = useState(1);

  const filteredDeals = useMemo(
    () => (filterPy != null ? deals.filter((d) => d.py === filterPy) : deals),
    [deals, filterPy]
  );

  // 선택 평형(없으면 전체) 기준 최신·전고점. 헤더 요약을 평형과 일치시킨다.
  const summary = useMemo(() => {
    const valid = filteredDeals.filter((d) => !d.c);
    if (valid.length === 0) return null;
    const peak = valid.reduce((m, d) => Math.max(m, d.p), 0);
    const latest = valid.reduce((a, b) => (b.d > a.d ? b : a), valid[0]);
    return { peak, latest };
  }, [filteredDeals]);

  const totalPages = Math.ceil(filteredDeals.length / PAGE_SIZE);
  const pagedDeals = filteredDeals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterPy(py: number | null) {
    setFilterPy(py);
    setPage(1);
  }

  if (deals.length === 0) {
    return <p className="text-sm text-[var(--ink-soft)]">거래 이력이 없습니다.</p>;
  }

  return (
    <div>
      {summary && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-3 mb-4 text-sm">
          <span className="text-xs font-medium text-[var(--ink-soft)]">
            {filterPy != null ? `${filterPy}평` : "전체"}
          </span>
          <span>
            <span className="text-[var(--ink-soft)]">최신</span>{" "}
            <b>{won(summary.latest.p)}</b>{" "}
            <span className="text-xs text-[var(--ink-soft)]">{summary.latest.d}</span>
          </span>
          <span>
            <span className="text-[var(--ink-soft)]">전고점</span>{" "}
            <b className="text-[var(--red)]">{won(summary.peak)}</b>
          </span>
        </div>
      )}

      <TrendChart deals={rawDeals} selectedPy={filterPy} />

      {/* 평형 필터 */}
      {pyeongOptions.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          <button
            onClick={() => handleFilterPy(null)}
            className={`text-xs px-2.5 py-1 rounded border ${
              filterPy === null
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink-soft)]"
            }`}
          >
            전체
          </button>
          {pyeongOptions.map((py) => (
            <button
              key={py}
              onClick={() => handleFilterPy(py)}
              className={`text-xs px-2.5 py-1 rounded border ${
                filterPy === py
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink-soft)]"
              }`}
            >
              {py}평
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs text-[var(--ink-soft)]">
              <th className="py-2 pr-3 font-medium">거래일</th>
              <th className="py-2 pr-3 font-medium">평형·동·층</th>
              <th className="py-2 pr-3 font-medium text-right">거래가</th>
              <th className="py-2 font-medium text-right">증감</th>
            </tr>
          </thead>
          <tbody>
            {pagedDeals.map((deal, i) => (
              <tr
                key={i}
                className={`border-b border-[var(--line)] hover:bg-[var(--paper-2)] ${deal.c ? "text-[var(--ink-soft)] line-through" : ""}`}
              >
                <td className="py-1.5 pr-3 text-xs">{deal.d}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {deal.py}평{deal.dg ? ` ${deal.dg}동` : ""}{deal.fl != null ? ` ${deal.fl}층` : ""}
                </td>
                <td className="py-1.5 pr-3 text-right font-medium whitespace-nowrap">
                  {deal.is_high && (
                    <span className="inline-block text-[10px] font-bold text-[var(--red)] border border-[var(--red)] rounded px-1 py-0 mr-1 leading-tight align-middle">
                      최고가
                    </span>
                  )}
                  {!deal.c && deal.g === "직거래" && (
                    <span className="inline-block text-[10px] font-bold text-[var(--blue)] border border-[var(--blue)] rounded px-1 py-0 mr-1 leading-tight align-middle">
                      직거래
                    </span>
                  )}
                  <span className={deal.g === "직거래" ? "text-[var(--blue)]" : deal.is_high ? "text-[var(--red)]" : ""}>
                    {won(deal.p)}
                  </span>
                </td>
                <td className="py-1.5 text-right text-xs">
                  {deal.delta_pct != null ? (
                    <span
                      className={
                        deal.delta_pct > 0 ? "text-[var(--red)]" : deal.delta_pct < 0 ? "text-[var(--blue)]" : ""
                      }
                    >
                      {deal.delta_pct > 0 ? "+" : ""}
                      {deal.delta_pct}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-[var(--line)] rounded text-xs disabled:opacity-40 hover:bg-[var(--paper-2)]"
          >
            ← 이전
          </button>
          <span className="text-xs text-[var(--ink-soft)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-[var(--line)] rounded text-xs disabled:opacity-40 hover:bg-[var(--paper-2)]"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}
