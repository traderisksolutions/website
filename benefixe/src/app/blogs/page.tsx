import type { Metadata } from "next";
import { Footer, Header } from "@/components/shell";
import { TOPICS, formatDate, getPosts, photoFor } from "@/lib/blog-api";
import { site } from "@/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Resources: group insurance and employee benefits guides for Singapore companies",
  description: "Guides to group hospital and surgical insurance, outpatient plans, dental, foreign worker medical insurance, perks and benefits plans for Singapore employers.",
  alternates: { canonical: "/blogs" },
};

export default async function BlogsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const all = await getPosts();
  const current = (TOPICS as readonly string[]).includes(topic ?? "") ? topic! : "All";
  const posts = current === "All" ? all : all.filter(p => p.topic === current);
  const [first, ...rest] = posts;
  const ld = {
    "@context": "https://schema.org", "@type": "Blog", name: "Benefixe Resources", url: `${site.url}/blogs`,
    blogPost: all.map(p => ({ "@type": "BlogPosting", headline: p.title, url: `${site.url}/blogs/${p.slug}`, datePublished: p.published_at.slice(0, 10) })),
  };
  return (
    <>
      <Header />
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        <section className="page-top"><h1>Resources</h1><p>Guides to group insurance, perks and benefits plans in Singapore.</p></section>
        <section className="wrap" style={{ paddingBottom: 100 }}>
          <div className="seg" role="group" aria-label="Category" style={{ justifyContent: "flex-start" }}>
            <a href="/blogs" aria-current={current === "All" ? "true" : undefined}>All</a>
            {TOPICS.map(t => <a key={t} href={`/blogs?topic=${encodeURIComponent(t)}`} aria-current={current === t ? "true" : undefined}>{t}</a>)}
          </div>
          {first ? (
            <>
              <a className="featured" href={`/blogs/${first.slug}`}>
                <div className="f-art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoFor(first.slug, first.topic)} alt="" /><span className="tag-chip">{first.topic}</span></div>
                <div><time dateTime={first.published_at}>{formatDate(first.published_at)} · {first.reading_minutes} min read</time><h2>{first.title}</h2><p>{first.excerpt ?? first.meta_description}</p></div>
              </a>
              <div className="post-grid">
                {rest.map(p => (
                  <a key={p.slug} className="post" href={`/blogs/${p.slug}`}>
                    <div className="p-art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoFor(p.slug, p.topic)} alt="" loading="lazy" /><span className="tag-chip">{p.topic}</span></div>
                    <h3>{p.title}</h3>
                    <time dateTime={p.published_at}>{formatDate(p.published_at)}</time>
                  </a>
                ))}
              </div>
            </>
          ) : <p className="note">No posts in this category yet.</p>}
        </section>
      </main>
      <Footer />
    </>
  );
}
