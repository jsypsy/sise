-- ============================================================
-- 0003_helpers.sql
-- 헬퍼 RPC 함수
-- ============================================================

-- 날짜 드롭다운용: transactions에서 거래일 distinct 목록 반환
-- signals_mv에서 limit으로 행을 잘라 중복 제거하던 방식 대체
CREATE OR REPLACE FUNCTION get_deal_dates(lmt int DEFAULT 90)
RETURNS SETOF date
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT deal_date
  FROM transactions
  WHERE canceled = false
  ORDER BY deal_date DESC
  LIMIT lmt;
$$;

GRANT EXECUTE ON FUNCTION get_deal_dates(int) TO anon;
GRANT EXECUTE ON FUNCTION get_deal_dates(int) TO authenticated;
