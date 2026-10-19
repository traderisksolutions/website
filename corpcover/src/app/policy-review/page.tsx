import type { Metadata } from "next";
import { ReviewFlow } from "@/components/start-actions";

export const metadata: Metadata = {
  title: "Policy review",
  description: "Send your business insurance policy for review. An adviser reads the wording and explains the gaps, the overlaps and the price. No fee. A review is not a quote.",
  alternates: { canonical: "/policy-review" },
  twitter: { card: "summary_large_image" },
};

const steps = [
  ["Send the schedule", "The pages that list your cover, limits, excess and premium are enough."],
  ["An adviser reads the wording", "Gaps, overlaps and price, checked against what your business does."],
  ["You get the findings", "What the policy covers and where it falls short. Quotes from other insurers only if you ask."],
];

export default function PolicyReview() {
  return (
    <main className="flex-1">
      <section className="wrap pb-12 pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Policy review</h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">What your policy covers, what it excludes and where it falls short. A review is not a quote or a change to your cover.</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {["Fee S$0", "No obligation to buy", "PDF, JPG or PNG, up to 4 MB"].map(f => <li key={f} className="rounded-full bg-base px-3.5 py-1.5 text-[14.5px]">{f}</li>)}
        </ul>
      </section>

      <section className="wrap grid items-start gap-12 pb-[clamp(80px,10vw,140px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-[72px]">
        <ol className="border-t border-rule">
          {steps.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 border-b border-rule py-6">
              <span className="row-span-2 pt-1 tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <b className="text-[21px] font-semibold tracking-[-0.02em]">{t}</b>
              <span className="text-ink-2">{d}</span>
            </li>
          ))}
        </ol>
        <div className="on-base rounded-[28px] bg-base p-[clamp(22px,3vw,36px)]">
          <ReviewFlow inline />
        </div>
      </section>
    </main>
  );
}
