-- 0023_report_stats.sql
-- 시장 리포트(지역별 분석 콘텐츠)용 집계 RPC. signals_mv 핫윈도우(최근 등록분)를
-- 시군구별로 GROUP BY 해 리포트 허브/색인 판단에 쓴다. 앱 루프 금지 → Postgres 집계.
-- 읽기 전용·anon 허용(공개 데이터). 무료 티어: 250여 행 반환, egress 미미.
CREATE OR REPLACE FUNCTION report_region_totals()
RETURNS TABLE(sgg_cd text, tx bigint, highs bigint, rebounds bigint, latest date)
LANGUAGE sql STABLE AS $$
  SELECT sgg_cd,
         count(*)                                        AS tx,
         count(*) FILTER (WHERE is_high)                 AS highs,
         count(*) FILTER (WHERE is_rebound AND NOT is_high) AS rebounds,
         max(first_seen)                                 AS latest
  FROM signals_mv
  WHERE dealing_gbn = '중개거래'
  GROUP BY sgg_cd
$$;

GRANT EXECUTE ON FUNCTION report_region_totals() TO anon, authenticated, service_role;
