# Claude Code 빌드 프롬프트 — sise (시세) · 아파트 실거래 시그널 (Vercel + Supabase)

> **사용법 (사람이 읽는 부분)**
> 1. 이 파일을 VS Code의 Claude Code에 컨텍스트로 첨부합니다.
> 2. 한 번에 다 시키지 말고 **Phase 단위**로 진행합니다. 첫 지시는
>    `이 문서를 읽고 Phase 1을 시작해줘. 끝나면 Acceptance 체크리스트를 보고해줘.`
> 3. 각 Phase의 Acceptance를 확인한 뒤 `Phase 2 진행해줘` 식으로 이어갑니다.
> 4. 막히면 해당 Phase 섹션만 다시 붙여넣어 재지시하면 됩니다.

---

## 1. 너(에이전트)의 역할과 목표

너는 시니어 풀스택 개발자다. **아파트 매매 실거래가 데일리 시그널 웹서비스**를 처음부터 구축한다.

제품 포지셔닝(설계 판단의 기준으로 삼을 것):
- 호갱노노·아실 같은 종합 탐색 플랫폼과 **정면승부하지 않는다.**
- 핵심 가치 = **① 매일 신고가/반등 시그널을 빠르게 + ② 카페·단톡방에 복붙 배포하기 쉬운 형태로** 제공.
- 데이터 원천은 국토교통부 실거래가(공개). 차별점은 데이터가 아니라 **가공된 시그널 + 배포 친화성**이다.
- 범위: **아파트 매매 실거래 전용**(전세/월세/빌라/오피스텔/분양권 제외).

품질 기준: 타입 안정성, 무료 티어 한도 준수, 깔끔한 커밋 단위, 각 Phase 종료 시 동작 확인.

---

## 2. 아키텍처 (무료 티어에 맞춘 핵심 결정 — 변경 금지)

| 영역 | 선택 | 이유 / 무료 티어 제약 대응 |
|---|---|---|
| 웹/호스팅 | **Next.js (App Router) + Vercel Hobby** | Vercel Hobby cron은 하루 1회·함수 10초 제한 → 무거운 작업은 올리지 않음 |
| DB | **Supabase (Postgres) 무료** | 500MB DB / egress 제한 → 캐싱으로 방어. 상업적 이용 허용됨 |
| **데이터 수집** | **GitHub Actions cron** (Vercel cron 아님) | Actions는 실행시간 제한 없음 → 전국 다지역을 한 번에 루프 가능. 매일 DB 쓰기로 Supabase 자동 일시정지(7일 무활동)도 방지 |
| **시그널 계산** | **Postgres 윈도우 함수(View)** | 앱/스크립트에서 루프 돌리지 말고 DB가 계산. 신고가/전고점/반등을 SQL로 |
| 페이지 캐싱 | **Next.js ISR (revalidate)** | 방문자가 함수/DB가 아니라 CDN 캐시를 치게 함 → Vercel 함수 호출·Supabase egress 절약 |

**무료 티어 가드레일 (반드시 지킬 것):**
- 일별 화면은 **정적 생성 + 일 1회 재검증**(`export const revalidate = 86400` 또는 fetch `next:{revalidate}`)으로. 방문마다 DB를 때리지 말 것.
- 클라이언트에서 Supabase로 직접 대량 쿼리 금지. 서버 컴포넌트/Route Handler에서 조회 후 캐시.
- 비밀키(`service_role`)는 **GitHub Actions와 서버 사이드에서만** 사용. 브라우저 절대 노출 금지. 웹앱 읽기는 anon 키 + RLS public read.

**상업적 이용 주의(코드에 영향은 없으나 README에 명시):** Vercel Hobby는 비상업적 전용. 광고 수익화 시점엔 Vercel Pro 또는 Cloudflare Pages(무료·상업 허용)로 이전 고려. Supabase 무료는 상업적 이용 가능.

---

## 3. 기술 스택 (고정)

- Next.js 최신 (App Router) + **TypeScript**
- **Tailwind CSS**
- `@supabase/supabase-js`
- XML 파서: `fast-xml-parser`
- 수집 스크립트: Node + TypeScript (`tsx`로 실행)
- 패키지매니저: `pnpm` (없으면 npm)

---

## 4. 레포 구조 (목표)

