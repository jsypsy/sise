# 시세 (sise)

국토교통부 실거래가 기반 아파트 매매 **일간 시그널** 서비스.
매일 신고가·반등 시그널을 빠르게 확인하고, 카페·단톡방에 바로 복붙할 수 있는 형태로 제공합니다.

> 범위: 아파트 매매 실거래 전용 (전세·월세·빌라·오피스텔 제외)

---

## 기술 스택

- **Next.js 15** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (Postgres) — DB + RLS
- **GitHub Actions** — 매일 KST 05:10 실거래가 수집 cron
- **Vercel** — 웹 호스팅 (ISR 정적 생성)

---

## 로컬 개발 환경 세팅

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local`을 열어 아래 값을 채웁니다:

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(공개) 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 — **서버·Actions 전용, 절대 NEXT_PUBLIC_ 금지** |
| `MOLIT_SERVICE_KEY` | 공공데이터포털 국토부 API 인증키(Decoding). 없으면 seed 데모로 대체 가능 |

### 3. Supabase 스키마 적용

Supabase 대시보드 → **SQL Editor** → 새 쿼리에 아래 파일 내용을 붙여넣고 실행:

```
supabase/migrations/0001_init.sql
```

실행 후 확인:
- `Table Editor`에서 `transactions` 테이블이 보여야 합니다.
- `SQL Editor`에서 아래 쿼리가 오류 없이 실행되어야 합니다:
  ```sql
  select * from signals_v limit 1;
  ```

### 4. 데모 데이터 적재 (MOLIT 키 없을 때)

```bash
npx tsx scripts/seed.ts
```

서울·수도권 14개 단지의 6개월치 합성 거래 수백 건이 적재됩니다.

### 5. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인.

---

## 실거래 데이터 수집

```bash
# 특정 시군구·월만 수집
npx tsx scripts/ingest.ts --sgg=11680 --ym=202605

# 인자 없으면 lib/regions.ts 전체 × 당월 수집
npx tsx scripts/ingest.ts
```

`MOLIT_SERVICE_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`가 환경변수에 있어야 합니다.

---

## 배포

### Vercel

1. Vercel에서 이 레포를 연결합니다.
2. Environment Variables에 `.env.local`의 4개 변수를 등록합니다.
3. main 브랜치 push 시 자동 배포됩니다.

> **주의:** Vercel Hobby 플랜은 비상업적 이용 전용입니다.
> 광고 수익화 시점에는 Vercel Pro 또는 Cloudflare Pages(무료·상업 허용)로 이전을 검토하세요.

### GitHub Actions (수집 cron)

1. GitHub 레포 → **Settings → Secrets and variables → Actions** 에서 아래 secrets를 등록합니다:

   | Secret 이름 | 값 |
   |---|---|
   | `SUPABASE_URL` | Supabase 프로젝트 URL |
   | `SUPABASE_ANON_KEY` | Supabase anon(공개) 키 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 |
   | `MOLIT_SERVICE_KEY` | 공공데이터포털 인증키 **(Decoding, URL 디코딩된 값)** |
2. `.github/workflows/ingest.yml`이 매일 KST 05:10(UTC 20:10)에 자동 실행됩니다.
3. 첫 실행은 수동으로: Actions 탭 → `ingest` workflow → **Run workflow**.

---

## 아키텍처 원칙 (무료 티어 가드레일)

| 원칙 | 이유 |
|---|---|
| 수집은 GitHub Actions | Vercel Hobby cron은 10초 제한·하루 1회 — 다지역 루프 불가 |
| 시그널 계산은 Postgres 뷰 | 앱에서 루프 돌리면 egress 초과 |
| 일별 화면은 ISR (`revalidate=86400`) | 방문자가 CDN을 치게 함 — DB 직격 방지 |
| `service_role` 키는 서버 전용 | 브라우저 노출 시 DB 전체 쓰기 가능 |

---

## 면책 고지

본 서비스는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로 정부 공식 서비스가 아니며,
정보의 정확성·완전성을 보장하지 않습니다. 평형은 추정치이며 투자 판단의 책임은 이용자에게 있습니다.
