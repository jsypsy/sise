# Cloudflare 이전 스파이크 (OpenNext)

목적: **Vercel은 그대로 두고**, Cloudflare Workers에서 이 Next.js 앱이 잘 도는지(특히 ISR) 검증한다.
브랜치 `claude/cloudflare-spike`에만 설정이 있고, `main`(Vercel)에는 영향 없음.

## 들어간 변경
- `@opennextjs/cloudflare`, `wrangler` (devDeps)
- `open-next.config.ts` — ISR/SSG 결과를 **R2 증분 캐시**에 저장(무료티어 방어 = Vercel ISR과 동일 목적)
- `wrangler.jsonc` — worker 엔트리, `nodejs_compat`, assets, R2 바인딩 `NEXT_INC_CACHE_R2_BUCKET`
- `next.config.ts` — `initOpenNextCloudflareForDev()` (로컬 dev 바인딩; 프로덕션 no-op)
- scripts: `cf:preview`, `cf:deploy`, `cf:typegen`

## 사전 준비 (한 번)
1. Cloudflare 계정 + `npx wrangler login`
2. ISR 캐시용 R2 버킷 생성:
   ```
   npx wrangler r2 bucket create sise-isr-cache
   ```
3. 로컬 미리보기용 변수: `.dev.vars.example` → `.dev.vars` 복사 후 값 채우기
   (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / R2_PUBLIC_URL / SITE_URL)

## 로컬에서 "되는지" 확인
```
pnpm install
pnpm cf:preview     # OpenNext 빌드 → workerd 로컬 런타임으로 실행
```
- 홈/단지/블로그/가이드 페이지가 뜨는지
- **ISR 확인**: 같은 페이지를 두 번 열어 두 번째가 캐시(빠름)인지, revalidate 주기 후 갱신되는지
- 콘솔에 nodejs_compat 관련 에러 없는지

## 실제 배포 (검증되면)
```
# 런타임 시크릿 주입(예시)
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
# ...필요 변수 전부

pnpm cf:deploy
```
배포 후 `*.workers.dev` URL로 먼저 검증 → 문제없으면 도메인(sise.today)을 Cloudflare로 전환.

## 점검 포인트 / 알려진 리스크
- **ISR(무료티어 방어)**: R2 증분 캐시가 실제로 먹는지 꼭 확인. 안 먹으면 방문마다 렌더 → 한도 위험.
- **빌드(중요)**: `opennextjs-cloudflare build`는 내부적으로 **`npm run build`를 그대로 호출**한다 = 현재 `next build --turbopack`. 즉 Cloudflare 빌드도 Turbopack으로 돈다. Next 빌드 자체는 통과해도, 그 뒤 OpenNext 변환 단계가 **Turbopack 산출물과 호환되지 않으면** 실패할 수 있음. 그 경우 `package.json`의 `build`를 `next build`(Turbopack 제거)로 바꿔 재시도. (Turbopack은 속도용일 뿐이라 Vercel도 빼도 무방.)
  - 참고: 이 샌드박스에선 네트워크 차단으로 `next/font`(Gowun Batang) 구글폰트 다운로드에서 빌드가 멈췄음 — **환경 한계이며 Cloudflare 설정 문제 아님.** 네트워크 되는 로컬/CI에선 통과 예상.
- **이미지**: `next/image` 최적화는 Vercel 전용. 현재 앱은 next/image 미사용으로 보이나, 추가 시 Cloudflare용 loader 필요.
- **환경변수**: `NEXT_PUBLIC_*`는 빌드 타임에 인라인됨 → cf:preview/배포 빌드 시점에 값이 있어야 함.
- **ads.txt / 도메인**: 애드센스는 도메인 기준이라 호스팅 바꿔도 승인 유지. 단 ads.txt를 새 호스트에도 동일하게 올릴 것.

## 런타임 호환성 감사 결과 (app/·lib/ 기준)
- **Node 전용 API 사용 0** — fs/path/crypto/Buffer/__dirname 등 없음 → Workers 런타임 호환 ✓
- **service_role 키 불필요** — `createServiceClient`는 lib에 정의만 있고 **app/에서 호출 안 함**. 워커에 `SUPABASE_SERVICE_ROLE_KEY` 넣지 말 것(보안 이득). ingest/스크립트(GitHub Actions)에서만 사용.
- **aws4fetch(R2 서명)** — scripts/에만. 워커 무관.

