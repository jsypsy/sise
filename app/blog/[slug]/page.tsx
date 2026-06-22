import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, POSTS_SORTED, getPost } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return { title: { absolute: "블로그 | 시세" }, robots: { index: false } };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: {
      type: "article",
      title: `${p.title} · 시세`,
      description: p.description,
      url: `/blog/${p.slug}`,
      publishedTime: p.date,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) notFound();

  const others = POSTS_SORTED.filter((o) => o.slug !== p.slug).slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    inLanguage: "ko-KR",
    url: `${SITE_URL}/blog/${p.slug}`,
    author: { "@type": "Organization", name: "시세" },
    publisher: { "@type": "Organization", name: "시세" },
  };

  return (
    <article className="max-w-none text-sm leading-relaxed">
      <nav className="text-xs text-[var(--ink-soft)] mb-3">
        <Link href="/blog" className="hover:underline">블로그</Link>
        <span className="mx-1">›</span>
        <span>{p.title}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight mb-1">{p.title}</h1>
      <p className="text-xs text-[var(--ink-soft)] mb-4 tabular-nums">{p.date}</p>
      <p className="mb-5">{p.intro}</p>

      {p.sections.map((s, i) => (
        <section key={i} className="mb-5">
          <h2 className="text-base font-semibold mb-1">{s.heading}</h2>
          {s.paras.map((para, j) => (
            <p key={j} className="mb-2">{para}</p>
          ))}
        </section>
      ))}

      <div className="border-t border-[var(--line)] pt-4 mt-6">
        <p className="text-sm font-semibold mb-2">다른 글</p>
        <ul className="space-y-1">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/blog/${o.slug}`} className="text-sm text-[var(--blue)] hover:underline">
                {o.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)] mt-4">
          <Link href="/blog" className="hover:underline">← 블로그 목록</Link>
          <span className="mx-2">·</span>
          <Link href="/guide" className="hover:underline">용어 가이드</Link>
        </p>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}
