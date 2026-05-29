-- ============================================================
-- 0004_historical_peaks.sql
-- 과거 거래 원본 없이 그룹별 최고가만 저장해 신고가 정확도 확보
-- ============================================================

-- 1. historical_peaks 테이블
CREATE TABLE IF NOT EXISTS historical_peaks (
  apt_nm      text NOT NULL,
  sgg_cd      text NOT NULL,
  pyeong      int  NOT NULL,
  peak_price  int  NOT NULL,
  peak_date   date NOT NULL,
  PRIMARY KEY (apt_nm, sgg_cd, pyeong)
);

ALTER TABLE historical_peaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON historical_peaks;
CREATE POLICY "public read" ON historical_peaks FOR SELECT USING (true);

-- 2. get_deal_dates 수정: RETURNS TABLE(deal_date text)로 명시적 컬럼명
--    (RETURNS SETOF date는 PostgREST에서 컬럼명이 함수명이 되어 JS 처리 불일치)
--    반환 타입 변경 시 DROP 후 재생성 필요
DROP FUNCTION IF EXISTS get_deal_dates(integer);
CREATE OR REPLACE FUNCTION get_deal_dates(lmt int DEFAULT 20)
RETURNS TABLE(deal_date text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT t.deal_date::text
  FROM transactions t
  WHERE t.canceled = false
  ORDER BY 1 DESC
  LIMIT lmt;
$$;
GRANT EXECUTE ON FUNCTION get_deal_dates(int) TO anon;
GRANT EXECUTE ON FUNCTION get_deal_dates(int) TO authenticated;

-- 3. signals_mv 재생성: historical_peaks와 LEFT JOIN해 prev_peak 보정
--    historical_peaks가 비어 있어도 기존과 동일하게 동작 (LEFT JOIN + COALESCE 0)
DROP MATERIALIZED VIEW IF EXISTS signals_mv;

CREATE MATERIALIZED VIEW signals_mv AS
WITH base AS (
  SELECT t.*,
    -- GREATEST(DB 내 전고점, 과거 전고점) → 둘 다 없으면 NULL 유지
    NULLIF(
      GREATEST(
        COALESCE(
          MAX(t.price) OVER (
            PARTITION BY t.apt_nm, t.sgg_cd, t.pyeong
            ORDER BY t.deal_date, t.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0
        ),
        COALESCE(hp.peak_price, 0)
      ),
      0
    ) AS prev_peak,
    LAG(t.price) OVER (
      PARTITION BY t.apt_nm, t.sgg_cd, t.pyeong
      ORDER BY t.deal_date, t.id
    ) AS prev_price
  FROM transactions t
  LEFT JOIN historical_peaks hp
    ON  hp.apt_nm  = t.apt_nm
    AND hp.sgg_cd  = t.sgg_cd
    AND hp.pyeong  = t.pyeong
  WHERE t.canceled = false
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

-- 4. 인덱스
CREATE UNIQUE INDEX signals_mv_id_idx   ON signals_mv(id);
CREATE INDEX        signals_mv_date_idx  ON signals_mv(deal_date DESC);
CREATE INDEX        signals_mv_group_idx ON signals_mv(apt_nm, sgg_cd, pyeong);

-- 5. 권한
GRANT SELECT ON signals_mv TO anon;
GRANT SELECT ON signals_mv TO authenticated;

-- 6. refresh 함수
CREATE OR REPLACE FUNCTION refresh_signals_mv()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY signals_mv;
$$;
