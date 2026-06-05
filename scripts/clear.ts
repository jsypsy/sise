/**
 * 전체 데이터 초기화
 *   - transactions, historical_peaks 테이블 전체 삭제
 *   - Cloudflare R2 버킷 내 모든 파일 삭제
 *
 * 실행: npx tsx scripts/clear.ts
 * R2 자격증명 없으면 DB만 초기화하고 종료.
 */
import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { createServiceClient } from "../lib/supabase";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

// ─── DB 초기화 ────────────────────────────────────────────────
async function clearDB() {
  const db = createServiceClient();
  console.log("DB 초기화 중...");

  // transactions: id > 0 (bigint generated always as identity, 1부터 시작)
  const { error: e1 } = await db.from("transactions").delete().gt("id", 0);
  if (e1) { console.error("  transactions 삭제 실패:", e1.message); process.exit(1); }
  console.log("  transactions 초기화 완료");

  // historical_peaks: peak_price > 0 (항상 양수)
  const { error: e2 } = await db.from("historical_peaks").delete().gt("peak_price", 0);
  if (e2) { console.error("  historical_peaks 삭제 실패:", e2.message); process.exit(1); }
  console.log("  historical_peaks 초기화 완료");

  console.log("DB 초기화 완료\n");
}

// ─── R2 초기화 ────────────────────────────────────────────────
async function clearR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket    = process.env.R2_BUCKET;
  const keyId     = process.env.R2_ACCESS_KEY_ID;
  const secret    = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !keyId || !secret) {
    console.log("R2 자격증명 없음 — R2 초기화 건너뜀");
    return;
  }

  const r2       = new AwsClient({ accessKeyId: keyId, secretAccessKey: secret, service: "s3", region: "auto" });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

  console.log(`R2 초기화 중 (버킷: ${bucket})...`);

  let totalDeleted = 0;
  let continuationToken: string | undefined;

  do {
    // ── 목록 조회 (ListObjectsV2) ──────────────────────────────
    const listUrl = new URL(endpoint);
    listUrl.searchParams.set("list-type", "2");
    listUrl.searchParams.set("max-keys", "1000");
    if (continuationToken) listUrl.searchParams.set("continuation-token", continuationToken);

    const listRes = await r2.fetch(listUrl.toString());
    if (!listRes.ok) {
      console.error("  R2 목록 조회 실패:", listRes.status, await listRes.text());
      process.exit(1);
    }
    const xml = await listRes.text();

    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
    if (keys.length === 0) break;

    // ── 일괄 삭제 (DeleteObjects) ──────────────────────────────
    const body = `<?xml version="1.0" encoding="UTF-8"?><Delete>${
      keys.map(k => `<Object><Key>${k}</Key></Object>`).join("")
    }</Delete>`;
    const md5 = createHash("md5").update(body).digest("base64");

    const delRes = await r2.fetch(`${endpoint}?delete`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/xml", "Content-MD5": md5 },
    });
    if (!delRes.ok) {
      console.error("  R2 삭제 실패:", delRes.status, await delRes.text());
      process.exit(1);
    }

    totalDeleted += keys.length;
    process.stdout.write(`  삭제 중: ${totalDeleted}개...\r`);

    const isTruncated = xml.includes("<IsTruncated>true</IsTruncated>");
    continuationToken = isTruncated
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (continuationToken);

  console.log(`\nR2 초기화 완료: ${totalDeleted}개 파일 삭제\n`);
}

// ─── main ─────────────────────────────────────────────────────
async function main() {
  console.log("===== 전체 데이터 초기화 시작 =====\n");
  await clearDB();
  await clearR2();
  console.log("===== 초기화 완료 =====");
  console.log("다음 단계: fetch-peaks-schedule 워크플로를 샤드 1~5 순서로 수동 dispatch하세요.");
  console.log("  gh workflow run fetch-peaks-schedule --field shard=1");
}

main().catch(e => { console.error(e); process.exit(1); });
