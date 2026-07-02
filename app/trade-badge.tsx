// 거래 유형(분양권/입주권) 배지. 매매(기본)이면 아무것도 안 그림.
// 색상은 방향(빨강/파랑)과 겹치지 않게 중립 회색 — 유형 라벨임을 명확히.
export default function TradeBadge({ tt }: { tt?: string | null }) {
  if (!tt || tt === "매매") return null;
  return (
    <span className="inline-block text-[10px] font-bold text-[var(--ink-soft)] border border-[var(--line-strong)] rounded px-1 py-0 leading-tight whitespace-nowrap shrink-0 align-middle">
      {tt}
    </span>
  );
}
