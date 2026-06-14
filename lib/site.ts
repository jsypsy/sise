// 정식 도메인 미정 — NEXT_PUBLIC_SITE_URL로 주입하고, 없으면 현재 Vercel 주소로 폴백.
// 도메인 확정 시 이 환경변수만 바꾸면 metadataBase·sitemap·robots·OG 절대경로가 전부 따라온다.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sise-ten.vercel.app"
).replace(/\/$/, "");

export const SITE_NAME = "시세";
export const SITE_TAGLINE = "아파트 매매 실거래 시그널";
export const SITE_DESCRIPTION =
  "국토부 실거래가 기반 매일 아파트 신고가·반등 시그널. 카페·단톡방에 바로 복붙·이미지로 공유.";
