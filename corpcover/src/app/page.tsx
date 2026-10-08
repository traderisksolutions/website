import { site } from "@/site";
import { articles, topics } from "@/content/articles";
import { ArticleFeed } from "@/components/article-feed";
import { FaqList } from "@/components/faq-list";
import { Hero, InsurerStrip } from "@/components/hero";
import { StartActions } from "@/components/start-actions";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <InsurerStrip />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Ways to start */}
        <section id="start" className="scroll-mt-20 py-14 lg:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Start here</h2>
          <div className="mt-8"><StartActions /></div>
        </section>

        {/* Blog */}
        <section id="guides" className="grid scroll-mt-20 gap-12 border-t border-rule py-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <h2 className="mb-6 text-2xl font-bold tracking-tight">Guides</h2>
            <ArticleFeed />
          </div>
          <aside className="lg:pl-2 lg:pt-14">
            <p className="text-lg font-semibold">{site.name}</p>
            <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-3">{site.description}</p>
            <a href="#start" className="glass-primary mt-5 block px-4 py-2.5 text-center text-sm font-semibold">Get started</a>
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
        <section id="faq" className="scroll-mt-20 border-t border-rule py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
            <h2 className="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
            <FaqList />
          </div>
        </section>
      </div>
    </main>
  );
}
