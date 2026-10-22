import type { Metadata } from "next";
import { Suspense } from "react";
import { BlogGrid, BlogGridFromUrl } from "@/components/blog-grid";
import { Subscribe } from "@/components/subscribe";
import { getGuides } from "@/lib/blog-api";
import { MARKETS, alternates, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return { title: `Business insurance guides for ${M.name}`, description: `Plain guides to business insurance in ${M.name}, by topic.`, alternates: alternates(m, "/articles"), twitter: { card: "summary_large_image" } };
}

export const revalidate = 300;

export default async function Blogs({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  const articles = await getGuides(m);
  return (
    <main className="flex-1">
      <section className="wrap pb-10 pt-[clamp(48px,8vw,104px)] sm:pb-14">
        <h1 className="t-h1">Insights</h1>
        <p className="mt-5 t-lede">Plain guides to business insurance in {M.name}: what each policy covers, what it excludes and what to check.</p>
        <Subscribe variant="inline" className="mt-7" />
      </section>
      <section className="wrap pb-28" aria-label="All blogs">
        <Suspense fallback={<BlogGrid articles={articles} label="All blogs" />}><BlogGridFromUrl articles={articles} /></Suspense>
      </section>
    </main>
  );
}
