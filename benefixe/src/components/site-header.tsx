"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./wordmark";

const links = [
  { href: "/", label: "Insider Pass" },
  { href: "/group-benefits", label: "Group benefits" },
  { href: "/perks", label: "All perks" },
];

/** Same navbar as traderisksolutions.com.sg, kyn.com.sg and corpcover: full-width bar,
 *  frosted pill after 60px of scroll, hamburger and left drawer at 1024px and below. */
export function SiteHeader() {
  const pathname = usePathname();
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
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className={`nav${scrolled ? " nav--scrolled" : ""}`}>
        <button type="button" className="nav-hamburger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <Link href="/" className="shrink-0 hover:opacity-75" aria-label="Benefixe home"><Wordmark /></Link>
        <nav className="nav-links nav-links--centre" aria-label="Primary">
          {links.map(l => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Link href="/group-benefits#quote" className="btn-secondary px-4 py-2 text-sm">For employers</Link>
          <Link href="/#join" className="btn-primary px-4 py-2 text-sm">Get the pass</Link>
        </div>
      </header>
      <div aria-hidden className="h-14 shrink-0" />

      <div className="nav-drawer-overlay" aria-hidden onClick={close} />
      <aside className="nav-drawer" aria-label="Mobile navigation" aria-hidden={!open}>
        <div className="flex h-14 items-center justify-between border-b border-rule px-4">
          <Wordmark />
          <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-ink/5" aria-label="Close menu" onClick={close} tabIndex={open ? 0 : -1}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Mobile primary">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={close} tabIndex={open ? 0 : -1}
              className={`rounded-full px-3 py-2.5 text-[15px] font-medium hover:bg-ink/5 hover:text-ink ${isActive(l.href) ? "bg-ink/5 text-ink" : "text-ink-2"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-rule p-3 pb-6">
          <Link href="/#join" onClick={close} tabIndex={open ? 0 : -1} className="btn-primary py-2.5 text-center text-sm">Get the pass</Link>
          <Link href="/group-benefits#quote" onClick={close} tabIndex={open ? 0 : -1} className="btn-secondary py-2.5 text-center text-sm">For employers</Link>
        </div>
      </aside>
    </>
  );
}
