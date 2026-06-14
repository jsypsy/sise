import type { Metadata } from "next";
import TopClient from "./top-client";

export const metadata: Metadata = {
  title: "지역별 TOP",
  description:
    "최근 7일 신규 등록된 아파트 신고가·반등을 지역별로. 국토부 실거래가 기반.",
  alternates: { canonical: "/top" },
  openGraph: { title: "지역별 TOP · 시세", url: "/top" },
};

export default function TopPage() {
  return <TopClient />;
}
