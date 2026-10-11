"use client";

import { useEffect, useState } from "react";

/** Lenny-style contents rail: one dash per section, fixed on the left at wide screens.
 *  Hover or focus opens the section titles; the current section's dash is darker. */
export function TocRail({ items }: { items: { id: string; text: string }[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = items.map(i => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(entries => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-20% 0px -70% 0px" });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  if (items.length < 2) return null;
  return (
    <nav aria-label="Contents" className="group fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
      <ul className="flex flex-col gap-2 rounded-2xl p-2 transition-colors group-focus-within:bg-paper/90 group-hover:bg-paper/90 group-hover:shadow-[0_4px_24px_rgba(0,0,0,0.08)] group-focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        {items.map(i => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="flex items-center gap-3 text-sm">
              <span aria-hidden className={`h-0.5 shrink-0 rounded-full ${active === i.id ? "w-4 bg-ink" : "w-3 bg-ink-3/60"}`} />
              <span className={`hidden max-w-[16rem] truncate group-focus-within:block group-hover:block ${active === i.id ? "font-semibold text-ink" : "text-ink-2"}`}>{i.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
