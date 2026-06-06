"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/format";
import { REGIONS, SIDO_LIST, CODE_TO_NAME } from "@/lib/regions";
import type { Signal } from "@/lib/types";

function sinceStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function SignalList({ items, loading }: { items: Signal[]; loading: boolean }) {
  if (loading)
    return <p className="text-sm text-[var(--ink-soft)]">불러오는 중…</p>;
  if (items.length === 0)
    return <p className="text-sm text-[var(--ink-soft)]">해당 조건의 거래가 없습니다.</p>;

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
          <span className="font-medium tabular-nums whitespace-nowrap">
            {won(s.price)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function TopPage() {
  const [sido, setSido] = useState("");
  const [sggCd, setSggCd] = useState("");
  const [highs, setHighs] = useState<Signal[]>([]);
  const [rebounds, setRebounds] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  const sggList = sido
    ? Object.entries(REGIONS[sido] ?? {}).sort(([, a], [, b]) =>
        a.localeCompare(b, "ko")
      )
    : [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const since = sinceStr();

    async function load() {
      let highQ = supabase
        .from("signals_mv")
        .select("*")
        .gte("first_seen", since)
        .eq("dealing_gbn", "중개거래")
        .eq("is_high", true)
        .order("price", { ascending: false })
        .limit(10);

      let rebQ = supabase
        .from("signals_mv")
        .select("*")
        .gte("first_seen", since)
        .eq("dealing_gbn", "중개거래")
        .eq("is_rebound", true)
        .order("price", { ascending: false })
        .limit(10);

      if (sggCd) {
        highQ = highQ.eq("sgg_cd", sggCd);
        rebQ = rebQ.eq("sgg_cd", sggCd);
      } else if (sido) {
        const codes = Object.keys(REGIONS[sido] ?? {});
        highQ = highQ.in("sgg_cd", codes);
        rebQ = rebQ.in("sgg_cd", codes);
      }

      const [{ data: h }, { data: r }] = await Promise.all([highQ, rebQ]);

      if (!cancelled) {
        setHighs((h as Signal[]) ?? []);
        setRebounds((r as Signal[]) ?? []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sido, sggCd]);

  function handleSidoChange(next: string) {
    setSido(next);
    setSggCd("");
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">지역별 TOP 10</h2>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <select
          value={sido}
          onChange={(e) => handleSidoChange(e.target.value)}
          className="border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)]"
        >
          <option value="">전국</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sggCd}
          onChange={(e) => setSggCd(e.target.value)}
          disabled={!sido}
          className="border border-[var(--line)] rounded px-3 py-1.5 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] disabled:opacity-40"
        >
          <option value="">전체 시군구</option>
          {sggList.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-1">
            신고가 TOP 10
            <span className="text-xs text-[var(--red)] ml-2">▲</span>
          </h3>
          <SignalList items={highs} loading={loading} />
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-1">
            반등 TOP 10
            <span className="text-xs text-[var(--gold)] ml-2">↑</span>
          </h3>
          <SignalList items={rebounds} loading={loading} />
        </section>
      </div>

      <p className="text-xs text-[var(--ink-soft)] mt-5">최근 7일 신규 등록 · 중개거래 기준</p>
    </div>
  );
}
