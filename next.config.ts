import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Cloudflare(OpenNext) 로컬 개발용 바인딩. 개발 모드에서만 동적 import →
// Vercel/프로덕션 빌드에선 @opennextjs/cloudflare를 아예 불러오지 않아 영향 0.
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) =>
    initOpenNextCloudflareForDev()
  );
}
