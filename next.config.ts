import type { NextConfig } from "next";

// 전역 보안 헤더(하드닝). CSP는 AdSense의 inline/eval 의존성 때문에 보류 —
// 클릭재킹·MIME 스니핑·리퍼러 누출 방어 위주.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
