import { XMLParser } from "fast-xml-parser";
import { createServiceClient } from "../lib/supabase";
import { REGIONS } from "../lib/regions";
import { refineItem, type MolitItem } from "../lib/refine";

// 로컬 개발 시 .env.local 로드 (GitHub Actions에선 이미 환경변수 주입됨)
try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

// ─── 헬퍼 ────────────────────────────────────────────────────
function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => a.slice(2).split("=") as [string, string])
  );
}

function currentYmKst(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.toISOString().slice(0, 7).replace("-", "");
}

// ─── 수집 ─────────────────────────────────────────────────────
async function fetchPage(serviceKey: string, sgg_cd: string, ym: string, pageNo: number, attempt = 0): Promise<ReturnType<typeof parser.parse>> {
  const url = new URL("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("LAWD_CD", sgg_cd);
  url.searchParams.set("DEAL_YMD", ym);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", "1000");

  const res = await fetch(url.toString());
  if (res.status === 429 && attempt < 4) {
    const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
    console.warn(`  [${sgg_cd}/${ym}] 429 — ${wait / 1000}s 후 재시도 (${attempt + 1}/4)`);
    await new Promise(r => setTimeout(r, wait));
    return fetchPage(serviceKey, sgg_cd, ym, pageNo, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const parsed = parser.parse(await res.text());
  // fast-xml-parser가 "000"/"00"/"0"→숫자 0, "03"→3 으로 변환하므로 정수로 정규화한다.
  const rc = parseInt(String(parsed?.response?.header?.resultCode ?? "0"), 10);
  if (rc === 22) {
    // HTTP 200이지만 일일 quota 소진 — consecutive429 카운터 증가로 조기 종료 트리거
    console.warn(`  [${sgg_cd}/${ym}] resultCode=22 — 일일 quota 소진`);
    throw new Error("429");
  }
  if (rc !== 0 && rc !== 3 && !Number.isNaN(rc)) {
    throw new Error(`API 오류 resultCode=${rc}`);
  }
  return parsed;
}

async function ingestSggYm(
  serviceKey: string,
  sgg_cd: string,
  ym: string,
  db: ReturnType<typeof createServiceClient>
) {
  let pageNo = 1;
  let totalCount = 0;
  let fetched = 0;
  let upserted = 0;

  do {
    const parsed = await fetchPage(serviceKey, sgg_cd, ym, pageNo);
    const body = parsed?.response?.body;
    if (!body) { console.error(`  [${sgg_cd}/${ym}] 응답 body 없음`); break; }

    if (pageNo === 1) totalCount = parseInt(String(body.totalCount ?? "0"), 10);
    if (totalCount === 0) break;

    const rawItems = body?.items?.item;
    if (!rawItems) break;

    const items: MolitItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];
    const rows = items.map(i => refineItem(i, sgg_cd)).filter((r): r is NonNullable<typeof r> => r != null);

    if (rows.length) {
      const { error } = await db
        .from("transactions")
        .upsert(rows, { onConflict: "raw_key", ignoreDuplicates: true });
      if (error) console.error(`  [${sgg_cd}/${ym}] upsert 오류:`, error.message);
      else upserted += rows.length;
    }

    fetched += items.length;
    pageNo++;
  } while (fetched < totalCount);

  if (totalCount > 0)
    console.log(`  [${sgg_cd}/${ym}] total=${totalCount} upserted=${upserted}`);
}

// ─── main ─────────────────────────────────────────────────────
async function main() {
  const molitKey = process.env.MOLIT_SERVICE_KEY;
  if (!molitKey) { console.error("MOLIT_SERVICE_KEY 환경변수 없음"); process.exit(1); }

  const db = createServiceClient();
  const args = parseArgs();
  const ym = args.ym ?? currentYmKst();

  const targets = args.sgg
    ? [args.sgg]
    : Object.values(REGIONS).flatMap(m => Object.keys(m));

  console.log(`수집 시작: ${targets.length}개 지역, ${ym}`);

  let consecutive429 = 0;
  for (const sgg_cd of targets) {
    try {
      await ingestSggYm(molitKey, sgg_cd, ym, db);
      consecutive429 = 0;
    } catch (err) {
      console.error(`  [${sgg_cd}/${ym}] 실패:`, err);
      if (String(err).includes("429")) {
        consecutive429++;
        if (consecutive429 >= 5) {
          console.error("연속 5회 429 — 일일 quota 소진. 수집 조기 종료.");
          break;
        }
      } else {
        consecutive429 = 0;
      }
    }
    await new Promise(r => setTimeout(r, 300)); // 429 방지
  }

  console.log("수집 완료");

  console.log("historical_peaks 동기화 중...");
  const { error: syncErr } = await db.rpc("sync_peaks_from_transactions");
  if (syncErr) console.error("peaks 동기화 실패:", syncErr.message);
  else console.log("peaks 동기화 완료");

  console.log("만료 거래 아카이빙 중...");
  const { error: archiveErr } = await db.rpc("archive_expired_transactions");
  if (archiveErr) console.error("아카이빙 실패:", archiveErr.message);
  else console.log("아카이빙 완료 (20일 초과 거래 → historical_peaks 병합 후 삭제)");

  console.log("시그널 뷰 갱신 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) console.error("시그널 뷰 갱신 실패:", refreshErr.message);
  else console.log("시그널 뷰 갱신 완료");
}

main().catch(err => { console.error(err); process.exit(1); });
