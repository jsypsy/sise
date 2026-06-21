-- 시군구별 동 목록을 DB에서 DISTINCT하게 반환하는 함수.
-- /api/search?fields=umds 에서 사용. 5000행 전송 → 수십 개 문자열로 축소.
create or replace function get_umds(p_sgg_cd text)
returns text[]
language sql
stable
security definer
as $$
  select array_agg(distinct umd_nm order by umd_nm)
  from transactions
  where sgg_cd = p_sgg_cd
    and canceled = false
    and umd_nm is not null
$$;
