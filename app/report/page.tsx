export const revalidate = 43200; // 12h

import type { Metadata } from "next";
import Link from "next/link";
import { buildNationalReport, getRegionTotals, groupReportRegions } from "@/lib/report";
import { CODE_TO_NAME } from "@/lib/regions";

export const metadata: Metadata = {
  title: "아파트 시장 리포트 — 지역별 신고가·반등 동향",
  description:
    "국토부 실거래가를 가공한 지역별 아파트 시장 리포트. 최근 신고가·반등·거래 동향을 지역별로 분석해 정리했습니다.",
  alternates: { canonical: "/report" },
  openGraph: { title: "아파트 시장 리포트 · 시세", url: "/report" },
};

function gu(sgg: string): string {
  const full = CODE_TO_NAME[sgg] ?? sgg;
  return full.includes(" ") ? full.split(" ").slice(1).join(" ") : full;
}

export default async function ReportHubPage() {
  const [national, totals] = await Promise.all([buildNationalReport(), getRegionTotals()]);
  const bySido = groupReportRegions(totals);
  const sidoKeys = [...bySido.keys()];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">아파트 시장 리포트</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        국토교통부 실거래가를 가공해, 최근 지역별 신고가·반등·거래 동향을 정리한 분석 리포트입니다.
      </p>

      {national && (
        <section className="mb-8 text-sm leading-relaxed">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-xs text-[var(--ink-soft)]">
            <span>신고가 <b className="text-[var(--red)]">{national.totalHighs.toLocaleString()}</b>건</span>
            <span>반등 <b className="text-[var(--gold)]">{national.totalRebounds.toLocaleString()}</b>건</span>
            <span>리포트 지역 <b>{national.activeRegions}</b>곳</span>
          </div>
          {national.paragraphs.map((p, i) => (
            <p key={i} className="mb-2">{p}</p>
          ))}
        </section>
      )}

      {sidoKeys.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">아직 리포트를 만들 만큼의 최근 거래가 없습니다.</p>
      ) : (
        <div className="space-y-5">
          {sidoKeys.map((sido) => (
            <section key={sido}>
              <h2 className="text-sm font-semibold text-[var(--ink-soft)] mb-1 pb-1 border-b border-[var(--line)]">
                {sido}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {bySido.get(sido)!.map((r) => (
                  <li key={r.sgg_cd}>
                    <Link
                      href={`/report/${r.sgg_cd}`}
                      className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                    >
                      <span className="text-sm font-medium">{gu(r.sgg_cd)}</span>
                      <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap tabular-nums">
                        신고가 {r.highs} · 반등 {r.rebounds}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--ink-soft)] mt-6">
        중개거래 기준(직거래·취소 제외) · 국토부 신고일 기준 집계 ·{" "}
        <Link href="/guide" className="hover:underline">용어 가이드 →</Link>
      </p>
    </div>
  );
}
