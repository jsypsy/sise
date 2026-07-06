import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { REGIONS } from "@/lib/regions";
import ComplexClient from "./complex-client";

export const metadata: Metadata = {
  title: "단지 조회",
  description:
    "아파트 단지별 실거래가 전체 이력·차트·신고가 추이를 조회. 국토부 실거래가 기반, 전국 시군구별 단지 목록.",
  alternates: { canonical: "/complex" },
  openGraph: { title: "단지 조회 · 시세", url: "/complex" },
};

// 지역 디렉터리는 정적 데이터(REGIONS)라 DB 비용 0 — 검색창뿐이던 페이지에
// 크롤러/JS 미실행 환경에서도 의미 있는 콘텐츠와 내부 링크를 제공한다.
export default function ComplexPage() {
  return (
    <div>
      <Suspense>
        <ComplexClient />
      </Suspense>

      <section className="mt-10 border-t border-[var(--line)] pt-5">
        <h2 className="text-base font-semibold mb-1">지역에서 찾아보기</h2>
        <p className="text-xs text-[var(--ink-soft)] mb-4">
          시군구를 선택하면 그 지역에서 최근 거래된 아파트 단지 목록을 볼 수 있습니다. 단지를 선택하면
          국토부 실거래가 전체 이력과 시세 추이 차트, 평형별 최고가를 확인할 수 있습니다.
        </p>
        <div className="space-y-4">
          {Object.entries(REGIONS).map(([sido, sggs]) => (
            <div key={sido}>
              <h3 className="text-sm font-semibold text-[var(--ink-soft)] mb-1 pb-1 border-b border-[var(--line)]">
                {sido}
              </h3>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(sggs).map(([cd, name]) => (
                  <li key={cd}>
                    <Link href={`/complex/${cd}`} className="text-sm hover:underline">
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
