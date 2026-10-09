import Link from "next/link";
import { categories, categoryTone, contact, pass, passFaqs, passIncludes, passSteps, perks, plans, sgd } from "@/content";
import { PassCard } from "@/components/pass-card";
import { PerkCard } from "@/components/perk-card";
import { PerkIcon } from "@/components/perk-icon";
import { Faq } from "@/components/faq";
import { Section, Steps } from "@/components/section";

const joinHref = `mailto:${contact.email}?subject=${encodeURIComponent("Insider Pass membership")}`;

export default function InsiderPass() {
  const featured = perks.filter(p => p.featured);
  const byCategory = categories.map(c => {
    const list = perks.filter(p => p.category === c);
    return { name: c, count: list.length, value: list.reduce((s, p) => s + p.value, 0), icon: list[0].icon };
  });
  const ratio = Math.round(pass.totalValue / pass.priceYear);

  return (
    <main className="flex-1 overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-tile-blush/70 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-32 top-64 size-[380px] rounded-full bg-tile-sky/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pb-24 md:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-track px-3 py-1.5 text-[13px] font-medium">
              <span className="size-2 rounded-full bg-accent" /> Insider Pass · Singapore
            </span>
            <h1 className="mt-6 font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.4rem]">
              One pass. <span className="text-accent">{perks.length} perks</span> for work and life.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2 sm:text-xl">
              eSIM data, bike rides, gym classes, coffee and {perks.length - 4} more. {sgd(pass.totalValue)} of perks a year for {sgd(pass.priceYear)}.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#join" className="btn-primary btn-accent px-6 py-3.5 text-base">Get the pass</Link>
              <Link href="/perks" className="btn-secondary px-6 py-3.5 text-base">See all {perks.length} perks</Link>
            </div>
            <Link href="/group-benefits" className="mt-6 inline-flex items-center gap-2 text-[15px] text-ink-2 hover:text-ink">
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">Employers</span>
              Free for every employee on a group plan →
            </Link>
          </div>
          <PassCard />
        </div>
      </section>

      {/* Categories */}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 sm:px-6 lg:grid-cols-4">
        {byCategory.map(c => (
          <Link key={c.name} href="/perks" className={`perk-card flex items-center gap-4 rounded-3xl p-5 ${categoryTone[c.name]}`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/70"><PerkIcon name={c.icon} className="size-[22px]" /></span>
            <div>
              <div className="font-display text-lg font-bold tracking-[-0.02em]">{c.name}</div>
              <div className="text-sm text-ink-2">{c.count} perks · {sgd(c.value)}</div>
            </div>
          </Link>
        ))}
      </div>

      <Section title="Featured perks" action={{ href: "/perks", label: `All ${perks.length} perks` }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map(p => <PerkCard key={p.name} perk={p} />)}
        </div>
      </Section>

      <Section id="join" title="Membership" className="!pt-4">
        <div className="grid overflow-hidden rounded-[32px] border border-rule md:grid-cols-[1.15fr_1fr]">
          <div className="p-7 sm:p-10">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl font-bold tracking-[-0.02em]">{pass.name}</span>
              <span className="rounded-full bg-tile-blush px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">Yearly</span>
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-6xl font-extrabold tabular-nums tracking-[-0.04em]">{sgd(pass.priceYear)}</span>
              <span className="text-lg text-ink-2">/ year</span>
            </div>
            <div className="mt-1 text-[15px] text-ink-3">{sgd(pass.priceMonth)} a month, billed yearly</div>
            <ul className="mt-8 flex flex-col gap-3">
              {passIncludes.map(i => (
                <li key={i} className="flex items-start gap-3 text-[16px]">
                  <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>
                  {i}
                </li>
              ))}
            </ul>
            <a href={joinHref} className="btn-primary btn-accent mt-9 w-full px-6 py-3.5 text-base sm:w-auto">Get the pass</a>
          </div>
          <div className="flex flex-col justify-center gap-6 bg-cream p-7 sm:p-10">
            <div>
              <div className="flex justify-between text-sm"><span className="text-ink-2">Perks value</span><span className="font-semibold tabular-nums">{sgd(pass.totalValue)}</span></div>
              <div className="mt-2 h-4 rounded-full bg-accent" />
            </div>
            <div>
              <div className="flex justify-between text-sm"><span className="text-ink-2">Membership</span><span className="font-semibold tabular-nums">{sgd(pass.priceYear)}</span></div>
              <div className="mt-2 h-4 rounded-full bg-ink" style={{ width: `${Math.max(4, (pass.priceYear / pass.totalValue) * 100)}%` }} />
            </div>
            <div className="border-t border-rule pt-6">
              <div className="font-display text-5xl font-extrabold tabular-nums tracking-[-0.04em]">{ratio}×</div>
              <div className="mt-1 text-[15px] text-ink-2">Perks value to price</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="How it works" className="!pt-4">
        <Steps steps={passSteps} />
      </Section>

      {/* Bridge to group benefits */}
      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[32px] bg-ink p-7 text-white sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-accent/40 blur-3xl" />
          <div className="relative grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">For employers</div>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] sm:text-5xl">The pass for your whole team, on every group plan.</h2>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/group-benefits" className="btn-primary btn-accent px-6 py-3.5 text-base">Group benefits</Link>
                <Link href="/group-benefits#quote" className="inline-flex items-center rounded-full px-6 py-3.5 text-base font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">Get a quote</Link>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {plans.map(p => (
                <li key={p.name} className="flex items-center justify-between rounded-2xl bg-white/8 px-5 py-4 ring-1 ring-white/12">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-sm text-white/60">{p.for}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Section id="faq" title="FAQ">
        <Faq items={passFaqs} />
      </Section>
    </main>
  );
}