```
.
├─ app/
│  ├─ layout.tsx                 # 마스트헤드 + 탭 네비
│  ├─ page.tsx                   # 오늘의 시그널 (일별)
│  ├─ complex/page.tsx           # 단지 조회/검색
│  ├─ top/page.tsx               # 최근 7일 TOP
│  ├─ digest/page.tsx            # 카페 복붙 배포
│  └─ api/
│     ├─ search/route.ts         # 단지 검색
│     └─ digest/route.ts         # 다이제스트 텍스트
├─ lib/
│  ├─ supabase.ts                # 서버/클라이언트 supabase 인스턴스
│  ├─ format.ts                  # won() 등 포맷터
│  ├─ regions.ts                 # 법정동 코드(부록 D)
│  └─ types.ts
├─ scripts/
│  ├─ ingest.ts                  # 국토부 → 정제 → Supabase upsert
│  └─ seed.ts                    # API 키 없이 데모 데이터
├─ supabase/
│  └─ migrations/0001_init.sql   # 스키마 + RLS + 시그널 View
├─ .github/workflows/ingest.yml  # 매일 수집 cron
├─ .env.local.example
└─ README.md
```

---

## 5. 환경변수 (`.env.local.example`로 생성)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # 서버/Actions 전용. 절대 NEXT_PUBLIC_ 금지
MOLIT_SERVICE_KEY=                # 공공데이터포털 인증키(Decoding). 없으면 seed로 데모
```
GitHub Actions에는 동일 키들을 **Repository Secrets**로 등록.

---

## 6. 단계별 빌드

### Phase 1 — 프로젝트 초기화
- Next.js(App Router, TS, Tailwind, ESLint) 프로젝트 생성.
- 의존성: `@supabase/supabase-js fast-xml-parser`, dev: `tsx`.
- `.env.local.example`, `lib/supabase.ts`(anon 클라이언트 + service 클라이언트 분리), `lib/types.ts`(부록 B 타입) 작성.
- 빈 4개 라우트(/, /complex, /top, /digest)와 공통 레이아웃 뼈대.
- **Acceptance:** `pnpm dev` 로 4개 페이지가 200으로 뜨고, 마스트헤드+탭 네비가 보인다.

### Phase 2 — Supabase 스키마 + RLS
- `supabase/migrations/0001_init.sql`에 **부록 A**의 스키마/인덱스/RLS/뷰를 작성.
- Supabase 대시보드 SQL Editor에 붙여 실행하는 절차를 README에 기록.
- **Acceptance:** `transactions` 테이블, `signals_v` 뷰 생성됨. anon 키로 `signals_v` select 가능, insert는 거부됨.

### Phase 3 — 시그널 View 검증
- (부록 A에 포함됨) `signals_v`가 그룹(단지+시군구+평형)별 전고점/직전가 기준으로
  `is_high`(신고가), `recovery_rate`(회복률), `delta_pct`(증감), `is_rebound`(반등)을 산출하는지 확인.
- **Acceptance:** 시드 데이터 적재 후(아래 Phase 4) `select * from signals_v where is_high` 가 합리적 결과.

### Phase 4 — 수집 스크립트 + 시드 + GitHub Actions
- `scripts/ingest.ts`: **부록 C**의 국토부 API 명세대로 시군구×계약월을 호출 →
  XML 파싱 → **부록 C 정제 규칙** 적용 → `transactions`에 `raw_key` 기준 **upsert(onConflict)**.
  - 인자: `--sgg=11740 --ym=202605` 또는 미지정 시 `lib/regions.ts` 전체 × 당월.
  - 지역 간 호출은 순차 + 약간의 지연(429 방지). 실패는 로그 후 다음 지역 진행.
- `scripts/seed.ts`: API 키 없이 동작. 부록 E 로직으로 서울/수도권 14개 단지의 6~7개월치
  합성 거래를 생성해 적재(최근 등록분은 한 날짜에 몰아 일별 화면이 풍성하게).
- `.github/workflows/ingest.yml`: cron `'10 20 * * *'`(= KST 05:10) + `workflow_dispatch`.
  Secrets 사용해 `tsx scripts/ingest.ts` 실행.
- **Acceptance:** `tsx scripts/seed.ts` 후 DB에 수백 건 적재, `signals_v`에 신고가/반등이 보임.
  키가 있으면 `tsx scripts/ingest.ts --sgg=11740 --ym=$(당월)` 로 실데이터 1건 이상 적재.

### Phase 5 — Next.js 데이터 레이어 + 페이지 (ISR)
- `app/page.tsx`(오늘의 시그널): 서버 컴포넌트에서 `signals_v`의 최신 `deal_date` 조회 →
  해당 일자 거래를 가격 내림차순으로. 상단 요약(총/신고가/반등/직거래), 지역 필터(쿼리스트링),
  직거래 포함 토글. **`export const revalidate = 86400`** 로 ISR.
- `app/complex/page.tsx`: 검색 입력 → `/api/search` → 클릭 시 단지 거래 이력 + 평형별 전고점 요약.
- `app/top/page.tsx`: 최근 7일 윈도우 최고가 TOP10(직거래/취소 제외).
- `app/digest/page.tsx` + `/api/digest`: **부록 F** 포맷의 복붙 텍스트 + 복사 버튼.
- `/api/search/route.ts`: 단지명 LIKE 검색(그룹별 집계).
- **Acceptance:** 4개 탭이 실제 데이터로 동작. 신고가=빨강 뱃지, 반등=금색 뱃지. 복사 버튼 동작.

### Phase 6 — 디자인 마감
- **부록 G 디자인 토큰**으로 "실거래 일간지" 컨셉 적용:
  명조 마스트헤드(Gowun Batang) + 본문 Pretendard + 숫자 tabular + 빽빽한 시세표.
  한국 관습: 상승/신고가=빨강, 하락/직거래=파랑.
- 모바일 반응형(요약 스트립 줄바꿈, 테이블 가로 스크롤).
- 푸터에 출처/면책 고지(부록 H).
- **Acceptance:** 데스크톱·모바일에서 레이아웃 깨짐 없음. 디자인 토큰 일관 적용.

### Phase 7 — 배포 & 가드레일
- README에 배포 절차: Supabase 프로젝트 생성 → 마이그레이션 실행 → Vercel 연결 →
  env 등록 → GitHub Secrets 등록 → Actions 수동 1회 실행으로 데이터 적재.
- ISR 재검증이 수집(05:10) 이후 반영되도록 `revalidate` 값/경로 점검.
- 무료 티어 가드레일 재확인(섹션 2). README에 Vercel Hobby 비상업 주의 명시.
- **Acceptance:** 배포본에서 일별 시그널이 CDN 캐시로 뜨고, Actions 수동 실행 시 신규 거래가 다음 재검증에 반영.

---

## 부록 A — Supabase SQL (스키마 + RLS + 시그널 뷰)

```sql
-- transactions
create table if not exists transactions (
  id          bigint generated always as identity primary key,
  apt_nm      text not null,
  sgg_cd      text not null,          -- 시군구 5자리
  umd_nm      text,
  jibun       text,
  area        numeric not null,       -- 전용면적(㎡)
  pyeong      int not null,           -- 공급 평형(추정)
  price       int not null,           -- 거래금액(만원)
  deal_date   date not null,
  floor       int,
  build_year  int,
  dealing_gbn text not null default '중개거래',  -- 중개거래 / 직거래
  canceled    boolean not null default false,    -- 해제(취소) 거래
  cdeal_day   text,
  road_nm     text,
  raw_key     text not null unique               -- 중복 적재 방지
);
create index if not exists idx_tx_date  on transactions(deal_date);
create index if not exists idx_tx_sgg   on transactions(sgg_cd);
create index if not exists idx_tx_apt   on transactions(apt_nm);
create index if not exists idx_tx_group on transactions(apt_nm, sgg_cd, pyeong);

