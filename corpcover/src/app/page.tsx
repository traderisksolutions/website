import Link from "next/link";
import { ArticleFeed } from "@/components/article-feed";
import { FaqStory } from "@/components/faq-story";
import { Hero } from "@/components/hero";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section id="guides" aria-label="Guides" className="scroll-mt-20 pb-12 pt-3.5">
          <ArticleFeed action={<Link href="/articles" className="glass shrink-0 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]">View all</Link>} />
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-rule pt-14 lg:pt-20">
          <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold leading-tight tracking-tight">Frequently asked questions</h2>
          <div className="mt-6 lg:mt-0"><FaqStory /></div>
        </section>
      </div>
    </main>
  );
}
