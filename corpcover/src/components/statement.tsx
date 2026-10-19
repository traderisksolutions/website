"use client";

import { useEffect, useRef } from "react";

const TEXT = "We publish plain guides to business insurance, so you can compare cover and decide for yourself.";

/** One sentence, pinned mid-screen; its words go from grey to ink as the page scrolls past. */
export function Statement() {
  const section = useRef<HTMLElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const light = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - innerHeight;
      const p = Math.min(1, Math.max(0, (-r.top + innerHeight * 0.35) / (span + innerHeight * 0.2)));
      const n = Math.round(p * words.current.length);
      words.current.forEach((w, i) => w?.classList.toggle("lit", i < n));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(light); };
    light();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  return (
    <section ref={section} className="statement" aria-label="Why Corp Cover writes">
      <div className="statement-pin wrap">
        <p className="max-w-[22ch] text-center text-[clamp(2rem,4.4vw,3.9rem)] font-semibold leading-[1.1] tracking-[-0.025em]">
          {TEXT.split(" ").map((w, i) => <span key={i}><span ref={el => { words.current[i] = el; }} className="w">{w}</span>{" "}</span>)}
        </p>
      </div>
    </section>
  );
}
