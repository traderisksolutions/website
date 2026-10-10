"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { site } from "@/site";
import { articles, formatDate, type Topic } from "@/content/articles";
import { CoverArt } from "./cover-art";
import { openStart } from "./start-actions";

/** Resources menu, x.ai "Products" style: items on the left, a preview of their blogs on the right. */
const resources: { key: "all" | Topic; title: string; text: string; href: string }[] = [
  { key: "all", title: "Blogs", text: "Plain guides to business insurance in Singapore.", href: "/articles" },
  { key: "Required by law", title: "Required by law", text: "Policies Singapore law requires employers to hold.", href: "/articles?topic=Required%20by%20law" },
  { key: "Liability", title: "Liability", text: "Claims from third parties, clients and contracts.", href: "/articles?topic=Liability" },
  { key: "Property", title: "Property", text: "Premises, stock and lost income.", href: "/articles?topic=Property" },
  { key: "Directors", title: "Directors", text: "Personal cover for directors and officers.", href: "/articles?topic=Directors" },
];

const blogsFor = (key: "all" | Topic) => (key === "all" ? articles : articles.filter(a => a.topic === key)).slice(0, 3);

/** Same bar as traderisksolutions.com.sg and kyn.com.sg: full width at the top, frosted pill after
 *  60px of scroll, hamburger and left drawer at 1024px and below. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);       // mobile drawer
  const [menu, setMenu] = useState(false);       // Resources panel
  const [hover, setHover] = useState<"all" | Topic>("all");
  const [drawerRes, setDrawerRes] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [menu]);

  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setMenu(true); };
  const hide = () => { closeTimer.current = setTimeout(() => setMenu(false), 160); };
  const close = () => setOpen(false);

  return (
    <>
      <header className={`nav${scrolled ? " nav--scrolled" : ""}`}>
        <button type="button" className="nav-hamburger glass" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <Link href="/" className="shrink-0 text-[1.3rem] font-medium leading-none tracking-[-0.03em] hover:opacity-75">{site.name}</Link>

        <nav className="nav-links nav-links--centre" aria-label="Primary">
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
          <div ref={menuRef} className="relative" onPointerEnter={e => e.pointerType === "mouse" && show()} onPointerLeave={e => e.pointerType === "mouse" && hide()}>
            <button type="button" className="nav-menu-btn" aria-expanded={menu} aria-controls="resources-menu" onClick={() => setMenu(m => !m)}>
              Resources
              <svg viewBox="0 0 24 24" aria-hidden className={`size-3.5 transition-transform duration-200 ${menu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div id="resources-menu" className={`mega ${menu ? "mega--open" : ""}`} aria-hidden={!menu}>
              <ul className="w-[236px] shrink-0 py-1.5">
                {resources.map(r => (
                  <li key={r.key}>
                    <Link href={r.href} tabIndex={menu ? 0 : -1} onPointerEnter={() => setHover(r.key)} onFocus={() => setHover(r.key)} onClick={() => setMenu(false)}
                      className={`block rounded-xl px-3.5 py-2.5 transition-colors ${hover === r.key ? "bg-[#f4f3f1]" : ""}`}>
                      <span className="block text-[0.98rem] font-medium text-ink">{r.title}</span>
                      <span className="mt-0.5 block text-[0.8rem] leading-snug text-ink-3">{r.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-[#f4f3f1] p-4">
                <p className="eyebrow px-1">{hover === "all" ? "Latest blogs" : hover}</p>
                <ul key={hover} className="mt-2.5 space-y-1">
                  {blogsFor(hover).map(a => (
                    <li key={a.slug} className="mega-in">
                      <Link href={`/articles/${a.slug}`} tabIndex={menu ? 0 : -1} onClick={() => setMenu(false)} className="flex items-center gap-3.5 rounded-xl p-2 transition-colors hover:bg-white">
                        <span className="size-14 shrink-0 overflow-hidden rounded-lg"><CoverArt article={a} compact /></span>
                        <span className="min-w-0">
                          <span className="block text-[0.92rem] font-medium leading-snug text-ink">{a.title}</span>
                          <span className="mt-0.5 block text-[0.75rem] uppercase tracking-[0.04em] text-ink-3">{formatDate(a.published)} · {a.minutes} min read</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <Link href="/#faq">FAQ</Link>
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
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Mobile primary">
          <DrawerLink href="/" onClick={close} open={open}>Home</DrawerLink>
          <DrawerLink href="/about" onClick={close} open={open}>About</DrawerLink>
          <button type="button" onClick={() => setDrawerRes(v => !v)} aria-expanded={drawerRes} tabIndex={open ? 0 : -1}
            className="flex items-center justify-between rounded-full px-3 py-2.5 text-left text-[15px] font-medium text-ink-2 hover:bg-ink/5 hover:text-ink">
            Resources
            <svg viewBox="0 0 24 24" aria-hidden className={`size-4 transition-transform ${drawerRes ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {drawerRes && (
            <div className="mb-1 ml-3 flex flex-col border-l border-rule pl-2">
              {resources.map(r => <DrawerLink key={r.key} href={r.href} onClick={close} open={open} small>{r.title}</DrawerLink>)}
            </div>
          )}
          <DrawerLink href="/#faq" onClick={close} open={open}>FAQ</DrawerLink>
        </nav>
        <div className="flex flex-col gap-2 border-t border-rule p-3 pb-6">
          <button type="button" onClick={() => { close(); openStart(); }} tabIndex={open ? 0 : -1} className="glass-primary py-2.5 text-center text-sm font-semibold">Start here</button>
          <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} tabIndex={open ? 0 : -1} className="glass py-2.5 text-center text-sm font-medium">Call {site.phone}</a>
        </div>
      </aside>
    </>
  );
}

function DrawerLink({ href, onClick, open, small = false, children }: { href: string; onClick: () => void; open: boolean; small?: boolean; children: string }) {
  return (
    <Link href={href} onClick={onClick} tabIndex={open ? 0 : -1}
      className={`rounded-full px-3 font-medium text-ink-2 hover:bg-ink/5 hover:text-ink ${small ? "py-2 text-[14px]" : "py-2.5 text-[15px]"}`}>{children}</Link>
  );
}
