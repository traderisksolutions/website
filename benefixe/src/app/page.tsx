import Link from "next/link";
import { contact, pass, passFaqs, passIncludes, passSteps, perks, plans, sgd } from "@/content";
import { Bento, PassStats } from "@/components/bento";
import { PassFrame } from "@/components/pass-card";
import { PerkIcon } from "@/components/perk-icon";
import { Faq } from "@/components/faq";
import { Check, Section, Steps } from "@/components/section";

const joinHref = `mailto:${contact.email}?subject=${encodeURIComponent("Insider Pass membership")}`;

export default function InsiderPass() {
  const featured = perks.filter(p => p.featured);

  return (
    <main className="flex-1 overflow-x-clip">
      <section className="mx-auto max-w-6xl px-4 pt-14 text-center sm:px-6 md:pt-24">
        <Link href="/perks" className="inline-flex items-center gap-2 rounded-full bg-ink/4 py-1 pl-1 pr-3 text-[13px] hover:bg-ink/7">
          <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-accent shadow-[0_0_0_1px_rgba(10,10,10,.06)]">New</span>
          {perks.filter(p => p.isNew).length} perks added this quarter <span className="text-ink-3">›</span>
        </Link>
        <h1 className="h-display mx-auto mt-7 max-w-3xl text-[2.6rem] sm:text-6xl">One membership.<br />Every perk your team uses.</h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          eSIM data, bike rental, gym classes, counselling and {perks.length - 4} more. One pass, one member page.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Link href="#membership" className="btn-primary btn-lg">Get the pass <span aria-hidden>›</span></Link>
          <Link href="/group-benefits" className="btn-secondary btn-lg">For employers</Link>
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6 md:mt-20">
        <Bento />
      </section>

      {/* Membership split, x.ai product-section layout */}
      <section id="membership" className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-32">
        <div>
          <span className="label">Insider Pass</span>
          <h2 className="h-display mt-3 text-[2.4rem] sm:text-5xl">One pass.<br />{perks.length} perks.</h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">Every code and link on one member page. Partners are added through the year at no extra cost.</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <a href={joinHref} className="btn-primary">Get the pass <span aria-hidden>›</span></a>
            <Link href="/perks" className="btn-secondary">All perks</Link>
          </div>
          <div className="mt-10"><PassStats /></div>
        </div>
        <PassFrame className="aspect-[1.15] w-full" />
      </section>

      <Section title="Featured perks" action={{ href: "/perks", label: `All ${perks.length} perks` }} className="!pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map(p => (
            <div key={p.name} className="tile flex flex-col gap-8 p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-paper shadow-[0_0_0_1px_rgba(10,10,10,.06)]"><PerkIcon name={p.icon} className="size-[18px]" /></span>
              <div>
                <h3 className="text-[15px] font-medium">{p.partner ?? p.name}</h3>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">{p.offer}</p>
                <div className="mt-4 flex justify-between border-t border-rule pt-3 text-[12px]">
                  <span className="text-ink-3">{p.category}</span>
                  <span className="font-mono tabular-nums">{sgd(p.value)}/yr</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Membership options" className="!pt-0">
        <div className="grid gap-3 md:grid-cols-2">
          <article className="tile flex flex-col p-7 sm:p-8">
            <h3 className="text-xl font-medium tracking-[-0.01em]">Individual</h3>
            <p className="mt-1 text-[14px] text-ink-2">For anyone living or working in Singapore.</p>
            <div className="mt-6 flex items-baseline gap-1.5 border-b border-rule pb-6">
              <span className="text-4xl font-medium tabular-nums tracking-[-0.03em]">{sgd(pass.priceYear)}</span>
              <span className="text-[14px] text-ink-3">/ year · {sgd(pass.priceMonth)} a month</span>
            </div>
            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[14px]">
              {passIncludes.map(i => <li key={i} className="flex gap-2.5"><Check className="text-ink-2" />{i}</li>)}
            </ul>
            <a href={joinHref} className="btn-primary mt-8 w-full">Get the pass</a>
          </article>
          <article className="flex flex-col rounded-[18px] bg-night p-7 text-white sm:p-8">
            <h3 className="text-xl font-medium tracking-[-0.01em]">Employer</h3>
            <p className="mt-1 text-[14px] text-white/55">Included with every Benefixe group benefits plan.</p>
            <div className="mt-6 flex items-baseline gap-1.5 border-b border-white/12 pb-6">
              <span className="text-4xl font-medium tabular-nums tracking-[-0.03em]">S$0</span>
              <span className="text-[14px] text-white/45">/ employee for the pass</span>
            </div>
            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[14px]">
              {["Hospital, outpatient, life and accident cover", "Insider Pass for every covered employee", "One admin page for joiners and leavers", `Plans: ${plans.map(p => p.name).join(", ")}`].map(i => (
                <li key={i} className="flex gap-2.5"><Check className="text-white/60" />{i}</li>
              ))}
            </ul>
            <div className="mt-8 grid grid-cols-2 gap-2">
              <Link href="/group-benefits" className="btn-ghost-dark">Group benefits</Link>
              <Link href="/group-benefits#quote" className="btn-primary !bg-white !text-ink hover:!bg-white/90">Get a quote</Link>
            </div>
          </article>
        </div>
      </Section>

      <Section title="How it works" className="!pt-0">
        <Steps steps={passSteps} />
      </Section>

      <Section id="faq" title="FAQ" className="!pt-0">
        <Faq items={passFaqs} />
      </Section>
    </main>
  );
}
