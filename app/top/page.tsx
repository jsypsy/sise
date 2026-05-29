export const revalidate = 86400;

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";

async function fetchTop(): Promise<Signal[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("signals_v")
    .select("*")
    .gte("deal_date", sinceStr)
    .eq("dealing_gbn", "중개거래")
    .order("price", { ascending: false })
    .limit(10);

  return (data as Signal[]) ?? [];
}

export default async function TopPage() {
  const top = await fetchTop();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">최근 7일 TOP 10</h2>
      <p className="text-xs text-[var(--ink-soft)] mb-4">직거래·취소거래 제외</p>
      {top.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">데이터가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs text-[var(--ink-soft)]">
                <th className="py-2 pr-2 font-medium w-6">#</th>
                <th className="py-2 pr-3 font-medium">단지</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">평형/층</th>
                <th className="py-2 pr-3 font-medium text-right">거래가</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">시그널</th>
                <th className="py-2 font-medium text-right hidden sm:table-cell">거래일</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s, i) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                >
                  <td className="py-1.5 pr-2 text-[var(--ink-soft)] tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Link
                      href={`/complex?apt=${encodeURIComponent(s.apt_nm)}&sgg=${encodeURIComponent(s.sgg_cd)}`}
                      className="font-medium hover:underline"
                    >
                      {s.apt_nm}
                    </Link>
                    <div className="text-xs text-[var(--ink-soft)]">
                      {CODE_TO_NAME[s.sgg_cd] ?? s.sgg_cd}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap hidden sm:table-cell">
                    {s.pyeong}평{s.floor != null ? ` ${s.floor}층` : ""}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium whitespace-nowrap">
                    <span className={s.is_high ? "text-[var(--red)]" : ""}>
                      {won(s.price)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap hidden sm:table-cell">
                    {s.is_high && (
                      <span className="bg-[var(--red)] text-white text-xs px-1.5 py-0.5 rounded">
                        신고가
                      </span>
                    )}
                    {s.is_rebound && (
                      <span className="border border-[var(--gold)] text-[var(--gold)] text-xs px-1.5 py-0.5 rounded">
                        반등
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-xs text-[var(--ink-soft)] hidden sm:table-cell">
                    {s.deal_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
