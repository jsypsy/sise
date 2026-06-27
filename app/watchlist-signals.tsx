"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getWatchlist, WATCHLIST_EVENT, type WatchItem } from "@/lib/watchlist";
import { complexHref } from "@/lib/complex";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import type { Signal } from "@/lib/types";

type WatchRow = {
  sgg: string;
  apt: string;
  latestPrice: number | null;
  signal: "high" | "rebound" | null; // 최근 신고가/반등이면 작은 배지로만
};

// 관심단지(localStorage)를 깔끔한 리스트로. 단지당 한 줄(단지명·지역·최신가),
// 최근 신고가/반등이 있는 단지에만 작은 배지. (신호 피드 X)
// 개인화라 정적 생성 불가 → 워치리스트가 있는 방문자만 anon 쿼리 1회.
export default function WatchlistSignals() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // 마운트 후 워치리스트 로드 + 같은 탭 변경 구독.
  useEffect(() => {
    setReady(true);
    const load = () => setItems(getWatchlist());
    load();
    window.addEventListener(WATCHLIST_EVENT, load);
    return () => window.removeEventListener(WATCHLIST_EVENT, load);
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    // 최근 60일(deal_date) 중개거래로 최신가 + 신호 배지 판정.
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const sinceStr = since.toISOString().slice(0, 10);
    const aptNames = [...new Set(items.map((i) => i.apt))];
    const sggCodes = [...new Set(items.map((i) => i.sgg))];
    const wanted = new Set(items.map((i) => `${i.sgg}|${i.apt}`));

    supabase
      .from("signals_mv")
      .select("apt_nm, sgg_cd, price, deal_date, is_high, is_rebound")
      .in("apt_nm", aptNames)
      .in("sgg_cd", sggCodes)
      .eq("dealing_gbn", "중개거래")
      .gte("deal_date", sinceStr)
      .order("deal_date", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        if (cancelled) return;
        // 단지별: 최신가(가장 최근 거래) + 신호 여부.
        const agg = new Map<string, WatchRow>();
        for (const r of (data ?? []) as Signal[]) {
          const key = `${r.sgg_cd}|${r.apt_nm}`;
          if (!wanted.has(key)) continue;
          let row = agg.get(key);
          if (!row) {
            // rows는 deal_date 내림차순 → 첫 등장 = 최신가
            row = { sgg: r.sgg_cd, apt: r.apt_nm, latestPrice: r.price, signal: null };
            agg.set(key, row);
          }
          if (row.signal === null && (r.is_high || r.is_rebound)) {
            row.signal = r.is_high ? "high" : "rebound";
          }
        }
        // 담긴 모든 단지를 한 줄씩(최근 거래 없으면 가격/배지 없이).
        setRows(
          items.map(
            (it) =>
              agg.get(`${it.sgg}|${it.apt}`) ?? {
                sgg: it.sgg,
                apt: it.apt,
                latestPrice: null,
                signal: null,
              }
          )
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  // SSR/첫 렌더는 null → 워치리스트 없는 방문자에겐 아무것도 안 그림.
  if (!ready || items.length === 0) return null;

  return (
    <section className="mb-6 border border-[var(--line)] rounded-lg p-4">
      <h2 className="text-base font-semibold mb-2">
        관심단지
        <span className="text-xs font-normal text-[var(--ink-soft)] ml-2">
          {items.length}개
        </span>
      </h2>

      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">불러오는 중…</p>
      ) : (
        <ul className="space-y-0">
          {rows.map((r) => (
            <li
              key={`${r.sgg}|${r.apt}`}
              className="flex items-baseline gap-2 py-2 border-b border-[var(--line)] last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Link
                    href={complexHref(r.sgg, r.apt)}
                    className="font-medium hover:underline truncate"
                  >
                    {r.apt}
                  </Link>
                  {r.signal && (
                    <span
                      className={`text-[10px] font-bold rounded px-1 py-0 leading-tight border whitespace-nowrap shrink-0 ${
                        r.signal === "high"
                          ? "text-[var(--red)] border-[var(--red)]"
                          : "text-[var(--gold)] border-[var(--gold)]"
                      }`}
                    >
                      {r.signal === "high" ? "신고가" : "반등"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ink-soft)]">
                  {CODE_TO_NAME[r.sgg] ?? r.sgg}
                </p>
              </div>
              {r.latestPrice != null && (
                <span className="text-sm tabular-nums whitespace-nowrap text-[var(--ink-soft)]">
                  {won(r.latestPrice)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