### 워커가 실제로 필요로 하는 환경변수 (확정)
**빌드 변수 (NEXT_PUBLIC_*, 빌드 시 인라인):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ADSENSE_CLIENT`(승인 후)

**런타임 시크릿 (Secret):**
- `REVALIDATE_SECRET` — `/api/revalidate`(ingest 후 ISR 갱신 트리거)에 필요
- (선택) `RESEND_API_KEY`, `FEEDBACK_EMAIL_TO`, `FEEDBACK_EMAIL_FROM`, `FEEDBACK_WEBHOOK_URL` — 피드백 폼. 없으면 피드백 저장만(이메일 미발송).

**워커에 넣지 말 것:** `SUPABASE_SERVICE_ROLE_KEY`, `MOLIT_SERVICE_KEY`, R2 액세스 키 — 전부 GitHub Actions 스크립트 전용.

### ⚠️ On-demand ISR 재검증 (전환 전 결정 필요)
- `/api/revalidate`는 `revalidatePath("/", "layout")`(on-demand)를 호출 — ingest 후 즉시 페이지 갱신용.
- **Cloudflare/OpenNext에서 on-demand 재검증은 incrementalCache(R2)만으론 부족**하고 **queue + tagCache 추가 설정**(예: D1 tagCache + DO queue)이 필요. 현재 `open-next.config.ts`엔 incrementalCache만 있음.
- 영향:
  - **시간기반 ISR(`revalidate=N`)은 R2 캐시로 정상 동작** → 트라이얼/기본 서빙엔 문제 없음.
  - 단 **on-demand 갱신은 no-op**이 될 수 있어, ingest 직후 즉시 반영이 안 되고 각 페이지 revalidate 주기(홈 86400=24h, 일부 3600=1h)만큼 늦어질 수 있음.
- 대응(택1, 도메인 전환 전):
  - **(A)** open-next.config에 D1 tagCache + DO queue 추가 → on-demand 복원(Vercel과 동등, 설정 늘어남).
  - **(B)** on-demand 의존 제거 + 페이지 revalidate 주기 단축(예: 홈 86400→3600) → 간단하지만 최대 1h 지연.
- 트라이얼 단계: 그대로 두고 **페이지 서빙 + 시간기반 ISR**만 확인. 전환 전에 (A)/(B) 결정.

## 롤백
이 브랜치를 버리면 끝. `main`에는 아무 변경 없음.

---

## 부록) 소스 없이 — 브라우저만으로 배포 (Git 연동)

로컬에 코드가 없어도 Cloudflare 대시보드에서 GitHub 레포를 연결해 배포할 수 있다.
필요한 설정(wrangler.jsonc, open-next.config.ts, 스크립트)은 이미 레포에 들어있음.

1. **dash.cloudflare.com → Workers & Pages → Create → Workers → Connect to Git**
2. GitHub `jsypsy/sise` 연결, 브랜치 = `claude/cloudflare-spike`(테스트). 나중에 운영은 `main`.
3. **빌드 설정**
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler deploy`
   - (worker 이름·R2 바인딩은 레포의 `wrangler.jsonc`에서 자동 인식)
4. **R2 버킷 생성** (한 번): 대시보드 → R2 → Create bucket → 이름 `sise-isr-cache`
5. **환경변수 등록 ⚠️ "빌드 타임"으로** — `NEXT_PUBLIC_*`는 빌드 시 코드에 인라인되므로 런타임 시크릿이 아니라 **빌드 변수**로 넣어야 함:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_R2_PUBLIC_URL`
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_ADSENSE_CLIENT` (승인 후)
   - **런타임 시크릿**(빌드 변수 아님 → Secret으로): `REVALIDATE_SECRET`(필수), 피드백용 `RESEND_API_KEY` 등(선택). **`SUPABASE_SERVICE_ROLE_KEY`는 넣지 말 것** — 워커가 사용하지 않음(아래 감사 결과 참고).
6. **Save & Deploy** → 빌드 로그 확인 → 생성된 `*.workers.dev` URL에서 테스트
7. 잘 되면: `main`에 머지 → production 브랜치를 `main`으로 → **Custom Domain(sise.today)** 연결 (광고 ON 직전에)

> 빌드 스크립트는 이 브랜치에서 Turbopack을 빼고 `next build`로 바꿔둠 → OpenNext 변환 호환성 ↑.


> 팁: Cloudflare에서 **production 브랜치를 바꾼 뒤**엔 "Retry deployment"(이전 빌드 재실행)로는
> 새 브랜치가 안 빌드된다. 그 브랜치에 **새 커밋이 푸시될 때** 새 빌드가 자동으로 돈다.
