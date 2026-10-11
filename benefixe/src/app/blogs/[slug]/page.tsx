import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blogs, bySlug, formatDate, type Block } from "@/content/blogs";
import { BlogCard } from "@/components/blog-card";
import { BlogCover } from "@/components/blog-cover";
import { ShareButton } from "@/components/share-button";
import { TocRail } from "@/components/toc-rail";
import { JsonLd, blogLd } from "@/lib/json-ld";
import { site } from "@/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return blogs.map(b => ({ slug: b.slug }));
}

export async function generateMetadata(props: PageProps<"/blogs/[slug]">): Promise<Metadata> {
  const b = bySlug((await props.params).slug);
  if (!b) return {};
  return {
    title: b.title,
    description: b.dek,
    alternates: { canonical: `/blogs/${b.slug}` },
    openGraph: { title: b.title, description: b.dek, type: "article", siteName: site.name, url: `/blogs/${b.slug}`, publishedTime: b.published, modifiedTime: b.updated ?? b.published },
  };
}

const anchor = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Body({ block }: { block: Block }) {
  if (block.type === "h2") return <h2 id={anchor(block.text)}>{block.text}</h2>;
  if (block.type === "ul") return <ul>{block.items.map(i => <li key={i}>{i}</li>)}</ul>;
  return <p>{block.text}</p>;
}

/** Lenny's article layout (as on corpcover), set in the benefixe system. */
export default async function BlogPage(props: PageProps<"/blogs/[slug]">) {
  const b = bySlug((await props.params).slug);
  if (!b) notFound();
  const [intro, ...rest] = b.body;
  const toc = b.body.filter(x => x.type === "h2").map(x => ({ id: anchor(x.text), text: x.text }));
  const more = blogs.filter(x => x.slug !== b.slug).slice(0, 3);

  return (
    <main className="flex-1">
      <JsonLd data={blogLd(b)} />
      <TocRail items={toc} />
      <article className="mx-auto max-w-[720px] px-4 pb-16 pt-10 lg:pt-16">
        <Link href={`/blogs?topic=${encodeURIComponent(b.topic)}`} className="mono-label hover:text-ink">{b.topic}</Link>
        <h1 className="h-display mt-3 text-[2rem] sm:text-[2.6rem]">{b.title}</h1>
        <p className="mt-3 text-lg leading-snug text-ink-2">{b.dek}</p>

        <div className="mt-6 flex items-center justify-between gap-3 border-y border-rule py-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white">
              <svg viewBox="0 0 20 20" className="size-4"><path d="M5 10h10M10 5v10" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            <div className="text-[13px] leading-snug">
              <p className="font-medium">{site.name}</p>
              <p className="text-ink-3">{formatDate(b.published)}{b.updated && <> · Updated {formatDate(b.updated)}</>} · {b.minutes} min read</p>
            </div>
          </div>
          <ShareButton title={b.title} />
        </div>

        {intro && <div className="prose-post mt-8"><Body block={intro} /></div>}

        <figure className="mt-8 aspect-[16/9] overflow-hidden rounded-[14px]"><BlogCover blog={b} /></figure>

        <div className="prose-post mt-4">
          {rest.map((x, i) => <Body key={i} block={x} />)}
        </div>

        <p className="mt-12 border-t border-rule pt-5 text-[13px] text-ink-3">General information, not advice on a specific policy. Terms differ by insurer.</p>

        <div className="mt-8 flex flex-col gap-5 rounded-[18px] bg-night p-7 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-medium tracking-[-0.01em]">Group benefits with the Insider Pass</p>
            <p className="mt-1 text-[14px] text-white/55">Quotes from 3 insurers in 5 working days.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/group-benefits#quote" className="btn-primary !bg-white !text-ink hover:!bg-white/90">Get a quote</Link>
            <Link href="/group-benefits" className="btn-ghost-dark">Plans</Link>
          </div>
        </div>
      </article>

      <section className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between">
            <h2 className="h-display text-2xl sm:text-3xl">More blogs</h2>
            <Link href="/blogs" className="text-[13px] font-medium text-ink-2 hover:text-ink">All blogs →</Link>
          </div>
          <div className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map(m => <BlogCard key={m.slug} blog={m} />)}
          </div>
        </div>
      </section>
    </main>
  );
}
