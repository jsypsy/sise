export const revalidate = 86400;

export default function TopPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">최근 7일 TOP</h2>
      <p className="text-sm text-[var(--ink-soft)]">
        데이터 준비 중 — Phase 5에서 7일 TOP 거래를 연결합니다.
      </p>
    </div>
  );
}
