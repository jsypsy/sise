-- 직거래를 시그널 계산에서 제외.
-- 화면/다이제스트는 중개거래만 보여주는데, 기존 signals_mv는 전고점(prev_peak)·
-- 직전가(prev_price) 윈도우에 직거래까지 포함해 신고가/반등 오탐이 났다.
-- → base를 중개거래로 한정해 윈도우가 중개거래만 보게 한다. (취소거래는 기존대로 제외)
--
-- 주의: prev_peak은 historical_peaks(hp)와도 GREATEST로 합쳐지는데, hp에는 과거
-- 직거래 최고가가 적재돼 있을 수 있다(0007 upsert는 값을 낮추지 않음). 완전히 빼려면
-- fetch_peaks.ts(직거래 제외 반영)로 hp를 재구축해야 한다 — docs/runbook 참고.
-- 이 마이그레이션만으로도 "최근 윈도우의 직거래 오염"은 즉시 제거된다(부분→대부분 개선).
DROP MATERIALIZED VIEW IF EXISTS signals_mv;

CREATE MATERIALIZED VIEW signals_mv AS
WITH base AS (
  SELECT t.*,
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
    AND t.dealing_gbn = '중개거래'
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

CREATE UNIQUE INDEX signals_mv_id_idx         ON signals_mv(id);
CREATE INDEX        signals_mv_date_idx       ON signals_mv(deal_date DESC);
CREATE INDEX        signals_mv_first_seen_idx ON signals_mv(first_seen DESC);
CREATE INDEX        signals_mv_group_idx      ON signals_mv(apt_nm, sgg_cd, pyeong);

GRANT SELECT ON signals_mv TO anon;
GRANT SELECT ON signals_mv TO authenticated;

-- ── archive_expired_transactions: hp 병합 시에도 직거래 제외 ──────────────
-- 매일 보관 경로(ingest가 호출)에서 직거래 최고가가 hp로 새어들지 않게 한다.
-- 0009 정의와 동일하되 INSERT...SELECT WHERE에 dealing_gbn='중개거래' 추가.
-- (cutoff 이전 거래 DELETE는 직거래 포함 전체 그대로 — 테이블 hygiene 목적.)
CREATE OR REPLACE FUNCTION archive_expired_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff_date date;
BEGIN
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
    AND dealing_gbn = '중개거래'
  GROUP BY apt_nm, sgg_cd, pyeong
  ON CONFLICT (apt_nm, sgg_cd, pyeong) DO UPDATE
    SET
      peak_price = GREATEST(historical_peaks.peak_price, EXCLUDED.peak_price),
      peak_date  = CASE
        WHEN EXCLUDED.peak_price > historical_peaks.peak_price
          THEN EXCLUDED.peak_date
        ELSE historical_peaks.peak_date
        END;

  DELETE FROM transactions WHERE first_seen < cutoff_date;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_expired_transactions() TO service_role;
