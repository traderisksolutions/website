import type { MetadataRoute } from "next";
import { site } from "@/site";
import { getGuides } from "@/lib/blog-api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getGuides();
  return [
    { url: site.url, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${site.url}/policy-review`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site.url}/find`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site.url}/articles`, changeFrequency: "weekly", priority: 0.8 },
    ...articles.map(a => ({ url: `${site.url}/articles/${a.slug}`, lastModified: a.updated ?? a.published, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
