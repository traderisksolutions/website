import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JbCta, JbHead } from "@/components/jb";
import { formatDate, getPost, getPosts, splitIntro } from "@/lib/blog-api";
import { site } from "@/site";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getPosts()).map(p => ({ slug: p.slug }));
}

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  const description = post.meta_description ?? post.excerpt ?? undefined;
  return {
    title: post.title,
    description,
    alternates: { canonical: `/insights/${post.slug}` },
    openGraph: { title: post.title, description, type: "article", siteName: site.name, url: `/insights/${post.slug}`, publishedTime: post.published_at, modifiedTime: post.updated_at },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function InsightPage({ params }: P) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const { intro, rest } = splitIntro(post.content_html);
  const more = (await getPosts()).filter(p => p.slug !== post.slug && p.topic === post.topic).slice(0, 3);
  const url = `${site.url}/insights/${post.slug}`;
  const ld = [
    {
      "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.meta_description ?? post.excerpt ?? undefined,
      datePublished: post.published_at, dateModified: post.updated_at, mainEntityOfPage: url,
      author: { "@type": "Organization", name: site.entity }, publisher: { "@type": "Organization", name: site.entity, url: site.url },
    },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Insights", item: `${site.url}/insights` },
      { "@type": "ListItem", position: 2, name: post.title, item: url },
    ] },
    ...(post.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: post.faq.map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }] : []),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Insights", href: "/insights" }, { label: post.topic ?? "Insights" }]} title={post.title} lede={post.excerpt ?? post.meta_description ?? ""} />
      <article className="jb-col ins-col">
        <p className="mono">By the broking team · {formatDate(post.published_at)}{post.updated_at.slice(0, 10) !== post.published_at.slice(0, 10) && ` · Updated ${formatDate(post.updated_at)}`} · {post.reading_minutes} min read</p>
        {intro && <div className="ins-answer" dangerouslySetInnerHTML={{ __html: intro }} />}
        {post.headings.length > 2 && (
          <nav className="ins-toc" aria-label="In this article">
            <span className="mono">In this article</span>
            <ol>{post.headings.map(h => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
          </nav>
        )}
        <div className="ins-prose" dangerouslySetInnerHTML={{ __html: rest }} />
        <p className="jb-note">General information on how these covers work in Hong Kong. It is not advice on a particular policy: cover depends on the wording and the insurer&apos;s terms.</p>
        {more.length > 0 && (
          <div className="ins-more">
            <span className="mono">More in {post.topic?.toLowerCase()}</span>
            <ul className="ins-list">
              {more.map(p => <li key={p.slug}><Link href={`/insights/${p.slug}`}><span className="ins-t">{p.title}</span><span className="ins-d">{p.excerpt ?? p.meta_description}</span></Link></li>)}
            </ul>
          </div>
        )}
      </article>
      <JbCta title="Send the programme for a second read before renewal." />
    </>
  );
}
