import type { Metadata } from "next";
import { ClaimFlow } from "@/components/claim-flow";
import { JsonLd } from "@/lib/json-ld";
import { MARKETS, alternates, marketParam, type MarketKey } from "@/lib/market";
import { PLANS } from "@/lib/claim";
import { getGuides } from "@/lib/blog-api";
import { ArticleCard } from "@/components/article-card";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return {
    title: `Insurance claim rejected? Claim second opinion in ${M.name}`,
    description: `A second read of a rejected, reduced or delayed insurance claim in ${M.name}: an AI read of your policy wording against the insurer's decision, then a call with a second adviser. Personal ${PLANS.personal.price}, business ${PLANS.business.price}.`,
    alternates: alternates(m, "/claims"), twitter: { card: "summary_large_image" },
  };
}

const STEPS: [string, string][] = [
  ["Send the claim", "The policy schedule and wording, the insurer's letter and your emails with the insurer."],
  ["AI read of the wording", "Each reason the insurer gave, set against the clause it relies on, with the questions to put back to the insurer."],
  ["Call with a second adviser", "An adviser who did not sell you the policy goes through the read and the options with you."],
];

const faq = (m: MarketKey): { q: string; a: string }[] => {
  const M = MARKETS[m];
  return [
    { q: "My insurance claim was rejected. What can I do?", a: `Ask the insurer for the reason in writing and the clause it relies on. Check that clause against your policy wording. If you still disagree after the insurer's internal review, you can file with ${M.disputeBody} ${M.disputeDeadline}. ${M.disputeNote} A second opinion helps you decide whether to push back and on what point.` },
    { q: "Who reviews my claim?", a: "An adviser who did not sell you the policy and is not paid on this claim. Advisers are paid commission by insurers when they place policies; a review never involves the adviser who placed yours." },
    { q: "What is a claim second opinion?", a: "A reading of your policy and the insurer's decision by someone who was not involved in the sale or the claim. It shows which reasons hold up against the wording and which do not." },
    { q: "Is this legal advice?", a: "No. The review explains how the policy wording applies to each reason in the insurer's letter. We do not act for you, contact the insurer, negotiate, or prepare documents for any proceeding. For court action, speak to a lawyer." },
    { q: "Is AI used?", a: "Yes. An AI model reads the documents first. A person checks the reading before the call." },
    { q: "What does it cost?", a: `${PLANS.personal.price} for a personal claim and ${PLANS.business.price} for a business claim, per review. You pay after sending the claim details, before the read starts.` },
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
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <section className="wrap pb-12 pt-[clamp(48px,8vw,104px)]">
        <h1 className="t-h1 max-w-[16ch]">Claim second opinion</h1>
        <p className="t-lede mt-5">For an insurance claim in {M.name} that was rejected, reduced or delayed. Send the policy and the insurer&apos;s decision. You get an AI read of the wording against each reason, then a call with an adviser who was not involved.</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {[`Personal claim ${PLANS.personal.price}`, `Business claim ${PLANS.business.price}`, "AI read and a call with a second adviser", "Not legal advice"].map(f => <li key={f} className="rounded-full bg-base px-3.5 py-1.5 text-[14.5px]">{f}</li>)}
        </ul>
      </section>

      <section className="wrap grid items-start gap-12 pb-[clamp(64px,8vw,104px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <ol className="grid gap-8">
          {STEPS.map(([t, d], i) => (
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
        <section className="wrap pb-[clamp(64px,8vw,104px)]">
          <h2 className="t-h2">Claim guides</h2>
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{guides.map(g => <ArticleCard key={g.slug} article={g} />)}</div>
        </section>
      )}

      <section className="bg-base py-[clamp(56px,8vw,96px)]">
        <div className="wrap">
          <h2 className="t-h2">Questions about claim reviews</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {qa.map(f => (
              <div key={f.q} className="rounded-[12px] bg-paper p-6">
                <h3 className="t-h3">{f.q}</h3>
                <p className="mt-2 text-ink-2">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
