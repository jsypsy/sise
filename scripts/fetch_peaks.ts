/**
 * 과거 거래 원본은 저장하지 않고, 그룹(단지+시군구+평형)별 역대 최고가만
 * historical_peaks에 적재한다. 신고가 정확도 확보용 1회성 작업.
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

          const key      = `${r.apt_nm}|${r.sgg_cd}|${r.pyeong}`;
          const existing = peaks.get(key);
          if (!existing || r.price > existing.peak_price) {
            peaks.set(key, {
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

  const db   = createServiceClient();
  const args = parseArgs();
  const from = args.from ?? "200601";
  const to   = args.to   ?? "202412";

  const targets = Object.values(REGIONS).flatMap(m => Object.keys(m));
  const months  = monthRange(from, to);

  console.log(`수집 범위: ${from}~${to} (${months.length}개월, ${targets.length}개 지역)`);
  console.log("거래 원본은 저장하지 않고 그룹별 최고가만 추적합니다.");

  // 지역 3개씩 병렬 처리 — 순차 대비 약 3x 단축 (6시간 한도 이내)
  const peaks = new Map<string, Peak>();
  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sgg_cd => fetchRegion(sgg_cd, months, peaks, molitKey)));
    process.stdout.write(
      `  ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length} 지역 완료 (누적 그룹 ${peaks.size}개)\r`
    );
  }

  console.log(`\n피크 수집 완료: ${peaks.size}개 그룹`);
  console.log("historical_peaks 업서트 중...");

  const rows  = [...peaks.values()];
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("historical_peaks")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "apt_nm,sgg_cd,pyeong" });
    if (error) console.error(`  batch ${i} 오류:`, error.message);
  }

  console.log("signals_mv 갱신 중...");
  const { error: refreshErr } = await db.rpc("refresh_signals_mv");
  if (refreshErr) console.error("signals_mv 갱신 실패:", refreshErr.message);
  else console.log("완료.");
}

main().catch(err => { console.error(err); process.exit(1); });
