"use client";

import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { openStart, type Flow } from "./start-actions";
// Unsplash Licence: free for commercial use, no attribution required.
import askPhoto from "../../public/images/start/ask.jpg";
import reviewPhoto from "../../public/images/start/review.jpg";
import findPhoto from "../../public/images/start/find.jpg";

const icons: Record<string, ReactNode> = {
  review: <path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
  chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5Z" />,
  finder: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
};

const cards: { flow: Flow; word: string; cap: string; photo: StaticImageData; title: string; sub: string; big?: boolean }[] = [
  { flow: "review", word: "Review", cap: "Upload your current policy", photo: reviewPhoto, title: "Policy review", sub: "PDF, JPG or PNG, up to 4 MB" },
  { flow: "chat", word: "Ask", cap: "Ask anything about business insurance", photo: askPhoto, title: "Ask a question", sub: "An adviser takes over on WhatsApp", big: true },
  { flow: "finder", word: "Find", cap: "Answer five questions", photo: findPhoto, title: "Find my cover", sub: "The policies a company like yours holds" },
];

/** Start here (Revolut): three photo cards, one word each; a card opens its flow in the start modal. */
export function StartCards() {
  return (
    <section aria-label="Start here" className="wrap pb-16 pt-[clamp(48px,8vw,104px)] text-center sm:pb-20">
      <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Start here</h1>
      <p className="mt-3.5 text-[clamp(1.1rem,1.6vw,1.35rem)] text-ink-2">No fee. No obligation to buy.</p>
      <div className="-mx-4 mt-12 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-4 pb-4 pt-2 [scrollbar-width:none] lg:mx-0 lg:justify-center lg:overflow-visible lg:px-0">
        {cards.map(c => (
          <button key={c.flow} type="button" onClick={() => openStart(c.flow)} aria-label={`${c.word}: ${c.title}`} className={`scard${c.big ? " scard--big" : ""}`}>
            <Image src={c.photo} alt="" fill sizes="300px" placeholder="blur" className="object-cover" />
            <span className="absolute inset-x-0 bottom-24 top-0 z-[1] flex flex-col items-center justify-center gap-1 px-4">
              <span className="text-sm text-white/85">{c.cap}</span>
              <span className="text-[52px] font-semibold leading-[1.05] tracking-[-0.035em]">{c.word}</span>
              <span className="mt-3 rounded-full bg-white px-[18px] py-[9px] text-sm font-medium text-ink">Continue</span>
            </span>
            <span className="absolute inset-x-2.5 bottom-2.5 z-[1] flex items-center gap-3 rounded-[14px] bg-white px-3.5 py-3 text-left text-ink">
              <span className="grid size-8 flex-none place-items-center rounded-full bg-accent text-white">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[c.flow]}</svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.title}</span>
                <span className="block text-[12.5px] leading-snug text-ink-2">{c.sub}</span>
              </span>
              <span className="text-sm font-semibold">Free</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
