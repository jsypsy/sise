import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: "daily" | "weekly" }[] = [
    { path: "/", priority: 1.0, changeFrequency: "daily" },
    { path: "/digest", priority: 0.9, changeFrequency: "daily" },
    { path: "/top", priority: 0.8, changeFrequency: "daily" },
    { path: "/complex", priority: 0.6, changeFrequency: "weekly" },
  ];
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
