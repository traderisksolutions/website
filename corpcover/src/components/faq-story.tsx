"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { faqs, type Icon } from "@/content/faq";
import { faqAnswer } from "@/lib/chat-local";
import { Chat } from "./chat";

/**
 * FAQ in the x.ai/grok pattern. Desktop: questions stack on the left, the one at the middle of
 * the screen in full ink and the rest grey. A sticky chat on the right holds one conversation
 * with all five questions; it plays once when it comes on screen and stays put while the left
 * side scrolls. Phone and tablet: the questions as text, then one chat with the questions as
 * suggestions.
 */
export function FaqStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const scripts = useMemo(() => faqs.map(f => ({ id: f.q, q: f.q, a: faqAnswer(f) })), []);

  // Active question: the one whose centre is nearest the middle of the screen, so one is always lit.
  useEffect(() => {
    let frame = 0;
    const pick = () => {
      frame = 0;
      const mid = innerHeight / 2;
      let best = 0, bestD = Infinity;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      setActive(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick); };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
      <ol className="space-y-12 lg:space-y-0 lg:py-[12svh]">
        {faqs.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.q} ref={el => { refs.current[i] = el; }} className="flex flex-col justify-center lg:min-h-[50svh]">
              <h3 className={`flex items-start gap-3.5 text-[clamp(1.7rem,3.4vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] transition-colors duration-500 motion-reduce:transition-none ${on ? "text-ink" : "lg:text-ink/20"}`}>
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

      {/* Desktop: one sticky chat holding the whole conversation. It plays once and does not follow the scroll. */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(36px+50svh-min(31svh,270px))]">
          <Chat sequence={scripts} className="h-[min(62svh,540px)]" />
        </div>
      </div>

      {/* Phone and tablet: one chat after the questions. */}
      <div className="lg:hidden">
        <h3 className="text-[1.5rem] font-semibold tracking-[-0.02em]">Ask a question</h3>
        <Chat sequence={scripts} className="mt-4 h-[min(72svh,520px)]" />
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
