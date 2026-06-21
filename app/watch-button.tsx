"use client";

import { useEffect, useState } from "react";
import { isWatched, toggleWatch } from "@/lib/watchlist";

// 단지 상세 헤더의 관심단지 담기/빼기 토글. localStorage만 사용.
export default function WatchButton({ sgg, apt }: { sgg: string; apt: string }) {
  const [on, setOn] = useState(false);

  // localStorage는 마운트 후에만 읽어 SSR/하이드레이션 불일치 방지.
  useEffect(() => {
    setOn(isWatched(sgg, apt));
  }, [sgg, apt]);

  return (
    <button
      type="button"
      onClick={() => setOn(toggleWatch(sgg, apt))}
      aria-pressed={on}
      className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded border cursor-pointer transition-colors ${
        on
          ? "border-[var(--red)] text-[var(--red)] bg-[var(--paper-2)]"
          : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink-soft)]"
      }`}
    >
      {on ? "★ 관심단지" : "☆ 관심단지"}
    </button>
  );
}
