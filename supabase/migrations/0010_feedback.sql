-- 피드백(의견) 접수 테이블.
-- 공개 폼에서 익명 INSERT만 허용하고, 조회/수정/삭제는 막는다(service_role·대시보드만 열람).
-- 개인 식별정보를 요구하지 않으며 contact는 선택(이용자가 남긴 회신처).

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null,
  contact     text,            -- 선택: 회신받을 이메일/연락처(이용자 자율)
  path        text,            -- 제출한 페이지 경로
  user_agent  text
);

alter table public.feedback enable row level security;

-- 익명 사용자는 INSERT만(길이 가드). SELECT/UPDATE/DELETE 정책은 두지 않아
-- anon/authenticated가 읽거나 고칠 수 없다. (service_role은 RLS 우회 → 대시보드에서 열람)
drop policy if exists feedback_insert_anon on public.feedback;
create policy feedback_insert_anon
  on public.feedback
  for insert
  to anon
  with check (char_length(message) between 1 and 4000);
