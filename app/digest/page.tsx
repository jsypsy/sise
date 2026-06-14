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
  return <DigestClient digest={digest} />;
}
