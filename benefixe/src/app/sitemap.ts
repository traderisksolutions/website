import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/blog-api";
import { site } from "@/site";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  return [
    { url: site.url, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/blogs`, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map(p => ({ url: `${site.url}/blogs/${p.slug}`, lastModified: p.updated_at, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
