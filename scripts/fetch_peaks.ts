/**
 * 단지별 실거래 원본 전체를 Supabase Storage "raw" 버킷에 gzip JSON으로 적재한다.
 *   raw/<sgg_cd>/<apt_nm>.json.gz  (단지 1개 = 파일 1개, 전 기간 거래 포함)
 * 동시에 그룹(단지+시군구+평형)별 역대 최고가를 historical_peaks(DB)에 적재한다.
 *   (시그널 계산은 SQL이 읽을 수 있어야 하므로 DB. raw는 화면 조회 전용.)
 *
 * 차트(월별 평균/최고가/거래량)는 클라이언트가 raw에서 직접 계산하므로 별도 집계 파일을 두지 않는다.
 *
 * 사용법:
 *   tsx scripts/fetch_peaks.ts                      # 전 지역, 200601~현재월
 *   tsx scripts/fetch_peaks.ts --shard=1 --shards=8 # 지역을 8등분한 1번째 샤드만
 *   tsx scripts/fetch_peaks.ts --from=200601 --to=202605
 */
import { gzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { AwsClient } from "aws4fetch";
import { createServiceClient } from "../lib/supabase";
import { REGIONS } from "../lib/regions";
import { refineItem } from "./ingest";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

type Peak = { apt_nm: string; sgg_cd: string; pyeong: number; peak_price: number; peak_date: string };

/** raw 파일의 거래 1건 (키 축약으로 용량 절감) */
type RawDeal = {
  d: string;         // deal_date  YYYY-MM-DD
  p: number;         // price       만원
  a: number;         // area        전용면적 m²
  py: number;        // pyeong      추정 평형
  fl: number | null; // floor
  g: string;         // dealing_gbn 중개거래/직거래
  c: boolean;        // canceled    취소거래
};

/** 단지 1개 = 파일 1개 */
type RawComplex = {
  apt_nm: string;
  sgg_cd: string;
  apt_seq: string | null;
  umd_nm: string | null;
  build_year: number | null;
  deals: RawDeal[];
};

function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => a.slice(2).split("=") as [string, string])
  );
}

function nextYm(ym: string): string {
  const year  = parseInt(ym.slice(0, 4));
  const month = parseInt(ym.slice(4, 6));
  return month === 12
    ? `${year + 1}01`
    : `${year}${String(month + 1).padStart(2, "0")}`;
}

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let ym = from;
  while (ym <= to) { months.push(ym); ym = nextYm(ym); }
  return months;
}

async function fetchWithRetry(url: string, sgg_cd: string, ym: string, attempt = 0): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    const wait = 2000 * Math.pow(2, attempt);
    console.warn(`  [${sgg_cd}/${ym}] 429 — ${wait / 1000}s 후 재시도 (${attempt + 1}/4)`);
    await new Promise(r => setTimeout(r, wait));
    return fetchWithRetry(url, sgg_cd, ym, attempt + 1);
  }
  return res;
}

