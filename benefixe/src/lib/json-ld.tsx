// Structured data for search engines and answer engines. Rendered as a plain <script> per the Next JSON-LD guide.
import { site } from "@/site";
import type { Blog } from "@/content/blogs";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const blogLd = (b: Blog) => {
  const url = `${site.url}/blogs/${b.slug}`;
  const org = { "@type": "Organization", "@id": `${site.url}/#organization`, name: site.name, url: site.url };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: b.title,
    description: b.dek,
    datePublished: b.published,
    dateModified: b.updated ?? b.published,
    author: org,
    publisher: org,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
};
