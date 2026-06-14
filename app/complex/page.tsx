import type { Metadata } from "next";
import { Suspense } from "react";
import ComplexClient from "./complex-client";

export const metadata: Metadata = {
  title: "단지 조회",
  description:
    "아파트 단지별 실거래가 전체 이력·차트·신고가 추이를 조회. 국토부 실거래가 기반.",
  alternates: { canonical: "/complex" },
  openGraph: { title: "단지 조회 · 시세", url: "/complex" },
};

export default function ComplexPage() {
  return (
    <Suspense>
      <ComplexClient />
    </Suspense>
  );
}
