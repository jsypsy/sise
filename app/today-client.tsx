"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Signal } from "@/lib/types";
import { won } from "@/lib/format";
import { CODE_TO_NAME } from "@/lib/regions";

export default function TodayClient({
  date,
  signals,
}: {
  date: string;
  signals: Signal[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const regionFilter = params.get("region") ?? "";
  const showDirect = params.get("direct") === "1";

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(params.toString());
    if (val) p.set(key, val); else p.delete(key);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const filtered = signals.filter((s) => {
    if (regionFilter && s.sgg_cd !== regionFilter) return false;
    if (!showDirect && s.dealing_gbn === "직거래") return false;
    return true;
  });

  const regions = [...new Set(signals.map((s) => s.sgg_cd))].sort();
  const highCnt = filtered.filter((s) => s.is_high).length;
  const rebCnt = filtered.filter((s) => s.is_rebound).length;
  const dirCnt = filtered.filter((s) => s.dealing_gbn === "직거래").length;

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-semibold">오늘의 시그널</h2>
        {date && <span className="text-sm text-[var(--ink-soft)]">{date}</span>}
      </div>

      <div className="flex flex-wrap gap-4 mb-4 text-sm border-b border-[var(--line)] pb-3">
        <span>총 <strong>{filtered.length}</strong>건</span>
        <span className="text-[var(--red)]">신고가 <strong>{highCnt}</strong>건</span>
        <span className="text-[var(--gold)]">반등 <strong>{rebCnt}</strong>건</span>
        <span className="text-[var(--blue)]">직거래 <strong>{dirCnt}</strong>건</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-sm items-center">
        <select
          value={regionFilter}
          onChange={(e) => setParam("region", e.target.value)}
          className="border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
        >
          <option value="">전체 지역</option>
          {regions.map((code) => (
            <option key={code} value={code}>
              {CODE_TO_NAME[code] ?? code}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showDirect}
            onChange={(e) => setParam("direct", e.target.checked ? "1" : "")}
          />
          직거래 포함
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">해당 조건의 거래가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs text-[var(--ink-soft)]">
                <th className="py-2 pr-3 font-medium">단지</th>
                <th className="py-2 pr-3 font-medium">평형/층</th>
                <th className="py-2 pr-3 font-medium text-right">거래가</th>
                <th className="py-2 pr-3 font-medium">시그널</th>
                <th className="py-2 pr-3 font-medium text-right">직전최고</th>
                <th className="py-2 font-medium text-right">증감</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--line)] hover:bg-[var(--paper-2)]"
                >
                  <td className="py-1.5 pr-3">
                    <div className="font-medium">{s.apt_nm}</div>
                    <div className="text-xs text-[var(--ink-soft)]">
                      {CODE_TO_NAME[s.sgg_cd] ?? s.sgg_cd}
                      {s.dealing_gbn === "직거래" && (
                        <span className="ml-1 text-[var(--blue)]">직</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">
                    {s.pyeong}평{s.floor != null ? ` ${s.floor}층` : ""}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium whitespace-nowrap">
                    <span className={s.is_high ? "text-[var(--red)]" : ""}>
                      {won(s.price)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
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
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--ink-soft)] whitespace-nowrap">
                    {s.prev_peak ? won(s.prev_peak) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                    {s.delta_pct != null ? (
                      <span
                        className={
                          s.delta_pct > 0
                            ? "text-[var(--red)]"
                            : s.delta_pct < 0
                            ? "text-[var(--blue)]"
                            : ""
                        }
                      >
                        {s.delta_pct > 0 ? "+" : ""}
                        {s.delta_pct}%
                      </span>
                    ) : (
                      "—"
                    )}
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
