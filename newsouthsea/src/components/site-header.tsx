"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { site } from "@/site";

type Menu = "ind" | "cov" | null;

/** harvey.ai navbar in hedgespecialty.com's order: How it works · Industries ▾ · Appetite · Company · Coverage ▾ · Contact us.
 *  Transparent over the home hero until 48px of scroll, then solid with a hairline. Panels open on hover or click. */
export function SiteHeader() {
  const path = usePathname();
  const [menu, setMenu] = useState<Menu>(null);
  const [drawer, setDrawer] = useState(false);
  const [over, setOver] = useState(path === "/");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [seen, setSeen] = useState(path);
  if (seen !== path) { setSeen(path); setMenu(null); setDrawer(false); }

  useEffect(() => {
    const onScroll = () => setOver(path === "/" && window.scrollY < 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setDrawer(false); } };
    const onClick = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".hdr")) setMenu(null); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [path]);

  useEffect(() => { document.body.style.overflow = drawer ? "hidden" : ""; }, [drawer]);

  const open = (m: Menu) => { if (timer.current) clearTimeout(timer.current); setMenu(m); };
  const closeSoon = () => { timer.current = setTimeout(() => setMenu(null), 140); };
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);
  const chevron = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m3 4.5 3 3 3-3" /></svg>;
  const trigger = (m: Exclude<Menu, null>, label: string) => (
    <div onMouseEnter={() => open(m)} onMouseLeave={closeSoon}>
      <button type="button" aria-expanded={menu === m} aria-controls={`panel-${m}`} onClick={e => { e.stopPropagation(); open(m); }}>{label} {chevron}</button>
    </div>
  );
  const families = [...new Set(LINES.map(l => l.family))];

  return (
    <>
      <header className={`hdr ${over ? "over" : ""}`} onMouseLeave={closeSoon}>
        <div className="wrap bar">
          <button type="button" className="burger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M3 6h14M3 10h14M3 14h14" /></svg>
          </button>
          <Link href="/" className="mark" aria-label={`${site.name} home`}>NSS<small>{site.name}</small></Link>
          <nav className="nav" aria-label="Primary">
            <Link href="/how-we-work" aria-current={current("/how-we-work")}>How it works</Link>
            {trigger("ind", "Industries")}
            <Link href="/appetite" aria-current={current("/appetite")}>Appetite</Link>
            <Link href="/about" aria-current={current("/about")}>Company</Link>
            {trigger("cov", "Coverage")}
          </nav>
          <div className="right"><Link href="/contact" className="btn sm">Contact us</Link></div>
        </div>

        <div className="panel cov" id="panel-cov" hidden={menu !== "cov"} onMouseEnter={() => open("cov")} onMouseLeave={closeSoon}>
          <div className="wrap">
            {families.map(f => (
              <div key={f} className="grp">
                <span className="mono">{f}</span>
                {LINES.filter(l => l.family === f).map(l => (
                  <Link key={l.slug} className="pi" href={`/coverage/${l.slug}`}><span className="t">{l.name}</span><span className="d">{l.summary}</span></Link>
                ))}
                {f === families[families.length - 1] && <Link className="pi" href="/coverage"><span className="t">All coverage →</span><span className="d">Ten lines, four families. What each policy may cover and the file we build.</span></Link>}
              </div>
            ))}
            <Link className="feat" href="/contact">
              <Image src="/images/boardroom.jpg" alt="" width={600} height={375} />
              <span className="pi"><span className="t">Programme review <span className="new">120 days out</span></span><span className="d">Send the renewal file. First read on appetite and structure within [x] working days.</span></span>
            </Link>
          </div>
        </div>

        <div className="panel ind" id="panel-ind" hidden={menu !== "ind"} onMouseEnter={() => open("ind")} onMouseLeave={closeSoon}>
          <div className="wrap">
            <div className="grp"><span className="mono">Sectors</span>
              {INDUSTRIES.slice(0, 3).map(i => <Link key={i.slug} className="pi" href={`/industries/${i.slug}`}><span className="t">{i.name}</span><span className="d">{i.summary}</span></Link>)}
            </div>
            <div className="grp"><span className="mono">&nbsp;</span>
              {INDUSTRIES.slice(3).map(i => <Link key={i.slug} className="pi" href={`/industries/${i.slug}`}><span className="t">{i.name}</span><span className="d">{i.summary}</span></Link>)}
              <Link className="pi" href="/industries"><span className="t">All industries →</span><span className="d">Six sectors, named risks, the lines that make up each programme.</span></Link>
            </div>
            <Link className="feat" href="/industries">
              <Image src="/images/port.jpg" alt="" width={600} height={375} />
              <span className="pi"><span className="t">Named risks per sector</span><span className="d">The exposure, what it costs when it happens, and the cover that answers it.</span></span>
            </Link>
          </div>
        </div>
      </header>

      <div className="drawer" hidden={!drawer}>
        <div className="top"><Link href="/" className="mark">NSS</Link><button type="button" className="burger" aria-label="Close menu" onClick={() => setDrawer(false)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg></button></div>
        <div className="grp plain"><ul>
          <li><Link href="/how-we-work">How it works</Link></li><li><Link href="/industries">Industries</Link></li><li><Link href="/appetite">Appetite</Link></li><li><Link href="/about">Company</Link></li><li><Link href="/coverage">Coverage</Link></li><li><Link href="/contact">Contact</Link></li>
        </ul></div>
        <div className="grp"><span className="mono">Coverage</span><ul>{LINES.map(l => <li key={l.slug}><Link href={`/coverage/${l.slug}`}>{l.name}</Link></li>)}</ul></div>
        <div className="grp"><span className="mono">Industries</span><ul>{INDUSTRIES.map(i => <li key={i.slug}><Link href={`/industries/${i.slug}`}>{i.name}</Link></li>)}</ul></div>
        <Link href="/contact" className="btn">Contact us</Link>
      </div>
    </>
  );
}
