import type { Metadata } from "next";
import Link from "next/link";
import { StartButton } from "@/components/start-actions";
import { site } from "@/site";

export const metadata: Metadata = {
  title: "About",
  description: "Corp Cover publishes plain guides to business insurance for Singapore companies and connects companies with independent advisers. Free to use.",
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
        <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">About Corp Cover</h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          Corp Cover publishes plain guides to business insurance for Singapore companies, and connects companies with independent advisers who compare cover across insurers. Free to use.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <StartButton flow="chat" className="btn btn-primary">Ask a question</StartButton>
          <Link href="/policy-review" className="btn btn-ghost">Policy review</Link>
        </div>
      </section>

      <section className="bg-base py-[clamp(56px,8vw,96px)]">
        <div className="wrap">
          <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.025em]">Services</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <Link href="/articles" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Blogs</b><span className="text-ink-2">Plain guides to the policies Singapore companies hold, by topic.</span></Link>
            <Link href="/policy-review" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Policy review</b><span className="text-ink-2">Upload a current policy. An adviser checks the gaps, the overlaps and the price.</span></Link>
            <StartButton flow="chat" className={tileClass}><b className="text-[21px] font-semibold tracking-[-0.02em]">Adviser matching</b><span className="text-ink-2">Independent financial advisers who broker business insurance across several insurers.</span></StartButton>
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
