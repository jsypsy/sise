import { ADSENSE_CLIENT } from "@/lib/site";

// /ads.txt — 승인 후 게재 시 필요한 광고 권한 선언.
// NEXT_PUBLIC_ADSENSE_CLIENT(ca-pub-…)가 설정되면 자동으로 올바른 라인을 출력.
// 미설정이면 빈 응답(잘못된 ads.txt를 미리 노출하지 않음).
export function GET() {
  if (!ADSENSE_CLIENT) {
    return new Response("", { status: 204 });
  }
  // ca-pub-XXXX → pub-XXXX (ads.txt 형식)
  const pub = ADSENSE_CLIENT.replace(/^ca-/, "");
  const body = `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
