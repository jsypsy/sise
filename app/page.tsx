export const revalidate = 86400;

import { Suspense } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import MainSearch from "./main-search";

async function fetchTop(): Promise<{ highs: Signal[]; rebounds: Signal[] }> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: highs }, { data: rebounds }] = await Promise.all([
    supabase
      .from("signals_mv")
      .select("*")
      .gte("deal_date", sinceStr)
      .eq("dealing_gbn", "중개거래")
      .eq("is_high", true)
      .order("price", { ascending: false })
      .limit(5),
    supabase
      .from("signals_mv")
      .select("*")
      .gte("deal_date", sinceStr)
      .eq("dealing_gbn", "중개거래")
      .eq("is_rebound", true)
      .order("price", { ascending: false })
      .limit(5),
  ]);

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
              href={`/complex?apt=${encodeURIComponent(s.apt_nm)}&sgg=${encodeURIComponent(s.sgg_cd)}`}
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
      <div className="mb-6">
        <Suspense>
          <MainSearch />
        </Suspense>
      </div>

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
        최근 7일 · 중개거래 기준 ·{" "}
        <Link href="/top" className="hover:underline">
          지역별로 보기 →
        </Link>
      </p>
    </div>
  );
}
