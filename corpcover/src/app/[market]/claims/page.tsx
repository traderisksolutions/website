import { Terrain } from "@/components/terrain";
import { FaqList } from "@/components/faq-list";
import { FeatureTrio } from "@/components/feature-trio";
import type { Metadata } from "next";
import { ClaimFlow } from "@/components/claim-flow";
import { JsonLd } from "@/lib/json-ld";
import { MARKETS, alternates, marketParam, type MarketKey } from "@/lib/market";
import { PLANS, PROCESS, SLA_HOURS } from "@/lib/claim";
import { site } from "@/site";
import { getGuides } from "@/lib/blog-api";
import { ArticleCard } from "@/components/article-card";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return {
    title: { absolute: `Insurance claim rejected in ${M.name}? Review in ${SLA_HOURS}h` },
    description: `Claim rejected, denied or underpaid in ${M.name}? Pay online, send the policy and the insurer's letter, and get a PDF report on each reason within ${SLA_HOURS} hours. From ${PLANS.personal.price}.`,
    alternates: alternates(m, "/claims"), twitter: { card: "summary_large_image" },
  };
}


const faq = (m: MarketKey): { q: string; a: string }[] => {
  const M = MARKETS[m];
  return [
    { q: `What to do if your insurance claim is rejected in ${M.name}`, a: `Ask the insurer for the reason in writing and the clause it relies on. Check that clause against your policy wording. If you still disagree after the insurer's internal review, you can file with ${M.disputeBody} ${M.disputeDeadline}. ${M.disputeNote} A second opinion helps you decide whether to push back and on what point.` },
    { q: "How do I appeal a rejected insurance claim?", a: "Write to the insurer and ask it to review the decision. Name the reason it gave, quote the clause, and say why the wording or the facts do not support it. Attach any document it said was missing. Keep the reply in writing; the dispute body asks for the insurer's final reply." },
    { q: "Can I dispute the amount the insurer paid?", a: "Yes. Ask the insurer for its calculation in writing. Most cuts come from the excess, depreciation, a sub-limit, or the average clause where the sum insured was too low. Each one is a figure you can check against the schedule and the wording." },
    { q: "Can an insurer reject a claim for non-disclosure?", a: "It can, if you did not disclose a fact it asked about, or a fact that would have changed its terms. Ask which question on the proposal form it relies on, and compare it with the answer you gave." },
    { q: "Do I need a lawyer to dispute an insurance claim?", a: m === "hk" ? "Not to start. The ICB is free and takes personal policies. For a business policy, or for court action, speak to a lawyer." : m === "sg" ? "Not to start. Filing with FIDReC is free, and lawyers cannot represent either side at FIDReC adjudication. For court action, speak to a lawyer." : `Not to start. ${M.disputeBody} is free, and lawyers cannot represent either side there. For court action, speak to a lawyer.` },
    { q: "Who reviews my claim?", a: "An adviser who did not sell you the policy and is not paid on this claim. Advisers are paid commission by insurers when they place policies; a review never involves the adviser who placed yours." },
    { q: "What is a claim second opinion?", a: "A reading of your policy and the insurer's decision by someone who was not involved in the sale or the claim. It shows which reasons hold up against the wording and which do not." },
    { q: "Is this legal advice?", a: "No. The review explains how the policy wording applies to each reason in the insurer's letter. We do not act for you, contact the insurer, negotiate, or prepare documents for any proceeding. For court action, speak to a lawyer." },
    { q: "Is AI used?", a: "Yes. An AI model reads the documents first. A person checks the reading before the call." },
    { q: "What does it cost?", a: `${PLANS.personal.price} for a personal claim and ${PLANS.business.price} for a business claim, per review. You pay by card on a Stripe payment page after sending the claim details. The price never depends on what the insurer pays.` },
    { q: "How long does a claim review take?", a: `The PDF report arrives by email within ${SLA_HOURS} hours of receiving your documents. A broker then follows up in the same email thread.` },
    { q: "What is in the report?", a: "Each reason the insurer gave, the clause it relies on, the wording quoted, and a finding: supported by the wording, not supported, or unclear. It ends with the questions to put back to the insurer and the deadline for the dispute body." },
    { q: "Which claims can you review?", a: "Personal: travel, health, motor, home, personal accident, life and critical illness. Business: fire and property, business interruption, public and product liability, professional indemnity, work injury, cargo, burglary and fidelity." },
    { q: "What documents do I need?", a: "The policy schedule and full wording, the claim form, the insurer's decision letter, and any emails with the insurer or a loss adjuster. Photos, receipts and reports help where the loss is disputed." },
  ];
};

