import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "가이드",
  description: "아파트 실거래가·신고가·반등 시그널을 쉽게 이해하는 가이드. 용어와 보는 법을 정리했습니다.",
  alternates: { canonical: "/guide" },
};

export default function GuideIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">가이드</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        실거래가와 시그널(신고가·반등)을 쉽게 이해하는 글 모음입니다.
      </p>

      <ul className="space-y-3">
        {GUIDES.map((g) => (
          <li key={g.slug} className="border-b border-[var(--line)] pb-3">
            <Link href={`/guide/${g.slug}`} className="group block">
              <h2 className="font-semibold group-hover:underline">{g.title}</h2>
              <p className="text-sm text-[var(--ink-soft)] mt-0.5">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
