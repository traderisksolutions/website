import type { Metadata } from "next";
import { BlogRail, ClaimFeature, HomeHero, ServiceCards } from "@/components/home/home-sections";
import { getGuides } from "@/lib/blog-api";
import { MARKETS, alternates, mpath, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  const title = `Business insurance in ${M.name} | Corp Cover`;
  const description = `Get the right insurance coverage for your ${M.adj} business. Advisers compare plans across insurers, review your policy and check refused claims. Your business pays no fee.`;
  return { title: { absolute: title }, description, alternates: alternates(m), openGraph: { title, description, url: mpath(m) }, twitter: { card: "summary_large_image" } };
}

export const revalidate = 300;

// Order (22 Oct 2026): hero → claim second opinion → three services → blogs → footer.
export default async function Home({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params);
  const articles = await getGuides(m);
  return (
    <main className="flex-1 pb-[clamp(72px,9vw,128px)]">
      <HomeHero m={m} />
      <ClaimFeature m={m} />
      <ServiceCards m={m} />
      <BlogRail m={m} articles={articles} />
    </main>
  );
}
