import type { Metadata } from "next";
import Link from "next/link";
import { CloseBand } from "@/components/close-band";
import { Eyebrow } from "@/components/ui";
import { FAMILIES, LINES } from "@/content/coverage";

export const metadata: Metadata = { title: "Coverage", description: "Lines of business placed by New South Sea." };

export default function CoveragePage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="wrap grid gap-8 py-16 lg:grid-cols-[3fr_9fr] lg:gap-0 lg:py-24">
          <Eyebrow className="pt-3">Coverage</Eyebrow>
          <div className="reveal flex flex-col gap-6">
            <h1 className="display h1 text-ink">What we insure</h1>
            <p className="lede">Ten types of business insurance. Each page explains what the policy covers, what affects the price and what we need from you.</p>
          </div>
        </div>
      </section>
      <section className="wrap section flex flex-col">
        {FAMILIES.map((family, fi) => (
          <div key={family} className="grid gap-6 border-t border-rule py-10 lg:grid-cols-[3fr_9fr] lg:gap-0">
            <Eyebrow num={String(fi + 1).padStart(2, "0")} className="pt-2">{family}</Eyebrow>
            <div className="grid gap-4 sm:grid-cols-2">
              {LINES.filter(l => l.family === family).map(l => (
                <Link key={l.slug} href={`/coverage/${l.slug}`} className="card group flex flex-col gap-3 pt-6 transition-colors">
                  <span className="display text-[24px] text-ink group-hover:text-umber">{l.name}</span>
                  <span className="body">{l.thesis}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
      <CloseBand />
    </>
  );
}
