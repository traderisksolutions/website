import type { Metadata } from "next";
import Link from "next/link";
import { FindStart } from "@/components/find-start";

export const metadata: Metadata = {
  title: "Find my cover",
  description: "Questions on your business, its premises, staff and contracts. An adviser uses the answers to prepare quotes for the liability and asset cover you need. No fee.",
  alternates: { canonical: "/find" },
  twitter: { card: "summary_large_image" },
};

const facts = ["About 20 questions", "6 to 9 minutes", "Saves as you go", "No fee"];

export default function Find() {
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Find my cover</h1>
        <p className="mt-5 max-w-[46ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          Questions on your business, premises, staff and contracts. An adviser uses the answers to prepare quotes before the call. The questions follow the proposal forms insurers use.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {facts.map(f => <li key={f} className="rounded-full bg-base px-3.5 py-1.5 text-[14.5px]">{f}</li>)}
        </ul>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <FindStart />
          <Link href="/get-covered" className="btn btn-ghost">Use the short form</Link>
        </div>
      </section>
    </main>
  );
}
