import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articles, formatDate, type Block } from "@/content/articles";
import { getGuide, getGuides, splitIntro } from "@/lib/blog-api";
import { ArticleCard } from "@/components/article-card";
import { CoverArt } from "@/components/cover-art";
import { ShareButton } from "@/components/share-button";
import { TocRail } from "@/components/toc-rail";
import { site } from "@/site";
import { StartButton } from "@/components/start-actions";
import { Subscribe } from "@/components/subscribe";
import { JsonLd, articleLd } from "@/lib/json-ld";
import { mpath, marketParam } from "@/lib/market";

// Feed articles are rendered on demand and revalidated every five minutes; the hand-written
// ones are prebuilt.
export const dynamicParams = true;
export const revalidate = 300;

// Hand-written guides are Singapore guides; the layout supplies the market.
export function generateStaticParams({ params }: { params: { market: string } }) {
  return params.market === "sg" ? articles.map(a => ({ slug: a.slug })) : [];
}

type P = { params: Promise<{ market: string; slug: string }> };

export async function generateMetadata(props: P): Promise<Metadata> {
  const { slug } = await props.params;
  const m = await marketParam(props.params);
  const a = await getGuide(slug, m);
  if (!a) return {};
  return {
    title: a.title,
    description: a.dek,
    alternates: { canonical: mpath(m, `/articles/${a.slug}`) },
    twitter: { card: "summary_large_image", title: a.title, description: a.dek },
    openGraph: { title: a.title, description: a.dek, type: "article", siteName: site.name, url: mpath(m, `/articles/${a.slug}`), publishedTime: a.published, modifiedTime: a.updated ?? a.published },
  };
}

const anchor = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Body({ block }: { block: Block }) {
  if (block.type === "h2") return <h2 id={anchor(block.text)}>{block.text}</h2>;
  if (block.type === "ul") return <ul>{block.items.map(i => <li key={i}>{i}</li>)}</ul>;
  return <p>{block.text}</p>;
}

/** Lenny's article layout: title, subtitle, byline, actions, publisher's note, intro, cover, body. */
export default async function ArticlePage(props: P) {
  const { slug } = await props.params;
  const m = await marketParam(props.params);
  const a = await getGuide(slug, m);
  if (!a) notFound();
  const [intro, ...rest] = a.body;
  const html = a.html ? splitIntro(a.html) : null;
  const toc = a.headings ?? a.body.filter(b => b.type === "h2").map(b => ({ id: anchor(b.text), text: b.text }));
  const more = (await getGuides(m)).filter(x => x.slug !== a.slug).slice(0, 3);

  return (
    <main className="flex-1">
      <JsonLd data={articleLd(a)} />
      <TocRail items={toc} />
      <article className="mx-auto max-w-[760px] px-4 pb-14 pt-8 sm:px-4 lg:pt-10">
        <h1 className="text-[1.75rem] font-bold leading-[1.13] tracking-tight text-ink sm:text-[2rem]">{a.title}</h1>
        <p className="mt-2 text-lg leading-snug text-ink-3">{a.dek}</p>

        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold tracking-tight text-accent-ink">CC</span>
          <div className="text-[0.72rem] uppercase leading-relaxed tracking-[0.04em]">
            <p className="font-medium text-ink">{site.name}</p>
            <p className="text-ink-3">{formatDate(a.published)}{a.updated && <> · Updated {formatDate(a.updated)}</>} · {a.minutes} min read</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Link href={mpath(m, "/articles")} className="glass px-4 py-1.5 text-sm font-medium text-ink-2">{a.topic}</Link>
          <ShareButton title={a.title} />
        </div>

        <div className="mt-6 text-[19px] leading-[1.6] text-ink-2">
          <p>
            An adviser can read your own policy and explain the gaps. Insurers pay the adviser; your business pays no fee.
          </p>
          <div className="my-5 flex flex-wrap justify-center gap-3">
            <StartButton flow="review" className="glass-primary px-6 py-2.5 text-sm font-semibold">Send my policy for review</StartButton>
            {m === "sg" && <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="glass px-6 py-2.5 font-sans text-sm font-medium">Call {site.phone}</a>}
          </div>
        </div>

        <hr className="my-8 border-rule" />
        {html ? <div className="prose-post" dangerouslySetInnerHTML={{ __html: html.intro }} /> : intro && <div className="prose-post"><Body block={intro} /></div>}
        <hr className="my-8 border-rule" />

        <figure className="aspect-[3/2] overflow-hidden rounded-[12px]">
          <CoverArt article={a} />
        </figure>

        {html ? <div className="prose-post mt-8" dangerouslySetInnerHTML={{ __html: html.rest }} /> : (
          <div className="prose-post mt-8">
            {rest.map((b, i) => <Body key={i} block={b} />)}
          </div>
        )}

        <hr className="my-10 border-rule" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-3">General information, not advice on a specific policy. Terms differ by insurer.</p>
          <ShareButton title={a.title} />
        </div>
        <div className="mt-8 flex flex-col items-center gap-4 rounded-[12px] bg-accent-soft px-5 py-7 text-center">
          <p className="text-lg font-semibold">Talk to an adviser</p>
          <p className="-mt-2 max-w-[44ch] text-ink-2">Insurers pay our advisers commission. Your business pays no fee, and a review is not a quote.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <StartButton flow="review" className="glass-primary px-6 py-2.5 text-sm font-semibold">Send my policy for review</StartButton>
            {m === "sg" ? <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="glass px-6 py-2.5 text-sm font-medium">Call {site.phone}</a> : <Link href={mpath(m, "/get-covered")} className="glass px-6 py-2.5 text-sm font-medium">Get covered</Link>}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center text-center">
          <h2 className="text-xl font-semibold">The Corp Cover letter</h2>
          <p className="mt-1.5 text-ink-2">One email a week. New articles on business insurance in Singapore.</p>
          <Subscribe variant="inline" className="mt-5 flex w-full justify-center" />
        </div>
      </article>

      <section className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-xl font-semibold">More blogs</h2>
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map(m => <ArticleCard key={m.slug} article={m} />)}
          </div>
        </div>
      </section>
    </main>
  );
}
