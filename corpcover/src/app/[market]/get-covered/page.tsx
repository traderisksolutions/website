import type { Metadata } from "next";
import { GetCovered } from "@/components/get-covered";
import { MARKETS, alternates, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return {
    title: `Select business insurance in ${M.name}`,
    description: `Liability and asset cover for ${M.adj} companies. Pick your business type and the cover you need; an adviser compares insurers and calls you. No fee.`,
    alternates: alternates(m, "/get-covered"), twitter: { card: "summary_large_image" },
  };
}

export default async function GetCoveredPage({ params, searchParams }: { params: Promise<{ market: string }>; searchParams: Promise<{ biz?: string }> }) {
  const m = await marketParam(params);
  const { biz = "" } = await searchParams;
  return (
    <main className="gc-page flex-1">
      <div className="mx-auto w-full max-w-[680px] px-4 pb-24 pt-[clamp(32px,6vw,64px)]">
        <h1 className="t-h2 mb-6 text-center">Select your cover</h1>
        <GetCovered initialBiz={biz} market={m} />
      </div>
    </main>
  );
}
