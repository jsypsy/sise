/**
 * historical_peaks를 R2(단지별 전체 이력)에서 재구축한다 — MOLIT 재수집 없이.
 *
 * 배경: 0018에서 hp를 TRUNCATE한 뒤 fetch_peaks(MOLIT 전국 전기간)로 재구축하려 했으나
 * 일일 quota 소진 + 6h 타임아웃으로 실패 → hp가 비어 신고가가 과다 표시된다. R2에는 이미
 * 전 기간 거래가 있으므로(매일 fetch-peaks-schedule이 업로드) 거기서 peak를 계산한다.
 *
 * 한계(동명단지): R2 파일은 (apt_nm, sgg_cd) 1개 = 파일 1개라, 같은 시군구 동명이단지가
 * 한 파일에 umd_nm 하나로 합쳐져 있다(거래엔 per-deal umd가 없음). 따라서 동명단지 수백 개는
 * 파일의 단일 umd로 묶인 보수적 baseline이 된다 — 밤마다 도는 MOLIT 샤드 스케줄이 점진 보정.
 * 그래도 hp가 비어있는 것보다 압도적으로 정확하다(전체의 ~99%는 정확).
 *
 * 사용법: tsx scripts/rebuild_peaks_from_r2.ts
 */
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { AwsClient } from "aws4fetch";
import { createServiceClient } from "../lib/supabase";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

type Peak = { apt_nm: string; sgg_cd: string; umd_nm: string; pyeong: number; peak_price: number; peak_date: string };
type RawDeal = { d: string; p: number; a: number; py: number; fl: number | null; g: string; c: boolean };
type RawComplex = { apt_nm: string; sgg_cd: string; apt_seq: string | null; umd_nm: string | null; build_year: number | null; deals: RawDeal[] };

// hp에는 라이브 윈도우(최근 3개월) 거래를 넣지 않는다 — fetch_peaks.ts와 동일(self-inclusion 방지).
function peakCutoffYmd(): string {
  const d = new Date();
  const cut = new Date(d.getFullYear(), d.getMonth() - 2, 1);
  return `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, "0")}-01`;
}
const PEAK_CUTOFF = peakCutoffYmd();

async function listAllKeys(r2: AwsClient, endpoint: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const url = new URL(endpoint);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (token) url.searchParams.set("continuation-token", token);

    const res = await r2.fetch(url.toString());
    if (!res.ok) throw new Error(`ListObjectsV2 실패: ${res.status} ${await res.text()}`);
    const parsed = parser.parse(await res.text());
    const result = parsed?.ListBucketResult;
    if (!result) break;

    const contents = result.Contents
      ? (Array.isArray(result.Contents) ? result.Contents : [result.Contents])
      : [];
    for (const c of contents) {
      const key = String(c.Key ?? "");
      if (key.endsWith(".json")) keys.push(key);
    }
    token = result.IsTruncated ? String(result.NextContinuationToken) : undefined;
  } while (token);
  return keys;
}

async function foldFile(r2: AwsClient, endpoint: string, key: string, peaks: Map<string, Peak>): Promise<void> {
  const res = await r2.fetch(`${endpoint}/${key}`);
  if (!res.ok) { console.error(`  다운로드 실패 [${key}]: ${res.status}`); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  // 업로드 시 gzip 바이트 + Content-Encoding:gzip. 런타임이 자동 해제했을 수도 있어 매직바이트로 분기.
  const json = (buf[0] === 0x1f && buf[1] === 0x8b) ? gunzipSync(buf).toString() : buf.toString();

  let cx: RawComplex;
  try { cx = JSON.parse(json); } catch { console.error(`  JSON 파싱 실패 [${key}]`); return; }

  const umd = cx.umd_nm ?? "";
  for (const d of cx.deals) {
    // peaks 갱신: 취소·직거래·라이브 윈도우 제외 (signals_mv와 동일 기준).
    if (d.c || d.g === "직거래" || d.d >= PEAK_CUTOFF) continue;
    const pk = `${cx.apt_nm}|${cx.sgg_cd}|${umd}|${d.py}`;
    const ex = peaks.get(pk);
    if (!ex || d.p > ex.peak_price) {
      peaks.set(pk, { apt_nm: cx.apt_nm, sgg_cd: cx.sgg_cd, umd_nm: umd, pyeong: d.py, peak_price: d.p, peak_date: d.d });
    }
  }
}

async function main() {
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2Bucket    = process.env.R2_BUCKET;
  const r2KeyId     = process.env.R2_ACCESS_KEY_ID;
  const r2Secret    = process.env.R2_SECRET_ACCESS_KEY;
  if (!r2AccountId || !r2Bucket || !r2KeyId || !r2Secret) {
    console.error("R2 환경변수 누락: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY 필요");
    process.exit(1);
  }
  const r2 = new AwsClient({ accessKeyId: r2KeyId, secretAccessKey: r2Secret, service: "s3", region: "auto" });
  const endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}`;

  console.log(`PEAK_CUTOFF=${PEAK_CUTOFF} (이 날짜 이후 deal_date는 hp 제외)`);
  console.log("R2 객체 목록 조회 중...");
  const keys = await listAllKeys(r2, endpoint);
  console.log(`단지 파일 ${keys.length.toLocaleString()}개 발견. 다운로드+집계 시작...`);

  const peaks = new Map<string, Peak>();
  const CONCURRENCY = 24;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    await Promise.all(keys.slice(i, i + CONCURRENCY).map(k => foldFile(r2, endpoint, k, peaks)));
    if ((i / CONCURRENCY) % 50 === 0) {
      process.stdout.write(`  ${Math.min(i + CONCURRENCY, keys.length)}/${keys.length} (peak 그룹 ${peaks.size})\r`);
    }
  }
  console.log(`\n집계 완료: 최고가 그룹 ${peaks.size.toLocaleString()}개`);

  const db   = createServiceClient();
  const rows = [...peaks.values()];
  console.log("historical_peaks 업서트 중...");
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.rpc("upsert_peaks_if_higher", { p_rows: rows.slice(i, i + BATCH) });
    if (error) console.error(`  batch ${i} 오류:`, error.message);
    else upserted += Math.min(BATCH, rows.length - i);
  }
  console.log(`업서트 완료: ${upserted.toLocaleString()}건`);

  console.log("signals_mv 갱신 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) console.error("signals_mv 갱신 실패:", refreshErr.message);
  else console.log("signals_mv 갱신 완료.");
}

main().catch(err => { console.error(err); process.exit(1); });
