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
import { refineItem, refineSilvItem } from "../lib/refine";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

// 국토부 실거래가 오퍼레이션 엔드포인트.
const EP_MAEMAE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const EP_SILV   = "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade"; // 분양권/입주권

type Peak = { apt_nm: string; sgg_cd: string; umd_nm: string; pyeong: number; peak_price: number; peak_date: string };

/** raw 파일의 거래 1건 (키 축약으로 용량 절감) */
type RawDeal = {
  d: string;         // deal_date  YYYY-MM-DD
  p: number;         // price       만원
  a: number;         // area        전용면적 m²
  py: number;        // pyeong      추정 평형
  fl: number | null; // floor
  g: string;         // dealing_gbn 중개거래/직거래
  c: boolean;        // canceled    취소거래
  tt: string;        // trade_type  매매/분양권/입주권
  dg: string | null; // apt_dong    거래동(등기완료분에만, 대부분 null)
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

// hp(시그널 전고점 baseline)에는 '라이브 윈도우'(ingest가 매일 긁는 최근 3개월) 거래를
// 넣지 않는다. signals_mv가 그 구간은 transactions에서 직접 계산하므로, hp에 같이 넣으면
// 현재월 거래가 자기 자신을 전고점으로 만들어 진짜 신고가를 억누른다(self-inclusion).
// ingest 윈도우(당월·전월·전전월)와 동일하게 전전월 1일 이후 deal_date는 hp 갱신에서 스킵.
// → 수동(to=현재월 직전)이든 스케줄(to=현재월)이든 hp 결과가 동일해지고, 밤마다 도는
//   cron이 재구축 결과를 self-inclusion으로 되돌리지 않는다.
function peakCutoffYmd(): string {
  const d = new Date();
  const cut = new Date(d.getFullYear(), d.getMonth() - 2, 1);
  return `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, "0")}-01`;
}
const PEAK_CUTOFF = peakCutoffYmd();

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let ym = from;
  while (ym <= to) { months.push(ym); ym = nextYm(ym); }
  return months;
}

// 전국 수집의 quota-aware 조기 종료용 공유 상태. (ingest.ts의 consecutive429 패턴을
// 동시성 버전으로 옮긴 것 — quota가 소진되면 남은 지역을 갈지 않고 즉시 멈춘다.)
type RunState = { aborted: boolean; hard429: number };

async function fetchWithRetry(url: string, sgg_cd: string, ym: string, attempt = 0): Promise<Response> {
  const res = await fetch(url);
  // 429 백오프는 '일시적' rate-limit용으로만 짧게(30/60/120s, 3회). quota 소진 상황에선
  // 길게 기다려봐야 계속 429라 시간 낭비 → 짧게 끊고 호출부가 hard429로 조기 종료를 판단.
  if (res.status === 429 && attempt < 3) {
    const wait = 30000 * Math.pow(2, attempt); // 30s, 60s, 120s
    console.warn(`  [${sgg_cd}/${ym}] 429 — ${wait / 1000}s 후 재시도 (${attempt + 1}/3)`);
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
  state: RunState,
): Promise<void> {
  // 매매/분양권 공통: 정제된 거래 1건을 R2 complexes와 peaks에 반영.
  const processItem = (r: NonNullable<ReturnType<typeof refineItem>>) => {
    // ── raw 누적 (취소·직거래·분양권 포함 — 전부 보존, 플래그로 구분) ──
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
      fl: r.floor, g: r.dealing_gbn, c: r.canceled, tt: r.trade_type, dg: r.apt_dong,
    });

    // ── peaks 갱신 (취소·직거래·라이브 윈도우 제외 — 매매+입주권 통합 전고점) ──
    // 동명단지(③) 분리: 그룹 키에 umd_nm 포함(NULL은 '' 버킷, hp 저장과 일치).
    // 라이브 윈도우(최근 3개월)는 hp에서 제외 — self-inclusion 방지(위 PEAK_CUTOFF 주석).
    if (r.canceled || r.dealing_gbn === "직거래" || r.deal_date >= PEAK_CUTOFF) return;
    const umd      = r.umd_nm ?? "";
    const peakKey  = `${r.apt_nm}|${r.sgg_cd}|${umd}|${r.pyeong}`;
    const existing = peaks.get(peakKey);
    if (!existing || r.price > existing.peak_price) {
      peaks.set(peakKey, {
        apt_nm: r.apt_nm, sgg_cd: r.sgg_cd, umd_nm: umd, pyeong: r.pyeong,
        peak_price: r.price, peak_date: r.deal_date,
      });
    }
  };

  // 한 API(매매 or 분양권)의 전 기간(months)을 크롤. quota 소진 시 state로 조기 종료.
  const crawl = async (endpoint: string, kind: "매매" | "분양권") => {
    for (const ym of months) {
      if (state.aborted) return; // quota 소진 감지 시 남은 달 즉시 중단
      try {
        let pageNo = 1, totalCount = 0, fetched = 0;
        do {
          const url = new URL(endpoint);
          url.searchParams.set("serviceKey", molitKey);
          url.searchParams.set("LAWD_CD", sgg_cd);
          url.searchParams.set("DEAL_YMD", ym);
          url.searchParams.set("pageNo", String(pageNo));
          url.searchParams.set("numOfRows", "1000");

          const res = await fetchWithRetry(url.toString(), sgg_cd, ym);
          if (res.status === 429) {
            if (++state.hard429 >= 6) {
              state.aborted = true;
              console.error("연속 429 다수 — 일일 quota 소진 추정. 수집 조기 종료(수집분은 그대로 업서트).");
            }
            return;
          }
          if (!res.ok) break;

          const parsed = parser.parse(await res.text());
          const rc = parseInt(String(parsed?.response?.header?.resultCode ?? "0"), 10);
          if (rc === 22) {
            console.warn(`  [${kind} ${sgg_cd}] resultCode=22 — quota 소진. 수집 조기 종료.`);
            state.aborted = true;
            return;
          }
          if (rc !== 0 && rc !== 3 && !Number.isNaN(rc)) {
            console.warn(`  [${kind} ${sgg_cd}/${ym}] resultCode=${rc} — 건너뜀`);
            break;
          }
          state.hard429 = 0; // 정상 응답 — 연속 429 카운터 리셋

          const body = parsed?.response?.body;
          if (!body) break;

          if (pageNo === 1) totalCount = parseInt(String(body.totalCount ?? "0"), 10);
          if (totalCount === 0) break;

          const rawItems = body?.items?.item;
          if (!rawItems) break;

          const items = Array.isArray(rawItems) ? rawItems : [rawItems];
          for (const item of items) {
            const r = kind === "매매" ? refineItem(item, sgg_cd) : refineSilvItem(item, sgg_cd);
            if (r) processItem(r);
          }

          fetched += items.length;
          pageNo++;
        } while (fetched < totalCount);

        await new Promise(res => setTimeout(res, 200)); // burst 방지
      } catch (err) {
        console.error(`  [${kind} ${sgg_cd}/${ym}] 실패:`, err);
      }
    }
  };

  await crawl(EP_MAEMAE, "매매");
  await crawl(EP_SILV, "분양권"); // 별도 API·별도 quota — 입주권/분양권 전고점 통합
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
  const state: RunState = { aborted: false, hard429: 0 };

  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (state.aborted) {
      console.warn(`\nquota 소진으로 남은 ${targets.length - i}개 지역 건너뜀 — 수집분만 반영한다.`);
      break;
    }
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sgg_cd => fetchRegion(sgg_cd, months, peaks, complexes, molitKey, state)));
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
