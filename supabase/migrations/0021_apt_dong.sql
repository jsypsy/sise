-- 거래동(aptDong) 컬럼. 국토부 매매 API가 '등기완료된' 거래에만 동을 채워줘서
-- (교차분석: 동은 100% 등기완료분에만, 최근 입주장 ~5% / 1년 전 ~43%) 대부분 null이다.
-- 시그널과 무관한 표시용 컬럼이라 signals_mv 재생성 불필요 — 단지 상세는 R2/transactions에서
-- 직접 읽는다. 분양권/입주권 API엔 동 필드가 없어 그쪽은 항상 null.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS apt_dong text;
