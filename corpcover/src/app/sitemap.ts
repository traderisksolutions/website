import type { MetadataRoute } from "next";
import { site } from "@/site";
import { getGuides } from "@/lib/blog-api";
import { MARKETS, MARKET_KEYS, mpath } from "@/lib/market";

// One sitemap for all markets, with hreflang alternates on the pages every market has.
const SHARED: [string, MetadataRoute.Sitemap[number]["changeFrequency"], number][] = [
  ["/", "weekly", 1], ["/get-covered", "monthly", 0.9], ["/ask", "monthly", 0.8], ["/claims", "weekly", 0.9], ["/articles", "weekly", 0.8], ["/policy-review", "monthly", 0.7],
  ["/about", "monthly", 0.6], ["/how-we-compare", "yearly", 0.4],
];
const langs = (path: string) => Object.fromEntries(MARKET_KEYS.map(k => [MARKETS[k].lang, `${site.url}${mpath(k, path)}`]));

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [];
  for (const k of MARKET_KEYS) {
    for (const [p, changeFrequency, priority] of SHARED) pages.push({ url: `${site.url}${mpath(k, p)}`, changeFrequency, priority, alternates: { languages: langs(p) } });
    if (MARKETS[k].find) pages.push({ url: `${site.url}${mpath(k, "/find")}`, changeFrequency: "monthly", priority: 0.6 });
    for (const a of await getGuides(k)) pages.push({ url: `${site.url}${mpath(k, `/articles/${a.slug}`)}`, lastModified: a.updated ?? a.published, changeFrequency: "monthly", priority: 0.7 });
  }
  return pages;
}
