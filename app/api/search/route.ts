import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";

export async function GET(req: NextRequest) {
  const apt = req.nextUrl.searchParams.get("apt");
  const sgg = req.nextUrl.searchParams.get("sgg");
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // 단지 거래 이력: apt + sgg 지정 시 signals_v에서 조회
  if (apt && sgg) {
    const { data } = await supabase
      .from("signals_v")
      .select("*")
      .eq("apt_nm", apt)
      .eq("sgg_cd", sgg)
      .order("deal_date", { ascending: false })
      .order("pyeong", { ascending: true })
      .limit(100);
    return NextResponse.json((data as Signal[]) ?? []);
  }

  // 단지 검색: q 기준 ILIKE, sgg 있으면 시군구 한정
  if (!q) return NextResponse.json([]);

  let qb = supabase
    .from("transactions")
    .select("apt_nm, sgg_cd, umd_nm, price, deal_date, dealing_gbn, canceled")
    .ilike("apt_nm", `%${q}%`)
    .eq("canceled", false);

  if (sgg) qb = qb.eq("sgg_cd", sgg);

  const { data } = await qb.order("deal_date", { ascending: false }).limit(300);

  const rows = data ?? [];
  const groups = new Map<
    string,
    {
      apt_nm: string;
      sgg_cd: string;
      umd_nm: string | null;
      tx_count: number;
      latest_date: string;
      peak_price: number;
    }
  >();

  for (const row of rows) {
    const key = `${row.apt_nm}|${row.sgg_cd}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        apt_nm: row.apt_nm,
        sgg_cd: row.sgg_cd,
        umd_nm: row.umd_nm,
        tx_count: 1,
        latest_date: row.deal_date,
        peak_price: row.price,
      });
    } else {
      g.tx_count++;
      if (row.price > g.peak_price) g.peak_price = row.price;
      if (row.deal_date > g.latest_date) g.latest_date = row.deal_date;
    }
  }

  return NextResponse.json([...groups.values()]);
}
