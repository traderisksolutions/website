import type { Metadata } from "next";
import Link from "next/link";
import { JbCta, JbHead } from "@/components/jb";
import { TOPICS, formatDate, getPosts } from "@/lib/blog-api";
import { site } from "@/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Insights: commercial insurance guides for Hong Kong businesses",
  description: "Employees' compensation, property and business interruption, liability, D&O, cyber, marine and claims: how each cover works in Hong Kong, what moves the price, and what the policy leaves out.",
  alternates: { canonical: "/insights" },
};

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const all = await getPosts();
  const current = (TOPICS as readonly string[]).includes(topic ?? "") ? topic! : null;
  const posts = current ? all.filter(p => p.topic === current) : all;
  const ld = {
    "@context": "https://schema.org", "@type": "Blog", name: `${site.name} Insights`, url: `${site.url}/insights`,
    blogPost: all.map(p => ({ "@type": "BlogPosting", headline: p.title, url: `${site.url}/insights/${p.slug}`, datePublished: p.published_at.slice(0, 10) })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Insights" }]} title="Insights" lede="How each cover works in Hong Kong, what moves the price, and what the policy leaves out. Written by the broking team." />
      <div className="jb-col ins-col">
        <nav className="ins-topics" aria-label="Topic">
          <Link href="/insights" aria-current={current ? undefined : "true"}>All</Link>
          {TOPICS.map(t => <Link key={t} href={`/insights?topic=${encodeURIComponent(t)}`} aria-current={current === t ? "true" : undefined}>{t}</Link>)}
        </nav>
        {posts.length ? (
          <ul className="ins-list">
            {posts.map(p => (
              <li key={p.slug}>
                <Link href={`/insights/${p.slug}`}>
                  <span className="mono">{p.topic} · {formatDate(p.published_at)} · {p.reading_minutes} min</span>
                  <span className="ins-t">{p.title}</span>
                  <span className="ins-d">{p.excerpt ?? p.meta_description}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="jb-note">No articles on this topic yet.</p>}
      </div>
      <JbCta title="Send the programme for a second read before renewal." />
    </>
  );
}
