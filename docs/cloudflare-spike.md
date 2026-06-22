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

## 롤백
이 브랜치를 버리면 끝. `main`에는 아무 변경 없음.
