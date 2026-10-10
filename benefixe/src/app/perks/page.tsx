import type { Metadata } from "next";
import Link from "next/link";
import { pass, perks, sgd } from "@/content";
import { PerkTable } from "@/components/perk-table";
import { PassStats } from "@/components/bento";

export const metadata: Metadata = {
  title: "All perks",
  description: `Every Insider Pass perk: ${perks.length} offers across travel, transport, wellness and everyday life.`,
};

export default function Perks() {
  return (
    <main className="flex-1 overflow-x-clip">
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 md:pt-24">
        <h1 className="h-display text-[2.6rem] sm:text-6xl">All perks</h1>
        <p className="mx-auto mt-4 max-w-md text-[17px] text-ink-2">{perks.length} perks across travel, transport, wellness and everyday life. {sgd(pass.priceYear)} a year.</p>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <PerkTable />
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grain flex flex-col gap-8 overflow-hidden rounded-[18px] bg-night p-7 text-white sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="h-display text-3xl sm:text-4xl">Insider Pass</h2>
            <div className="mt-6"><PassStats dark /></div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/#membership" className="btn-primary btn-lg !bg-white !text-ink hover:!bg-white/90">Get the pass</Link>
            <Link href="/group-benefits" className="btn-ghost-dark btn-lg">For employers</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
