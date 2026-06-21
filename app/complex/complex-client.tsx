"use client";

import { useState, useEffect, Suspense } from "react";
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

function buildFilterUrl(sido: string, sggCd: string, umdNm: string): string {
  const params = new URLSearchParams();
  if (sido) params.set("sido", sido);
  if (sggCd) params.set("sgg", sggCd);
  if (umdNm) params.set("umd", umdNm);
  const qs = params.toString();
  return qs ? `/complex?${qs}` : "/complex";
}

function ComplexInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qHint = searchParams.get("q") ?? "";

  // URL 파라미터로 초기값 설정 → 뒤로가기 시 드롭다운 상태 복원
  const [sido, setSido] = useState(searchParams.get("sido") ?? "");
  const [sggCd, setSggCd] = useState(searchParams.get("sgg") ?? "");
  const [umdNm, setUmdNm] = useState(searchParams.get("umd") ?? "");
  const [aptNm, setAptNm] = useState("");

  const [umdList, setUmdList] = useState<string[]>([]);
  const [umdLoading, setUmdLoading] = useState(false);
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

  // sggCd 변경 → 동 목록만 먼저 조회 (단일 컬럼 쿼리로 빠른 응답)
  useEffect(() => {
    if (!sggCd) {
      setUmdList([]);
      setUmdLoading(false);
      return;
    }
    setUmdList([]);
    setUmdLoading(true);
    let cancelled = false;
    fetch(`/api/search?sgg=${sggCd}&fields=umds`)
      .then((r) => r.json())
      .then((d: string[]) => { if (!cancelled) setUmdList(d); })
      .catch(() => { if (!cancelled) setUmdList([]); })
      .finally(() => { if (!cancelled) setUmdLoading(false); });
    return () => { cancelled = true; };
  }, [sggCd]);

  // sggCd+umdNm 변경 → 해당 동의 단지 목록 조회
  useEffect(() => {
    if (!sggCd || !umdNm) {
      setAptList([]);
      setAptLoading(false);
      return;
    }
    setAptList([]);
    setAptLoading(true);
    let cancelled = false;
    fetch(`/api/search?sgg=${sggCd}&umd=${encodeURIComponent(umdNm)}`)
      .then((r) => r.json())
      .then((d: SearchResult[]) => { if (!cancelled) setAptList(d); })
      .catch(() => { if (!cancelled) setAptList([]); })
      .finally(() => { if (!cancelled) setAptLoading(false); });
    return () => { cancelled = true; };
  }, [sggCd, umdNm]);

  // 핸들러: 상태 업데이트 + URL 동기화 (뒤로가기 복원용)
  function handleSidoChange(value: string) {
    setSido(value);
    setSggCd("");
    setUmdNm("");
    setAptNm("");
    setUmdList([]);
    setAptList([]);
    router.replace(buildFilterUrl(value, "", ""), { scroll: false });
  }

  function handleSggCdChange(value: string) {
    setSggCd(value);
    setUmdNm("");
    setAptNm("");
    setAptList([]);
    router.replace(buildFilterUrl(sido, value, ""), { scroll: false });
  }

  function handleUmdChange(value: string) {
    setUmdNm(value);
    setAptNm("");
    setAptList([]);
    router.replace(buildFilterUrl(sido, sggCd, value), { scroll: false });
  }

  function handleAptChange(name: string) {
    setAptNm(name);
    if (!name) return;
    const result = aptList.find((r) => r.apt_nm === name);
    if (result) goToApt(result.sgg_cd, result.apt_nm);
  }

  const sggList = sido
    ? Object.entries(REGIONS[sido] ?? {}).sort(([, a], [, b]) => a.localeCompare(b, "ko"))
    : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">단지 조회</h2>

      {/* 4단계 드롭다운 */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <select value={sido} onChange={(e) => handleSidoChange(e.target.value)} className={SELECT_CLS}>
          <option value="">시도 선택</option>
          {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sggCd} onChange={(e) => handleSggCdChange(e.target.value)} disabled={!sido} className={SELECT_CLS}>
          <option value="">시군구 선택</option>
          {sggList.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>

        <select
          value={umdNm}
          onChange={(e) => handleUmdChange(e.target.value)}
          disabled={!sggCd || umdLoading}
          className={SELECT_CLS}
        >
          <option value="">
            {umdLoading ? "로딩 중…" : !sggCd ? "시군구 먼저 선택" : umdList.length === 0 ? "동 없음" : "동 선택"}
          </option>
          {umdList.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <select
          value={aptNm}
          onChange={(e) => handleAptChange(e.target.value)}
          disabled={!umdNm || aptLoading}
          className={SELECT_CLS}
        >
          <option value="">
            {!umdNm ? "동 먼저 선택" : aptLoading ? "로딩 중…" : aptList.length === 0 ? "단지 없음" : "단지 선택"}
          </option>
          {aptList.map((r) => (
            <option key={`${r.apt_nm}|${r.sgg_cd}`} value={r.apt_nm}>
              {r.apt_nm}
            </option>
          ))}
        </select>
      </div>

      {sggCd && (
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
