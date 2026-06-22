import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Cloudflare(Workers) 배포용 OpenNext 설정.
// 핵심: ISR/정적 생성 결과를 R2(NEXT_INC_CACHE_R2_BUCKET)에 캐시한다.
// → 방문자가 매번 함수/DB를 치지 않고 캐시를 받게 해 무료티어 방어를 유지(Vercel ISR과 동일 목적).
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
