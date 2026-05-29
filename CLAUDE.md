# sise (시세) — CLAUDE.md

Behavioral guidelines for this project. These reduce the most common mistakes when working on this codebase.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

> 프로젝트 정체성: 국토부 실거래가를 가공해 **매일 신고가/반등 시그널**을 빠르게 보여주고
> **카페·단톡방 복붙 배포**가 쉬운 형태로 제공한다. 호갱노노·아실 같은 종합 플랫폼과
> 정면승부하지 않는다. 범위는 **아파트 매매 실거래 전용**.
>
> 네이밍: 브랜드 표기 **시세**, 레포/도메인/핸들 **sise**(시세 = 현재 가격, 사이클 중립).

---

## 1. Think Before Coding

**Don't assume. Surface tradeoffs before touching files.**

- **수집(`scripts/ingest.ts`)·정제·시그널(`signals_v`)·표현(`app/`)은 분리 유지.** 데이터는 결정적, 화면은 표현.
- 시그널 정의(`signals_v`) 수정 전: 현재 어떤 케이스가 틀리는지 샘플 쿼리로 먼저 진단. 수정 후: 동일 데이터로 before/after 비교.
- 무료 티어에 영향 주는 변경 전(새 cron, 새 함수, 클라이언트 직접 쿼리): 5번 원칙 먼저 확인.
- 광고 관련 변경 전: 크롤러가 `/`, `/sample`(있다면), 정적 페이지에 JS 없이 접근 가능한지 먼저 확인.
- 여러 해석이 가능하면 조용히 하나를 고르지 말고 제시 후 확인.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- 컴포넌트/라우트 추가 전 기존 것 확장 우선 검토.
- 새 의존성 추가 최소화. 현재 스택(Next.js + Tailwind + supabase-js + fast-xml-parser)으로 풀리는지 먼저 확인.
- 시그널/집계는 **앱에서 루프 돌리지 말고 Postgres(뷰/쿼리)** 에서. 앱은 결과를 받아 그릴 뿐.
- 요청하지 않은 기능, 추상화, 에러 핸들링 추가 금지.

## 3. Surgical Changes

**Touch only what you must. Every changed line must trace to the request.**

- 정제 규칙(취소거래 플래그·직거래 보존·raw_key) 수정 시 **부록 표의 불변 규칙 유지.** 실수로 지우면 데이터 품질이 즉시 망가짐.
- 관련 없는 코드 정리, 리팩터링, 포맷 변경 금지.
- 내가 만든 변경으로 생긴 미사용 import/변수는 제거. 기존 dead code는 건드리지 않음.

## 4. Goal-Driven Execution

**Define success criteria. Verify before declaring done.**

### 시그널 정확성 검증
- 전고점·직전가는 해당 거래일 **이전** 동일 그룹(단지+시군구+평형) 거래만으로 계산된다.
- **취소거래(`canceled=true`)는 시그널 계산에서 제외**된다.
- 신고가 = 그룹 내 이전보다 높은 가격. 반등 = 신고가 아님 + 직전가 대비 상승 + 회복률 ≥ 90%.
- 동일 거래를 다시 수집해도 `raw_key` 덕에 **중복 0건**.

