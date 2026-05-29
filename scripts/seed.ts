/**
 * 데모 데이터 시더 — MOLIT 키 없이 signals_v 검증용 합성 거래 생성.
 * 실행: npx tsx scripts/seed.ts
 *
 * 패턴:
 *   짝수 인덱스 단지: 7개월 꾸준 상승 → 최근 월에 신고가(is_high)
 *   홀수 인덱스 단지: 4개월차 고점 → 5·6개월차 하락 → 최근 월 반등(is_rebound ≥ 90%)
 *   최근 월 거래는 today-2 날짜에 집중(일별 화면이 풍성하게)
 */

import { createServiceClient } from "../lib/supabase";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

// ─── 단지 정의 (14개 × 2 평형 = 28 그룹) ────────────────────
// area는 round(area * 0.40) = pyeong 을 만족하는 값
const COMPLEXES = [
  { apt_nm: "헬리오시티",            sgg_cd: "11740", umd_nm: "둔촌동",    jibun: "170",  area: 84.99,  pyeong: 34, base: 120_000, floor: 7  },
  { apt_nm: "헬리오시티",            sgg_cd: "11740", umd_nm: "둔촌동",    jibun: "170",  area: 124.99, pyeong: 50, base: 180_000, floor: 12 },
  { apt_nm: "잠실엘스",              sgg_cd: "11710", umd_nm: "잠실동",    jibun: "5",    area: 84.99,  pyeong: 34, base: 220_000, floor: 5  },
  { apt_nm: "잠실엘스",              sgg_cd: "11710", umd_nm: "잠실동",    jibun: "5",    area: 124.99, pyeong: 50, base: 310_000, floor: 10 },
  { apt_nm: "리센츠",                sgg_cd: "11710", umd_nm: "잠실동",    jibun: "11",   area: 84.99,  pyeong: 34, base: 210_000, floor: 8  },
  { apt_nm: "리센츠",                sgg_cd: "11710", umd_nm: "잠실동",    jibun: "11",   area: 124.99, pyeong: 50, base: 300_000, floor: 14 },
  { apt_nm: "래미안대치팰리스",       sgg_cd: "11680", umd_nm: "대치동",    jibun: "316",  area: 84.99,  pyeong: 34, base: 280_000, floor: 6  },
  { apt_nm: "래미안대치팰리스",       sgg_cd: "11680", umd_nm: "대치동",    jibun: "316",  area: 124.99, pyeong: 50, base: 420_000, floor: 11 },
  { apt_nm: "은마",                  sgg_cd: "11680", umd_nm: "대치동",    jibun: "35",   area: 77.49,  pyeong: 31, base: 200_000, floor: 4  },
  { apt_nm: "은마",                  sgg_cd: "11680", umd_nm: "대치동",    jibun: "35",   area: 99.99,  pyeong: 40, base: 250_000, floor: 9  },
  { apt_nm: "아크로리버파크",         sgg_cd: "11650", umd_nm: "반포동",    jibun: "23",   area: 84.99,  pyeong: 34, base: 350_000, floor: 13 },
  { apt_nm: "아크로리버파크",         sgg_cd: "11650", umd_nm: "반포동",    jibun: "23",   area: 124.99, pyeong: 50, base: 490_000, floor: 19 },
  { apt_nm: "마포래미안푸르지오",     sgg_cd: "11440", umd_nm: "아현동",    jibun: "680",  area: 84.99,  pyeong: 34, base: 150_000, floor: 5  },
  { apt_nm: "마포래미안푸르지오",     sgg_cd: "11440", umd_nm: "아현동",    jibun: "680",  area: 124.99, pyeong: 50, base: 210_000, floor: 8  },
  { apt_nm: "e편한세상마포리버파크",  sgg_cd: "11440", umd_nm: "마포동",    jibun: "98",   area: 62.49,  pyeong: 25, base: 110_000, floor: 4  },
  { apt_nm: "e편한세상마포리버파크",  sgg_cd: "11440", umd_nm: "마포동",    jibun: "98",   area: 84.99,  pyeong: 34, base: 140_000, floor: 7  },
  { apt_nm: "고덕그라시움",           sgg_cd: "11740", umd_nm: "고덕동",    jibun: "567",  area: 84.99,  pyeong: 34, base: 130_000, floor: 6  },
  { apt_nm: "고덕그라시움",           sgg_cd: "11740", umd_nm: "고덕동",    jibun: "567",  area: 124.99, pyeong: 50, base: 190_000, floor: 10 },
  { apt_nm: "래미안힐스테이트",       sgg_cd: "11290", umd_nm: "길음동",    jibun: "201",  area: 84.99,  pyeong: 34, base:  80_000, floor: 3  },
  { apt_nm: "래미안힐스테이트",       sgg_cd: "11290", umd_nm: "길음동",    jibun: "201",  area: 124.99, pyeong: 50, base: 120_000, floor: 7  },
  { apt_nm: "상계주공7단지",          sgg_cd: "11350", umd_nm: "상계동",    jibun: "350",  area: 42.49,  pyeong: 17, base:  45_000, floor: 2  },
  { apt_nm: "상계주공7단지",          sgg_cd: "11350", umd_nm: "상계동",    jibun: "350",  area: 62.49,  pyeong: 25, base:  65_000, floor: 5  },
  { apt_nm: "중계무지개",             sgg_cd: "11350", umd_nm: "중계동",    jibun: "100",  area: 62.49,  pyeong: 25, base:  70_000, floor: 4  },
  { apt_nm: "중계무지개",             sgg_cd: "11350", umd_nm: "중계동",    jibun: "100",  area: 84.99,  pyeong: 34, base:  95_000, floor: 8  },
  { apt_nm: "DMC센트럴자이",          sgg_cd: "11410", umd_nm: "북아현동",  jibun: "12",   area: 62.49,  pyeong: 25, base:  85_000, floor: 5  },
  { apt_nm: "DMC센트럴자이",          sgg_cd: "11410", umd_nm: "북아현동",  jibun: "12",   area: 84.99,  pyeong: 34, base: 110_000, floor: 9  },
  { apt_nm: "목동신시가지7단지",      sgg_cd: "11470", umd_nm: "목동",      jibun: "915",  area: 84.99,  pyeong: 34, base: 130_000, floor: 6  },
  { apt_nm: "목동신시가지7단지",      sgg_cd: "11470", umd_nm: "목동",      jibun: "915",  area: 124.99, pyeong: 50, base: 190_000, floor: 11 },
] as const;

