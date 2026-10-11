"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { blogs, formatDate, type Topic } from "@/content/blogs";
import { BlogCover } from "./blog-cover";
import { Wordmark } from "./wordmark";

const links = [
  { href: "/", label: "Insider Pass" },
  { href: "/group-benefits", label: "Group benefits" },
  { href: "/perks", label: "All perks" },
];

/** Resources menu, x.ai "Products" style (same as corpcover): items left, a preview of their blogs right. */
const resources: { key: "all" | Topic; title: string; text: string; href: string }[] = [
  { key: "all", title: "Blogs", text: "Guides to group insurance, perks and benefits plans.", href: "/blogs" },
];

const blogsFor = (key: "all" | Topic) => (key === "all" ? blogs : blogs.filter(b => b.topic === key)).slice(0, 3);

/** Same bar as traderisksolutions.com.sg, kyn.com.sg and corpcover: full width at the top, frosted pill
 *  after 60px of scroll, hamburger and left drawer at 1024px and below. */
export function SiteHeader() {
  const pathname = usePathname();
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
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const onResources = pathname.startsWith("/blogs");

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
          <div ref={menuRef} className="relative" onPointerEnter={e => e.pointerType === "mouse" && show()} onPointerLeave={e => e.pointerType === "mouse" && hide()}>
            <button type="button" className={`nav-menu-btn${onResources ? " is-current" : ""}`} aria-expanded={menu} aria-controls="resources-menu" onClick={() => setMenu(m => !m)}>
              Resources
              <svg viewBox="0 0 24 24" aria-hidden className={`size-3.5 transition-transform duration-200 ${menu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div id="resources-menu" className={`mega ${menu ? "mega--open" : ""}`} aria-hidden={!menu}>
              <ul className="w-[236px] shrink-0 py-1.5">
                {resources.map(r => (
                  <li key={r.key}>
                    <Link href={r.href} tabIndex={menu ? 0 : -1} onPointerEnter={() => setHover(r.key)} onFocus={() => setHover(r.key)} onClick={() => setMenu(false)}
                      className={`block rounded-xl px-3.5 py-2.5 transition-colors ${hover === r.key ? "bg-surface" : ""}`}>
                      <span className="block text-[15px] font-medium text-ink">{r.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{r.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-surface p-4">
                <p className="mono-label px-1">Latest blogs</p>
                <ul key={hover} className="mt-2.5 space-y-1">
                  {blogsFor(hover).map(b => (
                    <li key={b.slug} className="mega-in">
                      <Link href={`/blogs/${b.slug}`} tabIndex={menu ? 0 : -1} onClick={() => setMenu(false)} className="flex items-center gap-3.5 rounded-xl p-2 transition-colors hover:bg-paper">
                        <span className="size-14 shrink-0 overflow-hidden rounded-lg"><BlogCover blog={b} compact /></span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium leading-snug text-ink">{b.title}</span>
                          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{formatDate(b.published)} · {b.minutes} min read</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </nav>

        <div className="nav-actions">
          <Link href="/group-benefits#quote" className="btn-secondary">For employers</Link>
          <Link href="/#membership" className="btn-primary">Get the pass</Link>
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
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Mobile primary">
          {links.map(l => <DrawerLink key={l.href} href={l.href} onClick={close} open={open} current={isActive(l.href)}>{l.label}</DrawerLink>)}
          <button type="button" onClick={() => setDrawerRes(v => !v)} aria-expanded={drawerRes} tabIndex={open ? 0 : -1}
            className="flex items-center justify-between rounded-full px-3 py-2.5 text-left text-[15px] font-medium text-ink-2 hover:bg-ink/5 hover:text-ink">
            Resources
            <svg viewBox="0 0 24 24" aria-hidden className={`size-4 transition-transform ${drawerRes ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {drawerRes && (
            <div className="mb-1 ml-3 flex flex-col border-l border-rule pl-2">
              {resources.map(r => <DrawerLink key={r.key} href={r.href} onClick={close} open={open} small current={onResources}>{r.title}</DrawerLink>)}
            </div>
          )}
        </nav>
        <div className="flex flex-col gap-2 border-t border-rule p-3 pb-6">
          <Link href="/#membership" onClick={close} tabIndex={open ? 0 : -1} className="btn-primary">Get the pass</Link>
          <Link href="/group-benefits#quote" onClick={close} tabIndex={open ? 0 : -1} className="btn-secondary">For employers</Link>
        </div>
      </aside>
    </>
  );
}

function DrawerLink({ href, onClick, open, small = false, current = false, children }: { href: string; onClick: () => void; open: boolean; small?: boolean; current?: boolean; children: string }) {
  return (
    <Link href={href} onClick={onClick} tabIndex={open ? 0 : -1}
      className={`rounded-full px-3 font-medium hover:bg-ink/5 hover:text-ink ${current ? "bg-ink/5 text-ink" : "text-ink-2"} ${small ? "py-2 text-[14px]" : "py-2.5 text-[15px]"}`}>{children}</Link>
  );
}
