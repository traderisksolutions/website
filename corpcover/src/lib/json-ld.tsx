// Structured data for search engines and answer engines. Rendered as a plain <script> per the Next JSON-LD guide.
import { site } from "@/site";
import type { Article } from "@/content/articles";
import type { Faq } from "@/content/faq";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const orgId = `${site.url}/#organization`;

export const organization = {
  "@type": "Organization",
  "@id": orgId,
  name: site.name,
  url: site.url,
  logo: `${site.url}/icon.svg`,
  email: site.email,
  telephone: `+65 ${site.phone}`,
};

export const siteGraph = {
  "@context": "https://schema.org",
  "@graph": [
    organization,
    { "@type": "WebSite", "@id": `${site.url}/#website`, name: site.name, url: site.url, description: site.description, publisher: { "@id": orgId } },
  ],
};

/** One answer as plain text: paragraphs kept, list items joined. */
const answerText = (a: Faq["a"]) => a.map(part => (Array.isArray(part) ? part.join(" ") : part)).join(" ");

export const faqPage = (faqs: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: answerText(f.a) } })),
});

export const articleLd = (a: Article) => {
  const url = `${site.url}/articles/${a.slug}`;
  const org = { "@type": "Organization", "@id": orgId, name: site.name, url: site.url, logo: `${site.url}/icon.svg` };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.dek,
    datePublished: a.published,
    dateModified: a.updated ?? a.published,
    author: org,
    publisher: org,
    image: `${url}/opengraph-image`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
};
