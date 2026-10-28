import type { Metadata } from "next";
import { CloseBand } from "@/components/close-band";
import { StageTimeline } from "@/components/stage-timeline";
import { Eyebrow, RuleList, SplitHead } from "@/components/ui";
import { PLACEMENT } from "@/content/process";

export const metadata: Metadata = { title: "How we work", description: "How New South Sea reviews, prepares, markets, binds and services corporate insurance programmes." };

const TERMS = [
  { title: "We act for you", body: "As a licensed broker our duty is to the policyholder. Advice is given on suitability, not on which insurer pays more." },
  { title: "Remuneration disclosed", body: "Brokerage and fees are stated in writing before cover is placed, by line and by insurer." },
  { title: "One named team", body: "A broker, an account handler and a claims contact are named for every client. The names do not change at renewal." },
  { title: "Written advice", body: "Every renewal closes with a written summary of what was placed, what was declined and why." },
];

export default function HowWeWork() {
  return (
    <>
      <section className="wrap pt-14 lg:pt-24">
        <div className="reveal grid gap-6 lg:grid-cols-12 lg:gap-12">
          <Eyebrow className="pt-3 lg:col-span-4">How we work</Eyebrow>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <h1 className="display h1 text-ink">How we work</h1>
            <p className="lede">Five stages on every renewal, handled by the same broker from review to claim.</p>
          </div>
        </div>
      </section>
      <section className="wrap section"><StageTimeline stages={PLACEMENT} /></section>
      <section className="bg-stone">
        <div className="wrap section flex flex-col gap-12">
          <SplitHead label="Terms of engagement" title="What you can expect from us" />
          <RuleList items={TERMS} numbered />
        </div>
      </section>
      <CloseBand />
    </>
  );
}
