-- 동명단지(③): 같은 시군구에 이름만 같고 위치(동)가 다른 단지가
-- (apt_nm, sgg_cd, pyeong) 한 그룹으로 뭉쳐, 전고점(prev_peak)·직전가(prev_price)가
-- 동 경계를 넘어 오염됐다(예: 현대@상대동을 현대@판문동의 과거가와 비교). 진단상
-- 동명단지는 umd_nm으로 깔끔히 갈린다(dongs == seqs). → 그룹 키에 umd_nm을 더한다.
--
-- 영향: historical_peaks PK / signals_mv 윈도우+JOIN / archive 함수 / upsert_peaks_if_higher.
-- umd_nm은 transactions에서 NULL 가능 → hp에는 NOT NULL DEFAULT ''로 저장하고 매칭은
-- COALESCE(umd_nm, '')로 통일한다. 기존 hp 행은 umd 없이 적재돼 키가 무효이므로 비우고
-- (TRUNCATE) fetch_peaks로 재구축한다 — 과거 직거래 최고가 정리(Level 2)도 함께 된다.
-- 0016(직거래 제외)의 중개거래/취소 필터는 그대로 유지한다.

-- ── 1) historical_peaks: umd_nm 추가 + PK 교체 ─────────────────────────────
-- 기존 행은 umd 없이 적재돼 새 키에서 무효 → 비우고 fetch_peaks로 재구축.
TRUNCATE historical_peaks;
ALTER TABLE historical_peaks ADD COLUMN IF NOT EXISTS umd_nm text NOT NULL DEFAULT '';
ALTER TABLE historical_peaks DROP CONSTRAINT historical_peaks_pkey;
ALTER TABLE historical_peaks ADD PRIMARY KEY (apt_nm, sgg_cd, umd_nm, pyeong);

-- ── 2) upsert_peaks_if_higher: umd_nm 포함 (fetch_peaks가 호출) ─────────────
CREATE OR REPLACE FUNCTION upsert_peaks_if_higher(p_rows jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO historical_peaks (apt_nm, sgg_cd, umd_nm, pyeong, peak_price, peak_date)
  SELECT
    (r->>'apt_nm'),
    (r->>'sgg_cd'),
    COALESCE(r->>'umd_nm', ''),
    (r->>'pyeong')::int,
    (r->>'peak_price')::int,
    (r->>'peak_date')::date
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (apt_nm, sgg_cd, umd_nm, pyeong)
  DO UPDATE SET
    peak_price = excluded.peak_price,
    peak_date  = excluded.peak_date
  WHERE excluded.peak_price > historical_peaks.peak_price;
$$;

-- ── 3) signals_mv: 윈도우 PARTITION + hp JOIN에 umd_nm 추가 ─────────────────
-- (중개거래/취소 제외는 0016 유지. NULL umd는 partition에서 한 그룹, JOIN은 ''로 매칭.)
DROP MATERIALIZED VIEW IF EXISTS signals_mv;

CREATE MATERIALIZED VIEW signals_mv AS
WITH base AS (
  SELECT t.*,
    NULLIF(
      GREATEST(
        COALESCE(
          MAX(t.price) OVER (
            PARTITION BY t.apt_nm, t.sgg_cd, t.umd_nm, t.pyeong
            ORDER BY t.deal_date, t.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0
        ),
        COALESCE(hp.peak_price, 0)
      ),
      0
    ) AS prev_peak,
    LAG(t.price) OVER (
      PARTITION BY t.apt_nm, t.sgg_cd, t.umd_nm, t.pyeong
      ORDER BY t.deal_date, t.id
    ) AS prev_price
  FROM transactions t
  LEFT JOIN historical_peaks hp
    ON  hp.apt_nm  = t.apt_nm
    AND hp.sgg_cd  = t.sgg_cd
    AND hp.umd_nm  = COALESCE(t.umd_nm, '')
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
CREATE INDEX        signals_mv_group_idx      ON signals_mv(apt_nm, sgg_cd, umd_nm, pyeong);

GRANT SELECT ON signals_mv TO anon;
GRANT SELECT ON signals_mv TO authenticated;

-- ── 4) archive_expired_transactions: hp 병합도 umd_nm 단위 ──────────────────
-- 0016과 동일하되 INSERT/GROUP BY/ON CONFLICT에 umd_nm(COALESCE '') 추가.
CREATE OR REPLACE FUNCTION archive_expired_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $archive$
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

  INSERT INTO historical_peaks (apt_nm, sgg_cd, umd_nm, pyeong, peak_price, peak_date)
  SELECT
    apt_nm,
    sgg_cd,
    COALESCE(umd_nm, ''),
    pyeong,
    MAX(price) AS peak_price,
    (ARRAY_AGG(deal_date ORDER BY price DESC, deal_date DESC))[1] AS peak_date
  FROM transactions
  WHERE first_seen < cutoff_date
    AND canceled = false
    AND dealing_gbn = '중개거래'
  GROUP BY apt_nm, sgg_cd, COALESCE(umd_nm, ''), pyeong
  ON CONFLICT (apt_nm, sgg_cd, umd_nm, pyeong) DO UPDATE
    SET
      peak_price = GREATEST(historical_peaks.peak_price, EXCLUDED.peak_price),
      peak_date  = CASE
        WHEN EXCLUDED.peak_price > historical_peaks.peak_price
          THEN EXCLUDED.peak_date
        ELSE historical_peaks.peak_date
        END;

  DELETE FROM transactions WHERE first_seen < cutoff_date;
END;
$archive$;

GRANT EXECUTE ON FUNCTION archive_expired_transactions() TO service_role;
