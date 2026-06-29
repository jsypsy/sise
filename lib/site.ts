// 정식 도메인: sise.today. NEXT_PUBLIC_SITE_URL로 override 가능(프리뷰/스테이징용),
// 없으면 프로덕션 도메인으로 폴백 → metadataBase·sitemap·robots·OG 절대경로가 따라온다.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sise.today"
).replace(/\/$/, "");

export const SITE_NAME = "시세";
export const SITE_TAGLINE = "아파트 매매 실거래 시그널";
export const SITE_DESCRIPTION =
  "국토부 실거래가 기반 매일 아파트 신고가·반등 시그널. 카페·단톡방에 바로 복붙·이미지로 공유.";

// Google AdSense 퍼블리셔 ID(ca-pub-XXXXXXXX). 미설정이면 광고 스크립트·슬롯이 전부 비활성.
// 승인 후 Vercel/Cloudflare 환경변수 NEXT_PUBLIC_ADSENSE_CLIENT에 주입하면 켜진다.
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

// Google Analytics 4 측정 ID(G-XXXXXXXXXX). 측정 ID는 클라이언트 HTML에 노출되는 공개값이라
// 레포에 기본값으로 둬도 무방(서비스 키와 달리 비밀이 아님). env로 override 가능.
// 빈 문자열로 설정하면(NEXT_PUBLIC_GA_ID="") 분석 스크립트가 로드되지 않는다 — 프리뷰 제외용.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-KZ7JZF0D97";
