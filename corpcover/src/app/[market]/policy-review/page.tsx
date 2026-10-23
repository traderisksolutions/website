import { Terrain } from "@/components/terrain";
import { FeatureTrio } from "@/components/feature-trio";
import type { Metadata } from "next";
import { ReviewFlow } from "@/components/start-actions";
import { alternates, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params);
  return { ...meta, alternates: alternates(m, "/policy-review") };
}

const meta: Metadata = {
  title: "Policy review",
  description: "Send your business insurance policy for review. An adviser reads the wording and explains the gaps, the overlaps and the price. No fee. A review is not a quote.",
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
      <Terrain shade="moss">
      <section className="wrap pb-[clamp(72px,9vw,128px)] pt-[clamp(72px,10vw,144px)]">
        <h1 className="t-h1">Policy review</h1>
        <p className="mt-7 t-lede">Most business owners renew without reading the wording, then find out what is missing when they claim. Know what you actually bought before that happens.</p>
        <FeatureTrio className="mt-[clamp(48px,6vw,80px)]" items={[
          { icon: "doc", title: "Know what you bought", text: "What each policy covers, what it leaves out, and where it falls short of your contracts and lease." },
          { icon: "shield", title: "No commitment", text: "A review is not a quote. Keep your insurer and your cover if they are right for you." },
          { icon: "fee", title: "90% of reviews find a saving", text: "Often 50% or more on premium, for the same or better cover. The review costs your business nothing." },
        ]} />
      </section>
      </Terrain>

      <section className="wrap grid items-start gap-12 pb-[clamp(96px,12vw,176px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-[72px]">
        <ol className="grid gap-8">
          {steps.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1">
              <span className="row-span-2 pt-1 tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <b className="text-[21px] font-semibold tracking-[-0.02em]">{t}</b>
              <span className="text-ink-2">{d}</span>
            </li>
          ))}
        </ol>
        <div className="on-base rounded-[12px] bg-base p-[clamp(22px,3vw,36px)]">
          <ReviewFlow inline />
        </div>
      </section>
    </main>
  );
}
