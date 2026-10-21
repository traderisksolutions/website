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
      <section className="wrap grid items-start gap-12 pb-[clamp(64px,8vw,104px)] pt-[clamp(48px,8vw,104px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h1 className="t-h1">Ask</h1>
          <p className="t-lede mt-5">One question, one plain answer on business insurance in {M.name}. An adviser follows up on WhatsApp when the answer depends on your policy.</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {["No fee", "General information, not advice on a specific policy", m === "sg" ? "Advisers in Singapore" : "Singapore headquartered"].map(f => <li key={f} className="rounded-full bg-base px-3.5 py-1.5 text-[14.5px]">{f}</li>)}
          </ul>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <a href={wa} target="_blank" rel="noopener" className="btn btn-primary">Message an adviser</a>
            <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="btn btn-ghost">Call +65 {site.phone}</a>
          </div>
        </div>
        <div className="rounded-[12px] bg-base p-[clamp(18px,2.6vw,28px)]">
          <Chat suggestions={suggestions} className="h-[min(64dvh,560px)]" />
        </div>
      </section>
      <section className="bg-base py-[clamp(56px,8vw,96px)]">
        <div className="wrap">
          <h2 className="t-h2">Questions owners ask</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {faqs.map(f => (
              <div key={f.q} className="rounded-[12px] bg-paper p-6">
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
