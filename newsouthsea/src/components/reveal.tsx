"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Adds .in to section children and grid items as they enter the viewport. Re-runs on navigation.
 *  globals.css hides those elements only under html.js, so the page is complete without JS. */
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("main section:not(.hero) > *, main .cells > *");
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(el => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight * 0.95) el.classList.add("in"); else io.observe(el); });
    return () => io.disconnect();
  }, [path]);
  return null;
}
