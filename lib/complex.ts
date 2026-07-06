// 단지 상세 — R2(전체이력) 데이터 타입·서버 fetch·URL 헬퍼. (server/client 공용, no "use client")
import { cache } from "react";
import { won } from "./format";
import { CODE_TO_NAME } from "./regions";
import { supabase } from "./supabase";

// R2 raw 파일의 거래 1건 (fetch_peaks가 적재한 축약 키)
export type RawDeal = {
  d: string;          // deal_date YYYY-MM-DD
  p: number;          // price 만원
  py: number;         // pyeong 추정 평형
  fl: number | null;  // floor
  g: string;          // dealing_gbn 중개거래/직거래
  c: boolean;         // canceled
  a?: number;         // area m² (있을 수 있음)
  tt?: string;        // trade_type 매매/분양권/입주권 (구 R2 파일엔 없을 수 있음 → 매매)
  dg?: string | null; // apt_dong 거래동 (등기완료분에만, 대부분 없음)
};

export type RawComplex = {
  apt_nm: string;
  sgg_cd: string;
  apt_seq: string | null;
  umd_nm: string | null;
  build_year: number | null;
  deals: RawDeal[];
};

// 단지 상세 URL: /complex/{sgg}/{apt}
export const complexHref = (sgg: string, apt: string) =>
  `/complex/${sgg}/${encodeURIComponent(apt)}`;

// R2에서 단지 1개 전체이력을 서버에서 가져온다(ISR 캐시). 없으면 null.
export async function fetchComplex(sgg: string, apt: string): Promise<RawComplex | null> {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/${sgg}/${encodeURIComponent(apt)}.json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as RawComplex;
  } catch {
    return null;
  }
}

// DB(transactions 핫윈도우)에서 단지의 최근 거래를 RawDeal로 가져온다.
// R2는 fetch_peaks 주기(최대 8일) 스냅샷이라 그 이후 신고된 최신 거래가 빠진다.
// 매일 ingest가 채우는 DB로 이 공백을 메운다. anon read(RLS 허용)로 충분.
async function fetchRecentDeals(sgg: string, apt: string): Promise<RawDeal[]> {
  // R2 스냅샷(fetch_peaks 주기 최대 8일) 이후 새로 등록된 거래만 받으면 된다.
  // 전체 이력은 R2에 있으므로, DB에선 최근 first_seen만 → 대형 단지에서 수천 건 → 수십 건.
  const since = new Date();
  since.setDate(since.getDate() - 21);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("transactions")
    .select("deal_date, price, area, pyeong, floor, dealing_gbn, canceled, trade_type, apt_dong")
    .eq("sgg_cd", sgg)
    .eq("apt_nm", apt)
    .gte("first_seen", sinceStr)
    .limit(3000);
  return (data ?? []).map((r) => ({
    d: r.deal_date as string,
    p: r.price as number,
    a: r.area as number,
    py: r.pyeong as number,
    fl: (r.floor ?? null) as number | null,
    g: r.dealing_gbn as string,
    c: r.canceled as boolean,
    tt: (r.trade_type ?? "매매") as string,
    dg: (r.apt_dong ?? null) as string | null,
  }));
}

// R2 전체이력에 DB 최근 거래 중 R2에 없는 건만 더해 병합(중복 제거).
// 키는 raw_key와 동일 식별자 — 한 단지 안에선 (날짜·가격·전용면적·층)이면 동일 거래.
function mergeDeals(r2: RawDeal[], recent: RawDeal[]): RawDeal[] {
  const key = (x: RawDeal) =>
    `${x.d}|${x.p}|${x.a != null ? Number(x.a).toFixed(2) : ""}|${x.fl ?? ""}|${x.tt ?? "매매"}`;
  const seen = new Set(r2.map(key));
  const extra = recent.filter((x) => !seen.has(key(x)));
  return extra.length ? [...r2, ...extra].sort((a, b) => a.d.localeCompare(b.d)) : r2;
}

