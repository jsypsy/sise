-- 만료된 거래를 historical_peaks에 병합 후 삭제
-- 최근 20개 거래일(distinct deal_date) 이전 데이터 정리
-- ingest.ts에서 수집 완료 후 매일 호출

CREATE OR REPLACE FUNCTION archive_expired_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff_date date;
BEGIN
  -- 최근 20개 거래일 중 가장 오래된 날짜를 cutoff으로 사용
  SELECT MIN(deal_date) INTO cutoff_date
  FROM (
    SELECT DISTINCT deal_date
    FROM transactions
    WHERE canceled = false
    ORDER BY deal_date DESC
    LIMIT 20
  ) recent;

  IF cutoff_date IS NULL THEN
    RETURN;
  END IF;

  -- cutoff 이전 거래를 historical_peaks에 병합 (취소거래 제외)
  INSERT INTO historical_peaks (apt_nm, sgg_cd, pyeong, peak_price, peak_date)
  SELECT
    apt_nm,
    sgg_cd,
    pyeong,
    MAX(price) AS peak_price,
    (ARRAY_AGG(deal_date ORDER BY price DESC, deal_date DESC))[1] AS peak_date
  FROM transactions
  WHERE deal_date < cutoff_date
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

  -- cutoff 이전 거래 삭제 (취소거래 포함 전체 삭제)
  DELETE FROM transactions WHERE deal_date < cutoff_date;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_expired_transactions() TO service_role;
