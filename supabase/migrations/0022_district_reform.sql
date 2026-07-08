-- 0022_district_reform.sql
-- 2026-07-01 행정구역 개편 재키(re-key): 옛 sgg_cd → 새 sgg_cd.
-- 신규 코드는 전부 MOLIT API probe(읍면동 샘플 대조)로 경험적 확정 — 추정 아님.
--   · 전남광주통합특별시(prefix 12): 광주 5구 + 전남 22시군 → 1:1 재키
--   · 인천: 중구(28110)→제물포구(28125)/영종구(28155) 분할, 동구(28140)→제물포구,
--           서구(28260)→서해구(28275)/검단구(28290) 분할 — 법정동(umd_nm) 기준
--   · 안양(41171/41173)은 개편 무관 확인 → 변경 없음
-- raw_key에는 sgg_cd가 포함되지 않으므로(apt|umd|jibun|area|floor|date|price)
-- 재키 후 새 코드로 재수집해도 동일 거래는 raw_key 충돌로 중복 0.
-- 시그널 연속성: signals_mv JOIN·윈도우가 (apt_nm, sgg_cd, umd_nm, pyeong) 그룹이므로
-- hp·transactions를 같은 규칙으로 재키해야 전고점이 이어져 신고가 오탐이 없다.

BEGIN;

-- ── 1) 전남광주(1:1) 매핑 함수 (마이그레이션 내 임시 사용) ─────────────────
CREATE OR REPLACE FUNCTION _reform_map(old text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE old
    -- 광주광역시 → 전남광주특별시
    WHEN '29110' THEN '12210'  -- 동구
    WHEN '29140' THEN '12240'  -- 서구
    WHEN '29155' THEN '12270'  -- 남구
    WHEN '29170' THEN '12300'  -- 북구
    WHEN '29200' THEN '12330'  -- 광산구
    -- 전라남도 → 전남광주특별시 (시 5)
    WHEN '46110' THEN '12110'  -- 목포시
    WHEN '46130' THEN '12130'  -- 여수시
    WHEN '46150' THEN '12150'  -- 순천시
    WHEN '46170' THEN '12170'  -- 나주시
    WHEN '46230' THEN '12190'  -- 광양시
    -- 전라남도 → 전남광주특별시 (군 17, 옛 순서 그대로 순차 재부여 확인됨)
    WHEN '46710' THEN '12710'  -- 담양군
    WHEN '46720' THEN '12720'  -- 곡성군
    WHEN '46730' THEN '12730'  -- 구례군
    WHEN '46770' THEN '12740'  -- 고흥군
    WHEN '46780' THEN '12750'  -- 보성군
    WHEN '46790' THEN '12760'  -- 화순군
    WHEN '46800' THEN '12770'  -- 장흥군
    WHEN '46810' THEN '12780'  -- 강진군
    WHEN '46820' THEN '12790'  -- 해남군
    WHEN '46830' THEN '12800'  -- 영암군
    WHEN '46840' THEN '12810'  -- 무안군
    WHEN '46860' THEN '12820'  -- 함평군
    WHEN '46870' THEN '12830'  -- 영광군
    WHEN '46880' THEN '12840'  -- 장성군
    WHEN '46890' THEN '12850'  -- 완도군
    WHEN '46900' THEN '12860'  -- 진도군
    WHEN '46910' THEN '12870'  -- 신안군
    ELSE NULL
  END
$$;

-- 인천 분할 매핑: 법정동 기준. 목록은 probe(신규 코드 측) + DB 실측(옛 코드 측 umd 분포)으로 검증.
-- umd_nm=''(옛 R2 재구축분)은 umd 매칭 JOIN에 못 끼는 비활성 행 → 다수 쪽으로 이동(무해).
CREATE OR REPLACE FUNCTION _reform_map_incheon(old text, umd text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN old = '28140' THEN '28125'  -- 동구 전체 → 제물포구
    WHEN old = '28110' THEN CASE
      -- 중구 섬지역(영종·용유·무의) → 영종구
      WHEN umd IN ('운서동','운남동','중산동','운북동','을왕동','남북동','덕교동','무의동') THEN '28155'
      ELSE '28125'                   -- 중구 내륙 → 제물포구
    END
    WHEN old = '28260' THEN CASE
      -- 서구 북부(경인아라뱃길 이북 검단권) → 검단구
      WHEN umd IN ('마전동','당하동','원당동','불로동','대곡동','금곡동','오류동','왕길동','백석동') THEN '28290'
      ELSE '28275'                   -- 서구 남부(청라·가정·석남 등) → 서해구
    END
    ELSE NULL
  END
$$;

-- ── 2) historical_peaks 재키 ────────────────────────────────────────────────
-- INSERT→DELETE 방식: 만약의 PK 충돌(분할·병합 경계) 시 upsert_peaks_if_higher와
-- 동일 규칙(더 높은 peak 승리)으로 흡수한다.
INSERT INTO historical_peaks (apt_nm, sgg_cd, umd_nm, pyeong, peak_price, peak_date)
SELECT apt_nm,
       COALESCE(_reform_map(sgg_cd), _reform_map_incheon(sgg_cd, umd_nm)),
       umd_nm, pyeong, peak_price, peak_date
FROM historical_peaks
WHERE sgg_cd IN ('29110','29140','29155','29170','29200',
                 '46110','46130','46150','46170','46230',
                 '46710','46720','46730','46770','46780','46790','46800','46810',
                 '46820','46830','46840','46860','46870','46880','46890','46900','46910',
                 '28110','28140','28260')
ON CONFLICT (apt_nm, sgg_cd, umd_nm, pyeong) DO UPDATE
SET peak_price = excluded.peak_price, peak_date = excluded.peak_date
WHERE excluded.peak_price > historical_peaks.peak_price;

DELETE FROM historical_peaks
WHERE sgg_cd IN ('29110','29140','29155','29170','29200',
                 '46110','46130','46150','46170','46230',
                 '46710','46720','46730','46770','46780','46790','46800','46810',
                 '46820','46830','46840','46860','46870','46880','46890','46900','46910',
                 '28110','28140','28260');

-- ── 3) transactions(핫윈도우) 재키 ──────────────────────────────────────────
-- raw_key는 sgg 미포함이라 불변. unique 제약 영향 없음.
UPDATE transactions
SET sgg_cd = COALESCE(_reform_map(sgg_cd), _reform_map_incheon(sgg_cd, COALESCE(umd_nm,'')))
WHERE sgg_cd IN ('29110','29140','29155','29170','29200',
                 '46110','46130','46150','46170','46230',
                 '46710','46720','46730','46770','46780','46790','46800','46810',
                 '46820','46830','46840','46860','46870','46880','46890','46900','46910',
                 '28110','28140','28260');

DROP FUNCTION _reform_map(text);
DROP FUNCTION _reform_map_incheon(text, text);

COMMIT;

-- 재키 반영 (psql 실행 전제 — PostgREST 8초 타임아웃 없음)
SET statement_timeout = '300s';
REFRESH MATERIALIZED VIEW signals_mv;
