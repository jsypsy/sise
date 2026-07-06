// 단지별 '고유' 요약 문단 생성기. 이미 로드된 cx.deals에서 계산하므로 추가 DB/egress 없음.
// 모든 수치는 취소 제외 실거래 기준(페이지 헤더 summarize와 동일) → 화면에 보이는 숫자와 일치한다.
// 단지마다 실제 수치·조건 분기가 달라 문장이 전부 달라진다(템플릿 양산 아님, 데이터 해석 콘텐츠).
import { won } from "./format";
import type { RawComplex } from "./complex";

export type ComplexNarrative = {
  pyeong: number;
  paragraphs: string[];
};

// 오늘로부터 n개월 전 날짜(YYYY-MM-DD). deal_date 문자열과 사전식 비교용.
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export function complexNarrative(cx: RawComplex, loc: string): ComplexNarrative | null {
  const valid = cx.deals.filter((d) => !d.c);
  if (valid.length < 2) return null;

  // 대상 평형: 거래 최다 평형 우선, 국평(33·34)이 2건 이상이면 그쪽을 우선(단지 상세 기본값과 동일 취지).
  const countByPy = new Map<number, number>();
  for (const d of valid) countByPy.set(d.py, (countByPy.get(d.py) ?? 0) + 1);
  const byFreq = [...countByPy.entries()].sort((a, b) => b[1] - a[1]).map(([py]) => py);
  const eligible = byFreq.filter((p) => (countByPy.get(p) ?? 0) >= 2);
  if (eligible.length === 0) return null;
  const py = eligible.find((p) => p === 33 || p === 34) ?? eligible[0];

  const dealsP = valid.filter((d) => d.py === py).sort((a, b) => a.d.localeCompare(b.d));
  const latest = dealsP[dealsP.length - 1];
  const prev = dealsP[dealsP.length - 2];
  const peak = dealsP.reduce((m, d) => Math.max(m, d.p), 0);
  const delta = prev.p !== 0 ? Math.round(((latest.p - prev.p) / prev.p) * 100) : null;
  const recovery = peak > 0 ? Math.round((latest.p / peak) * 100) : null;
  const isAtPeak = latest.p >= peak;

  // 최근 12개월 거래·신고가(직전 최고가 갱신) 건수 — 첫 거래는 '이전'이 없어 신고가 제외(프로젝트 규칙).
  const cutoff = monthsAgo(12);
  let runningMax = 0;
  let recentCount = 0;
  let recentHighs = 0;
  for (const d of dealsP) {
    const isNewHigh = runningMax > 0 && d.p > runningMax;
    if (d.d >= cutoff) {
      recentCount += 1;
      if (isNewHigh) recentHighs += 1;
    }
    if (d.p > runningMax) runningMax = d.p;
  }

  const built = cx.build_year ? `(${cx.build_year}년 준공)` : "";
  const paragraphs: string[] = [];

  // 문단 1: 최근가 + 추세 해석
  let p1 = `${loc} ${cx.apt_nm}${built} 전용 약 ${py}평형은 국토부 실거래 기준 최근 ${won(latest.p)}(${latest.d})에 거래됐습니다.`;
  if (isAtPeak) {
    p1 +=
      delta != null && delta > 0
        ? ` 이는 이 평형의 역대 최고가로, 직전 거래(${won(prev.p)}) 대비 ${delta}% 오른 신고가입니다.`
        : ` 이는 이 평형의 역대 최고가 수준입니다.`;
  } else if (recovery != null) {
    if (delta != null && delta > 0) {
      p1 += ` 직전 거래(${won(prev.p)}) 대비 ${delta}% 올라, 전고점 ${won(peak)} 대비 ${recovery}% 수준까지 회복했습니다.`;
    } else if (delta != null && delta < 0) {
      p1 += ` 직전 거래 대비 ${delta}% 내렸으며, 전고점 ${won(peak)} 대비 ${recovery}% 수준입니다.`;
    } else {
      p1 += ` 전고점은 ${won(peak)}이며, 현재 그 대비 ${recovery}% 수준입니다.`;
    }
  }
  paragraphs.push(p1);

  // 문단 2: 최근 1년 거래 활발도
  if (recentCount > 0) {
    const highs = recentHighs > 0 ? `으며, 그중 신고가는 ${recentHighs}건입니다` : "습니다";
    paragraphs.push(
      `최근 1년간 이 평형은 ${recentCount}건 거래됐${highs}. 아래 표와 차트에서 전체 실거래 이력과 시세 추이를 확인할 수 있습니다.`
    );
  }

  return { pyeong: py, paragraphs };
}
