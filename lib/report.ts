// 시장 리포트 — 국토부 실거래를 '가공·해석'한 원본 분석 콘텐츠. 데이터 표 나열이 아니라
// 지역별 신고가·반등·거래동향을 문장으로 설명한다(호갱노노·국토부엔 없는 우리만의 가공물).
// 모든 집계는 Postgres(RPC/필터 쿼리)에서 — 앱 루프 금지. ISR로 일 1회 재검증.
import { cache } from "react";
import { supabase } from "./supabase";
import type { Signal } from "./types";
import { won } from "./format";
import { CODE_TO_NAME, CODE_TO_SIDO } from "./regions";

// 리포트 페이지를 색인·노출할 최소 시그널 수(얇은 페이지 대량 생성 방지).
export const REPORT_MIN_TX = 8;

export type RegionTotal = {
  sgg_cd: string;
  tx: number;
  highs: number;
  rebounds: number;
  latest: string;
};

// 시군구별 시그널 집계(RPC). 리포트 허브·색인 판단·sitemap 공통 소스.
export async function getRegionTotals(): Promise<RegionTotal[]> {
  const { data, error } = await supabase.rpc("report_region_totals");
  if (error || !data) return [];
  return (data as RegionTotal[])
    .filter((r) => CODE_TO_NAME[r.sgg_cd]) // 폐지된 옛 코드 등 방어
    .sort((a, b) => b.tx - a.tx);
}

// "서울 강동구" → "강동구"
function guOnly(sgg: string): string {
  const full = CODE_TO_NAME[sgg] ?? sgg;
  return full.includes(" ") ? full.split(" ").slice(1).join(" ") : full;
}

// YYYY-MM-DD → "7월 3일"
function mdLabel(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
}

export type ReportItem = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  pyeong: number;
  price: number;
  priceWon: string;
  gainEok: number | null; // 신고가: 전고점 대비 상승폭(억)
  recovery: number | null; // 반등: 회복률(%)
};

export type RegionReport = {
  sgg_cd: string;
  region: string; // "서울 강동구"
  gu: string; // "강동구"
  periodFrom: string;
  periodTo: string;
  tx: number;
  highCount: number;
  reboundCount: number;
  topHighs: ReportItem[];
  topMovers: ReportItem[]; // 전고점 대비 상승폭 큰 신고가
  topRebounds: ReportItem[];
  activeComplexes: { apt_nm: string; count: number; sgg_cd: string }[];
  paragraphs: string[]; // 분석 서술
};

function toItem(s: Signal): ReportItem {
  return {
    apt_nm: s.apt_nm,
    sgg_cd: s.sgg_cd,
    umd_nm: s.umd_nm,
    pyeong: s.pyeong,
    price: s.price,
    priceWon: won(s.price),
    gainEok: s.prev_peak != null ? Math.round((s.price - s.prev_peak) / 100) / 100 : null,
    recovery: s.recovery_rate ?? null,
  };
}

