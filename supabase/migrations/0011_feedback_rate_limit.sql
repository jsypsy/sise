-- 피드백 남용 방지: IP 해시 + 비율 제한 트리거.
-- 봇/도배가 /api/feedback 를 직접 호출해도 DB 단에서 차단(클라이언트 우회 불가).
-- 원본 IP는 저장하지 않고 해시만 보관한다.

alter table public.feedback add column if not exists ip_hash text;

create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 같은 IP: 최근 10분에 5건 초과 차단
  if new.ip_hash is not null and (
    select count(*) from public.feedback
    where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;

  -- 전체: 최근 1시간에 60건 초과 차단 (분산 공격·이메일 한도 보호)
  if (
    select count(*) from public.feedback
    where created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'rate_limited_global';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rate_limit_trigger on public.feedback;
create trigger feedback_rate_limit_trigger
  before insert on public.feedback
  for each row execute function public.feedback_rate_limit();
