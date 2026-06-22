import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_ORDER, postsByCategory } from "@/lib/blog";

export const metadata: Metadata = {
  title: "블로그",
  description:
    "아파트 실거래가로 시장을 읽는 법, 신고가·반등 시그널 활용, 부동산 개념과 뉴스를 쉽게 풀어쓴 글 모음.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">블로그</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        실거래가로 시장을 읽는 법, 시그널 활용, 부동산 개념과 뉴스를 쉽게 풀어쓴 글 모음입니다.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const posts = postsByCategory(cat);
        if (posts.length === 0) return null;
        return (
          <section key={cat} className="mb-8">
            <h2 className="text-sm font-bold text-[var(--ink-soft)] tracking-wide mb-3 pb-1 border-b-2 border-[var(--line-strong)]">
              {CATEGORIES[cat]}
            </h2>
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.slug} className="border-b border-[var(--line)] pb-3">
                  <Link href={`/blog/${p.slug}`} className="group block">
                    <h3 className="font-semibold group-hover:underline">{p.title}</h3>
                    <p className="text-sm text-[var(--ink-soft)] mt-0.5">{p.description}</p>
                    <p className="text-xs text-[var(--ink-soft)] mt-1 tabular-nums">{p.date}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
