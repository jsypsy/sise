export const revalidate = 86400;

import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import TopClient from "./top-client";

export const metadata: Metadata = {
  title: "지역별 TOP",
  description:
    "최근 7일 신규 등록된 아파트 신고가·반등을 지역별로. 국토부 실거래가 기반.",
  alternates: { canonical: "/top" },
  openGraph: { title: "지역별 TOP · 시세", url: "/top" },
};

function sinceStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// 기본(전국·최근7일) TOP을 서버에서 ISR로 — 크롤러가 초기 HTML에서 목록을 본다.
async function fetchTopDefault(): Promise<{ highs: Signal[]; rebounds: Signal[] }> {
  const since = sinceStr();
  const [{ data: h }, { data: r }] = await Promise.all([
    supabase
      .from("signals_mv").select("*")
      .gte("first_seen", since).eq("dealing_gbn", "중개거래").eq("is_high", true)
      .order("price", { ascending: false }).limit(10),
    supabase
      .from("signals_mv").select("*")
      .gte("first_seen", since).eq("dealing_gbn", "중개거래").eq("is_rebound", true)
      .order("price", { ascending: false }).limit(10),
  ]);
  return { highs: (h as Signal[]) ?? [], rebounds: (r as Signal[]) ?? [] };
}

export default async function TopPage() {
  const { highs, rebounds } = await fetchTopDefault();
  return <TopClient initialHighs={highs} initialRebounds={rebounds} />;
}
