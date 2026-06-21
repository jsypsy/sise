import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type AptRow = {
  apt_nm: string;
  sgg_cd: string;
  umd_nm: string | null;
  tx_count: number;
  latest_date: string;
  peak_price: number;
};

function groupApts(rows: { apt_nm: string; sgg_cd: string; umd_nm: string | null; price: number; deal_date: string }[]): AptRow[] {
  const groups = new Map<string, AptRow>();
  for (const row of rows) {
    const key = `${row.apt_nm}|${row.sgg_cd}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { apt_nm: row.apt_nm, sgg_cd: row.sgg_cd, umd_nm: row.umd_nm, tx_count: 1, latest_date: row.deal_date, peak_price: row.price });
    } else {
      g.tx_count++;
      if (row.price > g.peak_price) g.peak_price = row.price;
      if (row.deal_date > g.latest_date) g.latest_date = row.deal_date;
    }
  }
  return [...groups.values()];
}

export async function GET(req: NextRequest) {
  const sgg = req.nextUrl.searchParams.get("sgg");
  const umd = req.nextUrl.searchParams.get("umd");
  const q   = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // 동 목록만 빠르게 반환 (단일 컬럼 쿼리 → 응답 작음)
  if (sgg && !q && req.nextUrl.searchParams.get("fields") === "umds") {
    const { data } = await supabase
      .from("transactions")
      .select("umd_nm")
      .eq("sgg_cd", sgg)
      .eq("canceled", false)
      .not("umd_nm", "is", null)
      .limit(5000);
    const umds = [...new Set((data ?? []).map((r) => r.umd_nm as string))].sort((a, b) =>
      a.localeCompare(b, "ko")
    );
    return NextResponse.json(umds);
  }

  // 단지 목록: sgg만 있을 때 → 해당 시군구 전체 단지
  if (sgg && !q) {
    let qb = supabase
      .from("transactions")
      .select("apt_nm, sgg_cd, umd_nm, price, deal_date")
      .eq("sgg_cd", sgg)
      .eq("canceled", false)
      .order("deal_date", { ascending: false })
      .limit(5000);
    if (umd) qb = qb.eq("umd_nm", umd);
    const { data } = await qb;
    const apts = groupApts(data ?? []).sort((a, b) => a.apt_nm.localeCompare(b.apt_nm, "ko"));
    return NextResponse.json(apts);
  }

  // 단지 검색: q 기준 ILIKE, sgg 있으면 한정
  if (!q) return NextResponse.json([]);

  let qb = supabase
    .from("transactions")
    .select("apt_nm, sgg_cd, umd_nm, price, deal_date")
    .ilike("apt_nm", `%${q}%`)
    .eq("canceled", false);

  if (sgg) qb = qb.eq("sgg_cd", sgg);

  const { data } = await qb.order("deal_date", { ascending: false }).limit(300);
  return NextResponse.json(groupApts(data ?? []));
}
