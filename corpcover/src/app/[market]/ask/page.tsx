import { FeatureTrio } from "@/components/feature-trio";
import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { faqsFor } from "@/content/faq";
import { faqAnswer } from "@/lib/chat-local";
import { JsonLd, faqPage } from "@/lib/json-ld";
import { MARKETS, alternates, marketParam } from "@/lib/market";
import { site } from "@/site";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params), M = MARKETS[m];
  return {
    title: `Ask a business insurance question in ${M.name}`,
    description: `Plain answers on liability and asset insurance for ${M.adj} companies, from our guides. An adviser follows up on WhatsApp. No fee.`,
    alternates: alternates(m, "/ask"), twitter: { card: "summary_large_image" },
  };
}

export default async function Ask({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  const faqs = faqsFor(m);
  const suggestions = faqs.map(f => ({ id: f.q, q: f.q, a: faqAnswer(f) }));
  const wa = `https://wa.me/65${site.phone.replace(/\s/g, "")}`;
  return (
    <main className="flex-1">
      <JsonLd data={faqPage(faqs)} />
      <section className="wrap grid items-start gap-12 pb-[clamp(96px,12vw,176px)] pt-[clamp(72px,10vw,144px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h1 className="t-h1">Adviser chat</h1>
          <p className="t-lede mt-7">One question, one plain answer on business insurance in {M.name}. An adviser follows up on WhatsApp when the answer depends on your policy.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <a href={wa} target="_blank" rel="noopener" className="btn btn-primary">Message an adviser</a>
            <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="btn btn-ghost">Call +65 {site.phone}</a>
          </div>
        </div>
        <div className="rounded-[16px] bg-paper p-[clamp(18px,2.6vw,28px)] shadow-[0_40px_90px_-40px_rgba(20,40,30,.35)]">
          <Chat suggestions={suggestions} className="h-[min(64dvh,560px)]" />
        </div>
      </section>
      <section className="wrap pb-[clamp(96px,12vw,176px)]">
        <FeatureTrio items={[
            { icon: "fee", title: "No fee", text: "Insurers pay the advisers. Asking a question costs your business nothing." },
            { icon: "doc", title: "Answers from the wording", text: "General information on business insurance, not advice on a specific policy." },
            { icon: "person", title: "An adviser follows up", text: m === "sg" ? "When the answer depends on your policy, an adviser in Singapore replies on WhatsApp." : "When the answer depends on your policy, an adviser replies on WhatsApp." },
          ]} />
      </section>
      <section className="py-[clamp(96px,12vw,176px)]">
        <div className="wrap">
          <h2 className="t-h2">Questions owners ask</h2>
          <div className="mt-[clamp(40px,5vw,64px)] grid gap-x-16 gap-y-12 md:grid-cols-2">
            {faqs.map(f => (
              <div key={f.q} className="">
                <h3 className="t-h3">{f.q}</h3>
                <p className="mt-2 text-ink-2">{f.a}</p>
                <ul className="mt-3 grid gap-1.5 text-[15px] text-ink-2">{f.points.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
