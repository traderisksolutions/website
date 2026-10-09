import type { MetadataRoute } from "next";
import { site } from "@/site";
import { articles } from "@/content/articles";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/articles`, changeFrequency: "weekly", priority: 0.8 },
    ...articles.map(a => ({ url: `${site.url}/articles/${a.slug}`, lastModified: a.updated ?? a.published, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
