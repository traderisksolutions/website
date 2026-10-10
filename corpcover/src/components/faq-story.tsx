"use client";

import { useMemo, useState, type ReactNode } from "react";
import { faqs, type Icon } from "@/content/faq";
import { faqAnswer } from "@/lib/chat-local";
import { Chat, type Jump } from "./chat";

/**
 * FAQ as one conversation in the x.ai/grok style. The chat plays all five questions in order,
 * once, when it first comes on screen. Desktop: the questions are listed on the left, the one
 * being answered in full ink; clicking one jumps the chat to it. Phone: the chat alone.
 */
export function FaqStory() {
  const [active, setActive] = useState(0);
  const [jump, setJump] = useState<Jump>();
  const scripts = useMemo(() => faqs.map(f => ({ id: f.q, q: f.q, a: faqAnswer(f) })), []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
      <ol className="hidden lg:block">
        {faqs.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.q}>
              <button type="button" onClick={() => setJump({ i, n: Date.now() })} aria-current={on || undefined}
                className={`group flex w-full flex-col items-start py-3.5 text-left transition-colors duration-500 motion-reduce:transition-none ${on ? "text-ink" : "text-ink/25 hover:text-ink/60"}`}>
                <span className="flex items-start gap-3 text-[clamp(1.45rem,2.3vw,2rem)] font-normal leading-[1.12] tracking-[-0.03em]">
                  <Glyph name={f.icon} />{f.q}
                </span>
                <span className={`grid w-full pl-[calc(0.85em+0.75rem)] transition-[grid-template-rows,opacity] duration-500 motion-reduce:transition-none ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <span className="overflow-hidden">
                    <span className="block max-w-[40ch] pt-2.5 text-[1.05rem] leading-relaxed text-ink-2">{f.a}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Chat sequence={scripts} onActive={setActive} jump={jump} className="h-[min(78svh,640px)]" />
    </div>
  );
}

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
