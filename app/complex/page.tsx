"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { won } from "@/lib/format";
import { REGIONS, SIDO_LIST, CODE_TO_NAME, CODE_TO_SIDO } from "@/lib/regions";
import TrendChart from "./trend-chart";

type SearchResult = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

type RawDeal = { d: string; p: number; py: number; fl: number | null; g: string; c: boolean };
type DealRow = RawDeal & { delta_pct: number | null };

function computeDeltas(deals: RawDeal[]): DealRow[] {
  const sorted = [...deals].sort((a, b) => a.d.localeCompare(b.d));
  const prevByPy = new Map<number, number>();
  return sorted
    .map((deal) => {
      const prev = prevByPy.get(deal.py);
      const delta = !deal.c && prev != null
        ? Math.round((deal.p - prev) / prev * 100)
        : null;
      if (!deal.c) prevByPy.set(deal.py, deal.p);
      return { ...deal, delta_pct: delta };
    })
    .sort((a, b) => b.d.localeCompare(a.d)); // 최신순
}

function ComplexInner() {
  const searchParams = useSearchParams();
  const [sido, setSido] = useState("");
  const [sggCd, setSggCd] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<{ apt_nm: string; sgg_cd: string } | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apt = searchParams.get("apt");
    const sgg = searchParams.get("sgg");
    const q   = searchParams.get("q");
    if (apt && sgg) {
      setSido(CODE_TO_SIDO[sgg] ?? "");
      setSggCd(sgg);
      setQuery(apt);
      handleSelect(apt, sgg);
    } else if (q) {
      setQuery(q);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동완성 디바운스
  useEffect(() => {
    if (!query.trim() || !sggCd) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}&sgg=${sggCd}`
      );
      const data = await res.json();
      setSuggestions(data);
      setShowSuggestions(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, sggCd]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        inputRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function handleSelect(apt_nm: string, sgg_cd: string) {
    setSelected({ apt_nm, sgg_cd });
    setShowSuggestions(false);
    setQuery(apt_nm);
    setDeals([]);
    setLoading(true);

    const r2Url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (r2Url) {
      try {
        const res = await fetch(
          `${r2Url}/${sgg_cd}/${encodeURIComponent(apt_nm)}.json`
        );
        if (res.ok) {
          const json: { deals: RawDeal[] } = await res.json();
          setDeals(computeDeltas(json.deals));
        }
      } catch {
        // R2 응답 없으면 빈 목록
      }
    }

    setLoading(false);
  }

  function handleSidoChange(next: string) {
    setSido(next);
    setSggCd("");
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setDeals([]);
  }

  function handleSggChange(next: string) {
    setSggCd(next);
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setDeals([]);
  }

  const sggList = sido
    ? Object.entries(REGIONS[sido] ?? {}).sort(([, a], [, b]) => a.localeCompare(b, "ko"))
    : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">단지 조회</h2>

      {/* 지역 선택 */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <select
          value={sido}
          onChange={(e) => handleSidoChange(e.target.value)}
          className="border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)]"
        >
          <option value="">시도 선택</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sggCd}
          onChange={(e) => handleSggChange(e.target.value)}
          disabled={!sido}
          className="border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] disabled:opacity-40"
        >
          <option value="">시군구 선택</option>
          {sggList.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>

      {/* 단지명 자동완성 */}
      <div className="relative mb-6">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          placeholder={sggCd ? "단지명 입력" : "시군구를 먼저 선택하세요"}
          disabled={!sggCd}
          className="w-full border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] disabled:opacity-40"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-10 w-full mt-1 border border-[var(--line)] rounded bg-[var(--paper)] shadow-md max-h-64 overflow-y-auto"
          >
            {suggestions.map((r) => (
              <button
                key={`${r.apt_nm}|${r.sgg_cd}`}
                onMouseDown={() => handleSelect(r.apt_nm, r.sgg_cd)}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--paper-2)] flex justify-between items-center"
              >
                <span className="text-sm font-medium">{r.apt_nm}</span>
                <span className="text-xs text-[var(--ink-soft)]">
                  {r.tx_count}건 · {won(r.peak_price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-[var(--ink-soft)]">로딩 중...</p>}

      {selected && !loading && (
        <div>
          <TrendChart
            aptNm={selected.apt_nm}
            sggCd={selected.sgg_cd}
            r2Url={process.env.NEXT_PUBLIC_R2_PUBLIC_URL!}
          />

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => { setSelected(null); setDeals([]); }}
              className="text-xs text-[var(--ink-soft)] hover:underline"
            >
              ← 다시 검색
            </button>
            <h3 className="font-semibold">{selected.apt_nm}</h3>
            <span className="text-xs text-[var(--ink-soft)]">
              {CODE_TO_NAME[selected.sgg_cd] ?? selected.sgg_cd}
            </span>
            {deals.length > 0 && (
              <span className="text-xs text-[var(--ink-soft)]">
                · 총 {deals.length.toLocaleString()}건
              </span>
            )}
          </div>

          {deals.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">거래 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs text-[var(--ink-soft)]">
                    <th className="py-2 pr-3 font-medium">거래일</th>
                    <th className="py-2 pr-3 font-medium">평형/층</th>
                    <th className="py-2 pr-3 font-medium text-right">거래가</th>
                    <th className="py-2 pr-3 font-medium">유형</th>
                    <th className="py-2 font-medium text-right">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[var(--line)] hover:bg-[var(--paper-2)] ${deal.c ? "opacity-40" : ""}`}
                    >
                      <td className="py-1.5 pr-3 text-xs">{deal.d}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {deal.py}평{deal.fl != null ? ` ${deal.fl}층` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium whitespace-nowrap">
                        <span className={deal.g === "직거래" ? "text-[var(--blue)]" : ""}>
                          {won(deal.p)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-xs whitespace-nowrap">
                        {deal.c
                          ? <span className="text-[var(--ink-soft)]">취소</span>
                          : deal.g === "직거래"
                            ? <span className="text-[var(--blue)]">직</span>
                            : null}
                      </td>
                      <td className="py-1.5 text-right text-xs">
                        {deal.delta_pct != null ? (
                          <span className={
                            deal.delta_pct > 0 ? "text-[var(--red)]"
                            : deal.delta_pct < 0 ? "text-[var(--blue)]" : ""
                          }>
                            {deal.delta_pct > 0 ? "+" : ""}{deal.delta_pct}%
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

export default function ComplexPage() {
  return (
    <Suspense>
      <ComplexInner />
    </Suspense>
  );
}
