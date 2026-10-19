import type { Metadata } from "next";
import Link from "next/link";
import { BlogGrid } from "@/components/blog-grid";
import { FaqStory } from "@/components/faq-story";
import { Subscribe } from "@/components/subscribe";
import { StartCards } from "@/components/start-cards";
import { Statement } from "@/components/statement";
import { faqs } from "@/content/faq";
import { JsonLd, faqPage } from "@/lib/json-ld";
import { getGuides } from "@/lib/blog-api";

export const metadata: Metadata = { alternates: { canonical: "/" }, twitter: { card: "summary_large_image" } };

export const revalidate = 300;

export default async function Home() {
  const articles = await getGuides();
  return (
    <main className="flex-1">
      <JsonLd data={faqPage(faqs)} />
      <StartCards />
      <Statement />

      <section id="guides" aria-label="Latest blogs" className="wrap scroll-mt-24 pb-24 pt-2 sm:pb-32">
        <BlogGrid articles={articles} maxRows={3}
          footer={<div className="mt-12 flex justify-center"><Link href="/articles" className="btn btn-ghost">View all blogs</Link></div>} />
      </section>

      <Subscribe variant="band" />

      <section id="faq" className="scroll-mt-4 border-t border-rule pb-16 pt-14 lg:pb-24 lg:pt-20">
        <div className="wrap">
          <h2 className="text-[clamp(2.2rem,4.4vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.025em]">Questions before you start</h2>
          <div className="mt-6 lg:mt-10"><FaqStory /></div>
        </div>
      </section>
    </main>
  );
}
