"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { faqs, insurers, policyGroups, type Icon, type Panel } from "@/content/faq";
import { openStart } from "./start-actions";

/**
 * FAQ in the x.ai/grok pattern. Desktop: questions stack on the left, the one at the middle of
 * the screen is in full ink and the rest fade to grey; a sticky panel on the right shows that
 * question's facts and cross-fades as you scroll. Phone and tablet: each panel sits under its answer.
 */
export function FaqStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
      <ol className="space-y-16 lg:space-y-0 lg:py-[12svh]">
        {faqs.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.q} ref={el => { refs.current[i] = el; }} data-i={i} className="flex flex-col justify-center lg:min-h-[50svh]">
              <h3 className={`flex items-start gap-3.5 text-[clamp(1.9rem,3.4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.035em] transition-colors duration-500 motion-reduce:transition-none ${on ? "text-ink" : "lg:text-ink/20"}`}>
                <Glyph name={f.icon} />{f.q}
              </h3>
              <p className={`mt-5 max-w-[42ch] text-[1.15rem] leading-relaxed transition-colors duration-500 motion-reduce:transition-none lg:text-[1.25rem] ${on ? "text-ink" : "text-ink lg:text-ink/20"}`}>{f.a}</p>
              <ul className={`mt-6 space-y-3.5 transition-opacity duration-500 motion-reduce:transition-none ${on ? "" : "lg:opacity-0"}`}>
                {f.points.map(p => (
                  <li key={p} className="flex gap-3.5 text-[1.02rem] leading-snug text-ink-2"><Tick />{p}</li>
                ))}
              </ul>
              <div className="mt-8 lg:hidden"><Frame><PanelBody panel={f.panel} /></Frame></div>
            </li>
          );
        })}
      </ol>

      {/* Sticky panel, desktop only. Every panel is stacked in one cell; the active one shows. */}
      <div aria-hidden className="hidden lg:block">
        <div className="sticky top-[calc(50svh-min(34svh,290px))]">
          <Frame className="grid h-[min(68svh,580px)] [&>*]:col-start-1 [&>*]:row-start-1">
            {faqs.map((f, i) => (
              <div key={f.q} className={`flex flex-col transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${i === active ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
                <PanelBody panel={f.panel} />
              </div>
            ))}
          </Frame>
        </div>
      </div>
    </div>
  );
}

function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[28px] border border-rule bg-[#f8f7f6] p-6 sm:p-9 ${className}`}>{children}</div>;
}

function PanelBody({ panel }: { panel: Panel }) {
  if (panel === "cost") return (
    <div className="flex h-full flex-col justify-between gap-10">
      <div>
        <p className="eyebrow">Your fee</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-[clamp(4.5rem,9vw,8rem)] font-thin leading-none tracking-[-0.05em]">S$0</p>
      </div>
      <dl className="divide-y divide-rule rounded-2xl border border-rule bg-white">
        {[["Corp Cover fee", "S$0"], ["Adviser fee", "S$0"], ["Adviser paid by", "Insurer, as commission"]].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-4">
            <dt className="text-ink-2">{k}</dt><dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  if (panel === "advisers") return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Insurers brokered</p>
        <p className="text-3xl font-light tracking-tight">{insurers.length}</p>
      </div>
      <ul className="flex flex-wrap content-start gap-2">
        {insurers.map(n => <li key={n} className="rounded-full border border-rule bg-white px-3.5 py-1.5 text-[0.92rem] font-medium">{n}</li>)}
      </ul>
    </div>
  );

  if (panel === "policies") return (
    <div className="grid h-full content-start gap-7 sm:grid-cols-2">
      {policyGroups.map(g => (
        <div key={g.name} className={g.items.length > 3 ? "sm:col-span-2" : ""}>
          <p className="eyebrow">{g.name}</p>
          <ul className={`mt-3 grid gap-2 ${g.items.length > 3 ? "sm:grid-cols-2" : ""}`}>
            {g.items.map(x => <li key={x} className="rounded-xl border border-rule bg-white px-4 py-2.5 text-[0.95rem]">{x}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );

  if (panel === "decide") return (
    <div className="flex h-full flex-col justify-center gap-3">
      <p className="eyebrow mb-2">After the quotes</p>
      {["Buy through the adviser", "Buy from another adviser or insurer", "Keep your current cover"].map(o => (
        <div key={o} className="flex items-center gap-3.5 rounded-2xl border border-rule bg-white px-5 py-4">
          <span className="size-5 shrink-0 rounded-full border border-ink/25" />{o}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {[["Upload policy for review", "PDF, JPG or PNG"], ["Find my cover", "5 questions"], ["Talk to an adviser", "WhatsApp, callback or phone"]].map(([t, d]) => (
        <button key={t} type="button" onClick={openStart} className="group flex items-center justify-between gap-4 rounded-2xl border border-rule bg-white px-5 py-4 text-left transition-colors hover:border-accent">
          <span><span className="block font-medium">{t}</span><span className="text-sm text-ink-3">{d}</span></span>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      ))}
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 16 16" aria-hidden className="mt-[0.2em] size-4 shrink-0 text-ink-3"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const paths: Record<Icon, ReactNode> = {
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>,
  stack: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  arrow: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8m-3.5-3.5L16 12l-3.5 3.5" /></>,
};

const Glyph = ({ name }: { name: Icon }) => (
  <svg viewBox="0 0 24 24" aria-hidden className="mt-[0.14em] size-[0.85em] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
);

