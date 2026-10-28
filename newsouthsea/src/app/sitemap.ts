import type { MetadataRoute } from "next";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { site } from "@/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "", "/coverage", "/industries", "/appetite", "/how-we-work", "/claims", "/about", "/contact", "/complaints", "/privacy",
    ...LINES.map(l => `/coverage/${l.slug}`),
    ...INDUSTRIES.map(i => `/industries/${i.slug}`),
  ];
  return paths.map(p => ({ url: `${site.url}${p}`, changeFrequency: "monthly", priority: p ? 0.7 : 1 }));
}
