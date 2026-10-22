import { FeatureTrio } from "@/components/feature-trio";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, alternates, mpath, marketParam } from "@/lib/market";
import { FindStart } from "@/components/find-start";

export const metadata: Metadata = {
  title: "Find my cover",
  description: "Questions on your business, its premises, staff and contracts. An adviser uses the answers to prepare quotes for the liability and asset cover you need. No fee.",
  alternates: { canonical: "/sg/find" },
  twitter: { card: "summary_large_image" },
};



export default async function Find({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  if (!M.find) notFound();
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(96px,12vw,176px)] pt-[clamp(72px,10vw,144px)]">
        <h1 className="t-h1">Find my cover</h1>
        <p className="mt-7 t-lede">
          Questions on your business, premises, staff and contracts. An adviser uses the answers to prepare quotes before the call. The questions follow the proposal forms insurers use.
        </p>
        <FeatureTrio className="mt-[clamp(48px,6vw,80px)]" items={[
          { icon: "doc", title: "About 20 questions", text: "The questions follow the proposal forms insurers use." },
          { icon: "clock", title: "6 to 9 minutes", text: "Answers save as you go, so you can stop and come back." },
          { icon: "fee", title: "No fee", text: "Insurers pay the advisers. Your business pays nothing." },
        ]} />
        <div className="mt-8 flex flex-wrap gap-2.5">
          <FindStart />
          <Link href={mpath(m, "/get-covered")} className="btn btn-ghost">Use the short form</Link>
        </div>
      </section>
    </main>
  );
}
