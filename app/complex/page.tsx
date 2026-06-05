"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { won } from "@/lib/format";
import { REGIONS, SIDO_LIST, CODE_TO_NAME } from "@/lib/regions";
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

const PAGE_SIZE = 20;

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
    .sort((a, b) => b.d.localeCompare(a.d));
}

const SELECT_CLS =
  "border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] disabled:opacity-40 w-full";

function ComplexInner() {
  const searchParams = useSearchParams();
  const qHint = searchParams.get("q") ?? "";

  const [sido, setSido] = useState("");
  const [sggCd, setSggCd] = useState("");
  const [aptNm, setAptNm] = useState("");

  const [aptList, setAptList] = useState<SearchResult[]>([]);

  const [selected, setSelected] = useState<{ apt_nm: string; sgg_cd: string } | null>(null);
  const [rawDeals, setRawDeals] = useState<RawDeal[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterPy, setFilterPy] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  function resetDeals() {
    setSelected(null);
    setRawDeals([]);
    setDeals([]);
    setFilterPy(null);
    setPage(1);
  }

  // sggCd 변경 → 시군구 전체 단지 목록
  useEffect(() => {
    if (!sggCd) { setAptList([]); setAptNm(""); resetDeals(); return; }
    setAptList([]);
    setAptNm("");
    resetDeals();
    fetch(`/api/search?sgg=${sggCd}`)
      .then((r) => r.json())
      .then((d: SearchResult[]) => setAptList(d))
      .catch(() => setAptList([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sggCd]);

  async function handleSelectApt(result: SearchResult) {
    setAptNm(result.apt_nm);
    setSelected({ apt_nm: result.apt_nm, sgg_cd: result.sgg_cd });
    setRawDeals([]);
    setDeals([]);
    setFilterPy(null);
    setPage(1);
    setLoading(true);

    const r2Url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (r2Url) {
      try {
        const res = await fetch(
          `${r2Url}/${result.sgg_cd}/${encodeURIComponent(result.apt_nm)}.json`
        );
        if (res.ok) {
          const json: { deals: RawDeal[] } = await res.json();
          setRawDeals(json.deals);
          setDeals(computeDeltas(json.deals));
        }
      } catch {
        // R2 없으면 빈 목록
      }
    }

    setLoading(false);
  }

  function handleAptChange(name: string) {
    if (!name) { setAptNm(""); resetDeals(); return; }
    const result = aptList.find((r) => r.apt_nm === name);
    if (result) handleSelectApt(result);
    else setAptNm(name);
  }

  function handleFilterPy(py: number | null) {
    setFilterPy(py);
    setPage(1);
  }

  const pyeongOptions = useMemo(() => {
    const count = new Map<number, number>();
    for (const d of deals) {
      if (!d.c) count.set(d.py, (count.get(d.py) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([py]) => py);
  }, [deals]);

  const filteredDeals = useMemo(
    () => (filterPy != null ? deals.filter((d) => d.py === filterPy) : deals),
    [deals, filterPy]
  );

  const totalPages = Math.ceil(filteredDeals.length / PAGE_SIZE);
  const pagedDeals = filteredDeals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sggList = sido
    ? Object.entries(REGIONS[sido] ?? {}).sort(([, a], [, b]) => a.localeCompare(b, "ko"))
    : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">단지 조회</h2>

      {/* 3단계 드롭다운 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select value={sido} onChange={(e) => { setSido(e.target.value); setSggCd(""); }} className={SELECT_CLS}>
          <option value="">시도 선택</option>
          {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sggCd} onChange={(e) => setSggCd(e.target.value)} disabled={!sido} className={SELECT_CLS}>
          <option value="">시군구 선택</option>
          {sggList.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>

      <div className="mb-6">
        <select
          value={aptNm}
          onChange={(e) => handleAptChange(e.target.value)}
          disabled={!sggCd}
          className={SELECT_CLS}
        >
          <option value="">
            {sggCd && aptList.length === 0 ? "로딩 중…" : "단지 선택"}
          </option>
          {aptList.map((r) => (
            <option key={`${r.apt_nm}|${r.sgg_cd}`} value={r.apt_nm}>
              {r.apt_nm}{r.umd_nm ? ` · ${r.umd_nm}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 메인 검색창에서 넘어온 경우 힌트 */}
      {qHint && !selected && (
        <p className="text-xs text-[var(--ink-soft)] mb-4">
          &ldquo;{qHint}&rdquo; · 시도 → 시군구 → 동 순서로 선택하세요
        </p>
      )}

      {loading && <p className="text-sm text-[var(--ink-soft)]">로딩 중…</p>}

      {selected && !loading && (
        <div>
          <TrendChart deals={rawDeals} />

          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => { setAptNm(""); resetDeals(); }}
              className="text-xs text-[var(--ink-soft)] hover:underline"
            >
              ← 다시 선택
            </button>
            <h3 className="font-semibold">{selected.apt_nm}</h3>
            <span className="text-xs text-[var(--ink-soft)]">
              {CODE_TO_NAME[selected.sgg_cd] ?? selected.sgg_cd}
            </span>
            {deals.length > 0 && (
              <span className="text-xs text-[var(--ink-soft)]">· 총 {deals.length.toLocaleString()}건</span>
            )}
          </div>

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

          {filteredDeals.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">거래 이력이 없습니다.</p>
          ) : (
            <>
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
                    {pagedDeals.map((deal, i) => (
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
                          {deal.c ? (
                            <span className="text-[var(--ink-soft)]">취소</span>
                          ) : deal.g === "직거래" ? (
                            <span className="text-[var(--blue)]">직</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-right text-xs">
                          {deal.delta_pct != null ? (
                            <span
                              className={
                                deal.delta_pct > 0
                                  ? "text-[var(--red)]"
                                  : deal.delta_pct < 0
                                  ? "text-[var(--blue)]"
                                  : ""
                              }
                            >
                              {deal.delta_pct > 0 ? "+" : ""}{deal.delta_pct}%
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
            </>
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
