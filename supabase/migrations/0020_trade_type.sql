-- 입주권/분양권 거래를 매매와 함께 담기 위한 trade_type 컬럼.
-- 신축 입주장 단지는 소유권이전 전 거래가 매매 API가 아니라 분양권전매 API(입주권/분양권)에
-- 들어가, 매매만 보면 전고점이 저평가된다(예: 올림픽파크포레온 84타입 매매 31.3억 vs
-- 입주권 33억). 분양권/입주권을 transactions에 함께 적재하면 signals_mv가 같은 테이블을
-- 읽으므로 전고점·신고가가 자동으로 통합된다(아실식). 유형은 화면에서 배지로 구분.
--
-- 매매 raw_key는 그대로(접두 없음), 분양권/입주권 raw_key는 trade_type 접두를 붙여 충돌 방지.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trade_type text NOT NULL DEFAULT '매매';
CREATE INDEX IF NOT EXISTS idx_tx_trade_type ON transactions(trade_type);

-- signals_mv는 SELECT * 라 새 컬럼을 자동으로 안 가져온다 → 재생성해서 trade_type을 흘린다.
-- (0018 정의와 동일: umd_nm 그룹키 + 중개거래/취소 제외. 입주권 중개거래도 이 필터를 통과해
--  자동 포함된다.)
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
