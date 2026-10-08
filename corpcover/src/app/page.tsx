import Link from "next/link";
import { ArticleFeed } from "@/components/article-feed";
import { FaqList } from "@/components/faq-list";
import { Hero } from "@/components/hero";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section id="guides" aria-label="Guides" className="scroll-mt-20 pb-12">
          <ArticleFeed onPhoto action={<Link href="/articles" className="hero-glass shrink-0 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]">View all</Link>} />
        </section>

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
