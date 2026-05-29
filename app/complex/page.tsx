"use client";

import { useState } from "react";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import type { Signal } from "@/lib/types";
import PriceChart from "./price-chart";

type SearchResult = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

export default function ComplexPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<{ apt_nm: string; sgg_cd: string } | null>(null);
  const [history, setHistory] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSelected(null);
    setHistory([]);
    setSearched(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  async function handleSelect(apt_nm: string, sgg_cd: string) {
    setSelected({ apt_nm, sgg_cd });
    setHistory([]);
    setLoading(true);
    const res = await fetch(
      `/api/search?apt=${encodeURIComponent(apt_nm)}&sgg=${encodeURIComponent(sgg_cd)}`
    );
    const data = await res.json();
    setHistory(data);
    setLoading(false);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">단지 조회</h2>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="단지명 검색 (예: 헬리오시티)"
          className="flex-1 border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)]"
        />
        <button
          type="submit"
          className="bg-[var(--ink)] text-[var(--paper)] text-sm px-4 py-1.5 rounded hover:opacity-80"
        >
          검색
        </button>
      </form>

      {loading && <p className="text-sm text-[var(--ink-soft)]">로딩 중...</p>}

      {!loading && searched && !selected && results.length === 0 && (
        <p className="text-sm text-[var(--ink-soft)]">검색 결과가 없습니다.</p>
      )}

      {!selected && results.length > 0 && (
        <div>
          <p className="text-xs text-[var(--ink-soft)] mb-2">
            {results.length}개 단지 · 클릭하면 거래 이력을 볼 수 있습니다
          </p>
          <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded">
            {results.map((r) => (
              <li key={`${r.apt_nm}|${r.sgg_cd}`}>
                <button
                  onClick={() => handleSelect(r.apt_nm, r.sgg_cd)}
                  className="w-full text-left px-4 py-3 hover:bg-[var(--paper-2)] flex justify-between items-center"
                >
                  <div>
                    <span className="font-medium text-sm">{r.apt_nm}</span>
                    <span className="text-xs text-[var(--ink-soft)] ml-2">
                      {CODE_TO_NAME[r.sgg_cd] ?? r.sgg_cd}
                    </span>
                  </div>
                  <div className="text-right text-xs text-[var(--ink-soft)]">
                    <div>{r.tx_count}건</div>
                    <div>최고 {won(r.peak_price)}</div>
                    <div>{r.latest_date}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-[var(--ink-soft)] hover:underline"
            >
              ← 검색 결과
            </button>
            <h3 className="font-semibold">{selected.apt_nm}</h3>
            <span className="text-xs text-[var(--ink-soft)]">
              {CODE_TO_NAME[selected.sgg_cd] ?? selected.sgg_cd}
            </span>
          </div>

          {!loading && history.length > 0 && (
            <div className="mb-6">
              <PriceChart signals={history} />
            </div>
          )}

          {!loading && history.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">거래 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs text-[var(--ink-soft)]">
                    <th className="py-2 pr-3 font-medium">거래일</th>
                    <th className="py-2 pr-3 font-medium">평형/층</th>
                    <th className="py-2 pr-3 font-medium text-right">거래가</th>
                    <th className="py-2 pr-3 font-medium">시그널</th>
                    <th className="py-2 font-medium text-right">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                    >
                      <td className="py-1.5 pr-3 text-xs">{s.deal_date}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {s.pyeong}평{s.floor != null ? ` ${s.floor}층` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium whitespace-nowrap">
                        <span className={
                          s.is_high ? "text-[var(--red)]"
                          : s.dealing_gbn === "직거래" ? "text-[var(--blue)]" : ""
                        }>
                          {won(s.price)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {s.is_high && (
                          <span className="bg-[var(--red)] text-white text-xs px-1.5 py-0.5 rounded mr-1">
                            신고가
                          </span>
                        )}
                        {s.is_rebound && (
                          <span className="border border-[var(--gold)] text-[var(--gold)] text-xs px-1.5 py-0.5 rounded mr-1">
                            반등
                          </span>
                        )}
                        {s.dealing_gbn === "직거래" && (
                          <span className="text-xs text-[var(--blue)]">직</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-xs">
                        {s.delta_pct != null ? (
                          <span className={
                            s.delta_pct > 0 ? "text-[var(--red)]"
                            : s.delta_pct < 0 ? "text-[var(--blue)]" : ""
                          }>
                            {s.delta_pct > 0 ? "+" : ""}{s.delta_pct}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
