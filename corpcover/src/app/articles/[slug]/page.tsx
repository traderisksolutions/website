import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articles, bySlug, formatDate, type Block } from "@/content/articles";
import { ArticleCard } from "@/components/article-card";
import { site, reviewHref } from "@/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map(a => ({ slug: a.slug }));
}

export async function generateMetadata(props: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const a = bySlug((await props.params).slug);
  return a ? { title: a.title, description: a.dek, openGraph: { title: a.title, description: a.dek, type: "article" } } : {};
}

function Body({ block }: { block: Block }) {
  if (block.type === "h2") return <h2 className="mt-10 font-serif text-[1.6rem] leading-snug">{block.text}</h2>;
  if (block.type === "ul") return (
    <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-ink-3">
      {block.items.map(i => <li key={i}>{i}</li>)}
    </ul>
  );
  return <p className="mt-4">{block.text}</p>;
}

export default async function ArticlePage(props: PageProps<"/articles/[slug]">) {
  const a = bySlug((await props.params).slug);
  if (!a) notFound();
  const more = articles.filter(x => x.slug !== a.slug).slice(0, 3);

  return (
    <main className="flex-1">
      <article className="mx-auto max-w-[44rem] px-4 pb-16 pt-10 sm:px-6 lg:pt-14">
        <p className="eyebrow"><Link href="/articles" className="hover:text-ink">Guides</Link> · {a.topic}</p>
        <h1 className="mt-3 font-serif text-[2.2rem] leading-[1.1] tracking-tight sm:text-[2.8rem]">{a.title}</h1>
        <p className="mt-4 text-[1.15rem] leading-relaxed text-ink-2">{a.dek}</p>
        <p className="eyebrow mt-5 border-b border-rule pb-6">{site.name} · {formatDate(a.published)} · {a.minutes} min read</p>
        <div className="text-[1.06rem] leading-[1.75]">
          {a.body.map((b, i) => <Body key={i} block={b} />)}
        </div>
        <div className="mt-12 flex flex-col gap-4 rounded-lg bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">Check this against the policies you hold.</p>
          <a href={reviewHref} className="shrink-0 rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-ink hover:opacity-90">Request a review</a>
        </div>
        <p className="mt-6 text-sm text-ink-3">General information, not advice on a specific policy. Terms differ by insurer.</p>
      </article>

      <section className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-xl font-semibold">More guides</h2>
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map(m => <ArticleCard key={m.slug} article={m} />)}
          </div>
        </div>
      </section>
    </main>
  );
}
