-- bootstrap 헬퍼 함수 2개
-- truncate_transactions : 전체 초기화 (bootstrap 1회 사용)
-- sync_peaks_from_transactions : 현재 transactions → historical_peaks 동기화

CREATE OR REPLACE FUNCTION truncate_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE transactions;
END;
$$;

GRANT EXECUTE ON FUNCTION truncate_transactions() TO service_role;

-- ingest 완료 후 호출 — 현재 transactions의 최고가를 historical_peaks에 반영
CREATE OR REPLACE FUNCTION sync_peaks_from_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO historical_peaks (apt_nm, sgg_cd, pyeong, peak_price, peak_date)
  SELECT
    apt_nm,
    sgg_cd,
    pyeong,
    MAX(price) AS peak_price,
    (ARRAY_AGG(deal_date ORDER BY price DESC, deal_date DESC))[1] AS peak_date
  FROM transactions
  WHERE canceled = false
  GROUP BY apt_nm, sgg_cd, pyeong
  ON CONFLICT (apt_nm, sgg_cd, pyeong) DO UPDATE
    SET
      peak_price = GREATEST(historical_peaks.peak_price, EXCLUDED.peak_price),
      peak_date  = CASE
        WHEN EXCLUDED.peak_price > historical_peaks.peak_price
          THEN EXCLUDED.peak_date
        ELSE historical_peaks.peak_date
        END;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_peaks_from_transactions() TO service_role;