### 무료 티어 안전 검증
- 일별 화면에 ISR(`revalidate`) 적용 → 방문마다 DB를 직격하지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`가 **클라이언트 번들에 포함되지 않는다** (`grep -r service_role .next` 또는 빌드 산출물 확인).
- 데이터 수집은 **GitHub Actions에서만** 돈다. Vercel에 무거운 cron/함수가 없다.
- `transactions`/`signals_v`는 anon read 가능, anon write 불가(RLS).

### 광고 작업 검증 (수익화 단계)
- 공개 페이지가 로그인 없이, JS 없이도 의미 있는 텍스트를 반환하는지(크롤러 에뮬레이션).

---

## 5. Free-Tier-Aware Architecture

**무료 티어 한도 안에서만 동작하도록 설계한다. 이 결정들은 불변이다.**

생존 조건: **트래픽이 늘어도 무료 한도를 안 넘는다.** 데이터 원가는 0(국토부 공개), 비용은 인프라 한도뿐.

### 불변 아키텍처 결정 (변경 시 반드시 보고·승인)
1. **수집은 Vercel이 아니라 GitHub Actions.** Vercel Hobby cron은 하루 1회·함수 10초라 다지역 수집 불가.
   Actions는 시간 제한이 없어 전국 루프 가능 + 매일 DB 쓰기로 Supabase 7일 자동정지도 방지.
2. **시그널 계산은 Postgres 윈도우 함수(`signals_v`).** 앱/스크립트에서 거래마다 쿼리 루프 금지.
3. **일별 화면은 ISR 정적 생성 + 일 1회 재검증.** 방문자가 함수/DB가 아니라 CDN을 치게 한다.
4. **`service_role` 키는 GitHub Actions·서버 전용.** 브라우저 절대 노출 금지(`NEXT_PUBLIC_` 금지).

### 새 기능 추가 시 체크리스트
"여기서 매 요청마다 DB/함수 호출하면 편한데"라는 생각이 들 때:
- 정적 생성 + 재검증 또는 캐시로 풀 수 있는지 먼저 검토 → 가능하면 그렇게.
- 주기 작업이면 **GitHub Actions로 흡수 가능한지** 검토(Vercel cron 아님).
- 그래도 매 요청 호출이 불가피하면 *반드시 무료 한도 영향과 함께 보고*하고 승인 받을 것.

### 라이브러리 라이선스
- 상용(광고) 모델이므로 **AGPL 회피.** MIT / Apache 2.0 / BSD 계열만.

### 타임존
- 모든 "오늘" 판단과 수집 기준일은 **KST.** GitHub Actions cron은 UTC이므로 KST 05:10 = UTC 20:10.

### RLS
- `transactions`/`signals_v`는 공개 데이터 → anon read 허용, write는 service_role만.
- 향후 사용자 개인 데이터 테이블(알림 구독 등)을 만들면 **반드시 RLS 적용**(본인만 접근).

### 상업적 이용 주의
- **Vercel Hobby는 비상업 전용.** 광고를 붙이는 순간부터는 Vercel Pro 또는 Cloudflare Pages(무료·상업 허용)로 이전 검토. Supabase 무료는 상업적 이용 허용.

---

## 6. Session Continuity

**세션 간 맥락을 잃지 않기 위한 규약.**

- 세션 시작 시: `/resume` 커맨드로 `.claude/sessions/` 최근 파일 읽고 맥락 복원.
- 세션 종료 시: `/wrap` 커맨드로 `.claude/sessions/YYYY-MM-DD.md`(KST) 작성.
- 진행 중인 큰 작업의 명세서는 `.claude/PROMPT_*.md`에 보관.
- 현재 활성 명세서: `.claude/PROMPT_build_mvp.md` (MVP 빌드 프롬프트, Phase 1~7).

### 디렉토리 구조 메모
- `app/`: Next.js App Router (페이지 + Route Handler)
- `lib/`: supabase 클라이언트, 포맷터, 지역코드, 타입
- `scripts/`: `ingest.ts`(국토부 수집), `seed.ts`(데모 데이터)
- `supabase/migrations/`: 스키마 + RLS + 시그널 뷰
- `.github/workflows/`: `ingest.yml`(매일 수집 cron)
- `.claude/`: 프롬프트, 세션 로그, 커맨드 정의

---

## Project Context

**배포:** (Vercel, main 브랜치 자동 배포 — URL 확정 시 기입)

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase(Postgres) · GitHub Actions(수집) · fast-xml-parser · Vercel

**Key Files:**
```
app/page.tsx                    ← 오늘의 시그널(일별). ISR 적용 필수.
app/complex/page.tsx            ← 단지 조회/검색
app/top/page.tsx                ← 최근 7일 TOP
app/digest/page.tsx             ← 카페 복붙 배포 (성장 엔진)
app/api/search/route.ts         ← 단지 검색
app/api/digest/route.ts         ← 다이제스트 텍스트
lib/supabase.ts                 ← anon/서버 클라이언트 분리. service_role 서버 전용.
lib/regions.ts                  ← 법정동 코드
scripts/ingest.ts               ← 국토부 → 정제 → upsert. 정제 규칙은 부록 표로 검증.
scripts/seed.ts                 ← API 키 없는 데모 데이터
supabase/migrations/0001_init.sql ← 스키마 + RLS + signals_v
.github/workflows/ingest.yml    ← 매일 KST 05:10 수집
```

**Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`(서버/Actions 전용) · `MOLIT_SERVICE_KEY`(공공데이터포털)

**Commands:** `pnpm dev` · `pnpm build` · `pnpm lint` · `tsx scripts/seed.ts` · `tsx scripts/ingest.ts --sgg=11740 --ym=YYYYMM`

---

## 정제·시그널 규칙 레퍼런스

코드를 수정할 때마다 이 규칙들이 살아있는지 확인:

| 규칙 | 왜 중요한가 |
|---|---|
| 취소거래는 **삭제 금지**, `canceled=true` 플래그로 보관 | 업/다운계약 추적 데이터 손실 방지. 단, 시그널·화면에선 제외. |
| 직거래는 **보존**하되 화면·다이제스트 기본 제외(토글) | 시세 왜곡 방지하되 원본 데이터는 유지. |
| `raw_key`로 **중복 차단** (`onConflict` upsert) | 당월을 매일 재수집해도 중복 0. 동일 거래 지연 등록 대응. |
| 전고점·직전가는 **해당 거래 '이전'** 거래만으로 | 자기 자신을 포함하면 신고가 판정이 깨진다. |
| 시그널은 **Postgres 뷰**에서 계산 | 앱 루프 금지 — 무료 함수/egress 낭비. |
| `service_role`은 **서버/Actions 전용** | 브라우저 노출 시 DB 전체 쓰기 가능 = 치명적. |
| 평형 = `round(area * 0.40)` (추정) | 정확값 아님. 단지별 매핑 도입 전까지 **일관 사용**. |
| 색상: 신고가/상승=**빨강**, 하락/직거래=파랑 | 한국 관습(해외와 반대). 절대 뒤집지 말 것. |
| 일별 화면 **ISR 적용** | Vercel 함수·Supabase egress 무료 한도 방어. |
| 출처 표기 + "정부 공식 아님" 면책 푸터 유지 | 국토부 데이터 이용 조건. 지우지 말 것. |

---

**These guidelines are working if:** 무료 티어 한도를 넘기지 않고, 시그널이 정확하며(신고가/반등 오탐 없음),
독자가 매일 아침 "오늘 뭐 터졌나"를 빠르게 확인하고 카페에 그대로 퍼나를 수 있다.