// 시군구 1곳의 최근 시그널을 받아 분석 리포트를 구성한다.
// generateMetadata + 페이지 본문이 같은 요청에서 두 번 호출 → cache로 DB 1회만.
export const buildRegionReport = cache(async (sgg: string): Promise<RegionReport | null> => {
  const region = CODE_TO_NAME[sgg];
  if (!region) return null;

  const { data } = await supabase
    .from("signals_mv")
    .select("*")
    .eq("sgg_cd", sgg)
    .eq("dealing_gbn", "중개거래")
    .order("price", { ascending: false })
    .limit(2000);

  const sigs = (data as Signal[]) ?? [];
  if (sigs.length === 0) return null;

  const dates = sigs.map((s) => s.first_seen).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  const highs = sigs.filter((s) => s.is_high);
  const rebounds = sigs.filter((s) => s.is_rebound && !s.is_high);

  const topHighs = highs.slice(0, 6).map(toItem);
  const topMovers = [...highs]
    .filter((s) => s.prev_peak != null)
    .sort((a, b) => (b.price - (b.prev_peak ?? 0)) - (a.price - (a.prev_peak ?? 0)))
    .slice(0, 5)
    .map(toItem);
  const topRebounds = [...rebounds]
    .sort((a, b) => (b.recovery_rate ?? 0) - (a.recovery_rate ?? 0))
    .slice(0, 5)
    .map(toItem);

  // 거래가 활발한 단지(시그널 건수 기준)
  const byApt = new Map<string, number>();
  for (const s of sigs) byApt.set(s.apt_nm, (byApt.get(s.apt_nm) ?? 0) + 1);
  const activeComplexes = [...byApt.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([apt_nm, count]) => ({ apt_nm, count, sgg_cd: sgg }));

  const gu = guOnly(sgg);
  const periodLabel =
    periodFrom === periodTo ? mdLabel(periodTo) : `${mdLabel(periodFrom)}~${mdLabel(periodTo)}`;

  // ── 분석 서술(수치 분기라 지역마다 달라짐) ──
  const paragraphs: string[] = [];

  let p1 = `${region}에서는 최근(${periodLabel} 국토부 신고 기준) 중개거래로 신고된 아파트 실거래 가운데 `;
  if (highs.length > 0 && rebounds.length > 0) {
    p1 += `역대 최고가를 새로 쓴 신고가가 ${highs.length}건, 전고점 부근까지 회복한 반등 거래가 ${rebounds.length}건 확인됐습니다.`;
  } else if (highs.length > 0) {
    p1 += `역대 최고가를 새로 쓴 신고가가 ${highs.length}건 나왔습니다. 이 기간 뚜렷한 반등 신호는 관찰되지 않았습니다.`;
  } else if (rebounds.length > 0) {
    p1 += `신고가는 없었으나 전고점 부근까지 회복한 반등 거래가 ${rebounds.length}건 관찰됐습니다.`;
  } else {
    p1 += `신고가·반등으로 분류된 특이 거래는 없었습니다. 기존 가격대에서 거래가 이어지는 흐름입니다.`;
  }
  paragraphs.push(p1);

  if (topHighs.length > 0) {
    const t = topHighs[0];
    let p2 = `가장 높은 신고가는 ${t.apt_nm}${t.umd_nm ? `(${t.umd_nm})` : ""} ${t.pyeong}평 ${t.priceWon}입니다.`;
    if (t.gainEok != null && t.gainEok > 0) {
      p2 += ` 같은 평형 직전 최고가보다 약 ${t.gainEok}억 오른 가격입니다.`;
    }
    if (topMovers.length > 0 && topMovers[0].apt_nm !== t.apt_nm && topMovers[0].gainEok != null) {
      p2 += ` 상승폭이 가장 큰 거래는 ${topMovers[0].apt_nm} ${topMovers[0].pyeong}평으로, 전고점 대비 약 ${topMovers[0].gainEok}억 뛰었습니다.`;
    }
    paragraphs.push(p2);
  }

  if (topRebounds.length > 0) {
    const r = topRebounds[0];
    paragraphs.push(
      `반등 흐름에서는 ${r.apt_nm} ${r.pyeong}평이 전고점의 ${r.recovery}%까지 회복해 가장 눈에 띕니다. 반등은 바닥을 다지고 과거 고점 부근으로 가격이 되돌아오는 국면을 뜻합니다.`
    );
  }

  if (activeComplexes.length > 0) {
    const names = activeComplexes.slice(0, 3).map((a) => a.apt_nm).join(", ");
    paragraphs.push(
      `거래가 활발했던 단지는 ${names} 등입니다. 거래가 잦은 단지일수록 가격 신호의 신뢰도가 높습니다. 아래 목록에서 단지명을 누르면 해당 단지의 전체 실거래 이력과 시세 추이를 확인할 수 있습니다.`
    );
  }

  paragraphs.push(
    `본 리포트는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로, 시세 왜곡을 막기 위해 직거래·취소거래는 제외한 중개거래 기준입니다. 신고가·반등은 각 거래 이전의 같은 단지·평형 거래만으로 판정하며, 평형은 전용면적 기반 추정치입니다.`
  );

  return {
    sgg_cd: sgg,
    region,
    gu,
    periodFrom,
    periodTo,
    tx: sigs.length,
    highCount: highs.length,
    reboundCount: rebounds.length,
    topHighs,
    topMovers,
    topRebounds,
    activeComplexes,
    paragraphs,
  };
});

export type NationalReport = {
  periodTo: string;
  totalTx: number;
  totalHighs: number;
  totalRebounds: number;
  activeRegions: number;
  topRegions: RegionTotal[]; // 신고가 많은 지역
  paragraphs: string[];
};

// 전국 개요 — 지역별 집계(RPC)를 받아 시장 전반을 서술한다.
export async function buildNationalReport(): Promise<NationalReport | null> {
  const totals = await getRegionTotals();
  if (totals.length === 0) return null;

  const totalTx = totals.reduce((s, r) => s + r.tx, 0);
  const totalHighs = totals.reduce((s, r) => s + r.highs, 0);
  const totalRebounds = totals.reduce((s, r) => s + r.rebounds, 0);
  const periodTo = totals.reduce((m, r) => (r.latest > m ? r.latest : m), totals[0].latest);
  const topRegions = [...totals].sort((a, b) => b.highs - a.highs).slice(0, 12);

  const topName = guOnly(topRegions[0].sgg_cd);
  const paragraphs: string[] = [
    `전국에서 최근 국토부에 신고된 중개거래 아파트 실거래를 집계한 결과, 역대 최고가(신고가)가 ${totalHighs.toLocaleString()}건, 전고점 부근까지 회복한 반등 거래가 ${totalRebounds.toLocaleString()}건 확인됐습니다. 신고가가 여러 지역·단지에서 동시에 나오면 상승 흐름을, 특정 지역에 몰리면 국지적 온기를 시사합니다.`,
    `신고가가 가장 많이 나온 지역은 ${topName}입니다. 아래에서 지역을 선택하면 그 지역의 신고가·반등 단지와 거래 동향을 정리한 상세 리포트를 볼 수 있습니다.`,
    `모든 수치는 직거래·취소거래를 제외한 중개거래 기준이며, 계약일이 아니라 국토부 신고(등록)일 기준으로 집계했습니다. 실거래는 계약 후 30일 이내 신고되므로 최근 거래는 뒤늦게 반영될 수 있습니다.`,
  ];

  return {
    periodTo,
    totalTx,
    totalHighs,
    totalRebounds,
    activeRegions: totals.filter((r) => r.tx >= REPORT_MIN_TX).length,
    topRegions,
    paragraphs,
  };
}

// 시도별로 그룹핑한, 리포트가 있는(임계 이상) 지역 목록. 허브·sitemap 공통.
export function groupReportRegions(totals: RegionTotal[]) {
  const eligible = totals.filter((r) => r.tx >= REPORT_MIN_TX);
  const bySido = new Map<string, RegionTotal[]>();
  for (const r of eligible) {
    const sido = CODE_TO_SIDO[r.sgg_cd] ?? "기타";
    if (!bySido.has(sido)) bySido.set(sido, []);
    bySido.get(sido)!.push(r);
  }
  for (const list of bySido.values()) list.sort((a, b) => b.highs - a.highs);
  return bySido;
}
