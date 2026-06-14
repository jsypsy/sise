// 단지 상세 — R2(전체이력) 데이터 타입·서버 fetch·URL 헬퍼. (server/client 공용, no "use client")
import { won } from "./format";
import { CODE_TO_NAME } from "./regions";

// R2 raw 파일의 거래 1건 (fetch_peaks가 적재한 축약 키)
export type RawDeal = {
  d: string;          // deal_date YYYY-MM-DD
  p: number;          // price 만원
  py: number;         // pyeong 추정 평형
  fl: number | null;  // floor
  g: string;          // dealing_gbn 중개거래/직거래
  c: boolean;         // canceled
  a?: number;         // area m² (있을 수 있음)
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
