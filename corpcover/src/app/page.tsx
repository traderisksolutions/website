import Link from "next/link";
import { site, reviewHref } from "@/site";
import { articles, topics } from "@/content/articles";
import { insurers } from "@/content/faq";
import { ArticleFeed } from "@/components/article-feed";
import { ArticleRow } from "@/components/article-card";
import { HeroArt } from "@/components/cover-art";
import { FaqList } from "@/components/faq-list";

export default function Home() {
  const startHere = articles.slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
      {/* Hero */}
      <section className="grid items-center gap-8 py-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:py-10">
        <div className="aspect-[16/10] overflow-hidden rounded-md">
          <HeroArt />
        </div>
        <div className="text-center">
          <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-[2.4rem]">
            Business insurance quotes from {insurers.length} insurers, compared for you
          </h1>
          <p className="mx-auto mt-4 max-w-[44ch] text-[1.1rem] leading-relaxed text-ink-2">
            MAS-licensed advisers compare cover for Singapore companies. No fee, and no obligation to buy.
          </p>
          <p className="eyebrow mt-4">{site.legalName}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <a href={reviewHref} className="glass-primary px-6 py-3 font-semibold">Get quotes</a>
            <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="glass px-6 py-3 font-medium">Call {site.phone}</a>
          </div>
        </div>
      </section>

      {/* Blog */}
      <section id="guides" className="scroll-mt-4 border-t border-rule py-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Start here</h2>
          <Link href="/articles" className="glass px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]">View all</Link>
        </div>
        <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-rule">
          {startHere.map(a => (
            <li key={a.slug} className="lg:px-4 lg:first:pl-0 lg:last:pr-0"><ArticleRow article={a} /></li>
          ))}
        </ul>
      </section>

      <section className="grid gap-12 border-t border-rule py-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <h2 className="sr-only">Latest guides</h2>
          <ArticleFeed />
        </div>
        <aside className="lg:pl-2">
          <p className="text-lg font-semibold">{site.name}</p>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-3">{site.description}</p>
          <a href={reviewHref} className="glass-primary mt-5 block px-4 py-2.5 text-center text-sm font-semibold">Get quotes</a>
          <h3 className="mt-10 border-b border-rule pb-2 text-lg font-semibold">Topics</h3>
          <ul className="mt-3 space-y-2.5">
            {topics.map(t => (
              <li key={t} className="flex justify-between font-medium">
                <span>{t}</span>
                <span className="tabular-nums text-ink-3">{articles.filter(a => a.topic === t).length}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-4 border-t border-rule py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
          <h2 className="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
          <FaqList />
        </div>
      </section>
    </main>
  );
}
