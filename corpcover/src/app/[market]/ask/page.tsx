import { FaqList } from "@/components/faq-list";
import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { faqsFor } from "@/content/faq";
import { faqAnswer } from "@/lib/chat-local";
import { JsonLd, faqPage } from "@/lib/json-ld";
import { MARKETS, alternates, marketParam } from "@/lib/market";

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
  return (
    <main className="flex-1">
      <JsonLd data={faqPage(faqs)} />
      <section className="wrap grid items-start gap-12 pb-[clamp(96px,12vw,176px)] pt-[clamp(72px,10vw,144px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h1 className="t-h1">Adviser chat</h1>
          <p className="t-lede mt-7">Ask anything about business insurance in {M.name}. Answers come from our guides and the policy wordings, with the clause named. An adviser picks up when the answer depends on your own policy.</p>

        </div>
        <Chat suggestions={suggestions} className="chat-window h-[min(70dvh,640px)]" />
      </section>
      <section className="py-[clamp(96px,12vw,176px)]">
        <div className="wrap">
          <h2 className="t-h2">Questions owners ask</h2>
          <FaqList items={faqs} className="mt-[clamp(32px,4vw,48px)]" />
        </div>
      </section>
    </main>
  );
}
