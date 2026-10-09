import type { MetadataRoute } from "next";
import { site } from "@/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/group-benefits`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${site.url}/perks`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
