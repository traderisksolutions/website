"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { faqs, type Icon } from "@/content/faq";
import { faqAnswer } from "@/lib/chat-local";
import { Chat } from "./chat";

/**
 * FAQ in the x.ai/grok pattern. Desktop: questions stack on the left, the one at the middle of
 * the screen in full ink and the rest grey; a sticky chat on the right asks and answers that
 * question, and takes the visitor's own questions. Phone and tablet: the questions as text, then
 * one chat with the questions as suggestions.
 */
export function FaqStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const scripts = useMemo(() => faqs.map(f => ({ id: f.q, q: f.q, a: faqAnswer(f) })), []);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
      <ol className="space-y-12 lg:space-y-0 lg:py-[12svh]">
        {faqs.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.q} ref={el => { refs.current[i] = el; }} data-i={i} className="flex flex-col justify-center lg:min-h-[50svh]">
              <h3 className={`flex items-start gap-3.5 text-[clamp(1.7rem,3.4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.035em] transition-colors duration-500 motion-reduce:transition-none ${on ? "text-ink" : "lg:text-ink/20"}`}>
                <Glyph name={f.icon} />{f.q}
              </h3>
              <p className={`mt-4 max-w-[42ch] text-[1.1rem] leading-relaxed transition-colors duration-500 motion-reduce:transition-none lg:mt-5 lg:text-[1.25rem] ${on ? "text-ink" : "text-ink lg:text-ink/20"}`}>{f.a}</p>
              <ul className={`mt-4 space-y-3 transition-opacity duration-500 motion-reduce:transition-none lg:mt-6 lg:space-y-3.5 ${on ? "" : "lg:opacity-0"}`}>
                {f.points.map(p => (
                  <li key={p} className="flex gap-3.5 text-[1rem] leading-snug text-ink-2"><Tick />{p}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {/* Desktop: one sticky chat that plays the question in view. */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50svh-min(34svh,290px))]">
          <Chat script={scripts[active]} className="h-[min(68svh,580px)]" />
        </div>
      </div>

      {/* Phone and tablet: one chat after the questions. */}
      <div className="lg:hidden">
        <h3 className="text-[1.5rem] font-normal tracking-[-0.03em]">Ask a question</h3>
        <Chat suggestions={scripts} className="mt-4 h-[min(72svh,520px)]" />
      </div>
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
