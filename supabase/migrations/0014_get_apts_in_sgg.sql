-- 시군구(+선택 동)별 단지 목록을 DB에서 집계해 반환.
-- 기존엔 거래를 최대 5,000행 받아 앱(JS)에서 그룹핑 → 느리고 egress 낭비.
-- 단지 조회 드롭다운(sgg+umd)·단지 상세의 '관련 단지'(sgg)가 이 함수를 쓴다.
-- 반환: 단지별 1행 (수천 행 → 수십~수백 행).
create or replace function get_apts_in_sgg(p_sgg_cd text, p_umd text default null)
returns table (
  apt_nm      text,
  sgg_cd      text,
  umd_nm      text,
  tx_count    bigint,
  latest_date text,
  peak_price  int
)
language sql
stable
security definer
as $$
  select
    t.apt_nm,
    t.sgg_cd,
    max(t.umd_nm)          as umd_nm,
    count(*)               as tx_count,
    max(t.deal_date)::text as latest_date,
    max(t.price)           as peak_price
  from transactions t
  where t.sgg_cd = p_sgg_cd
    and t.canceled = false
    and (p_umd is null or t.umd_nm = p_umd)
  group by t.apt_nm, t.sgg_cd
  order by t.apt_nm
$$;