-- 시그널 뷰: 그룹(단지+시군구+평형) 내 '이전 거래'만으로 전고점/직전가 계산
create or replace view signals_v as
with base as (
  select t.*,
    max(price) over (
      partition by apt_nm, sgg_cd, pyeong
      order by deal_date, id
      rows between unbounded preceding and 1 preceding
    ) as prev_peak,
    lag(price) over (
      partition by apt_nm, sgg_cd, pyeong
      order by deal_date, id
    ) as prev_price
  from transactions t
  where canceled = false
)
select *,
  (prev_peak is null or price > prev_peak) as is_high,
  case when prev_peak  is not null then round(price::numeric / prev_peak  * 100, 1) end as recovery_rate,
  case when prev_price is not null then round((price - prev_price)::numeric / prev_price * 100, 1) end as delta_pct,
  (
    prev_peak  is not null and price <= prev_peak
    and prev_price is not null and price > prev_price
    and (price::numeric / prev_peak * 100) >= 90
  ) as is_rebound
from base;

-- RLS: 실거래가는 공개 데이터 → 누구나 읽기, 쓰기는 service_role만
alter table transactions enable row level security;
create policy "public read" on transactions for select using (true);
-- insert/update 정책 없음 → anon/authenticated 쓰기 불가. service_role은 RLS 우회.
```

> 참고: 뷰는 기본적으로 정의자 권한으로 동작하므로 anon이 `signals_v` select 가능.
> 문제가 있으면 `security_invoker=on` 옵션 또는 RPC 함수로 대체.

---

## 부록 B — 타입 (lib/types.ts)

```ts
export type Tx = {
  id: number; apt_nm: string; sgg_cd: string; umd_nm: string | null;
  jibun: string | null; area: number; pyeong: number; price: number;
  deal_date: string; floor: number | null; build_year: number | null;
  dealing_gbn: string; canceled: boolean; cdeal_day: string | null; road_nm: string | null;
};
export type Signal = Tx & {
  prev_peak: number | null; prev_price: number | null;
  recovery_rate: number | null; delta_pct: number | null;
  is_high: boolean; is_rebound: boolean;
};
```

---

## 부록 C — 국토부 API 명세 & 정제 규칙

- **API:** 국토교통부_아파트 매매 실거래가 상세 자료
  (공공데이터포털 데이터 ID 15126469). 활용신청 후 인증키 발급.
- **Endpoint:** `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev`
- **Params:** `serviceKey`(Decoding 키), `LAWD_CD`(법정동 5자리), `DEAL_YMD`(YYYYMM), `pageNo`, `numOfRows`(예: 1000). 응답은 **XML**, 페이지네이션은 `totalCount`로 종료 판정.
- **응답 item 주요 필드 → 컬럼 매핑:**
  - `aptNm`→apt_nm, `umdNm`→umd_nm, `jibun`→jibun, `excluUseAr`→area,
    `dealAmount`(쉼표 포함 만원)→price, `dealYear/dealMonth/dealDay`→deal_date,
    `floor`→floor, `buildYear`→build_year, `dealingGbn`(중개거래/직거래)→dealing_gbn,
    `cdealType`('O'면 해제)→canceled, `cdealDay`→cdeal_day, `roadNm`→road_nm
- **정제 규칙:**
  1. `dealAmount`는 쉼표 제거 후 정수(만원). `excluUseAr`는 실수.
  2. `deal_date = YYYY-MM-DD` 0패딩.
  3. `pyeong = round(area * 0.40)` (공급 평형 추정. 부록 참고, 추후 단지별 매핑으로 고도화).
  4. **취소거래는 버리지 말 것** → `canceled = (cdealType == 'O')` 로 보관(업/다운 추적용).
  5. **직거래 보존** → `dealing_gbn` 그대로. 화면/다이제스트에서만 기본 제외(토글).
  6. **중복 차단:** `raw_key = apt_nm|umd_nm|jibun|area(소수2자리)|floor|deal_date|price` →
     `upsert(..., { onConflict: 'raw_key', ignoreDuplicates: true })`.
- 동일 거래가 며칠 뒤 등록될 수 있으므로 **당월 전체를 매일 재수집**해도 raw_key로 중복 무해.

---

## 부록 D — 법정동 코드 (lib/regions.ts)

```ts
export const REGIONS: Record<string, Record<string, string>> = {
  "서울특별시": {
    "11110":"종로구","11140":"중구","11170":"용산구","11200":"성동구","11215":"광진구",
    "11230":"동대문구","11260":"중랑구","11290":"성북구","11305":"강북구","11320":"도봉구",
    "11350":"노원구","11380":"은평구","11410":"서대문구","11440":"마포구","11470":"양천구",
    "11500":"강서구","11530":"구로구","11545":"금천구","11560":"영등포구","11590":"동작구",
    "11620":"관악구","11650":"서초구","11680":"강남구","11710":"송파구","11740":"강동구",
  },
  "경기도": {
    "41135":"성남시 분당구","41117":"수원시 영통구","41173":"안양시 동안구",
    "41285":"고양시 일산동구","41465":"용인시 수지구","41290":"과천시","41590":"화성시","41210":"광명시",
  },
  "인천광역시": { "28185":"연수구","28245":"서구","28140":"남동구" },
};
export const CODE_TO_NAME: Record<string,string> = Object.fromEntries(
  Object.entries(REGIONS).flatMap(([sido,m]) =>
    Object.entries(m).map(([code,gu]) => [code, `${sido.replace("서울특별시","서울")} ${gu}`]))
);
```
(MVP는 위 범위로 시작. 전국 확장 시 행정표준코드 전체로 늘리되 무료 티어 수집/저장 한도 고려.)

---

## 부록 E — 시드(데모) 생성 로직 (scripts/seed.ts)

- 단지 목록(예시): 헬리오시티/잠실엘스/리센츠/래미안대치팰리스/은마/아크로리버파크/
  마포래미안푸르지오/e편한세상마포리버파크/고덕그라시움/래미안힐스테이트/상계주공7단지/
  중계무지개/DMC센트럴자이/목동신시가지7단지. 각 단지에 평형 2개·기준가 부여.
- 최근 7개월 루프, 단지별 완만한 상승추세 + 일부 단지 중간 하락→반등 패턴.
- **최근 달의 거래는 한 '등록일'(예: 오늘-2일)에 몰아** 일별 화면이 풍성하게.
- 약 2% 취소거래(cdealType='O'), 약 10% 직거래 섞기.
- 국토부 원본 dict와 동일 형태로 만들어 ingest의 정제/적재 경로를 그대로 통과시킬 것.

---

## 부록 F — 카페 복붙 다이제스트 포맷 (/api/digest)

```
[아파트 실거래 시그널] 2026-05-27 · 서울 송파구
총 86건 / 신고가 42건 / 반등 8건

