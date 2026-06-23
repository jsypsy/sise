/**
 * R2 적재 검증 — 읽기 전용. (fetch_peaks가 올린 단지 원본이 빠짐없이 들어갔는지 확인)
 *
 * 1) 버킷 전체 객체를 ListObjectsV2로 세고, sgg(시군구) 프리픽스별로 집계한다.
 * 2) lib/regions.ts의 전국 sgg 목록과 대조해 '0개인 지역(누락)'을 보고한다.
 * 3) 표본 N개 파일을 내려받아 거래 날짜 min/max·건수를 찍어 '전 기간(2006~)'이
 *    담겼는지 눈으로 확인한다. (객체 존재 ≠ 내용 완전성이라 샘플로 깊이까지 검증)
 *
 * 사용법:
 *   tsx scripts/count_r2.ts                # 카운트 + 기본 20개 표본
 *   tsx scripts/count_r2.ts --sample=0     # 카운트만 (표본 다운로드 생략)
 *   tsx scripts/count_r2.ts --sample=50    # 표본 50개
 */
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { AwsClient } from "aws4fetch";
import { REGIONS } from "../lib/regions";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => a.slice(2).split("=") as [string, string])
  );
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
  const r2Endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}`;
  const args = parseArgs();
  const sampleN = args.sample != null ? Math.max(0, parseInt(args.sample, 10)) : 20;

  // ── 1) 전체 객체 나열 (ListObjectsV2, 1000개씩 페이지네이션) ──────────────
  console.log(`R2 버킷 '${r2Bucket}' 객체 나열 중...`);
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const url = new URL(r2Endpoint + "/");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (token) url.searchParams.set("continuation-token", token);

    const res = await r2.fetch(url.toString());
    if (!res.ok) {
      console.error(`ListObjectsV2 실패: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const parsed = parser.parse(await res.text());
    const lr = parsed?.ListBucketResult;
    const contents = lr?.Contents
      ? (Array.isArray(lr.Contents) ? lr.Contents : [lr.Contents])
      : [];
    for (const c of contents) keys.push(String(c.Key));
    token = lr?.IsTruncated ? String(lr.NextContinuationToken) : undefined;
    process.stdout.write(`  누적 ${keys.length}개\r`);
  } while (token);
  console.log(`\n총 객체: ${keys.length.toLocaleString()}개`);

  // ── 2) sgg 프리픽스별 집계 + 누락 지역 대조 ─────────────────────────────
  // 단지 파일 키 형식: "<sgg_cd>/<encoded apt_nm>.json" → 첫 세그먼트가 sgg_cd.
  const perSgg = new Map<string, number>();
  let nonComplex = 0;
  for (const k of keys) {
    const slash = k.indexOf("/");
    if (slash < 0 || !k.endsWith(".json")) { nonComplex++; continue; } // __preflight__.txt 등
    const sgg = k.slice(0, slash);
    perSgg.set(sgg, (perSgg.get(sgg) ?? 0) + 1);
  }

  const allSgg = Object.values(REGIONS).flatMap(m => Object.keys(m));
  const nameOf: Record<string, string> = {};
  for (const m of Object.values(REGIONS)) for (const [code, name] of Object.entries(m)) nameOf[code] = name;

  const missing = allSgg.filter(s => !perSgg.has(s));
  const extra   = [...perSgg.keys()].filter(s => !allSgg.includes(s));

  console.log(`단지 파일: ${(keys.length - nonComplex).toLocaleString()}개 (비단지 객체 ${nonComplex}개 제외)`);
  console.log(`커버 지역: ${perSgg.size}/${allSgg.length} 시군구`);
  if (missing.length) {
    console.log(`\n⚠️ 파일이 0개인 지역 ${missing.length}곳:`);
    for (const s of missing) console.log(`   - ${s} ${nameOf[s] ?? ""}`);
  } else {
    console.log("✅ 전국 모든 시군구에 단지 파일 존재 (누락 지역 없음)");
  }
  if (extra.length) console.log(`\n참고: regions.ts에 없는 프리픽스 ${extra.length}곳: ${extra.join(", ")}`);

  // ── 3) 표본 다운로드 — 거래 날짜 범위로 '전 기간' 적재 확인 ────────────────
  if (sampleN > 0 && keys.length > 0) {
    const complexKeys = keys.filter(k => k.includes("/") && k.endsWith(".json"));
    const step = Math.max(1, Math.floor(complexKeys.length / sampleN));
    const picks = complexKeys.filter((_, i) => i % step === 0).slice(0, sampleN);

    console.log(`\n표본 ${picks.length}개 거래 날짜 범위 확인:`);
    let oldest = "9999", newest = "0000";
    for (const key of picks) {
      try {
        const res = await r2.fetch(`${r2Endpoint}/${key}`);
        if (!res.ok) { console.log(`   [${key}] 다운로드 실패 ${res.status}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        // 저장은 gzip 바이트. 런타임이 Content-Encoding으로 자동 해제하면 raw가 JSON,
        // 아니면 gzip이라 직접 해제. gunzip 우선 시도 후 실패 시 raw로 폴백.
        let text: string;
        try { text = gunzipSync(buf).toString("utf8"); }
        catch { text = buf.toString("utf8"); }
        const cx = JSON.parse(text) as { apt_nm: string; deals: { d: string }[] };
        const dates = cx.deals.map(d => d.d).filter(Boolean).sort();
        const min = dates[0] ?? "-", max = dates[dates.length - 1] ?? "-";
        if (min !== "-" && min < oldest) oldest = min;
        if (max !== "-" && max > newest) newest = max;
        console.log(`   [${decodeURIComponent(key)}] 거래 ${cx.deals.length}건, ${min} ~ ${max}`);
      } catch (err) {
        console.log(`   [${key}] 파싱 실패: ${err}`);
      }
    }
    console.log(`\n표본 전체 거래일 범위: ${oldest} ~ ${newest}`);
    console.log("→ oldest가 2006년대면 전 기간 적재 정상. newest가 최근월이면 갱신 정상.");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
