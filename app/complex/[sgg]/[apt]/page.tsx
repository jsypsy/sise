export const revalidate = 3600;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchComplexMerged, summarize, locationLabel, fetchAptsInSgg, complexHref } from "@/lib/complex";
import { won } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import ComplexDetail from "../../complex-detail";
import WatchButton from "../../../watch-button";

type Params = Promise<{ sgg: string; apt: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sgg, apt: aptRaw } = await params;
  const apt = decodeURIComponent(aptRaw);
  const cx = await fetchComplexMerged(sgg, apt);
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
  const cx = await fetchComplexMerged(sgg, apt);
  if (!cx) notFound();

  const loc = locationLabel(sgg, cx.umd_nm);
  const s = summarize(cx.deals);

  // 같은 동(없으면 같은 시군구) 다른 단지 — 내부 링크 + 탐색.
  const inSgg = await fetchAptsInSgg(sgg);
  const related = (cx.umd_nm ? inSgg.filter((a) => a.umd_nm === cx.umd_nm) : inSgg)
    .filter((a) => a.apt_nm !== cx.apt_nm)
    .sort((a, b) => b.tx_count - a.tx_count)
    .slice(0, 12);
  const relatedLabel = cx.umd_nm ? `${cx.umd_nm} 다른 단지` : `${locationLabel(sgg, null)} 다른 단지`;

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

      <div className="mt-3">
        <WatchButton sgg={sgg} apt={cx.apt_nm} />
      </div>

      <ComplexDetail rawDeals={cx.deals} />

      {related.length > 0 && (
        <section className="mt-8 border-t border-[var(--line)] pt-4">
          <h2 className="text-sm font-semibold mb-2">{relatedLabel}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {related.map((a) => (
              <li key={a.apt_nm}>
                <Link
                  href={complexHref(sgg, a.apt_nm)}
                  className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                >
                  <span className="text-sm truncate">{a.apt_nm}</span>
                  <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap tabular-nums">{won(a.peak_price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--ink-soft)] mt-6">
        국토부 실거래가 공개시스템 기반 · 직거래/취소거래 포함 표시 · 평형은 추정치 ·{" "}
        <Link href="/complex" className="hover:underline">다른 단지 조회 →</Link>
      </p>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
