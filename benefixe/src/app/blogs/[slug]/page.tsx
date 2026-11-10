import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, Header } from "@/components/shell";
import { formatDate, getPost, getPosts, photoFor, splitIntro } from "@/lib/blog-api";
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
    alternates: { canonical: `/blogs/${post.slug}` },
    openGraph: { title: post.title, description, type: "article", siteName: site.name, url: `/blogs/${post.slug}`, publishedTime: post.published_at, modifiedTime: post.updated_at, images: [{ url: photoFor(post.slug, post.topic) }] },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function PostPage({ params }: P) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const { intro, rest } = splitIntro(post.content_html);
  const more = (await getPosts()).filter(p => p.slug !== post.slug && p.topic === post.topic).slice(0, 3);
  const url = `${site.url}/blogs/${post.slug}`;
  const ld = [
    {
      "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.meta_description ?? post.excerpt ?? undefined,
      datePublished: post.published_at, dateModified: post.updated_at, mainEntityOfPage: url, image: `${site.url}${photoFor(post.slug, post.topic)}`,
      author: { "@type": "Organization", name: site.name }, publisher: { "@type": "Organization", name: site.name, url: site.url },
    },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resources", item: `${site.url}/blogs` },
      { "@type": "ListItem", position: 2, name: post.title, item: url },
    ] },
    ...(post.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: post.faq.map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }] : []),
  ];
  return (
    <>
      <Header />
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        <article className="article">
          <a className="back" href="/blogs">← All posts</a>
          <p className="meta">{post.topic} · {formatDate(post.published_at)} · {post.reading_minutes} min read</p>
          <h1>{post.title}</h1>
          {post.excerpt && <p className="dek">{post.excerpt}</p>}
          {intro && <div className="body" style={{ marginTop: 0 }} dangerouslySetInnerHTML={{ __html: intro }} />}
          <div className="a-art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoFor(post.slug, post.topic)} alt="" /></div>
          <div className="body" dangerouslySetInnerHTML={{ __html: rest }} />
          <p className="note">General information, not advice on a specific policy. Terms differ by insurer.</p>
          <div style={{ marginTop: 40 }}><a className="btn btn-orange" href="mailto:hello@benefixe.com">Get in touch</a></div>
        </article>
        {more.length > 0 && (
          <section className="blog-more">
            <h2>More in {post.topic?.toLowerCase()}</h2>
            <div className="post-grid">
              {more.map(p => (
                <a key={p.slug} className="post" href={`/blogs/${p.slug}`}>
                  <div className="p-art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoFor(p.slug, p.topic)} alt="" loading="lazy" /><span className="tag-chip">{p.topic}</span></div>
                  <h3>{p.title}</h3>
                  <time dateTime={p.published_at}>{formatDate(p.published_at)}</time>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
