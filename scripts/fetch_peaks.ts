/**
 * 과거 거래 원본은 저장하지 않고, 그룹(단지+시군구+평형)별 역대 최고가만
 * historical_peaks에 적재한다. 신고가 정확도 확보용 1회성 작업.
 *
 * 부가: 월별 집계(max/avg/cnt)를 Supabase Storage "trends" 버킷에
 *   sgg_cd/<apt_nm>.json 형태로 저장한다.
 *
 * 사용법:
 *   tsx scripts/fetch_peaks.ts --from=200601 --to=202412
 */
import { XMLParser } from "fast-xml-parser";
import { createServiceClient } from "../lib/supabase";
import { REGIONS } from "../lib/regions";
import { refineItem } from "./ingest";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

type Peak = { apt_nm: string; sgg_cd: string; pyeong: number; peak_price: number; peak_date: string };

/** 월별 집계 누산기 — キー: "apt_nm|sgg_cd|pyeong|ym" */
type MonthlyAcc = { max_price: number; sum_price: number; count: number };

/** Storage 업로드 단위 JSON */
type TrendEntry = { ym: string; max: number; avg: number; cnt: number };
type TrendJson  = { [pyeong: string]: TrendEntry[] };

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

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let ym = from;
  while (ym <= to) { months.push(ym); ym = nextYm(ym); }
  return months;
}

