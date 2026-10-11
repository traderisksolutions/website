import type { MetadataRoute } from "next";
import { site } from "@/site";
import { blogs } from "@/content/blogs";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/group-benefits`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${site.url}/perks`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site.url}/blogs`, changeFrequency: "weekly", priority: 0.7 },
    ...blogs.map(b => ({ url: `${site.url}/blogs/${b.slug}`, lastModified: b.updated ?? b.published, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
