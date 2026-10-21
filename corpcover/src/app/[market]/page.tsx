import type { Metadata } from "next";
import Link from "next/link";
import { BlogGrid } from "@/components/blog-grid";
import { FaqStory } from "@/components/faq-story";
import { Subscribe } from "@/components/subscribe";
import { StartCards } from "@/components/start-cards";
import { Statement } from "@/components/statement";
import { GetCoveredStart } from "@/components/get-covered";
import { faqsFor } from "@/content/faq";
import { JsonLd, faqPage } from "@/lib/json-ld";
import { getGuides } from "@/lib/blog-api";
import { MARKETS, alternates, mpath, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  const title = `Business insurance in ${M.name} | Corp Cover`;
  const description = `Liability and asset insurance for ${M.adj} companies: plain guides, policy reviews and advisers who compare insurers. Your business pays no fee.`;
  return { title: { absolute: title }, description, alternates: alternates(m), openGraph: { title, description, url: mpath(m) }, twitter: { card: "summary_large_image" } };
}

export const revalidate = 300;

export default async function Home({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  const articles = await getGuides(m);
  const faqs = faqsFor(m);
  return (
    <main className="flex-1">
      <JsonLd data={faqPage(faqs)} />
      <StartCards market={m} />

      <section id="quote" aria-labelledby="quote-h" className="scroll-mt-24 bg-base py-[clamp(56px,8vw,96px)]">
        <div className="wrap grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div>
            <h2 id="quote-h" className="t-h2">Get covered</h2>
            <p className="mt-4 t-lede">Liability and asset cover for {M.adj} companies. Pick your business, choose the cover, and an adviser compares insurers and calls you.</p>
            <ul className="mt-6 grid gap-2 text-[15px] text-ink-2">
              <li>Insurers pay the adviser commission. Your business pays no fee.</li>
              <li>A request is not a commitment to buy.</li>
            </ul>
          </div>
          <GetCoveredStart market={m} />
        </div>
      </section>
      <Statement />

      <section id="guides" aria-label="Latest blogs" className="wrap scroll-mt-24 pb-24 pt-2 sm:pb-32">
        <BlogGrid articles={articles} maxRows={3}
          footer={<div className="mt-12 flex justify-center"><Link href={mpath(m, "/articles")} className="btn btn-ghost">View all blogs</Link></div>} />
      </section>

      <Subscribe variant="band" />

      <section id="faq" className="scroll-mt-4 pb-16 pt-14 lg:pb-24 lg:pt-20">
        <div className="wrap">
          <h2 className="t-h2">Questions before you start</h2>
          <div className="mt-6 lg:mt-10"><FaqStory faqs={faqs} /></div>
        </div>
      </section>
    </main>
  );
}