async function fetchRegion(
  sgg_cd: string,
  months: string[],
  peaks: Map<string, Peak>,
  monthlyAgg: Map<string, MonthlyAcc>,
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

        const res = await fetch(url.toString());
        if (!res.ok) break;

        const parsed = parser.parse(await res.text());
        const body   = parsed?.response?.body;
        if (!body) break;

        if (pageNo === 1) totalCount = parseInt(String(body.totalCount ?? "0"), 10);
        if (totalCount === 0) break;

        const rawItems = body?.items?.item;
        if (!rawItems) break;

        const items = Array.isArray(rawItems) ? rawItems : [rawItems];
        for (const item of items) {
          const r = refineItem(item, sgg_cd);
          if (!r || r.canceled) continue;

          // ── peaks 갱신 ──────────────────────────────────────────────
          const peakKey  = `${r.apt_nm}|${r.sgg_cd}|${r.pyeong}`;
          const existing = peaks.get(peakKey);
          if (!existing || r.price > existing.peak_price) {
            peaks.set(peakKey, {
              apt_nm: r.apt_nm, sgg_cd: r.sgg_cd, pyeong: r.pyeong,
              peak_price: r.price, peak_date: r.deal_date,
            });
          }

          // ── 월별 집계 누산 ───────────────────────────────────────────
          const aggKey = `${r.apt_nm}|${r.sgg_cd}|${r.pyeong}|${ym}`;
          const acc    = monthlyAgg.get(aggKey);
          if (!acc) {
            monthlyAgg.set(aggKey, { max_price: r.price, sum_price: r.price, count: 1 });
          } else {
            if (r.price > acc.max_price) acc.max_price = r.price;
            acc.sum_price += r.price;
            acc.count     += 1;
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

  const db   = createServiceClient();
  const args = parseArgs();
  const from = args.from ?? "200601";
  const to   = args.to   ?? "202412";

  const targets = Object.values(REGIONS).flatMap(m => Object.keys(m));
  const months  = monthRange(from, to);

  console.log(`수집 범위: ${from}~${to} (${months.length}개월, ${targets.length}개 지역)`);
  console.log("거래 원본은 저장하지 않고 그룹별 최고가 + 월별 집계만 추적합니다.");

  const peaks      = new Map<string, Peak>();
  const monthlyAgg = new Map<string, MonthlyAcc>();

  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sgg_cd => fetchRegion(sgg_cd, months, peaks, monthlyAgg, molitKey)));
    process.stdout.write(
      `  ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length} 지역 완료 (누적 그룹 ${peaks.size}개)\r`
    );
  }

  console.log(`\n피크 수집 완료: ${peaks.size}개 그룹, 월별 집계 ${monthlyAgg.size}건`);

  // ── historical_peaks 업서트 ─────────────────────────────────────────
  console.log("historical_peaks 업서트 중...");
  const rows  = [...peaks.values()];
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("historical_peaks")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "apt_nm,sgg_cd,pyeong" });
    if (error) console.error(`  batch ${i} 오류:`, error.message);
  }

  // ── signals_mv 갱신 ────────────────────────────────────────────────
  console.log("signals_mv 갱신 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) console.error("signals_mv 갱신 실패:", refreshErr.message);
  else console.log("signals_mv 완료.");

  // ── Supabase Storage "trends" 버킷에 월별 집계 업로드 ───────────────
  console.log("trends 버킷 준비 중...");
  const { error: bucketErr } = await db.storage.createBucket("trends", { public: true });
  if (bucketErr && !bucketErr.message.includes("already exists")) {
    console.error("버킷 생성 실패:", bucketErr.message);
  }

  // monthlyAgg를 (apt_nm, sgg_cd) 기준으로 그룹핑
  // intermediateMap: "apt_nm|sgg_cd" → { [pyeong]: { [ym]: MonthlyAcc } }
  type PyeongYmMap = Map<string, Map<string, MonthlyAcc>>;
  const grouped = new Map<string, PyeongYmMap>();

  for (const [key, acc] of monthlyAgg) {
    const [apt_nm, sgg_cd, pyeongStr, ym] = key.split("|");
    const aptKey = `${apt_nm}|${sgg_cd}`;

    let pyeongMap = grouped.get(aptKey);
    if (!pyeongMap) { pyeongMap = new Map(); grouped.set(aptKey, pyeongMap); }

    let ymMap = pyeongMap.get(pyeongStr);
    if (!ymMap) { ymMap = new Map(); pyeongMap.set(pyeongStr, ymMap); }

    ymMap.set(ym, acc);
  }

  // 업로드할 파일 목록 빌드
  type UploadTask = { path: string; body: string };
  const uploadTasks: UploadTask[] = [];

  for (const [aptKey, pyeongMap] of grouped) {
    const pipeIdx = aptKey.indexOf("|");
    const apt_nm  = aptKey.slice(0, pipeIdx);
    const sgg_cd  = aptKey.slice(pipeIdx + 1);

    const trendJson: TrendJson = {};
    for (const [pyeongStr, ymMap] of pyeongMap) {
      const entries: TrendEntry[] = [...ymMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, acc]) => ({
          ym,
          max: acc.max_price,
          avg: Math.round(acc.sum_price / acc.count),
          cnt: acc.count,
        }));
      trendJson[pyeongStr] = entries;
    }

    uploadTasks.push({
      path: `${sgg_cd}/${apt_nm}.json`,
      body: JSON.stringify(trendJson),
    });
  }

  console.log(`Storage 업로드 시작: ${uploadTasks.length}개 파일...`);

  const UPLOAD_CONCURRENCY = 5;
  let uploadOk = 0, uploadFail = 0;
  for (let i = 0; i < uploadTasks.length; i += UPLOAD_CONCURRENCY) {
    const batch = uploadTasks.slice(i, i + UPLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ path, body }) => {
        const { error } = await db.storage
          .from("trends")
          .upload(path, body, { contentType: "application/json", upsert: true });
        if (error) {
          console.error(`  업로드 실패 [${path}]:`, error.message);
          uploadFail++;
        } else {
          uploadOk++;
        }
      })
    );
    if ((i / UPLOAD_CONCURRENCY) % 100 === 0) {
      process.stdout.write(`  업로드 진행: ${Math.min(i + UPLOAD_CONCURRENCY, uploadTasks.length)}/${uploadTasks.length}\r`);
    }
  }

  console.log(`\nStorage 업로드 완료: 성공 ${uploadOk}개, 실패 ${uploadFail}개`);
}

main().catch(err => { console.error(err); process.exit(1); });
