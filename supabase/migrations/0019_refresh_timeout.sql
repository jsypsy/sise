-- refresh_signals_mv()가 PostgREST(supabase-js .rpc) 호출 시 role의 기본
-- statement_timeout(~8s)에 걸려 "canceling statement due to statement timeout"으로
-- 취소되는 문제. (대량 hp 업서트 직후 CONCURRENTLY refresh가 8s를 넘김.)
-- → 함수 스코프에 충분한 statement_timeout을 박아 PostgREST 설정을 덮어쓴다.
CREATE OR REPLACE FUNCTION refresh_signals_mv()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY signals_mv;
$$;

-- R2 hp 재구축 직후 refresh가 타임아웃돼 signals_mv가 stale 상태 → 지금 한번 갱신.
-- (apply-migration은 psql 직접 연결이라 PostgREST 타임아웃과 무관하게 완료된다.)
REFRESH MATERIALIZED VIEW signals_mv;
