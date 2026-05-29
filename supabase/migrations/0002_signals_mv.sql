-- ============================================================
-- 0002_signals_mv.sql
-- signals_v(일반 뷰) → signals_mv(구체화 뷰) 교체
-- 이유: 59만 건+ 데이터에서 매 쿼리마다 윈도우 함수 재계산 → 타임아웃
-- ingest.ts가 수집 완료 후 refresh_signals_mv()를 RPC로 호출해 갱신
-- ============================================================

-- 1. 구체화 뷰 생성 (생성 시점에 현재 데이터로 자동 채워짐)
CREATE MATERIALIZED VIEW IF NOT EXISTS signals_mv AS
WITH base AS (
  SELECT t.*,
    MAX(price) OVER (
      PARTITION BY apt_nm, sgg_cd, pyeong
      ORDER BY deal_date, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_peak,
    LAG(price) OVER (
      PARTITION BY apt_nm, sgg_cd, pyeong
      ORDER BY deal_date, id
    ) AS prev_price
  FROM transactions t
  WHERE canceled = false
)
SELECT *,
  (prev_peak IS NULL OR price > prev_peak)                        AS is_high,
  CASE
    WHEN prev_peak IS NOT NULL
    THEN ROUND(price::numeric / prev_peak * 100, 1)
  END                                                             AS recovery_rate,
  CASE
    WHEN prev_price IS NOT NULL
    THEN ROUND((price - prev_price)::numeric / prev_price * 100, 1)
  END                                                             AS delta_pct,
  (
    prev_peak  IS NOT NULL AND price <= prev_peak
    AND prev_price IS NOT NULL AND price > prev_price
    AND (price::numeric / prev_peak * 100) >= 90
  )                                                               AS is_rebound
FROM base;

-- 2. UNIQUE 인덱스 — CONCURRENTLY 리프레시에 필수
CREATE UNIQUE INDEX IF NOT EXISTS signals_mv_id_idx
  ON signals_mv(id);

-- 3. 쿼리 인덱스
CREATE INDEX IF NOT EXISTS signals_mv_date_idx
  ON signals_mv(deal_date DESC);

CREATE INDEX IF NOT EXISTS signals_mv_group_idx
  ON signals_mv(apt_nm, sgg_cd, pyeong);

-- 4. anon 읽기 권한 (구체화 뷰는 일반 뷰와 달리 명시적 GRANT 필요)
GRANT SELECT ON signals_mv TO anon;
GRANT SELECT ON signals_mv TO authenticated;

-- 5. 갱신 함수 — ingest.ts에서 db.rpc('refresh_signals_mv')로 호출
CREATE OR REPLACE FUNCTION refresh_signals_mv()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY signals_mv;
$$;
