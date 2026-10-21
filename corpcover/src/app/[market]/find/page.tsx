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

const facts = ["About 20 questions", "6 to 9 minutes", "Saves as you go", "No fee"];

export default async function Find({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  if (!M.find) notFound();
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="t-h1">Find my cover</h1>
        <p className="mt-5 t-lede">
          Questions on your business, premises, staff and contracts. An adviser uses the answers to prepare quotes before the call. The questions follow the proposal forms insurers use.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {facts.map(f => <li key={f} className="rounded-full bg-base px-3.5 py-1.5 text-[14.5px]">{f}</li>)}
        </ul>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <FindStart />
          <Link href={mpath(m, "/get-covered")} className="btn btn-ghost">Use the short form</Link>
        </div>
      </section>
    </main>
  );
}
