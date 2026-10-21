import type { Metadata } from "next";
import { GetCovered } from "@/components/get-covered";
import { MARKETS, alternates, type MarketKey } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = (await params).market as MarketKey, M = MARKETS[m];
  return {
    title: "Get covered",
    description: `Liability and asset cover for ${M.adj} companies. Pick your business type and the cover you need; an adviser compares insurers and calls you. No fee.`,
    alternates: alternates(m, "/get-covered"), twitter: { card: "summary_large_image" },
  };
}

export default async function GetCoveredPage({ params, searchParams }: { params: Promise<{ market: string }>; searchParams: Promise<{ biz?: string }> }) {
  const m = (await params).market as MarketKey;
  const { biz = "" } = await searchParams;
  return (
    <main className="gc-page flex-1">
      <div className="mx-auto w-full max-w-[680px] px-4 pb-24 pt-[clamp(32px,6vw,64px)]">
        <GetCovered initialBiz={biz} market={m} />
      </div>
    </main>
  );
}
