-- 피드백 남용 방지(글로벌, IP 미수집).
-- 전체 피드백이 최근 1시간에 60건을 넘으면 차단 → 봇 폭주 시 DB·이메일(Resend) 보호.
-- IP/식별정보는 전혀 보지 않고 '총량'만 센다.

create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
