import type { Metadata } from "next";
import Link from "next/link";
import { pass, perks, sgd } from "@/content";
import { PerkTable } from "@/components/perk-table";

export const metadata: Metadata = {
  title: "All perks",
  description: `Every Insider Pass perk: ${perks.length} offers across travel, transport, wellness and everyday life.`,
};

export default function Perks() {
  return (
    <main className="flex-1 overflow-x-clip">
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 text-center sm:px-6 md:pt-20">
        <h1 className="font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-6xl">All perks</h1>
        <p className="mt-4 text-lg text-ink-2">{perks.length} perks · {sgd(pass.totalValue)} a year · {sgd(pass.priceYear)} membership</p>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PerkTable />
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="pass-card flex flex-col gap-6 rounded-[32px] p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">Insider Pass</div>
            <div className="mt-2 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{sgd(pass.priceYear)} a year. Free on group plans.</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/#join" className="btn-primary px-6 py-3.5 text-base">Get the pass</Link>
            <Link href="/group-benefits" className="inline-flex items-center rounded-full bg-white/15 px-6 py-3.5 text-base font-semibold ring-1 ring-white/35 hover:bg-white/25">Group benefits</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
