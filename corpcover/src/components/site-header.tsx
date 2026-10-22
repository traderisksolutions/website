"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/site";
import { Logo } from "./logo";
import { marketOf, mpath } from "@/lib/market";

const LINKS = [
  { path: "/policy-review", label: "Policy review" },
  { path: "/ask", label: "Ask an adviser" },
  { path: "/get-covered", label: "Cover options" },
  { path: "/articles", label: "Insights" },
  { path: "/about", label: "About" },
];

const tel = `tel:+65${site.phone.replace(/\s/g, "")}`;

/** Tallycent's bar: full width, links centred, frosted fade after 24px of scroll;
 *  hamburger and left drawer at 960px and below. */
export function SiteHeader() {
  const path = usePathname();
  const m = marketOf(path);
  const links = LINKS.map(l => ({ href: mpath(m, l.path), label: l.label }));
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);

  return (
    <>
      <header className={`nav${scrolled ? " nav--scrolled" : ""}`}>
        <button type="button" className="nav-hamburger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <Link href={mpath(m)} className="logo" aria-label={`${site.name} home`}><Logo id="logo-nav" name={site.name} /></Link>
        <nav className="nav-links" aria-label="Primary">
          {links.map(l => <Link key={l.href} href={l.href} aria-current={current(l.href)}>{l.label}</Link>)}
        </nav>
        <div className="nav-actions">
          <a href={tel} className="btn btn-ghost nav-call">Call {m === "sg" ? site.phone : `+65 ${site.phone}`}</a>
          <Link href={mpath(m, "/claims")} className="btn btn-primary">Claim second opinion</Link>
        </div>
      </header>
      <div aria-hidden className="h-[72px] shrink-0" />

      <div className="nav-drawer-overlay" aria-hidden onClick={close} />
      <aside className="nav-drawer" aria-label="Mobile navigation" aria-hidden={!open}>
        <div className="flex h-16 items-center justify-between border-b border-rule px-4">
          <span className="logo"><Logo id="logo-drawer" name={site.name} /></span>
          <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-ink/5" aria-label="Close menu" onClick={close} tabIndex={open ? 0 : -1}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Mobile primary">
          {[{ href: mpath(m), label: "Home" }, ...links, { href: mpath(m, "/ask"), label: "FAQ" }].map(l => (
            <Link key={l.href} href={l.href} onClick={close} tabIndex={open ? 0 : -1} aria-current={l.href === mpath(m) ? (path === mpath(m) ? "page" : undefined) : current(l.href)}
              className="rounded-[12px] px-3 py-2.5 text-[16px] text-ink-2 hover:bg-ink/5 hover:text-ink aria-[current=page]:bg-ink/5 aria-[current=page]:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="grid gap-2 p-3 pb-6">
          <Link href={mpath(m, "/claims")} onClick={close} tabIndex={open ? 0 : -1} className="btn btn-primary">Claim second opinion</Link>
                    <a href={tel} tabIndex={open ? 0 : -1} className="btn btn-ghost">Call +65 {site.phone}</a>
        </div>
      </aside>
    </>
  );
}

