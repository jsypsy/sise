export const revalidate = 86400;

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  description:
    "오늘의 아파트 신고가·반등 시그널과 최근 7일 TOP. 국토부 실거래가 기반, 단지 검색.",
  alternates: { canonical: "/" },
};
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import { complexHref } from "@/lib/complex";
import { GUIDES } from "@/lib/guides";
import MainSearch from "./main-search";
import WatchlistSignals from "./watchlist-signals";

async function fetchTop(): Promise<{ highs: Signal[]; rebounds: Signal[] }> {
  // 최근 7일 '등록(신고)된' 거래 기준 — 계약일(deal_date)이 아니라 first_seen.
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: highs, error: e1 }, { data: rebounds, error: e2 }] = await Promise.all([
    supabase
      .from("signals_mv")
      .select("*")
      .gte("first_seen", sinceStr)
      .eq("dealing_gbn", "중개거래")
      .eq("is_high", true)
      .order("price", { ascending: false })
      .limit(5),
    supabase
      .from("signals_mv")
      .select("*")
      .gte("first_seen", sinceStr)
      .eq("dealing_gbn", "중개거래")
      .eq("is_rebound", true)
      .order("price", { ascending: false })
      .limit(5),
  ]);

  if (e1 || e2) console.error("[home] signals_mv 조회 오류:", e1?.message, e2?.message);

  return {
    highs: (highs as Signal[]) ?? [],
    rebounds: (rebounds as Signal[]) ?? [],
  };
}

function SignalList({ items, accent }: { items: Signal[]; accent: string }) {
  if (items.length === 0)
    return <p className="text-sm text-[var(--ink-soft)]">데이터가 없습니다.</p>;

  return (
    <ol className="space-y-0">
      {items.map((s, i) => (
        <li key={s.id} className="flex items-baseline gap-2 py-2 border-b border-[var(--line)]">
          <span className="text-xs text-[var(--ink-soft)] tabular-nums w-4 shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <Link
              href={complexHref(s.sgg_cd, s.apt_nm)}
              className="font-medium hover:underline truncate block"
            >
              {s.apt_nm}
            </Link>
            <p className="text-xs text-[var(--ink-soft)]">
              {CODE_TO_NAME[s.sgg_cd] ?? s.sgg_cd} · {s.pyeong}평 · {s.deal_date}
            </p>
          </div>
          <span className={`font-medium tabular-nums whitespace-nowrap text-[${accent}]`}>
            {won(s.price)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function HomePage() {
  const { highs, rebounds } = await fetchTop();

  return (
    <div>
      <div className="mb-4">
        <Suspense>
          <MainSearch />
        </Suspense>
      </div>

      <p className="text-sm text-[var(--ink-soft)] leading-relaxed mb-6">
        국토교통부에 신고된 아파트 매매 실거래가를 매일 가공해, 그날 시장에서 의미 있게 움직인 거래만
        골라 보여줍니다. <b className="text-[var(--red)]">신고가</b>는 그 단지·평형의 역대 최고 거래가,{" "}
        <b className="text-[var(--gold)]">반등</b>은 전고점 가까이 회복한 거래입니다. 아래는 최근 7일 새로
        등록된 거래 중 상위 시그널입니다.{" "}
        <Link href="/guide" className="text-[var(--ink)] hover:underline">
          시그널 자세히 보기 →
        </Link>
      </p>

      <WatchlistSignals />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        <section>
          <h2 className="text-base font-semibold mb-1">
            신고가 TOP 5
            <span className="text-xs text-[var(--red)] ml-2">▲</span>
          </h2>
          <SignalList items={highs} accent="var(--red)" />
        </section>

        <section>
          <h2 className="text-base font-semibold mb-1">
            반등 TOP 5
            <span className="text-xs text-[var(--gold)] ml-2">↑</span>
          </h2>
          <SignalList items={rebounds} accent="var(--gold)" />
        </section>
      </div>

      <p className="text-xs text-[var(--ink-soft)] mt-5">
        최근 7일 신규 등록 · 중개거래 기준 ·{" "}
        <Link href="/top" className="hover:underline">
          지역별로 보기 →
        </Link>
      </p>

      <section className="mt-10 border-t border-[var(--line)] pt-5">
        <h2 className="text-base font-semibold mb-1">실거래가 읽는 법</h2>
        <p className="text-xs text-[var(--ink-soft)] mb-3">
          신고가·반등 시그널과 실거래가 용어를 쉽게 풀어쓴 가이드입니다.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {GUIDES.map((g) => (
            <li key={g.slug} className="border-b border-[var(--line)] py-2">
              <Link href={`/guide/${g.slug}`} className="group block">
                <span className="text-sm font-medium group-hover:underline">{g.title}</span>
                <span className="block text-xs text-[var(--ink-soft)] mt-0.5">{g.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)] mt-3">
          <Link href="/blog" className="hover:underline">블로그에서 더 읽기 →</Link>
        </p>
      </section>
    </div>
  );
}