async function fetchRegion(
  sgg_cd: string,
  months: string[],
  peaks: Map<string, Peak>,
  complexes: Map<string, RawComplex>,
  molitKey: string,
): Promise<void> {
  for (const ym of months) {
    try {
      let pageNo = 1, totalCount = 0, fetched = 0;
      do {
        const url = new URL(
          "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
        );
        url.searchParams.set("serviceKey", molitKey);
        url.searchParams.set("LAWD_CD", sgg_cd);
        url.searchParams.set("DEAL_YMD", ym);
        url.searchParams.set("pageNo", String(pageNo));
        url.searchParams.set("numOfRows", "1000");

        const res = await fetchWithRetry(url.toString(), sgg_cd, ym);
        if (!res.ok) break;

        const parsed = parser.parse(await res.text());
        // fast-xml-parser가 "000"/"00"/"0"→숫자 0, "03"→3 으로 변환하므로 정수로 정규화한다.
        // (헤더가 없으면 NaN → 정상으로 간주하고 body로 데이터 유무를 판정)
        const rc = parseInt(String(parsed?.response?.header?.resultCode ?? "0"), 10);
        if (rc === 22) {
          // 일일 quota 소진 — 이 지역의 남은 달 중단 (누적 데이터는 그대로 유지)
          console.warn(`  [${sgg_cd}] resultCode=22 — quota 소진. 배치 중단.`);
          return;
        }
        if (rc !== 0 && rc !== 3 && !Number.isNaN(rc)) {
          // 0=정상, 3=NODATA(정상), 그 외 양수=오류 → 이 달만 건너뜀
          console.warn(`  [${sgg_cd}/${ym}] resultCode=${rc} — 건너뜀`);
          break;
        }

        const body = parsed?.response?.body;
        if (!body) break;

        if (pageNo === 1) totalCount = parseInt(String(body.totalCount ?? "0"), 10);
        if (totalCount === 0) break;

        const rawItems = body?.items?.item;
        if (!rawItems) break;

        const items = Array.isArray(rawItems) ? rawItems : [rawItems];
        for (const item of items) {
          const r = refineItem(item, sgg_cd);
          if (!r) continue;

          // ── raw 누적 (취소거래 포함 — 전부 보존, c 플래그로 구분) ──────────
          const aptKey = `${r.apt_nm}|${r.sgg_cd}`;
          let cx = complexes.get(aptKey);
          if (!cx) {
            cx = {
              apt_nm: r.apt_nm, sgg_cd: r.sgg_cd, apt_seq: r.apt_seq,
              umd_nm: r.umd_nm, build_year: r.build_year, deals: [],
            };
            complexes.set(aptKey, cx);
          }
          cx.deals.push({
            d: r.deal_date, p: r.price, a: r.area, py: r.pyeong,
            fl: r.floor, g: r.dealing_gbn, c: r.canceled,
          });

          // ── peaks 갱신 (취소거래 제외) ───────────────────────────────────
          if (r.canceled) continue;
          const peakKey  = `${r.apt_nm}|${r.sgg_cd}|${r.pyeong}`;
          const existing = peaks.get(peakKey);
          if (!existing || r.price > existing.peak_price) {
            peaks.set(peakKey, {
              apt_nm: r.apt_nm, sgg_cd: r.sgg_cd, pyeong: r.pyeong,
              peak_price: r.price, peak_date: r.deal_date,
            });
          }
        }

        fetched += items.length;
        pageNo++;
      } while (fetched < totalCount);

      // 데이터 있는 달만 delay — 빈 달은 바로 다음 달로
      if (totalCount > 0) {
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (err) {
      console.error(`  [${sgg_cd}/${ym}] 실패:`, err);
    }
  }
}

async function main() {
  const molitKey = process.env.MOLIT_SERVICE_KEY;
  if (!molitKey) { console.error("MOLIT_SERVICE_KEY 없음"); process.exit(1); }

  // R2 자격증명 — fail fast (수집 후 업로드에서 죽지 않도록 시작 시 검증)
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

  // R2 preflight — 자격증명/버킷이 틀리면 수집(MOLIT quota) 전에 즉시 종료
  {
    const res = await r2.fetch(`${r2Endpoint}/__preflight__.txt`, {
      method: "PUT", body: "ok", headers: { "Content-Type": "text/plain" },
    });
    if (!res.ok) {
      console.error(`R2 preflight 실패: ${res.status} ${await res.text()}`);
      console.error(`→ 자격증명 또는 버킷명(${r2Bucket}) 확인 필요. quota 소모 없이 종료.`);
      process.exit(1);
    }
    console.log(`R2 preflight OK (버킷=${r2Bucket})`);
  }

  const db   = createServiceClient();
  const args = parseArgs();
  const from = args.from ?? "200601";
  const to   = args.to   ?? currentYm();

  let targets = Object.values(REGIONS).flatMap(m => Object.keys(m));

  // 지역 샤딩: --shards=M 으로 전 지역을 M등분, --shard=N(1-based) 번째만 처리
  const shards = parseInt(args.shards ?? "1", 10);
  const shard  = parseInt(args.shard  ?? "0", 10);
  if (shards > 1 && shard >= 1) {
    const size = Math.ceil(targets.length / shards);
    targets = targets.slice((shard - 1) * size, shard * size);
    console.log(`샤드 ${shard}/${shards}: ${targets.length}개 지역`);
  }

  const months = monthRange(from, to);

  console.log(`수집 범위: ${from}~${to} (${months.length}개월, ${targets.length}개 지역)`);
  console.log("단지별 거래 원본 전체 + 그룹별 최고가를 수집합니다.");

  const peaks     = new Map<string, Peak>();
  const complexes = new Map<string, RawComplex>();

  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sgg_cd => fetchRegion(sgg_cd, months, peaks, complexes, molitKey)));
    process.stdout.write(
      `  ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length} 지역 완료 (단지 ${complexes.size}개)\r`
    );
  }

  const totalDeals = [...complexes.values()].reduce((n, c) => n + c.deals.length, 0);
  console.log(`\n수집 완료: 단지 ${complexes.size}개, 거래 ${totalDeals.toLocaleString()}건, 최고가 그룹 ${peaks.size}개`);

  // ── historical_peaks 업서트 (GREATEST 전략) ─────────────────────────
  console.log("historical_peaks 업서트 중...");
  const rows  = [...peaks.values()];
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.rpc("upsert_peaks_if_higher", {
      p_rows: rows.slice(i, i + BATCH),
    });
    if (error) console.error(`  batch ${i} 오류:`, error.message);
  }

  // ── signals_mv 갱신 ────────────────────────────────────────────────
  console.log("signals_mv 갱신 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) console.error("signals_mv 갱신 실패:", refreshErr.message);
  else console.log("signals_mv 완료.");

  // ── Cloudflare R2에 단지별 원본 업로드 ──────────────────────────────
  // gzip 바이트를 저장하되 Content-Encoding: gzip 메타데이터를 붙여, 클라이언트
  // fetch가 자동 해제하도록 한다(별도 해제 코드 불필요). key는 .json 그대로.
  console.log(`R2 업로드 시작: ${complexes.size}개 단지...`);
  const tasks = [...complexes.values()];
  const UPLOAD_CONCURRENCY = 8;
  let uploadOk = 0, uploadFail = 0, gzBytes = 0;

  for (let i = 0; i < tasks.length; i += UPLOAD_CONCURRENCY) {
    const batch = tasks.slice(i, i + UPLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async (cx) => {
        cx.deals.sort((x, y) => x.d.localeCompare(y.d)); // 날짜순
        const gz  = gzipSync(JSON.stringify(cx));
        const key = `${cx.sgg_cd}/${encodeURIComponent(cx.apt_nm)}.json`;
        try {
          const res = await r2.fetch(`${r2Endpoint}/${key}`, {
            method: "PUT",
            body: gz,
            headers: {
              "Content-Type": "application/json",
              "Content-Encoding": "gzip",
              "Cache-Control": "public, max-age=3600",
            },
          });
          if (!res.ok) {
            console.error(`  업로드 실패 [${key}]: ${res.status} ${await res.text()}`);
            uploadFail++;
          } else {
            uploadOk++;
            gzBytes += gz.byteLength;
          }
        } catch (err) {
          console.error(`  업로드 예외 [${key}]:`, err);
          uploadFail++;
        }
      })
    );
    if ((i / UPLOAD_CONCURRENCY) % 100 === 0) {
      process.stdout.write(`  업로드 진행: ${Math.min(i + UPLOAD_CONCURRENCY, tasks.length)}/${tasks.length}\r`);
    }
  }

  const mb = (gzBytes / 1024 / 1024).toFixed(1);
  console.log(`\nStorage 업로드 완료: 성공 ${uploadOk}개, 실패 ${uploadFail}개, gzip 합계 ${mb}MB`);
  console.log(`[용량측정] 이 샤드 ${mb}MB → 전 지역 추정 시 ×(전체/이 샤드 지역수)로 환산`);
}

main().catch(err => { console.error(err); process.exit(1); });
