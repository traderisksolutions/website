"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COVERAGE_MENU, INDUSTRY_MENU, PLAIN_LINKS } from "@/content/nav";
import { site } from "@/site";
import { Mark } from "./wordmark";

type Menu = "coverage" | "industries" | null;

/** Sticky white bar with a hairline. Coverage and Industries open panels on hover or click;
 *  at 1024px and below the links move into a drawer. */
export function SiteHeader() {
  const path = usePathname();
  const [menu, setMenu] = useState<Menu>(null);
  const [drawer, setDrawer] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close menus on navigation: reset during render when the path changes.
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) { setSeenPath(path); setMenu(null); setDrawer(false); }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setDrawer(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { document.body.style.overflow = drawer ? "hidden" : ""; }, [drawer]);

  const open = (m: Menu) => { if (closeTimer.current) clearTimeout(closeTimer.current); setMenu(m); };
  const closeSoon = () => { closeTimer.current = setTimeout(() => setMenu(null), 120); };
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);

  const trigger = (m: Exclude<Menu, null>, label: string, href: string) => (
    <div className="relative" onMouseEnter={() => open(m)} onMouseLeave={closeSoon}>
      <button type="button" aria-expanded={menu === m} aria-controls={`menu-${m}`} onClick={() => setMenu(menu === m ? null : m)}
        className={`inline-flex h-10 items-center gap-1 rounded-md px-3 text-[15px] hover:text-ink ${path.startsWith(href) ? "text-ink" : "text-ink-2"}`}>
        {label}
        <svg viewBox="0 0 12 12" className={`size-3 transition-transform ${menu === m ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 4.5 3 3 3-3" /></svg>
      </button>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-rule bg-white/95 backdrop-blur" onMouseLeave={closeSoon}>
        <div className="wrap flex h-[68px] items-center gap-6">
          <Link href="/" aria-label={`${site.name} home`} className="shrink-0"><Mark descriptor /></Link>

          <nav aria-label="Primary" className="ml-4 hidden items-center lg:flex">
            {trigger("coverage", "Coverage", "/coverage")}
            {trigger("industries", "Industries", "/industries")}
            {PLAIN_LINKS.map(l => (
              <Link key={l.href} href={l.href} aria-current={current(l.href)}
                className="inline-flex h-10 items-center rounded-md px-3 text-[15px] text-ink-2 hover:text-ink aria-[current=page]:text-ink">{l.label}</Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <Link href="/contact" className="btn btn-ghost">Contact</Link>
            <Link href="/contact#review" className="btn btn-primary">Request a programme review</Link>
          </div>

          <button type="button" className="ml-auto grid size-10 place-items-center rounded-md lg:hidden" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 6h14M3 10h14M3 14h14" /></svg>
          </button>
        </div>

        {/* Desktop panels */}
        <div id="menu-coverage" hidden={menu !== "coverage"} onMouseEnter={() => open("coverage")} onMouseLeave={closeSoon}
          className="absolute inset-x-0 top-full hidden border-b border-rule bg-surface lg:block">
          <div className="wrap grid grid-cols-5 gap-8 py-10">
            {COVERAGE_MENU.map(g => (
              <div key={g.family} className="min-w-0">
                <p className="eyebrow mb-4">{g.family}</p>
                <ul className="grid gap-2.5">
                  {g.lines.map(l => <li key={l.href}><Link href={l.href} className="text-[15px] text-ink hover:text-umber">{l.label}</Link></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-rule">
            <div className="wrap flex h-12 items-center">
              <Link href="/coverage" className="text-[14px] text-ultra">All coverage</Link>
            </div>
          </div>
        </div>
        <div id="menu-industries" hidden={menu !== "industries"} onMouseEnter={() => open("industries")} onMouseLeave={closeSoon}
          className="absolute inset-x-0 top-full hidden border-b border-rule bg-surface lg:block">
          <div className="wrap grid grid-cols-3 gap-x-8 gap-y-3 py-10">
            {INDUSTRY_MENU.map(l => <Link key={l.href} href={l.href} className="display text-[24px] text-ink hover:text-umber">{l.label}</Link>)}
          </div>
        </div>
      </header>

      {/* Mobile and tablet drawer */}
      <div className="backdrop lg:hidden" data-open={drawer} aria-hidden onClick={() => setDrawer(false)} />
      <aside className="sheet inset-y-0 right-0 flex w-[min(92vw,400px)] flex-col overflow-y-auto bg-surface lg:hidden" data-open={drawer} aria-label="Menu" aria-hidden={!drawer} inert={!drawer}>
        <div className="flex h-[68px] items-center justify-between border-b border-rule px-5">
          <Mark />
          <button type="button" className="grid size-10 place-items-center rounded-md" aria-label="Close menu" onClick={() => setDrawer(false)}>
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <nav aria-label="Mobile" className="flex-1 px-5 py-4">
          <details className="border-b border-rule py-3" open>
            <summary className="cursor-pointer list-none text-[17px] font-medium">Coverage</summary>
            {COVERAGE_MENU.map(g => (
              <div key={g.family} className="mt-4">
                <p className="eyebrow mb-2">{g.family}</p>
                {g.lines.map(l => <Link key={l.href} href={l.href} className="block py-1.5 text-[15px] text-ink-2">{l.label}</Link>)}
              </div>
            ))}
          </details>
          <details className="border-b border-rule py-3">
            <summary className="cursor-pointer list-none text-[17px] font-medium">Industries</summary>
            <div className="mt-2">{INDUSTRY_MENU.map(l => <Link key={l.href} href={l.href} className="block py-1.5 text-[15px] text-ink-2">{l.label}</Link>)}</div>
          </details>
          {[...PLAIN_LINKS, { href: "/contact", label: "Contact" }].map(l => (
            <Link key={l.href} href={l.href} className="block border-b border-rule py-3 text-[17px] font-medium">{l.label}</Link>
          ))}
        </nav>
        <div className="p-5"><Link href="/contact#review" className="btn btn-primary w-full">Request a programme review</Link></div>
      </aside>
    </>
  );
}
