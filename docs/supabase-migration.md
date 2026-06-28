# Supabase 서울 이전 런북

목적: DB를 뭄바이(ap-south-1) → 서울(ap-northeast-2)로 옮겨 한국 사용자/함수와 같은 지역에 둠.
**옛 프로젝트는 검증 끝날 때까지 그대로 둔다(복사지 이동 아님 → 안전).**

> ⚠️ 순서 주의: **스키마 → 데이터 → 키 교체 → 컷오버.**
> 키부터 바꾸면 앱이 *빈 DB*를 보게 된다.

## 1. 새 프로젝트(서울)에 스키마 만들기
새 Supabase → SQL Editor → `supabase/migrations/`의 **0001~0015를 순서대로** 실행.
(또는 로컬에서 `supabase db push`)
→ 테이블·RLS·뷰(signals_mv)·함수(get_umds, search_apts_trgm, get_apts_in_sgg)·인덱스 전부 생성. 데이터는 아직 비어있음.

## 2. 데이터 옮기기 (transactions · historical_peaks · feedback)
두 프로젝트의 **연결 문자열**이 필요: 각 프로젝트 → Settings → Database → Connection string(URI, 비밀번호 포함).
로컬에 Postgres 클라이언트(`pg_dump`, `psql`) 필요(미설치면 `brew install libpq` 등).

```bash
# (1) 옛(뭄바이)에서 데이터만 덤프 — 3개 테이블, MV는 제외
pg_dump --data-only --no-owner --no-privileges \
  -t public.transactions -t public.historical_peaks -t public.feedback \
  "<옛_프로젝트_CONNECTION_STRING>" > sise_data.sql

# (2) 새(서울)에 복원
psql "<새_프로젝트_CONNECTION_STRING>" -f sise_data.sql
```

이어서 새(서울) SQL Editor에서 **파생 뷰 새로고침**:
```sql
refresh materialized view signals_mv;
```

검증(새 프로젝트 SQL Editor):
```sql
select count(*) from transactions;          -- 옛 프로젝트와 같은 수인지
select count(*) from historical_peaks;
select * from get_apts_in_sgg('11680') limit 3;  -- 함수 동작
```

## 3. 키 교체 — 새 URL·키로 **전부** (이게 핵심)
새 프로젝트 → Settings → API에서 새 값 복사:
- **GitHub Actions secrets** (수집/ingest):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (워크플로가 쓰는 이름 그대로 — `.github/workflows/` 참고)
- **Vercel** (웹앱): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **로컬** `.env.local`
- **Cloudflare** (이전 시): 빌드 변수 `NEXT_PUBLIC_SUPABASE_URL`, `_ANON_KEY`

> `SUPABASE_SERVICE_ROLE_KEY`는 **GitHub Actions에만**(웹앱/Cloudflare엔 X). `docs/env.md` 참고.

## 4. 컷오버 + 검증
1. **Vercel 재배포** → 사이트가 서울 DB를 봄.
2. 홈/단지 조회/검색/관심단지 데이터 정상인지 확인.
3. **ingest 수동 1회** 실행해서 새 DB에 써지는지 확인
   (`tsx scripts/ingest.ts --sgg=11740 --ym=YYYYMM` 또는 Actions 수동 트리거).
4. 며칠 정상 운영 확인되면 **옛(뭄바이) 프로젝트 삭제.**

## 주의
- 옛 프로젝트 **유지**(롤백 가능하게).
- transactions가 클 수 있어 덤프/복원에 시간 걸릴 수 있음.
- 이전 중 **ingest 워크플로 일시 중지** 권장(양쪽에 쓰면 꼬임). 컷오버 후 재개.
- 행정구역 개편(2026-07-01) 작업과 겹치면 순서 조정(`.claude/PENDING_district_reform_2026-07.md`).
