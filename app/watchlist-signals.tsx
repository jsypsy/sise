"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getWatchlist, WATCHLIST_EVENT, type WatchItem } from "@/lib/watchlist";
import { complexHref } from "@/lib/complex";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";
import type { Signal } from "@/lib/types";

// 관심단지(localStorage) 중 최근 30일 신고가·반등 시그널을 모아 보여준다.
// 개인화라 정적 생성 불가 → 워치리스트가 있는 방문자만 anon 쿼리 1회.
export default function WatchlistSignals() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
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
      setSignals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);
    const aptNames = [...new Set(items.map((i) => i.apt))];
    const sggCodes = [...new Set(items.map((i) => i.sgg))];
    const wanted = new Set(items.map((i) => `${i.sgg}|${i.apt}`));

    supabase
      .from("signals_mv")
      .select("*")
      .in("apt_nm", aptNames)
      .in("sgg_cd", sggCodes)
      .gte("first_seen", sinceStr)
      .eq("dealing_gbn", "중개거래")
      .or("is_high.eq.true,is_rebound.eq.true")
      .order("first_seen", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (cancelled) return;
        // (apt_nm, sgg_cd) 교차곱 중 실제 담긴 단지만 남긴다.
        const matched = ((data as Signal[]) ?? []).filter((r) =>
          wanted.has(`${r.sgg_cd}|${r.apt_nm}`)
        );
        setSignals(matched);
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
        관심단지 시그널
        <span className="text-xs font-normal text-[var(--ink-soft)] ml-2">
          최근 30일 · {items.length}개 단지
        </span>
      </h2>

      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">불러오는 중…</p>
      ) : signals.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">최근 30일 내 시그널이 없습니다.</p>
      ) : (
        <ol className="space-y-0">
          {signals.map((s) => (
            <li
              key={s.id}
              className="flex items-baseline gap-2 py-2 border-b border-[var(--line)] last:border-0"
            >
              <span
                className={`text-[10px] font-bold rounded px-1 py-0 leading-tight border whitespace-nowrap ${
                  s.is_high
                    ? "text-[var(--red)] border-[var(--red)]"
                    : "text-[var(--gold)] border-[var(--gold)]"
                }`}
              >
                {s.is_high ? "신고가" : "반등"}
              </span>
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
              <span
                className={`font-medium tabular-nums whitespace-nowrap ${
                  s.is_high ? "text-[var(--red)]" : "text-[var(--gold)]"
                }`}
              >
                {won(s.price)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
