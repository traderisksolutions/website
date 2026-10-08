"use client";

import { useEffect, useRef, useState } from "react";
import { faqs, insurers, type Faq } from "@/content/faq";

const tones = ["bg-tile-sage", "bg-tile-sand", "bg-tile-sky", "bg-tile-blush"];
const toneOf = (i: number) => tones[i % tones.length];

/**
 * FAQ as a storyboard. Desktop: the question sits in a large tile pinned on the left and changes
 * as each answer reaches the middle of the screen; the answer in view is full strength, the rest
 * fade back. Phone and tablet: each question tile sits above its answer.
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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      {/* Pinned question tile, desktop only */}
      <div aria-hidden className="hidden lg:block">
        <div className="sticky top-[calc(50svh-min(30svh,250px))]">
          <div className={`relative h-[min(60svh,500px)] overflow-hidden rounded-[28px] transition-colors duration-500 motion-reduce:transition-none ${toneOf(active)}`}>
            {faqs.map((f, i) => (
              <div key={f.q}
                className={`absolute inset-0 flex items-end p-10 xl:p-12 transition-[opacity,transform] duration-500 motion-reduce:transition-none ${i === active ? "opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}>
                <p className="text-[clamp(2rem,3.4vw,3.1rem)] font-bold leading-[1.08] tracking-[-0.025em] [text-wrap:balance]">{f.q}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-1.5">
            {faqs.map((f, i) => <span key={f.q} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= active ? "bg-accent" : "bg-ink/10"}`} />)}
          </div>
        </div>
      </div>

      {/* Answers */}
      <ol className="lg:py-[16svh]">
        {faqs.map((f, i) => (
          <li key={f.q} ref={el => { refs.current[i] = el; }} data-i={i}
            className={`flex flex-col justify-center py-6 transition-opacity duration-500 motion-reduce:transition-none lg:min-h-[60svh] lg:py-0 ${i === active ? "lg:opacity-100" : "lg:opacity-25"}`}>
            <h3 className={`rounded-3xl p-7 text-[clamp(1.6rem,6vw,2.2rem)] font-bold leading-[1.12] tracking-tight [text-wrap:balance] sm:p-9 lg:sr-only ${toneOf(i)}`}>{f.q}</h3>
            <Answer parts={f.a} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Answer({ parts }: { parts: Faq["a"] }) {
  return (
    <div className="mt-5 max-w-[56ch] space-y-4 text-[1.1rem] leading-relaxed text-ink-2 lg:mt-0 lg:text-[1.2rem]">
      {parts.map((p, i) => typeof p === "string"
        ? <p key={i}>{p}</p>
        : p === insurers
          ? <ul key={i} className="flex flex-wrap gap-2">{p.map(n => (
              <li key={n} className="rounded-full border border-ink/15 px-3.5 py-1.5 text-[0.95rem] font-semibold text-ink">{n}</li>
            ))}</ul>
          : <ul key={i} className="space-y-2">{p.map(x => (
              <li key={x} className="flex gap-3"><Tick />{x}</li>
            ))}</ul>)}
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 16 16" aria-hidden className="mt-[0.45em] size-4 shrink-0 text-accent"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
