import { XMLParser } from "fast-xml-parser";
import { createServiceClient } from "../lib/supabase";
import { REGIONS } from "../lib/regions";

// 로컬 개발 시 .env.local 로드 (GitHub Actions에선 이미 환경변수 주입됨)
try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const parser = new XMLParser();

// ─── 타입 ─────────────────────────────────────────────────────
interface MolitItem {
  aptNm?: string | number;
  umdNm?: string | number;
  jibun?: string | number;
  excluUseAr?: string | number;
  dealAmount?: string | number;
  dealYear?: string | number;
  dealMonth?: string | number;
  dealDay?: string | number;
  floor?: string | number;
  buildYear?: string | number;
  dealingGbn?: string;
  cdealType?: string;
  cdealDay?: string | number;
  roadNm?: string | number;
}

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

function pad2(n: string | number) {
  return String(n).padStart(2, "0");
}

// ─── 정제 ─────────────────────────────────────────────────────
export function refineItem(item: MolitItem, sgg_cd: string) {
  const apt_nm = String(item.aptNm ?? "").trim();
  if (!apt_nm) return null;

  const area = parseFloat(String(item.excluUseAr ?? "0").trim());
  if (!area) return null;
  const pyeong = Math.round(area * 0.4);

  const price = parseInt(
    String(item.dealAmount ?? "0").replace(/,|\s/g, ""),
    10
  );
  if (!price) return null;

  const deal_date = `${String(item.dealYear ?? "").padStart(4, "0")}-${pad2(item.dealMonth ?? "01")}-${pad2(item.dealDay ?? "01")}`;
  const floor = item.floor ? parseInt(String(item.floor), 10) : null;
  const build_year = item.buildYear ? parseInt(String(item.buildYear), 10) : null;
  const umd_nm = item.umdNm ? String(item.umdNm).trim() || null : null;
  const jibun = item.jibun ? String(item.jibun).trim() || null : null;
  const road_nm = item.roadNm ? String(item.roadNm).trim() || null : null;
  const dealing_gbn = String(item.dealingGbn ?? "중개거래").trim();
  const canceled = String(item.cdealType ?? "").trim() === "O";
  const cdeal_day = item.cdealDay ? String(item.cdealDay).trim() || null : null;

  const raw_key = `${apt_nm}|${umd_nm ?? ""}|${jibun ?? ""}|${area.toFixed(2)}|${floor ?? ""}|${deal_date}|${price}`;

  return { apt_nm, sgg_cd, umd_nm, jibun, area, pyeong, price, deal_date, floor, build_year, dealing_gbn, canceled, cdeal_day, road_nm, raw_key };
}

// ─── 수집 ─────────────────────────────────────────────────────
async function fetchPage(serviceKey: string, sgg_cd: string, ym: string, pageNo: number) {
  const url = new URL("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("LAWD_CD", sgg_cd);
  url.searchParams.set("DEAL_YMD", ym);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", "1000");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parser.parse(await res.text());
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

  for (const sgg_cd of targets) {
    try {
      await ingestSggYm(molitKey, sgg_cd, ym, db);
    } catch (err) {
      console.error(`  [${sgg_cd}/${ym}] 실패:`, err);
    }
    await new Promise(r => setTimeout(r, 200)); // 429 방지
  }

  console.log("수집 완료");
}

main().catch(err => { console.error(err); process.exit(1); });
