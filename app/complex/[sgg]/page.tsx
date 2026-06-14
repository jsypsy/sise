export const revalidate = 86400;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import { fetchAptsInSgg, complexHref, type AptSummary } from "@/lib/complex";

type Params = Promise<{ sgg: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sgg } = await params;
  const region = CODE_TO_NAME[sgg];
  if (!region) return { title: { absolute: "단지 조회 | 시세" }, robots: { index: false } };
  return {
    title: { absolute: `${region} 아파트 실거래가 — 단지별 시세 | 시세` },
    description: `${region} 아파트 단지별 매매 실거래가·신고가. 국토부 실거래가 기반 단지 목록과 최신 시세.`,
    alternates: { canonical: `/complex/${sgg}` },
    openGraph: { title: `${region} 아파트 실거래가`, url: `/complex/${sgg}` },
  };
}

export default async function RegionPage({ params }: { params: Params }) {
  const { sgg } = await params;
  const region = CODE_TO_NAME[sgg];
  if (!region) notFound();

  const apts = await fetchAptsInSgg(sgg);

  // 동(umd)별 그룹
  const byUmd = new Map<string, AptSummary[]>();
  for (const a of apts) {
    const key = a.umd_nm ?? "";
    if (!byUmd.has(key)) byUmd.set(key, []);
    byUmd.get(key)!.push(a);
  }
  const umdKeys = [...byUmd.keys()].sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <div>
      <nav className="text-xs text-[var(--ink-soft)] mb-3">
        <Link href="/complex" className="hover:underline">단지 조회</Link>
        <span className="mx-1">›</span>
        <span>{region}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">
        {region}
        <span className="text-base font-semibold text-[var(--ink-soft)] ml-2">아파트 실거래가</span>
      </h1>
      <p className="text-sm text-[var(--ink-soft)] mt-1">
        단지 {apts.length.toLocaleString()}곳 · 최근 거래 기준
      </p>

      {apts.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)] mt-6">최근 등록된 거래가 없습니다.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {umdKeys.map((umd) => (
            <section key={umd || "_"}>
              {umd && (
                <h2 className="text-sm font-semibold text-[var(--ink-soft)] mb-1 pb-1 border-b border-[var(--line)]">
                  {umd}
                </h2>
              )}
              <ul>
                {byUmd.get(umd)!.map((a) => (
                  <li key={a.apt_nm}>
                    <Link
                      href={complexHref(sgg, a.apt_nm)}
                      className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                    >
                      <span className="font-medium truncate">{a.apt_nm}</span>
                      <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap tabular-nums">
                        {won(a.peak_price)} · {a.tx_count}건
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
        국토부 실거래가 기반 · 최근 거래가 있는 단지만 표시 ·{" "}
        <Link href="/complex" className="hover:underline">다른 지역 조회 →</Link>
      </p>
    </div>
  );
}
