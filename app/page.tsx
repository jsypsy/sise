// ISR: 매일 1회 재검증. 방문자가 CDN 캐시를 치게 함 — DB 직격 금지.
export const revalidate = 86400;

export default function TodayPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">오늘의 시그널</h2>
      <p className="text-sm text-[var(--ink-soft)]">
        데이터 준비 중 — Phase 4·5에서 실거래 데이터를 연결합니다.
      </p>
    </div>
  );
}
