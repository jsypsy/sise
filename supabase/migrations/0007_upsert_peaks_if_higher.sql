-- 기존 peak보다 높을 때만 historical_peaks를 갱신하는 bulk upsert 함수.
-- fetch_peaks.ts에서 사용. 단순 upsert는 더 낮은 값으로 덮어쓰는 버그가 있음.
create or replace function upsert_peaks_if_higher(p_rows jsonb)
returns void
language sql
security definer
as $$
  insert into historical_peaks (apt_nm, sgg_cd, pyeong, peak_price, peak_date)
  select
    (r->>'apt_nm'),
    (r->>'sgg_cd'),
    (r->>'pyeong')::int,
    (r->>'peak_price')::int,
    (r->>'peak_date')::date
  from jsonb_array_elements(p_rows) as r
  on conflict (apt_nm, sgg_cd, pyeong)
  do update set
    peak_price = excluded.peak_price,
    peak_date  = excluded.peak_date
  where excluded.peak_price > historical_peaks.peak_price;
$$;
