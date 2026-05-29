-- ============================================================
-- sise — 아파트 매매 실거래 시그널
-- 0001_init.sql : 스키마 + 인덱스 + RLS + 시그널 뷰
-- Supabase 대시보드 > SQL Editor에 붙여넣고 실행
-- ============================================================

-- ─── 거래 원본 테이블 ────────────────────────────────────────
create table if not exists transactions (
  id          bigint generated always as identity primary key,
  apt_nm      text not null,
  sgg_cd      text not null,           -- 시군구 법정동 5자리
  umd_nm      text,
  jibun       text,
  area        numeric not null,        -- 전용면적(㎡)
  pyeong      int not null,            -- 공급 평형(추정: round(area * 0.40))
  price       int not null,            -- 거래금액(만원)
  deal_date   date not null,
  floor       int,
  build_year  int,
  dealing_gbn text not null default '중개거래',  -- '중개거래' | '직거래'
  canceled    boolean not null default false,    -- 해제(취소) 거래 플래그
  cdeal_day   text,
  road_nm     text,
  raw_key     text not null unique               -- 중복 적재 방지 키
);

create index if not exists idx_tx_date  on transactions(deal_date);
create index if not exists idx_tx_sgg   on transactions(sgg_cd);
create index if not exists idx_tx_apt   on transactions(apt_nm);
create index if not exists idx_tx_group on transactions(apt_nm, sgg_cd, pyeong);

-- ─── 시그널 뷰 ───────────────────────────────────────────────
-- 그룹(단지 + 시군구 + 평형) 내 '해당 거래 이전' 거래만으로
-- 전고점(prev_peak)·직전가(prev_price)를 계산한다.
-- 취소거래(canceled=true)는 시그널 계산에서 제외.
create or replace view signals_v as
with base as (
  select t.*,
    max(price) over (
      partition by apt_nm, sgg_cd, pyeong
      order by deal_date, id
      rows between unbounded preceding and 1 preceding
    ) as prev_peak,
    lag(price) over (
      partition by apt_nm, sgg_cd, pyeong
      order by deal_date, id
    ) as prev_price
  from transactions t
  where canceled = false
)
select *,
  -- 신고가: 이전 거래가 없거나 이전 전고점을 초과
  (prev_peak is null or price > prev_peak)                        as is_high,
  -- 전고점 대비 회복률(%)
  case
    when prev_peak is not null
    then round(price::numeric / prev_peak * 100, 1)
  end                                                             as recovery_rate,
  -- 직전 거래 대비 증감률(%)
  case
    when prev_price is not null
    then round((price - prev_price)::numeric / prev_price * 100, 1)
  end                                                             as delta_pct,
  -- 반등: 신고가 아님 + 직전 대비 상승 + 전고점 대비 회복률 ≥ 90%
  (
    prev_peak  is not null and price <= prev_peak
    and prev_price is not null and price > prev_price
    and (price::numeric / prev_peak * 100) >= 90
  )                                                               as is_rebound
from base;

-- ─── RLS ─────────────────────────────────────────────────────
-- 실거래가는 공개 데이터 → anon 읽기 허용.
-- insert/update 정책 없음 → anon·authenticated 쓰기 불가.
-- service_role은 RLS를 우회하므로 수집 스크립트에서만 사용.
alter table transactions enable row level security;

create policy "public read"
  on transactions
  for select
  using (true);
