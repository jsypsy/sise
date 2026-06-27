-- =====================================================================
-- sise 데이터 건강검진 (누락 점검)
-- 사용법: Supabase 대시보드 → SQL Editor → 쿼리별로 실행.
-- 로컬 소스/환경 없이 브라우저에서 바로 가능. 모두 읽기 전용.
-- 기준값은 lib/regions.ts(전국 250 시군구) 기준 — regions.ts 갱신 시 같이 갱신.
-- =====================================================================


-- [1] ⭐ 시군구 커버리지: 설정엔 있는데 "한 건도 안 들어온" 시도가 있나
--     missing > 0 인 행 = 그 시도에서 통째로 빠진 시군구 존재(수집/설정 누락 의심).
with expected(sido, name, n) as (values
  ('11','서울특별시',25),('26','부산광역시',16),('27','대구광역시',9),
  ('28','인천광역시',10),('29','광주광역시',5),('30','대전광역시',5),
  ('31','울산광역시',5),('36','세종특별자치시',1),('41','경기도',42),
  ('43','충청북도',14),('44','충청남도',16),('46','전라남도',22),
  ('47','경상북도',23),('48','경상남도',22),('50','제주특별자치도',2),
  ('51','강원특별자치도',18),('52','전북특별자치도',15)
),
collected as (
  select left(sgg_cd,2) as sido, count(distinct sgg_cd) as m
  from transactions group by 1
)
select e.sido, e.name, e.n as expected, coalesce(c.m,0) as collected,
       e.n - coalesce(c.m,0) as missing
from expected e
left join collected c on c.sido = e.sido
order by missing desc, e.sido;


-- [2] ⭐ 수집 누락된 "날" 탐지: 최근 60일 중 신규 등록(first_seen)이 0건인 날.
--     평일인데 0건이면 그날 ingest cron이 실패/누락됐다는 강한 신호.
with days as (
  select generate_series((current_date - 59), current_date, interval '1 day')::date as d
)
select d.d as missing_day, to_char(d.d, 'Dy') as dow
from days d
left join (
  select first_seen::date as fd, count(*) as n
  from transactions
  where first_seen >= current_date - 60
  group by 1
) t on t.fd = d.d
where coalesce(t.n, 0) = 0
order by d.d;


-- [3] 오래 안 들어온/적은 시군구 Top 30 (last_seen 오래됨 또는 tx 적음 = 의심).
select sgg_cd,
       count(*)                    as tx,
       min(deal_date)              as first_deal,
       max(deal_date)              as last_deal,
       max(first_seen)             as last_seen
from transactions
group by sgg_cd
order by last_seen asc nulls first, tx asc
limit 30;


-- [4] 시도별 요약 (전체 그림 한눈에).
select left(sgg_cd,2)  as sido,
       count(*)        as tx,
       count(distinct sgg_cd) as sgg_n,
       min(deal_date)  as first_deal,
       max(deal_date)  as last_deal,
       max(first_seen) as last_seen
from transactions
group by 1
order by 1;


-- [5] (스팟체크 템플릿) 특정 시군구의 월별 건수 — 중간에 0인 달이 있나.
--     sgg_cd를 점검할 코드로 바꿔서 실행 (예: 11680 강남구).
select to_char(deal_date, 'YYYY-MM') as ym, count(*) as n
from transactions
where sgg_cd = '11680'
  and deal_date >= current_date - interval '18 months'
group by 1
order by 1;


-- =====================================================================
-- 해석 가이드
-- - [1] missing > 0  → 그 시도 시군구가 통째로 안 들어옴. 가장 심각.
-- - [2] 평일 missing_day → 그날 수집 실패. GitHub Actions ingest 로그 확인.
-- - [3] last_seen이 며칠 이상 과거 → 그 지역만 최근 수집 안 됨(부분 실패).
-- - [4] sgg_n이 [1]의 expected와 다르면 누락. last_seen이 어제/오늘이어야 정상.
-- - [5] 거래 적은 군 지역은 특정 달 0건이 "정상"일 수 있음(원본 대조 필요).
-- 주의: first_seen = 우리가 수집한 날. deal_date = 계약일(신고 지연으로 과거일 수 있음).
-- =====================================================================
