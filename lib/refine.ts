// 국토부 MOLIT 응답 항목의 정제 로직.
// 수집(scripts/ingest.ts)과 백필(scripts/fetch_peaks.ts) 양쪽에서 import 한다.
// ⚠️ 이 파일은 부수효과(top-level 실행)가 없어야 한다 — import만으로 아무것도 돌지 않게.

export interface MolitItem {
  aptNm?: string | number;
  aptSeq?: string | number;
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

function pad2(n: string | number) {
  return String(n).padStart(2, "0");
}

export function refineItem(item: MolitItem, sgg_cd: string) {
  const apt_nm = String(item.aptNm ?? "").trim();
  if (!apt_nm) return null;
  const apt_seq = item.aptSeq ? String(item.aptSeq).trim() || null : null;

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

  return { apt_nm, apt_seq, sgg_cd, umd_nm, jibun, area, pyeong, price, deal_date, floor, build_year, dealing_gbn, canceled, cdeal_day, road_nm, raw_key };
}
