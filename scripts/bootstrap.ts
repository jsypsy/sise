/**
 * DB 초기화 스크립트 — bootstrap 워크플로우에서 1회 실행
 * transactions 전체 삭제 + signals_mv 초기화
 */
import { createServiceClient } from "../lib/supabase";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

async function main() {
  const db = createServiceClient();

  console.log("transactions 전체 초기화 중...");
  const { error: truncErr } = await db.rpc("truncate_transactions");
  if (truncErr) { console.error("초기화 실패:", truncErr.message); process.exit(1); }
  console.log("초기화 완료");

  console.log("signals_mv 초기화 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) { console.error("signals_mv 갱신 실패:", refreshErr.message); process.exit(1); }
  console.log("signals_mv 초기화 완료");
}

main().catch(err => { console.error(err); process.exit(1); });
