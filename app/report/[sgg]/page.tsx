export const revalidate = 43200; // 12h

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildRegionReport, getRegionTotals, REPORT_MIN_TX, type ReportItem } from "@/lib/report";
import { complexHref } from "@/lib/complex";
import { CODE_TO_NAME } from "@/lib/regions";
import { SITE_URL, OG_IMAGE } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonld";

type Params = Promise<{ sgg: string }>;

// 임계 이상 지역만 빌드 프리렌더(나머지는 온디맨드 + noindex).
export async function generateStaticParams() {
  const totals = await getRegionTotals();
  return totals.filter((r) => r.tx >= REPORT_MIN_TX).map((r) => ({ sgg: r.sgg_cd }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sgg } = await params;
  const region = CODE_TO_NAME[sgg];
  if (!region) return { title: { absolute: "시장 리포트 | 시세" }, robots: { index: false } };
  const report = await buildRegionReport(sgg);
  const desc = report
    ? `${region} 아파트 시장 리포트. 최근 신고가 ${report.highCount}건·반등 ${report.reboundCount}건 등 국토부 실거래 기반 지역 동향 분석.`
    : `${region} 아파트 실거래 시장 리포트.`;
  return {
    title: { absolute: `${region} 아파트 시장 리포트 — 신고가·반등 동향 | 시세` },
    description: desc,
    alternates: { canonical: `/report/${sgg}` },
    openGraph: { title: `${region} 아파트 시장 리포트`, description: desc, url: `/report/${sgg}`, images: [OG_IMAGE] },
    // 시그널이 적은 지역은 얇은 리포트라 색인 제외(데이터 쌓이면 자동 색인).
    ...(!report || report.tx < REPORT_MIN_TX ? { robots: { index: false, follow: true } } : {}),
  };
}

function ItemRow({ item, metric }: { item: ReportItem; metric: "gain" | "recovery" | "price" }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line)]">
      <Link href={complexHref(item.sgg_cd, item.apt_nm)} className="min-w-0 hover:underline">
        <span className="text-sm font-medium">{item.apt_nm}</span>
        <span className="text-xs text-[var(--ink-soft)] ml-1.5">
          {item.umd_nm ? `${item.umd_nm} · ` : ""}{item.pyeong}평
        </span>
      </Link>
      <span className="text-xs whitespace-nowrap tabular-nums shrink-0">
        <b>{item.priceWon}</b>
        {metric === "gain" && item.gainEok != null && item.gainEok > 0 && (
          <span className="text-[var(--red)] ml-1.5">▲{item.gainEok}억</span>
        )}
        {metric === "recovery" && item.recovery != null && (
          <span className="text-[var(--gold)] ml-1.5">회복 {item.recovery}%</span>
        )}
      </span>
    </li>
  );
}

export default async function RegionReportPage({ params }: { params: Params }) {
  const { sgg } = await params;
  const report = await buildRegionReport(sgg);
  if (!report) {
    if (!CODE_TO_NAME[sgg]) notFound();
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">{CODE_TO_NAME[sgg]} 시장 리포트</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          최근 국토부에 신고된 거래가 아직 충분하지 않아 리포트를 준비하지 못했습니다.{" "}
          <Link href="/report" className="hover:underline">다른 지역 리포트 보기 →</Link>
        </p>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${report.region} 아파트 시장 리포트`,
    description: `${report.region} 최근 신고가 ${report.highCount}건·반등 ${report.reboundCount}건 동향 분석.`,
    inLanguage: "ko-KR",
    url: `${SITE_URL}/report/${sgg}`,
    author: { "@type": "Organization", name: "시세" },
    publisher: { "@type": "Organization", name: "시세" },
  };

  return (
    <article>
      <nav className="text-xs text-[var(--ink-soft)] mb-3">
        <Link href="/report" className="hover:underline">시장 리포트</Link>
        <span className="mx-1">›</span>
        <span>{report.gu}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">
        {report.region}
        <span className="text-base font-semibold text-[var(--ink-soft)] ml-2">시장 리포트</span>
      </h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 mb-4 text-xs text-[var(--ink-soft)]">
        <span>신고가 <b className="text-[var(--red)]">{report.highCount}</b>건</span>
        <span>반등 <b className="text-[var(--gold)]">{report.reboundCount}</b>건</span>
        <span>집계 시그널 {report.tx.toLocaleString()}건</span>
      </div>

      <section className="text-sm leading-relaxed mb-6">
        {report.paragraphs.map((p, i) => (
          <p key={i} className="mb-2">{p}</p>
        ))}
      </section>

      {report.topHighs.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold mb-1">신고가 <span className="text-[var(--red)] text-xs">▲</span></h2>
          <ul>{report.topHighs.map((it, i) => <ItemRow key={i} item={it} metric="gain" />)}</ul>
        </section>
      )}

      {report.topRebounds.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold mb-1">반등 <span className="text-[var(--gold)] text-xs">↑</span></h2>
          <ul>{report.topRebounds.map((it, i) => <ItemRow key={i} item={it} metric="recovery" />)}</ul>
        </section>
      )}

      {report.activeComplexes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold mb-1">거래가 활발한 단지</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {report.activeComplexes.map((a) => (
              <li key={a.apt_nm}>
                <Link
                  href={complexHref(a.sgg_cd, a.apt_nm)}
                  className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                >
                  <span className="text-sm truncate">{a.apt_nm}</span>
                  <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap tabular-nums">{a.count}건</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--ink-soft)] mt-6">
        <Link href={`/complex/${sgg}`} className="hover:underline">{report.gu} 단지 전체 보기 →</Link>
        <span className="mx-2">·</span>
        <Link href="/report" className="hover:underline">다른 지역 리포트</Link>
      </p>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
    </article>
  );
}
