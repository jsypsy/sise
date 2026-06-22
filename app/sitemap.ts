import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { REGIONS } from "@/lib/regions";
import { GUIDES } from "@/lib/guides";
import { POSTS_SORTED } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = [
    { path: "/", priority: 1.0, changeFrequency: "daily" as const },
    { path: "/digest", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/top", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/complex", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/guide", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/blog", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.4, changeFrequency: "monthly" as const },
    ...GUIDES.map((g) => ({ path: `/guide/${g.slug}`, priority: 0.5, changeFrequency: "monthly" as const })),
    ...POSTS_SORTED.map((p) => ({ path: `/blog/${p.slug}`, priority: 0.5, changeFrequency: "monthly" as const })),
  ];

  // 지역 허브 페이지(시군구별) — 단지 상세는 이 페이지들의 내부 링크로 크롤 발견.
  const regionRoutes = Object.values(REGIONS)
    .flatMap((m) => Object.keys(m))
    .map((sgg) => ({ path: `/complex/${sgg}`, priority: 0.7, changeFrequency: "daily" as const }));

  return [...staticRoutes, ...regionRoutes].map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
