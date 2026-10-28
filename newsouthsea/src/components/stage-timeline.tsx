"use client";

import { useEffect, useRef, useState } from "react";
import { Photo } from "./ui";

export type Stage = { title: string; headline: string; body: string; points: string[]; photo: string };

/** Sticky stage bar over alternating text and photo rows. The bar follows the row in view. */
export function StageTimeline({ stages, id = "stage" }: { stages: Stage[]; id?: string }) {
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -50% 0px" });
    rows.current.forEach(r => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <div>
      <nav aria-label="Stages" className="sticky top-[68px] z-10 -mx-5 overflow-x-auto border-b border-rule bg-background/85 px-5 backdrop-blur md:mx-0 md:px-0">
        <ol className="flex min-w-max gap-8 md:min-w-0 md:justify-between">
          {stages.map((s, i) => (
            <li key={s.title} className="relative">
              <a href={`#${id}-${i}`} className={`flex items-center gap-2 py-4 text-[14px] transition-colors ${i === active ? "text-ink" : "text-muted hover:text-ink-2"}`}>
                <span className="font-mono text-[12px] text-ultra">{String(i + 1).padStart(2, "0")}</span>{s.title}
              </a>
              <span className={`absolute inset-x-0 bottom-[-1px] h-0.5 bg-bronze transition-opacity ${i === active ? "opacity-100" : "opacity-0"}`} aria-hidden />
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col">
        {stages.map((s, i) => (
          <article key={s.title} id={`${id}-${i}`} data-i={i} ref={el => { rows.current[i] = el; }}
            className="grid scroll-mt-36 items-center gap-8 border-b border-rule py-14 last:border-b-0 lg:grid-cols-12 lg:gap-14 lg:py-20">
            <div className={`flex min-w-0 flex-col gap-5 lg:col-span-5 ${i % 2 ? "lg:order-2" : ""}`}>
              <p className="eyebrow"><span className="eyebrow-num">{String(i + 1).padStart(2, "0")} / </span>{s.title}</p>
              <h3 className="display h3 text-ink">{s.headline}</h3>
              <p className="body">{s.body}</p>
              <ul className="grid gap-2 border-t border-rule pt-4">
                {s.points.map(p => <li key={p} className="flex gap-3 text-[15px] text-ink"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-bronze" aria-hidden />{p}</li>)}
              </ul>
            </div>
            <Photo src={s.photo} alt={s.title} className={`aspect-[16/10] w-full lg:col-span-7 ${i % 2 ? "lg:order-1" : ""}`} />
          </article>
        ))}
      </div>
    </div>
  );
}
