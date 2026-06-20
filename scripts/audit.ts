/**
 * 데이터 정합성 검수 — 지역×월 단위로 국토부 totalCount vs R2 보유 건수 비교.
 *
 * 정착된 과거 달(신고지연 끝난 달)에서 R2 보유 건수 < 국토부 totalCount 이면
 * = 실제 수집 손실(fetch_peaks 페이지 누락 등) 후보로 보고한다.
 * 최근 1~2개월은 신고지연으로 R2 < 국토부가 자연스러우므로 기본 검수 범위에서 제외한다.
 *
 * 국토부는 page-1(numOfRows=1)만 받아 totalCount만 확인 → 지역·월당 1콜로 저렴.
 * R2는 prefix(sgg/)로 객체 목록을 받아 각 단지 파일을 읽어 월별 거래수를 집계.
 *
 * 사용법:
 *   tsx scripts/audit.ts                        # 정착 구간(기본) 전 지역
 *   tsx scripts/audit.ts --shard=1 --shards=8   # 지역 8등분 1번째 샤드
 *   tsx scripts/audit.ts --sgg=11740            # 한 지역만
 *   tsx scripts/audit.ts --from=202401 --to=202504
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

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ym(YYYYMM)에 delta개월을 더한다(음수 가능).
function addMonths(ym: string, delta: number): string {
  const t = parseInt(ym.slice(0, 4), 10) * 12 + (parseInt(ym.slice(4, 6), 10) - 1) + delta;
  const y = Math.floor(t / 12);
  const m = ((t % 12) + 12) % 12;
  return `${y}${String(m + 1).padStart(2, "0")}`;
}

function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let ym = from;
  while (ym <= to) { out.push(ym); ym = addMonths(ym, 1); }
  return out;
}

// 국토부 (지역, 계약월) 총 거래수 — page-1 numOfRows=1로 totalCount만 읽는다.
async function molitTotalCount(molitKey: string, sgg: string, ym: string, attempt = 0): Promise<number | null> {
  const url = new URL("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
  url.searchParams.set("serviceKey", molitKey);
  url.searchParams.set("LAWD_CD", sgg);
  url.searchParams.set("DEAL_YMD", ym);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1");

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      return molitTotalCount(molitKey, sgg, ym, attempt + 1);
    }
    console.error(`  [${sgg}/${ym}] 국토부 요청 실패:`, err);
    return null;
  }
  if (res.status === 429 && attempt < 5) {
    const wait = 60_000 * Math.pow(2, attempt);
    console.warn(`  [${sgg}/${ym}] 429 — ${wait / 1000}s 후 재시도 (${attempt + 1}/5)`);
    await new Promise(r => setTimeout(r, wait));
    return molitTotalCount(molitKey, sgg, ym, attempt + 1);
  }
  if (!res.ok) return null;

  const parsed = parser.parse(await res.text());
  const rc = parseInt(String(parsed?.response?.header?.resultCode ?? "0"), 10);
  if (rc === 22) throw new Error("QUOTA");          // 일일 quota 소진 → 상위에서 중단
  if (rc !== 0 && rc !== 3 && !Number.isNaN(rc)) return null;
  return parseInt(String(parsed?.response?.body?.totalCount ?? "0"), 10);
}

// R2의 한 지역(sgg) 전체 단지 파일을 읽어 월별(YYYYMM) 거래수를 집계한다.
// 취소거래 포함 — 국토부 totalCount도 취소건을 포함하므로 동일 기준으로 맞춘다.
async function r2MonthCounts(r2: AwsClient, endpoint: string, sgg: string): Promise<Map<string, number>> {
  // 1) prefix=sgg/ 로 객체 키 목록 (1000개 초과 시 continuation)
  const keys: string[] = [];
  let token = "";
  do {
    const u = new URL(endpoint);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("prefix", `${sgg}/`);
    u.searchParams.set("max-keys", "1000");
    if (token) u.searchParams.set("continuation-token", token);

    const res = await r2.fetch(u.toString());
    if (!res.ok) { console.error(`  [${sgg}] R2 list 실패 ${res.status}`); break; }
    const xml = parser.parse(await res.text());
    const result = xml?.ListBucketResult;
    const raw = result?.Contents;
    const contents = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    for (const c of contents) if (c?.Key) keys.push(String(c.Key));
    token = result?.IsTruncated === true ? String(result?.NextContinuationToken ?? "") : "";
  } while (token);

  // 2) 각 파일 GET → deals를 YYYYMM으로 집계
  const counts = new Map<string, number>();
  const CONC = 16;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    await Promise.all(batch.map(async (key) => {
      try {
        const getUrl = `${endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
        const res = await r2.fetch(getUrl);
        if (!res.ok) { console.error(`  [${sgg}] R2 get 실패 ${res.status} ${key}`); return; }
        const buf = Buffer.from(await res.arrayBuffer());
        // 저장은 gzip 바이트(Content-Encoding: gzip). 런타임이 자동 해제했을 수도 있어 매직바이트로 판별.
        const text = (buf[0] === 0x1f && buf[1] === 0x8b) ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
        const cx = JSON.parse(text) as { deals?: { d: string }[] };
        for (const d of cx.deals ?? []) {
          const ym = String(d.d).slice(0, 7).replace("-", ""); // YYYY-MM-DD → YYYYMM
          counts.set(ym, (counts.get(ym) ?? 0) + 1);
        }
      } catch (err) {
        console.error(`  [${sgg}] 파일 파싱 실패 ${key}:`, err);
      }
    }));
  }
  return counts;
}

async function main() {
  const molitKey = process.env.MOLIT_SERVICE_KEY;
  if (!molitKey) { console.error("MOLIT_SERVICE_KEY 없음"); process.exit(1); }

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

  // 정착 구간 기본값: 현재월 -14 ~ -2 (최근 2개월은 신고지연이라 제외)
  const from = args.from ?? addMonths(currentYm(), -14);
  const to   = args.to   ?? addMonths(currentYm(), -2);
  const months = monthRange(from, to);

  let targets = args.sgg
    ? [args.sgg]
    : Object.values(REGIONS).flatMap(m => Object.keys(m));

  const shards = parseInt(args.shards ?? "1", 10);
  const shard  = parseInt(args.shard  ?? "0", 10);
  if (shards > 1 && shard >= 1) {
    const size = Math.ceil(targets.length / shards);
    targets = targets.slice((shard - 1) * size, shard * size);
    console.log(`샤드 ${shard}/${shards}: ${targets.length}개 지역`);
  }

  console.log(`검수 범위: ${from}~${to} (${months.length}개월) × ${targets.length}개 지역`);
  console.log("지역×월: 국토부 totalCount vs R2 보유 건수 비교\n");

  const shortfalls: { sgg: string; ym: string; molit: number; ours: number }[] = [];
  let checked = 0;

  try {
    for (const sgg of targets) {
      const ours = await r2MonthCounts(r2, r2Endpoint, sgg);
      for (const ym of months) {
        const molit = await molitTotalCount(molitKey, sgg, ym);
        if (molit == null) continue;
        checked++;
        const got = ours.get(ym) ?? 0;
        if (molit - got >= 1) {
          shortfalls.push({ sgg, ym, molit, ours: got });
          console.log(`  ⚠️ [${sgg}/${ym}] 국토부 ${molit} > R2 ${got}  (누락 ${molit - got})`);
        }
        await new Promise(r => setTimeout(r, 100)); // burst 방지
      }
    }
  } catch (err) {
    if (String(err).includes("QUOTA")) {
      console.error("\n국토부 일일 quota 소진 — 검수 중단(여기까지 결과는 유효).");
    } else {
      throw err;
    }
  }

  // ── 요약 ────────────────────────────────────────────────────────────
  console.log(`\n검수 완료: ${checked}개 지역×월 확인, 누락 후보 ${shortfalls.length}건`);
  if (shortfalls.length) {
    const byRegion = new Map<string, number>();
    let totalMissing = 0;
    for (const s of shortfalls) {
      byRegion.set(s.sgg, (byRegion.get(s.sgg) ?? 0) + (s.molit - s.ours));
      totalMissing += s.molit - s.ours;
    }
    console.log(`누락 거래 합계 ≈ ${totalMissing}건, 영향 지역 ${byRegion.size}개`);
    console.log("지역별 누락 합계:");
    for (const [sgg, n] of [...byRegion].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${sgg}: ${n}건`);
    }
    console.log("\n→ 해당 지역은 fetch_peaks 재실행(해당 샤드 수동 dispatch)으로 보충 가능.");
  } else {
    console.log("정착 구간에서 누락 없음 — R2가 국토부와 일치. ✅");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
