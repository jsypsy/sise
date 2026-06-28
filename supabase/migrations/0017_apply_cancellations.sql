-- 취소 갱신(②): 이미 적재된 거래가 나중에 국토부에서 취소(cdealType="O")로
-- 바뀌어도, ingest의 insert-only upsert(onConflict=raw_key, ignoreDuplicates)는
-- 기존 행을 갱신하지 않아 canceled=false로 영원히 남는다. raw_key가 취소 상태를
-- 포함하지 않기 때문(apt|umd|jibun|area|floor|date|price). 그 결과 취소된 거래가
-- 가짜 신고가/반등으로 시그널에 계속 남는다.
--
-- → ingest가 매 페이지의 '취소 행'만 모아 이 RPC로 bulk update 한다.
--   · canceled=false 인 행만 true로 뒤집는다(멱등 — born-canceled 행은 no-op).
--   · first_seen(등록일)은 건드리지 않는다 — 다이제스트의 '오늘 신규' 의미 보존.
--   · UPDATE...FROM 단일 문 → 취소 누적분이 매일 재등장해도 라운드트립 1회.
create or replace function apply_cancellations(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $apply$
declare
  n integer;
begin
  update transactions t
  set canceled  = true,
      cdeal_day = c.cdeal_day
  from jsonb_to_recordset(rows) as c(raw_key text, cdeal_day text)
  where t.raw_key = c.raw_key
    and t.canceled = false;
  get diagnostics n = row_count;
  return n;
end;
$apply$;

grant execute on function apply_cancellations(jsonb) to service_role;