// 7개월 가격 배율 (index=0 이 6개월 전, index=6 이 최근 월)
// 짝수: 꾸준 상승 → 최근 월 is_high
// 홀수: 3개월차 고점 → 5·6개월차 하락 → 최근 월 반등(≥90% 회복)
const MULT_RISING =  [1.000, 1.010, 1.020, 1.030, 1.040, 1.050, 1.060];
const MULT_REBOUND = [1.000, 1.010, 1.020, 1.030, 0.985, 0.965, 0.975];
// 반등 검증: 0.975 / 1.030 = 94.7% ≥ 90% ✓  &  0.975 > 0.965 ✓

function dateOf(monthsAgo: number, dayInMonth: number) {
  const kst = new Date(Date.now() + 9 * 3600_000);
  kst.setDate(1); // 말일 오버플로 방지
  kst.setMonth(kst.getMonth() - monthsAgo);
  kst.setDate(dayInMonth);
  return kst.toISOString().slice(0, 10);
}

function recentDate() {
  const kst = new Date(Date.now() + 9 * 3600_000);
  kst.setDate(kst.getDate() - 2);
  return kst.toISOString().slice(0, 10);
}

async function main() {
  const db = createServiceClient();

  const rows: Record<string, unknown>[] = [];
  let txIdx = 0;

  for (let ci = 0; ci < COMPLEXES.length; ci++) {
    const c = COMPLEXES[ci];
    const isRebound = ci % 2 === 1;
    const mult = isRebound ? MULT_REBOUND : MULT_RISING;

    // 6개월 전 ~ 1개월 전 (각 1건)
    for (let mAgo = 6; mAgo >= 1; mAgo--) {
      const monthIdx = 6 - mAgo;         // 0~5
      const price = Math.round(c.base * mult[monthIdx] / 100) * 100; // 100만 단위 반올림
      const deal_date = dateOf(mAgo, 15);

      const canceled = (txIdx % 50 === 0);
      const dealing_gbn = (txIdx % 10 === 0) ? "직거래" : "중개거래";

      const raw_key = `${c.apt_nm}|${c.umd_nm}|${c.jibun}|${c.area.toFixed(2)}|${c.floor}|${deal_date}|${price}`;
      rows.push({
        apt_nm: c.apt_nm, sgg_cd: c.sgg_cd, umd_nm: c.umd_nm, jibun: c.jibun,
        area: c.area, pyeong: c.pyeong, price, deal_date,
        floor: c.floor, build_year: 2010 + (ci % 15),
        dealing_gbn, canceled, cdeal_day: canceled ? deal_date.slice(8) : null,
        road_nm: null, raw_key,
      });
      txIdx++;
    }

    // 최근 월: today-2 에 3건 집중 (가격을 약간씩 올려 시그널 풍성하게)
    const basePrice = Math.round(c.base * mult[6] / 100) * 100;
    for (let t = 0; t < 3; t++) {
      const price = basePrice + t * 500; // +0, +500, +1000만
      const deal_date = recentDate();
      const raw_key = `${c.apt_nm}|${c.umd_nm}|${c.jibun}|${c.area.toFixed(2)}|${c.floor + t}|${deal_date}|${price}`;
      rows.push({
        apt_nm: c.apt_nm, sgg_cd: c.sgg_cd, umd_nm: c.umd_nm, jibun: c.jibun,
        area: c.area, pyeong: c.pyeong, price, deal_date,
        floor: c.floor + t, build_year: 2010 + (ci % 15),
        dealing_gbn: "중개거래", canceled: false, cdeal_day: null,
        road_nm: null, raw_key,
      });
    }
  }

  // 100건 단위로 배치 upsert
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from("transactions")
      .upsert(batch, { onConflict: "raw_key", ignoreDuplicates: true });
    if (error) { console.error("upsert 오류:", error.message); process.exit(1); }
  }

  console.log(`시드 완료: ${rows.length}건 적재 (단지 ${COMPLEXES.length}개, 7개월)`);
  console.log("검증 쿼리: select count(*) from signals_v where is_high or is_rebound;");
}

main().catch(err => { console.error(err); process.exit(1); });
