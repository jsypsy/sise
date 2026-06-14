"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { REGIONS, SIDO_LIST, CODE_TO_NAME } from "@/lib/regions";
import { complexHref } from "@/lib/complex";

type SearchResult = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

const SELECT_CLS =
  "border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] disabled:opacity-40 w-full";

function ComplexInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qHint = searchParams.get("q") ?? "";

  const [sido, setSido] = useState("");
  const [sggCd, setSggCd] = useState("");
  const [umdNm, setUmdNm] = useState("");
  const [aptNm, setAptNm] = useState("");

  const [aptList, setAptList] = useState<SearchResult[]>([]);
  const [aptLoading, setAptLoading] = useState(false);
  const [qResults, setQResults] = useState<SearchResult[]>([]);
  const [qLoading, setQLoading] = useState(false);

  function goToApt(sgg: string, apt: string) {
    router.push(complexHref(sgg, apt));
  }

  // 레거시 딥링크(/complex?apt=&sgg=) → 단지 전용 URL로 영구 이동
  useEffect(() => {
    const apt = searchParams.get("apt");
    const sgg = searchParams.get("sgg");
    if (apt && sgg) router.replace(complexHref(sgg, apt));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메인 검색창 q 파라미터 → 결과 목록 표시
  useEffect(() => {
    if (!qHint || searchParams.get("sgg")) return;
    setQLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(qHint)}`)
      .then((r) => r.json())
      .then((d: SearchResult[]) => setQResults(d))
      .catch(() => setQResults([]))
      .finally(() => setQLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qHint]);

  // sggCd 변경 → 시군구 전체 단지 목록
  useEffect(() => {
    if (!sggCd) { setAptList([]); setAptLoading(false); setUmdNm(""); setAptNm(""); return; }
    setAptList([]);
    setAptLoading(true);
    setUmdNm("");
    setAptNm("");
    fetch(`/api/search?sgg=${sggCd}`)
      .then((r) => r.json())
      .then((d: SearchResult[]) => setAptList(d))
      .catch(() => setAptList([]))
      .finally(() => setAptLoading(false));
  }, [sggCd]);

  function handleUmdChange(next: string) {
    setUmdNm(next);
    setAptNm("");
  }

  function handleAptChange(name: string) {
    setAptNm(name);
    if (!name) return;
    const result = visibleApts.find((r) => r.apt_nm === name);
    if (result) goToApt(result.sgg_cd, result.apt_nm);
  }

  // aptList에서 동 목록 파생
  const umdList = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of aptList) {
      if (r.umd_nm && !seen.has(r.umd_nm)) { seen.add(r.umd_nm); result.push(r.umd_nm); }
    }
    return result.sort((a, b) => a.localeCompare(b, "ko"));
  }, [aptList]);

  const visibleApts = useMemo(
    () => (umdNm ? aptList.filter((r) => r.umd_nm === umdNm) : aptList),
    [aptList, umdNm]
  );

  const sggList = sido
    ? Object.entries(REGIONS[sido] ?? {}).sort(([, a], [, b]) => a.localeCompare(b, "ko"))
    : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">단지 조회</h2>

      {/* 4단계 드롭다운 */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <select value={sido} onChange={(e) => { setSido(e.target.value); setSggCd(""); }} className={SELECT_CLS}>
          <option value="">시도 선택</option>
          {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sggCd} onChange={(e) => setSggCd(e.target.value)} disabled={!sido} className={SELECT_CLS}>
          <option value="">시군구 선택</option>
          {sggList.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>

        <select
          value={umdNm}
          onChange={(e) => handleUmdChange(e.target.value)}
          disabled={!sggCd || aptList.length === 0}
          className={SELECT_CLS}
        >
          <option value="">{aptLoading ? "로딩 중…" : aptList.length === 0 ? "단지 없음" : "동 선택 (전체)"}</option>
          {umdList.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <select
          value={aptNm}
          onChange={(e) => handleAptChange(e.target.value)}
          disabled={!sggCd || aptList.length === 0}
          className={SELECT_CLS}
        >
          <option value="">{aptLoading ? "로딩 중…" : aptList.length === 0 ? "단지 없음" : "단지 선택"}</option>
          {visibleApts.map((r) => (
            <option key={`${r.apt_nm}|${r.sgg_cd}`} value={r.apt_nm}>
              {r.apt_nm}
            </option>
          ))}
        </select>
      </div>

      {sggCd && aptList.length > 0 && (
        <Link
          href={`/complex/${sggCd}`}
          className="inline-block text-sm text-[var(--blue)] hover:underline mb-6"
        >
          {CODE_TO_NAME[sggCd] ?? sggCd} 단지 전체 보기 →
        </Link>
      )}

      {/* 메인 검색창 q 파라미터 → 결과 목록 */}
      {qHint && (
        <div className="mb-6">
          {qLoading ? (
            <p className="text-sm text-[var(--ink-soft)]">검색 중…</p>
          ) : qResults.length > 0 ? (
            <div className="border border-[var(--line)] rounded overflow-hidden">
              {qResults.map((r) => (
                <button
                  key={`${r.apt_nm}|${r.sgg_cd}`}
                  onClick={() => goToApt(r.sgg_cd, r.apt_nm)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--paper-2)] border-b border-[var(--line)] last:border-0"
                >
                  <span className="font-medium">{r.apt_nm}</span>
                  <span className="text-xs text-[var(--ink-soft)] ml-2">
                    {CODE_TO_NAME[r.sgg_cd] ?? r.sgg_cd}{r.umd_nm ? ` · ${r.umd_nm}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">
              &ldquo;{qHint}&rdquo; 검색 결과가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComplexClient() {
  return (
    <Suspense>
      <ComplexInner />
    </Suspense>
  );
}
