import type { Metadata } from "next";
import { StartButton } from "@/components/start-actions";
import { site } from "@/site";

export const metadata: Metadata = {
  title: "About",
  description: "Corp Cover publishes plain guides to business insurance for Singapore companies and connects companies with independent advisers. Free to use.",
  alternates: { canonical: "/about" },
  twitter: { card: "summary_large_image" },
};

const services = [
  { title: "Blogs", text: "Plain guides to the policies Singapore companies hold, by topic." },
  { title: "Policy review", text: "Upload a current policy. An adviser checks the gaps, the overlaps and the price." },
  { title: "Adviser matching", text: "Independent financial advisers who broker business insurance across several insurers." },
];

const fees = [
  ["Corp Cover fee", "S$0"],
  ["Adviser fee", "S$0"],
  ["Adviser paid by", "Insurer, as commission"],
  ["Obligation to buy", "None"],
];

export default function About() {
  const tel = `tel:+65${site.phone.replace(/\s/g, "")}`;
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 lg:py-20">
      <h1 className="max-w-[18ch] text-[clamp(2.4rem,5.5vw,4.5rem)] font-normal leading-[1.02] tracking-[-0.045em]">About Corp Cover</h1>
      <p className="mt-6 max-w-[52ch] text-[clamp(1.1rem,1.6vw,1.35rem)] leading-relaxed text-ink-2">
        Corp Cover publishes plain guides to business insurance for Singapore companies, and connects companies with independent advisers who compare cover across insurers. Free to use.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <StartButton flow="chat" className="glass-primary px-6 py-3 text-sm font-semibold">Ask a question</StartButton>
        <StartButton className="glass px-6 py-3 text-sm font-medium">Start here</StartButton>
      </div>

      <section className="mt-20 border-t border-rule pt-10">
        <h2 className="text-[1.75rem] font-normal tracking-[-0.03em]">Services</h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {services.map(s => (
            <div key={s.title}>
              <h3 className="text-lg font-medium">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 border-t border-rule pt-10">
        <h2 className="text-[1.75rem] font-normal tracking-[-0.03em]">Fees</h2>
        <dl className="mt-6 max-w-xl divide-y divide-rule border-y border-rule">
          {fees.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-4">
              <dt className="text-ink-2">{k}</dt><dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16 border-t border-rule pt-10">
        <h2 className="text-[1.75rem] font-normal tracking-[-0.03em]">Contact</h2>
        <dl className="mt-6 grid max-w-xl gap-4 sm:grid-cols-[8rem_1fr]">
          <dt className="text-ink-3">Phone</dt><dd><a href={tel} className="font-medium text-accent hover:underline">{site.phone}</a></dd>
          <dt className="text-ink-3">Email</dt><dd><a href={`mailto:${site.email}`} className="font-medium text-accent hover:underline">{site.email}</a></dd>
          <dt className="text-ink-3">Address</dt><dd className="text-ink-2">{site.address}</dd>
        </dl>
      </section>
    </main>
  );
}
