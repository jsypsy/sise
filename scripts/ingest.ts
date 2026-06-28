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

// KST 기준 오늘 날짜(YYYY-MM-DD) — 신규 거래의 first_seen(등록일)로 사용.
// Actions runner는 UTC이므로 DB의 current_date를 쓰면 KST와 하루 어긋난다.
function todayDateKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

// KST 기준 당월부터 과거로 months개월의 계약년월(YYYYMM) 목록.
// 신고 기한(계약 후 30일) 탓에 오늘 등록되는 거래의 계약월이 전월·전전월일 수
// 있어, 최근 몇 달을 매일 다시 긁어 지연 신고분을 따라잡는다.
function recentYmsKst(months: number): string[] {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // KST-shift된 타임스탬프라 UTC 게터가 KST 연·월
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ─── 수집 ─────────────────────────────────────────────────────
async function fetchPage(serviceKey: string, sgg_cd: string, ym: string, pageNo: number, attempt = 0): Promise<ReturnType<typeof parser.parse>> {
  const url = new URL("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("LAWD_CD", sgg_cd);
  url.searchParams.set("DEAL_YMD", ym);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", "1000");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (res.status === 429 && attempt < 4) {
    const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
    console.warn(`  [${sgg_cd}/${ym}] 429 — ${wait / 1000}s 후 재시도 (${attempt + 1}/4)`);
    await new Promise(r => setTimeout(r, wait));
    return fetchPage(serviceKey, sgg_cd, ym, pageNo, attempt + 1);
  }
  if (res.status === 502 && attempt < 2) {
    const wait = 1000 * (attempt + 1); // 1s, 2s
    console.warn(`  [${sgg_cd}/${ym}] 502 — ${wait / 1000}s 후 재시도 (${attempt + 1}/2)`);
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
  firstSeen: string,
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
    const rows = items
      .map(i => refineItem(i, sgg_cd))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map(r => ({ ...r, first_seen: firstSeen }));

    if (rows.length) {
      const { error } = await db
        .from("transactions")
        .upsert(rows, { onConflict: "raw_key", ignoreDuplicates: true });
      if (error) console.error(`  [${sgg_cd}/${ym}] upsert 오류:`, error.message);
      else upserted += rows.length;

      // 취소 갱신: insert-only upsert는 기존 행을 안 건드리므로, 나중에 취소로
      // 바뀐 거래(canceled=false→true)가 반영되지 않는다. 취소 행만 모아 bulk
      // update — first_seen은 보존, 이미 취소된 행은 RPC 내부 가드로 no-op.
      const canceledRows = rows
        .filter(r => r.canceled)
        .map(r => ({ raw_key: r.raw_key, cdeal_day: r.cdeal_day }));
      if (canceledRows.length) {
        const { data: flipped, error: cErr } = await db.rpc("apply_cancellations", { rows: canceledRows });
        if (cErr) console.error(`  [${sgg_cd}/${ym}] 취소 갱신 오류:`, cErr.message);
        else if (flipped) console.log(`  [${sgg_cd}/${ym}] 취소 갱신 ${flipped}건`);
      }
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

  const targets = args.sgg
    ? [args.sgg]
    : Object.values(REGIONS).flatMap(m => Object.keys(m));

  // --ym=YYYYMM 이면 그 달만(수동 backfill). 없으면 당월부터 최근 N개월(기본 3).
  const firstSeen = todayDateKst();
  // 기본 3개월(당월+전월+전전월 ≈ 90일). 30일 신고기한을 넘겨 늦게 등록되는
  // 지연 신고분(계약은 전전월, 신고는 이번 달)까지 따라잡는다.
  // (2026-06: 무료 2,000분 방어용으로 잠시 2개월로 줄였다가, 레포 public 전환으로
  //  표준 러너 분이 무제한이 되어 3개월로 복원.)
  const months = args.months ? Math.max(1, parseInt(args.months, 10)) : 3;
  const yms = args.ym ? [args.ym] : recentYmsKst(months);

  console.log(`수집 시작: ${targets.length}개 지역 × ${yms.length}개월 [${yms.join(", ")}], first_seen=${firstSeen}`);

  let consecutive429 = 0;
  outer:
  for (const ym of yms) {
    for (const sgg_cd of targets) {
      try {
        await ingestSggYm(molitKey, sgg_cd, ym, firstSeen, db);
        consecutive429 = 0;
      } catch (err) {
        console.error(`  [${sgg_cd}/${ym}] 실패:`, err);
        if (String(err).includes("429")) {
          consecutive429++;
          if (consecutive429 >= 5) {
            console.error("연속 5회 429 — 일일 quota 소진. 수집 조기 종료.");
            break outer;
          }
        } else {
          consecutive429 = 0;
        }
      }
      await new Promise(r => setTimeout(r, 300)); // 429 방지
    }
  }

  console.log("수집 완료");

  // ※ sync_peaks_from_transactions()는 호출하지 않는다.
  // 현재 윈도우 거래의 가격을 historical_peaks에 먼저 써넣으면, signals_mv의
  // prev_peak = GREATEST(윈도우-자기제외, hp)에 '자기 가격'이 포함되어 진짜
  // 신고가가 is_high=false로 억눌린다(self-inclusion). hp의 전고점 baseline은
  // archive_expired_transactions(떠나는 거래)와 fetch_peaks(R2 전체이력)만으로
  // 유지한다.

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
