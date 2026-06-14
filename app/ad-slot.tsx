"use client";

import { useEffect } from "react";
import { ADSENSE_CLIENT } from "@/lib/site";

// 광고 슬롯 스캐폴드. NEXT_PUBLIC_ADSENSE_CLIENT 미설정이면 null 반환(아무것도 안 그림).
// 승인·배치 단계에서 페이지에 <AdSlot slot="123..." /> 형태로 꽂으면 된다.
export default function AdSlot({ slot, className }: { slot: string; className?: string }) {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* 광고 로드 실패는 무시 */
    }
  }, []);

  if (!ADSENSE_CLIENT) return null;

  return (
    <ins
      className={`adsbygoogle block ${className ?? ""}`}
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
