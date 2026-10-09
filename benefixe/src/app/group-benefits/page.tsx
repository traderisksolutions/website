import type { Metadata } from "next";
import Link from "next/link";
import { contact, covers, groupFaqs, groupSteps, pass, perks, plans, sgd } from "@/content";
import { Faq } from "@/components/faq";
import { Section, Steps } from "@/components/section";
import { TeamCalculator } from "@/components/team-calculator";

export const metadata: Metadata = {
  title: "Group benefits",
  description: `Group hospital, outpatient, life and accident cover for Singapore companies. The Insider Pass with ${perks.length} perks for every employee at no extra cost.`,
};

const quoteHref = `mailto:${contact.email}?subject=${encodeURIComponent("Group benefits quote")}`;

export default function GroupBenefits() {
  return (
    <main className="flex-1 overflow-x-clip">
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-tile-sage/80 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-40 size-[360px] rounded-full bg-tile-sand/80 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-track px-3 py-1.5 text-[13px] font-medium">
            <span className="size-2 rounded-full bg-ink" /> Group benefits · 3 to 200+ employees
          </span>
          <h1 className="mt-6 max-w-4xl font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.2rem]">
            Group insurance, with the <span className="text-accent">Insider Pass</span> for every employee.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            Hospital, outpatient, life and accident cover, compared across 3 insurers. {perks.length} lifestyle perks on top, {sgd(pass.totalValue)} a year per employee, at no extra cost.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={quoteHref} className="btn-primary btn-accent px-6 py-3.5 text-base">Get a quote</a>
            <Link href="/perks" className="btn-secondary px-6 py-3.5 text-base">See the perks</Link>
          </div>
        </div>
      </section>

      <Section title="Covers" className="!pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {covers.map(c => {
            const isPass = c.short === "PASS";
            return (
              <article key={c.name} className={`rounded-3xl p-6 ${isPass ? "pass-card text-white" : "border border-rule"}`}>
                <span className={`inline-block rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.06em] ${isPass ? "bg-white/20" : "bg-track"}`}>{c.short}</span>
                <h3 className="mt-5 text-xl font-semibold">{c.name}</h3>
                <p className={`mt-1.5 text-[15px] leading-relaxed ${isPass ? "text-white/85" : "text-ink-2"}`}>{c.body}</p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section id="plans" title="Plans" className="!pt-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map(p => (
            <article key={p.name} className={`flex flex-col rounded-[28px] p-7 ${p.highlight ? "bg-ink text-white" : "border border-rule"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">{p.name}</h3>
                {p.highlight && <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">Most chosen</span>}
              </div>
              <div className={`mt-1 text-[15px] ${p.highlight ? "text-white/60" : "text-ink-3"}`}>{p.for}</div>
              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {p.includes.map(i => (
                  <li key={i} className="flex items-start gap-3 text-[15px]">
                    <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>
                    {i}
                  </li>
                ))}
              </ul>
              <div className={`mt-7 border-t pt-5 text-sm ${p.highlight ? "border-white/15 text-white/60" : "border-rule text-ink-3"}`}>Quoted per company</div>
              <a href={quoteHref} className={`mt-4 px-5 py-3 text-[15px] ${p.highlight ? "btn-primary btn-accent" : "btn-secondary"}`}>Get a quote</a>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Team perks value" className="!pt-4">
        <TeamCalculator />
      </Section>

      <Section title="Set-up" className="!pt-4">
        <Steps steps={groupSteps} />
      </Section>

      <section id="quote" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 rounded-[32px] bg-tile-sand p-7 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-5xl">Get a quote</h2>
            <p className="mt-4 max-w-lg text-lg text-ink-2">Send headcount and birth dates. Quotes from 3 insurers within 5 working days.</p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <a href={quoteHref} className="btn-primary px-6 py-3.5 text-base">Email {contact.email}</a>
            <Link href="/perks" className="text-[15px] font-medium text-ink-2 hover:text-ink">See the {perks.length} perks →</Link>
          </div>
        </div>
      </section>

      <Section id="faq" title="FAQ">
        <Faq items={groupFaqs} />
      </Section>
    </main>
  );
}
