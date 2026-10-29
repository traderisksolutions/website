import type { Metadata } from "next";
import { GetCovered } from "@/components/get-covered";
import { MARKETS, alternates, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return {
    title: `Business insurance quotes in ${M.name}`,
    description: `Liability and asset cover for ${M.adj} companies. Pick your business type and the cover you need; an adviser compares insurers and calls you. No fee.`,
    alternates: alternates(m, "/get-covered"), twitter: { card: "summary_large_image" },
  };
}

export default async function GetCoveredPage({ params, searchParams }: { params: Promise<{ market: string }>; searchParams: Promise<{ biz?: string }> }) {
  const m = await marketParam(params);
  const { biz = "" } = await searchParams;
  return (
    <main className="gc-page terrain terrain-dark grain grain-pine flex-1">
      <div className="mx-auto w-full max-w-[680px] px-4 pb-[clamp(96px,12vw,176px)] pt-[clamp(56px,8vw,112px)]">
        <h1 className="t-h1 mb-[clamp(36px,5vw,56px)] text-center">Get cover quotes</h1>
        <div className="frost"><GetCovered initialBiz={biz} market={m} /></div>
      </div>
    </main>
  );
}
