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

  // 동 목록만 빠르게 반환 (DB에서 DISTINCT → 수십 개 문자열만 전송)
  if (sgg && !q && req.nextUrl.searchParams.get("fields") === "umds") {
    const { data } = await supabase.rpc("get_umds", { p_sgg_cd: sgg });
    const umds = (data ?? []) as string[];
    return NextResponse.json(umds, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }

  // 단지 목록: sgg(+umd)만 있을 때 → DB에서 단지별 집계(RPC). 수천 행 대신 수십 행.
  if (sgg && !q) {
    const { data, error } = await supabase.rpc("get_apts_in_sgg", {
      p_sgg_cd: sgg,
      p_umd: umd ?? null,
    });
    if (!error && data) {
      const apts = (data as AptRow[]).sort((a, b) => a.apt_nm.localeCompare(b.apt_nm, "ko"));
      return NextResponse.json(apts);
    }
    // fallback: RPC 미적용 시 기존 방식(거래 행 받아 그룹핑)
    let qb = supabase
      .from("transactions")
      .select("apt_nm, sgg_cd, umd_nm, price, deal_date")
      .eq("sgg_cd", sgg)
      .eq("canceled", false)
      .order("deal_date", { ascending: false })
      .limit(5000);
    if (umd) qb = qb.eq("umd_nm", umd);
    const { data: rows } = await qb;
    const apts = groupApts(rows ?? []).sort((a, b) => a.apt_nm.localeCompare(b.apt_nm, "ko"));
    return NextResponse.json(apts);
  }

  // 단지 검색: 공백 토큰 AND(ILIKE) 우선, sgg 있으면 한정
  if (!q) return NextResponse.json([]);

  let qb = supabase
    .from("transactions")
    .select("apt_nm, sgg_cd, umd_nm, price, deal_date")
    .eq("canceled", false);

  // 공백으로 나눈 각 토큰을 모두 포함(순서 무관). 토큰 없으면 q 전체.
  for (const term of q.split(/\s+/).filter(Boolean)) {
    qb = qb.ilike("apt_nm", `%${term}%`);
  }

  if (sgg) qb = qb.eq("sgg_cd", sgg);

  const { data } = await qb.order("deal_date", { ascending: false }).limit(300);
  const grouped = groupApts(data ?? []);
  if (grouped.length > 0) return NextResponse.json(grouped);

  // fallback: 어순 뒤바뀜·붙여쓰기·오타 → 트라이그램 유사도 검색
  const { data: trgm } = await supabase.rpc("search_apts_trgm", { p_q: q });
  const rows = (trgm ?? []) as AptRow[];
  return NextResponse.json(sgg ? rows.filter((r) => r.sgg_cd === sgg) : rows);
}
