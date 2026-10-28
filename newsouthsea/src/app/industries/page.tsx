import type { Metadata } from "next";
import Link from "next/link";
import { CloseBand } from "@/components/close-band";
import { Eyebrow, Photo } from "@/components/ui";
import { INDUSTRIES } from "@/content/industries";

export const metadata: Metadata = { title: "Industries", description: "Insurance programmes by industry." };

export default function IndustriesPage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="wrap grid gap-8 py-16 lg:grid-cols-[3fr_9fr] lg:gap-0 lg:py-24">
          <Eyebrow className="pt-3">Industries</Eyebrow>
          <div className="reveal flex flex-col gap-6">
            <h1 className="display h1 text-ink">Industries</h1>
            <p className="lede">Six sectors with specific insurance needs.</p>
          </div>
        </div>
      </section>
      <section className="wrap section grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INDUSTRIES.map(ind => (
          <Link key={ind.slug} href={`/industries/${ind.slug}`} className="group flex flex-col overflow-hidden border border-rule transition-colors hover:border-bronze">
            <Photo src={ind.image} alt={ind.name} className="aspect-[16/10] !rounded-none" />
            <div className="flex flex-col gap-2 p-6">
              <span className="display text-[24px] text-ink group-hover:text-umber">{ind.name}</span>
              <span className="body !text-[15px]">{ind.headline}</span>
            </div>
          </Link>
        ))}
      </section>
      <CloseBand />
    </>
  );
}
