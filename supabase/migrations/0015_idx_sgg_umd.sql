-- 동 목록(get_umds)·동별 단지 조회 가속용 인덱스.
-- get_umds = (sgg_cd 필터 → umd_nm DISTINCT). (sgg_cd, umd_nm) 인덱스로
-- 힙 전체 스캔 대신 index-only scan → 첫 로드(캐시 미스) 시간 단축.
create index if not exists idx_tx_sgg_umd on transactions(sgg_cd, umd_nm);
