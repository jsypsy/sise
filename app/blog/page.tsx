import type { Metadata } from "next";
import Link from "next/link";
import { POSTS_SORTED } from "@/lib/blog";

export const metadata: Metadata = {
  title: "블로그",
  description:
    "아파트 실거래가로 시장을 읽는 법, 신고가·반등 시그널 활용, 부동산 개념을 쉽게 풀어쓴 연재 글 모음.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">블로그</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        실거래가로 시장을 읽는 법, 시그널 활용, 부동산 개념을 쉽게 풀어쓴 연재입니다.
      </p>

      <ul className="space-y-3">
        {POSTS_SORTED.map((p) => (
          <li key={p.slug} className="border-b border-[var(--line)] pb-3">
            <Link href={`/blog/${p.slug}`} className="group block">
              <h2 className="font-semibold group-hover:underline">{p.title}</h2>
              <p className="text-sm text-[var(--ink-soft)] mt-0.5">{p.description}</p>
              <p className="text-xs text-[var(--ink-soft)] mt-1 tabular-nums">{p.date}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
