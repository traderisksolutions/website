import type { Metadata } from "next";
import Link from "next/link";
import { contact, covers, groupFaqs, groupSteps, pass, perks, plans, sgd } from "@/content";
import { Faq } from "@/components/faq";
import { Check, Section, Steps } from "@/components/section";
import { TeamCalculator } from "@/components/team-calculator";

export const metadata: Metadata = {
  title: "Group benefits",
  description: `Group hospital, outpatient, life and accident cover for Singapore companies. The Insider Pass with ${perks.length} perks for every employee at no extra cost.`,
};

const quoteHref = `mailto:${contact.email}?subject=${encodeURIComponent("Group benefits quote")}`;

function CoverStack() {
  const rows = covers.filter(c => c.short !== "PASS");
  return (
    <div className="crop aspect-[1.1] w-full">
      <i /><i /><i /><i />
      <div className="ember grid h-full place-items-center rounded-[4px] p-6 sm:p-10">
        <div className="w-full max-w-[360px] rounded-2xl bg-paper p-4 shadow-[0_30px_60px_-25px_rgba(60,10,0,.55)]">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <span className="text-[13px] font-medium">Plus plan · 25 employees</span>
            <span className="flex items-center gap-1.5 text-[11px] text-ink-2"><span className="size-1.5 rounded-full bg-emerald-500" />Active</span>
          </div>
          <ul className="divide-y divide-rule">
            {rows.map(c => (
              <li key={c.short} className="flex items-center justify-between py-2.5 text-[13px]">
                <span>{c.name}</span>
                <span className="font-mono text-[11px] text-ink-3">{c.short}</span>
              </li>
            ))}
            <li className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="font-medium">Insider Pass · {perks.length} perks</span>
              <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] text-white">PASS</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function GroupBenefits() {
  return (
    <main className="flex-1 overflow-x-clip">
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-10 pt-14 sm:px-6 md:grid-cols-2 md:pt-24">
        <div>
          <span className="label">Group benefits · 3 to 200+ employees</span>
          <h1 className="h-display mt-4 text-[2.6rem] sm:text-6xl">Group insurance.<br />Insider Pass included.</h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-2">
            Hospital, outpatient, life and accident cover, compared across 3 insurers. {perks.length} perks for every employee, {sgd(pass.totalValue)} a year each, at no extra cost.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <a href={quoteHref} className="btn-primary btn-lg">Get a quote <span aria-hidden>›</span></a>
            <Link href="/perks" className="btn-secondary btn-lg">See the perks</Link>
          </div>
        </div>
        <CoverStack />
      </section>

      <Section title="Covers">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {covers.map(c => {
            const isPass = c.short === "PASS";
            return (
              <article key={c.name} className={`flex min-h-[180px] flex-col justify-between rounded-[18px] p-6 ${isPass ? "bg-night text-white" : "tile"}`}>
                <span className={`font-mono text-[11px] tracking-[0.06em] ${isPass ? "text-[#ff9a62]" : "text-ink-3"}`}>{c.short}</span>
                <div>
                  <h3 className="text-[17px] font-medium tracking-[-0.01em]">{c.name}</h3>
                  <p className={`mt-1.5 text-[14px] leading-relaxed ${isPass ? "text-white/60" : "text-ink-2"}`}>{c.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section id="plans" title="Plans" className="!pt-0">
        <div className="grid gap-3 lg:grid-cols-3">
          {plans.map(p => {
            const dark = p.highlight;
            return (
              <article key={p.name} className={`flex flex-col rounded-[18px] p-7 ${dark ? "bg-night text-white" : "tile"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-medium tracking-[-0.01em]">{p.name}</h3>
                  {dark && <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]">Most chosen</span>}
                </div>
                <div className={`mt-1 text-[14px] ${dark ? "text-white/50" : "text-ink-3"}`}>{p.for}</div>
                <ul className={`mt-6 flex flex-1 flex-col gap-2.5 border-t pt-6 text-[14px] ${dark ? "border-white/12" : "border-rule"}`}>
                  {p.includes.map(i => <li key={i} className="flex gap-2.5"><Check className={dark ? "text-white/60" : "text-ink-2"} />{i}</li>)}
                </ul>
                <div className={`mt-7 text-[12px] ${dark ? "text-white/45" : "text-ink-3"}`}>Quoted per company</div>
                <a href={quoteHref} className={`mt-3 w-full ${dark ? "btn-primary !bg-white !text-ink hover:!bg-white/90" : "btn-primary"}`}>Get a quote</a>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Team perks value" className="!pt-0">
        <TeamCalculator />
      </Section>

      <Section title="Set-up" className="!pt-0">
        <Steps steps={groupSteps} />
      </Section>

      <section id="quote" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="tile flex flex-col gap-6 p-7 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="h-display text-3xl sm:text-[2.6rem]">Get a quote</h2>
            <p className="mt-3 max-w-lg text-[15px] text-ink-2">Send headcount and birth dates. Quotes from 3 insurers within 5 working days.</p>
          </div>
          <a href={quoteHref} className="btn-primary btn-lg shrink-0">Email {contact.email}</a>
        </div>
      </section>

      <Section id="faq" title="FAQ">
        <Faq items={groupFaqs} />
      </Section>
    </main>
  );
}
