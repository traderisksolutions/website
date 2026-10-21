import type { Metadata } from "next";
import { GetCovered } from "@/components/get-covered";

export const metadata: Metadata = {
  title: "Get covered",
  description: "Liability and asset cover for Singapore companies. Pick your business type and the cover you need; an adviser compares insurers and calls you. No fee.",
  alternates: { canonical: "/get-covered" },
  twitter: { card: "summary_large_image" },
};

export default async function GetCoveredPage({ searchParams }: { searchParams: Promise<{ biz?: string }> }) {
  const { biz = "" } = await searchParams;
  return (
    <main className="gc-page flex-1">
      <div className="mx-auto w-full max-w-[680px] px-4 pb-24 pt-[clamp(32px,6vw,64px)]">
        <GetCovered initialBiz={biz} />
      </div>
    </main>
  );
}
