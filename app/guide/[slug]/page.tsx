import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/lib/guides";
import { OG_IMAGE } from "@/lib/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: { absolute: "가이드 | 시세" }, robots: { index: false } };
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: { title: `${g.title} · 시세`, description: g.description, url: `/guide/${g.slug}`, images: [OG_IMAGE] },
  };
}

export default async function GuidePage({ params }: { params: Params }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  return (
    <article className="max-w-none text-sm leading-relaxed">
      <nav className="text-xs text-[var(--ink-soft)] mb-3">
        <Link href="/guide" className="hover:underline">가이드</Link>
        <span className="mx-1">›</span>
        <span>{g.title}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight mb-3">{g.title}</h1>
      <p className="mb-5">{g.intro}</p>

      {g.sections.map((s, i) => (
        <section key={i} className="mb-5">
          <h2 className="text-base font-semibold mb-1">{s.heading}</h2>
          {s.paras.map((p, j) => (
            <p key={j} className="mb-2">{p}</p>
          ))}
        </section>
      ))}

      <div className="border-t border-[var(--line)] pt-4 mt-6">
        <p className="text-sm font-semibold mb-2">다른 가이드</p>
        <ul className="space-y-1">
          {GUIDES.filter((o) => o.slug !== g.slug).map((o) => (
            <li key={o.slug}>
              <Link href={`/guide/${o.slug}`} className="text-sm text-[var(--blue)] hover:underline">
                {o.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)] mt-4">
          <Link href="/" className="hover:underline">← 홈으로</Link>
        </p>
      </div>
    </article>
  );
}
