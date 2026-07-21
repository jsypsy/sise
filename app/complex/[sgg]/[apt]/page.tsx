export const revalidate = 3600;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchComplexMerged, summarize, locationLabel, fetchAptsInSgg, complexHref } from "@/lib/complex";
import { complexNarrative } from "@/lib/summary";
import { won } from "@/lib/format";
import { SITE_URL, OG_IMAGE } from "@/lib/site";
import ComplexDetail from "../../complex-detail";
import WatchButton from "../../../watch-button";
import { jsonLdString } from "@/lib/jsonld";

type Params = Promise<{ sgg: string; apt: string }>;

// URL 파라미터에 잘못된 %인코딩이 와도 500 대신 원본을 쓰도록 안전 디코드.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sgg, apt: aptRaw } = await params;
  const apt = safeDecode(aptRaw);
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
    openGraph: { title: `${cx.apt_nm} 실거래가 · ${loc}`, description: desc, url: canonical, images: [OG_IMAGE] },
    // 거래 이력이 너무 적은 단지(R2 미수집 DB폴백 등)는 '얇은 페이지 대량 색인'으로
    // 저품질 판정을 유발하므로 색인 제외. 사용자는 그대로 볼 수 있고(follow로 링크도 전달),
    // R2가 채워져 이력이 쌓이면 재검증 때 자동으로 색인 허용된다.
    ...(s.count < 5 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ComplexDetailPage({ params }: { params: Params }) {
  const { sgg, apt: aptRaw } = await params;
  const apt = safeDecode(aptRaw);
  // 단지 본체와 '관련 단지' 목록을 병렬로 — 서로 의존 없음.
  const [cx, inSgg] = await Promise.all([
    fetchComplexMerged(sgg, apt),
    fetchAptsInSgg(sgg),
  ]);
  if (!cx) notFound();

  const loc = locationLabel(sgg, cx.umd_nm);
  const s = summarize(cx.deals);
  const narrative = complexNarrative(cx, loc);

  // 같은 동(없으면 같은 시군구) 다른 단지 — 내부 링크 + 탐색.
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

      {narrative && (
        <section className="mt-4 text-sm leading-relaxed">
          {narrative.paragraphs.map((p, i) => (
            <p key={i} className={i > 0 ? "mt-2 text-[var(--ink-soft)]" : ""}>
              {p}
            </p>
          ))}
        </section>
      )}

      <ComplexDetail rawDeals={cx.deals} />

      <section className="mt-8 border-t border-[var(--line)] pt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-2">이 표를 읽는 법</h2>
        <p className="mb-2">
          위 표는 <b>{cx.apt_nm}</b>의 국토교통부 매매 실거래 전체 이력입니다. 기본값은 거래가 가장 많은
          평형이며, 위쪽 버튼으로 평형을 바꿔 볼 수 있습니다. <b className="text-[var(--red)]">최고가</b> 표시는
          해당 평형에서 그때까지의 역대 최고 거래가를, <b>증감</b>은 같은 평형 직전 거래 대비 등락률을
          뜻합니다.
        </p>
        <p className="mb-2">
          <span className="text-[var(--blue)]">직거래</span>(공인중개사를 거치지 않은 거래)와 취소된 거래는
          시세를 왜곡할 수 있어 파란색·취소선으로 구분해 표시합니다. 평형은 전용면적을 평으로 환산한
          추정치이며, 정확한 면적은 전용면적(㎡)을 기준으로 확인하세요.
        </p>
        <p>
          실거래는 계약 후 신고까지 시차가 있어 최근 거래는 뒤늦게 추가될 수 있습니다.{" "}
          <Link href="/guide/real-transaction-price" className="text-[var(--ink)] hover:underline">
            실거래가란 무엇인가 →
          </Link>
        </p>
      </section>

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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
    </div>
  );
}
