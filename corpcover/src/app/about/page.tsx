import type { Metadata } from "next";
import Link from "next/link";
import { StartButton } from "@/components/start-actions";
import { site } from "@/site";

export const metadata: Metadata = {
  title: "About",
  description: "Corp Cover publishes plain guides to business insurance for Singapore companies and connects them with independent advisers. Insurers pay the advisers; your business pays no fee.",
  alternates: { canonical: "/about" },
  twitter: { card: "summary_large_image" },
};

const fees = [
  ["Corp Cover fee", "S$0"],
  ["Adviser fee", "S$0"],
  ["Adviser paid by", "Insurer, as commission"],
  ["Obligation to buy", "None"],
];

const tileClass = "grid content-start gap-2.5 rounded-[24px] bg-paper p-7 text-left transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transition-none";

export default function About() {
  return (
    <main className="flex-1">
      <section className="wrap pb-14 pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">Business insurance advice for Singapore companies</h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          We explain business insurance in plain words, read the policies you already hold, and connect you with independent advisers who compare insurers. Insurers pay the advisers commission. Your business pays no fee.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <StartButton flow="chat" className="btn btn-primary">Ask a question</StartButton>
          <Link href="/policy-review" className="btn btn-ghost">Send my policy for review</Link>
        </div>
      </section>

      <section className="bg-base py-[clamp(56px,8vw,96px)]">
        <div className="wrap">
          <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.025em]">How we work</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <Link href="/articles" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Guides to each policy</b><span className="text-ink-2">Each guide sets out what a policy covers, what it excludes and what to check before you buy or renew.</span></Link>
            <Link href="/policy-review" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Reviews of the cover you hold</b><span className="text-ink-2">Send your policy. An adviser reads the wording and explains the gaps, the overlaps and the price. A review is not a quote.</span></Link>
            <StartButton flow="chat" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Quotes from several insurers</b><span className="text-ink-2">Advisers compare more than one insurer, so you see the range before you decide. A quote is not a commitment.</span></StartButton>
          </div>
        </div>
      </section>

      <section className="wrap grid gap-14 pb-[clamp(80px,10vw,140px)] pt-[clamp(56px,8vw,104px)] lg:grid-cols-2">
        <div>
          <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.025em]">Fees</h2>
          <dl className="mt-6 border-t border-rule">
            {fees.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 border-b border-rule py-4"><dt className="text-ink-2">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.025em]">Contact</h2>
          <dl className="mt-6 border-t border-rule">
            <div className="flex justify-between gap-6 border-b border-rule py-4"><dt className="text-ink-2">Phone</dt><dd><a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="font-medium hover:text-steel">+65 {site.phone}</a></dd></div>
            <div className="flex justify-between gap-6 border-b border-rule py-4"><dt className="text-ink-2">Email</dt><dd><a href={`mailto:${site.email}`} className="font-medium hover:text-steel">{site.email}</a></dd></div>
            <div className="flex justify-between gap-6 border-b border-rule py-4"><dt className="text-ink-2">Address</dt><dd className="max-w-[60%] text-right font-medium">{site.address}</dd></div>
          </dl>
        </div>
      </section>
    </main>
  );
}
