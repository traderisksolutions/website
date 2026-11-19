import type { MetadataRoute } from "next";
import { site } from "@/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", ...(site.holding ? { disallow: "/" } : { allow: "/" }) },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
