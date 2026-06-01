"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { won } from "@/lib/format";
import { REGIONS, SIDO_LIST, CODE_TO_NAME, CODE_TO_SIDO } from "@/lib/regions";
import type { Signal } from "@/lib/types";
import TrendChart from "./trend-chart";

type SearchResult = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

function ComplexInner() {
  const searchParams = useSearchParams();
  const [sido, setSido] = useState("");
  const [sggCd, setSggCd] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<{ apt_nm: string; sgg_cd: string } | null>(null);
  const [history, setHistory] = useState<Signal[]>([]);
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
    setHistory([]);
    setLoading(true);
    const res = await fetch(
      `/api/search?apt=${encodeURIComponent(apt_nm)}&sgg=${encodeURIComponent(sgg_cd)}`
    );
    const data = await res.json();
    setHistory(data);
    setLoading(false);
  }

  function handleSidoChange(next: string) {
    setSido(next);
    setSggCd("");
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setHistory([]);
  }

  function handleSggChange(next: string) {
    setSggCd(next);
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setHistory([]);
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
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          />

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => { setSelected(null); setHistory([]); }}
              className="text-xs text-[var(--ink-soft)] hover:underline"
            >
              ← 다시 검색
            </button>
            <h3 className="font-semibold">{selected.apt_nm}</h3>
            <span className="text-xs text-[var(--ink-soft)]">
              {CODE_TO_NAME[selected.sgg_cd] ?? selected.sgg_cd}
            </span>
          </div>

          {history.length === 0 ? (
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

export default function ComplexPage() {
  return (
    <Suspense>
      <ComplexInner />
    </Suspense>
  );
}
