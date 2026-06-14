export const revalidate = 3600;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchComplex, summarize, locationLabel } from "@/lib/complex";
import { SITE_URL } from "@/lib/site";
import ComplexDetail from "../../complex-detail";

type Params = Promise<{ sgg: string; apt: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sgg, apt: aptRaw } = await params;
  const apt = decodeURIComponent(aptRaw);
  const cx = await fetchComplex(sgg, apt);
  if (!cx) {
    return { title: { absolute: `${apt} 실거래가 | 시세` }, robots: { index: false } };
  }
  const loc = locationLabel(sgg, cx.umd_nm);
  const s = summarize(cx.deals);
  const desc = s.latest
    ? `${loc} ${cx.apt_nm} 아파트 매매 실거래가. 최신 ${s.latestWon}(${s.latest.d}) · 전고점 ${s.peakWon} · 국토부 실거래가 ${s.count}건 전체 이력과 시세 추이.`
    : `${loc} ${cx.apt_nm} 아파트 매매 실거래가 전체 이력·시세 추이.`;
  const canonical = `/complex/${sgg}/${encodeURIComponent(cx.apt_nm)}`;
  return {
    title: { absolute: `${cx.apt_nm} 실거래가 · ${loc} | 시세` },
    description: desc,
    alternates: { canonical },
    openGraph: { title: `${cx.apt_nm} 실거래가 · ${loc}`, description: desc, url: canonical },
  };
}

export default async function ComplexDetailPage({ params }: { params: Params }) {
  const { sgg, apt: aptRaw } = await params;
  const apt = decodeURIComponent(aptRaw);
  const cx = await fetchComplex(sgg, apt);
  if (!cx) notFound();

  const loc = locationLabel(sgg, cx.umd_nm);
  const s = summarize(cx.deals);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: cx.apt_nm,
    url: `${SITE_URL}/complex/${sgg}/${encodeURIComponent(cx.apt_nm)}`,
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressRegion: locationLabel(sgg, null),
      ...(cx.umd_nm ? { addressLocality: cx.umd_nm } : {}),
    },
    ...(cx.build_year ? { yearBuilt: cx.build_year } : {}),
  };

  return (
    <div>
      <nav className="text-xs text-[var(--ink-soft)] mb-3">
        <Link href="/complex" className="hover:underline">단지 조회</Link>
        <span className="mx-1">›</span>
        <Link href={`/complex/${sgg}`} className="hover:underline">{locationLabel(sgg, null)}</Link>
        {cx.umd_nm && (
          <>
            <span className="mx-1">›</span>
            <span>{cx.umd_nm}</span>
          </>
        )}
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">
        {cx.apt_nm}
        <span className="text-base font-semibold text-[var(--ink-soft)] ml-2">실거래가</span>
      </h1>
      <p className="text-sm text-[var(--ink-soft)] mt-1">
        {loc}
        {cx.build_year ? ` · ${cx.build_year}년 준공` : ""}
        {s.count > 0 && ` · 총 ${s.count.toLocaleString()}건`}
      </p>

      {s.latest && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 mb-5 text-sm">
          <span>
            <span className="text-[var(--ink-soft)]">최신</span>{" "}
            <b>{s.latestWon}</b>{" "}
            <span className="text-xs text-[var(--ink-soft)]">{s.latest.d}</span>
          </span>
          <span>
            <span className="text-[var(--ink-soft)]">전고점</span>{" "}
            <b className="text-[var(--red)]">{s.peakWon}</b>
          </span>
        </div>
      )}

      <ComplexDetail rawDeals={cx.deals} />

      <p className="text-xs text-[var(--ink-soft)] mt-6">
        국토부 실거래가 공개시스템 기반 · 직거래/취소거래 포함 표시 · 평형은 추정치 ·{" "}
        <Link href="/complex" className="hover:underline">다른 단지 조회 →</Link>
      </p>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
