export const revalidate = 86400;

import type { Metadata } from "next";
import { buildDigest } from "@/lib/digest";
import DigestClient from "../digest-client";

export const metadata: Metadata = {
  title: "다이제스트",
  description:
    "오늘 새로 등록된 아파트 신고가·반등을 카페·단톡방에 바로 복붙·이미지로 공유.",
  alternates: { canonical: "/digest" },
  openGraph: { title: "다이제스트 · 시세", url: "/digest" },
};

export default async function DigestPage() {
  const digest = await buildDigest();
  return (
    <div>
      <DigestClient digest={digest} />
      <section className="mt-8 border-t border-[var(--line)] pt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-2">다이제스트란?</h2>
        <p className="mb-2">
          매일 아침 국토교통부에 새로 등록된 아파트 실거래 중 신고가와 반등 거래만 추려 한 장으로 요약한
          것입니다. 복사 버튼으로 텍스트를 부동산 카페나 단톡방에 그대로 붙여넣거나, 이미지로 저장해
          공유할 수 있습니다.
        </p>
        <p>
          집계는 등록일 기준이며 중개거래만 포함합니다(직거래·취소거래 제외). 회복률은 전고점 대비 현재
          거래가의 비율로, 100%를 넘으면 신고가입니다.
        </p>
      </section>
    </div>
  );
}
