# 시세 (sise)

> **국토부 실거래가 기반 아파트 매매 일간 시그널** — [sise.today](https://sise.today)

매일 신고가·반등 단지를 빠르게 확인하고, 카페·단톡방에 바로 복붙할 수 있습니다.

---

## 주요 기능

- **오늘의 시그널** — 전국 신고가·반등 거래 일별 목록
- **단지 상세** — 단지별 실거래 이력 + 가격 추이
- **TOP 7일** — 최근 7일 시그널 랭킹
- **다이제스트** — 카페·단톡방 복붙용 텍스트 자동 생성

> 범위: 아파트 매매 실거래 전용 (전세·월세·빌라·오피스텔 제외)

---

## 기술 스택

| | |
|---|---|
| **프론트엔드** | Next.js 15 (App Router · TypeScript · Tailwind CSS) |
| **DB** | Supabase (Postgres + RLS) |
| **수집** | GitHub Actions — 매일 KST 04:10 cron |
| **호스팅** | Vercel (ISR 정적 생성) |

---

## 아키텍처 원칙

| 원칙 | 이유 |
|---|---|
| 수집은 GitHub Actions | Vercel cron은 제한적 — 전국 다지역 루프 불가 |
| 시그널 계산은 Postgres 뷰 | 앱 루프 없이 DB에서 처리, egress 절약 |
| 일별 화면은 ISR (`revalidate=86400`) | 방문자가 CDN 히트 — DB 직격 방지 |
| `service_role` 키는 서버 전용 | 브라우저 절대 노출 금지 |

---

## 로컬 개발

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
```

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(공개) 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | service role 키 — **서버·Actions 전용** |
| `MOLIT_SERVICE_KEY` | 공공데이터포털 국토부 API 인증키 (Decoding) |

### 3. Supabase 스키마 적용

Supabase 대시보드 → SQL Editor → `supabase/migrations/0001_init.sql` 실행

### 4. 데모 데이터 (MOLIT 키 없을 때)

```bash
npx tsx scripts/seed.ts
```

서울·수도권 14개 단지의 합성 거래 수백 건이 적재됩니다.

### 5. 개발 서버

```bash
npm run dev
# http://localhost:3000
```

---

## 데이터 수집

```bash
# 특정 시군구·월만 수집
npx tsx scripts/ingest.ts --sgg=11680 --ym=202605

# 전국 × 최근 2개월 (기본값)
npx tsx scripts/ingest.ts
```

`MOLIT_SERVICE_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`가 환경변수에 있어야 합니다.

---

## 배포

### Vercel

1. 이 레포를 Vercel에 연결합니다.
2. Environment Variables에 위 환경변수 4개를 등록합니다.
3. main 브랜치 push 시 자동 배포됩니다.

### GitHub Actions (수집 cron)

레포 → Settings → Secrets and variables → Actions에 아래 secrets를 등록합니다:

| Secret | 값 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | service role 키 |
| `MOLIT_SERVICE_KEY` | 공공데이터포털 인증키 **(URL 디코딩된 값)** |
| `REVALIDATE_SECRET` | Vercel ISR 재검증 비밀키 |

매일 KST 04:10(UTC 19:10)에 자동 실행됩니다.

---

## 면책 고지

본 서비스는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로 정부 공식 서비스가 아니며,
정보의 정확성·완전성을 보장하지 않습니다. 평형은 추정치이며 투자 판단의 책임은 이용자에게 있습니다.