// R2 파일이 아직 없는 단지(fetch_peaks 미수집·신규 단지·개편지역 등)용 폴백.
// 전체이력은 R2에만 있으므로 여기선 DB 핫윈도우(최근 등록분)만 담는다.
// 부분 이력이라도 보여주는 게 404보다 낫다 — fetch_peaks가 R2를 채우면 전체이력으로 승격.
async function fetchComplexFromDb(sgg: string, apt: string): Promise<RawComplex | null> {
  const { data } = await supabase
    .from("transactions")
    .select("deal_date, price, area, pyeong, floor, dealing_gbn, canceled, trade_type, apt_dong, umd_nm, build_year, apt_seq")
    .eq("sgg_cd", sgg)
    .eq("apt_nm", apt)
    .order("deal_date", { ascending: true })
    .limit(3000);
  const rows = (data ?? []) as {
    deal_date: string; price: number; area: number; pyeong: number;
    floor: number | null; dealing_gbn: string; canceled: boolean;
    trade_type: string | null; apt_dong: string | null;
    umd_nm: string | null; build_year: number | null; apt_seq: string | null;
  }[];
  if (rows.length === 0) return null;
  const deals: RawDeal[] = rows.map((r) => ({
    d: r.deal_date,
    p: r.price,
    a: r.area,
    py: r.pyeong,
    fl: r.floor ?? null,
    g: r.dealing_gbn,
    c: r.canceled,
    tt: r.trade_type ?? "매매",
    dg: r.apt_dong ?? null,
  }));
  return {
    apt_nm: apt,
    sgg_cd: sgg,
    apt_seq: rows[0].apt_seq ?? null,
    umd_nm: rows[0].umd_nm ?? null,
    build_year: rows[0].build_year ?? null,
    deals,
  };
}

// R2 전체이력 + DB 최근 거래를 병합한 단지 1개. 요청 내 중복 호출은 cache로 dedupe.
// R2 fetch와 DB 최근거래를 병렬로(둘 다 같은 apt를 키로 쓰므로 의존 없음).
// R2 파일이 없으면(fetch_peaks 미수집) DB 핫윈도우로 폴백해 404를 피한다.
export const fetchComplexMerged = cache(
  async (sgg: string, apt: string): Promise<RawComplex | null> => {
    const [cx, recent] = await Promise.all([
      fetchComplex(sgg, apt),
      fetchRecentDeals(sgg, apt),
    ]);
    if (!cx) return fetchComplexFromDb(sgg, apt);
    return { ...cx, deals: mergeDeals(cx.deals, recent) };
  }
);

// 메타데이터/요약용 — 취소 제외 최신 거래·전고점·건수.
export function summarize(deals: RawDeal[]) {
  const valid = deals.filter((d) => !d.c);
  if (valid.length === 0) return { count: 0, peak: 0, peakWon: "", latest: null as RawDeal | null, latestWon: "" };
  const peak = valid.reduce((m, d) => Math.max(m, d.p), 0);
  const latest = valid.reduce((a, b) => (b.d > a.d ? b : a), valid[0]);
  return { count: valid.length, peak, peakWon: won(peak), latest, latestWon: won(latest.p) };
}

// "서울 강동구 고덕동" 형태의 위치 문자열
export function locationLabel(sgg: string, umd: string | null): string {
  const region = CODE_TO_NAME[sgg] ?? sgg;
  return umd ? `${region} ${umd}` : region;
}

// 지역 허브용 — 시군구 내 단지 목록(최근 거래 기준, 취소 제외). 단지명 가나다순.
export type AptSummary = {
  apt_nm: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

export async function fetchAptsInSgg(sgg: string): Promise<AptSummary[]> {
  // DB에서 단지별 집계(RPC) → 수천 행 대신 수십 행으로 상세 페이지 가속.
  const { data, error } = await supabase.rpc("get_apts_in_sgg", { p_sgg_cd: sgg, p_umd: null });
  if (!error && data) {
    return (data as AptSummary[]).sort((a, b) => a.apt_nm.localeCompare(b.apt_nm, "ko"));
  }

  // fallback: RPC 미적용 시 기존 방식
  const { data: rows } = await supabase
    .from("transactions")
    .select("apt_nm, umd_nm, price, deal_date")
    .eq("sgg_cd", sgg)
    .eq("canceled", false)
    .order("deal_date", { ascending: false })
    .limit(5000);

  const groups = new Map<string, AptSummary>();
  for (const row of (rows ?? []) as { apt_nm: string; umd_nm: string | null; price: number; deal_date: string }[]) {
    const g = groups.get(row.apt_nm);
    if (!g) {
      groups.set(row.apt_nm, {
        apt_nm: row.apt_nm, umd_nm: row.umd_nm, tx_count: 1,
        latest_date: row.deal_date, peak_price: row.price,
      });
    } else {
      g.tx_count++;
      if (row.price > g.peak_price) g.peak_price = row.price;
      if (row.deal_date > g.latest_date) g.latest_date = row.deal_date;
    }
  }
  return [...groups.values()].sort((a, b) => a.apt_nm.localeCompare(b.apt_nm, "ko"));
}
