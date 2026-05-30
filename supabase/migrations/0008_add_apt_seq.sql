-- 국토부 신규 API의 aptSeq(단지 일련번호) 컬럼 추가
-- 예: "11110-2339" — 단지별 고유 ID로 /complex 조회 정확도 향상에 활용
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS apt_seq text;
CREATE INDEX IF NOT EXISTS idx_tx_apt_seq ON transactions(apt_seq);
