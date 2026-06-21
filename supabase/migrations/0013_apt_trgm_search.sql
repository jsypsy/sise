-- 단지명 트라이그램(유사도) 검색.
-- 기존 검색은 ILIKE '%q%' 연속 부분 문자열만 매칭 → 어순이 바뀐 입력
-- ("고덕래미안힐스테이트")이 공식명("래미안힐스테이트고덕")을 못 찾음.
-- pg_trgm 유사도로 어순 뒤바뀜·오타에도 매칭한다.
-- /api/search 에서 토큰 AND가 0건일 때 fallback으로 호출.

create extension if not exists pg_trgm;

-- 유사도 검색용 GIN 인덱스 (apt_nm 트라이그램)
create index if not exists idx_tx_apt_trgm
  on transactions using gin (apt_nm gin_trgm_ops);

-- q와 유사한 단지를 (단지+시군구)로 묶어 유사도순 반환.
-- 반환 형태는 /api/search 의 그룹 결과(AptRow)와 동일.
create or replace function search_apts_trgm(p_q text)
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
set search_path = public, extensions
as $$
  select
    t.apt_nm,
    t.sgg_cd,
    max(t.umd_nm)            as umd_nm,
    count(*)                 as tx_count,
    max(t.deal_date)::text   as latest_date,
    max(t.price)             as peak_price
  from transactions t
  where t.canceled = false
    and t.apt_nm % p_q                         -- 트라이그램 유사도 임계치(기본 0.3) 통과
  group by t.apt_nm, t.sgg_cd
  order by max(similarity(t.apt_nm, p_q)) desc
  limit 20
$$;
