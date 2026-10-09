"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/site";
import { openStart } from "./start-actions";

const links = [
  { href: "/", label: "Home" },
  { href: "/articles", label: "Guides" },
  { href: "/#faq", label: "FAQ" },
];

/** Same navbar as traderisksolutions.com.sg and kyn.com.sg: full-width bar at the top,
 *  frosted pill after 60px of scroll, hamburger and left drawer at 1024px and below. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className={`nav${scrolled ? " nav--scrolled" : ""}`}>
        <button type="button" className="nav-hamburger glass" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <Link href="/" className="shrink-0 text-[1.3rem] font-medium leading-none tracking-[-0.03em] hover:opacity-75">{site.name}</Link>
        <nav className="nav-links nav-links--centre" aria-label="Primary">
          {links.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <div className="nav-actions">
          <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="glass px-4 py-2 text-sm font-medium">Call {site.phone}</a>
          <button type="button" onClick={() => openStart()} className="glass-primary px-4 py-2 text-sm font-semibold">Start here</button>
        </div>
      </header>
      <div aria-hidden className="h-14 shrink-0" />

      <div className="nav-drawer-overlay" aria-hidden onClick={close} />
      <aside className="nav-drawer" aria-label="Mobile navigation" aria-hidden={!open}>
        <div className="flex h-14 items-center justify-between border-b border-rule px-4">
          <span className="text-xl font-medium tracking-[-0.03em]">{site.name}</span>
          <button type="button" className="glass grid size-8 place-items-center" aria-label="Close menu" onClick={close} tabIndex={open ? 0 : -1}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Mobile primary">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={close} tabIndex={open ? 0 : -1} className="rounded-full px-3 py-2.5 text-[15px] font-medium text-ink-2 hover:bg-ink/5 hover:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-rule p-3 pb-6">
          <button type="button" onClick={() => { close(); openStart(); }} tabIndex={open ? 0 : -1} className="glass-primary py-2.5 text-center text-sm font-semibold">Start here</button>
          <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} tabIndex={open ? 0 : -1} className="glass py-2.5 text-center text-sm font-medium">Call {site.phone}</a>
        </div>
      </aside>
    </>
  );
}
