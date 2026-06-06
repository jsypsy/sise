-- ============================================================
-- 0009_first_seen.sql
-- "오늘 등록(신고)된 거래"를 보여주기 위한 등록일(first_seen) 도입.
--
-- 배경: 국토부 API는 계약월(DEAL_YMD)로만 조회된다. 신고 기한이
-- 계약 후 30일이라, 오늘 새로 등록되는 거래의 계약일은 이번 달이
-- 아닐 수 있다(전월·전전월). 따라서
--   ① ingest는 최근 N개월을 매일 다시 긁고(ingest.ts)
--   ② 각 거래가 우리 수집에 '처음 나타난 날' = first_seen = 등록일
--   ③ 핫윈도우/화면 필터를 계약일(deal_date) → 등록일(first_seen)로 전환
-- 한다. 이 마이그레이션은 ②③의 DB 측 변경.
-- ============================================================

-- ─── 1. first_seen 컬럼 ──────────────────────────────────────
-- 신규 row만 ingest가 KST 오늘로 채운다(ON CONFLICT DO NOTHING이라
-- 기존 row의 first_seen은 보존 → 최초 등록일 유지). DEFAULT는 안전망.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS first_seen date NOT NULL DEFAULT current_date;

CREATE INDEX IF NOT EXISTS idx_tx_first_seen ON transactions(first_seen);

-- ─── 2. 아카이빙 cutoff를 계약일 → 등록일 기준으로 ──────────────
-- "등록된 지 최근 20일"을 transactions 핫윈도우로 유지한다.
-- 그래야 계약일이 오래된 지연 신고분도 등록 후 20일간 화면에 남는다.
CREATE OR REPLACE FUNCTION archive_expired_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff_date date;
BEGIN
  -- 최근 20개 '등록일(first_seen)' 중 가장 오래된 날짜를 cutoff으로 사용
  SELECT MIN(first_seen) INTO cutoff_date
  FROM (
    SELECT DISTINCT first_seen
    FROM transactions
    WHERE canceled = false
    ORDER BY first_seen DESC
    LIMIT 20
  ) recent;

  IF cutoff_date IS NULL THEN
    RETURN;
  END IF;

  -- cutoff 이전 등록 거래를 historical_peaks에 병합 (취소거래 제외)
  INSERT INTO historical_peaks (apt_nm, sgg_cd, pyeong, peak_price, peak_date)
  SELECT
    apt_nm,
    sgg_cd,
    pyeong,
    MAX(price) AS peak_price,
    (ARRAY_AGG(deal_date ORDER BY price DESC, deal_date DESC))[1] AS peak_date
  FROM transactions
  WHERE first_seen < cutoff_date
    AND canceled = false
  GROUP BY apt_nm, sgg_cd, pyeong
  ON CONFLICT (apt_nm, sgg_cd, pyeong) DO UPDATE
    SET
      peak_price = GREATEST(historical_peaks.peak_price, EXCLUDED.peak_price),
      peak_date  = CASE
        WHEN EXCLUDED.peak_price > historical_peaks.peak_price
          THEN EXCLUDED.peak_date
        ELSE historical_peaks.peak_date
        END;

  -- cutoff 이전 등록 거래 삭제 (취소거래 포함 전체 삭제)
  DELETE FROM transactions WHERE first_seen < cutoff_date;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_expired_transactions() TO service_role;

-- ─── 3. signals_mv 재생성 (first_seen 포함) ──────────────────
-- matview는 SELECT * 컬럼이 생성 시점에 고정되므로, first_seen으로
-- 화면 필터를 하려면 재생성이 필요하다. 0008의 apt_seq도 함께 포함된다.
-- 시그널 판정 로직(prev_peak/is_high/is_rebound)은 0004와 동일하게 유지.
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

-- 인덱스
CREATE UNIQUE INDEX signals_mv_id_idx         ON signals_mv(id);
CREATE INDEX        signals_mv_date_idx       ON signals_mv(deal_date DESC);
CREATE INDEX        signals_mv_first_seen_idx ON signals_mv(first_seen DESC);
CREATE INDEX        signals_mv_group_idx      ON signals_mv(apt_nm, sgg_cd, pyeong);

-- 권한
GRANT SELECT ON signals_mv TO anon;
GRANT SELECT ON signals_mv TO authenticated;

-- refresh 함수 (CONCURRENTLY → unique 인덱스 필요, 위에서 생성)
CREATE OR REPLACE FUNCTION refresh_signals_mv()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY signals_mv;
$$;
