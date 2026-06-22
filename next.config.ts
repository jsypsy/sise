import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Cloudflare(OpenNext) 로컬 개발 시 getCloudflareContext() 바인딩을 활성화.
// 프로덕션 빌드/Vercel에선 사실상 no-op이라 영향 없음.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