■ 신고가 TOP
  리센츠 50평 44억 2,300 (직전최고 42억 9,000)
  잠실엘스 34평 37억 7,900 (직전최고 36억 2,900)
  ...

■ 반등 (전고점 회복 진행)
  ○○아파트 34평 12억 5,000 · 회복률 93.4%
  ...

ⓘ 국토부 실거래가 기반 · 직거래/취소거래 제외
```
- 금액 포맷 `won(만원)`: `eok=floor(/10000)`, `rest=%10000` → "12억 3,400" / "12억" / "3,400만".
- 직거래·취소거래 제외, 신고가는 가격 내림차순, 반등은 회복률 내림차순, 각 최대 15줄.

---

## 부록 G — 디자인 토큰 ("실거래 일간지" 컨셉)

```css
:root{
  --paper:#FAF7F0; --paper-2:#F3EEE3; --ink:#1A1814; --ink-soft:#5C564C;
  --line:#D8D0BE; --line-strong:#1A1814;
  --red:#C7321F;  --red-bg:#F8E7E2;     /* 신고가/상승 */
  --blue:#2C557E;                        /* 하락/직거래 */
  --gold:#9A7B1F; --gold-bg:#F4ECD2;     /* 반등 */
}
```
- 폰트: 본문 **Pretendard**(jsdelivr), 마스트헤드/제목 **Gowun Batang**(Google Fonts).
- 숫자는 `font-feature-settings:"tnum"` 으로 자리 정렬.
- 마스트헤드: 더블 보더(`3px double`), 신문 제호 느낌의 로고 "시세"(브랜드명 sise).
- 테이블: 행 사이 얇은 rule, hover 시 `--paper-2`. 신고가 행 가격은 빨강.
- 뱃지: 신고가=빨강 배경 흰글씨, 반등=금색 테두리.

---

## 부록 H — 출처/면책 (푸터 고정)

> 본 서비스는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로 정부 공식 서비스가 아니며,
> 정보의 정확성·완전성을 보장하지 않습니다. 평형은 추정치이며 투자 판단의 책임은 이용자에게 있습니다.

---

## 부록 I — 다음 단계(이번 범위 외, 백로그)
- 관심 단지 푸시/이메일 알림(개인화) · 텔레그램 봇 자동 배포
- 지도 뷰(카카오맵) · 전국 확장 · 광고 슬롯/프리미엄(관심단지 무제한 알림)
- 수익화 전환 시 호스팅 재검토(Vercel Pro 또는 Cloudflare Pages)