export default async function Claims({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  const qa = faq(m);
  const guides = (await getGuides(m)).filter(g => g.topic === "Claims").slice(0, 6);
  return (
    <main className="flex-1">
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Service", name: "Rejected insurance claim review", serviceType: "Insurance claim second opinion",
        description: `A PDF report on a rejected, denied or underpaid insurance claim in ${M.name}, delivered within ${SLA_HOURS} hours of receiving the documents, followed by a broker by email.`,
        areaServed: { "@type": "Country", name: M.name }, provider: { "@type": "Organization", name: site.name, url: site.url },
        url: `${site.url}/${m}/claims`,
        offers: (["personal", "business"] as const).map(p => ({ "@type": "Offer", name: PLANS[p].label, price: PLANS[p].value, priceCurrency: "USD", availability: "https://schema.org/InStock" })),
      }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <Terrain shade="evergreen">
      <section className="wrap pb-[clamp(72px,9vw,128px)] pt-[clamp(72px,10vw,144px)]">
        <p className="text-[14px] font-medium text-accent">Claim review</p>
        <h1 className="t-h1 mt-4 max-w-[16ch]">Rejected insurance claim review</h1>
        <p className="t-lede mt-7">For a claim in {M.name} that the insurer rejected, denied or underpaid. You pay first to secure the review, then send the policy and the insurer&apos;s letter. Within {SLA_HOURS} hours you get a PDF report that sets each reason against the clause it relies on. A broker who did not sell you the policy then follows up by email.</p>
        <FeatureTrio className="mt-[clamp(48px,6vw,80px)]" items={[
          { icon: "clock", title: `PDF report in ${SLA_HOURS} hours`, text: `Within ${SLA_HOURS} hours of receiving your documents. Personal claim ${PLANS.personal.price}, business claim ${PLANS.business.price}.` },
          { icon: "doc", title: "Each reason checked", text: "Every reason the insurer gave, set against the clause it relies on, with the wording quoted." },
          { icon: "person", title: "Broker follow-up", text: "A broker who did not sell you the policy replies in the same email thread. Not legal advice." },
        ]} />
      </section>
      </Terrain>

      <section className="wrap grid items-start gap-12 pb-[clamp(96px,12vw,176px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <ol className="grid gap-8">
          {PROCESS.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1">
              <span className="row-span-2 pt-1 tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <b className="t-h3">{t}</b>
              <span className="text-ink-2">{d}</span>
            </li>
          ))}
          <li className="rounded-[12px] bg-base p-5 text-[15px] text-ink-2">The review is a reading of your documents against the policy wording. It is not legal advice and does not act for you with the insurer. If the insurer&apos;s final answer still stands, you can file with {M.disputeBody} {M.disputeDeadline}. {M.disputeNote} Documents are used only for this review.</li>
        </ol>
        <ClaimFlow market={m} />
      </section>

      {guides.length > 0 && (
        <section className="wrap pb-[clamp(96px,12vw,176px)]">
          <h2 className="t-h2">Claim guides</h2>
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{guides.map(g => <ArticleCard key={g.slug} article={g} />)}</div>
        </section>
      )}

      <section className="py-[clamp(96px,12vw,176px)]">
        <div className="wrap">
          <h2 className="t-h2">Questions about claim reviews</h2>
          <FaqList items={qa} className="mt-[clamp(32px,4vw,48px)]" />
        </div>
      </section>
    </main>
  );
}
