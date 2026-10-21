"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";
// Unsplash Licence: free for commercial use, no attribution required.
import askPhoto from "../../public/images/start/ask.jpg";
import reviewPhoto from "../../public/images/start/review.jpg";
import findPhoto from "../../public/images/start/find.jpg";

const cards: { path: string; word: string; photo: StaticImageData; label: string; big?: boolean }[] = [
  { path: "/policy-review", word: "Review", photo: reviewPhoto, label: "Review your policy" },
  { path: "/ask", word: "Ask", photo: askPhoto, label: "Ask a question", big: true },
  { path: "/get-covered", word: "Select", photo: findPhoto, label: "Select your cover" },
];

/** Start (Revolut): three photo cards, one word and a "Here" button each; each opens its own page. */
export function StartCards({ market = "sg" }: { market?: MarketKey }) {
  return (
    <section aria-labelledby="start-h" className="wrap pb-16 pt-[clamp(48px,8vw,104px)] text-center sm:pb-20">
      {market !== "sg" && <p className="mb-3 text-[15px] font-medium text-steel">Singapore headquartered · serving {MARKETS[market].adj} companies</p>}
      <h1 id="start-h" className="t-h1">Start</h1>
      <div className="-mx-4 mt-12 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-4 pb-4 pt-2 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:gap-[min(16px,1.6vw)] sm:overflow-visible sm:px-0">
        {cards.map(c => (
          <Link key={c.path} href={mpath(market, c.path)} aria-label={c.label} className={`scard${c.big ? " scard--big" : ""}`}>
            <Image src={c.photo} alt="" fill sizes="300px" placeholder="blur" className="object-cover" />
            <span className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-[5cqi] px-[6cqi]">
              <span className="text-[clamp(28px,20cqi,56px)] font-semibold leading-[1.05] tracking-[-0.035em]">{c.word}</span>
              <span className="rounded-[6px] bg-white px-[8cqi] py-[3.6cqi] text-[clamp(12px,5.4cqi,15px)] font-semibold text-ink">Here</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
