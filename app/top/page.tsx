export const revalidate = 86400;

import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OG_IMAGE } from "@/lib/site";
import type { Signal } from "@/lib/types";
import TopClient from "./top-client";

export const metadata: Metadata = {
  title: "지역별 TOP",
  description:
    "최근 7일 신규 등록된 아파트 신고가·반등을 지역별로. 국토부 실거래가 기반.",
  alternates: { canonical: "/top" },
  openGraph: { title: "지역별 TOP · 시세", url: "/top", images: [OG_IMAGE] },
};

function sinceStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// 기본(전국·최근7일) TOP을 서버에서 ISR로 — 크롤러가 초기 HTML에서 목록을 본다.
async function fetchTopDefault(): Promise<{ highs: Signal[]; rebounds: Signal[] }> {
  const since = sinceStr();
  const [{ data: h, error: e1 }, { data: r, error: e2 }] = await Promise.all([
    supabase
      .from("signals_mv").select("*")
      .gte("first_seen", since).eq("dealing_gbn", "중개거래").eq("is_high", true)
      .order("price", { ascending: false }).limit(10),
    supabase
      .from("signals_mv").select("*")
      .gte("first_seen", since).eq("dealing_gbn", "중개거래").eq("is_rebound", true)
      .order("price", { ascending: false }).limit(10),
  ]);
  if (e1 || e2) console.error("[top] signals_mv 조회 오류:", e1?.message, e2?.message);
  return { highs: (h as Signal[]) ?? [], rebounds: (r as Signal[]) ?? [] };
}

export default async function TopPage() {
  const { highs, rebounds } = await fetchTopDefault();
  return (
    <div>
      <TopClient initialHighs={highs} initialRebounds={rebounds} />
      <section className="mt-8 border-t border-[var(--line)] pt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-2">이 순위를 읽는 법</h2>
        <p className="mb-2">
          이 페이지는 최근 7일 사이 국토교통부에 <b>새로 신고·등록된</b> 실거래 중, 지역별로 가격이 높은
          신고가·반등 거래 상위 10건씩을 보여줍니다. 계약일이 아니라 등록일 기준이므로 한두 달 전 계약이
          이제 신고되어 올라오는 경우도 있습니다.
        </p>
        <p>
          신고가는 그 단지·평형의 역대 최고가 경신, 반등은 전고점의 90% 이상까지 회복한 상승 거래입니다.
          시세 왜곡을 막기 위해 직거래와 취소거래는 제외한 중개거래 기준입니다. 단지명을 누르면 해당
          단지의 전체 실거래 이력을 볼 수 있습니다.
        </p>
      </section>
    </div>
  );
}
