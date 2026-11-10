import type { MetadataRoute } from "next";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { getPosts } from "@/lib/blog-api";
import { site } from "@/site";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [
    "", "/coverage", "/insights", "/industries", "/appetite", "/how-we-work", "/claims", "/about", "/contact", "/complaints", "/privacy",
    ...LINES.map(l => `/coverage/${l.slug}`),
    ...INDUSTRIES.map(i => `/industries/${i.slug}`),
  ];
  const posts = await getPosts();
  return [
    ...paths.map(p => ({ url: `${site.url}${p}`, changeFrequency: "monthly" as const, priority: p ? 0.7 : 1 })),
    ...posts.map(p => ({ url: `${site.url}/insights/${p.slug}`, lastModified: p.updated_at, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
